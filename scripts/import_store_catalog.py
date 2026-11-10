#!/usr/bin/env python3
"""Import a store catalog snapshot and propose conservative generic matches."""

from __future__ import annotations

import argparse
import json
import mmap
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unicodedata

ROOT = Path(__file__).resolve().parents[1]

# Destination columns correspond, in order, to source columns. No customer,
# order, staff, payment or other non-catalog tables are extracted.
TABLES = {
    "brands": (["id", "slug", "name", "deleted_at"], ["id", "slug", "name", "deleted_at"], ["id"]),
    "categories": (["id", "slug", "name", "parent_id", "deleted_at"], ["id", "slug", "name", "parent_id", "deleted_at"], ["id"]),
    "products": (["id", "slug", "name", "unit_label", "price", "brand_id", "show_in_ecommerce", "deleted_at", "updated_at"], ["id", "slug", "name", "unit_label", "price_clp", "brand_id", "visible_in_store", "deleted_at", "source_updated_at"], ["id"]),
    "product_variants": (["id", "product_id", "sku", "name", "attributes", "price", "deleted_at"], ["id", "product_id", "sku", "name", "attributes", "price_clp", "deleted_at"], ["id"]),
    "product_categories": (["product_id", "category_id", "deleted_at"], ["product_id", "category_id", "deleted_at"], ["product_id", "category_id"]),
    "images": (["id", "url", "alt_text", "deleted_at"], ["id", "url", "alt_text", "deleted_at"], ["id"]),
    "product_images": (["id", "product_id", "image_id", "position", "deleted_at"], ["id", "product_id", "image_id", "position", "deleted_at"], ["id"]),
}

COPY_HEADER = re.compile(rb"COPY public\.([a-z_]+) \(([^\n]+)\) FROM stdin;\r?$")
ESCAPES = {"b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t", "v": "\v", "\\": "\\"}

# Parser classification tokens are part of existing canonical identities. They
# remain stable even though the catalog now represents types as attributes.
# These values match migration 005; edited/deleted assignments are validated
# against the target database instead of being silently recreated by an import.
TYPE_ATTRIBUTES = {
    "cuadernos": ("tipo_cuaderno", {
        "cuadriculados": "Cuadriculado", "rayados": "Rayado", "composicion": "Composición",
        "caligrafia": "Caligrafía", "croquis": "Croquis", "lisos": "Liso",
    }),
    "escritura": ("tipo_escritura", {"grafito": "Grafito"}),
    "arte-y-dibujo": ("tipo_arte", {
        "lapices-colores": "Lápices de colores", "croqueras": "Croquera", "blocks": "Block",
    }),
    "geometria": ("tipo_geometria", {"reglas": "Regla"}),
    "pegado-y-corte": ("tipo_pegado_corte", {"pegamentos": "Pegamento"}),
}


def decode_copy(value: bytes) -> str:
    """Decode common PostgreSQL COPY text escapes without damaging UTF-8."""
    text = value.decode("utf-8")
    return re.sub(r"\\([bfnrtv\\])", lambda m: ESCAPES[m.group(1)], text)


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).upper()


def notebook_suggestion(name: str) -> dict[str, str | int | None] | None:
    """Only suggest a match when format, sheet count and ruling are explicit.

    All matches are stored pending administrator review. Ambiguous or partial
    names are intentionally skipped rather than assigning invented attributes.
    """
    text = normalize(name).strip()
    if not re.match(r"^CUAD(?:ERNO)?\.?(?:\s|$)", text):
        return None
    # These terms can describe meaningful extra specifications or multiple
    # products. Leave them for review until they can be represented reliably.
    if re.search(r"\b(?:SET|KIT|PACK|MULTI\s*\d+)\b|\b\d+\s*MATERIAS?\b|\b\d{2,3}\s*(?:GRAMOS|GRS|GR|G)(?![A-Z])|\bD\s*/\s*F\b|\bDOBLE\s+FAZ\b|\+", text):
        return None
    formats = {
        "universitario": ("universitario", r"\bUNIV(?:ERSITARIO)?\b"),
        "college": ("college", r"\bCOLLEGE\b"),
        "medio-oficio": ("medio oficio", r"(?<!\d)1\s*/\s*2\s*OF(?:ICIO)?\b"),
        "carta": ("carta", r"\bCARTA\b"),
        "a4": ("A4", r"\bA4\b"),
        "a5": ("A5", r"\bA5\b"),
    }
    found_formats = [(key, label) for key, (label, pattern) in formats.items() if re.search(pattern, text)]
    sheets = {int(n) for n in re.findall(r"(?<!\d)(\d{1,3})\s*(?:HOJAS|H)\b", text)}
    spacings = {int(n) for n in re.findall(r"(?<![\d.,])(\d{1,2})\s*MM\b", text)}
    rulings: list[tuple[str, str]] = []
    if spacings or re.search(r"\bCUADRICULAD[OA]S?\b", text):
        rulings.append(("cuadriculados", "cuadriculado"))
    if re.search(r"\b(?:RAYAD[OA]S?|LINEAD[OA]S?|LINEAS?)\b", text):
        rulings.append(("rayados", "rayado"))
    if re.search(r"\b(?:COMPOSICION|COMP\.)", text):
        rulings.append(("composicion", "de composición"))
    if re.search(r"\bCALIGRAFIA\b", text):
        rulings.append(("caligrafia", "de caligrafía"))
    if re.search(r"\bCROQUI(?:S)?\b", text):
        rulings.append(("croquis", "de croquis"))
    if re.search(r"\bLIS[OA]S?\b", text):
        rulings.append(("lisos", "liso"))
    if len(found_formats) != 1 or len(sheets) != 1 or len(rulings) != 1 or len(spacings) > 1:
        return None
    sheet_count = next(iter(sheets))
    spacing = next(iter(spacings)) if spacings else None
    if not 1 <= sheet_count <= 500 or (spacing is not None and not 3 <= spacing <= 15):
        return None
    if rulings[0][0] == "cuadriculados" and spacing is None:
        return None
    orientations = {x.lower() for x in re.findall(r"\b(HORIZONTAL|VERTICAL)\b", text)}
    if len(orientations) > 1:
        return None
    orientation = next(iter(orientations)) if orientations else None
    if orientation and rulings[0][0] != "caligrafia":
        return None
    format_key, format_label = found_formats[0]
    subtype, subtype_label = rulings[0]
    descriptors = ["Cuaderno", format_label, subtype_label]
    if orientation:
        descriptors.append(orientation)
    if spacing is not None:
        descriptors.append(f"{spacing} mm")
    display_name = " ".join(descriptors) + f", {sheet_count} hojas"
    key = f"cuaderno:{format_key}:{subtype}:{orientation or '-'}:{spacing or '-'}:{sheet_count}"
    return {"key": key, "name": display_name, "subcategory": subtype, "format": format_label,
            "sheets": sheet_count, "spacing": spacing, "orientation": orientation}


def color_pencil_suggestion(name: str) -> dict | None:
    """Recognize only ordinary color-pencil products with an explicit count."""
    text = normalize(name).strip()
    match = re.match(r"^LAPIZ(?:ES)?\s+(?:DE\s+)?COLO(?:R|RES)\s+(\d{1,3})\s*COL(?:ORES)?\b", text)
    if not match or re.search(
        r"\+|\b(?:SET|KIT|PACK|GRAFITO|GOMA|SACAPUNTAS?|PIEL|NEON|FLUOR|METAL\w*|"
        r"PASTEL|ACUAREL\w*|ACQUARELL\w*|AQUAREL\w*|JUMBO|CORTO\w*|TRIANG\w*|BICOLOR|"
        r"LATA|SUPERSOFT|MEGA|MAXI|HEXAGON\w*|WOODY|NEGRO)\b|\b\d+[.,]\d+\b",
        text,
    ):
        return None
    count = int(match.group(1))
    if not 2 <= count <= 100:
        return None
    return {
        "key": "manual:lapices-colores-12" if count == 12 else f"lapices-colores:{count}",
        "name": f"Lápices de colores, {count} colores",
        "category": "arte-y-dibujo", "subcategory": "lapices-colores",
        "attributes": {"numero_colores": count}, "method": "explicit_color_count",
    }


def graphite_pencil_suggestion(name: str) -> dict | None:
    """Require an explicit lead grade and avoid mixed sets or known packs."""
    text = normalize(name).strip()
    if not re.match(r"^LAPIZ(?:ES)?\s+(?:DE\s+)?GRAFITO\b", text):
        return None
    if re.search(r"\+|\b(?:SET|KIT|PACK|CAJA|JUMBO|TRIANG\w*|HEXAGON\w*)\b|\bX\s*\d+\b|\(\d+\)|\b\d+\s*(?:UN|UNIDADES)\b", text):
        return None
    grades = set(re.findall(r"(?<![A-Z0-9])(HB|[1-9]B|[1-9]H)(?![A-Z0-9])", text))
    if len(grades) != 1:
        return None
    grade = next(iter(grades))
    with_eraser = bool(re.search(r"\b(?:C\s*/\s*GOMA|CON\s+GOMA)\b", text))
    without_eraser = bool(re.search(r"\b(?:S\s*/\s*GOMA|SIN\s+GOMA)\b", text))
    if with_eraser and without_eraser:
        return None
    attributes: dict[str, str | bool] = {"dureza_grafito": grade}
    suffix = ""
    eraser_key = "no-especificada"
    if with_eraser or without_eraser:
        attributes["incluye_goma"] = with_eraser
        suffix = ", con goma" if with_eraser else ", sin goma"
        eraser_key = "con-goma" if with_eraser else "sin-goma"
    return {
        "key": f"lapiz-grafito:{grade.lower()}:{eraser_key}",
        "name": f"Lápiz grafito {grade}{suffix}",
        "category": "escritura", "subcategory": "grafito", "attributes": attributes,
        "method": "explicit_graphite_grade",
    }


def sketchbook_suggestion(name: str) -> dict | None:
    """Keep format, sheet count and explicit dimensions distinct."""
    text = normalize(name).strip()
    if not re.match(r"^CROQUERA\b", text):
        return None
    # Paper type, grammage, and multipacks may be meaningful. Do not collapse
    # them into an ordinary sketchbook until their meaning is reviewed.
    if re.search(r"\+|\b(?:SET|KIT|PACK|MANGA|COMIC|MARKER|LETTERING|MULTITECHNIQUE|DESSIN|KRAFT|MANTEQUILLA|ACUAREL\w*|AQUARELL\w*)\b|\b\d{2,3}\s*(?:GRAMOS|GRS|GR|G)(?![A-Z])|\bD\s*/\s*F\b|\bDOBLE\s+FAZ\b", text):
        return None
    # Bare dimensions follow the store's existing centimetre convention.
    # Explicit other units must never be relabeled as cm or dropped entirely,
    # including when the unit occurs between the two dimensions.
    if re.search(
        r"(?<![A-Z])(?:MMS?|MILIMETROS?|M|MTS?|MTRS?|METROS?|METERS?|METRES?|PULG(?:S|ADAS?)?|"
        r"IN(?:CH(?:ES)?)?|FT|FOOT|FEET|PIES?)(?=$|[^A-Z]|X\s*\d)|\d\s*[\"'′″]",
        text,
    ):
        return None
    half = re.search(r"(?<!\d)1\s*/\s*2\s*OF(?:ICIO)?\b", text)
    remaining = re.sub(r"(?<!\d)1\s*/\s*2\s*OF(?:ICIO)?\b", " ", text)
    formats = [("medio-oficio", "medio oficio")] if half else []
    for key, label, pattern in (
        ("oficio", "oficio", r"\bOF(?:ICIO)?\b"), ("carta", "carta", r"\bCARTA\b"),
        ("a3", "A3", r"\bA3\b"), ("a4", "A4", r"\bA4\b"), ("a5", "A5", r"\bA5\b"),
    ):
        if re.search(pattern, remaining):
            formats.append((key, label))
    sheets = {int(n) for n in re.findall(r"(?<!\d)(\d{1,3})\s*(?:HOJAS|HJS|H)\b", text)}
    dimensions = re.findall(
        r"(?<![\d.,])(\d{1,3}(?:[.,]\d+)?)\s*(?:CMS?|CENTIMETROS?)?\s*"
        r"[X×]\s*(\d{1,3}(?:[.,]\d+)?)(?![\d.,])", text,
    )
    if len(formats) != 1 or len(sheets) != 1 or len(dimensions) > 1:
        return None
    count = next(iter(sheets))
    if not 1 <= count <= 500:
        return None
    attributes: dict[str, object] = {"formato": formats[0][1], "numero_hojas": count}
    dimension_key = "sin-medidas"
    suffix = ""
    if dimensions:
        values = sorted(float(part.replace(",", ".")) for part in dimensions[0])
        if not all(5 <= part <= 150 for part in values):
            return None
        attributes["dimension_menor_cm"], attributes["dimension_mayor_cm"] = values
        dimension_key = "x".join(format(part, "g") for part in values)
        suffix = ", " + " × ".join(format(part, "g").replace(".", ",") for part in values) + " cm"
    return {
        "key": f"croquera:{formats[0][0]}:{count}:{dimension_key}",
        "name": f"Croquera {formats[0][1]}, {count} hojas{suffix}",
        "category": "arte-y-dibujo", "subcategory": "croqueras", "attributes": attributes,
        "method": "explicit_sketchbook_attributes",
    }


def drawing_block_suggestion(name: str) -> dict | None:
    text = normalize(name).replace("MAS+ARTE", "MASARTE").strip()
    match = re.match(r"^BLOCK(?:\s+DE)?\s+DIBUJO\s+(MED(?:IO)?|LICEO)\b", text)
    if not match or re.search(r"\+|\b(?:SET|KIT|PACK)\b|\bD\s*/\s*F\b", text):
        return None
    sheets = {int(n) for n in re.findall(r"(?<!\d)(\d{1,3})\s*(?:HOJAS|HJS|H)\b", text)}
    fractions = {a + "/" + b for a, b in re.findall(r"(?<!\d)(1)\s*/\s*(4|8)(?!\d)", text)}
    if len(sheets) != 1 or len(fractions) > 1:
        return None
    count = next(iter(sheets))
    if not 1 <= count <= 500:
        return None
    kind = "liceo" if match.group(1) == "LICEO" else "medio"
    number_match = re.match(r"\.?\s*(\d{1,3})(?!\s*(?:H|/))\b", text[match.end():])
    number = int(number_match.group(1)) if number_match else None
    if number is not None and not 1 <= number <= 999:
        return None
    fraction = next(iter(fractions)) if fractions else None
    attrs: dict[str, object] = {"tipo_block": kind, "numero_hojas": count}
    name_parts = [f"Block de dibujo {kind}"]
    key_parts = ["block", kind, str(number or "-"), fraction or "-", str(count)]
    if number:
        attrs["numero_block"] = number
        name_parts.append(f"Nº {number}")
    if fraction:
        attrs["fraccion_block"] = fraction
        name_parts.append(fraction)
    return {
        "key": ":".join(key_parts), "name": " ".join(name_parts) + f", {count} hojas",
        "category": "arte-y-dibujo", "subcategory": "blocks", "attributes": attrs,
        "method": "explicit_drawing_block_attributes",
    }


def ruler_suggestion(name: str) -> dict | None:
    text = normalize(name).strip()
    if not re.match(r"^REGLA\b", text) or re.search(
        r"\+|^REGLA\s+T\b|\b(?:SET|KIT|PACK|METAL\w*|ALUMINIO|ACERO|MADERA|FLEXIBLE|PLEGABLE|ROLLER|QUILTING)\b|"
        r"\bX\s*\d+\s*(?:UN|UND|UNIDADES)\b|\bC\s*/\s*MANGO\b|(?<!\d)\d+\s*X\s*\d+\s*CM\b", text
    ):
        return None
    lengths = {int(n) for n in re.findall(r"(?<![\d.,])(\d{1,3})\s*(?:CM|CMS|CENTIMETROS)\b", text)}
    if len(lengths) != 1:
        return None
    length = next(iter(lengths))
    if not 5 <= length <= 100:
        return None
    return {
        "key": "manual:regla-30-cm" if length == 30 else f"regla:{length}-cm",
        "name": f"Regla, {length} cm", "category": "geometria", "subcategory": "reglas",
        "attributes": {"largo_cm": length}, "method": "explicit_ruler_length",
    }


def glue_stick_suggestion(name: str) -> dict | None:
    text = normalize(name).strip()
    if not re.match(r"^(?:PEGAMENTO|PEGA)\s+(?:EN\s+)?BARRA\b", text):
        return None
    if re.search(r"\+|\b(?:SET|KIT|PACK)\b|\bX\s*\d+\b", text):
        return None
    # Read the complete numeric specification before deciding whether it is
    # supported. Otherwise e.g. 8grs, 8.5g or 0.5oz become an unweighted item.
    measurement_pattern = r"(?<![\w.,/])([+-]?\d+(?:[.,]\d+)?)\s*([A-Z]+)\b"
    measurements = re.findall(measurement_pattern, text)
    if any(not amount.isdecimal() or unit not in {"G", "GR", "GRS", "GRAMO", "GRAMOS"}
           for amount, unit in measurements):
        return None
    if re.search(r"\d", re.sub(measurement_pattern, "", text)):
        return None  # Leave unparsed numeric specifications for review too.
    weights = {int(amount) for amount, _ in measurements}
    if len(weights) > 1:
        return None
    weight = next(iter(weights)) if weights else None
    if weight is not None and not 1 <= weight <= 250:
        return None
    return {
        "key": "manual:pegamento-barra" if weight is None else f"pegamento-barra:{weight}-g",
        "name": "Pegamento en barra" if weight is None else f"Pegamento en barra, {weight} g",
        "category": "pegado-y-corte", "subcategory": "pegamentos",
        "attributes": {} if weight is None else {"peso_g": weight}, "method": "explicit_glue_stick",
    }


def product_suggestion(name: str) -> dict | None:
    notebook = notebook_suggestion(name)
    if notebook is not None:
        attributes = {"formato": notebook["format"], "numero_hojas": notebook["sheets"]}
        if notebook["spacing"] is not None:
            attributes["cuadricula_mm"] = notebook["spacing"]
        if notebook["orientation"] is not None:
            attributes["orientacion"] = notebook["orientation"]
        suggestion = {
            "key": notebook["key"], "name": notebook["name"], "category": "cuadernos",
            "subcategory": notebook["subcategory"], "attributes": attributes,
            "method": "explicit_notebook_attributes",
        }
    else:
        suggestion = (color_pencil_suggestion(name) or graphite_pencil_suggestion(name)
                      or sketchbook_suggestion(name) or drawing_block_suggestion(name)
                      or ruler_suggestion(name) or glue_stick_suggestion(name))
    if suggestion is None:
        return None
    type_key, types = TYPE_ATTRIBUTES[suggestion["category"]]
    type_value = types[suggestion.pop("subcategory")]
    suggestion["attributes"] = {type_key: type_value, **suggestion["attributes"]}
    return suggestion


def copy_text(value: object) -> str:
    """Encode a generated value for PostgreSQL COPY text format."""
    return str(value).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def extract_sections(dump_path: Path, temp_dir: Path) -> dict[str, int]:
    found: dict[str, int] = {}
    with dump_path.open("rb") as source, mmap.mmap(source.fileno(), 0, access=mmap.ACCESS_READ) as data:
        cursor = 0
        while len(found) < len(TABLES):
            marker = data.find(b"COPY public.", cursor)
            if marker < 0:
                break
            if marker and data[marker - 1] != 10:
                cursor = marker + 1
                continue
            header_start = marker
            header_end = data.find(b"\n", header_start)
            if header_end < 0:
                raise ValueError("Truncated COPY header")
            header = data[header_start:header_end]
            match = COPY_HEADER.fullmatch(header)
            cursor = header_end + 1
            if not match:
                continue
            table = match.group(1).decode("ascii")
            if table not in TABLES:
                continue
            if table in found:
                raise ValueError(f"Repeated COPY section: {table}")
            columns = [part.strip().strip(b'"').decode("ascii") for part in match.group(2).split(b",")]
            source_columns, _, _ = TABLES[table]
            try:
                indexes = [columns.index(column) for column in source_columns]
            except ValueError as error:
                raise ValueError(f"Unexpected COPY columns for {table}") from error
            count = 0
            with (temp_dir / f"{table}.tsv").open("wb") as destination:
                while True:
                    end = data.find(b"\n", cursor)
                    if end < 0:
                        raise ValueError(f"Truncated COPY section: {table}")
                    row = data[cursor:end].rstrip(b"\r")
                    cursor = end + 1
                    if row == b"\\.":
                        break
                    fields = row.split(b"\t")
                    if len(fields) != len(columns):
                        raise ValueError(f"Unexpected field count in {table}, row {count + 1}")
                    destination.write(b"\t".join(fields[index] for index in indexes) + b"\n")
                    count += 1
            found[table] = count
    missing = set(TABLES) - set(found)
    if missing:
        raise ValueError("Missing COPY sections: " + ", ".join(sorted(missing)))
    return found


def build_suggestions(products_path: Path, destination: Path) -> tuple[int, int, dict[str, int]]:
    keys: set[str] = set()
    matches = 0
    methods: dict[str, int] = {}
    with products_path.open("rb") as source, destination.open("w", encoding="utf-8", newline="") as output:
        for raw in source:
            values = raw.rstrip(b"\n").split(b"\t")
            if len(values) != 9:
                raise ValueError("Unexpected extracted product row")
            if values[7] != b"\\N":
                continue
            suggestion = product_suggestion(decode_copy(values[2]))
            if suggestion is None:
                continue
            keys.add(str(suggestion["key"]))
            values_out = [
                suggestion["key"], suggestion["name"], suggestion["category"],
                json.dumps(suggestion["attributes"], ensure_ascii=False, sort_keys=True),
                suggestion["method"], values[0].decode("ascii"),
            ]
            output.write("\t".join(copy_text(value) for value in values_out) + "\n")
            method = suggestion["method"]
            methods[method] = methods.get(method, 0) + 1
            matches += 1
    return len(keys), matches, methods


def sql_script(temp_dir: Path, single_user: bool = False) -> str:
    lines = ([] if single_user else ["\\set ON_ERROR_STOP on"]) + ["BEGIN;", """DO $$ BEGIN
        IF to_regclass('catalog.category_attributes') IS NULL
           OR to_regclass('catalog.category_type_attributes') IS NULL THEN
            RAISE EXCEPTION 'Apply migration 005 (category attributes) before importing the store catalog';
        END IF;
        END $$;"""]

    def copy_from(table: str, columns: str, path: Path) -> str:
        if single_user:
            return f"COPY {table} {columns} FROM '{path}' WITH (FORMAT text);"
        return f"\\copy {table} {columns} FROM '{path}' WITH (FORMAT text)"

    for table, (_, destination_columns, conflict_columns) in TABLES.items():
        columns = ", ".join('"' + column + '"' for column in destination_columns)
        conflict = ", ".join('"' + column + '"' for column in conflict_columns)
        lines.append(f"CREATE TEMP TABLE stage_{table} AS SELECT {columns} FROM store_snapshot.{table} WITH NO DATA;")
        lines.append(copy_from(f"stage_{table}", f"({columns})", temp_dir / (table + ".tsv")))
        lines.append(f"INSERT INTO store_snapshot.{table} ({columns}) SELECT {columns} FROM stage_{table} ON CONFLICT ({conflict}) DO NOTHING;")
    lines.extend([
        "CREATE TEMP TABLE stage_candidates (key text, name text, category text, attributes jsonb, method text, product_id uuid);",
        copy_from("stage_candidates", "", temp_dir / "candidates.tsv"),
        """DO $$ BEGIN
           IF EXISTS (SELECT 1 FROM stage_candidates n
               LEFT JOIN catalog.categories c ON c.slug = n.category
               LEFT JOIN catalog.category_type_attributes t ON t.category_id = c.id
               LEFT JOIN catalog.attribute_definitions a ON a.id = t.attribute_id
               WHERE c.id IS NULL OR a.id IS NULL OR NOT n.attributes ? a.key) THEN
               RAISE EXCEPTION 'A proposed catalog category or type assignment is missing';
           END IF;
           IF EXISTS (SELECT 1 FROM stage_candidates n CROSS JOIN LATERAL jsonb_each(n.attributes) e
               JOIN catalog.categories c ON c.slug = n.category
               JOIN catalog.category_type_attributes t ON t.category_id = c.id
               JOIN catalog.attribute_definitions type_definition ON type_definition.id = t.attribute_id
               LEFT JOIN catalog.attribute_definitions a ON a.key = e.key
               LEFT JOIN catalog.category_attributes ca ON ca.category_id = c.id AND ca.attribute_id = a.id
               WHERE a.id IS NULL OR ca.attribute_id IS NULL
                  OR jsonb_typeof(e.value) IS DISTINCT FROM CASE a.data_type WHEN 'text' THEN 'string' ELSE a.data_type END
                  OR (a.data_type = 'text' AND (btrim(e.value #>> '{}') = '' OR
                      (cardinality(ca.options) > 0 AND NOT (e.value #>> '{}') = ANY(ca.options))))
                  OR (a.data_type = 'number' AND CASE WHEN jsonb_typeof(e.value) = 'number'
                      THEN (e.value #>> '{}')::numeric <= 0 OR (e.value #>> '{}')::numeric > 1000000 ELSE true END)
                  OR (cardinality(ca.applies_to_types) > 0 AND
                      NOT (n.attributes->>type_definition.key) = ANY(ca.applies_to_types))) THEN
               RAISE EXCEPTION 'A proposed catalog attribute is missing, invalid or not applicable to its type';
           END IF;
           IF EXISTS (SELECT 1 FROM stage_candidates n JOIN catalog.items i ON i.canonical_key = n.key
               JOIN catalog.categories c ON c.id = i.category_id
               LEFT JOIN catalog.category_type_attributes t ON t.category_id = i.category_id
               LEFT JOIN catalog.attribute_definitions a ON a.id = t.attribute_id
               LEFT JOIN catalog.item_attributes type_value ON type_value.item_id = i.id AND type_value.attribute_id = t.attribute_id
               WHERE c.slug <> n.category OR a.key IS NULL
                  OR type_value.text_value IS DISTINCT FROM n.attributes->>a.key) THEN
               RAISE EXCEPTION 'An existing catalog key has a different or unclassified catalog type; review it before importing';
           END IF;
           END $$;""",
        """INSERT INTO catalog.items (category_id, name, canonical_key, review_status)
           SELECT DISTINCT c.id, n.name, n.key, 'pending'
           FROM stage_candidates n JOIN catalog.categories c ON c.slug = n.category
           ON CONFLICT (canonical_key) DO NOTHING;""",
        """INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, text_value, number_value, boolean_value)
           SELECT DISTINCT i.id, a.id, a.data_type,
               CASE WHEN a.data_type = 'text' THEN e.value #>> '{}' END,
               CASE WHEN a.data_type = 'number' THEN (e.value #>> '{}')::numeric END,
               CASE WHEN a.data_type = 'boolean' THEN (e.value #>> '{}')::boolean END
           FROM stage_candidates n JOIN catalog.items i ON i.canonical_key = n.key AND i.review_status <> 'rejected'
           CROSS JOIN LATERAL jsonb_each(n.attributes) e
           JOIN catalog.attribute_definitions a ON a.key = e.key
           ON CONFLICT (item_id, attribute_id) DO NOTHING;""",
        """INSERT INTO catalog.store_product_matches (item_id, source_product_id, review_status, match_method)
           SELECT DISTINCT i.id, n.product_id, 'pending', n.method
           FROM stage_candidates n JOIN catalog.items i ON i.canonical_key = n.key AND i.review_status <> 'rejected'
           ON CONFLICT (item_id, source_product_id) DO NOTHING;""",
        "COMMIT;",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump", nargs="?", type=Path, default=ROOT / "melqui.dump")
    parser.add_argument("--dry-run", action="store_true", help="inspect and count without connecting to PostgreSQL")
    parser.add_argument("--single-user", action="store_true", help="use the stopped local cluster in PostgreSQL single-user mode")
    parser.add_argument("--cluster-dir", type=Path, default=ROOT / ".local/postgres", help="cluster for single-user mode")
    parser.add_argument("--database", help="explicit PostgreSQL database for an online import")
    parser.add_argument("--host", help="PostgreSQL host or Unix socket directory")
    parser.add_argument("--port", type=int, help="PostgreSQL port")
    parser.add_argument("--user", help="PostgreSQL user; provide credentials using .pgpass, not a command argument")
    parser.add_argument("--pgpass", type=Path, help="use the single explicit target in this protected PostgreSQL password file")
    args = parser.parse_args()
    if args.single_user and any((args.database, args.host, args.port, args.user, args.pgpass)):
        parser.error("--single-user cannot be combined with online database connection options")
    if args.pgpass and any((args.database, args.host, args.port, args.user)):
        parser.error("--pgpass cannot be combined with separate connection options")
    if not args.dry_run and not args.single_user and not (args.database or args.pgpass):
        parser.error("specify --database or --pgpass for an online import, or use --single-user")
    with tempfile.TemporaryDirectory(prefix="lista-catalog-", dir="/tmp") as directory:
        temp_dir = Path(directory)
        counts = extract_sections(args.dump, temp_dir)
        item_count, match_count, methods = build_suggestions(temp_dir / "products.tsv", temp_dir / "candidates.tsv")
        print("Catalog-only source rows:", json.dumps(counts, ensure_ascii=False, sort_keys=True), flush=True)
        print(f"Suggestions: {item_count} generic identities, {match_count} product matches; new items and matches require review.", flush=True)
        print("Suggestion methods:", json.dumps(methods, ensure_ascii=False, sort_keys=True), flush=True)
        if not args.dry_run:
            sql_path = temp_dir / "import.sql"
            sql = sql_script(temp_dir, single_user=args.single_user)
            sql_path.write_text(sql, encoding="utf-8")
            if args.single_user:
                pg_bin = os.environ.get("LISTA_PG_BIN") or subprocess.run(["pg_config", "--bindir"], capture_output=True, text=True, check=True).stdout.strip()
                result = subprocess.run(
                    [str(Path(pg_bin) / "postgres"), "--single", "-D", str(args.cluster_dir), "-j", "lista_escolar"],
                    input=sql, capture_output=True, text=True,
                )
                output = result.stdout + result.stderr
                if result.returncode or re.search(r"\b(?:ERROR|FATAL|PANIC):", output):
                    raise RuntimeError("Single-user import failed: " + output[-4000:])
            else:
                if args.pgpass:
                    command = [sys.executable, str(ROOT / "scripts/psql_configured.py"), "--pgpass", str(args.pgpass), "--", "-q"]
                else:
                    command = ["psql", "-X", "-w", "-q", "-v", "ON_ERROR_STOP=1", "-d", args.database]
                    for flag, value in (("-h", args.host), ("-p", args.port), ("-U", args.user)):
                        if value is not None:
                            command.extend((flag, str(value)))
                subprocess.run(command + ["-f", str(sql_path)], check=True)
            print("Catalog snapshot and pending suggestions imported.", flush=True)


if __name__ == "__main__":
    main()

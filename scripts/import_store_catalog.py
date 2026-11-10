#!/usr/bin/env python3
"""Extract catalog-only COPY sections and suggest conservative notebook matches."""

from __future__ import annotations

import argparse
import json
import mmap
from pathlib import Path
import re
import subprocess
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


def build_suggestions(products_path: Path, destination: Path) -> tuple[int, int]:
    keys: set[str] = set()
    matches = 0
    with products_path.open("rb") as source, destination.open("w", encoding="utf-8", newline="") as output:
        for raw in source:
            values = raw.rstrip(b"\n").split(b"\t")
            if len(values) != 9:
                raise ValueError("Unexpected extracted product row")
            if values[7] != b"\\N":
                continue
            suggestion = notebook_suggestion(decode_copy(values[2]))
            if suggestion is None:
                continue
            keys.add(str(suggestion["key"]))
            values_out = [
                suggestion["key"], suggestion["name"], suggestion["subcategory"], suggestion["format"],
                suggestion["sheets"], suggestion["spacing"], suggestion["orientation"], values[0].decode("ascii"),
            ]
            output.write("\t".join("\\N" if value is None else str(value) for value in values_out) + "\n")
            matches += 1
    return len(keys), matches


def sql_script(temp_dir: Path, single_user: bool = False) -> str:
    lines = ([] if single_user else ["\\set ON_ERROR_STOP on"]) + ["BEGIN;"]

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
        "CREATE TEMP TABLE stage_notebooks (key text, name text, subcategory text, format text, sheets numeric, spacing numeric, orientation text, product_id uuid);",
        copy_from("stage_notebooks", "", temp_dir / "notebooks.tsv"),
        """INSERT INTO catalog.items (category_id, subcategory_id, name, canonical_key, review_status)
           SELECT DISTINCT c.id, s.id, n.name, n.key, 'pending'
           FROM stage_notebooks n JOIN catalog.categories c ON c.slug = 'cuadernos'
           JOIN catalog.subcategories s ON s.category_id = c.id AND s.slug = n.subcategory
           ON CONFLICT (canonical_key) DO NOTHING;""",
        """INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, text_value, number_value)
           SELECT DISTINCT i.id, a.id, a.data_type, n.format, NULL::numeric FROM stage_notebooks n
           JOIN catalog.items i ON i.canonical_key = n.key JOIN catalog.attribute_definitions a ON a.key = 'formato'
           ON CONFLICT (item_id, attribute_id) DO NOTHING;""",
        """INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, number_value)
           SELECT DISTINCT i.id, a.id, a.data_type, n.sheets FROM stage_notebooks n
           JOIN catalog.items i ON i.canonical_key = n.key JOIN catalog.attribute_definitions a ON a.key = 'numero_hojas'
           ON CONFLICT (item_id, attribute_id) DO NOTHING;""",
        """INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, number_value)
           SELECT DISTINCT i.id, a.id, a.data_type, n.spacing FROM stage_notebooks n
           JOIN catalog.items i ON i.canonical_key = n.key JOIN catalog.attribute_definitions a ON a.key = 'cuadricula_mm'
           WHERE n.spacing IS NOT NULL ON CONFLICT (item_id, attribute_id) DO NOTHING;""",
        """INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, text_value)
           SELECT DISTINCT i.id, a.id, a.data_type, n.orientation FROM stage_notebooks n
           JOIN catalog.items i ON i.canonical_key = n.key JOIN catalog.attribute_definitions a ON a.key = 'orientacion'
           WHERE n.orientation IS NOT NULL ON CONFLICT (item_id, attribute_id) DO NOTHING;""",
        """INSERT INTO catalog.store_product_matches (item_id, source_product_id, review_status, match_method)
           SELECT DISTINCT i.id, n.product_id, 'pending', 'explicit_notebook_attributes'
           FROM stage_notebooks n JOIN catalog.items i ON i.canonical_key = n.key
           ON CONFLICT (item_id, source_product_id) DO NOTHING;""",
        "COMMIT;",
    ])
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("dump", nargs="?", type=Path, default=ROOT / "melqui.dump")
    parser.add_argument("--dry-run", action="store_true", help="inspect and count without connecting to PostgreSQL")
    parser.add_argument("--single-user", action="store_true", help="use the stopped local cluster in PostgreSQL single-user mode")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="lista-catalog-", dir="/tmp") as directory:
        temp_dir = Path(directory)
        counts = extract_sections(args.dump, temp_dir)
        item_count, match_count = build_suggestions(temp_dir / "products.tsv", temp_dir / "notebooks.tsv")
        print("Catalog-only source rows:", json.dumps(counts, ensure_ascii=False, sort_keys=True), flush=True)
        print(f"Notebook suggestions: {item_count} generic items, {match_count} product matches; all pending review.", flush=True)
        if not args.dry_run:
            sql_path = temp_dir / "import.sql"
            sql = sql_script(temp_dir, single_user=args.single_user)
            sql_path.write_text(sql, encoding="utf-8")
            if args.single_user:
                pg_bin = subprocess.run(["pg_config", "--bindir"], capture_output=True, text=True, check=True).stdout.strip()
                result = subprocess.run(
                    [str(Path(pg_bin) / "postgres"), "--single", "-D", str(ROOT / ".local/postgres"), "-j", "lista_escolar"],
                    input=sql, capture_output=True, text=True,
                )
                output = result.stdout + result.stderr
                if result.returncode or re.search(r"\b(?:ERROR|FATAL|PANIC):", output):
                    raise RuntimeError("Single-user import failed: " + output[-4000:])
            else:
                subprocess.run([str(ROOT / "scripts/dev-db.sh"), "psql", "-q", "-v", "ON_ERROR_STOP=1", "-f", str(sql_path)], check=True)
            print("Catalog snapshot and pending suggestions imported.", flush=True)


if __name__ == "__main__":
    main()

import importlib.util
from pathlib import Path
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import_store_catalog.py"
spec = importlib.util.spec_from_file_location("catalog_import", SCRIPT)
assert spec and spec.loader
catalog_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog_import)


class NotebookSuggestionsTest(unittest.TestCase):
    def test_brands_do_not_change_the_generic_item(self):
        first = catalog_import.notebook_suggestion("Cuad. Univ. 100H 7mm Superman Mooving")
        second = catalog_import.notebook_suggestion("Cuaderno universitario 100 hojas 7 mm Torre")
        self.assertIsNotNone(first)
        self.assertEqual(first, second)
        self.assertEqual(first["name"], "Cuaderno universitario cuadriculado 7 mm, 100 hojas")

    def test_grid_sizes_and_formats_remain_distinct(self):
        five = catalog_import.notebook_suggestion("Cuad. College 80H 5mm Proarte")
        seven = catalog_import.notebook_suggestion("Cuad. College 80H 7mm Proarte")
        university = catalog_import.notebook_suggestion("Cuad. Univ. 80H 5mm Proarte")
        self.assertEqual(len({five["key"], seven["key"], university["key"]}), 3)

    def test_explicit_caligrafia_orientation_is_an_attribute(self):
        vertical = catalog_import.notebook_suggestion("Cuad. College 80H Caligrafía Vertical Rhein")
        horizontal = catalog_import.notebook_suggestion("Cuad. College 80H Caligrafía Horizontal Rhein")
        self.assertEqual(vertical["subcategory"], "caligrafia")
        self.assertEqual(vertical["orientation"], "vertical")
        self.assertNotEqual(vertical["key"], horizontal["key"])

    def test_ambiguous_or_missing_details_are_not_guessed(self):
        for name in (
            "Cuad. CA. 150H 7mm Artel",
            "Cuad. Univ. 100H Artel",
            "Cuad. Univ. 100H 7mm rayado Artel",
            "Cuad. Univ. 80H 100H 7mm Artel",
            "Forro para cuaderno universitario 100H 7mm",
        ):
            with self.subTest(name=name):
                self.assertIsNone(catalog_import.notebook_suggestion(name))

    def test_half_oficio_is_not_confused_with_universitario(self):
        item = catalog_import.notebook_suggestion("Cuad. 1/2 OF. 150H 7mm Proarte")
        self.assertEqual(item["format"], "medio oficio")
        self.assertEqual(item["sheets"], 150)

    def test_explicit_extra_notebook_specifications_are_not_discarded(self):
        self.assertIsNone(catalog_import.notebook_suggestion("Cuad. Univ. 100H 7mm 3 materias"))
        self.assertIsNone(catalog_import.notebook_suggestion("Cuad. Univ. 100H 7mm 80g"))
        self.assertIsNone(catalog_import.notebook_suggestion("Cuad. Univ. 100H 7mm 90grs"))


class OtherSupplySuggestionsTest(unittest.TestCase):
    def test_product_candidates_use_type_attributes_without_changing_identity(self):
        cases = (
            ("Cuad. Univ. 100H 7mm", "cuaderno:universitario:cuadriculados:-:7:100", "tipo_cuaderno", "Cuadriculado"),
            ("Cuaderno College 80H caligrafía vertical", "cuaderno:college:caligrafia:vertical:-:80", "tipo_cuaderno", "Caligrafía"),
            ("Lapiz Color 12 col Artel", "manual:lapices-colores-12", "tipo_arte", "Lápices de colores"),
            ("Lapiz Grafito HB s/Goma", "lapiz-grafito:hb:sin-goma", "tipo_escritura", "Grafito"),
            ("Croquera Carta 80H", "croquera:carta:80:sin-medidas", "tipo_arte", "Croquera"),
            ("Block Dibujo Medio 99 1/8 20H", "block:medio:99:1/8:20", "tipo_arte", "Block"),
            ("Regla 30 cm", "manual:regla-30-cm", "tipo_geometria", "Regla"),
            ("Pegamento en barra 21g", "pegamento-barra:21-g", "tipo_pegado_corte", "Pegamento"),
        )
        for name, key, type_key, type_value in cases:
            with self.subTest(name=name):
                item = catalog_import.product_suggestion(name)
                self.assertIsNotNone(item)
                self.assertEqual(item["key"], key)
                self.assertEqual(item["attributes"][type_key], type_value)
                self.assertNotIn("subcategory", item)
        self.assertIs(catalog_import.product_suggestion("Lapiz Grafito HB s/Goma")["attributes"]["incluye_goma"], False)

    def test_notebook_types_preserve_distinct_classifications(self):
        names = {
            "Cuadriculado": "7mm", "Rayado": "rayado", "Composición": "composición",
            "Caligrafía": "caligrafía", "Croquis": "croquis", "Liso": "liso",
        }
        keys = set()
        for expected, description in names.items():
            item = catalog_import.product_suggestion(f"Cuaderno College 80 hojas {description}")
            self.assertIsNotNone(item)
            self.assertEqual(item["attributes"]["tipo_cuaderno"], expected)
            keys.add(item["key"])
        self.assertEqual(len(keys), 6)

    def test_color_count_is_preserved_and_mixed_sets_are_skipped(self):
        item = catalog_import.color_pencil_suggestion("Lápiz Color 12 col Artel")
        self.assertEqual(item["key"], "manual:lapices-colores-12")
        self.assertEqual(item["attributes"]["numero_colores"], 12)
        self.assertIsNone(catalog_import.color_pencil_suggestion("Lápiz Color 12 col + grafito + goma"))
        self.assertIsNone(catalog_import.color_pencil_suggestion("Lápiz Color 12 col Acuarelable"))
        self.assertIsNone(catalog_import.color_pencil_suggestion("Lapiz Color 12col Woody Aquarelable"))
        self.assertIsNone(catalog_import.color_pencil_suggestion("Lapiz Color 12 Col Mega Hexagonal"))
        self.assertIsNone(catalog_import.color_pencil_suggestion("Lapiz Color 12 col 3.0 Giotto"))

    def test_plural_color_pencils_preserve_count_and_existing_identity(self):
        for noun in ("Lápiz", "Lapiz", "Lápices", "Lapices"):
            for count in (6, 12, 24):
                with self.subTest(noun=noun, count=count):
                    item = catalog_import.product_suggestion(f"{noun} de colores {count} colores")
                    self.assertIsNotNone(item)
                    expected_key = "manual:lapices-colores-12" if count == 12 else f"lapices-colores:{count}"
                    self.assertEqual(item["key"], expected_key)
                    self.assertEqual(item["attributes"]["numero_colores"], count)
                    self.assertEqual(item["attributes"]["tipo_arte"], "Lápices de colores")

    def test_plural_color_pencils_do_not_guess_special_or_unspecified_sets(self):
        for name in (
            "Lápices de colores 6 colores bicolor",
            "Lapices de colores 24 colores jumbo",
            "Lápices de colores 12 colores acuarelables",
            "Lápices de colores 24 colores metálicos",
            "Lapices de colores 6 colores + grafito + goma",
            "Lápices de colores 24 colores pack",
            "Lápices de colores",
        ):
            with self.subTest(name=name):
                self.assertIsNone(catalog_import.product_suggestion(name))

    def test_graphite_grade_and_eraser_are_distinct(self):
        with_eraser = catalog_import.graphite_pencil_suggestion("Lapiz Grafito HB c/Goma Doms")
        without_eraser = catalog_import.graphite_pencil_suggestion("Lapiz Grafito HB s/Goma Doms")
        self.assertEqual(with_eraser["attributes"], {"dureza_grafito": "HB", "incluye_goma": True})
        self.assertEqual(without_eraser["attributes"]["incluye_goma"], False)
        self.assertNotEqual(with_eraser["key"], without_eraser["key"])
        self.assertIsNone(catalog_import.graphite_pencil_suggestion("Lapiz Grafito HB x12"))

    def test_sketchbook_distinguishes_format_sheet_count_and_dimensions(self):
        item = catalog_import.sketchbook_suggestion("Croquera 21x32 OF. 80H Artel")
        self.assertEqual(item["attributes"], {"formato": "oficio", "numero_hojas": 80,
                                             "dimension_menor_cm": 21.0, "dimension_mayor_cm": 32.0})
        other = catalog_import.sketchbook_suggestion("Croquera 22x32 OF. 80H Artel")
        self.assertNotEqual(item["key"], other["key"])
        self.assertIsNone(catalog_import.sketchbook_suggestion("Croquera XL A4 50H 160g Canson"))
        self.assertIsNone(catalog_import.sketchbook_suggestion("Croquera A4 68 páginas"))
        self.assertIsNone(catalog_import.sketchbook_suggestion("Croquera D/F 50H Carta"))
        self.assertIsNone(catalog_import.sketchbook_suggestion("Croquera A4 90grs 120H"))
        self.assertIsNone(catalog_import.sketchbook_suggestion("Croquera A4 20H 200g24x32"))

    def test_sketchbook_keeps_centimeter_dimensions_and_rejects_other_units(self):
        expected = catalog_import.product_suggestion("Croquera Carta 80H 21x28 Artel")
        self.assertIsNotNone(expected)
        self.assertEqual(expected["attributes"]["dimension_menor_cm"], 21)
        self.assertEqual(expected["attributes"]["dimension_mayor_cm"], 28)
        for dimensions in ("21x28 cm", "21 cm x 28 cm", "21×28 centímetros"):
            with self.subTest(dimensions=dimensions):
                self.assertEqual(
                    catalog_import.product_suggestion(f"Croquera Carta 80H {dimensions} Artel"),
                    expected,
                )
        for dimensions in (
            "8.5x11 pulgadas", "8,5×11 pulg.", "8.5x11in", "8.5 in x 11 in",
            '8.5"x11"', "8.5″×11″", "21x28 mm", "21mm x 28mm", "21x28 metros",
            "21x28 mts", "21mtsx28cm", "21x28 meters",
        ):
            with self.subTest(dimensions=dimensions):
                self.assertIsNone(catalog_import.product_suggestion(f"Croquera Carta 80H {dimensions} Artel"))

    def test_drawing_block_attributes_are_preserved(self):
        item = catalog_import.drawing_block_suggestion("Block Dibujo Medio 99 1/8 20H Mas+Arte")
        self.assertEqual(item["attributes"], {"tipo_block": "medio", "numero_hojas": 20,
                                             "numero_block": 99, "fraccion_block": "1/8"})
        self.assertIsNone(catalog_import.drawing_block_suggestion("Block Dibujo Med. D/F 99 1/4 20H"))

    def test_rulers_and_glue_have_correct_generic_keys(self):
        ruler = catalog_import.ruler_suggestion("Regla 30 cm Artel")
        self.assertEqual(ruler["key"], "manual:regla-30-cm")
        self.assertIsNone(catalog_import.ruler_suggestion("Regla metálica 30 cm"))
        self.assertIsNone(catalog_import.ruler_suggestion("Regla T aluminio 60cm"))
        self.assertIsNone(catalog_import.ruler_suggestion("Regla plástica 15cm x 8un"))
        self.assertIsNone(catalog_import.ruler_suggestion("Regla quilting 30x15cm"))
        glue = catalog_import.glue_stick_suggestion("Pegamento en barra 21g Artel")
        self.assertEqual(glue["attributes"]["peso_g"], 21)
        self.assertNotEqual(glue["key"], catalog_import.glue_stick_suggestion("Pegamento en barra 8g Artel")["key"])

    def test_glue_preserves_weights_with_gram_abbreviations(self):
        keys = set()
        for weight in (8, 21):
            expected = catalog_import.product_suggestion(f"Pegamento en barra {weight}g Artel")
            for unit in ("g", "gr", "grs", "grs.", "gramo", "gramos"):
                with self.subTest(weight=weight, unit=unit):
                    item = catalog_import.product_suggestion(f"Pegamento en barra {weight}{unit} Artel")
                    self.assertEqual(item, expected)
                    self.assertEqual(item["attributes"]["peso_g"], weight)
                    keys.add(item["key"])
        self.assertEqual(len(keys), 2)
        self.assertEqual(
            catalog_import.product_suggestion("Pegamento en barra Artel")["key"],
            "manual:pegamento-barra",
        )

    def test_glue_does_not_drop_explicit_unsupported_or_conflicting_weights(self):
        for weight in ("8.5g", "8,5grs", "0.5 oz", "21mg", "21kg", "21ml", "21gms",
                       "0grs", "-21grs", "251grs", "1000grs", "8grs 21g"):
            with self.subTest(weight=weight):
                self.assertIsNone(catalog_import.product_suggestion(f"Pegamento en barra {weight} Artel"))


class ExtractionTest(unittest.TestCase):
    def test_only_selected_catalog_tables_are_extracted(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            dump = path / "example.dump"
            content = [b"-- test dump\n", b"COPY public.customers (secret) FROM stdin;\nprivate-person\n\\.\n"]
            for table, (columns, _, _) in catalog_import.TABLES.items():
                header = f"COPY public.{table} ({', '.join(columns)}) FROM stdin;\n".encode()
                row = b"\t".join(b"value" for _ in columns) + b"\n\\.\n"
                content.extend((header, row))
            dump.write_bytes(b"".join(content))
            counts = catalog_import.extract_sections(dump, path)
            self.assertEqual(set(counts), set(catalog_import.TABLES))
            self.assertTrue(all(count == 1 for count in counts.values()))
            self.assertFalse((path / "customers.tsv").exists())
            self.assertNotIn(b"private-person", b"".join(p.read_bytes() for p in path.glob("*.tsv")))

    def test_copy_escapes_preserve_non_ascii_text(self):
        self.assertEqual(catalog_import.decode_copy("Lápiz\\tazul".encode()), "Lápiz\tazul")


if __name__ == "__main__":
    unittest.main()

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

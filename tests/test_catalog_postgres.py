"""Exercise the actual SQL and importer against a disposable PostgreSQL cluster."""

import importlib.util
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("catalog_import_integration", ROOT / "scripts/import_store_catalog.py")
assert spec and spec.loader
catalog_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog_import)


class PostgreSQLCatalogTest(unittest.TestCase):
    def test_fresh_catalog_import_is_atomic_idempotent_and_preserves_review(self):
        if not shutil.which("pg_config"):
            self.skipTest("PostgreSQL server binaries are not available")
        pg_bin = Path(subprocess.run(["pg_config", "--bindir"], check=True, capture_output=True, text=True).stdout.strip())
        if not (pg_bin / "initdb").is_file() or not (pg_bin / "postgres").is_file():
            self.skipTest("PostgreSQL server binaries are not available")
        with tempfile.TemporaryDirectory(prefix="lista-pg-test-", dir="/tmp") as directory:
            work = Path(directory)
            cluster = work / "cluster"
            subprocess.run([str(pg_bin / "initdb"), "-D", str(cluster), "-U", "test_user", "--auth-local=trust",
                            "--auth-host=reject", "--encoding=UTF8", "--no-locale"], check=True, capture_output=True)

            def single_user(database: str, sql: str, expect_error: bool = False) -> str:
                result = subprocess.run([str(pg_bin / "postgres"), "--single", "-D", str(cluster), "-j", database],
                                        input=sql, text=True, capture_output=True)
                output = result.stdout + result.stderr
                error = result.returncode != 0 or bool(re.search(r"\b(?:ERROR|FATAL|PANIC):", output))
                if error != expect_error:
                    self.fail(f"Unexpected PostgreSQL result:\n{output[-5000:]}")
                return output

            single_user("postgres", "CREATE DATABASE lista_escolar;\n")
            for filename in ("001_catalog.sql", "002_seed_catalog.sql"):
                single_user("lista_escolar", (ROOT / "db" / filename).read_text(encoding="utf-8"))

            product = "11111111-1111-4111-8111-111111111111"
            pencil = "22222222-2222-4222-8222-222222222222"
            brand = "33333333-3333-4333-8333-333333333333"
            category = "44444444-4444-4444-8444-444444444444"
            image = "55555555-5555-4555-8555-555555555555"
            product_image = "66666666-6666-4666-8666-666666666666"
            variant = "77777777-7777-4777-8777-777777777777"
            missing = r"\N"
            fixtures = {
                "brands": [[brand, "brand", "Example brand", missing]],
                "categories": [[category, "notebooks", "Cuadernos", missing, missing]],
                "products": [
                    [product, "notebook", "Cuad. Univ. 100H 7mm Example", "unidad", "1000", brand, "t", missing, "2026-01-01 00:00:00+00"],
                    [pencil, "pencils", "Lapiz Color 12 col Example", "caja", "2000", brand, "t", missing, "2026-01-01 00:00:00+00"],
                ],
                "product_variants": [[variant, product, "SKU-1", missing, "{}", "1000", missing]],
                "product_categories": [[product, category, missing]],
                "images": [[image, "https://example.invalid/image.png", missing, missing]],
                "product_images": [[product_image, product, image, "0", missing]],
            }
            dump = work / "sample.dump"
            with dump.open("w", encoding="utf-8") as output:
                output.write("-- sample\nCOPY public.customers (secret) FROM stdin;\nprivate-person\n\\.\n")
                for table, (source_columns, _, _) in catalog_import.TABLES.items():
                    output.write(f"COPY public.{table} ({', '.join(source_columns)}) FROM stdin;\n")
                    for row in fixtures[table]:
                        output.write("\t".join(row) + "\n")
                    output.write("\\.\n")

            staging = work / "staging"
            staging.mkdir()
            counts = catalog_import.extract_sections(dump, staging)
            self.assertEqual(counts["products"], 2)
            items, matches, methods = catalog_import.build_suggestions(staging / "products.tsv", staging / "candidates.tsv")
            self.assertEqual((items, matches), (2, 2))
            self.assertEqual(methods["explicit_notebook_attributes"], 1)
            sql = catalog_import.sql_script(staging, single_user=True)
            single_user("lista_escolar", sql)
            single_user("lista_escolar", sql)

            assertions = f"""
            DO $$ DECLARE notebook_id uuid; wrong_subcategory bigint; escritura bigint;
            BEGIN
              IF (SELECT count(*) FROM store_snapshot.products) <> 2 THEN RAISE EXCEPTION 'duplicate source products'; END IF;
              IF (SELECT count(*) FROM catalog.store_product_matches WHERE review_status = 'pending') <> 2 THEN RAISE EXCEPTION 'wrong match status'; END IF;
              IF to_regclass('store_snapshot.customers') IS NOT NULL THEN RAISE EXCEPTION 'customer table imported'; END IF;
              SELECT id INTO notebook_id FROM catalog.items WHERE canonical_key = 'cuaderno:universitario:cuadriculados:-:7:100';
              IF notebook_id IS NULL THEN RAISE EXCEPTION 'notebook is missing'; END IF;
              IF (SELECT attributes->'cuadricula_mm'->>'value' FROM catalog.browse_items WHERE id = notebook_id) <> '7' THEN
                  RAISE EXCEPTION 'grid spacing missing from browse view';
              END IF;
              IF (SELECT source_image_url FROM catalog.product_matches_for_review WHERE source_product_id = '{product}') <> 'https://example.invalid/image.png' THEN
                  RAISE EXCEPTION 'source image missing from review view';
              END IF;
              SELECT id INTO escritura FROM catalog.categories WHERE slug = 'escritura';
              SELECT id INTO wrong_subcategory FROM catalog.subcategories WHERE slug = 'cuadriculados';
              BEGIN
                  INSERT INTO catalog.items (category_id, subcategory_id, name, canonical_key)
                  VALUES (escritura, wrong_subcategory, 'incorrect', 'test:invalid-category');
                  RAISE EXCEPTION 'category constraint was bypassed';
              EXCEPTION WHEN foreign_key_violation THEN NULL;
              END;
              BEGIN
                  INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, number_value)
                  SELECT notebook_id, id, data_type, -5 FROM catalog.attribute_definitions WHERE key = 'largo_cm';
                  RAISE EXCEPTION 'positive-attribute constraint was bypassed';
              EXCEPTION WHEN check_violation THEN NULL;
              END;
            END $$;
            """
            single_user("lista_escolar", assertions)

            single_user("lista_escolar", f"UPDATE catalog.store_product_matches SET review_status = 'rejected' WHERE source_product_id = '{product}';")
            single_user("lista_escolar", sql)
            single_user("lista_escolar", f"""DO $$ BEGIN
                IF (SELECT review_status FROM catalog.store_product_matches WHERE source_product_id = '{product}') <> 'rejected' THEN
                    RAISE EXCEPTION 'a rejected match was reset';
                END IF;
            END $$;""")

            # A missing taxonomy entry must abort the entire snapshot transaction.
            with (staging / "candidates.tsv").open("a", encoding="utf-8") as output:
                output.write(f"invalid:test\tInvalid\tmissing-category\tmissing\t{{}}\ttest\t{product}\n")
            single_user("lista_escolar", sql, expect_error=True)
            single_user("lista_escolar", """DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM catalog.items WHERE canonical_key = 'invalid:test') THEN
                    RAISE EXCEPTION 'failed import did not roll back';
                END IF;
            END $$;""")


if __name__ == "__main__":
    unittest.main()

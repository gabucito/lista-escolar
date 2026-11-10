"""Exercise the actual SQL and importer against a disposable PostgreSQL cluster."""

import importlib.util
import json
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
            for filename in ("001_catalog.sql", "002_seed_catalog.sql", "003_application.sql", "004_notebook_catalog.sql"):
                single_user("lista_escolar", (ROOT / "db" / filename).read_text(encoding="utf-8"))

            product = "11111111-1111-4111-8111-111111111111"
            pencil = "22222222-2222-4222-8222-222222222222"
            brand = "33333333-3333-4333-8333-333333333333"
            category = "44444444-4444-4444-8444-444444444444"
            image = "55555555-5555-4555-8555-555555555555"
            product_image = "66666666-6666-4666-8666-666666666666"
            variant = "77777777-7777-4777-8777-777777777777"
            new_notebook = "88888888-8888-4888-8888-888888888888"
            missing = r"\N"
            fixtures = {
                "brands": [[brand, "brand", "Example brand", missing]],
                "categories": [[category, "notebooks", "Cuadernos", missing, missing]],
                "products": [
                    [product, "notebook", "Cuad. Univ. 100H 7mm Example", "unidad", "1000", brand, "t", missing, "2026-01-01 00:00:00+00"],
                    [pencil, "pencils", "Lapiz Color 12 col Example", "caja", "2000", brand, "t", missing, "2026-01-01 00:00:00+00"],
                    [new_notebook, "notebook-a4", "Cuaderno A4 100 hojas 7 mm Example", "unidad", "1500", brand, "t", missing, "2026-01-01 00:00:00+00"],
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
            self.assertEqual(counts["products"], 3)
            items, matches, methods = catalog_import.build_suggestions(staging / "products.tsv", staging / "candidates.tsv")
            self.assertEqual((items, matches), (3, 3))
            self.assertEqual(methods["explicit_notebook_attributes"], 2)
            sql = catalog_import.sql_script(staging, single_user=True)
            error = single_user("lista_escolar", sql, expect_error=True)
            self.assertIn("Apply migration 005", error)
            single_user("lista_escolar", """DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM store_snapshot.products) THEN
                    RAISE EXCEPTION 'an outdated target was changed before prerequisite validation';
                END IF;
            END $$;""")
            single_user("lista_escolar", "BEGIN;\n" + (ROOT / "db/005_category_attributes.sql").read_text(encoding="utf-8") + "\nCOMMIT;")

            # Compatibility classifications remain valid, but imports need none.
            single_user("lista_escolar", """DO $$ DECLARE wrong_subcategory bigint; escritura bigint;
            BEGIN
                SELECT id INTO escritura FROM catalog.categories WHERE slug='escritura';
                SELECT id INTO wrong_subcategory FROM catalog.subcategories WHERE slug='cuadriculados';
                BEGIN
                    INSERT INTO catalog.items(category_id,subcategory_id,name,canonical_key)
                    VALUES(escritura,wrong_subcategory,'incorrect','test:invalid-category');
                    RAISE EXCEPTION 'category constraint was bypassed';
                EXCEPTION WHEN foreign_key_violation THEN NULL;
                END;
            END $$;
            UPDATE catalog.items SET subcategory_id=NULL;
            DELETE FROM catalog.subcategory_attributes;
            DELETE FROM catalog.subcategories;
            UPDATE catalog.items SET name='Curated notebook title'
                WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
            UPDATE catalog.item_attributes SET number_value=120
                WHERE item_id=(SELECT id FROM catalog.items WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100')
                  AND attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_hojas');
            INSERT INTO catalog.item_aliases(item_id,alias)
                SELECT id,'Curated notebook alias' FROM catalog.items WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
            CREATE TABLE public.before_items AS SELECT * FROM catalog.items;
            CREATE TABLE public.before_attributes AS SELECT * FROM catalog.item_attributes;
            CREATE TABLE public.before_aliases AS SELECT * FROM catalog.item_aliases;
            """)
            single_user("lista_escolar", sql)
            single_user("lista_escolar", sql)

            assertions = f"""
            DO $$ DECLARE notebook_id uuid;
            BEGIN
              IF (SELECT count(*) FROM store_snapshot.products) <> 3 THEN RAISE EXCEPTION 'duplicate source products'; END IF;
              IF (SELECT count(*) FROM catalog.store_product_matches WHERE review_status = 'pending') <> 3 THEN RAISE EXCEPTION 'wrong match status'; END IF;
              IF to_regclass('store_snapshot.customers') IS NOT NULL THEN RAISE EXCEPTION 'customer table imported'; END IF;
              SELECT id INTO notebook_id FROM catalog.items WHERE canonical_key = 'cuaderno:universitario:cuadriculados:-:7:100';
              IF notebook_id IS NULL THEN RAISE EXCEPTION 'notebook is missing'; END IF;
              IF (SELECT attributes->'cuadricula_mm'->>'value' FROM catalog.browse_items WHERE id = notebook_id) <> '7' THEN
                  RAISE EXCEPTION 'grid spacing missing from browse view';
              END IF;
              IF (SELECT source_image_url FROM catalog.product_matches_for_review WHERE source_product_id = '{product}') <> 'https://example.invalid/image.png' THEN
                  RAISE EXCEPTION 'source image missing from review view';
              END IF;
              IF (SELECT count(*) FROM catalog.items) <> 45 THEN RAISE EXCEPTION 'seed canonical identity duplicated'; END IF;
              IF NOT EXISTS (SELECT 1 FROM catalog.browse_items b JOIN catalog.items i ON i.id=b.id
                    WHERE b.canonical_key='cuaderno:a4:cuadriculados:-:7:100'
                    AND b.review_status='pending' AND i.subcategory_id IS NULL
                    AND b.attributes->'tipo_cuaderno'->>'value'='Cuadriculado'
                    AND jsonb_typeof(b.attributes->'numero_hojas'->'value')='number') THEN
                  RAISE EXCEPTION 'new category/type candidate did not roundtrip';
              END IF;
              IF EXISTS (SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                 OR EXISTS (SELECT * FROM public.before_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                 OR EXISTS (SELECT * FROM public.before_aliases EXCEPT SELECT * FROM catalog.item_aliases) THEN
                  RAISE EXCEPTION 'existing curation was overwritten';
              END IF;
              BEGIN
                  INSERT INTO catalog.item_attributes (item_id, attribute_id, data_type, number_value)
                  SELECT notebook_id, id, data_type, -5 FROM catalog.attribute_definitions WHERE key = 'largo_cm';
                  RAISE EXCEPTION 'positive-attribute constraint was bypassed';
              EXCEPTION WHEN check_violation THEN NULL;
              END;
            END $$;
            """
            single_user("lista_escolar", assertions)

            # Existing source rows retain their original snapshot on later imports.
            source_rows = (staging / "products.tsv").read_text(encoding="utf-8")
            (staging / "products.tsv").write_text(source_rows.replace(
                "Cuad. Univ. 100H 7mm Example\tunidad\t1000",
                "Renamed source notebook\tunidad\t9999",
            ), encoding="utf-8")
            single_user("lista_escolar", sql)
            single_user("lista_escolar", f"""DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM store_snapshot.products WHERE id='{product}'
                    AND name='Cuad. Univ. 100H 7mm Example' AND price_clp=1000) THEN
                    RAISE EXCEPTION 'source snapshot identity or content was overwritten';
                END IF;
            END $$;""")
            (staging / "products.tsv").write_text(source_rows, encoding="utf-8")

            single_user("lista_escolar", f"UPDATE catalog.store_product_matches SET review_status = 'rejected' WHERE source_product_id = '{product}';")
            single_user("lista_escolar", sql)
            single_user("lista_escolar", f"""DO $$ BEGIN
                IF (SELECT review_status FROM catalog.store_product_matches WHERE source_product_id = '{product}') <> 'rejected' THEN
                    RAISE EXCEPTION 'a rejected match was reset';
                END IF;
            END $$;""")

            # A reviewed type change must not be relinked through its old key.
            single_user("lista_escolar", """UPDATE catalog.item_attributes SET text_value='Rayado'
                WHERE item_id=(SELECT id FROM catalog.items WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100')
                  AND attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='tipo_cuaderno');""")
            conflict = single_user("lista_escolar", sql, expect_error=True)
            self.assertIn("different or unclassified catalog type", conflict)
            single_user("lista_escolar", """DO $$ BEGIN
                IF (SELECT a.text_value FROM catalog.item_attributes a JOIN catalog.items i ON i.id=a.item_id
                    JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
                    WHERE i.canonical_key='cuaderno:universitario:cuadriculados:-:7:100' AND d.key='tipo_cuaderno') <> 'Rayado' THEN
                    RAISE EXCEPTION 'curated type was reset';
                END IF;
            END $$;
            UPDATE catalog.item_attributes SET text_value='Cuadriculado'
                WHERE item_id=(SELECT id FROM catalog.items WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100')
                  AND attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='tipo_cuaderno');""")

            # Category assignments, typed scalars and conditional applicability
            # are validated before any generated item/match is committed.
            candidates = (staging / "candidates.tsv").read_text(encoding="utf-8")
            invalid_attributes = (
                {"tipo_cuaderno": "Inventado", "numero_hojas": 100},
                {"tipo_cuaderno": "Rayado", "cuadricula_mm": 7},
                {"tipo_cuaderno": "Cuadriculado", "numero_hojas": "100"},
                {"tipo_cuaderno": "Cuadriculado", "incluye_goma": False},
            )
            for attributes in invalid_attributes:
                with self.subTest(attributes=attributes):
                    (staging / "candidates.tsv").write_text(candidates + "\t".join(
                        catalog_import.copy_text(value) for value in (
                            "invalid:attribute", "Invalid", "cuadernos",
                            json.dumps(attributes, ensure_ascii=False), "test", product,
                        )
                    ) + "\n", encoding="utf-8")
                    error = single_user("lista_escolar", sql, expect_error=True)
                    self.assertIn("missing, invalid or not applicable", error)
            (staging / "candidates.tsv").write_text(candidates, encoding="utf-8")

            # The same canonical key cannot be moved into another category by
            # the import, even if that candidate's own attributes are valid.
            fields = candidates.splitlines()[0].split("\t")
            fields[2] = "geometria"
            fields[3] = json.dumps({"tipo_geometria": "Regla", "largo_cm": 30})
            (staging / "candidates.tsv").write_text("\t".join(fields) + "\n", encoding="utf-8")
            self.assertIn("different or unclassified catalog type",
                          single_user("lista_escolar", sql, expect_error=True))
            (staging / "candidates.tsv").write_text(candidates, encoding="utf-8")

            # A missing taxonomy entry must abort the entire snapshot transaction.
            extra_source = "99999999-9999-4999-8999-999999999999"
            with (staging / "products.tsv").open("a", encoding="utf-8") as output:
                output.write("\t".join([
                    extra_source, "rollback", "Unclassified source", "unidad", "123", brand,
                    "t", missing, "2026-01-01 00:00:00+00",
                ]) + "\n")
            with (staging / "candidates.tsv").open("a", encoding="utf-8") as output:
                output.write(f"invalid:test\tInvalid\tmissing-category\t{{}}\ttest\t{product}\n")
            single_user("lista_escolar", sql, expect_error=True)
            single_user("lista_escolar", f"""DO $$ BEGIN
                IF EXISTS (SELECT 1 FROM catalog.items WHERE canonical_key = 'invalid:test') THEN
                    RAISE EXCEPTION 'failed import did not roll back';
                END IF;
                IF EXISTS (SELECT 1 FROM store_snapshot.products WHERE id='{extra_source}') THEN
                    RAISE EXCEPTION 'failed import retained a partial source snapshot';
                END IF;
            END $$;""")


if __name__ == "__main__":
    unittest.main()

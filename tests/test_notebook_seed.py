"""Validate notebook data migrations using an isolated single-user PostgreSQL."""

from contextlib import contextmanager
import importlib.util
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("notebook_seed_importer", ROOT / "scripts/import_store_catalog.py")
assert spec and spec.loader
catalog_import = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog_import)
SEED = (ROOT / "db/004_notebook_catalog.sql").read_text(encoding="utf-8")


class NotebookSeedTest(unittest.TestCase):
    @contextmanager
    def database(self):
        if not shutil.which("pg_config"):
            self.skipTest("PostgreSQL server binaries are not available")
        pg_bin = Path(subprocess.run(["pg_config", "--bindir"], check=True, capture_output=True, text=True).stdout.strip())
        if not (pg_bin / "initdb").is_file() or not (pg_bin / "postgres").is_file():
            self.skipTest("PostgreSQL server binaries are not available")
        with tempfile.TemporaryDirectory(prefix="lista-notebook-seed-", dir="/tmp") as directory:
            cluster = Path(directory) / "cluster"
            subprocess.run([str(pg_bin / "initdb"), "-D", str(cluster), "-U", "test_user", "--auth-local=trust",
                            "--auth-host=reject", "--encoding=UTF8", "--no-locale"], check=True, capture_output=True)

            def sql(statement):
                result = subprocess.run([str(pg_bin / "postgres"), "--single", "-D", str(cluster), "-j", "postgres"],
                                        input=statement, text=True, capture_output=True)
                output = result.stdout + result.stderr
                if result.returncode or re.search(r"\b(?:ERROR|FATAL|PANIC):", output):
                    self.fail(f"Unexpected PostgreSQL result:\n{output[-5000:]}")
                return output

            for filename in ("001_catalog.sql", "002_seed_catalog.sql", "003_application.sql"):
                sql((ROOT / "db" / filename).read_text(encoding="utf-8"))
            yield sql

    def test_notebooks_have_typed_attributes_and_reuse_importer_keys(self):
        with self.database() as sql:
            sql("BEGIN;\n" + SEED + "\nCOMMIT;")
            sql("BEGIN;\n" + SEED + "\nCOMMIT;")
            sql("""DO $$ BEGIN
                IF (SELECT count(*) FROM catalog.browse_items WHERE category_slug='cuadernos') <> 24 THEN
                    RAISE EXCEPTION 'expected 24 independent notebook requirements after repeated seed';
                END IF;
                IF EXISTS (SELECT 1 FROM catalog.browse_items WHERE category_slug='cuadernos' AND
                    (review_status <> 'approved' OR NOT attributes ? 'formato' OR NOT attributes ? 'numero_hojas'
                     OR jsonb_typeof(attributes->'formato'->'value') <> 'string'
                     OR jsonb_typeof(attributes->'numero_hojas'->'value') <> 'number'
                     OR (subcategory_slug='cuadriculados' AND NOT attributes ? 'cuadricula_mm')
                     OR (subcategory_slug <> 'cuadriculados' AND attributes ? 'cuadricula_mm')
                     OR (subcategory_slug='caligrafia' AND NOT attributes ? 'orientacion'))) THEN
                    RAISE EXCEPTION 'missing, untyped or misplaced notebook attributes';
                END IF;
                IF (SELECT count(DISTINCT subcategory_slug) FROM catalog.browse_items WHERE category_slug='cuadernos') <> 6 THEN
                    RAISE EXCEPTION 'notebook subcategories were omitted';
                END IF;
                IF EXISTS (SELECT 1 FROM catalog.store_product_matches) OR EXISTS (SELECT 1 FROM store_snapshot.products) THEN
                    RAISE EXCEPTION 'notebook starter seed fabricated store records';
                END IF;
            END $$;""")
            for name in (
                "Cuad. Univ. 100H 7mm", "Cuaderno College 80 hojas rayado",
                "Cuaderno 1/2 oficio caligrafía horizontal 40 hojas", "Cuaderno College liso 40 hojas",
            ):
                item = catalog_import.product_suggestion(name)
                self.assertIsNotNone(item)
                # Keys contain only normalized importer tokens, not user-controlled SQL.
                key = item["key"]
                self.assertRegex(key, r"^[a-z0-9:-]+$")
                sql(f"""DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM catalog.items WHERE canonical_key='{key}') THEN
                        RAISE EXCEPTION 'seed and importer disagree on notebook identity';
                    END IF;
                END $$;""")

    def test_existing_curation_publication_and_removed_taxonomy_are_preserved(self):
        with self.database() as sql:
            sql("""
                INSERT INTO catalog.items(category_id,subcategory_id,name,canonical_key,review_status)
                SELECT c.id,s.id,v.name,v.key,v.status
                FROM (VALUES
                    ('Notebook pending review','cuaderno:universitario:cuadriculados:-:7:100','pending'),
                    ('Notebook rejected by curator','cuaderno:universitario:cuadriculados:-:5:100','rejected')
                ) v(name,key,status)
                JOIN catalog.categories c ON c.slug='cuadernos'
                JOIN catalog.subcategories s ON s.category_id=c.id AND s.slug='cuadriculados';
                INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,number_value)
                SELECT i.id,a.id,a.data_type,120 FROM catalog.items i
                JOIN catalog.attribute_definitions a ON a.key='numero_hojas'
                WHERE i.canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
                INSERT INTO catalog.item_aliases(item_id,alias)
                SELECT id,'Curated alternative' FROM catalog.items
                WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
                INSERT INTO app.lists(id,visibility,archived,current_version,draft)
                VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','public',true,1,'{"school":"Preserved school","items":[]}');
                INSERT INTO app.versions(list_id,number,content)
                SELECT id,1,draft FROM app.lists WHERE id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
                CREATE TABLE public.before_items AS SELECT * FROM catalog.items;
                CREATE TABLE public.before_attributes AS SELECT * FROM catalog.item_attributes;
                CREATE TABLE public.before_aliases AS SELECT * FROM catalog.item_aliases;
                CREATE TABLE public.before_versions AS SELECT * FROM app.versions;
                CREATE TABLE public.before_lists AS SELECT * FROM app.lists;
                DELETE FROM catalog.subcategory_attributes WHERE subcategory_id IN (
                    SELECT s.id FROM catalog.subcategories s JOIN catalog.categories c ON c.id=s.category_id
                    WHERE c.slug='cuadernos' AND s.slug='lisos');
                DELETE FROM catalog.subcategories USING catalog.categories c
                WHERE catalog.subcategories.category_id=c.id AND c.slug='cuadernos' AND catalog.subcategories.slug='lisos';
            """)
            sql("BEGIN;\n" + SEED + "\nCOMMIT;")
            sql("BEGIN;\n" + SEED + "\nCOMMIT;")
            sql("""DO $$ BEGIN
                IF EXISTS (SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                    OR EXISTS (SELECT * FROM public.before_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                    OR EXISTS (SELECT * FROM public.before_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                    OR EXISTS (SELECT * FROM public.before_versions EXCEPT SELECT * FROM app.versions)
                    OR EXISTS (SELECT * FROM public.before_lists EXCEPT SELECT * FROM app.lists) THEN
                    RAISE EXCEPTION 'existing curated data or immutable list snapshots changed';
                END IF;
                IF EXISTS (SELECT 1 FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                    WHERE NOT EXISTS (SELECT 1 FROM public.before_attributes b WHERE b.item_id=a.item_id AND b.attribute_id=a.attribute_id)) THEN
                    RAISE EXCEPTION 'seed filled attributes on an existing curated notebook';
                END IF;
                IF (SELECT count(*) FROM catalog.items i JOIN catalog.categories c ON c.id=i.category_id WHERE c.slug='cuadernos') <> 22 THEN
                    RAISE EXCEPTION 'removed taxonomy was recreated or canonical keys duplicated';
                END IF;
            END $$;""")


if __name__ == "__main__":
    unittest.main()

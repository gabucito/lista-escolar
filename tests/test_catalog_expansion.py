"""Evidence-linked catalog additions preserve existing identities and snapshots."""
import hashlib
import json
from pathlib import Path
import re
import unittest
import test_notebook_seed as notebook_seed

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'docs/catalog-expansion-2026-11-10.json'
DATA = json.loads(DATA_PATH.read_text())
SEED = (ROOT / 'db/006_catalog_expansion.sql').read_text()
EMBEDDED = json.loads(SEED.split('$catalog_expansion_006$')[1])


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def through_five(sql):
    for name in ('004_notebook_catalog.sql', '005_category_attributes.sql'):
        sql('BEGIN;\n' + (ROOT / 'db' / name).read_text() + '\nCOMMIT;')


def apply(sql):
    sql('BEGIN;\n' + SEED + '\nCOMMIT;')


class CatalogExpansionTest(unittest.TestCase):
    def test_embedded_dataset_is_evidence_linked_and_matches_migration(self):
        self.assertEqual(EMBEDDED, {key: DATA[key] for key in ('categories', 'definitions', 'items')})
        self.assertIn('-- Dataset SHA-256: ' + hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(), SEED)
        sources = {source['id'] for source in DATA['sources']}
        categories = {category['slug']: category for category in DATA['categories']}
        definitions = {definition['key']: definition for definition in DATA['definitions']}
        self.assertEqual(len(categories), len(DATA['categories']))
        self.assertEqual(len(definitions), len(DATA['definitions']))
        self.assertEqual(len({item['key'] for item in DATA['items']}), len(DATA['items']))
        for item in DATA['items']:
            self.assertIn(item['category'], categories)
            self.assertTrue(item['sources'], item['name'])
            self.assertTrue(set(item['sources']) <= sources, item['name'])
            self.assertTrue(item['type'].strip())
            self.assertLessEqual(len(item['name']), 300)
            for key, value in item['attributes'].items():
                self.assertIn(key, definitions)
                kind = definitions[key]['data_type']
                self.assertTrue((kind == 'text' and isinstance(value, str) and value.strip())
                    or (kind == 'number' and type(value) in (int, float) and 0 < value <= 1000000)
                    or (kind == 'boolean' and type(value) is bool), (item['name'], key))

    def test_expansion_preserves_existing_data_and_is_idempotent(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_five(sql)
            sql("""
                INSERT INTO app.lists(id,visibility,archived,current_version,draft)
                VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','public',true,1,'{"school":"Preserved","items":[]}');
                INSERT INTO app.versions(list_id,number,content) SELECT id,1,draft FROM app.lists;
                CREATE TABLE public.before_items AS SELECT * FROM catalog.items;
                CREATE TABLE public.before_attributes AS SELECT * FROM catalog.item_attributes;
                CREATE TABLE public.before_aliases AS SELECT * FROM catalog.item_aliases;
                CREATE TABLE public.before_lists AS SELECT * FROM app.lists;
                CREATE TABLE public.before_versions AS SELECT * FROM app.versions;
                CREATE TABLE public.before_subcategories AS SELECT * FROM catalog.subcategories;
                -- An unrestricted binding must not be narrowed by new item types.
                UPDATE catalog.category_attributes SET applies_to_types='{}'
                WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='formato');
                CREATE TABLE public.before_bindings AS SELECT * FROM catalog.category_attributes;
            """)
            apply(sql)
            expected_total = DATA['baseline']['items'] + len(DATA['items'])
            expected_categories = DATA['baseline']['categories'] + sum(category['new'] for category in DATA['categories'])
            sql(f"""DO $$ BEGIN
                IF (SELECT count(*) FROM catalog.items)<>{expected_total}
                   OR (SELECT count(*) FROM catalog.categories)<>{expected_categories} THEN
                    RAISE EXCEPTION 'unexpected catalog expansion counts';
                END IF;
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                   OR EXISTS(SELECT * FROM public.before_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                   OR EXISTS(SELECT * FROM public.before_lists EXCEPT SELECT * FROM app.lists)
                   OR EXISTS(SELECT * FROM public.before_versions EXCEPT SELECT * FROM app.versions)
                   OR EXISTS(SELECT * FROM public.before_subcategories EXCEPT SELECT * FROM catalog.subcategories)
                   OR EXISTS(SELECT * FROM catalog.subcategories EXCEPT SELECT * FROM public.before_subcategories) THEN
                    RAISE EXCEPTION 'catalog expansion altered existing data or legacy classifications';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                    WHERE NOT EXISTS(SELECT 1 FROM public.before_attributes b WHERE b.item_id=a.item_id AND b.attribute_id=a.attribute_id)) THEN
                    RAISE EXCEPTION 'catalog expansion added attributes to an existing item';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.category_attributes a JOIN public.before_bindings b USING(category_id,attribute_id)
                    WHERE cardinality(b.applies_to_types)=0 AND cardinality(a.applies_to_types)>0) THEN
                    RAISE EXCEPTION 'unrestricted binding became restricted';
                END IF;
                IF EXISTS(SELECT 1 FROM store_snapshot.products) OR EXISTS(SELECT 1 FROM catalog.store_product_matches) THEN
                    RAISE EXCEPTION 'source product or stock data fabricated';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i
                    JOIN catalog.item_attributes a ON a.item_id=i.id
                    LEFT JOIN catalog.category_attributes c ON c.category_id=i.category_id AND c.attribute_id=a.attribute_id
                    WHERE c.attribute_id IS NULL) THEN RAISE EXCEPTION 'attribute missing its category binding'; END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.category_type_attributes t ON t.category_id=i.category_id
                    JOIN catalog.item_attributes a ON a.item_id=i.id AND a.attribute_id=t.attribute_id
                    JOIN catalog.category_attributes b ON b.category_id=i.category_id AND b.attribute_id=t.attribute_id
                    WHERE NOT a.text_value=ANY(b.options)) THEN RAISE EXCEPTION 'type missing from allowed choices'; END IF;
            END $$;""")
            # Every researched variant is approved with exact typed attributes and its own type.
            for item in DATA['items']:
                type_key = next(c['type_key'] for c in DATA['categories'] if c['slug'] == item['category'])
                attributes = {**item['attributes'], type_key: item['type']}
                sql(f"""DO $$ BEGIN
                    IF NOT EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.browse_items b ON b.id=i.id
                        WHERE i.canonical_key={literal(item['key'])} AND i.review_status='approved'
                        AND (SELECT jsonb_object_agg(key,value->'value') FROM jsonb_each(b.attributes))={literal(json.dumps(attributes, ensure_ascii=False))}::jsonb) THEN
                        RAISE EXCEPTION 'missing or mistyped researched item';
                    END IF;
                END $$;""")
            for name in ('items', 'item_attributes', 'item_aliases', 'categories', 'category_attributes', 'category_type_attributes', 'attribute_definitions'):
                sql(f'CREATE TABLE public.once_{name} AS SELECT * FROM catalog.{name};')
            apply(sql)
            for name in ('items', 'item_attributes', 'item_aliases', 'categories', 'category_attributes', 'category_type_attributes', 'attribute_definitions'):
                sql(f"""DO $$ BEGIN
                    IF EXISTS(SELECT * FROM public.once_{name} EXCEPT SELECT * FROM catalog.{name})
                       OR EXISTS(SELECT * FROM catalog.{name} EXCEPT SELECT * FROM public.once_{name}) THEN
                        RAISE EXCEPTION 'migration is not idempotent: {name}';
                    END IF;
                END $$;""")

    def test_curated_identity_and_name_collisions_are_untouched(self):
        candidates = [item for item in DATA['items'] if item['category'] == 'cuadernos']
        canonical, named = candidates[:2]
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_five(sql)
            sql(f"""
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,'Curated pending item',{literal(canonical['key'])},'pending' FROM catalog.categories WHERE slug='otros';
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,upper({literal(named['name'])}),'curated:name-collision','rejected' FROM catalog.categories WHERE slug={literal(named['category'])};
                INSERT INTO catalog.item_aliases(item_id,alias) SELECT id,'curated alias' FROM catalog.items WHERE canonical_key={literal(canonical['key'])};
                INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,number_value)
                SELECT i.id,d.id,'number',120 FROM catalog.items i CROSS JOIN catalog.attribute_definitions d
                WHERE i.canonical_key={literal(canonical['key'])} AND d.key='numero_hojas';
                UPDATE catalog.categories SET name='Nombre curado' WHERE slug='cuadernos';
                UPDATE catalog.attribute_definitions SET key='tipo_libretas_curado' WHERE key='tipo_cuaderno';
                CREATE TABLE public.before_items AS SELECT * FROM catalog.items;
                CREATE TABLE public.before_attributes AS SELECT * FROM catalog.item_attributes;
                CREATE TABLE public.before_aliases AS SELECT * FROM catalog.item_aliases;
            """)
            apply(sql)
            sql(f"""DO $$ BEGIN
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                   OR EXISTS(SELECT * FROM public.before_aliases EXCEPT SELECT * FROM catalog.item_aliases) THEN
                    RAISE EXCEPTION 'curated data was overwritten';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.items WHERE canonical_key={literal(named['key'])}) THEN
                    RAISE EXCEPTION 'normalized same-name rejected item was duplicated';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                    WHERE NOT EXISTS(SELECT 1 FROM public.before_attributes b WHERE b.item_id=a.item_id AND b.attribute_id=a.attribute_id)) THEN
                    RAISE EXCEPTION 'existing item received unreviewed new attributes';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.item_aliases a JOIN public.before_items i ON i.id=a.item_id
                    WHERE NOT EXISTS(SELECT 1 FROM public.before_aliases b WHERE b.item_id=a.item_id AND b.alias=a.alias)) THEN
                    RAISE EXCEPTION 'existing item received new aliases';
                END IF;
                IF (SELECT name FROM catalog.categories WHERE slug='cuadernos')<>'Nombre curado'
                   OR EXISTS(SELECT 1 FROM catalog.attribute_definitions WHERE key='tipo_cuaderno') THEN
                    RAISE EXCEPTION 'curated category/type identity reset';
                END IF;
            END $$;""")

    def test_removed_existing_category_stays_removed(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_five(sql)
            sql("""
                DELETE FROM catalog.subcategory_attributes WHERE subcategory_id IN(SELECT s.id FROM catalog.subcategories s JOIN catalog.categories c ON c.id=s.category_id WHERE c.slug='papeles');
                DELETE FROM catalog.subcategories WHERE category_id=(SELECT id FROM catalog.categories WHERE slug='papeles');
                DELETE FROM catalog.categories WHERE slug='papeles';
            """)
            apply(sql)
            keys = [item['key'] for item in DATA['items'] if item['category'] == 'papeles']
            sql(f"""DO $$ BEGIN
                IF EXISTS(SELECT 1 FROM catalog.categories WHERE slug='papeles')
                   OR EXISTS(SELECT 1 FROM catalog.items WHERE canonical_key=ANY(ARRAY[{','.join(map(literal,keys))}]::text[])) THEN
                    RAISE EXCEPTION 'removed category or its items were recreated';
                END IF;
            END $$;""")

    def test_incompatible_definition_aborts_without_partial_catalog_changes(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_five(sql)
            sql("UPDATE catalog.attribute_definitions SET unit='pages' WHERE key='numero_hojas'; CREATE TABLE public.before_categories AS SELECT * FROM catalog.categories; CREATE TABLE public.before_items AS SELECT * FROM catalog.items;")
            encoded = SEED.replace("\\", "\\\\").replace("'", "''").replace("\n", r"\n")
            sql("DO $test$ BEGIN BEGIN EXECUTE E'" + encoded + "'; RAISE EXCEPTION 'expected compatibility rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Catalog expansion 006: incompatible existing attribute definition%' THEN RAISE; END IF; END; END $test$;")
            sql("""DO $$ BEGIN
                IF EXISTS(SELECT * FROM catalog.categories EXCEPT SELECT * FROM public.before_categories)
                   OR EXISTS(SELECT * FROM catalog.items EXCEPT SELECT * FROM public.before_items)
                   OR EXISTS(SELECT 1 FROM catalog.attribute_definitions WHERE key='capacidad_gb') THEN
                    RAISE EXCEPTION 'failed migration retained partial catalog writes';
                END IF;
            END $$;""")


if __name__ == '__main__':
    unittest.main()

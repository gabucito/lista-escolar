"""Evidence-linked color variants preserve existing catalog and application data."""
import hashlib
import json
from pathlib import Path
import unittest
import test_notebook_seed as notebook_seed

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'docs/catalog-color-coverage-2026-11-10.json'
DATA = json.loads(DATA_PATH.read_text())
SEED = (ROOT / 'db/007_color_count_variants.sql').read_text()
EMBEDDED = json.loads(SEED.split('$color_variants_007$')[1])
METADATA = ('categories', 'attribute_definitions', 'category_attributes',
            'category_type_attributes', 'subcategories', 'subcategory_attributes',
            'legacy_subcategory_types')


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def through_six(sql):
    for name in ('004_notebook_catalog.sql', '005_category_attributes.sql', '006_catalog_expansion.sql'):
        sql('BEGIN;\n' + (ROOT / 'db' / name).read_text() + '\nCOMMIT;')


def apply(sql):
    sql('BEGIN;\n' + SEED + '\nCOMMIT;')


def reject(sql, message):
    # Catch within a subtransaction so the assertions can inspect rollback.
    encoded = SEED.replace('\\', '\\\\').replace("'", "''").replace('\n', r'\n')
    sql("DO $test$ BEGIN BEGIN EXECUTE E'" + encoded
        + "'; RAISE EXCEPTION 'expected compatibility rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> "
        + literal(message) + ' THEN RAISE; END IF; END; END $test$;')


def snapshot(sql, prefix, schema, tables):
    for table in tables:
        sql(f'CREATE TABLE public.{prefix}_{table} AS SELECT * FROM {schema}.{table};')


def unchanged(sql, prefix, schema, tables):
    for table in tables:
        sql(f"""DO $$ BEGIN
            IF EXISTS(SELECT * FROM public.{prefix}_{table} EXCEPT SELECT * FROM {schema}.{table})
               OR EXISTS(SELECT * FROM {schema}.{table} EXCEPT SELECT * FROM public.{prefix}_{table}) THEN
                RAISE EXCEPTION 'changed preserved table: {schema}.{table}';
            END IF;
        END $$;""")


class ColorCountVariantsTest(unittest.TestCase):
    def test_embedded_dataset_has_typed_evidence_and_importer_compatible_keys(self):
        self.assertEqual(EMBEDDED, {key: DATA[key] for key in ('categories', 'definitions', 'items')})
        self.assertIn('-- Dataset SHA-256: ' + hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(), SEED)
        sources = {source['id'] for source in DATA['sources']}
        definitions = {definition['key']: definition for definition in DATA['definitions']}
        categories = {category['slug'] for category in DATA['categories']}
        self.assertEqual(len({item['key'] for item in DATA['items']}), len(DATA['items']))
        self.assertTrue(all(not category['new'] for category in DATA['categories']))
        for item in DATA['items']:
            self.assertIn(item['category'], categories)
            self.assertTrue(item['sources'], item['name'])
            self.assertTrue(set(item['sources']) <= sources, item['name'])
            self.assertTrue(item['name'].strip())
            self.assertTrue(item['type'].strip())
            self.assertLessEqual(len(item['name']), 300)
            self.assertIn('numero_colores', item['attributes'])
            for key, value in item['attributes'].items():
                self.assertIn(key, definitions)
                kind = definitions[key]['data_type']
                self.assertTrue((kind == 'text' and isinstance(value, str) and value.strip())
                    or (kind == 'number' and type(value) in (int, float) and 0 < value <= 1000000)
                    or (kind == 'boolean' and type(value) is bool), (item['name'], key))
        for count in (6, 24):
            candidate = notebook_seed.catalog_import.product_suggestion(f'Lapiz Color {count} colores')
            matching = next(item for item in DATA['items'] if item['key'] == candidate['key'])
            self.assertEqual(matching['attributes']['numero_colores'], count)
            self.assertEqual(matching['type'], 'Lápices de colores')

    def test_exact_new_values_preserve_every_existing_row_and_rerun_is_idempotent(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_six(sql)
            sql("""
                INSERT INTO app.lists(id,visibility,archived,current_version,draft)
                VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','public',true,1,
                    '{"school":"Preserved","items":[{"id":"keep","name":"Choose colors","quantity":2,"alternatives":[{"name":"Pencil six","attributes":{}},{"name":"Pencil twelve","attributes":{}}]}]}');
                INSERT INTO app.versions(list_id,number,content) SELECT id,1,draft FROM app.lists;
                -- Unrestricted, curated metadata must remain byte-for-byte intact.
                UPDATE catalog.category_attributes SET applies_to_types='{}'
                WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_colores');
            """)
            snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
            snapshot(sql, 'before', 'app', ('lists', 'versions', 'templates'))
            apply(sql)
            sql(f"""DO $$ BEGIN
                IF (SELECT count(*) FROM catalog.items)<>{DATA['baseline']['items'] + len(DATA['items'])}
                   OR (SELECT count(*) FROM catalog.categories)<>{DATA['baseline']['categories']} THEN
                    RAISE EXCEPTION 'unexpected color-variant counts';
                END IF;
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_item_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                   OR EXISTS(SELECT * FROM public.before_item_aliases EXCEPT SELECT * FROM catalog.item_aliases) THEN
                    RAISE EXCEPTION 'existing items, attributes or aliases changed';
                END IF;
                IF EXISTS(SELECT a.* FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                    EXCEPT SELECT * FROM public.before_item_attributes)
                   OR EXISTS(SELECT a.* FROM catalog.item_aliases a JOIN public.before_items i ON i.id=a.item_id
                    EXCEPT SELECT * FROM public.before_item_aliases) THEN
                    RAISE EXCEPTION 'existing items received unsolicited attributes or aliases';
                END IF;
                IF EXISTS(SELECT 1 FROM store_snapshot.products) OR EXISTS(SELECT 1 FROM catalog.store_product_matches) THEN
                    RAISE EXCEPTION 'store records fabricated';
                END IF;
            END $$;""")
            unchanged(sql, 'before', 'catalog', METADATA)
            unchanged(sql, 'before', 'app', ('lists', 'versions', 'templates'))
            for item in DATA['items']:
                type_key = next(category['type_key'] for category in DATA['categories'] if category['slug'] == item['category'])
                attributes = {**item['attributes'], type_key: item['type']}
                aliases = sorted({alias.strip().lower() for alias in item['aliases'] if alias.strip()})
                sql(f"""DO $$ BEGIN
                    IF NOT EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.browse_items b ON b.id=i.id
                        WHERE i.canonical_key={literal(item['key'])} AND i.name={literal(item['name'])}
                        AND i.review_status='approved'
                        AND (SELECT jsonb_object_agg(key,value->'value') FROM jsonb_each(b.attributes))={literal(json.dumps(attributes, ensure_ascii=False))}::jsonb
                        AND (SELECT COALESCE(jsonb_agg(alias ORDER BY alias),'[]'::jsonb) FROM catalog.item_aliases WHERE item_id=i.id)={literal(json.dumps(aliases, ensure_ascii=False))}::jsonb) THEN
                        RAISE EXCEPTION 'missing or incorrect researched item';
                    END IF;
                END $$;""")
            snapshot(sql, 'once', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
            apply(sql)
            unchanged(sql, 'once', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))

    def test_curated_collisions_and_renamed_type_identity_are_preserved(self):
        canonical, named = DATA['items'][:2]
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_six(sql)
            sql(f"""
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,'Curated pending item',{literal(canonical['key'])},'pending' FROM catalog.categories WHERE slug='otros';
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,upper({literal(named['name'])}),'curated:name-collision','rejected' FROM catalog.categories WHERE slug={literal(named['category'])};
                INSERT INTO catalog.item_aliases(item_id,alias) SELECT id,'curated alias' FROM catalog.items WHERE canonical_key={literal(canonical['key'])};
                INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,number_value)
                SELECT i.id,d.id,'number',48 FROM catalog.items i CROSS JOIN catalog.attribute_definitions d
                WHERE i.canonical_key={literal(canonical['key'])} AND d.key='numero_colores';
                UPDATE catalog.categories SET name='Arte curado' WHERE slug='arte-y-dibujo';
                UPDATE catalog.attribute_definitions SET key='tipo_arte_curado',name='Tipo curado' WHERE key='tipo_arte';
            """)
            snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
            apply(sql)
            sql(f"""DO $$ BEGIN
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_item_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                   OR EXISTS(SELECT * FROM public.before_item_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                   OR EXISTS(SELECT 1 FROM catalog.items WHERE canonical_key={literal(named['key'])}) THEN
                    RAISE EXCEPTION 'curated identity or name collision was overwritten or duplicated';
                END IF;
                IF EXISTS(SELECT a.* FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                    EXCEPT SELECT * FROM public.before_item_attributes)
                   OR EXISTS(SELECT a.* FROM catalog.item_aliases a JOIN public.before_items i ON i.id=a.item_id
                    EXCEPT SELECT * FROM public.before_item_aliases) THEN
                    RAISE EXCEPTION 'curated item received extra attributes or aliases';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i LEFT JOIN public.before_items b ON b.id=i.id
                    WHERE b.id IS NULL AND NOT EXISTS(SELECT 1 FROM catalog.item_attributes a
                        JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
                        WHERE a.item_id=i.id AND d.key='tipo_arte_curado')) THEN
                    RAISE EXCEPTION 'new item ignored renamed type identity';
                END IF;
            END $$;""")
            unchanged(sql, 'before', 'catalog', METADATA)

    def test_removed_category_stays_removed(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_six(sql)
            sql("""
                DELETE FROM catalog.items WHERE category_id=(SELECT id FROM catalog.categories WHERE slug='arte-y-dibujo');
                DELETE FROM catalog.subcategory_attributes WHERE subcategory_id IN(SELECT s.id FROM catalog.subcategories s JOIN catalog.categories c ON c.id=s.category_id WHERE c.slug='arte-y-dibujo');
                DELETE FROM catalog.subcategories WHERE category_id=(SELECT id FROM catalog.categories WHERE slug='arte-y-dibujo');
                DELETE FROM catalog.categories WHERE slug='arte-y-dibujo';
            """)
            snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
            apply(sql)
            unchanged(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))

    def test_incompatible_definition_aborts_without_partial_changes(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_six(sql)
            sql("UPDATE catalog.attribute_definitions SET unit='pieces' WHERE key='numero_colores';")
            snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
            reject(sql, 'Color variants 007: missing or incompatible existing attribute definition type or unit')
            unchanged(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))

    def test_closed_choices_and_removed_bindings_are_not_overwritten(self):
        for mutation in (
            "UPDATE catalog.category_attributes SET options=ARRAY['12'] WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_colores')",
            "DELETE FROM catalog.category_attributes WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_colores')",
            "UPDATE catalog.category_attributes SET applies_to_types=ARRAY['Croquera'] WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_colores')",
        ):
            with self.subTest(mutation=mutation), notebook_seed.NotebookSeedTest.database(self) as sql:
                through_six(sql)
                sql(mutation)
                snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))
                reject(sql, 'Color variants 007: proposed value conflicts with existing category attribute contract')
                unchanged(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases', *METADATA))


if __name__ == '__main__':
    unittest.main()

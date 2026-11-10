"""Research-backed attributes and variants preserve curation and list snapshots."""
import hashlib
import json
from pathlib import Path
import unittest
import test_notebook_seed as notebook_seed

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / 'docs/catalog-attribute-additions-2026-11-10.json'
DATA = json.loads(DATA_PATH.read_text())
SEED = (ROOT / 'db/008_attribute_coverage.sql').read_text()
EMBEDDED_KEYS = ('categories', 'definitions', 'bindings', 'items', 'existing_item_updates', 'guarded_definition_labels')
EMBEDDED = json.loads(SEED.split('$attribute_coverage_008$')[1])
CATALOG_TABLES = ('items', 'item_attributes', 'item_aliases', 'categories', 'attribute_definitions',
                  'category_attributes', 'category_type_attributes', 'subcategories',
                  'subcategory_attributes', 'legacy_subcategory_types')


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def through_seven(sql):
    for name in ('004_notebook_catalog.sql', '005_category_attributes.sql',
                 '006_catalog_expansion.sql', '007_color_count_variants.sql'):
        sql('BEGIN;\n' + (ROOT / 'db' / name).read_text() + '\nCOMMIT;')


def apply(sql):
    sql('BEGIN;\n' + SEED + '\nCOMMIT;')


def snapshot(sql, prefix, schema, tables):
    sql('\n'.join(f'CREATE TABLE public.{prefix}_{table} AS SELECT * FROM {schema}.{table};'
                  for table in tables))


def unchanged(sql, prefix, schema, tables):
    checks = ''.join(f"""
        IF EXISTS(SELECT * FROM public.{prefix}_{table} EXCEPT SELECT * FROM {schema}.{table})
           OR EXISTS(SELECT * FROM {schema}.{table} EXCEPT SELECT * FROM public.{prefix}_{table}) THEN
            RAISE EXCEPTION 'changed preserved table: {schema}.{table}';
        END IF;""" for table in tables)
    sql('DO $$ BEGIN ' + checks + ' END $$;')


def reject(sql, expected):
    encoded = SEED.replace('\\', '\\\\').replace("'", "''").replace('\n', r'\n')
    sql("DO $test$ BEGIN BEGIN EXECUTE E'" + encoded
        + "'; RAISE EXCEPTION 'expected compatibility rejection'; EXCEPTION WHEN OTHERS THEN IF SQLERRM <> "
        + literal(expected) + ' THEN RAISE; END IF; END; END $test$;')


def install_expected(sql):
    sql('CREATE TABLE public.expected_008 AS SELECT '
        + literal(json.dumps({key: DATA[key] for key in EMBEDDED_KEYS}, ensure_ascii=False))
        + '::jsonb document;')


class AttributeCoverageTest(unittest.TestCase):
    def test_dataset_contract_is_typed_evidenced_and_matches_frozen_sql(self):
        self.assertEqual(EMBEDDED, {key: DATA[key] for key in EMBEDDED_KEYS})
        self.assertIn('-- Dataset SHA-256: ' + hashlib.sha256(DATA_PATH.read_bytes()).hexdigest(), SEED)
        sources = {s['id'] for s in DATA['sources']}
        definitions = {d['key']: d for d in DATA['definitions']}
        categories = {c['slug']: c for c in DATA['categories']}
        bindings = {(b['category'], b['key']): b for b in DATA['bindings']}
        self.assertEqual(len(definitions), len(DATA['definitions']))
        self.assertEqual(len(categories), len(DATA['categories']))
        self.assertEqual(len(bindings), len(DATA['bindings']))
        self.assertTrue(all(not c['new'] for c in DATA['categories']))
        self.assertEqual(len({i['key'] for i in DATA['items']}), len(DATA['items']))
        for binding in DATA['bindings']:
            self.assertIn(binding['category'], categories)
            self.assertIn(binding['key'], definitions)
            self.assertTrue(binding['applies_to_types'])
        for item in DATA['items'] + DATA['existing_item_updates']:
            self.assertIn(item['category'], categories)
            self.assertTrue(item['name'].strip())
            self.assertLessEqual(len(item['name']), 300)
            self.assertTrue(item['type'].strip())
            self.assertTrue(item['sources'])
            self.assertTrue(set(item['sources']) <= sources)
            for key, value in item['attributes'].items():
                self.assertIn(key, definitions)
                self.assertIn((item['category'], key), bindings)
                self.assertIn(item['type'], bindings[item['category'], key]['applies_to_types'])
                kind = definitions[key]['data_type']
                self.assertTrue((kind == 'text' and isinstance(value, str) and value.strip())
                    or (kind == 'number' and type(value) in (int, float) and 0 < value <= 1000000)
                    or (kind == 'boolean' and type(value) is bool), (item['key'], key))
        for update in DATA['existing_item_updates']:
            self.assertIn(update['mode'], ('add_missing', 'normalize'))
            if update['mode'] == 'add_missing':
                self.assertFalse(set(update['attributes']) & set(update['expected_attributes']))
            else:
                self.assertEqual(update['key'], 'manual:tijera-punta-redonda')
                self.assertEqual(update['attributes'], {'tipo_punta': 'Redonda'})

    def test_complete_expansion_preserves_snapshots_and_is_idempotent(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_seven(sql)
            install_expected(sql)
            sql("""
                INSERT INTO app.lists(id,visibility,archived,current_version,draft)
                VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','public',true,1,
                    '{"school":"Preserved","items":[{"id":"keep","name":"Any acceptable pencil","quantity":"2","attributes":{},"alternatives":[{"name":"HB","attributes":{}},{"name":"2B","attributes":{}}]}]}');
                INSERT INTO app.versions(list_id,number,content) SELECT id,1,draft FROM app.lists;
                UPDATE catalog.category_attributes SET applies_to_types='{}',sort_order=777
                WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='numero_colores');
            """)
            snapshot(sql, 'before', 'catalog', CATALOG_TABLES)
            snapshot(sql, 'before', 'app', ('lists', 'versions', 'templates'))
            expected_items = DATA['baseline']['items'] + len(DATA['items'])
            extra_values = sum(len(i['attributes']) + 1 for i in DATA['items']) + sum(
                len(set(u['attributes']) - set(u['expected_attributes'])) for u in DATA['existing_item_updates'])
            apply(sql)
            sql(f"""DO $$ BEGIN
                IF (SELECT count(*) FROM catalog.items)<>{expected_items}
                   OR (SELECT count(*) FROM catalog.categories)<>{DATA['baseline']['categories']}
                   OR (SELECT count(*) FROM catalog.item_attributes)<>{DATA['baseline']['attribute_values'] + extra_values} THEN
                    RAISE EXCEPTION 'unexpected attribute expansion counts';
                END IF;
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_item_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                   OR EXISTS(SELECT a.* FROM catalog.item_aliases a JOIN public.before_items i ON i.id=a.item_id
                       EXCEPT SELECT * FROM public.before_item_aliases) THEN
                    RAISE EXCEPTION 'existing item identities, names or aliases changed';
                END IF;
                IF EXISTS(SELECT 1 FROM public.before_category_attributes b
                    LEFT JOIN catalog.category_attributes a USING(category_id,attribute_id)
                    WHERE a.attribute_id IS NULL OR a.options<>b.options OR a.sort_order<>b.sort_order
                       OR (cardinality(b.applies_to_types)=0 AND a.applies_to_types<>b.applies_to_types)
                       OR NOT b.applies_to_types<@a.applies_to_types) THEN
                    RAISE EXCEPTION 'existing binding choices/order changed or applicability narrowed';
                END IF;
                IF EXISTS(SELECT 1 FROM public.before_attribute_definitions b
                    JOIN catalog.attribute_definitions a USING(id)
                    WHERE a.key<>b.key OR a.data_type<>b.data_type OR a.unit IS DISTINCT FROM b.unit
                       OR a.name<>CASE WHEN b.key='tipo_pauta' AND b.name='Pauta musical' THEN 'Tipo de pauta' ELSE b.name END) THEN
                    RAISE EXCEPTION 'existing definitions changed beyond the approved default label';
                END IF;
                IF EXISTS(SELECT 1 FROM store_snapshot.products) OR EXISTS(SELECT 1 FROM catalog.store_product_matches) THEN
                    RAISE EXCEPTION 'store data fabricated';
                END IF;
            END $$;""")
            # Exact expected values for new rows, including all distinct units and booleans.
            sql("""DO $$ BEGIN
                IF EXISTS(SELECT 1 FROM public.expected_008 x,
                    jsonb_to_recordset(x.document->'items') p(key text,name text,type text,category text,attributes jsonb,aliases jsonb)
                    JOIN catalog.categories c ON c.slug=p.category
                    JOIN catalog.category_type_attributes t ON t.category_id=c.id
                    JOIN catalog.attribute_definitions d ON d.id=t.attribute_id
                    LEFT JOIN catalog.items i ON i.canonical_key=p.key
                    LEFT JOIN catalog.browse_items b ON b.id=i.id
                    WHERE i.id IS NULL OR i.name<>p.name OR i.review_status<>'approved'
                      OR (SELECT jsonb_object_agg(key,value->'value') FROM jsonb_each(b.attributes))
                         IS DISTINCT FROM p.attributes||jsonb_build_object(d.key,p.type)
                      OR (SELECT COALESCE(jsonb_agg(alias ORDER BY alias),'[]'::jsonb) FROM catalog.item_aliases WHERE item_id=i.id)
                         IS DISTINCT FROM (SELECT COALESCE(jsonb_agg(alias ORDER BY alias),'[]'::jsonb) FROM
                             (SELECT DISTINCT lower(btrim(value)) alias FROM jsonb_array_elements_text(p.aliases) WHERE btrim(value)<>'') aliases)) THEN
                    RAISE EXCEPTION 'new item data does not match exact researched variant';
                END IF;
                IF EXISTS(SELECT 1 FROM public.before_items i
                    LEFT JOIN LATERAL (SELECT p.attributes patch FROM public.expected_008 x,
                        jsonb_to_recordset(x.document->'existing_item_updates') p(key text,attributes jsonb)
                        WHERE p.key=i.canonical_key) upd ON true
                    WHERE (SELECT jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value)))
                           FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id WHERE a.item_id=i.id)
                      IS DISTINCT FROM
                        (SELECT jsonb_object_agg(d.key,COALESCE(to_jsonb(a.text_value),to_jsonb(a.number_value),to_jsonb(a.boolean_value)))
                         FROM public.before_item_attributes a JOIN public.before_attribute_definitions d ON d.id=a.attribute_id WHERE a.item_id=i.id)
                        ||COALESCE(upd.patch,'{}'::jsonb)) THEN
                    RAISE EXCEPTION 'old item attributes changed beyond exact approved patches';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.item_attributes a ON a.item_id=i.id
                    LEFT JOIN catalog.category_attributes b ON b.category_id=i.category_id AND b.attribute_id=a.attribute_id
                    WHERE b.attribute_id IS NULL) THEN RAISE EXCEPTION 'item attribute has no category binding'; END IF;
            END $$;""")
            unchanged(sql, 'before', 'catalog', ('categories', 'category_type_attributes', 'subcategories', 'subcategory_attributes', 'legacy_subcategory_types'))
            unchanged(sql, 'before', 'app', ('lists', 'versions', 'templates'))
            snapshot(sql, 'once', 'catalog', CATALOG_TABLES)
            apply(sql)
            unchanged(sql, 'once', 'catalog', CATALOG_TABLES)

    def test_curated_collisions_type_keys_labels_and_item_patches_are_preserved(self):
        canonical, named = DATA['items'][:2]
        category = canonical['category']
        type_key = next(c['type_key'] for c in DATA['categories'] if c['slug'] == category)
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_seven(sql)
            sql(f"""
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,'Curated pending item',{literal(canonical['key'])},'pending' FROM catalog.categories WHERE slug='otros';
                INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
                SELECT id,upper({literal(named['name'])}),'curated:name-collision','rejected' FROM catalog.categories WHERE slug={literal(named['category'])};
                INSERT INTO catalog.item_aliases(item_id,alias) SELECT id,'curated alias' FROM catalog.items WHERE canonical_key={literal(canonical['key'])};
                UPDATE catalog.categories SET name='Nombre curado' WHERE slug={literal(category)};
                UPDATE catalog.attribute_definitions SET key='tipo_curado_008',name='Tipo curado' WHERE key={literal(type_key)};
                UPDATE catalog.attribute_definitions SET name='Pauta personalizada' WHERE key='tipo_pauta';
            """)
            # Every approved old patch must skip if any part of its snapshot was curated.
            for index, update in enumerate(DATA['existing_item_updates']):
                key = literal(update['key'])
                if index % 3 == 0:
                    sql(f"UPDATE catalog.items SET name=name||' curado' WHERE canonical_key={key};")
                elif index % 3 == 1:
                    sql(f"UPDATE catalog.items SET review_status='pending' WHERE canonical_key={key};")
                else:
                    sql(f"""INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value)
                        SELECT i.id,d.id,'text','Curado' FROM catalog.items i CROSS JOIN catalog.attribute_definitions d
                        WHERE i.canonical_key={key} AND d.key='color' ON CONFLICT(item_id,attribute_id) DO UPDATE SET text_value='Curado';""")
            snapshot(sql, 'before', 'catalog', ('items', 'item_attributes', 'item_aliases'))
            apply(sql)
            sql(f"""DO $$ BEGIN
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                   OR EXISTS(SELECT * FROM public.before_item_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                   OR EXISTS(SELECT * FROM public.before_item_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                   OR EXISTS(SELECT a.* FROM catalog.item_attributes a JOIN public.before_items i ON i.id=a.item_id
                       EXCEPT SELECT * FROM public.before_item_attributes)
                   OR EXISTS(SELECT a.* FROM catalog.item_aliases a JOIN public.before_items i ON i.id=a.item_id
                       EXCEPT SELECT * FROM public.before_item_aliases)
                   OR EXISTS(SELECT 1 FROM catalog.items WHERE canonical_key={literal(named['key'])}) THEN
                    RAISE EXCEPTION 'curated existing data changed or a name collision was duplicated';
                END IF;
                IF (SELECT name FROM catalog.attribute_definitions WHERE key='tipo_pauta')<>'Pauta personalizada'
                   OR EXISTS(SELECT 1 FROM catalog.attribute_definitions WHERE key={literal(type_key)}) THEN
                    RAISE EXCEPTION 'curated label or type identity restored';
                END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.categories c ON c.id=i.category_id
                    LEFT JOIN public.before_items b ON b.id=i.id WHERE b.id IS NULL AND c.slug={literal(category)}
                    AND NOT EXISTS(SELECT 1 FROM catalog.item_attributes a JOIN catalog.attribute_definitions d ON d.id=a.attribute_id
                        WHERE a.item_id=i.id AND d.key='tipo_curado_008')) THEN
                    RAISE EXCEPTION 'new item ignored renamed type key';
                END IF;
            END $$;""")

    def test_removed_category_is_not_recreated_or_given_unused_definitions(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            through_seven(sql)
            sql("""
                DELETE FROM catalog.items WHERE category_id=(SELECT id FROM catalog.categories WHERE slug='musica');
                DELETE FROM catalog.categories WHERE slug='musica';
            """)
            apply(sql)
            sql("""DO $$ BEGIN
                IF EXISTS(SELECT 1 FROM catalog.categories WHERE slug='musica')
                   OR EXISTS(SELECT 1 FROM catalog.attribute_definitions WHERE key='digitacion_flauta') THEN
                    RAISE EXCEPTION 'removed category or unused definition recreated';
                END IF;
            END $$;""")

    def test_incompatible_definitions_rollback_all_changes(self):
        for mutation in (
            "UPDATE catalog.attribute_definitions SET unit='pages' WHERE key='numero_hojas'",
            "INSERT INTO catalog.attribute_definitions(key,name,data_type) VALUES('con_margen','Curated incompatible field','text')",
        ):
            with self.subTest(mutation=mutation), notebook_seed.NotebookSeedTest.database(self) as sql:
                through_seven(sql)
                sql(mutation)
                snapshot(sql, 'before', 'catalog', CATALOG_TABLES)
                reject(sql, 'Attribute coverage 008: incompatible existing attribute definition type or unit')
                unchanged(sql, 'before', 'catalog', CATALOG_TABLES)

    def test_closed_choices_and_removed_type_choices_are_preserved_on_rejection(self):
        cases = [
            ("UPDATE catalog.category_attributes SET options=ARRAY['4B'] WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='dureza_grafito')",
             'Attribute coverage 008: proposed value conflicts with existing allowed choices'),
            ("UPDATE catalog.category_attributes SET options=array_remove(options,'Grafito') WHERE attribute_id=(SELECT id FROM catalog.attribute_definitions WHERE key='tipo_escritura')",
             'Attribute coverage 008: proposed binding conflicts with existing category types'),
        ]
        for mutation, message in cases:
            with self.subTest(mutation=mutation), notebook_seed.NotebookSeedTest.database(self) as sql:
                through_seven(sql)
                sql(mutation)
                snapshot(sql, 'before', 'catalog', CATALOG_TABLES)
                reject(sql, message)
                unchanged(sql, 'before', 'catalog', CATALOG_TABLES)


if __name__ == '__main__':
    unittest.main()

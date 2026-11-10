"""Category/type migration preserves catalog identities and published snapshots."""
from pathlib import Path
import unittest
import test_notebook_seed as notebook_seed

ROOT = Path(__file__).resolve().parents[1]


class CategoryAttributesMigrationTest(unittest.TestCase):
    def test_category_types_preserve_curation_and_snapshots(self):
        with notebook_seed.NotebookSeedTest.database(self) as sql:
            sql((ROOT / 'db/004_notebook_catalog.sql').read_text())
            sql("""
                INSERT INTO catalog.attribute_definitions(key,name,data_type) VALUES('tipo_cuaderno','Tipo de cuaderno','text');
                INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,text_value)
                SELECT i.id,d.id,'text','Edición curada' FROM catalog.items i CROSS JOIN catalog.attribute_definitions d
                WHERE i.canonical_key='cuaderno:universitario:cuadriculados:-:7:100' AND d.key='tipo_cuaderno';
                UPDATE catalog.items SET review_status='rejected',name='Nombre corregido'
                WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
                INSERT INTO catalog.item_aliases(item_id,alias) SELECT id,'Nombre alternativo conservado'
                FROM catalog.items WHERE canonical_key='cuaderno:universitario:cuadriculados:-:7:100';
                UPDATE catalog.subcategories SET name='Tipo personalizado por administración'
                WHERE category_id=(SELECT id FROM catalog.categories WHERE slug='cuadernos') AND slug='lisos';
                INSERT INTO app.lists(id,visibility,archived,current_version,draft)
                VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','public',true,1,'{"school":"No alterar","items":[]}');
                INSERT INTO app.versions(list_id,number,content) SELECT id,1,draft FROM app.lists;
                CREATE TABLE public.before_items AS SELECT * FROM catalog.items;
                CREATE TABLE public.before_attributes AS SELECT * FROM catalog.item_attributes;
                CREATE TABLE public.before_aliases AS SELECT * FROM catalog.item_aliases;
                CREATE TABLE public.before_lists AS SELECT * FROM app.lists;
                CREATE TABLE public.before_versions AS SELECT * FROM app.versions;
            """)
            sql('BEGIN;\n' + (ROOT / 'db/005_category_attributes.sql').read_text() + '\nCOMMIT;')
            sql("""DO $$ BEGIN
                IF EXISTS(SELECT * FROM public.before_items EXCEPT SELECT * FROM catalog.items)
                    OR EXISTS(SELECT * FROM catalog.items EXCEPT SELECT * FROM public.before_items)
                    OR EXISTS(SELECT * FROM public.before_attributes EXCEPT SELECT * FROM catalog.item_attributes)
                    OR EXISTS(SELECT * FROM public.before_aliases EXCEPT SELECT * FROM catalog.item_aliases)
                    OR EXISTS(SELECT * FROM public.before_lists EXCEPT SELECT * FROM app.lists)
                    OR EXISTS(SELECT * FROM public.before_versions EXCEPT SELECT * FROM app.versions) THEN
                    RAISE EXCEPTION 'Migration changed existing catalog data or list snapshots';
                END IF;
                IF (SELECT count(*) FROM catalog.category_type_attributes)<>9 THEN RAISE EXCEPTION 'Missing category types'; END IF;
                IF EXISTS(SELECT 1 FROM catalog.items i JOIN catalog.category_type_attributes t ON t.category_id=i.category_id
                    WHERE i.subcategory_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM catalog.item_attributes a WHERE a.item_id=i.id AND a.attribute_id=t.attribute_id)) THEN
                    RAISE EXCEPTION 'Classified item lost its type';
                END IF;
                IF NOT EXISTS(SELECT 1 FROM catalog.category_attributes a JOIN catalog.categories c ON c.id=a.category_id
                    JOIN catalog.attribute_definitions d ON d.id=a.attribute_id WHERE c.slug='cuadernos' AND d.key='tipo_cuaderno'
                    AND 'Edición curada'=ANY(a.options) AND 'Tipo personalizado por administración'=ANY(a.options)) THEN
                    RAISE EXCEPTION 'Curated values or renamed classification were discarded';
                END IF;
                IF NOT EXISTS(SELECT 1 FROM catalog.category_attributes a JOIN catalog.categories c ON c.id=a.category_id
                    JOIN catalog.attribute_definitions d ON d.id=a.attribute_id WHERE c.slug='cuadernos' AND d.key='cuadricula_mm'
                    AND a.applies_to_types=ARRAY['Cuadriculado']::text[]) THEN RAISE EXCEPTION 'Grid applicability missing'; END IF;
            END $$;""")


if __name__ == '__main__':
    unittest.main()

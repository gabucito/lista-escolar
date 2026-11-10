"""Faceted catalog acceptance. Called only inside the disposable API harness."""
import json
from pathlib import Path
import subprocess
import uuid
from urllib.parse import urlencode


def run_catalog_browse(ctx):
    tag = uuid.uuid4().hex[:10]
    viewer, admin = ctx.viewer, ctx.admin
    categories = viewer.request('GET', '/catalog/categories')
    notebooks = next(c for c in categories if c['slug'] == 'cuadernos')
    squared = next(s for s in notebooks['subcategories'] if s['slug'] == 'cuadriculados')
    ruled = next(s for s in notebooks['subcategories'] if s['slug'] == 'rayados')
    identities = []

    def create(label, attributes, sub=squared, approved=True):
        item = admin.request('POST', '/admin/catalog', {
            'name': f'Material {label} {tag}', 'category_id': notebooks['id'],
            'subcategory_id': sub['id'], 'attributes': attributes, 'approve': True,
        })
        identities.append(item['id'])
        if not approved:
            admin.request('PATCH', f"/admin/catalog/{item['id']}", {'action': 'reject'})
        return item['id']

    def browse(attributes=None, **parameters):
        parameters.setdefault('q', tag)
        if attributes is not None:
            parameters['attributes'] = json.dumps(attributes, ensure_ascii=False)
        return viewer.request('GET', '/catalog/browse?' + urlencode(parameters))

    def facet(result, key):
        return next(f for f in result['facets'] if f['key'] == key)

    def values(result, key, include_zero=False):
        return [(v['value'], v['count']) for v in facet(result, key)['values'] if include_zero or v['count']]

    a = create('ÁLFA', {'formato': 'universitario', 'numero_hojas': 100, 'cuadricula_mm': 7})
    b = create('Beta', {'formato': 'college', 'numero_hojas': 80, 'cuadricula_mm': 5})
    c = create('Gamma', {'formato': 'universitario', 'numero_hojas': 80, 'cuadricula_mm': 5})
    d = create('Delta', {'formato': 'college', 'numero_hojas': 100}, sub=ruled)
    rejected = create('Oculto', {'formato': 'secreto', 'numero_hojas': 999}, approved=False)
    no_attributes = create('Sin atributos', {})
    writing = next(c for c in categories if c['slug'] == 'escritura')
    boolean_items=[]
    for index,value in enumerate((False,True,False)):
        item=admin.request('POST','/admin/catalog',{'name':f'Grafito {tag} {index}','category_id':writing['id'],
            'attributes':{'tipo_escritura':'Grafito','incluye_goma':value},'approve':True})['id']
        identities.append(item);boolean_items.append(item)

    def searching():
        for query in [f'{tag} univ 100 hojas 7mm', f'{tag} UNIVERSITARIO 100 hojas 7 mm', f'{tag} alfa']:
            result = browse(q=query)
            assert [r['id'] for r in result['items']] == [a], (query, result)
        result = browse(q=f'{tag} numero de hojas')
        assert {r['id'] for r in result['items']} == {a, b, c, d}
        result = viewer.request('GET', '/catalog?' + urlencode({'q': f'{tag} univ 100 hojas 7mm'}))
        assert [r['id'] for r in result] == [a]
        assert rejected not in {r['id'] for r in browse()['items']}
        assert 'secreto' not in [v for v, _ in values(browse(), 'formato')]
        assert browse(q=f'{tag} %')['total'] == 0

        product = str(uuid.uuid4())
        ctx.sql(f"INSERT INTO store_snapshot.products(id,slug,name,unit_label,price_clp,visible_in_store,source_updated_at) VALUES('{product}','browse-{tag}','Referenciaúnica{tag}','unidad',100,true,now())")
        ctx.sql(f"INSERT INTO catalog.store_product_matches(item_id,source_product_id,review_status,match_method) VALUES('{a}','{product}','pending','qa_import')")
        assert browse(q=f'referenciaunica{tag}')['total'] == 0
        admin.request('PATCH', '/admin/matches', {'item_id': a, 'source_product_id': product, 'review_status': 'approved'})
        assert [r['id'] for r in browse(q=f'referenciaunica{tag}')['items']] == [a]
        ctx.sql(f"UPDATE store_snapshot.products SET deleted_at=now() WHERE id='{product}'")
        assert browse(q=f'referenciaunica{tag}')['total'] == 0

        # Names accept 300 characters, so both the paged route and existing
        # public/admin arrays must still find a pasted full-length name.
        long_name = tag + ' ' + 'Á' * (300 - len(tag) - 1)
        long_item = admin.request('POST', '/admin/catalog', {
            'name': long_name, 'category_id': notebooks['id'], 'approve': True,
        })['id']
        try:
            assert [r['id'] for r in browse(q=long_name)['items']] == [long_item]
            query = urlencode({'q': long_name})
            assert [r['id'] for r in viewer.request('GET', '/catalog?' + query)] == [long_item]
            assert [r['id'] for r in admin.request('GET', '/admin/catalog?' + query)] == [long_item]
        finally:
            ctx.sql(f"DELETE FROM catalog.items WHERE id='{long_item}'")

    def filtering_and_facets():
        initial = browse(category='cuadernos', subcategory='cuadriculados')
        assert initial['total'] == 4 and {r['id'] for r in initial['items']} == {a, b, c, no_attributes}
        assert values(initial, 'numero_hojas') == [(80, 2), (100, 1)]
        assert facet(initial, 'numero_hojas')['unit'] == 'hojas'
        assert facet(initial, 'numero_hojas')['data_type'] == 'number'
        exact = browse({'formato': 'universitario', 'numero_hojas': 100, 'cuadricula_mm': 7}, category='cuadernos', subcategory='cuadriculados')
        assert exact['total'] == 1 and exact['items'][0]['id'] == a
        combined = browse({'formato': 'universitario', 'numero_hojas': 100}, category='cuadernos', subcategory='cuadriculados')
        assert values(combined, 'numero_hojas') == [(80, 1), (100, 1)], combined
        assert values(combined, 'formato') == [('universitario', 1)]
        false = browse({'incluye_goma': False})
        assert false['total'] == 2 and {r['id'] for r in false['items']} == {boolean_items[0], boolean_items[2]}
        assert values(false, 'incluye_goma') == [(False, 2), (True, 1)]
        zero = browse({'formato': 'universitario', 'numero_hojas': 80, 'cuadricula_mm': 7})
        assert zero['total'] == 0 and zero['items'] == []
        assert values(zero, 'numero_hojas', True) == [(80, 0), (100, 1)]
        assert values(zero, 'cuadricula_mm', True) == [(5, 1), (7, 0)]
        assert browse(category='cuadernos', subcategory='rayados')['items'][0]['id'] == d
        assert browse(category='escritura', subcategory='cuadriculados')['total'] == 0

    def invalid_filters():
        cases = [
            {'attributes': '[]'}, {'attributes': 'null'}, {'attributes': '{'},
            {'attributes': json.dumps({'desconocido': 1})},
            {'attributes': json.dumps({'numero_hojas': '100'})},
            {'attributes': json.dumps({'numero_hojas': 0})},
            {'attributes': json.dumps({'numero_hojas': 1000001})},
            {'attributes': json.dumps({'incluye_goma': 'false'})},
            {'attributes': json.dumps({'formato': True})},
            {'attributes': json.dumps({'formato': '   '})},
            {'attributes': json.dumps({'formato': ['college']})},
            {'subcategory': 'cuadriculados'}, {'limit': 0}, {'limit': 101},
            {'offset': -1}, {'offset': 1000001}, {'q': 'a' * 501},
        ]
        for parameters in cases:
            viewer.request('GET', '/catalog/browse?' + urlencode(parameters), expected=400)

    def pages_beyond_legacy_cap():
        # This group is intentionally larger than the old route's cap and does
        # not rely on a broad administrator list to locate its final match.
        ctx.sql(f"""INSERT INTO catalog.items(category_id,subcategory_id,name,canonical_key,review_status)
            SELECT {notebooks['id']},{squared['id']},'Paginación {tag} '||lpad(n::text,3,'0'),'qa-browse-{tag}-'||n,'approved'
            FROM generate_series(1,205) n;
            INSERT INTO catalog.item_attributes(item_id,attribute_id,data_type,number_value)
            SELECT i.id,a.id,'number',CASE WHEN i.canonical_key='qa-browse-{tag}-205' THEN 999 ELSE 50 END
            FROM catalog.items i CROSS JOIN catalog.attribute_definitions a
            WHERE i.canonical_key LIKE 'qa-browse-{tag}-%' AND a.key='numero_hojas';""")
        try:
            query = {'q': f'paginacion {tag}', 'category': 'cuadernos', 'subcategory': 'cuadriculados', 'limit': 100}
            first = browse(**query)
            second = browse(offset=100, **query)
            third = browse(offset=200, **query)
            assert first['total'] == second['total'] == third['total'] == 205
            assert [len(r['items']) for r in [first, second, third]] == [100, 100, 5]
            assert len({i['id'] for r in [first, second, third] for i in r['items']}) == 205
            assert values(first, 'numero_hojas') == [(50, 204), (999, 1)]
            match = browse({'numero_hojas': 999}, **query)
            assert match['total'] == 1 and match['items'][0]['name'].endswith('205')
            assert browse(offset=300, **query)['items'] == []
        finally:
            ctx.sql(f"DELETE FROM catalog.items WHERE canonical_key LIKE 'qa-browse-{tag}-%'")

    def migration_ledger_and_replay():
        assert ctx.sql('SELECT count(*) FROM app.schema_migrations WHERE version IN (3,4,5,6,7,8)') == '6'
        ledger = ctx.sql('SELECT jsonb_agg(to_jsonb(m) ORDER BY version)::text FROM app.schema_migrations m')
        fingerprint_sql = """SELECT md5(
            COALESCE((SELECT string_agg(to_jsonb(i)::text,'|' ORDER BY id) FROM catalog.items i),'') ||
            COALESCE((SELECT string_agg(to_jsonb(a)::text,'|' ORDER BY item_id,attribute_id) FROM catalog.item_attributes a),'') ||
            COALESCE((SELECT string_agg(to_jsonb(a)::text,'|' ORDER BY item_id,alias) FROM catalog.item_aliases a),''))"""
        before = ctx.sql(fingerprint_sql)
        root = Path(__file__).resolve().parents[1]
        for _ in range(2):
            subprocess.run([str(root / 'target/debug/lista-escolar'), 'migrate'], cwd=root,
                           env=ctx.cli_environment, check=True, capture_output=True, text=True)
        assert ctx.sql(fingerprint_sql) == before
        assert ctx.sql('SELECT jsonb_agg(to_jsonb(m) ORDER BY version)::text FROM app.schema_migrations m') == ledger

    def color_count_variants():
        data = json.loads((Path(__file__).resolve().parents[1] / 'docs/catalog-color-coverage-2026-11-10.json').read_text())
        for item in data['items']:
            attributes = {'tipo_arte': item['type'], **item['attributes']}
            result = browse(attributes, category='arte-y-dibujo', q='')
            exact = next(i for i in result['items'] if i['name'] == item['name'])
            assert {key: value['value'] for key, value in exact['attributes'].items()} == attributes
            for query in [item['name'], *item['aliases']]:
                found = browse(category='arte-y-dibujo', q=query)
                assert exact['id'] in {i['id'] for i in found['items']}, query
        pencils = browse({'tipo_arte': 'Lápices de colores'}, category='arte-y-dibujo', q='')
        assert values(pencils, 'numero_colores') == [(6, 1), (12, 2), (24, 1)]
        for count in (6, 24):
            result = browse({'tipo_arte': 'Lápices de colores', 'numero_colores': count}, category='arte-y-dibujo', q='')
            assert result['total'] == 1
            assert result['items'][0]['name'] == f'Lápices de colores, {count} colores'
            assert values(result, 'numero_colores') == [(6, 1), (12, 2), (24, 1)]
            assert facet(result, 'numero_colores')['data_type'] == 'number'
            assert facet(result, 'numero_colores')['unit'] == 'colores'

    for name, operation in [
        ('attribute text search, accents, literal terms and reviewed source links', searching),
        ('typed attribute filters and contextual facet counts', filtering_and_facets),
        ('catalog browse rejects malformed, mistyped and unbounded filters', invalid_filters),
        ('catalog pagination and attribute discovery beyond 200 results', pages_beyond_legacy_cap),
        ('researched color variants support search and typed contextual filters', color_count_variants),
        ('catalog migration ledger and repeated CLI migration preserve catalog', migration_ledger_and_replay),
    ]:
        ctx.check(name, operation)

"""Researched attributes are usable through public catalog and list APIs in isolated QA."""
import copy
import json
from pathlib import Path
import uuid
from urllib.parse import urlencode


def run_attribute_coverage(ctx):
    data = json.loads((Path(__file__).resolve().parents[1] / 'docs/catalog-attribute-additions-2026-11-10.json').read_text())
    categories = {c['slug']: c for c in ctx.viewer.request('GET', '/catalog/categories')}
    actual_items = {}

    def browse(category, attrs=None, query=''):
        return ctx.viewer.request('GET', '/catalog/browse?' + urlencode({
            'category': category, 'attributes': json.dumps(attrs or {}), 'q': query, 'limit': 100}))

    def metadata():
        definitions = {d['key']: d for d in data['definitions']}
        for binding in data['bindings']:
            category = categories[binding['category']]
            field = next(a for a in category['attributes'] if a['key'] == binding['key'])
            expected = definitions[binding['key']]
            assert field['data_type'] == expected['data_type'], binding
            assert field['unit'] == expected['unit'], binding
            assert not field['applies_to_types'] or set(binding['applies_to_types']) <= set(field['applies_to_types']), binding
        board = next(a for a in categories['material-didactico']['attributes'] if a['key'] == 'tipo_pauta')
        assert board['name'] == 'Tipo de pauta'
        music = next(a for a in categories['cuadernos']['attributes'] if a['key'] == 'tipo_pauta')
        assert 'Música' in music['applies_to_types']

    def variants():
        for expected in data['items']:
            attrs = {categories[expected['category']]['type_attribute']: expected['type'], **expected['attributes']}
            result = browse(expected['category'], attrs, expected['name'])
            matching = [i for i in result['items'] if i['name'] == expected['name']]
            assert len(matching) == 1, (expected['name'], result)
            item = matching[0]
            assert {key: value['value'] for key, value in item['attributes'].items()} == attrs, expected['name']
            actual_items[expected['key']] = item
            for alias in expected.get('aliases', []):
                found = browse(expected['category'], query=alias)
                assert item['id'] in {row['id'] for row in found['items']}, alias

    def facets_and_validation():
        # Boolean false is a real choice and does not match unspecified notebooks.
        no_spiral = browse('cuadernos', {'con_espiral': False})
        assert no_spiral['items']
        assert all(i['attributes']['con_espiral']['value'] is False for i in no_spiral['items'])
        assert all('con_espiral' in i['attributes'] for i in no_spiral['items'])
        scissors = browse('pegado-y-corte', {'tipo_pegado_corte': 'Tijeras'})
        tips = next(f for f in scissors['facets'] if f['key'] == 'tipo_punta')
        assert 'redonda' not in [v['value'] for v in tips['values']]
        assert 'Redonda' in [v['value'] for v in tips['values']]
        assert browse('pegado-y-corte', {'tipo_pegado_corte': 'Tijeras', 'tipo_punta': 'Redonda'})['total'] >= 2
        pack = browse('papeles', {'tipo_papel': 'Cartulina', 'numero_hojas': 18, 'numero_colores': 14})
        assert pack['items']
        assert all(i['attributes']['numero_hojas']['value'] == 18 and i['attributes']['numero_colores']['value'] == 14 for i in pack['items'])
        # Existing endpoint checks data type and type applicability for new fields too.
        for category, attrs in [
            ('cuadernos', {'tipo_cuaderno': 'Cuadriculado', 'con_margen': 'true'}),
            ('aseo', {'tipo_aseo': 'Pañuelos', 'unidades_por_envase': '90'}),
            ('musica', {'tipo_musica': 'Flauta', 'ancho_mm': 12}),
            ('escritura', {'tipo_escritura': 'Grafito', 'gramaje_g_m2': 75}),
        ]:
            ctx.admin.request('POST', '/admin/catalog', {'name': 'Invalid researched attribute',
                'category_id': categories[category]['id'], 'attributes': attrs, 'approve': True}, expected=400)

    def list_snapshots():
        # Store every new variant once: exact numeric/boolean/text values survive
        # publication and copying; quantity is independent from pack contents.
        if not actual_items:
            variants()
        content = ctx.content('Researched attributes ' + uuid.uuid4().hex[:8])
        template = copy.deepcopy(content['items'][0])
        content['items'] = []
        for expected in data['items']:
            item = actual_items[expected['key']]
            row = copy.deepcopy(template)
            row.update(id=str(uuid.uuid4()), catalog_id=item['id'], name=item['name'],
                       category=categories[expected['category']]['name'], quantity='2', unit='unidad',
                       note='', attributes=copy.deepcopy(item['attributes']))
            content['items'].append(row)
        list_id = ctx.create(ctx.owner, content)
        assert ctx.owner.request('GET', f'/lists/{list_id}/draft')['content'] == content
        ctx.publish(ctx.owner, list_id)
        assert ctx.viewer.request('GET', f'/lists/{list_id}')['content'] == content
        copied_id = ctx.viewer.request('POST', f'/lists/{list_id}/copy', {})['id']
        copied = ctx.viewer.request('GET', f'/lists/{copied_id}/draft')['content']
        assert [(r['name'], r['quantity'], r['unit'], r['attributes']) for r in copied['items']] == [
            (r['name'], r['quantity'], r['unit'], r['attributes']) for r in content['items']]

    for name, operation in [
        ('researched attribute definitions and conditional bindings are available', metadata),
        ('all researched variants and aliases are searchable with exact typed values', variants),
        ('new facets distinguish false, package counts, normalized tips and invalid types', facets_and_validation),
        ('all new attributes survive list publication and copies without changing package quantity', list_snapshots),
    ]:
        ctx.check(name, operation)

"""Any-of requirements remain one occurrence across saves, versions and imports."""
import copy
import uuid


def run_alternatives(ctx):
    def content(label='Alternative requirements'):
        value = ctx.content(label, quantity='2')
        shared = {'formato': {'name': 'Formato', 'unit': None, 'value': 'universitario'}}
        value['items'][0].update(name='Cuaderno universitario', category='Cuadernos',
                                 attributes=shared, note='Cualquiera de las opciones es válida.')
        value['items'][0]['alternatives'] = [
            {'catalog_id': str(uuid.uuid4()), 'name': f'Cuaderno universitario {kind.lower()}',
             'attributes': {**copy.deepcopy(shared),
                            'tipo_cuaderno': {'name': 'Tipo', 'unit': None, 'value': kind}}}
            for kind in ('Cuadriculado', 'Rayado')
        ]
        return value

    def snapshots_and_copies():
        # The new optional field must not create a publication on old ordinary items.
        ordinary = ctx.content('Legacy item compatibility')
        old_id = ctx.create(ctx.owner, ordinary)
        assert ctx.publish(ctx.owner, old_id)['version'] == 1
        ordinary['items'][0]['alternatives'] = []
        ctx.save(ctx.owner, old_id, ordinary)
        assert ctx.publish(ctx.owner, old_id)['version'] == 1
        assert 'alternatives' not in ctx.owner.request('GET', f'/lists/{old_id}')['content']['items'][0]

        value = content()
        value['items'][0]['alternatives'][0]['catalog_id'] = value['items'][0]['alternatives'][0]['catalog_id'].upper()
        list_id = ctx.create(ctx.owner, value)
        draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        expected = copy.deepcopy(value)
        expected['items'][0]['alternatives'][0]['catalog_id'] = expected['items'][0]['alternatives'][0]['catalog_id'].lower()
        assert draft['content'] == expected
        assert len(draft['content']['items']) == 1
        assert ctx.publish(ctx.owner, list_id)['version'] == 1
        assert ctx.publish(ctx.owner, list_id)['version'] == 1
        published = ctx.viewer.request('GET', f'/lists/{list_id}')['content']
        assert published == expected and published['items'][0]['quantity'] == '2'
        assert len(ctx.viewer.request('GET', f'/lists/{list_id}/progress')['items']) == 1
        copied = ctx.viewer.request('POST', f'/lists/{list_id}/copy', {'version': 1})['id']
        clone = ctx.viewer.request('GET', f'/lists/{copied}/draft')['content']
        assert clone['items'][0]['id'] != expected['items'][0]['id']
        assert clone['items'][0]['alternatives'] == expected['items'][0]['alternatives']
        assert clone['items'][0]['quantity'] == '2'
        changed = copy.deepcopy(expected)
        changed['items'][0]['alternatives'][0]['name'] = 'Cuaderno universitario cuadriculado grande'
        ctx.save(ctx.owner, list_id, changed)
        assert ctx.publish(ctx.owner, list_id)['version'] == 2
        assert ctx.viewer.request('GET', f'/lists/{list_id}?version=1')['content'] == expected
        assert ctx.viewer.request('GET', f'/lists/{list_id}')['content'] == changed

    def validation_and_atomic_saves():
        value = content('Validate alternative groups')
        list_id = ctx.create(ctx.owner, value)
        baseline = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        candidates = []
        for bad_options in (value['items'][0]['alternatives'][:1], value['items'][0]['alternatives'] * 7):
            changed = copy.deepcopy(value); changed['items'][0]['alternatives'] = bad_options
            candidates.append(changed)
        for key, invalid in [('name', ''), ('name', 'x' * 301), ('catalog_id', 'broken'),
                             ('attributes', []), ('attributes', {'oversized': 'x' * 16385})]:
            changed = copy.deepcopy(value); changed['items'][0]['alternatives'][0][key] = invalid
            candidates.append(changed)
        changed = copy.deepcopy(value); changed['items'][0]['catalog_id'] = str(uuid.uuid4())
        candidates.append(changed)
        changed = copy.deepcopy(value); changed['items'][0]['alternatives'][1] = copy.deepcopy(changed['items'][0]['alternatives'][0])
        changed['items'][0]['alternatives'][1]['catalog_id'] = str(uuid.uuid4())
        candidates.append(changed)
        changed = copy.deepcopy(value); changed['items'][0]['attributes']['numero_hojas'] = {'value': 100}
        candidates.append(changed)
        for invalid in candidates:
            ctx.owner.request('PUT', f'/lists/{list_id}/draft',
                              {'revision': baseline['revision'], 'content': invalid}, expected=400)
        for field in ('alternatives', 'quantity', 'id'):
            malformed = copy.deepcopy(value)
            malformed['items'][0]['alternatives'][0][field] = [] if field == 'alternatives' else 'unsupported'
            ctx.owner.request('PUT', f'/lists/{list_id}/draft',
                              {'revision': baseline['revision'], 'content': malformed}, expected=422)
        after = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        assert after['revision'] == baseline['revision'] and after['content'] == baseline['content']
        # A group has the same quantity validation as a specific item.
        invalid_quantity = copy.deepcopy(value); invalid_quantity['items'][0]['quantity'] = '1.5'
        ctx.save(ctx.owner, list_id, invalid_quantity)
        draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        ctx.owner.request('POST', f'/lists/{list_id}/publish',
                          {'revision': draft['revision'], 'current_version': 0, 'request_id': str(uuid.uuid4())}, expected=400)

    def progress_transitions():
        first = content('Alternative checklist transitions')
        item_id = first['items'][0]['id']
        list_id = ctx.create(ctx.owner, first); ctx.publish(ctx.owner, list_id)
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress',
                           {'version': 1, 'item_id': item_id, 'checked': True, 'review': False})
        ordered = copy.deepcopy(first)
        ordered['items'][0]['alternatives'].reverse()
        ordered['items'][0]['alternatives'][0]['catalog_id'] = str(uuid.uuid4())
        ordered['items'][0]['category'] = 'Organización'
        ctx.save(ctx.owner, list_id, ordered); assert ctx.publish(ctx.owner, list_id)['version'] == 2
        progress = ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        assert progress['items'][item_id] == {'checked': True, 'review': False}
        assert item_id not in progress['changes']['changed']
        modified = copy.deepcopy(ordered)
        modified['items'][0]['alternatives'][0]['attributes']['numero_hojas'] = {'name': 'Hojas', 'value': 80}
        ctx.save(ctx.owner, list_id, modified); assert ctx.publish(ctx.owner, list_id)['version'] == 3
        ctx.save(ctx.owner, list_id, ordered); assert ctx.publish(ctx.owner, list_id)['version'] == 4
        # Returning to the prior wording cannot conceal an unviewed intervening change.
        progress = ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        assert progress['items'][item_id] == {'checked': False, 'review': True}
        assert item_id in progress['changes']['changed']
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress',
                           {'version': 4, 'item_id': item_id, 'checked': True, 'review': False})
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress',
                           {'version': 1, 'item_id': item_id, 'checked': False, 'review': False})
        assert ctx.viewer.request('GET', f'/lists/{list_id}/progress?version=4')['items'][item_id]['checked']
        expanded = copy.deepcopy(ordered)
        third = copy.deepcopy(expanded['items'][0]['alternatives'][0]); third['name'] = 'Cuaderno universitario liso'
        expanded['items'][0]['alternatives'].append(third)
        ctx.save(ctx.owner, list_id, expanded); ctx.publish(ctx.owner, list_id)
        assert ctx.viewer.request('GET', f'/lists/{list_id}/progress')['items'][item_id] == {'checked': False, 'review': True}

    def templates_and_imports():
        value = content('Alternative template')
        value['items'][0]['alternatives'][0]['catalog_id'] = value['items'][0]['alternatives'][0]['catalog_id'].upper()
        template_id = ctx.admin.request('POST', '/admin/templates', {
            'name': 'Alternativas ' + uuid.uuid4().hex[:8], 'grade': 'Básica', 'content': value})['id']
        try:
            template = next(t for t in ctx.viewer.request('GET', '/templates') if t['id'] == template_id)
            assert template['content']['items'][0]['alternatives'][0]['catalog_id'] == value['items'][0]['alternatives'][0]['catalog_id'].lower()
            copied = ctx.owner.request('POST', f'/templates/{template_id}/copy')['id']
            draft = ctx.owner.request('GET', f'/lists/{copied}/draft')
            assert draft['content']['items'][0]['id'] != value['items'][0]['id']
            assert draft['content']['items'][0]['alternatives'] == template['content']['items'][0]['alternatives']
        finally:
            ctx.admin.request('DELETE', f'/admin/templates/{template_id}')
        empty = ctx.content('Alternative import'); empty['items'] = []
        list_id = ctx.create(ctx.owner, empty)
        uploaded = ctx.owner.upload(f'/lists/{list_id}/imports', 'alternatives.csv', b'Articulo,Cantidad\nCuaderno,2\n')
        incoming = copy.deepcopy(value['items'][0])
        incoming.update(share_with_catalog=True, category_id=next(c['id'] for c in ctx.viewer.request('GET', '/catalog/categories') if c['slug'] == 'cuadernos'))
        before_count = ctx.sql('SELECT count(*) FROM catalog.items')
        ctx.owner.request('POST', f'/lists/{list_id}/imports/{uploaded["id"]}/confirm', {
            'revision': uploaded['revision'], 'request_id': str(uuid.uuid4()), 'items': [incoming]}, expected=400)
        assert ctx.owner.request('GET', f'/lists/{list_id}/draft')['content']['items'] == []
        assert ctx.sql('SELECT count(*) FROM catalog.items') == before_count
        incoming['share_with_catalog'] = False
        payload = {'revision': uploaded['revision'], 'request_id': str(uuid.uuid4()), 'items': [incoming]}
        confirmed = ctx.owner.request('POST', f'/lists/{list_id}/imports/{uploaded["id"]}/confirm', payload)
        assert ctx.owner.request('POST', f'/lists/{list_id}/imports/{uploaded["id"]}/confirm', payload) == confirmed
        imported = ctx.owner.request('GET', f'/lists/{list_id}/draft')['content']['items']
        assert len(imported) == 1 and imported[0]['id'] != incoming['id']
        assert imported[0]['alternatives'] == template['content']['items'][0]['alternatives']
        assert imported[0]['quantity'] == '2' and imported[0]['catalog_id'] == ''

    for name, operation in [
        ('alternative requirement snapshots, copies and legacy no-op compatibility', snapshots_and_copies),
        ('alternative limits, distinct choices, shared attributes and atomic rejection', validation_and_atomic_saves),
        ('any-option checklist progress, reordering and skipped version changes', progress_transitions),
        ('alternative template copies and atomic idempotent import confirmation', templates_and_imports),
    ]:
        ctx.check(name, operation)

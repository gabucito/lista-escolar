"""Category-owned types and conditional attribute acceptance in isolated PostgreSQL."""
import json
import uuid
from urllib.parse import urlencode


def run_category_attributes(ctx):
    viewer, admin = ctx.viewer, ctx.admin
    tag = uuid.uuid4().hex[:10]

    def categories():
        return viewer.request('GET', '/catalog/categories')

    def category(slug):
        return next(c for c in categories() if c['slug'] == slug)

    def browse(slug, attributes=None, q=''):
        return viewer.request('GET', '/catalog/browse?' + urlencode({
            'category': slug, 'attributes': json.dumps(attributes or {}), 'q': q}))

    def definition(result, key):
        return next(f for f in result['facets'] if f['key'] == key)

    def row(identity):
        return next(i for i in admin.request('GET', '/admin/catalog?' + urlencode({'q': tag})) if i['id'] == identity)

    def metadata_and_counts():
        notebooks = category('cuadernos')
        assert notebooks['type_attribute'] == 'tipo_cuaderno'
        assert notebooks['attributes'][0]['key'] == 'tipo_cuaderno'
        grid = next(a for a in notebooks['attributes'] if a['key'] == 'cuadricula_mm')
        assert grid['applies_to_types'] == ['Cuadriculado']
        assert {'Cuadriculado', 'Rayado', 'Composición', 'Caligrafía', 'Croquis', 'Liso'}.issubset(notebooks['attributes'][0]['options'])
        filtered = browse('cuadernos', {'tipo_cuaderno': 'Cuadriculado', 'formato': 'universitario'})
        assert filtered['total'] == 6
        assert filtered['facets'][0]['key'] == 'tipo_cuaderno'
        type_counts = {v['value']: v['count'] for v in definition(filtered, 'tipo_cuaderno')['values']}
        assert type_counts['Caligrafía'] == 0 and type_counts['Rayado'] == 2 and type_counts['Cuadriculado'] == 6
        ruled = browse('cuadernos', {'tipo_cuaderno': 'Rayado', 'formato': 'universitario'})
        assert ruled['total'] == 2 and not any(f['key'] in ('cuadricula_mm', 'orientacion') for f in ruled['facets'])
        ruler = browse('geometria', {'tipo_geometria': 'Regla'})
        assert ruler['total'] == 3
        assert {item['attributes']['largo_cm']['value'] for item in ruler['items']} == {15, 20, 30}
        assert not any(f['key'] in ('numero_hojas','formato','tipo_cuaderno') for f in ruler['facets'])
        empty = browse('cuadernos', {'tipo_cuaderno': 'Cuadriculado'}, q='missing-' + tag)
        assert empty['total'] == 0 and definition(empty,'tipo_cuaderno')['values']

    def type_creation_and_validation():
        notebooks, writing, geometry = category('cuadernos'), category('escritura'), category('geometria')
        attrs = {'tipo_cuaderno':'Cuadriculado','formato':'universitario','numero_hojas':100,'cuadricula_mm':7}
        item = admin.request('POST','/admin/catalog',{'name':'Nuevo cuaderno '+tag,'category_id':notebooks['id'],'attributes':attrs,'approve':True})['id']
        actual = row(item)
        assert actual['attributes']['tipo_cuaderno']['value'] == 'Cuadriculado'
        assert actual['attributes']['numero_hojas']['value'] == 100
        for category_id, values in [
            (notebooks['id'], {'tipo_cuaderno':'Rayado','cuadricula_mm':7}),
            (notebooks['id'], {'tipo_cuaderno':'Tipo inventado'}),
            (geometry['id'], {'tipo_cuaderno':'Cuadriculado'}),
            (geometry['id'], {'tipo_geometria':'Compás','largo_cm':30}),
            (writing['id'], {'numero_hojas':80}),
        ]:
            admin.request('POST','/admin/catalog',{'name':'No guardar '+tag,'category_id':category_id,'attributes':values,'approve':True},expected=400)
        assert not admin.request('GET','/admin/catalog?' + urlencode({'q':'No guardar '+tag}))
        pencil = viewer.request('POST','/catalog',{'name':'Grafito sin goma '+tag,'category_id':writing['id'],
            'attributes':{'tipo_escritura':'Grafito','incluye_goma':False,'dureza_grafito':'HB'}})['id']
        assert row(pencil)['attributes']['incluye_goma']['value'] is False
        admin.request('PATCH',f'/admin/catalog/{item}',{'action':'update','attributes':{'tipo_cuaderno':'Rayado','formato':'universitario','numero_hojas':100}})
        assert row(item)['attributes']['tipo_cuaderno']['value'] == 'Rayado'
        assert 'cuadricula_mm' not in row(item)['attributes']
        admin.request('PATCH',f'/admin/catalog/{item}',{'action':'update','subcategory_id':None})
        assert row(item)['subcategory_id'] is None
        admin.request('PATCH',f'/admin/catalog/{item}',{'action':'update','attributes':{'tipo_cuaderno':'Rayado','formato':'universitario','numero_hojas':100}})
        assert row(item)['subcategory_id'] is None

    def administration_and_preservation():
        cid = admin.request('POST','/admin/categories',{'name':'Familia '+tag,'slug':'familia-'+tag})['id']
        cat = category('familia-'+tag); key=cat['type_attribute']
        assert key and cat['attributes'][0]['options'] == []
        path=f'/admin/categories/{cid}'
        viewer.request('POST',path+'/types',{'action':'add','value':'Grande'},expected=401)
        for value in ('Grande','Chico'):
            admin.request('POST',path+'/types',{'action':'add','value':value})
        bindings = [
            {'key':key,'options':['Grande','Chico']},
            {'key':'numero_hojas','applies_to_types':['Grande'],'sort_order':10},
        ]
        admin.request('PATCH',path+'/attributes',{'attributes':bindings})
        identity=admin.request('POST','/admin/catalog',{'name':'Cuidado '+tag,'category_id':cid,
            'attributes':{key:'Grande','numero_hojas':120},'approve':True})['id']
        before=row(identity)
        content=ctx.content(school='Snapshot '+tag)
        content['items'][0].update(catalog_id=identity,category=cat['name'],attributes=before['attributes'])
        list_id=ctx.create(ctx.owner,content);ctx.publish(ctx.owner,list_id)
        canonical=ctx.sql(f"SELECT canonical_key FROM catalog.items WHERE id='{identity}'")
        admin.request('POST',path+'/types',{'action':'remove','value':'Grande'},expected=409)
        admin.request('POST',path+'/types',{'action':'rename','value':'Grande','new_value':'Mayor'})
        assert row(identity)['attributes'][key]['value']=='Mayor'
        assert ctx.sql(f"SELECT canonical_key FROM catalog.items WHERE id='{identity}'")==canonical
        assert ctx.owner.request('GET',f'/lists/{list_id}')['content']==content
        updated=category('familia-'+tag)
        assert next(a for a in updated['attributes'] if a['key']=='numero_hojas')['applies_to_types']==['Mayor']
        admin.request('POST',path+'/types',{'action':'rename','value':'Mayor','new_value':'Chico'},expected=409)
        admin.request('PATCH',path+'/attributes',{'attributes':[{'key':'numero_hojas'}]},expected=400)
        admin.request('PATCH',path+'/attributes',{'attributes':[{'key':key,'options':['Chico']}]},expected=409)
        admin.request('PATCH',path+'/attributes',{'attributes':[{'key':key,'options':['Mayor','Chico']},{'key':'numero_hojas','applies_to_types':['Desconocido']}]},expected=400)
        # Removing a form binding must not erase existing curated item values.
        admin.request('PATCH',path+'/attributes',{'attributes':[{'key':key,'options':['Mayor','Chico']}]})
        admin.request('PATCH',f'/admin/catalog/{identity}',{'action':'update','attributes':{key:'Mayor','numero_hojas':120}})
        assert row(identity)['attributes']['numero_hojas']['value']==120
        admin.request('PATCH',f'/admin/catalog/{identity}',{'action':'update','attributes':{key:'Mayor','numero_hojas':121}},expected=400)
        admin.request('POST',path+'/types',{'action':'remove','value':'Chico'})
        assert category('familia-'+tag)['attributes'][0]['options']==['Mayor']
        assert ctx.owner.request('GET',f'/lists/{list_id}')['content']==content

    for label, operation in [
        ('category attribute metadata, zero-count type choices and conditional facets',metadata_and_counts),
        ('type attributes replace classification input and reject incompatible values',type_creation_and_validation),
        ('type administration, category bindings and published snapshots stay consistent',administration_and_preservation),
    ]:
        ctx.check(label,operation)

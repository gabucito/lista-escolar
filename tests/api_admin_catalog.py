"""Private catalog paging and moderation across more than 200 isolated fixtures."""
import uuid
from urllib.parse import urlencode


def run_admin_catalog(ctx):
    tag = uuid.uuid4().hex[:10]
    categories = ctx.admin.request('GET', '/catalog/categories')
    writing = next(c for c in categories if c['slug'] == 'escritura')
    geometry = next(c for c in categories if c['slug'] == 'geometria')

    def page(**parameters):
        return ctx.admin.request('GET', '/admin/catalog/browse?' + urlencode({'q': tag, **parameters}))

    def pagination():
        ctx.sql(f"""INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
            SELECT {writing['id']},'Aprobado {tag} '||lpad(n::text,3,'0'),'qa-admin-page-{tag}-'||n,'approved'
            FROM generate_series(1,205) n;
            INSERT INTO catalog.items(category_id,name,canonical_key,review_status)
            VALUES ({writing['id']},'ZZ pendiente {tag}','qa-admin-page-{tag}-pending','pending'),
                   ({geometry['id']},'Otro aprobado {tag}','qa-admin-page-{tag}-geometry','approved'),
                   ({writing['id']},'Rechazado {tag}','qa-admin-page-{tag}-rejected','rejected');""")
        try:
            first = page(limit=100)
            second = page(limit=100, offset=100)
            third = page(limit=100, offset=200)
            assert first['total'] == second['total'] == third['total'] == 208
            assert [len(p['items']) for p in (first, second, third)] == [100,100,8]
            assert len({i['id'] for p in (first,second,third) for i in p['items']}) == 208
            assert first['items'][0]['review_status'] == 'pending'
            assert first['items'][0]['name'] == f'ZZ pendiente {tag}'
            pending = page(status='pending', category='escritura')
            assert pending['total'] == 1 and len(pending['items']) == 1
            identity = pending['items'][0]['id']
            ctx.admin.request('PATCH',f'/admin/catalog/{identity}',{'action':'approve'})
            assert page(status='pending')['total'] == 0
            assert page(status='approved',category='escritura')['total'] == 206
            assert page(status='approved',category='geometria')['total'] == 1
            assert page(status='rejected')['total'] == 1
            assert page(offset=400)['items'] == []
            # Search remains accent-insensitive and literal; rejected items stay private.
            assert page(q=f'rechazado {tag}')['total'] == 1
            assert ctx.viewer.request('GET','/catalog/browse?'+urlencode({'q':f'rechazado {tag}'}))['total'] == 0
            assert page(q=tag+' %')['total'] == 0
            legacy = ctx.admin.request('GET','/admin/catalog?'+urlencode({'q':tag}))
            assert isinstance(legacy,list) and len(legacy) == 200
            ctx.viewer.request('GET','/admin/catalog/browse',expected=401)
            for invalid in ({'status':'unknown'},{'limit':0},{'limit':101},{'offset':-1},{'offset':1000001},{'q':'x'*501},{'category':'x'*101}):
                ctx.admin.request('GET','/admin/catalog/browse?'+urlencode(invalid),expected=400)
        finally:
            ctx.sql(f"DELETE FROM catalog.items WHERE canonical_key LIKE 'qa-admin-page-{tag}-%'")
    ctx.check('administrator paging, status/category filtering and moderation beyond 200 items',pagination)

"""Community/admin acceptance checks; called only by the isolated API harness."""

import struct
import uuid
import zlib
from urllib.parse import quote


def run_community(ctx):
    tag = uuid.uuid4().hex[:10]
    owner, editor, viewer, outsider = (ctx.client() for _ in range(4))
    for client, label in zip((owner, editor, viewer, outsider), ("owner", "editor", "viewer", "outsider")):
        client.register(f"community-{label}-{tag}")
    admin = ctx.admin

    def new_list(visibility="public", content=None, author=owner):
        identity = ctx.create(author, content or ctx.content(school=f"QA comunidad {tag}"), visibility)
        ctx.publish(author, identity)
        return identity

    def invite(identity, recipient, role="viewer", sender=owner):
        invitation = sender.request("POST", f"/lists/{identity}/access", {"email": recipient.user["email"], "role": role})
        recipient.request("POST", f"/invitations/{invitation['invitation_token']}/accept")
        return invitation

    def change(identity, author=owner):
        draft = author.request("GET", f"/lists/{identity}/draft")
        draft["content"]["instructions"] += " Nueva instrucción."
        author.request("PUT", f"/lists/{identity}/draft", {"content": draft["content"], "revision": draft["revision"]})
        return ctx.publish(author, identity)

    def catalog_and_matches():
        categories = viewer.request("GET", "/catalog/categories")
        assert categories and categories[0]["subcategories"]
        category = categories[0]["id"]
        source_name, target_name = f"Útil propuesto {tag}", f"Útil aprobado {tag}"
        source = owner.request("POST", "/catalog", {"name": source_name, "category_id": category, "attributes": {"numero_hojas": 100}})
        target = owner.request("POST", "/catalog", {"name": target_name, "category_id": category})
        assert source["review_status"] == "pending"
        assert any(row["id"] == source["id"] and row["review_status"] == "pending" for row in viewer.request("GET", f"/catalog?q={tag}"))
        owner.request("POST", "/catalog", {"name": "Incorrecto", "category_id": category, "attributes": {"numero_hojas": "100"}}, expected=400)
        owner.request("POST", "/catalog", {"name": "Incorrecto", "category_id": -1}, expected=400)
        viewer.request("GET", "/admin/catalog", expected=401)
        admin.request("PATCH", f"/admin/catalog/{target['id']}", {"action": "approve"})
        product = str(uuid.uuid4())
        ctx.sql(f"INSERT INTO store_snapshot.products(id,slug,name,unit_label,price_clp,visible_in_store,source_updated_at) VALUES('{product}','qa-{tag}','Producto QA {tag}','unidad',100,true,now())")
        variant = str(uuid.uuid4())
        ctx.sql(f"INSERT INTO store_snapshot.product_variants(id,product_id,name,sku,attributes) VALUES('{variant}','{product}','Variante QA','QA-{tag}','{{\"color\":\"azul\",\"medida\":\"7 mm\"}}')")
        product_row = next(row for row in admin.request("GET", f"/admin/products?q={tag}") if row["id"] == product)
        assert product_row["variants"][0]["attributes"] == {"color": "azul", "medida": "7 mm"}
        admin.request("POST", "/admin/matches", {"item_id": source["id"], "source_product_id": product})
        content = ctx.content(school=f"QA instantánea {tag}")
        content["items"][0].update(name=source_name, catalog_id=source["id"])
        identity = new_list(content=content)
        admin.request("PATCH", f"/admin/catalog/{source['id']}", {"action": "merge", "target_id": target["id"]})
        assert owner.request("GET", f"/lists/{identity}")["content"] == content
        found = viewer.request("GET", f"/catalog?q={quote(source_name)}")
        assert any(row["id"] == target["id"] for row in found)
        assert all(row["id"] != source["id"] for row in found)
        matches = admin.request("GET", "/admin/matches")
        assert any(row["item_id"] == target["id"] and row["source_product_id"] == product and row["review_status"] == "pending" for row in matches)
        admin.request("PATCH", "/admin/matches", {"item_id": target["id"], "source_product_id": product, "review_status": "approved"})
        admin.request("DELETE", "/admin/matches", {"item_id": target["id"], "source_product_id": product})
        admin.request("PATCH", f"/admin/catalog/{source['id']}", {"action": "reject"})
        assert any(row["id"] == source["id"] and row["review_status"] == "rejected" for row in admin.request("GET", f"/admin/catalog?q={tag}"))

    def admin_catalog_corrections():
        categories = viewer.request("GET", "/catalog/categories")
        first, second = categories[:2]
        subcategory = first["subcategories"][0]["id"]
        alias = f"Alternativa directa {tag}"
        request = {"name": f"Genérico administrado {tag}", "category_id": first["id"], "subcategory_id": subcategory,
                   "attributes": {"numero_hojas": 100, "incluye_goma": False}, "aliases": [alias, "  " + alias.upper() + "  "], "approve": True}
        viewer.request("POST", "/admin/catalog", request, expected=401)
        viewer.request("GET", "/admin/attributes", expected=401)
        assert any(row["key"] == "numero_hojas" and row["data_type"] == "number" for row in admin.request("GET", "/admin/attributes"))
        admin.request("POST", "/admin/catalog", {**request, "approve": False}, expected=400)
        item = admin.request("POST", "/admin/catalog", request)
        assert item["review_status"] == "approved"
        identity = item["id"]
        ctx.sql(f"INSERT INTO catalog.items(category_id,name,canonical_key,review_status) SELECT {first['id']},'AAA límite {tag} '||n,'qa-limit-{tag}-'||n,'approved' FROM generate_series(1,200) n")
        try:
            initial = viewer.request("GET", "/catalog")
            assert len(initial) == 200 and all(row["id"] != identity for row in initial)
            assert any(row["id"] == identity for row in viewer.request("GET", "/catalog?q=" + quote(request["name"])))
        finally:
            ctx.sql(f"DELETE FROM catalog.items WHERE canonical_key LIKE 'qa-limit-{tag}-%'")
        def stored():
            return next(row for row in admin.request("GET", f"/admin/catalog?q={tag}") if row["id"] == identity)
        original = stored()
        assert original["aliases"] == [alias.lower()] and original["attributes"]["incluye_goma"]["value"] is False
        assert any(row["id"] == identity for row in viewer.request("GET", "/catalog?q=" + quote(alias)))
        content = ctx.content(school=f"QA catálogo estable {tag}")
        content["items"][0].update(name=request["name"], catalog_id=identity, category=first["name"], attributes=original["attributes"])
        published = new_list(content=content)
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "name": "Cambio inválido", "category_id": second["id"],
                      "subcategory_id": None, "attributes": {"numero_hojas": "80"}, "aliases": []}, expected=400)
        assert stored() == original
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "category_id": second["id"]}, expected=400)
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "attributes": {"atributo_inexistente": 2}}, expected=400)
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "aliases": [" "]}, expected=400)
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "aliases": [str(index) for index in range(31)]}, expected=400)
        assert stored() == original
        next_alias = f"Nombre corregido alternativo {tag}"
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "name": f"Genérico corregido {tag}",
                      "category_id": second["id"], "subcategory_id": None, "attributes": {"numero_hojas": 80, "incluye_goma": True}, "aliases": [next_alias]})
        revised = stored()
        assert revised["review_status"] == "approved" and revised["category_id"] == second["id"] and revised["subcategory_id"] is None
        assert revised["attributes"]["numero_hojas"]["value"] == 80 and revised["attributes"]["incluye_goma"]["value"] is True
        assert revised["aliases"] == [next_alias.lower()]
        assert all(row["id"] != identity for row in viewer.request("GET", "/catalog?q=" + quote(alias)))
        assert owner.request("GET", f"/lists/{published}")["content"] == content
        admin.request("PATCH", f"/admin/catalog/{identity}", {"action": "update", "attributes": {}, "aliases": []})
        assert stored()["attributes"] == {} and stored()["aliases"] == []
        assert all(row["id"] != identity for row in viewer.request("GET", "/catalog?q=" + quote(next_alias)))
        assert owner.request("GET", f"/lists/{published}")["content"] == content
        assert ctx.sql(f"SELECT count(*) FROM app.audit WHERE action='catalog_created' AND entity_id='{identity}'") == "1"
        failed_name = f"Invalid creation {tag}"
        admin.request("POST", "/admin/catalog", {**request, "name": failed_name, "attributes": {"numero_hojas": "80"}}, expected=400)
        assert admin.request("GET", "/admin/catalog?q=" + quote(failed_name)) == []

    def imported_name_matching():
        category = viewer.request("GET", "/catalog/categories")[0]["id"]
        name = f"Cuaderno experimental {uuid.uuid4().hex}"
        item = owner.request("POST", "/catalog", {"name": name, "category_id": category})["id"]
        pending = owner.request("POST", "/catalog/match", {"names": [name]})["rows"][0]["candidates"]
        assert pending[0]["id"] == item and pending[0]["review_status"] == "pending"
        admin.request("PATCH", f"/admin/catalog/{item}", {"action": "approve"})
        alias = f"Alternativo{uuid.uuid4().hex}"
        source_name = f"MarcaEspecial{uuid.uuid4().hex}"
        product = str(uuid.uuid4())
        ctx.sql(f"INSERT INTO catalog.item_aliases(item_id,alias) VALUES('{item}','{alias}')")
        ctx.sql(f"INSERT INTO store_snapshot.products(id,slug,name,unit_label,price_clp,visible_in_store,source_updated_at) VALUES('{product}','{product}','{source_name}','unidad',100,true,now())")
        ctx.sql(f"INSERT INTO catalog.store_product_matches(item_id,source_product_id,review_status,match_method) VALUES('{item}','{product}','pending','qa')")
        rows = owner.request("POST", "/catalog/match", {"names": [alias, source_name, ""]})["rows"]
        assert rows[0]["candidates"][0]["id"] == item
        assert rows[1]["candidates"] == [] and rows[2]["candidates"] == []
        admin.request("PATCH", "/admin/matches", {"item_id": item, "source_product_id": product, "review_status": "approved"})
        confirmed = owner.request("POST", "/catalog/match", {"names": [source_name]})["rows"][0]["candidates"]
        assert confirmed[0]["id"] == item and confirmed[0]["name"] == name and len(confirmed) <= 8
        admin.request("PATCH", "/admin/matches", {"item_id": item, "source_product_id": product, "review_status": "rejected"})
        assert owner.request("POST", "/catalog/match", {"names": [source_name]})["rows"][0]["candidates"] == []
        assert owner.request("POST", "/catalog/match", {"names": []})["rows"] == []
        owner.request("POST", "/catalog/match", {"names": ["A"] * 1001}, expected=400)
        owner.request("POST", "/catalog/match", {"names": ["A" * 301]}, expected=400)

    def taxonomy():
        category = admin.request("POST", "/admin/categories", {"name": "Categoría QA", "slug": f"qa-{tag}"})["id"]
        subcategory = admin.request("POST", "/admin/subcategories", {"name": "Subcategoría QA", "slug": "primera", "category_id": category})["id"]
        admin.request("DELETE", f"/admin/categories/{category}", expected=409)
        admin.request("PATCH", f"/admin/categories/{category}", {"name": "Categoría corregida", "slug": f"qa-editada-{tag}"})
        admin.request("PATCH", f"/admin/subcategories/{subcategory}", {"name": "Subcategoría corregida", "slug": "segunda", "category_id": category})
        row = next(row for row in viewer.request("GET", "/catalog/categories") if row["id"] == category)
        assert row["subcategories"][0]["slug"] == "segunda"
        admin.request("POST", "/admin/categories", {"name": "Inválida", "slug": "A--B"}, expected=400)
        admin.request("DELETE", f"/admin/subcategories/{subcategory}")
        admin.request("DELETE", f"/admin/categories/{category}")

    def feedback_and_archiving():
        identity = new_list()
        assert viewer.request("POST", f"/lists/{identity}/vote", {"version": 1, "voted": True})["votes"] == 1
        assert viewer.request("POST", f"/lists/{identity}/vote", {"version": 1, "voted": True})["votes"] == 1
        comment = viewer.request("POST", f"/lists/{identity}/comments", {"version": 1, "body": "Comentario de prueba"})["id"]
        owner.request("PATCH", f"/lists/{identity}/settings", {"comments_enabled": False})
        assert viewer.request("GET", f"/lists/{identity}/comments?version=1")[0]["body"] == "Comentario de prueba"
        viewer.request("POST", f"/lists/{identity}/comments", {"version": 1, "body": "Bloqueado"}, expected=403)
        viewer.request("DELETE", f"/comments/{comment}")
        deleted = owner.request("GET", f"/lists/{identity}/comments?version=1")[0]
        assert deleted["deleted"] and deleted["body"] == "Comentario eliminado" and deleted["author"] is None
        change(identity)
        assert viewer.request("GET", f"/lists/{identity}")["votes"] == 0
        assert viewer.request("GET", f"/lists/{identity}?version=1")["votes"] == 1
        owner.request("POST", f"/lists/{identity}/archive", {"archived": True})
        viewer.request("POST", f"/lists/{identity}/vote", {"version": 2, "voted": True}, expected=409)
        viewer.request("POST", f"/lists/{identity}/follow", {"following": True}, expected=409)
        assert viewer.request("POST", f"/lists/{identity}/vote", {"version": 1, "voted": False})["votes"] == 0
        report = viewer.request("POST", f"/lists/{identity}/reports", {"version": 2, "kind": "content", "reason": "Lista archivada reportable"})["id"]
        admin.request("POST", f"/admin/reports/{report}", {"action": "dismiss", "note": "Revisión completada"})
        case = next(row for row in admin.request("GET", "/admin/reports") if row["id"] == report)
        assert case["status"] == "closed" and case["evidence"] == {} and case["reason"] == ""

    def following_and_revocation():
        identity = new_list()
        viewer.request("POST", f"/lists/{identity}/follow", {"following": True})
        change(identity)
        assert ctx.sql(f"SELECT count(*) FROM app.notifications WHERE list_id='{identity}' AND user_id='{viewer.user['id']}' AND status='local'").strip() == "1"
        owner.request("PATCH", f"/lists/{identity}/settings", {"visibility": "private"})
        viewer.request("GET", f"/lists/{identity}", expected=404)
        assert ctx.sql(f"SELECT count(*) FROM app.follows WHERE list_id='{identity}'").strip() == "0"
        assert ctx.sql(f"SELECT count(*) FROM app.notifications WHERE list_id='{identity}' AND status='canceled'").strip() == "1"
        invite(identity, viewer)
        assert not viewer.request("GET", f"/lists/{identity}")["following"]
        viewer.request("POST", f"/lists/{identity}/follow", {"following": True})
        stale = owner.request("POST", f"/lists/{identity}/access", {"email": viewer.user["email"], "role": "editor"})
        owner.request("DELETE", f"/lists/{identity}/access/{viewer.user['id']}")
        viewer.request("POST", f"/invitations/{stale['invitation_token']}/accept", expected=404)
        viewer.request("POST", f"/lists/{identity}/follow", {"following": True}, expected=404)
        assert ctx.sql(f"SELECT count(*) FROM app.follows WHERE list_id='{identity}'").strip() == "0"

    def collaboration():
        identity = new_list("private")
        invitation = owner.request("POST", f"/lists/{identity}/access", {"email": viewer.user["email"], "role": "viewer"})
        outsider.request("POST", f"/invitations/{invitation['invitation_token']}/accept", expected=400)
        viewer.request("POST", f"/invitations/{invitation['invitation_token']}/accept")
        viewer.request("GET", f"/lists/{identity}/draft", expected=404)
        expired = owner.request("POST", f"/lists/{identity}/access", {"email": editor.user["email"], "role": "editor"})
        ctx.sql(f"UPDATE app.invitations SET expires_at=now()-interval '1 second' WHERE id='{expired['id']}'")
        editor.request("POST", f"/invitations/{expired['invitation_token']}/accept", expected=400)
        owner.request("DELETE", f"/lists/{identity}/invitations/{expired['id']}")
        access = owner.request("GET", f"/lists/{identity}/access")
        token = access["request_link"].rsplit("/", 1)[-1]
        outsider.request("POST", f"/access-requests/{token}")
        outsider.request("GET", f"/lists/{identity}", expected=404)
        request = next(row for row in owner.request("GET", f"/lists/{identity}/access")["requests"] if row["email"] == outsider.user["email"])
        owner.request("POST", f"/lists/{identity}/requests/{request['id']}", {"approve": True, "role": "editor"})
        outsider.request("GET", f"/lists/{identity}/draft")
        outsider.request("DELETE", f"/lists/{identity}/access/{owner.user['id']}", expected=403)
        outsider.request("POST", f"/lists/{identity}/archive", {"archived": True}, expected=403)
        viewer.request("POST", f"/lists/{identity}/vote", {"version": 1, "voted": True})

    def ownership_transfer():
        identity = new_list("private")
        invite(identity, editor, "editor")
        offer = owner.request("POST", f"/lists/{identity}/transfer", {"recipient_id": editor.user["id"]})["id"]
        assert any(row["id"] == offer for row in editor.request("GET", "/transfers"))
        outsider.request("POST", f"/transfers/{offer}/accept", expected=404)
        owner.request("DELETE", f"/transfers/{offer}")
        editor.request("POST", f"/transfers/{offer}/accept", expected=409)
        offer = owner.request("POST", f"/lists/{identity}/transfer", {"recipient_id": editor.user["id"]})["id"]
        editor.request("POST", f"/transfers/{offer}/accept")
        editor.request("POST", f"/transfers/{offer}/accept")
        detail = editor.request("GET", f"/lists/{identity}")
        assert detail["owner_id"] == editor.user["id"] and detail["role"] == "owner"
        assert owner.request("GET", f"/lists/{identity}/draft")["role"] == "editor"
        owner.request("POST", f"/lists/{identity}/archive", {"archived": True}, expected=403)
        editor.request("POST", f"/lists/{identity}/archive", {"archived": True})

    def scoped_moderation():
        identity = new_list("private")
        invite(identity, viewer)
        case = viewer.request("POST", f"/lists/{identity}/reports", {"version": 1, "kind": "content", "reason": "Revisar esta versión"})["id"]
        admin.request("GET", f"/lists/{identity}", expected=404)
        admin.request("GET", f"/lists/{identity}/draft", expected=401)
        row = next(row for row in admin.request("GET", "/admin/reports") if row["id"] == case)
        assert row["evidence"]["content"]["school"] == f"QA comunidad {tag}"
        assert int(ctx.sql(f"SELECT count(*) FROM app.audit WHERE action='report_inspected' AND entity_id='{case}'").strip()) > 0
        admin.request("POST", f"/admin/reports/{case}", {"action": "hide", "note": "Revisión en curso"})
        viewer.request("GET", f"/lists/{identity}?version=1", expected=404)
        draft = owner.request("GET", f"/lists/{identity}/draft")
        owner.request("POST", f"/lists/{identity}/publish", {"revision": draft["revision"], "current_version": 1, "request_id": str(uuid.uuid4())}, expected=403)
        admin.request("POST", f"/admin/reports/{case}", {"action": "restore", "note": "Contenido revisado"})
        viewer.request("GET", f"/lists/{identity}")
        comment = viewer.request("POST", f"/lists/{identity}/comments", {"version": 1, "body": "Comentario para moderación"})["id"]
        report = owner.request("POST", f"/lists/{identity}/reports", {"version": 1, "comment_id": comment, "kind": "content", "reason": "Revisar comentario"})["id"]
        admin.request("POST", f"/admin/reports/{report}", {"action": "hide", "note": "Ocultar durante revisión"})
        assert viewer.request("GET", f"/lists/{identity}/comments")[0]["deleted"]
        admin.request("POST", f"/admin/reports/{report}", {"action": "restore", "note": "Comentario aceptado"})
        assert not viewer.request("GET", f"/lists/{identity}/comments")[0]["deleted"]
        holds = [viewer.request("POST", f"/lists/{identity}/reports", {"version": 1, "kind": "content", "reason": "Revisión adicional"})["id"] for _ in range(2)]
        for case_id in holds:
            admin.request("POST", f"/admin/reports/{case_id}", {"action": "hide", "note": "Ocultar durante revisión"})
        admin.request("POST", f"/admin/reports/{holds[0]}", {"action": "restore", "note": "Otro caso sigue abierto"}, expected=409)
        admin.request("POST", f"/admin/reports/{holds[0]}", {"action": "dismiss", "note": "Caso duplicado"})
        viewer.request("GET", f"/lists/{identity}", expected=404)
        admin.request("POST", f"/admin/reports/{holds[1]}", {"action": "dismiss", "note": "No requiere ocultamiento"})
        viewer.request("GET", f"/lists/{identity}")

    def png():
        def chunk(kind, data):
            return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
        return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b"")

    def privacy_removal():
        asset = owner.upload("/assets", "logo.png", png())["id"]
        content = ctx.content(school=f"QA privacidad {tag}")
        content["logo_id"] = asset
        identity = new_list("private", content=content)
        invite(identity, viewer)
        assert isinstance(viewer.request("GET", f"/assets/{asset}"), bytes)
        admin.request("GET", f"/assets/{asset}", expected=404)
        cases = [viewer.request("POST", f"/lists/{identity}/reports", {"version": 1, "kind": "privacy", "reason": "Retirar contenido personal"})["id"] for _ in range(2)]
        viewer.request("GET", f"/admin/reports/{cases[0]}/logo", expected=401)
        assert isinstance(admin.request("GET", f"/admin/reports/{cases[0]}/logo"), bytes)
        assert ctx.sql(f"SELECT count(*) FROM app.audit WHERE action='report_logo_inspected' AND entity_id='{cases[0]}'").strip() == "1"
        admin.request("POST", f"/admin/reports/{cases[0]}", {"action": "remove", "note": "Retiro solicitado"})
        admin.request("GET", f"/admin/reports/{cases[0]}/logo", expected=404)
        admin.request("GET", f"/admin/reports/{cases[1]}/logo", expected=404)
        viewer.request("GET", f"/lists/{identity}", expected=404)
        owner.request("GET", f"/lists/{identity}/draft", expected=404)
        owner.request("GET", f"/assets/{asset}", expected=404)
        assert ctx.sql(f"SELECT count(*) FROM app.versions WHERE list_id='{identity}'").strip() == "0"
        assert ctx.sql(f"SELECT count(*) FROM app.reports WHERE list_id='{identity}' AND (evidence<>'{{}}'::jsonb OR reason<>'')").strip() == "0"

    def templates_schools_and_admins():
        content = ctx.content()
        content["school"] = ""
        content["class_name"] = ""
        template = admin.request("POST", "/admin/templates", {"name": f"Plantilla {tag}", "grade": "Básica", "content": content})["id"]
        assert any(row["id"] == template for row in viewer.request("GET", "/templates"))
        copy = viewer.request("POST", f"/templates/{template}/copy")["id"]
        copied = viewer.request("GET", f"/lists/{copy}/draft")["content"]
        assert copied["items"][0]["id"] != content["items"][0]["id"]
        admin.request("POST", "/admin/templates", {"id": template, "name": "Plantilla corregida", "grade": "Básica", "content": content})
        admin.request("DELETE", f"/admin/templates/{template}")
        assert all(row["id"] != template for row in viewer.request("GET", "/templates"))
        content["logo_id"] = str(uuid.uuid4())
        admin.request("POST", "/admin/templates", {"name": "Logo privado", "grade": "Básica", "content": content}, expected=400)
        content = ctx.content(school=f"Escuela canónica {tag}")
        content.update(comuna="Comuna QA", region="Región QA")
        identity = new_list(content=content)
        alias = admin.request("POST", "/admin/schools", {"canonical_name": content["school"], "alias": f"Alternativo {tag}", "comuna": content["comuna"], "region": content["region"]})["id"]
        assert any(row["id"] == identity for row in viewer.request("GET", f"/lists?q={quote(f'Alternativo {tag}')}"))
        assert any(row["id"] == alias for row in admin.request("GET", "/admin/schools"))
        admin.request("DELETE", f"/admin/schools/{alias}")
        admin.request("POST", "/admin/schools", {"canonical_name": "Colegio", "alias": "Otro", "comuna": "", "region": ""}, expected=400)
        admin.request("POST", "/admin/accounts", {"username": f"qa_admin_{tag}", "password": "QA-new-admin-password-2026"})
        other = ctx.client()
        other.request("POST", "/admin/login", {"username": f"qa_admin_{tag}", "password": "QA-new-admin-password-2026"})
        assert other.request("GET", "/admin/dashboard")["mode"] == "local"
        other.request("POST", "/lists", {"content": ctx.content()}, expected=401)

    def account_cleanup():
        departing = ctx.client()
        departing.register(f"departing-{tag}")
        public = new_list(author=departing)
        private = new_list("private", author=departing)
        unpublished = ctx.create(departing, ctx.content())
        invite(public, viewer, "editor", sender=departing)
        before_offer = departing.request("GET", "/auth/deletion-preview")
        pending = departing.request("POST", f"/lists/{public}/transfer", {"recipient_id": viewer.user["id"]})["id"]
        departing.request("DELETE", "/auth/me", {"password": departing.password, "confirm": True, "disposition_token": before_offer["disposition_token"]}, expected=409)
        transferred = new_list("private", author=departing)
        invite(transferred, viewer, "editor", sender=departing)
        accepted = departing.request("POST", f"/lists/{transferred}/transfer", {"recipient_id": viewer.user["id"]})["id"]
        viewer.request("POST", f"/transfers/{accepted}/accept")
        elsewhere = new_list()
        comment = departing.request("POST", f"/lists/{elsewhere}/comments", {"version": 1, "body": "Comentario que se eliminará"})["id"]
        departing.request("POST", f"/lists/{elsewhere}/vote", {"version": 1, "voted": True})
        report = owner.request("POST", f"/lists/{elsewhere}/reports", {"version": 1, "comment_id": comment, "kind": "privacy", "reason": "Revisar comentario"})["id"]
        preview = departing.request("GET", "/auth/deletion-preview")
        assert any(row["id"] == pending and row["status"] == "pending" and row["direction"] == "sent" for row in preview["transfers"])
        assert any(row["id"] == accepted and row["status"] == "accepted" and row["direction"] == "sent" for row in preview["transfers"])
        assert all(row["id"] != transferred for row in preview["lists"])
        departing.request("DELETE", "/auth/me", {"password": departing.password, "confirm": True, "disposition_token": preview["disposition_token"]})
        assert departing.request("GET", "/auth/me")["user"] is None
        retained = viewer.request("GET", f"/lists/{public}")
        assert retained["owner_id"] is None and retained["archived"] and retained["owner_name"] == "Usuario eliminado"
        viewer.request("POST", f"/lists/{public}/archive", {"archived": False}, expected=403)
        viewer.request("GET", f"/lists/{private}", expected=404)
        viewer.request("GET", f"/lists/{unpublished}", expected=404)
        retained_transfer = viewer.request("GET", f"/lists/{transferred}")
        assert retained_transfer["owner_id"] == viewer.user["id"] and not retained_transfer["archived"]
        assert owner.request("GET", f"/lists/{elsewhere}")["votes"] == 0
        assert owner.request("GET", f"/lists/{elsewhere}/comments")[0]["deleted"]
        case = next(row for row in admin.request("GET", "/admin/reports") if row["id"] == report)
        assert case["evidence"] == {}

    for name, test in (
        ("catalog typed pending items, review, merge snapshots and source matching", catalog_and_matches),
        ("admin generic creation, atomic typed corrections, direct aliases and immutable snapshots", admin_catalog_corrections),
        ("import name candidates use aliases and only approved source links", imported_name_matching),
        ("administrator taxonomy creation, editing and safe deletion", taxonomy),
        ("versioned votes/comments, disabled comments and archived feedback", feedback_and_archiving),
        ("local subscriptions and access-revocation cancellation", following_and_revocation),
        ("bound invitations, expiry, requests and collaboration permissions", collaboration),
        ("accepted ownership transfer and old-owner permissions", ownership_transfer),
        ("scoped private moderation, evidence audit and restoration", scoped_moderation),
        ("privacy removal clears versions, evidence and unshared assets", privacy_removal),
        ("templates, school-locality aliases and separate administrator creation", templates_schools_and_admins),
        ("account deletion preserves only permitted public archives", account_cleanup),
    ):
        ctx.check(name, test)

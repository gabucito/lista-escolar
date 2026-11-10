#!/usr/bin/env python3
"""Exercise the local API using a disposable PostgreSQL cluster, never escolar.

Build the binary first: cargo build --offline
Run: python3 tests/api_integration.py
Keep an isolated instance for browser QA: python3 tests/api_integration.py --serve
"""
from __future__ import annotations

import argparse
import concurrent.futures
from contextlib import AbstractContextManager
import copy
from datetime import datetime, timezone
import http.cookiejar
import io
import json
import os
from pathlib import Path
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import time
import traceback
import urllib.error
import urllib.request
import uuid
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / '.local' / 'qa'
USER_PASSWORD = 'QA-user-password-2026'
ADMIN_USERNAME = 'qa_admin'
ADMIN_PASSWORD = 'QA-admin-password-2026'


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


class Client:
    def __init__(self, context):
        self.context = context
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))
        self.user = None
        self.password = USER_PASSWORD

    def request(self, method, path, data=None, expected=200, csrf=True, raw_body=None, content_type=None):
        headers = {}
        if csrf:
            headers['X-Requested-With'] = 'lista-escolar'
        if raw_body is not None:
            body = raw_body
            headers['Content-Type'] = content_type
        elif data is not None:
            body = json.dumps(data).encode()
            headers['Content-Type'] = 'application/json'
        else:
            body = None
        request = urllib.request.Request(self.context.base_url + '/api' + path, data=body, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        status = response.status
        payload = response.read()
        if 'application/json' in response.headers.get('Content-Type', ''):
            payload = json.loads(payload)
        allowed = [expected] if isinstance(expected, int) else expected
        assert status in allowed, f'{method} {path}: expected {allowed}, got {status}: {str(payload)[:1500]}'
        assert response.headers.get('Cache-Control') == 'no-store', f'{method} {path} ({status}): missing no-store'
        self.context.requests += 1
        return payload

    def upload(self, path, filename, data, expected=200):
        boundary = 'QA-' + uuid.uuid4().hex
        body = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"\r\n'
                'Content-Type: application/octet-stream\r\n\r\n').encode() + data + f'\r\n--{boundary}--\r\n'.encode()
        return self.request('POST', path, raw_body=body, content_type=f'multipart/form-data; boundary={boundary}', expected=expected)

    def register(self, label):
        self.user = self.request('POST', '/auth/register', {
            'email': f'{label}.{uuid.uuid4().hex[:10]}@example.invalid',
            'display_name': label, 'password': self.password,
        })['user']
        return self.user


class Context:
    def __init__(self, base_url, psql_command, cli_environment):
        self.base_url, self.psql_command = base_url, psql_command
        self.cli_environment = cli_environment
        self.requests = 0
        self.results = []
        for role in ('owner', 'editor', 'viewer', 'outsider'):
            client = self.client()
            client.register(role)
            setattr(self, role, client)
        self.admin = self.client()
        self.admin.request('POST', '/admin/login', {'username': ADMIN_USERNAME, 'password': ADMIN_PASSWORD})

    def client(self):
        return Client(self)

    def sql(self, sql):
        return subprocess.run(self.psql_command + ['-Atqc', sql], check=True, capture_output=True, text=True).stdout.strip()

    def cli(self, command, name, password):
        return subprocess.run([str(ROOT / 'target' / 'debug' / 'lista-escolar'), command, name],
                              cwd=ROOT, env=self.cli_environment, input=password + '\n', text=True,
                              check=True, capture_output=True).stdout

    def content(self, school='QA Escuela', quantity='2'):
        return {'school': school, 'class_name': '1° básico A', 'school_year': 2027,
                'comuna': 'Santiago', 'region': 'Metropolitana', 'instructions': '', 'logo_id': '',
                'items': [{'id': str(uuid.uuid4()), 'catalog_id': '', 'name': 'Lápiz grafito', 'quantity': quantity,
                           'unit': 'unidad', 'category': 'Escritura', 'note': '', 'attributes': {}}]}

    def create(self, client, content=None, visibility='public'):
        return client.request('POST', '/lists', {'content': content or self.content(), 'visibility': visibility})['id']

    def publish(self, client, list_id, request_id=None):
        draft = client.request('GET', f'/lists/{list_id}/draft')
        return client.request('POST', f'/lists/{list_id}/publish', {
            'revision': draft['revision'], 'current_version': draft['current_version'], 'request_id': request_id or str(uuid.uuid4()),
        })

    def save(self, client, list_id, content):
        draft = client.request('GET', f'/lists/{list_id}/draft')
        return client.request('PUT', f'/lists/{list_id}/draft', {'revision': draft['revision'], 'content': content})

    def invite(self, owner, list_id, recipient, role='viewer'):
        invitation = owner.request('POST', f'/lists/{list_id}/access', {'email': recipient.user['email'], 'role': role})
        recipient.request('POST', f'/invitations/{invitation["invitation_token"]}/accept')
        return invitation

    def check(self, name, operation):
        started = time.monotonic()
        try:
            operation()
            result = {'name': name, 'passed': True}
            print('PASS', name, flush=True)
        except Exception as error:
            result = {'name': name, 'passed': False, 'error': str(error), 'traceback': traceback.format_exc()}
            print('FAIL', name, str(error), flush=True)
        result['seconds'] = round(time.monotonic() - started, 3)
        self.results.append(result)


class IsolatedEnvironment(AbstractContextManager):
    def __init__(self):
        self.temp = None
        self.backend = None
        self.started_pg = False
        self.log = None

    def __enter__(self):
        QA.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(prefix='lista-api-qa-', dir='/tmp')
        self.work = Path(self.temp.name)
        self.pg_bin = Path(subprocess.run(['pg_config', '--bindir'], check=True, capture_output=True, text=True).stdout.strip())
        self.cluster, self.socket = self.work / 'postgres', self.work / 'socket'
        self.socket.mkdir()
        db_port, api_port = free_port(), free_port()
        self.base_url = f'http://127.0.0.1:{api_port}'
        try:
            subprocess.run([str(self.pg_bin / 'initdb'), '-D', str(self.cluster), '-U', 'qa_user', '--auth-local=trust', '--auth-host=trust', '--encoding=UTF8', '--no-locale'], check=True, capture_output=True)
            subprocess.run([str(self.pg_bin / 'pg_ctl'), '-D', str(self.cluster), '-l', str(self.work / 'postgres.log'), '-o',
                            f'-k {self.socket} -p {db_port} -c listen_addresses=127.0.0.1', '-w', 'start'], check=True, capture_output=True)
            self.started_pg = True
            subprocess.run([str(self.pg_bin / 'createdb'), '-h', str(self.socket), '-p', str(db_port), '-U', 'qa_user', 'lista_qa'], check=True, capture_output=True)
            self.psql_command = [str(self.pg_bin / 'psql'), '-X', '-v', 'ON_ERROR_STOP=1', '-h', str(self.socket), '-p', str(db_port), '-U', 'qa_user', '-d', 'lista_qa']
            environment = os.environ.copy()
            environment.update({'DATABASE_URL': f'postgresql://qa_user@127.0.0.1:{db_port}/lista_qa', 'LISTA_BIND': f'127.0.0.1:{api_port}', 'RUST_LOG': 'lista_escolar=info'})
            binary = ROOT / 'target' / 'debug' / 'lista-escolar'
            if not binary.is_file():
                raise RuntimeError('Build the application first with cargo build --offline')
            subprocess.run([str(binary), 'create-admin', ADMIN_USERNAME], cwd=ROOT, env=environment,
                           input=ADMIN_PASSWORD + '\n', text=True, check=True, capture_output=True)
            self.log_path = QA / f'backend-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")}.log'
            self.log = self.log_path.open('wb')
            self.backend = subprocess.Popen([str(binary), 'serve'], cwd=ROOT, env=environment, stdout=self.log, stderr=subprocess.STDOUT)
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if self.backend.poll() is not None:
                    raise RuntimeError('Backend exited: ' + self.log_path.read_text()[-3000:])
                try:
                    with urllib.request.urlopen(self.base_url + '/api/health', timeout=1) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.1)
            else:
                raise RuntimeError('Backend readiness timed out: ' + self.log_path.read_text()[-3000:])
            self.context = Context(self.base_url, self.psql_command, environment)
            manifest = {'base_url': self.base_url, 'isolated': True, 'admin': {'username': ADMIN_USERNAME, 'password': ADMIN_PASSWORD},
                        'users': {role: {'email': getattr(self.context, role).user['email'], 'password': USER_PASSWORD}
                                  for role in ('owner', 'editor', 'viewer', 'outsider')}, 'log': str(self.log_path)}
            self.manifest = QA / 'environment.json'
            self.manifest.write_text(json.dumps(manifest, indent=2) + '\n')
            self.manifest.chmod(0o600)
            return self
        except BaseException:
            self.__exit__(*sys.exc_info())
            raise

    def __exit__(self, *_):
        if self.backend and self.backend.poll() is None:
            self.backend.send_signal(signal.SIGINT)
            try:
                self.backend.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.backend.kill()
                self.backend.wait()
        if self.log:
            self.log.close()
        if self.started_pg:
            subprocess.run([str(self.pg_bin / 'pg_ctl'), '-D', str(self.cluster), '-m', 'immediate', '-w', 'stop'], capture_output=True)
        if hasattr(self, 'manifest') and self.manifest.exists():
            data = json.loads(self.manifest.read_text())
            if data.get('base_url') == self.base_url:
                data['running'] = False
                self.manifest.write_text(json.dumps(data, indent=2) + '\n')
        if self.temp:
            self.temp.cleanup()


def xlsx_fixture(formula=False, sparse=False):
    destination = io.BytesIO()
    sheet = ('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C2"/><sheetData>'
             '<row r="1"><c r="A1" t="inlineStr"><is><t>Artículo</t></is></c><c r="B1" t="inlineStr"><is><t>Cantidad</t></is></c></row>'
             '<row r="2"><c r="A2" t="inlineStr"><is><t>Cuaderno</t></is></c><c r="B2">' + ('<f>1+1</f>' if formula else '') + '<v>2</v></c></row>' +
             ('<row r="1048576"><c r="XFD1048576"><v>1</v></c></row>' if sparse else '') + '</sheetData></worksheet>')
    files = {
        '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
        '_rels/.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
        'xl/workbook.xml': '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Útiles" sheetId="1" r:id="rId1"/></sheets></workbook>',
        'xl/_rels/workbook.xml.rels': '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
        'xl/worksheets/sheet1.xml': sheet,
    }
    with zipfile.ZipFile(destination, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, content in files.items():
            archive.writestr(name, content.encode())
    return destination.getvalue()


def png_fixture():
    def chunk(name, data):
        return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\x00\x66\x99\x33')) + chunk(b'IEND', b'')


def run_core(ctx):
    def accounts():
        visitor = ctx.client()
        assert visitor.request('GET', '/auth/me')['user'] is None
        assert ctx.owner.request('GET', '/admin/me')['admin'] is None
        assert ctx.admin.request('GET', '/auth/me')['user'] is None
        visitor.request('POST', '/lists', {}, expected=401)
        ctx.owner.request('POST', '/lists', {}, expected=403, csrf=False)
        preferences = {'layout': 'cards', 'paper': 'A4', 'color': False}
        updated = ctx.owner.request('PATCH', '/auth/me', {'display_name': 'QA Owner', 'preferences': preferences})['user']
        assert updated['preferences'] == preferences
        second = ctx.client()
        second.request('POST', '/auth/login', {'email': ctx.owner.user['email'], 'password': USER_PASSWORD})
        assert second.request('GET', '/auth/me')['user']['id'] == ctx.owner.user['id']
        second.request('POST', '/auth/logout')
        assert second.request('GET', '/auth/me')['user'] is None
        assert ctx.owner.request('GET', '/auth/me')['user']['id'] == ctx.owner.user['id']
    ctx.check('accounts, session separation, preferences and CSRF', accounts)

    def drafts_and_concurrency():
        list_id = ctx.owner.request('POST', '/lists', {})['id']
        ctx.client().request('GET', f'/lists/{list_id}', expected=404)
        ctx.outsider.request('GET', f'/lists/{list_id}/draft', expected=404)
        current = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        drafts = [ctx.content('Concurrent A'), ctx.content('Concurrent B')]
        def save(content):
            return ctx.owner.request('PUT', f'/lists/{list_id}/draft', {'revision': current['revision'], 'content': content}, expected=(200, 409))
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(save, drafts))
        assert sum('revision' in result for result in results) == 1
        assert sum('error' in result for result in results) == 1
        fresh = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        invalid = copy.deepcopy(fresh['content']); invalid['items'][0]['quantity'] = '1.5'
        ctx.save(ctx.owner, list_id, invalid)
        fresh = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        ctx.owner.request('POST', f'/lists/{list_id}/publish', {'revision': fresh['revision'], 'current_version': 0, 'request_id': str(uuid.uuid4())}, expected=400)
        invalid['items'][0]['unit'] = 'm'
        ctx.save(ctx.owner, list_id, invalid)
        assert ctx.publish(ctx.owner, list_id)['version'] == 1
    ctx.check('draft privacy, concurrent saves and quantity validation', drafts_and_concurrency)

    def publishing():
        list_id = ctx.create(ctx.owner)
        draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        payload = {'revision': draft['revision'], 'current_version': 0, 'request_id': str(uuid.uuid4())}
        first = ctx.owner.request('POST', f'/lists/{list_id}/publish', payload)
        assert first == ctx.owner.request('POST', f'/lists/{list_id}/publish', payload)
        assert ctx.sql(f"SELECT count(*) FROM app.versions WHERE list_id='{list_id}'") == '1'
        changed = dict(payload, current_version=1)
        ctx.owner.request('POST', f'/lists/{list_id}/publish', changed, expected=409)
        assert ctx.publish(ctx.owner, list_id)['version'] == 1
        other = ctx.create(ctx.owner)
        draft = ctx.owner.request('GET', f'/lists/{other}/draft')
        def publish(_):
            return ctx.owner.request('POST', f'/lists/{other}/publish', {'revision': draft['revision'], 'current_version': 0, 'request_id': str(uuid.uuid4())}, expected=(200, 409))
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            results = list(pool.map(publish, range(2)))
        assert sum('version' in result for result in results) == 1
        assert ctx.sql(f"SELECT count(*) FROM app.versions WHERE list_id='{other}'") == '1'
    ctx.check('immutable publication, no-op and retry/concurrent idempotency', publishing)

    def permissions():
        content = ctx.content('Private First')
        list_id = ctx.create(ctx.owner, content, 'private')
        ctx.publish(ctx.owner, list_id)
        ctx.invite(ctx.owner, list_id, ctx.editor, 'editor')
        ctx.invite(ctx.owner, list_id, ctx.viewer)
        assert ctx.viewer.request('GET', f'/lists/{list_id}')['role'] == 'viewer'
        ctx.viewer.request('GET', f'/lists/{list_id}/draft', expected=404)
        ctx.viewer.request('PUT', f'/lists/{list_id}/draft', {'revision': 1, 'content': content}, expected=403)
        ctx.outsider.request('GET', f'/lists/{list_id}?version=1', expected=404)
        content['school'] = 'Private Second'
        ctx.save(ctx.editor, list_id, content)
        assert ctx.viewer.request('GET', f'/lists/{list_id}')['content']['school'] == 'Private First'
        assert ctx.publish(ctx.editor, list_id)['version'] == 2
        assert ctx.viewer.request('GET', f'/lists/{list_id}?version=1')['content']['school'] == 'Private First'
        assert len(ctx.viewer.request('GET', f'/lists/{list_id}')['versions']) == 2
        ctx.editor.request('PATCH', f'/lists/{list_id}/settings', {'visibility': 'public'})
        assert ctx.client().request('GET', f'/lists/{list_id}')['version'] == 2
        ctx.owner.request('PATCH', f'/lists/{list_id}/settings', {'visibility': 'private'})
        ctx.client().request('GET', f'/lists/{list_id}?version=1', expected=404)
        ctx.owner.request('DELETE', f'/lists/{list_id}/access/{ctx.viewer.user["id"]}')
        ctx.viewer.request('GET', f'/lists/{list_id}?version=1', expected=404)
        ctx.editor.request('DELETE', f'/lists/{list_id}', expected=403)
    ctx.check('private grants, editor publication, history and revocation', permissions)

    def progress():
        content = ctx.content('Progress')
        second = copy.deepcopy(content['items'][0]); second['id'] = str(uuid.uuid4()); content['items'].append(second)
        first_id = content['items'][0]['id']
        list_id = ctx.create(ctx.owner, content); ctx.publish(ctx.owner, list_id)
        initial = ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        assert len(initial['items']) == 2
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress', {'version': 1, 'item_id': first_id, 'checked': True, 'review': False})
        reordered = copy.deepcopy(content); reordered['items'].reverse(); reordered['items'][1]['category'] = 'Nueva categoría'
        ctx.save(ctx.owner, list_id, reordered); ctx.publish(ctx.owner, list_id)
        current = ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        assert current['items'][first_id]['checked']
        changed = copy.deepcopy(reordered); changed['items'][1]['quantity'] = '3'
        ctx.save(ctx.owner, list_id, changed); ctx.publish(ctx.owner, list_id)
        ctx.save(ctx.owner, list_id, reordered); ctx.publish(ctx.owner, list_id)
        current = ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        assert current['version'] == 4 and not current['items'][first_id]['checked'] and current['items'][first_id]['review']
        assert first_id in current['changes']['changed']
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress', {'version': 4, 'item_id': first_id, 'checked': True, 'review': False})
        ctx.viewer.request('PUT', f'/lists/{list_id}/progress', {'version': 1, 'item_id': first_id, 'checked': False, 'review': False})
        assert ctx.viewer.request('GET', f'/lists/{list_id}/progress?version=4')['items'][first_id]['checked']
        assert not ctx.outsider.request('GET', f'/lists/{list_id}/progress')['items'][first_id]['checked']
    ctx.check('independent checklists, stable occurrences and skipped-version reverts', progress)

    def archives_and_copies():
        original = ctx.content('Archive Test'); list_id = ctx.create(ctx.owner, original); ctx.publish(ctx.owner, list_id)
        old_draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        ctx.owner.request('POST', f'/lists/{list_id}/archive', {'archived': True})
        assert ctx.client().request('GET', f'/lists/{list_id}')['archived']
        assert not any(row['id'] == list_id for row in ctx.client().request('GET', '/lists?q=Archive'))
        ctx.owner.request('PUT', f'/lists/{list_id}/draft', {'revision': old_draft['revision'], 'content': original}, expected=403)
        ctx.viewer.request('GET', f'/lists/{list_id}/progress')
        copy_id = ctx.outsider.request('POST', f'/lists/{list_id}/copy', {})['id']
        copied = ctx.outsider.request('GET', f'/lists/{copy_id}/draft')
        assert copied['current_version'] == 0 and copied['content']['items'][0]['id'] != original['items'][0]['id']
        ctx.owner.request('POST', f'/lists/{list_id}/archive', {'archived': False})
        ctx.owner.request('PUT', f'/lists/{list_id}/draft', {'revision': old_draft['revision'], 'content': original}, expected=409)
        assert ctx.client().request('GET', f'/lists/{list_id}')['version'] == 1
        ctx.owner.request('DELETE', f'/lists/{list_id}')
        ctx.client().request('GET', f'/lists/{list_id}?version=1', expected=404)
        ctx.owner.request('GET', f'/lists/{list_id}/draft', expected=404)
    ctx.check('archive/restore, stale saves, independent copies and deletion', archives_and_copies)

    def templates_and_search():
        source = ctx.content('Template Starter')
        template = ctx.admin.request('POST', '/admin/templates', {'name': 'Primero básico QA', 'grade': '1° básico', 'content': source})['id']
        assert any(row['id'] == template for row in ctx.client().request('GET', '/templates'))
        list_id = ctx.owner.request('POST', f'/templates/{template}/copy')['id']
        copied = ctx.owner.request('GET', f'/lists/{list_id}/draft')['content']
        assert copied['items'][0]['id'] != source['items'][0]['id']
        copied['school'] = 'Esc. Prueba Alias'; ctx.save(ctx.owner, list_id, copied); ctx.publish(ctx.owner, list_id)
        ctx.admin.request('POST', '/admin/schools', {'canonical_name': 'Colegio Prueba Completo', 'alias': 'Esc. Prueba Alias', 'comuna': copied['comuna'], 'region': copied['region']})
        rows = ctx.client().request('GET', '/lists?q=Colegio%20Prueba%20Completo&comuna=Santiago&school_year=2027')
        assert any(row['id'] == list_id for row in rows)
        combined = ctx.client().request('GET', '/lists?q=Colegio%20Prueba%20Completo%201%C2%B0%20b%C3%A1sico%20A')
        assert any(row['id'] == list_id for row in combined)
        assert not any(row['id'] == list_id for row in ctx.client().request('GET', '/lists?comuna=Valparaiso'))
    ctx.check('templates, new occurrence IDs and locality-aware alias search', templates_and_search)

    def csv_import():
        list_id = ctx.create(ctx.owner)
        category = ctx.owner.request('GET', '/catalog/categories')[0]['id']
        preview = ctx.owner.upload(f'/lists/{list_id}/imports', 'lista.csv', 'nombre;cantidad;nota\nLápiz;2;Azul\nGoma;1;\n'.encode())
        assert preview['sheets'][0]['rows'][1][0] == 'Lápiz'
        unique_name = 'QA shared ' + uuid.uuid4().hex
        item = ctx.content()['items'][0]; item.update(name=unique_name, share_with_catalog=True, category_id=category)
        invalid = copy.deepcopy(item); invalid.update(id=str(uuid.uuid4()), name='Inválido', quantity='0')
        body = {'revision': preview['revision'], 'request_id': str(uuid.uuid4()), 'items': [item, invalid]}
        ctx.owner.request('POST', f'/lists/{list_id}/imports/{preview["id"]}/confirm', body, expected=400)
        assert ctx.sql(f"SELECT count(*) FROM catalog.items WHERE name='{unique_name}'") == '0'
        assert len(ctx.owner.request('GET', f'/lists/{list_id}/draft')['content']['items']) == 1
        body['items'] = [item]; body['request_id'] = str(uuid.uuid4())
        first = ctx.owner.request('POST', f'/lists/{list_id}/imports/{preview["id"]}/confirm', body)
        assert first == ctx.owner.request('POST', f'/lists/{list_id}/imports/{preview["id"]}/confirm', body)
        assert ctx.sql(f"SELECT count(*) FROM catalog.items WHERE name='{unique_name}' AND review_status='pending'") == '1'
        draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        assert len(draft['content']['items']) == 2 and draft['content']['items'][-1]['id'] != item['id']
        assert draft['content']['items'][-1]['catalog_id']
        assert ctx.sql(f"SELECT count(*) FROM app.imports WHERE id='{preview['id']}'") == '0'
    ctx.check('CSV mapping, atomic shared custom supplies and import replay', csv_import)

    def import_boundaries():
        list_id = ctx.create(ctx.owner)
        preview = ctx.owner.upload(f'/lists/{list_id}/imports', 'data.csv', b'name,quantity\nPencil,2\n')
        current = ctx.owner.request('GET', f'/lists/{list_id}/draft')['content']; current['instructions'] = 'Cambió'
        ctx.save(ctx.owner, list_id, current)
        body = {'revision': preview['revision'], 'request_id': str(uuid.uuid4()), 'items': ctx.content()['items']}
        ctx.owner.request('POST', f'/lists/{list_id}/imports/{preview["id"]}/confirm', body, expected=409)
        ctx.owner.request('DELETE', f'/lists/{list_id}/imports/{preview["id"]}')
        ctx.owner.request('POST', f'/lists/{list_id}/imports/{preview["id"]}/confirm', body, expected=400)
        ctx.owner.upload(f'/lists/{list_id}/imports', 'legacy.csv', b'nombre,cantidad\nL\xe1piz,2\n', expected=400)
        legacy = ctx.owner.upload(f'/lists/{list_id}/imports?encoding=windows-1252', 'legacy.csv', b'nombre,cantidad\nL\xe1piz,2\n')
        assert legacy['sheets'][0]['rows'][1][0] == 'Lápiz'
        xlsx = ctx.owner.upload(f'/lists/{list_id}/imports', 'valid.xlsx', xlsx_fixture())
        assert xlsx['sheets'][0]['name'] == 'Útiles' and xlsx['sheets'][0]['rows'][1][0] == 'Cuaderno'
        ctx.owner.upload(f'/lists/{list_id}/imports', 'formula.xlsx', xlsx_fixture(formula=True), expected=400)
        ctx.owner.upload(f'/lists/{list_id}/imports', 'sparse.xlsx', xlsx_fixture(sparse=True), expected=400)
        ctx.owner.upload(f'/lists/{list_id}/imports', 'invalid.xlsx', b'not a spreadsheet', expected=400)
        ctx.owner.upload(f'/lists/{list_id}/imports', 'huge.csv', b'a' * (10 * 1024 * 1024 + 1), expected=400)
    ctx.check('import cancellation/conflicts, CSV encodings and XLSX bounds/formulas', import_boundaries)

    def asset_permissions():
        asset = ctx.owner.upload('/assets', 'logo.png', png_fixture())['id']
        assert ctx.owner.request('GET', f'/assets/{asset}').startswith(b'\x89PNG')
        ctx.outsider.request('GET', f'/assets/{asset}', expected=404)
        transplanted = ctx.content(); transplanted['logo_id'] = asset
        ctx.outsider.request('POST', '/lists', {'content': transplanted}, expected=400)
        content = ctx.content('Logo Privado'); content['logo_id'] = asset.upper()
        list_id = ctx.create(ctx.owner, content, 'private'); ctx.publish(ctx.owner, list_id)
        ctx.invite(ctx.owner, list_id, ctx.viewer)
        assert ctx.viewer.request('GET', f'/assets/{asset}').startswith(b'\x89PNG')
        ctx.owner.request('DELETE', f'/lists/{list_id}/access/{ctx.viewer.user["id"]}')
        ctx.viewer.request('GET', f'/assets/{asset}', expected=404)
        ctx.owner.upload('/assets', 'bad.svg', b'<svg/>', expected=400)
        draft = ctx.owner.request('GET', f'/lists/{list_id}/draft')
        assert draft['content']['logo_id'] == asset
        ctx.owner.request('DELETE', f'/lists/{list_id}')
        ctx.owner.request('GET', f'/assets/{asset}', expected=404)
    ctx.check('sanitized logos, private read revocation and attachment authorization', asset_permissions)


def run_cli_checks(ctx):
    def reset_accounts():
        user = ctx.client(); user.register('cli-reset-user')
        old_password = user.password
        replacement = 'QA-replacement-password-2026'
        ctx.cli('reset-password', user.user['email'], replacement)
        assert user.request('GET', '/auth/me')['user'] is None
        user.request('POST', '/auth/login', {'email': user.user['email'], 'password': old_password}, expected=400)
        user.request('POST', '/auth/login', {'email': user.user['email'], 'password': replacement})
        assert user.request('GET', '/auth/me')['user']['id'] == user.user['id']
        username = 'qa-cli-' + uuid.uuid4().hex[:8]
        ctx.cli('create-admin', username, ADMIN_PASSWORD)
        admin = ctx.client()
        admin.request('POST', '/admin/login', {'username': username, 'password': ADMIN_PASSWORD})
        ctx.cli('reset-admin', username, replacement)
        assert admin.request('GET', '/admin/me')['admin'] is None
        admin.request('POST', '/admin/login', {'username': username, 'password': ADMIN_PASSWORD}, expected=400)
        admin.request('POST', '/admin/login', {'username': username, 'password': replacement})
        assert admin.request('GET', '/admin/me')['admin']['username'] == username
    ctx.check('operator CLI password/admin recovery invalidates old sessions', reset_accounts)


def main():
    signal.signal(signal.SIGINT, signal.default_int_handler)
    signal.signal(signal.SIGTERM, signal.default_int_handler)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serve', action='store_true', help='keep isolated backend and database for browser QA until Ctrl+C')
    parser.add_argument('--core-only', action='store_true')
    args = parser.parse_args()
    with IsolatedEnvironment() as environment:
        ctx = environment.context
        if args.serve:
            # Representative source records exist only in this disposable cluster.
            product_id = str(uuid.uuid4())
            ctx.sql(f"INSERT INTO store_snapshot.products(id,slug,name,unit_label,price_clp,visible_in_store,source_updated_at) VALUES('{product_id}','qa-source-pencil','Lápiz grafito de origen QA','unidad',250,true,now())")
            variant_id = str(uuid.uuid4())
            ctx.sql(f"INSERT INTO store_snapshot.product_variants(id,product_id,sku,name,attributes,price_clp) VALUES('{variant_id}','{product_id}','QA-HB-001','Lápiz grafito HB QA','{{\"color\":\"Negro\",\"medida\":\"HB\"}}'::jsonb,250)")
            print(environment.base_url, flush=True)
            try:
                while environment.backend.poll() is None:
                    time.sleep(1)
            except KeyboardInterrupt:
                pass
            return 0
        run_core(ctx)
        if not args.core_only:
            from api_community import run_community
            run_community(ctx)
            from api_category_attributes import run_category_attributes
            run_category_attributes(ctx)
            from api_catalog_browse import run_catalog_browse
            run_catalog_browse(ctx)
        run_cli_checks(ctx)
        report = {'created_at': datetime.now(timezone.utc).isoformat(), 'isolated_database': True, 'requests': ctx.requests,
                  'passed': sum(row['passed'] for row in ctx.results), 'failed': sum(not row['passed'] for row in ctx.results),
                  'results': ctx.results, 'backend_log': str(environment.log_path)}
        report_path = QA / f'functional-{datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")}.json'
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({'passed': report['passed'], 'failed': report['failed'], 'requests': ctx.requests, 'report': str(report_path)}), flush=True)
        return int(report['failed'] > 0)


if __name__ == '__main__':
    raise SystemExit(main())

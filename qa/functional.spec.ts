import { test, expect, BrowserContext, Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { inspectCheckboxes } from './pdf-inspection.mjs';

Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
const password = 'QA-browser-password-2026';
const artifacts = '../.local/qa/artifacts';
mkdirSync(artifacts, { recursive: true });
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => { errors.set(page, []); page.on('pageerror', error => errors.get(page)!.push(error.message)); });
test.afterEach(({ page }) => { expect(errors.get(page), 'uncaught browser errors').toEqual([]); });

async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers: { 'X-Requested-With': 'lista-escolar' } });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
async function account(context: BrowserContext, label = 'Familia QA') {
  const email = `browser-${randomUUID()}@example.invalid`;
  const result = await api(context, 'POST', '/auth/register', { email, password, display_name: label });
  return { email, password, ...result.user };
}
function content(school = 'Colegio Los Aromos QA', count = 3) {
  return { school, class_name: '5° básico A', school_year: 2027, comuna: 'Santiago', region: 'Metropolitana',
    instructions: 'Marcar todos los útiles con nombre y curso. Reutilizar los materiales del año anterior que estén en buen estado.', logo_id: '',
    items: Array.from({ length: count }, (_, index) => ({ id: randomUUID(), catalog_id: '',
      name: `Material-${String(index + 1).padStart(3, '0')} Cuaderno universitario de 100 hojas`, quantity: String(index % 3 + 1),
      unit: 'unidad', category: ['Cuadernos', 'Escritura', 'Artes y manualidades', 'Organización'][Math.floor(index / 12) % 4],
      note: index % 4 === 0 ? `Nota-${String(index + 1).padStart(3, '0')} Usar una cubierta resistente, marcar con nombre y curso. ${'Se puede reutilizar si está en buen estado. '.repeat(4)}` : '', attributes: {} })) };
}
async function seed(context: BrowserContext, data = content(), visibility = 'public') {
  const { id } = await api(context, 'POST', '/lists', { content: data, visibility });
  const draft = await api(context, 'GET', `/lists/${id}/draft`);
  await api(context, 'POST', `/lists/${id}/publish`, { revision: draft.revision, current_version: 0, request_id: randomUUID() });
  return id;
}
async function saved(page: Page) { await expect(page.locator('.save-state')).toHaveText('✓ Guardado'); }

test('register, create, autosave, reorder, import, publish and personal checklist', async ({ page, context }) => {
  await page.goto('/registro');
  await page.getByLabel('Nombre para mostrar').fill('Apoderada QA');
  await page.getByLabel('Correo electrónico').fill(`ui-${randomUUID()}@example.invalid`);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
  await expect(page).toHaveURL(/\/mis-listas$/);
  await page.goto('/crear');
  await expect(page).toHaveURL(/\/editar\//);
  await page.getByLabel('Colegio', { exact: true }).fill('Colegio Arcoíris QA');
  await page.getByLabel('Curso', { exact: true }).fill('2° básico B');
  await page.getByLabel('Año escolar', { exact: true }).fill('2027');
  await page.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Datos de la lista' })).toBeHidden();
  await page.getByLabel('Buscar en catálogo').fill('lápiz');
  await page.locator('.catalog-result').filter({ hasText: /lápiz/i }).first().getByRole('button').click();
  await page.locator('.catalog-secondary-actions').getByRole('button', { name: /Útil personalizado/ }).click();
  const custom = page.getByRole('dialog', { name: 'Útil personalizado', exact: true });
  await custom.getByLabel('Nombre', { exact: true }).fill('Papel para origami QA');
  await custom.getByLabel('Cantidad', { exact: true }).fill('2');
  await custom.getByRole('combobox', { name: 'Unidad', exact: true }).selectOption('paquete');
  await custom.getByRole('button', { name: 'Agregar útil' }).click();
  await expect(page.locator('.supply-row')).toHaveCount(2);
  await page.locator('.supply-row').last().locator('summary').click();
  await page.getByRole('button', { name: 'Subir Papel para origami QA' }).click();
  await expect(page.locator('.supply-row').first().getByLabel('Útil', { exact: true })).toHaveValue('Papel para origami QA');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio Arcoíris QA');
  await page.getByRole('button', { name: 'Importar Excel o CSV', exact: true }).click();
  await page.getByLabel('Archivo', { exact: true }).setInputFiles({ name: 'utiles.csv', mimeType: 'text/csv', buffer: Buffer.from('Nombre;Cantidad;Unidad;Nota\nTijera de punta roma;1;unidad;Marcar con nombre\nCinta de tela;1,5;m;Azul\n') });
  await page.getByRole('button', { name: 'Revisar archivo', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisar importación' });
  await dialog.getByRole('combobox', { name: 'Unidad', exact: true }).selectOption('2');
  await dialog.getByRole('combobox', { name: 'Nota', exact: true }).selectOption('3');
  await dialog.getByRole('button', { name: 'Aplicar columnas y revisar' }).click();
  await expect(dialog.getByLabel('Revisé este útil, su cantidad, unidad y nota')).toHaveCount(2);
  for (const checkbox of await dialog.getByLabel('Revisé este útil, su cantidad, unidad y nota').all()) await checkbox.check();
  await dialog.getByRole('button', { name: 'Agregar 2 útiles', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.supply-row')).toHaveCount(4);
  await page.getByRole('button', { name: 'Publicar lista', exact: true }).click();
  await expect(page).toHaveURL(/\/listas\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Colegio Arcoíris QA' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Ya tengo Papel para origami QA' }).check();
  await expect(page.getByText('1 de 4 útiles')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Ya tengo Papel para origami QA' })).toBeChecked();
  await page.getByRole('button', { name: /Votar esta versión/ }).click();
  await expect(page.getByRole('button', { name: /Quitar mi voto.*1/ })).toBeVisible();
  await page.getByRole('button', { name: /Seguir esta lista/ }).click();
  await expect(page.getByRole('button', { name: /Siguiendo/ })).toBeVisible();
  await page.getByLabel('Comparte una observación').fill('La lista está lista para preparar el nuevo año.');
  await page.getByRole('button', { name: 'Publicar comentario' }).click();
  await expect(page.locator('.comment')).toContainText('La lista está lista');
});

test('public search combines school, class, year and locality', async ({ page, context, browser }) => {
  await account(context); const school = `Escuela Búsqueda ${Date.now()}`;
  const id = await seed(context, content(school));
  const anonymous = await browser.newContext({ baseURL: environment.base_url });
  const reader = await anonymous.newPage(); await reader.goto('/');
  await reader.getByLabel('Colegio', { exact: true }).fill(school);
  await reader.getByLabel('Curso', { exact: true }).fill('5° básico A');
  await reader.getByLabel('Año escolar', { exact: true }).fill('2027');
  await reader.getByLabel('Comuna', { exact: true }).fill('Santiago');
  await reader.getByRole('button', { name: 'Buscar listas' }).click();
  await expect(reader.locator(`a[href="/listas/${id}"]`).first()).toBeVisible();
  await reader.locator(`a[href="/listas/${id}"]`).first().click();
  await expect(reader.getByRole('heading', { name: school })).toBeVisible();
  await expect(reader.getByText('para marcar tus útiles y guardar tu avance personal.', { exact: false })).toBeVisible();
  await anonymous.close();
});

test('stale editor retains changes and deliberately reapplies after review', async ({ page, context }) => {
  await account(context); const id = await seed(context);
  await page.goto(`/editar/${id}`);
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click();
  await expect(page.getByLabel('Colegio', { exact: true })).toBeVisible();
  const draft = await api(context, 'GET', `/lists/${id}/draft`); draft.content.instructions = 'Cambio de otra persona';
  await api(context, 'PUT', `/lists/${id}/draft`, { revision: draft.revision, content: draft.content });
  await page.getByLabel('Colegio', { exact: true }).fill('Mi cambio conservado QA');
  await page.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Hay cambios de otra persona' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mi cambio conservado QA');
  await page.getByText(/Ver borrador del servidor/).click();
  await expect(page.getByText('Cambio de otra persona', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Conservar y guardar mis cambios|Reaplicar mis cambios/ }).click();
  await saved(page);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mi cambio conservado QA');
});

test('private invitations open the proper route and revoked readers lose access', async ({ page, context, browser }) => {
  await account(context); const id = await seed(context, content('Colegio Privado QA'), 'private');
  const viewer = await browser.newContext({ baseURL: environment.base_url });
  const recipient = await account(viewer, 'Lector QA');
  await page.goto(`/listas/${id}/compartir`);
  await page.getByLabel('Correo electrónico').fill(recipient.email);
  await page.getByRole('button', { name: 'Crear invitación' }).click();
  const invitation = await page.locator('code').filter({ hasText: /invitacion(?:es)?\// }).innerText();
  const reader = await viewer.newPage(); await reader.goto(invitation);
  await reader.getByRole('button', { name: /Aceptar invitación/ }).click();
  await reader.goto(`/listas/${id}`); await expect(reader.getByRole('heading', { name: 'Colegio Privado QA' })).toBeVisible();
  await page.reload(); page.on('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Quitar acceso', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Quitar acceso', exact: true })).toHaveCount(0);
  await reader.getByRole('button', { name: /Votar esta versión/ }).click();
  await expect(reader.getByRole('heading', { name: 'No podemos mostrar esta lista' })).toBeVisible();
  await expect(reader.getByText('Material-001', { exact: false })).toHaveCount(0);
  await viewer.close();
});

test('all 12 PDF layout/paper/color variants preserve long content and page bounds', async ({ page, context }) => {
  test.setTimeout(240_000);
  await account(context); const data = content('Colegio Los Aromos · Prueba de documentos', 48); const id = await seed(context, data);
  await page.goto(`/listas/${id}`); await expect(page.getByRole('heading', { name: data.school })).toBeVisible();
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const results: unknown[] = [];
  await page.getByRole('button', { name: 'Descargar PDF', exact: true }).first().click();
  await expect(page.getByRole('dialog', { name: 'Vista previa del PDF' }).locator('app-pdf-preview img')).toBeVisible();
  const preview = page.locator('app-pdf-preview');
  await preview.getByRole('button', { name: 'Página siguiente del PDF' }).click();
  await expect(preview.getByRole('img')).toHaveAttribute('alt', 'Vista previa de la página 2 del PDF');
  await expect(preview.getByRole('region', { name: 'Documento PDF' })).toHaveAttribute('aria-busy', 'false');
  await preview.getByRole('button', { name: 'Ampliar vista previa' }).click();
  await expect(preview.getByRole('button', { name: 'Ajustar PDF al ancho' })).toHaveText('125 %');
  await preview.getByRole('button', { name: 'Página anterior del PDF' }).click();
  await expect(preview.getByRole('img')).toHaveAttribute('alt', 'Vista previa de la página 1 del PDF');
  for (const layout of ['Dos columnas', 'Barra lateral', 'Fichas']) for (const paper of ['LETTER', 'A4']) for (const color of [true, false]) {
    await page.getByRole('button', { name: layout, exact: true }).click();
    await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption(paper);
    await page.getByLabel('En color', { exact: true }).setChecked(color);
    const pending = page.waitForEvent('download');
    await page.getByRole('dialog', { name: 'Vista previa del PDF' }).getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    const download = await pending;
    const filename = `${layout.replaceAll(' ', '-')}-${paper}-${color ? 'color' : 'bw'}.pdf`;
    const path = `${artifacts}/${filename}`; await download.saveAs(path);
    const task = getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true });
    const document = await task.promise;
    let text = '', printableCheckboxes = 0; let lastViewport;
    const checkboxPages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const pdfPage = await document.getPage(number); lastViewport = pdfPage.getViewport({ scale: 1 });
      const checkboxes = await inspectCheckboxes(pdfPage);
      printableCheckboxes += checkboxes.printable;
      checkboxPages.push({ page: number, ...checkboxes });
      expect(checkboxes.offPaper, `${filename} page ${number}: checkbox strokes outside paper`).toEqual([]);
      expect(checkboxes.duplicatePositions, `${filename} page ${number}: overlapping checklist boxes`).toBe(0);
      const pageText = await pdfPage.getTextContent();
      if (layout === 'Fichas') {
        const namesOnPage = pageText.items.filter(item => 'str' in item && /Material-\d{3}/.test(item.str)).length;
        expect(checkboxes.printable, `${filename} page ${number}: each card checkbox/category/quantity stays with its item name`).toBe(namesOnPage);
      }
      if (layout === 'Barra lateral') {
        const sidebarText = pageText.items.filter(item => 'str' in item && item.transform[4] < 150).map(item => 'str' in item ? item.str : '').join(' ').replace(/\s+/g, ' ');
        for (const value of ['LISTA ESCOLAR', data.school, data.class_name, String(data.school_year), data.comuna, data.region, 'Versión 1']) expect(sidebarText.replace(/\s+/g, ''), `${filename} page ${number}: sidebar metadata ${value}`).toContain(value.replace(/\s+/g, ''));
      }
      for (const item of pageText.items) if ('str' in item) {
        text += item.str + ' ';
        if (item.str.trim()) {
          expect(item.transform[4], `${filename} page ${number} text starts outside paper: ${item.str}`).toBeGreaterThanOrEqual(-1);
          expect(item.transform[4] + item.width, `${filename} page ${number} text exceeds right edge: ${item.str}`).toBeLessThanOrEqual(lastViewport.width + 1);
          expect(item.transform[5], `${filename} page ${number} text below paper: ${item.str}`).toBeGreaterThanOrEqual(-1);
          expect(item.transform[5], `${filename} page ${number} text above paper: ${item.str}`).toBeLessThanOrEqual(lastViewport.height + 1);
        }
      }
    }
    for (let index = 1; index <= 48; index++) expect(text, filename).toContain(`Material-${String(index).padStart(3, '0')}`);
    for (let index = 1; index <= 48; index += 4) expect(text, filename).toContain(`Nota-${String(index).padStart(3, '0')}`);
    expect(text).toContain('Marcar todos los útiles'); expect(text).toContain('Versión 1'); expect(text).toContain('5° básico A');
    expect(lastViewport!.width).toBeCloseTo(paper === 'LETTER' ? 612 : 595.28, 0);
    expect(printableCheckboxes, `${filename}: one printable checkbox per item occurrence`).toBe(data.items.length);
    results.push({ filename, pages: document.numPages, items: 48, printableCheckboxes, checkboxPages, width: lastViewport!.width, height: lastViewport!.height });
    await task.destroy();
  }
  writeFileSync(`${artifacts}/pdf-validation.json`, JSON.stringify(results, null, 2));
});

test('template copy, archive/restore and confirmed list deletion', async ({ page, context }) => {
  await account(context); await page.goto('/mis-listas');
  await page.getByRole('button', { name: 'Usar plantilla', exact: true }).first().click();
  await expect(page).toHaveURL(/\/editar\//); await expect(page.locator('.supply-row')).toHaveCount(5);
  await page.getByLabel('Colegio', { exact: true }).fill('Escuela Plantilla QA');
  await page.getByRole('button', { name: 'Guardar datos', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Datos de la lista' })).toBeHidden();
  await saved(page);
  await page.getByRole('button', { name: 'Publicar lista', exact: true }).click();
  await expect(page).toHaveURL(/\/listas\/[^/]+$/);
  await page.getByRole('link', { name: 'Compartir', exact: true }).click();
  page.on('dialog', dialog => dialog.accept());
  await page.getByText('Administrar lista', { exact: true }).click();
  await page.getByRole('button', { name: 'Archivar lista', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restaurar lista', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restaurar lista', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Archivar lista', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Eliminar lista', exact: true }).click();
  await expect(page).toHaveURL(/\/mis-listas$/);
  await expect(page.getByText('Escuela Plantilla QA', { exact: true })).toHaveCount(0);
});

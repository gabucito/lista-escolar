import { test, expect, BrowserContext, Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createCanvas, DOMMatrix, Path2D, ImageData } from '@napi-rs/canvas';
import { inspectCheckboxes } from './pdf-inspection.mjs';

Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
const artifacts = '../.local/qa/artifacts';
mkdirSync(artifacts, { recursive: true });
async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers: { 'X-Requested-With': 'lista-escolar' } });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
async function account(context: BrowserContext) {
  return (await api(context, 'POST', '/auth/register', { email: `pdf-boundary-${randomUUID()}@example.invalid`, password: 'QA-pdf-boundary-password', display_name: 'PDF límites' })).user;
}
function bounded(prefix: string, tail: string, limit: number) {
  return (prefix + ' Útiles escolares para familias y comunidad educativa. '.repeat(limit)).slice(0, limit - tail.length - 1) + ' ' + tail;
}
async function logo(context: BrowserContext) {
  const canvas = createCanvas(96, 96), draw = canvas.getContext('2d');
  for (const [index, color] of ['#e52b36', '#20b35c', '#315fea'].entries()) { draw.fillStyle = color; draw.fillRect(index * 32, 0, 32, 96); }
  draw.fillStyle = '#ffffff'; draw.font = 'bold 28px sans-serif'; draw.fillText('QA', 22, 59);
  const response = await context.request.post('/api/assets', { headers: { 'X-Requested-With': 'lista-escolar' }, multipart: { file: { name: 'colored-logo.png', mimeType: 'image/png', buffer: canvas.toBuffer('image/png') } } });
  expect(response.status()).toBe(200); return (await response.json()).id;
}
function content(logoId = '', stress = true) {
  return {
    school: stress ? bounded('Colegio de límites ', 'FINCOLEGIO', 200) : 'Colegio de estados PDF',
    class_name: stress ? bounded('Curso ', 'FINCURSO', 100) : '3° básico B', school_year: 2027,
    comuna: stress ? bounded('Comuna ', 'FINCOMUNA', 150) : 'Santiago', region: stress ? bounded('Región ', 'FINREGION', 150) : 'Metropolitana',
    instructions: stress ? bounded('INICIOINSTRUCCIONES ', 'FININSTRUCCIONES', 10_000) : 'INSTRUCCIONORIGINAL · Entregar materiales marcados.', logo_id: logoId,
    items: Array.from({ length: stress ? 6 : 2 }, (_, index) => ({ id: randomUUID(), catalog_id: '',
      name: stress ? bounded(index < 2 ? 'Útil repetido ' : `Útil ${index} `, index < 2 ? 'FINNOMBRECOMUN' : `FINNOMBRE${index}`, 300) : `Artículo de prueba ${index + 1}`,
      quantity: index === 0 ? '9999.999' : '2', unit: index === 0 ? 'm' : 'caja', category: index < 3 ? 'Materiales del curso' : 'Artes y organización',
      note: stress ? bounded('INICIONOTA ', `FINNOTA${index}`, 2000) : '', attributes: { numero_hojas: { name: 'Número de hojas', unit: 'hojas', value: 100 } } })),
  };
}
async function seed(context: BrowserContext, data: ReturnType<typeof content>, publish = true) {
  const { id } = await api(context, 'POST', '/lists', { content: data });
  if (publish) await publishList(context, id);
  return id;
}
async function publishList(context: BrowserContext, id: string) {
  const draft = await api(context, 'GET', `/lists/${id}/draft`);
  return api(context, 'POST', `/lists/${id}/publish`, { revision: draft.revision, current_version: draft.current_version, request_id: randomUUID() });
}
async function download(page: Page, filename: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: /Descargar PDF/ }).click();
  const file = `${artifacts}/${filename}`; await (await pending).saveAs(file); return file;
}
async function examine(file: string, grayscale = false) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), useSystemFonts: true });
  try {
    const document = await task.promise;
    let text = '', chromaticPixels = 0, printableCheckboxes = 0;
    const bounds: unknown[] = [];
    const checkboxPages = [];
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number), viewport = page.getViewport({ scale: 1 });
      const checkboxes = await inspectCheckboxes(page);
      printableCheckboxes += checkboxes.printable;
      checkboxPages.push({ page: number, ...checkboxes });
      for (const item of (await page.getTextContent()).items) if ('str' in item) {
        text += item.str + ' ';
        if (item.str.trim() && (item.transform[4] < -1 || item.transform[4] + item.width > viewport.width + 1 || item.transform[5] < -1 || item.transform[5] > viewport.height + 1)) {
          bounds.push({ page: number, text: item.str, x: item.transform[4], y: item.transform[5], width: item.width });
        }
      }
      if (grayscale) {
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const context = canvas.getContext('2d');
        await page.render({ canvasContext: context as never, viewport }).promise;
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) - Math.min(pixels[i], pixels[i + 1], pixels[i + 2]) > 8) chromaticPixels++;
      }
      page.cleanup();
    }
    return { pages: document.numPages, text, bounds, chromaticPixels, printableCheckboxes, checkboxPages };
  } finally { await task.destroy(); }
}

for (const layout of ['Dos columnas', 'Barra lateral', 'Fichas']) {
  test(`PDF boundary fields, repeated supplies and colored logo: ${layout}`, async ({ page, context }) => {
    test.setTimeout(240_000);
    const browserErrors: string[] = []; page.on('pageerror', error => browserErrors.push(error.message));
    await account(context); const data = content(await logo(context)); const id = await seed(context, data);
    await page.goto(`/listas/${id}`); await expect(page.getByRole('heading', { name: data.school, exact: true })).toBeVisible();
    await page.getByRole('button', { name: layout, exact: true }).click();
    await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption(layout === 'Dos columnas' ? 'A4' : 'LETTER');
    const results = [];
    for (const color of [true, false]) {
      await page.getByLabel('En color', { exact: true }).setChecked(color);
      const filename = `Boundary-${layout.replaceAll(' ', '-')}-${color ? 'color' : 'bw'}.pdf`;
      const report = await examine(await download(page, filename), !color);
      results.push({ filename, ...report });
      for (const marker of ['FINCOLEGIO', 'FINCURSO', 'FINCOMUNA', 'FINREGION', 'FININSTRUCCIONES', 'FINNOMBRECOMUN', ...Array.from({ length: 6 }, (_, index) => `FINNOTA${index}`)]) expect.soft(report.text, `${filename}: missing ${marker}`).toContain(marker);
      expect.soft(report.bounds.slice(0, 12), `${filename}: ${report.bounds.length} text items exceed page bounds`).toEqual([]);
      expect.soft(report.text.match(/FINNOMBRECOMUN/g)?.length, 'repeated supplies are both printed').toBe(2);
      expect.soft(report.printableCheckboxes, `${filename}: one printable checkbox per item occurrence`).toBe(data.items.length);
      expect.soft(report.checkboxPages.flatMap(page => page.offPaper), `${filename}: checklist boxes must remain on paper`).toEqual([]);
      if (!color) expect.soft(report.chromaticPixels, 'black-and-white PDF must also convert the colored logo').toBe(0);
    }
    writeFileSync(`${artifacts}/boundary-${layout.replaceAll(' ', '-')}-validation.json`, JSON.stringify(results, null, 2));
    expect(browserErrors).toEqual([]);
  });
}

test('PDF drafts, historical versions, archives and preference overrides', async ({ page, context }) => {
  test.setTimeout(180_000);
  const user = await account(context), data = content('', false), id = await seed(context, data, false);
  await page.goto(`/editar/${id}`);
  await expect(page.getByLabel('Colegio', { exact: true })).toHaveValue(data.school);
  const draft = await examine(await download(page, 'Boundary-draft.pdf'));
  expect(draft.text).toContain('BORRADOR'); expect(draft.text).not.toContain('Versión 0');
  await publishList(context, id);
  const changed = await api(context, 'GET', `/lists/${id}/draft`);
  changed.content.instructions = 'INSTRUCCIONNUEVA · Se necesitan cambios.';
  await api(context, 'PUT', `/lists/${id}/draft`, { content: changed.content, revision: changed.revision }); await publishList(context, id);
  const preferences = { layout: 'cards', paper: 'A4', color: false };
  await api(context, 'PATCH', '/auth/me', { display_name: user.display_name, preferences });
  await page.goto(`/listas/${id}?version=1`);
  await expect(page.getByRole('button', { name: 'Fichas', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Papel', exact: true })).toHaveValue('A4');
  await expect(page.getByLabel('En color', { exact: true })).not.toBeChecked();
  await page.getByRole('button', { name: 'Dos columnas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('LETTER');
  const historical = await examine(await download(page, 'Boundary-historical.pdf'));
  expect(historical.text).toContain('Versión 1'); expect(historical.text).toContain('INSTRUCCIONORIGINAL'); expect(historical.text).not.toContain('INSTRUCCIONNUEVA');
  expect((await api(context, 'GET', '/auth/me')).user.preferences).toEqual(preferences);
  await page.getByRole('button', { name: 'Guardar estas preferencias', exact: true }).click();
  await expect.poll(async () => (await api(context, 'GET', '/auth/me')).user.preferences.layout).toBe('columns');
  await api(context, 'POST', `/lists/${id}/archive`, { archived: true });
  await page.goto(`/listas/${id}`);
  const archived = await examine(await download(page, 'Boundary-archived.pdf'));
  expect(archived.text).toContain('LISTA ARCHIVADA'); expect(archived.text).toContain('Versión 2');
  writeFileSync(`${artifacts}/boundary-states-validation.json`, JSON.stringify({ draft, historical, archived }, null, 2));
});

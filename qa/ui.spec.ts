import { test, expect, BrowserContext } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
const artifacts = '../.local/qa/ui';
mkdirSync(artifacts, { recursive: true });
let storage: Awaited<ReturnType<BrowserContext['storageState']>>;
let listId: string;
async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers: { 'X-Requested-With': 'lista-escolar' } });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: environment.base_url });
  await api(context, 'POST', '/auth/register', { display_name: 'Comunidad Los Aromos', email: `visual-${randomUUID()}@example.invalid`, password: 'QA-visual-password-2026' });
  await api(context, 'POST', '/admin/login', environment.admin);
  const materials = [
    ['Cuadernos', 'Cuaderno universitario, 100 hojas, cuadriculado 7 mm', '4', 'unidad', 'Forro del color que prefieras.'],
    ['Cuadernos', 'Cuaderno de composición, 80 hojas', '1', 'unidad', 'Para comunicaciones entre la familia y el colegio.'],
    ['Escritura', 'Lápiz grafito', '3', 'unidad', ''],
    ['Escritura', 'Goma de borrar', '2', 'unidad', ''],
    ['Escritura', 'Sacapuntas con depósito', '1', 'unidad', ''],
    ['Arte y dibujo', 'Lápices de colores, 12 colores', '1', 'caja', 'Marcados con nombre.'],
    ['Arte y dibujo', 'Block de dibujo', '1', 'unidad', ''],
    ['Pegado y corte', 'Pegamento en barra, 40 g', '2', 'unidad', ''],
    ['Pegado y corte', 'Tijera escolar de punta redonda', '1', 'unidad', ''],
    ['Organización', 'Carpeta con elástico', '2', 'unidad', 'Puedes reutilizar las del año anterior.'],
  ];
  for (const [index, school] of ['Colegio Los Aromos', 'Escuela Gabriela Mistral', 'Colegio del Valle'].entries()) {
    const data = { school, class_name: ['5° básico A', '2° básico', '7° básico B'][index], school_year: 2027, comuna: 'Santiago', region: 'Metropolitana de Santiago', logo_id: '',
      instructions: 'Marcar todos los útiles con nombre y curso. Prioriza reutilizar los materiales que ya tengas en buen estado. No se exige una marca específica.',
      items: materials.map(([category, name, quantity, unit, note]) => ({ id: randomUUID(), catalog_id: '', name, quantity, unit, note, category, attributes: {} })) };
    const created = await api(context, 'POST', '/lists', { content: data });
    await api(context, 'POST', `/lists/${created.id}/publish`, { revision: 1, current_version: 0, request_id: randomUUID() });
    if (!index) listId = created.id;
  }
  storage = await context.storageState(); await context.close();
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }, { name: 'narrow', width: 320, height: 800 }]) {
  for (const route of ['search', 'editor', 'published', 'sharing', 'account', 'admin']) {
    test(`${viewport.name}: ${route}, accessibility and viewport`, async ({ browser }) => {
      const context = await browser.newContext({ baseURL: environment.base_url, storageState: storage, viewport });
      const page = await context.newPage();
      const paths: Record<string, string> = { search: '/', editor: `/editar/${listId}`, published: `/listas/${listId}`, sharing: `/listas/${listId}/compartir`, account: '/cuenta', admin: '/admin' };
      const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
      await page.goto(paths[route]);
      await expect(page.locator('main h1')).toBeVisible();
      if (route === 'search') await expect(page.locator(`a[href="/listas/${listId}"]`).first()).toBeVisible();
      if (route === 'editor') {
        await expect(page.locator('.item-editor')).toHaveCount(10);
        await expect(page.locator('.catalog-result')).not.toHaveCount(0);
      }
      if (route === 'published') await expect(page.locator('.checklist-item')).toHaveCount(10);
      if (route === 'sharing') await expect(page.getByRole('button', { name: 'Crear invitación' })).toBeVisible();
      await expect(page.locator('.notice.error')).toHaveCount(0);
      await page.screenshot({ path: `${artifacts}/${viewport.name}-${route}.png`, fullPage: true });
      await page.screenshot({ path: `${artifacts}/${viewport.name}-${route}-viewport.png`, fullPage: false });
      const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: window.innerWidth,
        elements: Array.from(document.querySelectorAll('main *')).filter(element => { const box = element.getBoundingClientRect(); return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1); }).slice(0, 8).map(element => element.outerHTML.slice(0, 160)) }));
      expect(overflow.page, JSON.stringify(overflow)).toBeLessThanOrEqual(viewport.width + 1);
      const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
      writeFileSync(`${artifacts}/${viewport.name}-${route}-axe.json`, JSON.stringify(accessibility.violations, null, 2));
      expect(accessibility.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
      expect(failures).toEqual([]); await context.close();
    });
  }
}

test('modal keyboard focus, Escape and no dynamic service-worker caching', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: environment.base_url, storageState: storage });
  const page = await context.newPage(); await page.goto(`/listas/${listId}`);
  await page.getByRole('button', { name: 'Reportar un problema' }).click();
  const dialog = page.getByRole('dialog', { name: 'Reportar contenido' });
  await expect(dialog.getByRole('button', { name: 'Cerrar reporte' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.keyboard.press('Escape'); await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Reportar un problema' })).toBeFocused();
  const cached = await page.evaluate(async () => { const names = await caches.keys(); const urls: string[] = []; for (const name of names) for (const request of await (await caches.open(name)).keys()) urls.push(request.url); return urls; });
  expect(cached.filter(url => /\/api\/|\/listas\/|\/editar\//.test(url))).toEqual([]);
  await context.setOffline(true); await page.reload();
  await expect(page.getByText(/conexión/i).first()).toBeVisible();
  await expect(page.locator('.checklist-item')).toHaveCount(0);
  await context.close();
});

import { test, expect, BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const artifacts = '../.local/qa/attribute-additions';
mkdirSync(artifacts, { recursive: true });
const headers = { 'X-Requested-With': 'lista-escolar' };
interface Category { id: number; slug: string; name: string }
interface Supply {
  name: string;
  category: string;
  catalog_id: string | null;
  attributes: Record<string, { value: string | number | boolean }>;
}
interface Draft { content: { items: Supply[] } }
async function api<T>(context: BrowserContext, method: string, path: string, data?: unknown): Promise<T> {
  const response = await context.request.fetch('/api' + path, { method, data, headers });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
async function editor(page: Page, context: BrowserContext, width = 1366) {
  await page.setViewportSize({ width, height: width === 1366 ? 768 : width === 390 ? 844 : 800 });
  await api(context, 'POST', '/auth/register', {
    email: `expansion-${randomUUID()}@example.invalid`, password: 'QA-expanded-catalog-2026', display_name: 'Familia del curso',
  });
  const { id } = await api<{ id: string }>(context, 'POST', '/lists', {
    content: { school: 'Colegio Los Aromos', class_name: '5° básico A', school_year: 2027,
      comuna: 'Santiago', region: 'Metropolitana', instructions: '', logo_id: '', items: [] },
  });
  await page.goto(`/editar/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio Los Aromos');
  if (width <= 720) await page.getByRole('button', { name: '＋ Agregar útiles', exact: true }).click();
  await expect(page.locator('#category-chooser-heading')).toBeVisible();
  if (width > 720) await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
  return id;
}
async function change(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(response => new URL(response.url()).pathname === '/api/catalog/browse' && response.ok());
  await action(); await response;
  await expect(page.locator('.catalog-loading')).toHaveCount(0);
  if (await page.locator('.facet-fields').count()) await expect(page.locator('.facet-fields')).toHaveAttribute('aria-busy', 'false');
  else await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
}
async function categories(page: Page) {
  const sidenav = page.locator('#catalog-sidenav');
  if (!await sidenav.getByRole('group', { name: 'Categorías del catálogo' }).isVisible()) {
    if (await sidenav.isVisible()) await sidenav.getByRole('button', { name: 'Volver a categorías', exact: true }).click();
    else await page.locator('.catalog-breadcrumb button').click();
    await expect(page.locator('#category-chooser-heading')).toBeFocused();
  }
  return sidenav;
}
async function chooseCategory(page: Page, name: string) {
  const sidenav = await categories(page);
  await change(page, () => sidenav.getByRole('button', { name, exact: true }).click());
  await expect(page.locator('#catalog-filter-heading')).toBeFocused();
}
async function chooseAttribute(page: Page, name: string, value: string) {
  const field = page.getByRole('group', { name, exact: true });
  const select = field.getByRole('combobox');
  if (await select.count()) {
    const label = new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)');
    const raw = await select.getByRole('option', { name: label }).getAttribute('value');
    await change(page, () => select.selectOption(raw!));
  } else await change(page, () => field.getByRole('radio', { name: value, exact: true }).check());
}
async function savedItems(context: BrowserContext, id: string, count: number) {
  await expect.poll(async () => (await api<Draft>(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(count);
  return (await api<Draft>(context, 'GET', `/lists/${id}/draft`)).content.items;
}
async function add(page: Page, name: string) {
  await page.getByRole('button', { name: 'Agregar ' + name, exact: true }).click();
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${artifacts}/${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  writeFileSync(`${artifacts}/${name}-axe.json`, JSON.stringify(result.violations, null, 2));
  expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
}

interface SeedItem { category: string; name: string; type: string; attributes: Record<string, string | number | boolean> }
const additions = JSON.parse(readFileSync('../docs/catalog-attribute-additions-2026-11-10.json', 'utf8')) as { items: SeedItem[] };
function seeded(predicate: (item: SeedItem) => boolean): SeedItem {
  const item = additions.items.find(predicate);
  if (!item) throw new Error('Expected researched variant is absent from the seed dataset');
  return item;
}

test('paper pack counts and fractional sheet dimensions remain separate from requested quantity', async ({ page, context }) => {
  const id = await editor(page, context);
  const item = seeded(item => item.category === 'papeles' && item.attributes.numero_hojas === 18 && item.attributes.numero_colores === 14);
  await chooseCategory(page, 'Papeles y cartulinas');
  await chooseAttribute(page, 'Tipo', 'Cartulina');
  await chooseAttribute(page, 'Número de hojas', '18 hojas');
  await chooseAttribute(page, 'Número de colores', '14 colores');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, item.name);
  await savedItems(context, id, 1);
  await page.locator('.supply-row').getByRole('textbox', { name: 'Cantidad', exact: true }).fill('2');
  await expect.poll(async () => (await api<{ content: { items: { quantity: string }[] } }>(context, 'GET', `/lists/${id}/draft`)).content.items[0].quantity).toBe('2');
  const [saved] = await savedItems(context, id, 1);
  expect(saved.attributes.numero_hojas.value).toBe(18);
  expect(saved.attributes.numero_colores.value).toBe(14);
  expect(saved.attributes.dimension_menor_cm.value).toBe(26.5);
  expect(saved.attributes.dimension_mayor_cm.value).toBe(37.5);
  await capture(page, 'desktop-paper-pack');
  await page.reload();
  await expect(page.locator('.supply-row').getByRole('textbox', { name: 'Cantidad', exact: true })).toHaveValue('2');
});

test('a false spiral requirement filters actual false values and survives saving', async ({ page, context }) => {
  const id = await editor(page, context);
  const item = seeded(item => item.category === 'cuadernos' && item.attributes.con_espiral === false);
  await chooseCategory(page, 'Cuadernos');
  await chooseAttribute(page, 'Tipo de cuaderno', item.type);
  await chooseAttribute(page, 'Con espiral', 'No');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, item.name);
  const [saved] = await savedItems(context, id, 1);
  expect(saved.attributes.con_espiral.value).toBe(false);
  expect(saved.attributes.numero_hojas.value).toBe(100);
  await capture(page, 'desktop-without-spiral');
});

test('new custom marker shape and thickness are independent and clear when type becomes incompatible', async ({ page, context }) => {
  const id = await editor(page, context);
  const allCategories = await api<Category[]>(context, 'GET', '/catalog/categories');
  await page.getByRole('button', { name: /Útil personalizado/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Útil personalizado', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Marcador para la actividad');
  await dialog.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(String(allCategories.find(category => category.slug === 'escritura')!.id));
  const type = dialog.getByRole('combobox', { name: 'Tipo', exact: true });
  await type.selectOption('Marcador');
  await dialog.getByLabel('Tipo de punta', { exact: true }).fill('Redonda');
  await dialog.getByLabel('Grosor de punta', { exact: true }).fill('Fina');
  await type.selectOption('Grafito');
  await expect(dialog.getByLabel('Tipo de punta', { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel('Grosor de punta', { exact: true })).toHaveCount(0);
  await type.selectOption('Marcador');
  await expect(dialog.getByLabel('Tipo de punta', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Grosor de punta', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Tipo de punta', { exact: true }).fill('Redonda');
  await dialog.getByLabel('Grosor de punta', { exact: true }).fill('Fina');
  await dialog.getByRole('checkbox', { name: 'Compartir con el catálogo' }).uncheck();
  await capture(page, 'desktop-marker-custom');
  await dialog.getByRole('button', { name: 'Agregar útil', exact: true }).click();
  await expect(dialog).toBeHidden();
  const [saved] = await savedItems(context, id, 1);
  expect(saved.attributes.tipo_punta.value).toBe('Redonda');
  expect(saved.attributes.grosor_punta.value).toBe('Fina');
  expect(saved.catalog_id).toBeFalsy();
});

test('tape width in millimeters and roll length in meters filter together', async ({ page, context }) => {
  const id = await editor(page, context);
  const item = seeded(item => item.category === 'pegado-y-corte' && item.attributes.ancho_mm === 18 && item.attributes.largo_m === 30);
  await chooseCategory(page, 'Pegado y corte');
  await chooseAttribute(page, 'Tipo', 'Cinta adhesiva');
  await chooseAttribute(page, 'Ancho', '18 mm');
  await chooseAttribute(page, 'Largo', '30 m');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, item.name);
  const [saved] = await savedItems(context, id, 1);
  expect(saved.attributes.ancho_mm.value).toBe(18);
  expect(saved.attributes.largo_m.value).toBe(30);
  expect(saved.attributes.largo_cm).toBeUndefined();
  await capture(page, 'desktop-tape-dimensions');
});

for (const width of [390, 320]) {
  test(`hygiene package attributes can be filtered and added on ${width}px mobile`, async ({ page, context }) => {
    const id = await editor(page, context, width);
    const item = seeded(item => item.category === 'aseo' && item.type === 'Toallas húmedas' && item.attributes.unidades_por_envase === 80);
    await chooseCategory(page, 'Aseo');
    await chooseAttribute(page, 'Tipo', 'Toallas húmedas');
    await chooseAttribute(page, 'Unidades por envase', '80 unidades');
    await capture(page, `${width}-hygiene-filters`);
    await page.getByRole('button', { name: 'Ver 1 útil', exact: true }).click();
    await expect(page.locator('.catalog-result')).toHaveCount(1);
    await add(page, item.name);
    expect((await savedItems(context, id, 1))[0].attributes.unidades_por_envase.value).toBe(80);
    await capture(page, `${width}-hygiene-result`);
    await page.getByRole('button', { name: /Ver mi lista/ }).click();
    await page.reload();
    await expect(page.locator('.supply-row')).toHaveCount(1);
    expect((await savedItems(context, id, 1))[0].attributes.unidades_por_envase.value).toBe(80);
  });
}

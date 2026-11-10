import { test, expect, BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifacts = '../.local/qa/catalog-expansion';
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

test('paper browsing combines boolean and text facets and saves their original types', async ({ page, context }) => {
  const id = await editor(page, context);
  await chooseCategory(page, 'Papeles y cartulinas');
  await chooseAttribute(page, 'Tipo', 'Goma EVA');
  await chooseAttribute(page, 'Autoadhesivo', 'No');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, 'Goma EVA de colores');
  let items = await savedItems(context, id, 1);
  expect(items[0].attributes.autoadhesivo.value).toBe(false);
  expect(items[0].attributes.tipo_papel.value).toBe('Goma EVA');

  await chooseAttribute(page, 'Autoadhesivo', 'Sí');
  await expect(page.locator('.catalog-result')).toHaveCount(2);
  await chooseAttribute(page, 'Acabado', 'Escarchado');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, 'Goma EVA escarchada autoadhesiva');
  items = await savedItems(context, id, 2);
  expect(items[1].attributes.autoadhesivo.value).toBe(true);
  expect(items[1].attributes.acabado.value).toBe('Escarchado');

  // A different paper type discards EVA-only constraints before applying its format.
  await chooseAttribute(page, 'Tipo', 'Papel');
  await expect(page.getByRole('group', { name: 'Autoadhesivo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Acabado', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Quitar filtro (Autoadhesivo|Acabado):/ })).toHaveCount(0);
  await chooseAttribute(page, 'Formato', 'Oficio');
  await chooseAttribute(page, 'Color', 'Blanco');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await add(page, 'Papel blanco tamaño oficio');
  items = await savedItems(context, id, 3);
  expect(items[2].attributes.formato.value).toBe('oficio');
  expect(items[2].attributes.tipo_papel.value).toBe('Papel');
  expect(items.every(item => item.category === 'Papeles y cartulinas')).toBe(true);
  await capture(page, 'desktop-paper-facets');
  await page.reload();
  await expect(page.locator('.supply-row')).toHaveCount(3);
});

test('music supplies preserve numeric notes and custom type changes discard incompatible measurements', async ({ page, context }) => {
  const id = await editor(page, context);
  await chooseCategory(page, 'Música');
  await chooseAttribute(page, 'Tipo', 'Metalófono');
  await chooseAttribute(page, 'Número de notas', '25 notas');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await expect(page.locator('.comparison-value[data-attribute=numero_notas]')).toContainText('25 notas');
  await expect(page.locator('.comparison-heading [data-attribute=numero_hojas]')).toHaveCount(0);
  await add(page, 'Metalófono cromático de 25 notas');
  let items = await savedItems(context, id, 1);
  expect(items[0].attributes.numero_notas.value).toBe(25);
  expect(items[0].attributes.tipo_musica.value).toBe('Metalófono');
  await capture(page, 'desktop-music-facets');

  const allCategories = await api<Category[]>(context, 'GET', '/catalog/categories');
  await page.getByRole('button', { name: /Útil personalizado/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Útil personalizado', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Metalófono personal del curso');
  await dialog.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(String(allCategories.find(category => category.slug === 'musica')!.id));
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Metalófono');
  await dialog.getByLabel('Número de notas (notas)', { exact: true }).fill('25');
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Flauta');
  await expect(dialog.getByLabel('Número de notas (notas)', { exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Metalófono');
  await expect(dialog.getByLabel('Número de notas (notas)', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Número de notas (notas)', { exact: true }).fill('25');
  await dialog.getByRole('checkbox', { name: 'Compartir con el catálogo' }).uncheck();
  await capture(page, 'desktop-custom-music');
  await dialog.getByRole('button', { name: 'Agregar útil', exact: true }).click();
  await expect(dialog).toBeHidden();
  items = await savedItems(context, id, 2);
  expect(items[1].attributes.numero_notas.value).toBe(25);
  expect(items[1].attributes.tipo_musica.value).toBe('Metalófono');
  expect(items[1].catalog_id).toBeFalsy();
});

test('each new category has a distinct icon and searchable aliases that add the intended supply', async ({ page, context }) => {
  const id = await editor(page, context);
  const examples = [
    { category: 'Manualidades', query: 'palos de helado', name: 'Palitos de helado', typeKey: 'tipo_manualidades', type: 'Palitos' },
    { category: 'Material didáctico', query: 'tangrama 7 piezas', name: 'Tangram de 7 piezas', typeKey: 'tipo_material_didactico', type: 'Tangram' },
    { category: 'Música', query: 'metalofono 25 teclas', name: 'Metalófono cromático de 25 notas', typeKey: 'tipo_musica', type: 'Metalófono' },
    { category: 'Tecnología', query: 'pendrive 8gb', name: 'Memoria USB de 8 GB', typeKey: 'tipo_tecnologia', type: 'Memoria USB' },
    { category: 'Lectura y consulta', query: 'diccionario castellano', name: 'Diccionario de lengua española', typeKey: 'tipo_lectura_y_consulta', type: 'Diccionario' },
  ];
  const sidenav = page.locator('#catalog-sidenav');
  const fallback = await sidenav.getByRole('button', { name: 'Otros', exact: true }).locator('svg path').getAttribute('d');
  const paths = new Set<string>();
  for (const example of examples) {
    const icon = sidenav.getByRole('button', { name: example.category, exact: true }).locator('app-category-icon');
    await expect(icon).toHaveAttribute('aria-hidden', 'true');
    const path = await icon.locator('svg path').getAttribute('d');
    expect(path).toBeTruthy(); expect(path).not.toBe(fallback); paths.add(path!);
  }
  expect(paths.size).toBe(examples.length);
  for (const [index, example] of examples.entries()) {
    if (index) await change(page, () => page.getByLabel('Buscar en catálogo', { exact: true }).fill(''));
    await chooseCategory(page, example.category);
    await change(page, () => page.getByLabel('Buscar en catálogo', { exact: true }).fill(example.query));
    await expect(page.locator('.catalog-result')).toHaveCount(1);
    await add(page, example.name);
    const items = await savedItems(context, id, index + 1);
    expect(items[index].name).toBe(example.name);
    expect(items[index].category).toBe(example.category);
    expect(items[index].attributes[example.typeKey].value).toBe(example.type);
    expect(items[index].catalog_id).toBeTruthy();
  }
  const items = await savedItems(context, id, examples.length);
  expect(items[1].attributes.numero_piezas.value).toBe(7);
  expect(items[3].attributes.capacidad_gb.value).toBe(8);
  expect(items[4].attributes.idioma.value).toBe('Español');
});

for (const width of [390, 320]) {
  test(`expanded categories remain scrollable and searchable at ${width}px, with numeric filtering and adding`, async ({ page, context }) => {
    const id = await editor(page, context, width);
    const allCategories = await api<Category[]>(context, 'GET', '/catalog/categories');
    expect(allCategories.length).toBeGreaterThanOrEqual(14);
    const sidenav = page.locator('#catalog-sidenav');
    await expect(sidenav.locator('.category-option')).toHaveCount(allCategories.length + 1);
    const last = sidenav.locator('.category-option').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await sidenav.locator('.category-chooser-body').evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await capture(page, `${width}-category-scroll`);
    const search = sidenav.getByLabel('Buscar categoría', { exact: true });
    await search.fill('musica');
    await expect(sidenav.locator('.category-option')).toHaveCount(2);
    await expect(sidenav.getByRole('button', { name: 'Música', exact: true })).toBeVisible();
    await capture(page, `${width}-category-search`);
    await chooseCategory(page, 'Música');
    await chooseAttribute(page, 'Tipo', 'Metalófono');
    await chooseAttribute(page, 'Número de notas', '25 notas');
    await capture(page, `${width}-music-filters`);
    await page.getByRole('button', { name: 'Ver 1 útil', exact: true }).click();
    await expect(page.locator('.catalog-result')).toHaveCount(1);
    await add(page, 'Metalófono cromático de 25 notas');
    const items = await savedItems(context, id, 1);
    expect(items[0].attributes.numero_notas.value).toBe(25);
    await capture(page, `${width}-music-result`);
    await page.getByRole('button', { name: /Ver mi lista/ }).click();
    await expect(page.locator('.supply-row')).toHaveCount(1);
    await expect(page.locator('.supply-row').getByRole('textbox', { name: 'Útil', exact: true })).toHaveValue('Metalófono cromático de 25 notas');
    await page.reload();
    await expect(page.locator('.supply-row')).toHaveCount(1);
    await expect(page.locator('.supply-row').getByRole('textbox', { name: 'Útil', exact: true })).toHaveValue('Metalófono cromático de 25 notas');
  });
}

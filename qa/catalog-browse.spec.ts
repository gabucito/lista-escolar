import { test, expect, BrowserContext, Page, Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const artifacts = '../.local/qa/comparison-catalog';
mkdirSync(artifacts, { recursive: true });
const headers = { 'X-Requested-With': 'lista-escolar' };
async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers });
  expect(response.status(), `${path}: ${await response.text()}`).toBe(200);
  return response.json();
}
async function editor(page: Page, context: BrowserContext, width = 1366) {
  await page.setViewportSize({ width, height: width > 720 ? (width === 1366 ? 768 : 900) : width === 390 ? 844 : 800 });
  await api(context, 'POST', '/auth/register', { email: `browse-${randomUUID()}@example.invalid`, password: 'QA-catalog-browse-2026', display_name: 'Familia Los Aromos' });
  const { id } = await api(context, 'POST', '/lists', { content: { school: 'Colegio Los Aromos', class_name: '5° básico A', school_year: 2027, comuna: 'Santiago', region: 'Metropolitana', instructions: '', logo_id: '', items: [] } });
  await page.goto(`/editar/${id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio Los Aromos');
  if (width <= 720) await page.getByRole('button', { name: '＋ Agregar útiles', exact: true }).click();
  const sidenav = page.locator('#catalog-sidenav');
  await expect(sidenav).toBeVisible();
  await expect(page.locator('#category-chooser-heading')).toBeVisible();
  await expect(sidenav.getByRole('group', { name: 'Categorías del catálogo' })).toBeVisible();
  if (width > 720) await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
  else {
    await expect(sidenav.getByRole('button', { name: 'Todo el catálogo', exact: true })).toBeEnabled();
    await expect(page.locator('.picker-dialog .dialog-heading h2')).toHaveText('Categorías');
    await expect(sidenav.locator('.attribute-panel-heading')).toHaveCount(0);
  }
  return id as string;
}
async function change(page: Page, action: () => Promise<unknown>) {
  const done = page.waitForResponse(response => response.url().includes('/api/catalog/browse?') && response.ok());
  await action(); await done;
  await expect(page.locator('.catalog-loading')).toHaveCount(0);
  if (await page.locator('.facet-fields').count()) await expect(page.locator('.facet-fields')).toHaveAttribute('aria-busy', 'false');
  else await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${artifacts}/${name}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  writeFileSync(`${artifacts}/${name}-axe.json`, JSON.stringify(result.violations, null, 2));
  expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
}

async function openCategories(page: Page) {
  const sidenav = page.locator('#catalog-sidenav');
  if (!await sidenav.getByRole('group', { name: 'Categorías del catálogo' }).isVisible()) {
    if (await sidenav.isVisible()) await sidenav.getByRole('button', { name: 'Volver a categorías', exact: true }).click();
    else await page.locator('.catalog-breadcrumb button').click();
    await expect(page.locator('#category-chooser-heading')).toBeFocused();
  }
  return sidenav;
}
async function expectStateHeadingFocusContained(page: Page, headingId: string) {
  const picker = page.getByRole('dialog', { name: 'Agregar útiles', exact: true });
  const heading = picker.locator('#' + headingId);
  await heading.focus();
  await page.keyboard.press('Shift+Tab');
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('.picker-dialog'))).toBe(true);
  await page.keyboard.press('Tab');
  await expect(picker.getByRole('button', { name: 'Cerrar panel', exact: true })).toBeFocused();
  await heading.focus();
}
async function chooseCategory(page: Page, name: string) {
  const sidenav = await openCategories(page);
  await change(page, () => sidenav.getByRole('group', { name: 'Categorías del catálogo' }).getByRole('button', { name, exact: true }).click());
  await expect(page.locator('#catalog-filter-heading')).toBeFocused();
  await expect(sidenav.getByRole('group', { name: 'Categorías del catálogo' })).toHaveCount(0);
  if (page.viewportSize()!.width <= 720) {
    await expect(page.locator('.picker-dialog .dialog-heading h2')).toHaveText('Características');
    await expectStateHeadingFocusContained(page, 'catalog-filter-heading');
  }
}
async function openFilters(page: Page) {
  if (!await page.locator('#catalog-sidenav').count()) await page.locator('#catalog-filter-toggle').click();
}
function attributeGroup(page: Page, group: string) {
  return page.getByRole('group', { name: group, exact: true });
}
function optionLabel(value: string) {
  return new RegExp('^' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:\\s|$)');
}
async function attributeOption(page: Page, group: string, value: string) {
  const field = attributeGroup(page, group);
  const select = field.getByRole('combobox');
  return await select.count()
    ? select.getByRole('option', { name: optionLabel(value) })
    : field.getByRole('radio', { name: value, exact: true });
}
async function attributeControl(page: Page, group: string, value: string) {
  const field = attributeGroup(page, group);
  const select = field.getByRole('combobox');
  return await select.count() ? select : field.getByRole('radio', { name: value, exact: true });
}
async function expectAttributeSelected(page: Page, group: string, value: string) {
  const control = await attributeControl(page, group, value);
  if (await control.evaluate(element => element instanceof HTMLSelectElement)) {
    const option = await attributeOption(page, group, value);
    await expect(control).toHaveValue((await option.getAttribute('value'))!);
  } else await expect(control).toBeChecked();
}
async function chooseAttribute(page: Page, group: string, value: string) {
  const control = await attributeControl(page, group, value);
  if (await control.evaluate(element => element instanceof HTMLSelectElement)) {
    const option = await attributeOption(page, group, value);
    const raw = await option.getAttribute('value');
    await control.focus();
    await change(page, () => control.selectOption(raw!));
  } else await change(page, () => control.check());
}
async function results(page: Page) {
  if (page.viewportSize()!.width <= 720) {
    await page.getByRole('button', { name: /^Ver \d+ útil(?:es)?$/ }).click();
    await expect(page.locator('.picker-dialog .dialog-heading h2')).toHaveText('Agregar útiles');
  }
}


async function expectTouchTarget(control: Locator) {
  const box = await control.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}
async function inspectComparisonRows(page: Page, width: number) {
  const rows = page.locator('.catalog-result');
  await expect(rows).toHaveCount(5);
  const bounds = await page.locator('.catalog-scroll').boundingBox();
  const rowBoxes = await rows.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
  }));
  for (let index = 1; index < rowBoxes.length; index++) {
    expect(rowBoxes[index].x).toBeCloseTo(rowBoxes[0].x, 0);
    expect(rowBoxes[index].width).toBeCloseTo(rowBoxes[0].width, 0);
    expect(rowBoxes[index].y).toBeGreaterThanOrEqual(rowBoxes[index - 1].bottom - 1);
  }
  const fullyVisible = rowBoxes.filter(row => row.y >= bounds!.y - 1 && row.bottom <= bounds!.y + bounds!.height + 1).length;
  expect(fullyVisible, `complete comparison rows at ${width}px`).toBeGreaterThanOrEqual(width > 720 ? 5 : 3);
  if (width > 720) {
    for (const key of ['numero_hojas', 'cuadricula_mm']) {
      const header = page.locator(`.comparison-heading [data-attribute="${key}"]`);
      await expect(header).toBeVisible();
      const headingBox = await header.boundingBox();
      for (const row of await rows.all()) {
        const cell = row.locator(`.comparison-value[data-attribute="${key}"]`);
        const box = await cell.boundingBox();
        expect(box!.x + box!.width / 2).toBeCloseTo(headingBox!.x + headingBox!.width / 2, 0);
      }
    }
  } else {
    await expect(page.locator('.comparison-heading')).toBeHidden();
    for (const row of await rows.all()) {
      await row.scrollIntoViewIfNeeded();
      const add = row.locator('.add-catalog-item');
      await expectTouchTarget(add);
      const text = await row.locator('.catalog-description').boundingBox();
      const action = await add.boundingBox();
      const separate = text!.x + text!.width <= action!.x + 1 || text!.y + text!.height <= action!.y + 1;
      expect(separate, 'product name and Add action must not overlap').toBe(true);
      for (const key of ['numero_hojas', 'cuadricula_mm']) await expect(row.locator(`.comparison-value[data-attribute="${key}"] .comparison-label`)).toBeVisible();
    }
    for (const chip of await page.locator('.active-filters button').all()) await expectTouchTarget(chip);
    await rows.first().scrollIntoViewIfNeeded();
  }
}

for (const width of [1024, 1366, 1440, 390, 320]) {
  test(`category attributes ${width}: notebook filtering, independent drawer, adding and recovery`, async ({ page, context }) => {
    const id = await editor(page, context, width);
    const failures: string[] = []; page.on('pageerror', error => failures.push(error.message));
    const initialSidenav = await page.locator('#catalog-sidenav').boundingBox();
    const categoryOptions = await page.locator('#catalog-sidenav .category-options').boundingBox();
    const categoryOption = await page.locator('#catalog-sidenav').getByRole('button', { name: 'Cuadernos', exact: true }).boundingBox();
    expect(categoryOption!.width).toBeCloseTo(categoryOptions!.width, 0);
    if (width > 720) {
      await expect(page.locator('.catalog-workspace .catalog-result').first()).toBeVisible();
      const workspace = await page.locator('.catalog-workspace').boundingBox();
      expect(initialSidenav!.x + initialSidenav!.width).toBeLessThanOrEqual(workspace!.x + 1);
    } else {
      const picker = page.getByRole('dialog', { name: 'Agregar útiles', exact: true });
      await expect(picker.locator('#catalog-sidenav')).toBeVisible();
      await expect(page.locator('.catalog-workspace')).toHaveCount(0);
      // The state heading is outside the catalog body; Escape still returns to results.
      await expectStateHeadingFocusContained(page, 'category-chooser-heading');
      await page.keyboard.press('Escape');
      await expect(picker).toBeVisible();
      await expect(picker.locator('#catalog-sidenav')).toHaveCount(0);
      await expect(picker.locator('#catalog-filter-toggle')).toBeFocused();
      await picker.locator('.catalog-breadcrumb button').click();
      await expect(picker.locator('#category-chooser-heading')).toBeFocused();
    }
    if (width <= 720) for (const category of await page.locator('#catalog-sidenav .category-option').all()) await expectTouchTarget(category);
    await capture(page, `${width}-initial-categories`);
    await chooseCategory(page, 'Cuadernos');
    const attributeSidenav = await page.locator('#catalog-sidenav').boundingBox();
    expect(attributeSidenav!.x).toBeCloseTo(initialSidenav!.x, 0);
    expect(attributeSidenav!.width).toBeCloseTo(initialSidenav!.width, 0);
    await expect(page.getByRole('combobox', { name: /Subcategoría/ })).toHaveCount(0);
    await openFilters(page);
    await chooseAttribute(page, 'Tipo de cuaderno', 'Cuadriculado');
    await chooseAttribute(page, 'Formato', 'Universitario');
    await expect(await attributeControl(page, 'Formato', 'Universitario')).toBeFocused();
    await expect(await attributeOption(page, 'Tipo de cuaderno', 'Caligrafía')).toBeDisabled();
    if (width <= 720) {
      await capture(page, `${width}-notebook-filter-overview`);
      await results(page);
    }
    await inspectComparisonRows(page, width);
    await capture(page, `${width}-notebook-five-results`);
    await openFilters(page);
    await chooseAttribute(page, 'Número de hojas', '100 hojas');
    await chooseAttribute(page, 'Separación de la cuadrícula', '7 mm');
    await expect(page.locator('#catalog-sidenav').getByRole('button', { name: 'Volver a categorías', exact: true })).toBeInViewport();
    await expectAttributeSelected(page, 'Formato', 'Universitario');
    await capture(page, `${width}-notebook-filters`);
    await results(page);
    if (width > 720) {
      await page.getByRole('button', { name: 'Ocultar características', exact: true }).click();
      await expect(page.locator('#catalog-filter-toggle')).toBeFocused();
      await expect(page.locator('.attribute-drawer')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Quitar filtro Formato: Universitario', exact: true })).toBeVisible();
      // Catálogo must reveal categories even when its panel has been collapsed.
      await page.locator('.catalog-breadcrumb button').click();
      const sidenav = page.locator('#catalog-sidenav');
      await expect(page.locator('#category-chooser-heading')).toBeFocused();
      await expect(sidenav.getByRole('group', { name: 'Tipo de cuaderno', exact: true })).toHaveCount(0);
      await sidenav.getByRole('button', { name: 'Cuadernos', exact: true }).click();
      await expect(sidenav.getByRole('radio', { name: '7 mm', exact: true })).toBeChecked();
    }
    const rows = page.locator('.catalog-result');
    await expect(rows).toHaveCount(1);
    await expect(rows.first().locator('.comparison-value[data-attribute=numero_hojas]')).toContainText('100');
    await expect(rows.first().locator('.comparison-value[data-attribute=cuadricula_mm]')).toContainText('7 mm');
    await rows.first().getByRole('button').click();
    await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(1);
    const item = (await api(context, 'GET', `/lists/${id}/draft`)).content.items[0];
    expect(item.attributes.tipo_cuaderno.value).toBe('Cuadriculado');
    expect(item.attributes.formato.value).toBe('universitario');
    expect(item.attributes.numero_hojas.value).toBe(100);
    expect(item.attributes.cuadricula_mm.value).toBe(7);
    await capture(page, `${width}-notebook-results`);
    if (width <= 720) {
      // The same Catálogo action restores categories from the phone results view.
      await page.locator('.catalog-breadcrumb button').click();
      const sidenav = page.locator('#catalog-sidenav');
      await expect(page.locator('#category-chooser-heading')).toBeFocused();
      await sidenav.getByRole('button', { name: 'Cuadernos', exact: true }).click();
      await expect(sidenav.getByRole('radio', { name: '7 mm', exact: true })).toBeChecked();
    }
    await openFilters(page);
    // Changing type removes grid spacing even when its current constraint makes Rayado count zero.
    await expect(await attributeOption(page, 'Tipo de cuaderno', 'Rayado')).not.toBeDisabled();
    await chooseAttribute(page, 'Tipo de cuaderno', 'Rayado');
    await expect(page.getByRole('group', { name: 'Separación de la cuadrícula', exact: true })).toHaveCount(0);
    await results(page);
    await expect(page.getByRole('button', { name: /^Quitar filtro Separación/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Quitar filtro Formato: Universitario', exact: true })).toBeVisible();
    await expect(page.locator('.catalog-result').first()).toContainText('rayado');
    await change(page, () => page.getByLabel('Buscar en catálogo', { exact: true }).fill('inexistente-' + randomUUID()));
    await expect(page.getByRole('heading', { name: 'No hay útiles con esos filtros' })).toBeVisible();
    await change(page, () => page.getByRole('button', { name: 'Ver todo el catálogo', exact: true }).click());
    await expect(page.locator('.catalog-result')).toHaveCount(40);
    await chooseCategory(page, 'Otros');
    await expect(page.locator('#catalog-sidenav')).toContainText('Todavía no hay características disponibles');
    await results(page);
    // Earlier QA runs may already have shared an Otros item without any Type choices.
    const otherItems = await api(context, 'GET', '/catalog/browse?category=otros');
    await expect(page.locator('.catalog-result')).toHaveCount(otherItems.items.length);
    if (otherItems.total === 0) await expect(page.getByRole('heading', { name: 'No hay útiles con esos filtros' })).toBeVisible();
    else await expect(page.locator('.catalog-result').first()).toContainText(otherItems.items[0].name);
    await expect(page.locator(width <= 720 ? '.catalog-breadcrumb button' : '#catalog-heading')).toHaveText('Otros');
    await expect(page.locator('.facet-group')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: /Subcategoría/ })).toHaveCount(0);
    expect(failures).toEqual([]);
  });
}

test('catalog pagination preserves earlier rows, scroll and independent additions', async ({ page, context }) => {
  const id = await editor(page, context);
  await expect(page.locator('.catalog-result')).toHaveCount(40);
  const first = await page.locator('.catalog-result').first().getByRole('button').getAttribute('id');
  const total = (await api(context, 'GET', '/catalog/browse?limit=40')).total;
  expect(total).toBeGreaterThan(40);
  await change(page, () => page.getByRole('button', { name: 'Ver más útiles', exact: true }).click());
  await expect(page.locator('.catalog-result')).toHaveCount(Math.min(total, 80));
  if (total > 80) await expect(page.getByRole('button', { name: 'Ver más útiles', exact: true })).toBeFocused();
  else await expect(page.locator('.catalog-result').nth(40).getByRole('button')).toBeFocused();
  await expect(page.locator('.catalog-result').first().getByRole('button')).toHaveAttribute('id', first!);
  const add = page.locator('.catalog-result').nth(41).getByRole('button');
  await add.click(); await add.click();
  const results = page.locator('.catalog-scroll');
  const scroll = await results.evaluate(element => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Ocultar categorías', exact: true }).click();
  await openFilters(page);
  await page.keyboard.press('Escape');
  await expect(results).toHaveAttribute('aria-busy', 'false');
  expect(await results.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(add).toBeInViewport();
  await expect(page.locator('.catalog-result')).toHaveCount(Math.min(total, 80));
  await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(2);
  const items = (await api(context, 'GET', `/lists/${id}/draft`)).content.items;
  expect(items[0].id).not.toBe(items[1].id);
  expect(items[0].catalog_id).toBe(items[1].catalog_id);
});

test('boolean false is filterable and copied as false into the list', async ({ page, context }) => {
  const id = await editor(page, context);
  const tag = randomUUID().slice(0, 8);
  const category = (await api(context, 'GET', '/catalog/categories')).find((row: { slug: string }) => row.slug === 'escritura');
  for (const value of [true, false]) await api(context, 'POST', '/catalog', {
    name: `Lápiz Faceta ${tag} ${value ? 'con' : 'sin'} goma`, category_id: category.id,
    attributes: { tipo_escritura: 'Grafito', incluye_goma: value },
  });
  await chooseCategory(page, 'Escritura');
  await change(page, () => page.getByLabel('Buscar en catálogo', { exact: true }).fill(tag));
  await chooseAttribute(page, 'Incluye goma', 'No');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await expect(page.locator('.catalog-result')).toContainText('sin goma');
  await page.locator('.catalog-result').getByRole('button').click();
  await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(1);
  expect((await api(context, 'GET', `/lists/${id}/draft`)).content.items[0].attributes.incluye_goma.value).toBe(false);
});

test('loading more retains button focus and respects focus moved elsewhere during a request', async ({ page, context }) => {
  await editor(page, context);
  let requestStarted!: () => void;
  let release!: () => void;
  const waiting = new Promise<void>(resolve => requestStarted = resolve);
  const released = new Promise<void>(resolve => release = resolve);
  await page.route('**/api/catalog/browse?**', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'));
    const response = await route.fetch();
    const result = await response.json();
    if (offset === 40) result.total = Math.max(result.total, offset + result.items.length + 1);
    else if (offset > 40) {
      result.total = offset + result.items.length;
      requestStarted(); await released;
    }
    await route.fulfill({ response, json: result });
  });
  const more = page.getByRole('button', { name: 'Ver más útiles', exact: true });
  await change(page, () => more.click());
  await expect(more).toBeFocused();
  await more.click(); await waiting;
  const search = page.getByLabel('Buscar en catálogo', { exact: true });
  await search.focus(); release();
  await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
  await expect(search).toBeFocused();
  await expect(page.locator('#catalog-load-more')).toHaveCount(0);
});

test('a late search response cannot replace the latest attribute search', async ({ page, context }) => {
  await editor(page, context);
  const oldResult = await api(context, 'GET', '/catalog/browse?q=regla');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let requested!: () => void;
  const entered = new Promise<void>(resolve => requested = resolve);
  await page.route('**/api/catalog/browse?**', async route => {
    if (new URL(route.request().url()).searchParams.get('q') !== 'regla') return route.continue();
    requested(); await gate; await route.fulfill({ json: oldResult });
  });
  await page.getByLabel('Buscar en catálogo', { exact: true }).fill('regla'); await entered;
  await change(page, () => page.getByLabel('Buscar en catálogo', { exact: true }).fill('cuaderno univ 100 7mm'));
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await expect(page.locator('.catalog-result')).toContainText('Cuaderno universitario');
  const late = page.waitForResponse(response => new URL(response.url()).searchParams.get('q') === 'regla');
  release(); await late;
  await expect(page.getByLabel('Buscar en catálogo', { exact: true })).toHaveValue('cuaderno univ 100 7mm');
  await expect(page.locator('.catalog-result')).toHaveCount(1);
  await expect(page.locator('.catalog-result')).toContainText('Cuaderno universitario');
});


test('catalog and category-back navigation preserve filters and the working list', async ({ page, context }) => {
  const id = await editor(page, context);
  await page.locator('.catalog-result').first().getByRole('button').click();
  await chooseCategory(page, 'Geometría');
  await expect(page.getByRole('group', { name: 'Tipo', exact: true })).toBeVisible();
  await chooseAttribute(page, 'Tipo', 'Regla');
  await chooseAttribute(page, 'Largo', '30 cm');
  const matching = await api(context, 'GET', '/catalog/browse?' + new URLSearchParams({ category: 'geometria', attributes: JSON.stringify({ tipo_geometria: 'Regla', largo_cm: 30 }) }));
  expect(matching.total).toBeGreaterThan(0);
  await expect(page.locator('.catalog-result')).toHaveCount(matching.total);
  for (const row of await page.locator('.catalog-result').all()) await expect(row.locator('.comparison-value[data-attribute=largo_cm]')).toContainText('30 cm');
  await expect(page.locator('.comparison-heading [data-attribute=largo_cm]')).toContainText('Largo');
  await expect(page.locator('.comparison-heading [data-attribute=numero_hojas]')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Formato', exact: true })).toHaveCount(0);
  await expect(page.locator('#catalog-heading')).toHaveText('Geometría');
  await expect(page.locator('.catalog-breadcrumb button')).toHaveText('Catálogo');
  await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(1);
  await capture(page, '1366-geometry');
  const before = (await api(context, 'GET', `/lists/${id}/draft`)).content.items;
  await page.locator('.catalog-breadcrumb button').click();
  const sidenav = page.locator('#catalog-sidenav');
  await expect(page.locator('#category-chooser-heading')).toBeFocused();
  await expect(page.locator('.catalog-result')).toHaveCount(matching.total);
  await expect(page.getByRole('button', { name: 'Quitar filtro Largo: 30 cm', exact: true })).toBeVisible();
  await sidenav.getByLabel('Buscar categoría', { exact: true }).fill('geometria');
  await expect(sidenav.locator('.category-option')).toHaveCount(2);
  await sidenav.getByLabel('Buscar categoría', { exact: true }).fill('categoría inexistente');
  await expect(sidenav.getByRole('status')).toHaveText('No hay categorías con ese nombre.');
  await expect(sidenav.getByRole('button', { name: 'Todo el catálogo', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sidenav).toHaveCount(0);
  await expect(page.locator('#catalog-filter-toggle')).toBeFocused();
  await openCategories(page);
  await expect(sidenav.getByLabel('Buscar categoría', { exact: true })).toHaveValue('');
  await sidenav.getByRole('button', { name: 'Geometría', exact: true }).click();
  await expect(sidenav.getByRole('radio', { name: '30 cm', exact: true })).toBeChecked();
  await sidenav.getByRole('button', { name: 'Volver a categorías', exact: true }).click();
  await expect(page.locator('#category-chooser-heading')).toBeFocused();
  await expect(sidenav.getByRole('group', { name: 'Largo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quitar filtro Largo: 30 cm', exact: true })).toBeVisible();
  await chooseCategory(page, 'Cuadernos');
  await expect(sidenav.getByRole('group', { name: 'Tipo de cuaderno', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Quitar filtro/ })).toHaveCount(0);
  expect((await api(context, 'GET', `/lists/${id}/draft`)).content.items).toEqual(before);
});

test('custom supply uses category attributes and discards incompatible type measurements', async ({ page, context }) => {
  // A known first category makes the initial-form regression independent of admin QA additions.
  await page.route('**/api/catalog/categories', async route => {
    const response = await route.fetch();
    const categories = await response.json();
    categories.sort((a: { slug: string }, b: { slug: string }) => Number(b.slug === 'geometria') - Number(a.slug === 'geometria'));
    await route.fulfill({ response, json: categories });
  });
  const id = await editor(page, context);
  const categories = await api(context, 'GET', '/catalog/categories');
  await page.getByRole('button', { name: /Útil personalizado/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Útil personalizado', exact: true });
  await dialog.getByLabel('Nombre', { exact: true }).fill('Regla personalizada QA');
  await expect(dialog.getByRole('combobox', { name: 'Categoría', exact: true })).toHaveValue(String(categories.find((c: {slug: string}) => c.slug === 'geometria').id));
  await expect(dialog.getByRole('combobox', { name: 'Tipo', exact: true })).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: /Subcategoría/ })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Regla');
  await dialog.getByLabel('Largo (cm)', { exact: true }).fill('25,5');
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Compás');
  await expect(dialog.getByLabel('Largo (cm)', { exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('Regla');
  await expect(dialog.getByLabel('Largo (cm)', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Largo (cm)', { exact: true }).fill('25,5');
  await dialog.getByRole('checkbox', { name: 'Compartir con el catálogo' }).check();
  await dialog.getByRole('button', { name: 'Agregar útil', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(1);
  const item = (await api(context, 'GET', `/lists/${id}/draft`)).content.items[0];
  expect(item.attributes.tipo_geometria.value).toBe('Regla');
  expect(item.attributes.largo_cm.value).toBe(25.5);
  expect(item.catalog_id).toBeTruthy();

  await page.getByRole('button', { name: /Útil personalizado/ }).click();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Útil sin tipo configurado');
  await dialog.getByRole('combobox', { name: 'Categoría', exact: true }).selectOption(String(categories.find((c: {slug: string}) => c.slug === 'otros').id));
  await expect(dialog.getByRole('combobox', { name: 'Tipo', exact: true })).toHaveCount(0);
  await dialog.getByRole('checkbox', { name: 'Compartir con el catálogo' }).check();
  await dialog.getByRole('button', { name: 'Agregar útil', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await api(context, 'GET', `/lists/${id}/draft`)).content.items.length).toBe(2);
  const withoutType = (await api(context, 'GET', `/lists/${id}/draft`)).content.items[1];
  expect(withoutType.attributes).toEqual({});
  expect(withoutType.catalog_id).toBeTruthy();
});

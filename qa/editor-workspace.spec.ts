import { test, expect, BrowserContext, Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const headers = { 'X-Requested-With': 'lista-escolar' };
async function editor(page: Page, context: BrowserContext) {
  let response = await context.request.post('/api/auth/register', { headers, data: { email: `workspace-${randomUUID()}@example.invalid`, password: 'QA-workspace-password-2026', display_name: 'Familia del curso' } });
  expect(response.status()).toBe(200);
  response = await context.request.post('/api/lists', { headers, data: { content: { school: 'Colegio Los Aromos', class_name: '5° básico A', school_year: 2027, comuna: 'Santiago', region: 'Metropolitana de Santiago', instructions: '', logo_id: '', items: [] } } });
  expect(response.status()).toBe(200); const { id } = await response.json();
  await page.goto(`/editar/${id}`); await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio Los Aromos');
  return id as string;
}
test('desktop workspace shows six comparison rows and Undo preserves independent occurrences', async ({ page, context }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); const id = await editor(page, context);
  const catalog = page.locator('.catalog-scroll'); await expect(catalog).toHaveAttribute('aria-busy', 'false');
  const visible = await catalog.evaluate(element => { const bounds = element.getBoundingClientRect(); return [...element.querySelectorAll('.catalog-result')].filter(row => { const rect = row.getBoundingClientRect(); return rect.top >= bounds.top - 1 && rect.bottom <= Math.min(bounds.bottom, innerHeight) + 1; }).length; });
  await page.screenshot({ path: '../.local/qa/ui/editor-workspace-desktop.png' });
  expect(visible, 'fully visible comparison rows at1366×768').toBeGreaterThanOrEqual(6);
  const add = catalog.locator('.catalog-result').first().getByRole('button'); await add.click(); await add.click();
  await expect(page.locator('.supply-row')).toHaveCount(2); await expect(page.locator('.save-state')).toHaveText('✓ Guardado');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: '../.local/qa/ui/editor-workspace-desktop-1440.png' });
  await page.setViewportSize({ width: 1366, height: 768 });
  let response = await context.request.get(`/api/lists/${id}/draft`); const before = (await response.json()).content.items as { id: string }[];
  expect(new Set(before.map(item => item.id)).size).toBe(2);
  await page.locator('.list-feedback').getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect(page.locator('.supply-row')).toHaveCount(1); await expect(page.locator('.save-state')).toHaveText('✓ Guardado');
  response = await context.request.get(`/api/lists/${id}/draft`); expect((await response.json()).content.items.map((item: { id: string }) => item.id)).toEqual([before[0].id]);
});
test('mobile picker preserves query scroll and focused supply when reopened', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await editor(page, context);
  const open = page.getByRole('button', { name: '＋ Agregar útiles', exact: true }); await open.click();
  const picker = page.getByRole('dialog', { name: 'Agregar útiles', exact: true });
  await expect(picker.locator('#category-chooser-heading')).toBeVisible();
  await picker.locator('#catalog-sidenav').getByRole('button', { name: 'Todo el catálogo', exact: true }).click();
  const search = picker.getByLabel('Buscar en catálogo');
  const response = page.waitForResponse(response => { const url = new URL(response.url()); return url.pathname === '/api/catalog/browse' && url.searchParams.get('q') === 'a'; }); await search.fill('a'); await response;
  const results = picker.locator('.catalog-scroll'); await expect(results).toHaveAttribute('aria-busy', 'false');
  const add = picker.locator('.catalog-result').nth(6).getByRole('button'); await add.click();
  const focusedId = await add.getAttribute('id'); const scroll = await results.evaluate(element => element.scrollTop); expect(scroll).toBeGreaterThan(0);
  await page.screenshot({ path: '../.local/qa/ui/editor-workspace-mobile-picker.png' });
  await picker.getByRole('button', { name: /Ver mi lista/ }).click(); await expect(picker).toBeHidden(); await expect(open).toBeFocused(); await open.click();
  await expect(search).toHaveValue('a'); await expect.poll(() => results.evaluate(element => element.scrollTop)).toBeCloseTo(scroll, 0); await expect(page.locator('#' + focusedId)).toBeFocused();
  await picker.getByRole('button', { name: /Útil personalizado/ }).click();
  const custom = page.getByRole('dialog', { name: 'Útil personalizado', exact: true }); await custom.getByLabel('Nombre', { exact: true }).fill('Temporal sin guardar'); await page.screenshot({ path: '../.local/qa/ui/editor-workspace-custom.png' }); await custom.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(picker).toBeVisible(); await expect(search).toHaveValue('a'); await picker.getByRole('button', { name: /Ver mi lista/ }).click(); await expect(page.locator('.supply-row')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
test('school details cancel safely and commit through the focused dialog', async ({ page, context }) => {
  const id = await editor(page, context); await page.getByRole('button', { name: 'Editar datos', exact: true }).click(); const dialog = page.getByRole('dialog', { name: 'Datos de la lista' });
  await dialog.getByLabel('Colegio', { exact: true }).fill('Cambio cancelado'); await page.screenshot({ path: '../.local/qa/ui/editor-workspace-metadata.png' }); await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio Los Aromos'); const response = await context.request.get(`/api/lists/${id}/draft`); expect((await response.json()).content.school).toBe('Colegio Los Aromos');
  await page.getByRole('button', { name: 'Editar datos', exact: true }).click(); await dialog.getByLabel('Colegio', { exact: true }).fill('Colegio actualizado'); await dialog.getByRole('button', { name: 'Guardar datos', exact: true }).click(); await expect(dialog).toBeHidden(); await expect(page.getByRole('heading', { level: 1 })).toContainText('Colegio actualizado');
  await page.locator('.catalog-secondary-actions').getByRole('button', { name: /Útil personalizado/ }).click();
  const custom = page.getByRole('dialog', { name: 'Útil personalizado', exact: true });
  await custom.getByLabel('Nombre', { exact: true }).fill('Cuaderno de música');
  await custom.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.screenshot({ path: '../.local/qa/ui/editor-workspace-custom-desktop.png' });
  await custom.getByRole('button', { name: 'Cancelar', exact: true }).click();
});


test('phone picker restores scrolled attribute choices and focused radio when reopened', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await editor(page, context);
  const open = page.getByRole('button', { name: '＋ Agregar útiles', exact: true });
  await open.click();
  const picker = page.getByRole('dialog', { name: 'Agregar útiles', exact: true });
  const sidenav = picker.locator('#catalog-sidenav');
  const categoryResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === '/api/catalog/browse' && url.searchParams.get('category') === 'cuadernos' && response.ok();
  });
  await sidenav.getByRole('button', { name: 'Cuadernos', exact: true }).click();
  await categoryResponse;
  await expect(sidenav.locator('.facet-fields')).toHaveAttribute('aria-busy', 'false');
  for (const [group, value] of [['Tipo de cuaderno', 'Cuadriculado'], ['Formato', 'Universitario'], ['Número de hojas', '100 hojas'], ['Separación de la cuadrícula', '7 mm']]) {
    const response = page.waitForResponse(response => response.url().includes('/api/catalog/browse?') && response.ok());
    const field = sidenav.getByRole('group', { name: group, exact: true });
    const select = field.getByRole('combobox');
    if (await select.count()) {
      const raw = await select.getByRole('option', { name: new RegExp('^' + value + '(?:\\s|$)') }).getAttribute('value');
      await select.focus();
      await select.selectOption(raw!);
    } else await field.getByRole('radio', { name: value, exact: true }).check();
    await response;
    await expect(sidenav.locator('.facet-fields')).toHaveAttribute('aria-busy', 'false');
  }
  const radio = sidenav.getByRole('radio', { name: '7 mm', exact: true });
  await expect(radio).toBeFocused();
  await expect(sidenav.getByRole('button', { name: 'Volver a categorías', exact: true })).toBeInViewport();
  const scroll = await sidenav.locator('.attribute-panel-body').evaluate(element => element.scrollTop);
  expect(scroll).toBeGreaterThan(0);
  await picker.getByRole('button', { name: 'Cerrar panel', exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(open).toBeFocused();
  await open.click();
  await expect(picker.locator('#catalog-filter-heading')).toBeVisible();
  await expect(radio).toBeChecked();
  await expect(radio).toBeFocused();
  await expect(radio).toBeInViewport();
  await expect(sidenav.getByRole('button', { name: 'Volver a categorías', exact: true })).toBeInViewport();
  await expect.poll(() => sidenav.locator('.attribute-panel-body').evaluate(element => element.scrollTop)).toBeCloseTo(scroll, 0);
  await page.screenshot({ path: '../.local/qa/comparison-catalog/390-restored-attribute-position.png' });
});


test('compact working list keeps three supplies visible and details remain editable', async ({ page, context }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  const id = await editor(page, context);
  const names = ['Cuaderno universitario cuadriculado 7 mm, 100 hojas', 'Lápiz grafito', 'Goma de borrar'];
  for (const name of names) {
    const catalogResponse = await context.request.get('/api/catalog/browse?' + new URLSearchParams({ q: name, limit: '100' }));
    expect(catalogResponse.status()).toBe(200);
    const supplies = (await catalogResponse.json()).items as { id: string; name: string }[];
    const supply = supplies.find(item => item.name === name);
    expect(supply, 'seed supply: ' + name).toBeTruthy();
    const response = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/catalog/browse' && url.searchParams.get('q') === name && response.ok();
    });
    await page.getByLabel('Buscar en catálogo', { exact: true }).fill(name);
    await response;
    await expect(page.locator('.catalog-scroll')).toHaveAttribute('aria-busy', 'false');
    await page.locator('#add-' + supply!.id).click();
  }
  await expect(page.locator('.supply-row')).toHaveCount(3);
  await expect(page.locator('.save-state')).toHaveText('✓ Guardado');
  const listBounds = await page.locator('.list-scroll').boundingBox();
  for (const row of await page.locator('.supply-row').all()) {
    const bounds = await row.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(listBounds!.y - 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(listBounds!.y + listBounds!.height + 1);
  }
  await page.screenshot({ path: '../.local/qa/comparison-catalog/1366-compact-working-list.png' });
  const notebook = page.locator('.supply-row').first();
  await notebook.getByLabel('Cantidad', { exact: true }).fill('2');
  await notebook.locator('summary').click();
  await notebook.getByRole('combobox', { name: 'Unidad', exact: true }).selectOption('caja');
  await notebook.getByLabel('Nota opcional', { exact: true }).fill('Marcar con nombre y curso');
  await notebook.locator('summary').click();
  await expect(notebook.getByRole('combobox', { name: 'Unidad', exact: true })).toBeHidden();
  await expect(notebook).toContainText('caja');
  await expect.poll(async () => {
    const response = await context.request.get(`/api/lists/${id}/draft`);
    const item = (await response.json()).content.items[0];
    return { quantity: item.quantity, unit: item.unit, note: item.note };
  }).toEqual({ quantity: '2', unit: 'caja', note: 'Marcar con nombre y curso' });
});

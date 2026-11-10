import { test, expect, BrowserContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
const password = 'QA-browser-account-2026';
async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers: { 'X-Requested-With': 'lista-escolar' } });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200); return response.json();
}
async function account(context: BrowserContext) {
  const email = `account-${randomUUID()}@example.invalid`;
  await api(context, 'POST', '/auth/register', { email, password, display_name: 'Familia QA' }); return email;
}
async function list(context: BrowserContext, visibility = 'public') {
  const data = { school: 'Escuela del Futuro QA', class_name: '3° básico', school_year: 2027, comuna: '', region: '', instructions: '', logo_id: '',
    items: [{ id: randomUUID(), catalog_id: '', name: 'Lápiz de prueba', quantity: '1', unit: 'unidad', category: 'Escritura', note: '', attributes: {} }] };
  const { id } = await api(context, 'POST', '/lists', { content: data, visibility });
  await api(context, 'POST', `/lists/${id}/publish`, { revision: 1, current_version: 0, request_id: randomUUID() }); return id;
}

test('profile preferences, one-off PDF overrides and explicit account deletion', async ({ page, context }) => {
  await account(context); const id = await list(context);
  await page.goto('/cuenta');
  await page.getByLabel('Nombre para mostrar').fill('Familia del Futuro');
  await page.getByRole('combobox', { name: 'Diseño de PDF' }).selectOption('sidebar');
  await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('A4');
  await page.getByLabel('PDF en color por defecto').uncheck();
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect.poll(async () => (await api(context, 'GET', '/auth/me')).user.display_name).toBe('Familia del Futuro');
  await page.goto(`/listas/${id}`);
  await expect(page.getByRole('button', { name: 'Barra lateral', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Papel', exact: true })).toHaveValue('A4');
  await page.getByRole('button', { name: 'Fichas', exact: true }).click();
  await page.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('LETTER');
  expect((await api(context, 'GET', '/auth/me')).user.preferences).toEqual({ layout: 'sidebar', paper: 'A4', color: false });
  await page.getByRole('button', { name: 'Guardar estas preferencias' }).click();
  await expect.poll(async () => (await api(context, 'GET', '/auth/me')).user.preferences.layout).toBe('cards');
  await page.goto('/cuenta'); await page.getByRole('button', { name: 'Revisar eliminación' }).click();
  await expect(page.getByRole('heading', { name: 'Revisa antes de eliminar' })).toBeVisible();
  await expect(page.getByText('Escuela del Futuro QA', { exact: true })).toBeVisible();
  await page.getByLabel('Confirma tu contraseña').fill(password);
  await page.getByLabel('Entiendo y acepto la eliminación de mi cuenta', { exact: false }).check();
  await page.getByRole('button', { name: 'Eliminar cuenta definitivamente' }).click();
  await expect(page).toHaveURL(/\/$/);
  expect((await api(context, 'GET', '/auth/me')).user).toBeNull();
  await page.goto(`/listas/${id}`); await expect(page.getByText('Esta lista está archivada', { exact: false })).toBeVisible();
});

test('separate administrator login, catalog review, taxonomy, templates, aliases and moderation', async ({ page, context }) => {
  test.setTimeout(150_000);
  await account(context); const tag = Date.now().toString();
  const categories = await api(context, 'GET', '/catalog/categories');
  const name = `Útil administrativo ${tag}`;
  const supply = await api(context, 'POST', '/catalog', { name, category_id: categories[0].id });
  const id = await list(context, 'private');
  await api(context, 'POST', `/lists/${id}/reports`, { version: 1, kind: 'content', reason: `Reporte administrativo ${tag}` });
  await page.goto('/admin'); await expect(page.getByRole('heading', { name: 'Acceso administrativo' })).toBeVisible();
  await page.getByLabel('Usuario', { exact: true }).fill(environment.admin.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(environment.admin.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Secciones de administración' });
  await expect(navigation).toBeVisible();
  await navigation.getByRole('button', { name: 'Útiles', exact: true }).click();
  await page.getByLabel('Buscar útil').fill(tag); await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: `Revisar ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Aprobar y guardar' }).click();
  await expect.poll(async () => (await api(context, 'GET', `/catalog?q=${tag}`)).find((row: { id: string }) => row.id === supply.id)?.review_status).toBe('approved');

  await navigation.getByRole('button', { name: 'Categorías', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(`Categoría ${tag}`);
  await page.getByLabel('Identificador', { exact: false }).fill(`categoria-${tag}`);
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText(`Categoría ${tag}`, { exact: false }).last()).toBeVisible();

  await navigation.getByRole('button', { name: 'Plantillas', exact: true }).click();
  await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(`Plantilla ${tag}`);
  await page.getByLabel('Nivel o curso').fill('4° básico');
  await page.getByLabel('Útil', { exact: true }).fill('Papel de colores');
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByRole('combobox', { name: 'Unidad', exact: true }).selectOption('paquete');
  await page.getByLabel('Categoría', { exact: true }).fill('Arte y dibujo');
  await page.getByRole('button', { name: 'Guardar plantilla' }).click();
  await expect.poll(async () => (await api(context, 'GET', '/templates')).some((row: { name: string }) => row.name === `Plantilla ${tag}`)).toBe(true);

  await navigation.getByRole('button', { name: 'Colegios', exact: true }).click();
  await page.getByLabel('Nombre del colegio').fill('Escuela del Futuro QA');
  await page.getByLabel('Nombre alternativo').fill(`Futuro ${tag}`);
  await page.getByLabel('Comuna', { exact: true }).fill('Santiago');
  await page.getByLabel('Región', { exact: true }).fill('Metropolitana de Santiago');
  await page.getByRole('button', { name: 'Guardar asociación' }).click();
  await expect(page.getByRole('cell', { name: new RegExp(`^Futuro ${tag}$`, 'i') })).toBeVisible();

  await navigation.getByRole('button', { name: 'Reportes', exact: true }).click();
  const report = page.getByRole('row').filter({ hasText: `Reporte administrativo ${tag}` });
  await report.getByRole('button', { name: 'Revisar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Escuela del Futuro QA', exact: true })).toBeVisible();
  await page.getByLabel('Motivo de la decisión').fill('Prueba revisada y cerrada.');
  await page.getByRole('button', { name: 'Registrar decisión' }).click();
  await expect.poll(async () => (await api(context, 'GET', '/admin/reports')).find((row: { list_id: string }) => row.list_id === id)?.status).toBe('closed');

  await navigation.getByRole('button', { name: 'Productos y vínculos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Productos de origen' })).toBeVisible();
  const product = page.getByRole('row').filter({ hasText: 'Lápiz grafito de origen QA' });
  await expect(product).toHaveCount(1);
  {
    await product.getByRole('button', { name: /Vincular/ }).click();
    await page.getByRole('combobox', { name: 'Útil genérico', exact: true }).selectOption(supply.id);
    await page.getByRole('button', { name: 'Confirmar vínculo' }).click();
    await expect(page.getByRole('heading', { name: 'Propuestas y vínculos revisados' })).toBeVisible();
    await expect.poll(async () => (await api(context, 'GET', '/admin/matches')).some((row: { item_id: string }) => row.item_id === supply.id)).toBe(true);
  }
  await navigation.getByRole('button', { name: 'Administradores', exact: true }).click();
  await page.getByLabel('Usuario', { exact: true }).fill(`admin_${tag}`);
  await page.getByLabel('Contraseña inicial', { exact: false }).fill(password);
  await page.getByRole('button', { name: 'Crear administrador' }).click();
  await expect(page.getByText('Cuenta administrativa creada', { exact: false })).toBeVisible();
});


test('administrator creates and corrects typed generic items and searches a product equivalent', async ({ page, context }) => {
  test.setTimeout(150_000);
  const tag = randomUUID().slice(0, 8);
  const name = `Genérico completo ${tag}`;
  const alternate = `Alternativa del genérico ${tag}`;
  expect((await api(context, 'GET', '/auth/me')).user).toBeNull();
  const categories = await api(context, 'GET', '/catalog/categories');
  const initialCategory = categories.find((category: { subcategories: unknown[] }) => category.subcategories.length > 0);
  const correctedCategory = categories.find((category: { id: number }) => category.id !== initialCategory.id);
  await page.goto('/admin');
  await page.getByLabel('Usuario', { exact: true }).fill(environment.admin.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(environment.admin.password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  const navigation = page.getByRole('navigation', { name: 'Secciones de administración' });
  await navigation.getByRole('button', { name: 'Útiles', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo útil', exact: true }).click();
  const form = page.getByRole('region', { name: 'Revisión del útil' });
  await form.getByLabel('Nombre genérico', { exact: true }).fill(name);
  await form.getByRole('combobox', { name: 'Categoría del útil', exact: true }).selectOption(String(initialCategory.id));
  await form.getByRole('combobox', { name: 'Subcategoría del útil', exact: true }).selectOption(String(initialCategory.subcategories[0].id));
  await form.getByLabel('Nombres alternativos', { exact: false }).fill(alternate);
  await form.getByRole('button', { name: 'Agregar atributo' }).click();
  await form.getByRole('combobox', { name: 'Atributo 1', exact: true }).selectOption('numero_hojas');
  await form.getByLabel('Valor 1', { exact: true }).fill('100');
  await form.getByRole('button', { name: 'Agregar atributo' }).click();
  await form.getByRole('combobox', { name: 'Atributo 2', exact: true }).selectOption('incluye_goma');
  await form.getByRole('combobox', { name: 'Valor 2', exact: true }).selectOption('false');
  await form.getByRole('button', { name: 'Crear y aprobar útil' }).click();
  await expect(form).toHaveCount(0);
  const created = (await api(context, 'GET', `/admin/catalog?q=${encodeURIComponent(name)}`))[0];
  expect(created.review_status).toBe('approved');
  expect(created.aliases).toEqual([alternate.toLowerCase()]);
  expect(created.attributes.numero_hojas.value).toBe(100);
  expect(created.attributes.incluye_goma.value).toBe(false);
  expect((await api(context, 'GET', '/auth/me')).user).toBeNull();

  await page.getByLabel('Buscar útil', { exact: true }).fill(alternate);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: `Revisar ${name}`, exact: true }).click();
  await form.getByLabel('Nombre genérico', { exact: true }).fill(`${name} corregido`);
  await form.getByRole('combobox', { name: 'Categoría del útil', exact: true }).selectOption(String(correctedCategory.id));
  await expect(form.getByRole('combobox', { name: 'Subcategoría del útil', exact: true })).toHaveValue('');
  await form.getByLabel('Nombres alternativos', { exact: false }).fill('');
  // Attributes are returned in dictionary-key order, so select the row by its key.
  const numericRow = form.locator('.attribute-row').filter({ has: page.locator('select').filter({ has: page.locator('option[value="numero_hojas"]:checked') }) });
  await numericRow.locator('input').fill('80');
  const booleanRow = form.locator('.attribute-row').filter({ has: page.locator('select').filter({ has: page.locator('option[value="incluye_goma"]:checked') }) });
  await booleanRow.getByRole('button', { name: /Quitar atributo/ }).click();
  await form.getByRole('button', { name: 'Guardar correcciones' }).click();
  await expect(form).toHaveCount(0);
  const revised = (await api(context, 'GET', `/admin/catalog?q=${tag}`))[0];
  expect(revised.category_id).toBe(correctedCategory.id); expect(revised.subcategory_id).toBeNull();
  expect(revised.aliases).toEqual([]); expect(revised.attributes.numero_hojas.value).toBe(80);
  expect(revised.attributes.incluye_goma).toBeUndefined();
  expect((await api(context, 'GET', `/catalog?q=${encodeURIComponent(alternate)}`))).toEqual([]);

  await navigation.getByRole('button', { name: 'Productos y vínculos', exact: true }).click();
  const product = page.getByRole('row').filter({ hasText: 'Lápiz grafito de origen QA' });
  await product.locator('summary').click();
  await expect(product.locator('.variant-attributes')).toContainText('color');
  await product.getByRole('button', { name: /Vincular/ }).click();
  await page.getByLabel('Buscar útil para vincular', { exact: true }).fill(tag);
  await page.getByRole('button', { name: 'Buscar equivalente', exact: true }).click();
  await page.getByRole('combobox', { name: 'Útil genérico', exact: true }).selectOption(created.id);
  await page.getByRole('button', { name: 'Confirmar vínculo', exact: true }).click();
  await expect.poll(async () => (await api(context, 'GET', '/admin/matches')).some((row: { item_id: string }) => row.item_id === created.id)).toBe(true);
});

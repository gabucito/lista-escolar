import { test, expect, BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
const artifacts = '../.local/qa/ui-admin';
mkdirSync(artifacts, { recursive: true });
let storage: Awaited<ReturnType<BrowserContext['storageState']>>;
const tag = randomUUID().slice(0, 8);
const supplyName = `Cuaderno universitario para la comunidad escolar ${tag}`;
const reportReason = `Revisar la identificación del establecimiento ${tag}`;
const school = `Colegio Los Aromos · comunidad escolar ${tag}`;

async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, { method, data, headers: { 'X-Requested-With': 'lista-escolar' } });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200);
  return response.json();
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: environment.base_url });
  await api(context, 'POST', '/auth/register', { email: `admin-visual-${tag}@example.invalid`, display_name: 'Comunidad escolar QA', password: 'QA-admin-visual-password-2026' });
  const categories = await api(context, 'GET', '/catalog/categories');
  await api(context, 'POST', '/catalog', { name: supplyName, category_id: categories[0].id });
  const content = { school, class_name: '5° básico A', school_year: 2027, comuna: 'Santiago', region: 'Metropolitana de Santiago', logo_id: '',
    instructions: 'Reutilizar los materiales en buen estado. Marcar los útiles con nombre y curso antes de entregarlos.',
    items: [{ id: randomUUID(), catalog_id: '', name: 'Cuaderno universitario de 100 hojas, cuadriculado de 7 mm', quantity: '4', unit: 'unidad', category: 'Cuadernos', attributes: {}, note: 'Forro del color que prefieras. Revisar las hojas disponibles antes de comprar otro cuaderno.' }] };
  const { id } = await api(context, 'POST', '/lists', { content, visibility: 'private' });
  await api(context, 'POST', `/lists/${id}/publish`, { revision: 1, current_version: 0, request_id: randomUUID() });
  await api(context, 'POST', `/lists/${id}/reports`, { version: 1, kind: 'content', reason: reportReason });
  await api(context, 'POST', '/admin/login', environment.admin);
  await api(context, 'POST', '/admin/schools', { canonical_name: school, alias: `Los Aromos ${tag}`, comuna: 'Santiago', region: 'Metropolitana de Santiago' });
  // Keep screenshots focused on the administrative account's navigation.
  await api(context, 'POST', '/auth/logout', {});
  storage = await context.storageState();
  await context.close();
});

async function capture(page: Page, name: string, width: number) {
  await expect(page.locator('.notice.error')).toHaveCount(0);
  await expect(page.locator('app-admin .loading')).toHaveCount(0);
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${artifacts}/${name}-viewport.png`, fullPage: false });
  const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, viewport: innerWidth,
    elements: Array.from(document.querySelectorAll('main *')).filter(element => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && (box.right > innerWidth + 1 || box.left < -1);
    }).slice(0, 12).map(element => element.outerHTML.slice(0, 180)) }));
  expect.soft(overflow.page, JSON.stringify(overflow)).toBeLessThanOrEqual(width + 1);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  writeFileSync(`${artifacts}/${name}-axe.json`, JSON.stringify(accessibility.violations, null, 2));
  writeFileSync(`${artifacts}/${name}-overflow.json`, JSON.stringify(overflow, null, 2));
  expect.soft(accessibility.violations.map(violation => ({ id: violation.id, impact: violation.impact, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
}

const tabs = [
  { id: 'summary', label: 'Resumen' }, { id: 'catalog', label: 'Útiles' },
  { id: 'taxonomy', label: 'Categorías' }, { id: 'products', label: 'Productos y vínculos' },
  { id: 'reports', label: 'Reportes' }, { id: 'templates', label: 'Plantillas' },
  { id: 'schools', label: 'Colegios' }, { id: 'accounts', label: 'Administradores' },
];
for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }, { name: 'narrow', width: 320, height: 800 }]) {
  for (const tab of tabs) {
    test(`${viewport.name}: admin ${tab.id}, forms, accessibility and viewport`, async ({ browser }) => {
      test.setTimeout(120_000);
      const context = await browser.newContext({ baseURL: environment.base_url, storageState: storage, viewport });
      const page = await context.newPage(), errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await page.goto('/admin');
        const navigation = page.getByRole('navigation', { name: 'Secciones de administración' });
        await expect(navigation.getByRole('button')).toHaveCount(8);
        const selected = navigation.getByRole('button', { name: tab.label, exact: true });
        await selected.click(); await expect(selected).toHaveAttribute('aria-current', 'page');
        await expect(page.locator('app-admin .loading')).toHaveCount(0);
        const prefix = `${viewport.name}-${tab.id}`;
        switch (tab.id) {
          case 'summary':
            await expect(page.locator('.stat')).toHaveCount(4);
            await expect(page.getByRole('button', { name: /Revisar útiles/ })).toBeVisible();
            break;
          case 'catalog': {
            await page.getByLabel('Buscar útil', { exact: true }).fill(tag);
            await page.getByRole('button', { name: 'Buscar', exact: true }).click();
            await expect(page.getByRole('button', { name: `Revisar ${supplyName}`, exact: true })).toBeVisible();
            await capture(page, prefix + '-list', viewport.width);
            await page.getByRole('button', { name: `Revisar ${supplyName}`, exact: true }).click();
            await expect(page.getByLabel('Nombre genérico', { exact: true })).toHaveValue(supplyName);
            await expect(page.getByRole('button', { name: 'Guardar correcciones', exact: true })).toBeVisible();
            await capture(page, prefix + '-review', viewport.width);
            await page.getByRole('button', { name: 'Cerrar', exact: true }).click();
            await page.getByRole('button', { name: 'Nuevo útil', exact: true }).click();
            await expect(page.getByLabel('Nombre genérico', { exact: true })).toBeVisible();
            for (const name of ['Categoría del útil', 'Subcategoría del útil']) await expect(page.getByRole('combobox', { name, exact: true })).toBeVisible();
            await expect(page.getByLabel('Nombres alternativos', { exact: false })).toBeVisible();
            await page.getByRole('button', { name: 'Agregar atributo', exact: true }).click();
            await expect(page.getByRole('combobox', { name: 'Atributo 1', exact: true })).toBeVisible();
            await expect(page.getByLabel('Valor 1', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Quitar atributo 1', exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Crear y aprobar útil', exact: true })).toBeVisible();
            break;
          }
          case 'taxonomy':
            await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('subcategory');
            await expect(page.getByRole('combobox', { name: 'Categoría principal', exact: true })).toBeVisible();
            await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
            await expect(page.getByLabel('Identificador', { exact: false })).toBeVisible();
            await page.locator('.taxonomy-group summary').first().click();
            await expect(page.getByRole('button', { name: 'Editar categoría', exact: true }).first()).toBeVisible();
            break;
          case 'products': {
            const product = page.getByRole('row')
              .filter({ hasText: 'Lápiz grafito de origen QA' })
              .filter({ has: page.getByRole('button', { name: /^Vincular/ }) });
            await expect(product).toHaveCount(1);
            await product.locator('summary').click();
            await expect(product.getByText('color: Negro', { exact: false })).toBeVisible();
            await expect(product.getByText('medida: HB', { exact: false })).toBeVisible();
            await capture(page, prefix + '-variants', viewport.width);
            await product.getByRole('button', { name: /Vincular/ }).click();
            await expect(page.getByLabel('Buscar útil para vincular', { exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Buscar equivalente', exact: true })).toBeVisible();
            await expect(page.getByRole('combobox', { name: 'Útil genérico', exact: true })).toBeVisible();
            break;
          }
          case 'reports':
            await page.getByRole('row').filter({ hasText: reportReason }).getByRole('button', { name: 'Revisar', exact: true }).click();
            await expect(page.getByRole('heading', { name: school, exact: true })).toBeVisible();
            await expect(page.getByRole('combobox', { name: 'Decisión', exact: true })).toBeVisible();
            await expect(page.getByLabel('Motivo de la decisión', { exact: true })).toBeVisible();
            break;
          case 'templates':
            await page.getByRole('button', { name: 'Nueva plantilla', exact: true }).click();
            for (const label of ['Nombre', 'Nivel o curso', 'Útil', 'Cantidad', 'Categoría', 'Nota']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
            await expect(page.getByRole('combobox', { name: 'Unidad', exact: true })).toBeVisible();
            await expect(page.getByRole('button', { name: 'Guardar plantilla', exact: true })).toBeVisible();
            break;
          case 'schools':
            for (const label of ['Nombre del colegio', 'Nombre alternativo', 'Comuna', 'Región']) await expect(page.getByLabel(label, { exact: true })).toBeVisible();
            await expect(page.getByRole('cell', { name: school, exact: false })).toBeVisible();
            break;
          case 'accounts':
            await expect(page.getByLabel('Usuario', { exact: true })).toBeVisible();
            await expect(page.getByLabel('Contraseña inicial', { exact: false })).toHaveAttribute('type', 'password');
            await expect(page.getByRole('button', { name: 'Crear administrador', exact: true })).toBeVisible();
            break;
        }
        await capture(page, prefix, viewport.width);
        expect(errors).toEqual([]);
      } finally { await context.close(); }
    });
  }
}

import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('phone editing, autosave, preview, publication and reachable PDF download', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const headers = { 'X-Requested-With': 'lista-escolar' };
  let response = await context.request.post('/api/auth/register', { headers, data: { email: `phone-${randomUUID()}@example.invalid`, password: 'QA-mobile-password-2026', display_name: 'Familia móvil' } });
  expect(response.status()).toBe(200);
  response = await context.request.post('/api/lists', { headers, data: { content: { school: 'Colegio móvil QA', class_name: '1° básico', school_year: 2027, comuna: '', region: '', instructions: '', logo_id: '', items: [
    { id: randomUUID(), catalog_id: '', name: 'Cuaderno para el curso', quantity: '2', unit: 'unidad', category: 'Cuadernos', note: '', attributes: {} },
  ] } } });
  expect(response.status()).toBe(200); const { id } = await response.json();
  await page.goto(`/editar/${id}`);
  await page.getByRole('button', { name: 'Datos', exact: true }).click();
  await page.getByLabel('Colegio', { exact: true }).fill('Colegio móvil revisado');
  const save = page.waitForResponse(response => response.url().endsWith(`/lists/${id}/draft`) && response.request().method() === 'PUT' && response.ok());
  await page.getByRole('button', { name: 'Guardar ahora', exact: true }).click(); await save;
  await page.getByRole('button', { name: 'Útiles', exact: true }).click();
  await expect(page.locator('#editor-items')).toBeFocused();
  const bar = page.getByRole('region', { name: 'Acciones del borrador' });
  await expect(bar).toBeInViewport();
  await bar.getByRole('button', { name: 'Vista previa', exact: true }).click();
  const preview = page.getByRole('dialog', { name: 'Vista previa del PDF' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('iframe')).toHaveAttribute('src', /^blob:/);
  await page.keyboard.press('Escape'); await expect(preview).toBeHidden();
  await bar.getByRole('button', { name: 'Publicar lista', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/listas/${id}$`));
  await expect(page.getByRole('heading', { name: 'Colegio móvil revisado' })).toBeVisible();
  const pdfBar = page.getByRole('region', { name: 'PDF y avance personal' });
  await expect(pdfBar).toBeInViewport();
  await pdfBar.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
  await expect(page.locator('#published-pdf')).toBeFocused();
  const download = page.waitForEvent('download');
  await page.locator('app-pdf-options').getByRole('button', { name: /Descargar PDF/ }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391);
});

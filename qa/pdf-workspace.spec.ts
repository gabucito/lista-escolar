import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

const artifacts = '../.local/qa/ui-pdf';
mkdirSync(artifacts, { recursive: true });
for (const viewport of [{ width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 800 }]) {
  test(`PDF workspace ${viewport.width}: preview, options, keyboard and viewport`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    const headers = { 'X-Requested-With': 'lista-escolar' };
    const register = await context.request.post('/api/auth/register', { headers, data: { email: `pdf-ui-${randomUUID()}@example.invalid`, display_name: 'María Soto', password: 'QA-pdf-workspace-2026' } });
    expect(register.status()).toBe(200);
    const created = await context.request.post('/api/lists', { headers, data: { content: {
      school: 'Colegio Los Aromos', class_name: '5° básico A', school_year: 2027, comuna: 'Santiago', region: 'Metropolitana', logo_id: '',
      instructions: 'Marcar los útiles con nombre y curso. Reutilizar materiales en buen estado.',
      items: ['Cuaderno universitario', 'Lápiz grafito', 'Goma de borrar', 'Lápices de colores', 'Pegamento en barra', 'Regla'].map((name, i) => ({ id: randomUUID(), catalog_id: '', name, quantity: String(i ? 2 : 4), unit: 'unidad', category: i < 3 ? 'Escritura' : 'Arte y dibujo', note: i ? '' : 'Forro del color que prefieras.', attributes: {} })),
    } } });
    expect(created.status()).toBe(200);
    const { id } = await created.json();
    expect((await context.request.post(`/api/lists/${id}/publish`, { headers, data: { revision: 1, current_version: 0, request_id: randomUUID() } })).status()).toBe(200);
    await page.goto(`/listas/${id}`);
    const launcher = viewport.width > 720 ? page.locator('.heading-actions').getByRole('button', { name: 'Descargar PDF', exact: true }) : page.getByRole('region', { name: 'PDF y avance personal' }).getByRole('button', { name: 'Descargar PDF', exact: true });
    await launcher.click();
    const dialog = page.getByRole('dialog', { name: 'Vista previa del PDF' });
    await expect(dialog.locator('app-pdf-preview img')).toBeVisible();
    await expect(page.locator('.site-header')).toHaveJSProperty('inert', true);
    await expect(dialog.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeEnabled();
    await page.screenshot({ path: `${artifacts}/${viewport.width}-preview.png` });
    if (viewport.width > 720) await expect(dialog.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeInViewport();
    await dialog.getByRole('button', { name: 'Fichas', exact: true }).click();
    await dialog.getByRole('combobox', { name: 'Papel', exact: true }).selectOption('A4');
    await expect(dialog.getByRole('status')).toContainText('Cambiaste las opciones');
    await dialog.getByRole('button', { name: 'Actualizar vista previa' }).click();
    await expect(dialog.getByRole('button', { name: 'Descargar PDF', exact: true })).toBeEnabled();
    await expect(dialog.locator('.preview-update')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Descargar PDF', exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${artifacts}/${viewport.width}-settings.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    writeFileSync(`${artifacts}/${viewport.width}-axe.json`, JSON.stringify(axe.violations, null, 2));
    expect(axe.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) }))).toEqual([]);
    const download = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Descargar PDF', exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    const preferences = (await (await context.request.get('/api/auth/me')).json()).user.preferences;
    expect(preferences.layout).not.toBe('cards');
    await dialog.getByRole('button', { name: 'Guardar estas preferencias' }).click();
    await expect(page.locator('main > .notice.success')).toHaveJSProperty('inert', true);
    await dialog.getByRole('button', { name: 'Cerrar vista previa' }).focus();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(launcher).toBeFocused();
    await expect(page.locator('main > .notice.success')).toHaveJSProperty('inert', false);
  });
}

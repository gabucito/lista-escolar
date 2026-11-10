import { test, expect, BrowserContext, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const environment = JSON.parse(readFileSync('../.local/qa/environment.json', 'utf8'));
if (!environment.isolated) throw new Error('User workflow QA requires the disposable database.');
const artifacts = '../.local/qa/user-workflows';
mkdirSync(artifacts, { recursive: true });
const password = 'QA-workflows-password-2026';
let ownerStorage: Awaited<ReturnType<BrowserContext['storageState']>>;
let invitedStorage: Awaited<ReturnType<BrowserContext['storageState']>>;
let publicId: string;
let privateId: string;
let invitationPath: string;
let requestPath: string;

async function api(context: BrowserContext, method: string, path: string, data?: unknown) {
  const response = await context.request.fetch('/api' + path, {
    method, data, headers: { 'X-Requested-With': 'lista-escolar' },
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(200);
  return response.json();
}

test('mobile: search keeps results visible and expands location filters deliberately', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: environment.base_url, viewport: { width: 390, height: 844 } });
  const page = await context.newPage(); await page.goto('/');
  await expect(page.locator('.result-row').first()).toBeVisible();
  await expect(page.locator('.result-row').first()).toBeInViewport({ ratio: 0.4 });
  await expect(page.getByLabel('Comuna', { exact: true })).toBeHidden();
  await capture(page, 'mobile-05-buscar-listas');
  await page.getByRole('button', { name: 'Filtrar por ubicación', exact: true }).click();
  await expect(page.getByLabel('Comuna', { exact: true })).toBeVisible();
  await page.getByLabel('Colegio', { exact: true }).fill('Colegio Los Aromos');
  await page.getByLabel('Curso', { exact: true }).fill('5° básico A');
  await page.getByLabel('Comuna', { exact: true }).fill('Santiago');
  await page.getByRole('button', { name: 'Buscar listas', exact: true }).click();
  await expect(page.locator(`a[href="/listas/${publicId}"]`).first()).toBeVisible();
  await capture(page, 'mobile-05-buscar-ubicacion');
  await page.getByRole('button', { name: 'Ubicación activa', exact: true }).click();
  await expect(page.getByLabel('Comuna', { exact: true })).toBeHidden();
  await expect(page.locator('.result-row').first()).toBeInViewport({ ratio: 0.4 });
  await page.getByRole('button', { name: 'Limpiar filtros', exact: true }).click();
  await expect(page.getByLabel('Colegio', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Filtrar por ubicación', exact: true })).toHaveAttribute('aria-expanded', 'false');
  await accessibility(page, 'mobile-05-buscar-listas'); await context.close();
});
async function register(context: BrowserContext, name: string) {
  const email = `workflow-${randomUUID()}@example.invalid`;
  return (await api(context, 'POST', '/auth/register', { display_name: name, email, password })).user;
}
function content(school: string) {
  const rows = [
    ['Cuadernos', 'Cuaderno universitario cuadriculado', '4', 'unidad', '100 hojas; forrar y marcar con nombre.'],
    ['Cuadernos', 'Cuaderno de comunicaciones', '1', 'unidad', 'Puede reutilizar el del año anterior.'],
    ['Escritura', 'Lápiz grafito', '3', 'unidad', ''],
    ['Escritura', 'Goma de borrar', '2', 'unidad', ''],
    ['Escritura', 'Sacapuntas con depósito', '1', 'unidad', ''],
    ['Arte y dibujo', 'Lápices de colores', '1', 'caja', '12 colores.'],
    ['Arte y dibujo', 'Block de dibujo', '1', 'unidad', ''],
    ['Pegado y corte', 'Pegamento en barra', '2', 'unidad', '40 g.'],
  ];
  return {
    school, class_name: '5° básico A', school_year: 2027, comuna: 'Santiago',
    region: 'Metropolitana de Santiago', logo_id: '',
    instructions: 'Marcar todos los útiles con nombre y curso. Puedes reutilizar los materiales del año anterior que estén en buen estado. No se exige una marca específica.',
    items: rows.map(([category, name, quantity, unit, note]) => ({
      id: randomUUID(), catalog_id: '', category, name, quantity, unit, note, attributes: {},
    })),
  };
}
async function create(context: BrowserContext, school: string, visibility = 'public', publish = true) {
  const body = content(school);
  const result = await api(context, 'POST', '/lists', { visibility, content: body });
  if (publish) await api(context, 'POST', `/lists/${result.id}/publish`, {
    revision: 1, current_version: 0, request_id: randomUUID(),
  });
  return { id: result.id as string, content: body };
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${artifacts}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${artifacts}/${name}-viewport.png` });
  const width = page.viewportSize()!.width;
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    elements: Array.from(document.querySelectorAll('main *')).filter(element => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && (rect.right > innerWidth + 1 || rect.left < -1);
    }).slice(0, 6).map(element => element.outerHTML.slice(0, 200)),
  }));
  expect(overflow.width, JSON.stringify(overflow)).toBeLessThanOrEqual(width + 1);
}
async function accessibility(page: Page, name: string) {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
  writeFileSync(`${artifacts}/${name}-axe.json`, JSON.stringify(result.violations, null, 2));
  expect(result.violations.map(violation => ({ id: violation.id, nodes: violation.nodes.map(node => node.target) }))).toEqual([]);
}

test.beforeAll(async ({ browser }) => {
  const owner = await browser.newContext({ baseURL: environment.base_url });
  const peer = await browser.newContext({ baseURL: environment.base_url });
  const invited = await browser.newContext({ baseURL: environment.base_url });
  const requester = await browser.newContext({ baseURL: environment.base_url });
  const ownerUser = await register(owner, 'María González');
  const peerUser = await register(peer, 'Ana Pérez');
  const invitedUser = await register(invited, 'Familia invitada');
  await register(requester, 'Familia solicitante');
  const published = await create(owner, 'Colegio Los Aromos');
  publicId = published.id;
  privateId = (await create(owner, 'Colegio del Valle', 'private')).id;
  await create(owner, 'Escuela Gabriela Mistral', 'private', false);
  const shared = await create(peer, 'Escuela Nueva Aurora');
  const ownerInvite = await api(peer, 'POST', `/lists/${shared.id}/access`, { email: ownerUser.email, role: 'viewer' });
  await api(owner, 'POST', `/invitations/${ownerInvite.invitation_token}/accept`, {});
  await api(owner, 'POST', `/lists/${publicId}/follow`, { following: true });
  await api(owner, 'GET', `/lists/${publicId}/progress?version=1`);
  for (const item of published.content.items.slice(0, 3)) await api(owner, 'PUT', `/lists/${publicId}/progress`, {
    version: 1, item_id: item.id, checked: true, review: false,
  });
  await api(peer, 'POST', `/lists/${publicId}/comments`, { version: 1, body: '¿Se puede reutilizar el cuaderno de comunicaciones del año anterior?' });
  await api(owner, 'POST', `/lists/${publicId}/comments`, { version: 1, body: 'Sí, mientras tenga hojas disponibles y esté en buen estado.' });
  const peerInvite = await api(owner, 'POST', `/lists/${privateId}/access`, { email: peerUser.email, role: 'editor' });
  await api(peer, 'POST', `/invitations/${peerInvite.invitation_token}/accept`, {});
  await api(owner, 'POST', `/lists/${privateId}/transfer`, { recipient_id: peerUser.id });
  const pending = await api(owner, 'POST', `/lists/${privateId}/access`, { email: invitedUser.email, role: 'viewer' });
  invitationPath = '/invitaciones/' + pending.invitation_token;
  requestPath = (await api(owner, 'GET', `/lists/${privateId}/access`)).request_link;
  await api(requester, 'POST', '/access-requests/' + requestPath.split('/').pop(), {});
  ownerStorage = await owner.storageState();
  invitedStorage = await invited.storageState();
  await Promise.all([owner.close(), peer.close(), invited.close(), requester.close()]);
});

for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
  test(`${viewport.name}: personal lists and independently followed ownership`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, storageState: ownerStorage, viewport });
    const page = await context.newPage(); await page.goto('/mis-listas');
    await expect(page.locator('.mine-row')).toHaveCount(4);
    await expect(page.getByRole('heading', { name: 'Plantillas por nivel' })).toBeVisible();
    await capture(page, `${viewport.name}-06-mis-listas`);
    await page.getByRole('button', { name: /^Siguiendo/ }).click();
    await expect(page.locator('.mine-row')).toHaveCount(1);
    await expect(page.locator('.mine-row')).toContainText('Colegio Los Aromos');
    await expect(page.locator('.mine-row')).toContainText('Propietario');
    await page.getByRole('button', { name: /^Compartidas/ }).click();
    await expect(page.locator('.mine-row')).toHaveCount(1);
    await expect(page.locator('.mine-row')).toContainText('Escuela Nueva Aurora');
    await accessibility(page, `${viewport.name}-06-mis-listas`); await context.close();
  });

  test(`${viewport.name}: login and inline registration validation`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, viewport });
    const page = await context.newPage(); await page.goto('/ingresar');
    await expect(page.getByRole('heading', { name: 'Ingresa a tu cuenta' })).toBeVisible();
    await capture(page, `${viewport.name}-07-ingresar`);
    await page.getByRole('link', { name: 'Crear cuenta', exact: true }).click();
    await page.getByLabel('Nombre para mostrar', { exact: true }).fill('María González');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('correo-incompleto');
    await page.getByLabel('Contraseña', { exact: true }).fill('corta');
    await page.getByRole('button', { name: 'Crear cuenta', exact: true }).click();
    await expect(page.getByText('Ingresa un correo válido, por ejemplo nombre@correo.cl.')).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar contraseña', exact: true }).click();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Ocultar contraseña', exact: true }).click();
    await expect(page.getByLabel('Contraseña', { exact: true })).toHaveAttribute('type', 'password');
    await capture(page, `${viewport.name}-07-registro-validacion`);
    await accessibility(page, `${viewport.name}-07-registro`); await context.close();
  });

  test(`${viewport.name}: invitation account and pending access request`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, storageState: invitedStorage, viewport });
    const page = await context.newPage(); await page.goto(invitationPath);
    await expect(page.getByRole('button', { name: 'Aceptar invitación' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cambiar cuenta' })).toBeVisible();
    await capture(page, `${viewport.name}-19-invitacion`);
    await accessibility(page, `${viewport.name}-19-invitacion`);
    await context.close();
    const requesting = await browser.newContext({ baseURL: environment.base_url, viewport });
    await register(requesting, 'Familia interesada');
    const requestPage = await requesting.newPage(); await requestPage.goto(requestPath);
    await requestPage.getByRole('button', { name: 'Enviar solicitud' }).click();
    await expect(requestPage.getByRole('heading', { name: 'Solicitud enviada' })).toBeVisible();
    await expect(requestPage.getByRole('button', { name: 'Enviar solicitud' })).toHaveCount(0);
    await capture(requestPage, `${viewport.name}-19-solicitud-enviada`);
    await accessibility(requestPage, `${viewport.name}-19-solicitud`); await requesting.close();
  });

  test(`${viewport.name}: personal checklist, comments and report drawer`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, storageState: ownerStorage, viewport });
    const page = await context.newPage(); await page.goto(`/listas/${publicId}`);
    await expect(page.locator('.checklist-item')).toHaveCount(8);
    await expect(page.getByText('3 de 8 útiles', { exact: true })).toBeVisible();
    await expect(page.locator('.comment')).toHaveCount(2);
    await capture(page, `${viewport.name}-08-lista-publicada`);
    if (viewport.width < 761) await page.getByRole('button', { name: 'Más acciones', exact: true }).click();
    await page.getByRole('button', { name: 'Reportar un problema' }).click();
    const dialog = page.getByRole('dialog', { name: 'Reportar contenido' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('combobox', { name: 'Motivo', exact: true }).selectOption('privacy');
    await dialog.getByLabel('Explica el problema').fill('Revisar datos personales incluidos en una nota.');
    await capture(page, `${viewport.name}-08-reporte`);
    await accessibility(page, `${viewport.name}-08-reporte`);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Reportar un problema' })).toBeFocused();
    await context.close();
  });

  test(`${viewport.name}: sharing members, invitations, requests and collapsed danger actions`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, storageState: ownerStorage, viewport });
    const page = await context.newPage(); await page.goto(`/listas/${privateId}/compartir`);
    await expect(page.getByRole('button', { name: 'Quitar acceso' })).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Eliminar lista', exact: true })).toBeHidden();
    await capture(page, `${viewport.name}-10-compartir-personas`);
    await page.getByRole('button', { name: /^Invitaciones \d+/ }).click();
    await expect(page.getByRole('heading', { name: 'Invitaciones pendientes' })).toBeVisible();
    await capture(page, `${viewport.name}-10-compartir-invitaciones`);
    await page.getByRole('button', { name: /^Solicitudes \d+/ }).click();
    await expect(page.getByRole('button', { name: 'Permitir lectura' }).first()).toBeVisible();
    await capture(page, `${viewport.name}-10-compartir-solicitudes`);
    await accessibility(page, `${viewport.name}-10-compartir`); await context.close();
  });

  test(`${viewport.name}: focused account deletion preview preserves dispositions`, async ({ browser }) => {
    const context = await browser.newContext({ baseURL: environment.base_url, storageState: ownerStorage, viewport });
    const page = await context.newPage(); await page.goto('/cuenta');
    await page.getByRole('button', { name: 'Revisar eliminación', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisa antes de eliminar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Revisa antes de eliminar' })).toBeFocused();
    await expect(page.locator('.disposition-row')).toHaveCount(3);
    await expect(page.getByText('Se conserva como archivo sin propietario', { exact: true })).toBeVisible();
    await expect(page.locator('.transfer-row')).toContainText('Oferta pendiente');
    await expect(page.getByRole('button', { name: 'Eliminar cuenta definitivamente' })).toBeDisabled();
    await capture(page, `${viewport.name}-11-cuenta-revision`);
    await accessibility(page, `${viewport.name}-11-cuenta`);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisa antes de eliminar' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Revisar eliminación', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Revisar eliminación', exact: true })).toBeFocused();
    await context.close();
  });
}

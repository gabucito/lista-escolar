import { test, expect, BrowserContext, Page, Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createCanvas, DOMMatrix, Path2D, ImageData } from "@napi-rs/canvas";
import { inspectCheckboxes } from "./pdf-inspection.mjs";
import type {
  CatalogItem,
  CatalogBrowseResult,
  Content,
  Draft,
  Item,
  Progress,
} from "../frontend/src/app/core/models";

Object.assign(globalThis, { DOMMatrix, Path2D, ImageData });
const artifacts = "../.local/qa/item-alternatives";
mkdirSync(artifacts, { recursive: true });
const headers = { "X-Requested-With": "lista-escolar" };
const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(({ page }) => expect(browserErrors.get(page)).toEqual([]));

async function api<T>(
  context: BrowserContext,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await context.request.fetch("/api" + path, {
    method,
    data,
    headers,
  });
  expect(response.status(), `${method} ${path}: ${await response.text()}`).toBe(
    200,
  );
  return response.json();
}
async function account(context: BrowserContext) {
  await api(context, "POST", "/auth/register", {
    email: `alternatives-${randomUUID()}@example.invalid`,
    password: "QA-alternatives-2026",
    display_name: "Familia con opciones",
  });
}
function content(items: Item[] = []): Content {
  return {
    school: "Colegio Los Aromos · Opciones",
    class_name: "5° básico A",
    school_year: 2027,
    comuna: "Santiago",
    region: "Metropolitana",
    instructions: "",
    logo_id: "",
    items,
  };
}
function ordinary(name = "Lápiz independiente"): Item {
  return {
    id: randomUUID(),
    catalog_id: "",
    name,
    quantity: "1",
    unit: "unidad",
    category: "Escritura",
    note: "",
    attributes: {},
  };
}
async function seed(context: BrowserContext, data = content()) {
  return (
    await api<{ id: string }>(context, "POST", "/lists", { content: data })
  ).id;
}
async function draft(context: BrowserContext, id: string) {
  return api<Draft>(context, "GET", `/lists/${id}/draft`);
}
async function publish(context: BrowserContext, id: string) {
  const current = await draft(context, id);
  await api(context, "POST", `/lists/${id}/publish`, {
    revision: current.revision,
    current_version: current.current_version,
    request_id: randomUUID(),
  });
}
async function notebook(context: BrowserContext, type: string, sheets = 100) {
  const attributes: Record<string, string | number> = {
    tipo_cuaderno: type,
    formato: "universitario",
    numero_hojas: sheets,
  };
  if (type === "Cuadriculado") attributes.cuadricula_mm = 7;
  const result = await api<CatalogBrowseResult>(
    context,
    "GET",
    "/catalog/browse?" +
      new URLSearchParams({
        category: "cuadernos",
        attributes: JSON.stringify(attributes),
      }),
  );
  expect(result.items.length).toBeGreaterThan(0);
  return result.items[0];
}
async function editor(
  page: Page,
  context: BrowserContext,
  width: number,
  items: Item[] = [],
) {
  await page.setViewportSize({
    width,
    height: width === 1366 ? 768 : width === 390 ? 844 : 800,
  });
  await account(context);
  const id = await seed(context, content(items));
  await page.goto(`/editar/${id}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Colegio Los Aromos",
  );
  if (width <= 720)
    await page
      .getByRole("button", { name: "＋ Agregar útiles", exact: true })
      .click();
  await expect(page.locator("#category-chooser-heading")).toBeVisible();
  return id;
}
async function change(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/catalog/browse" &&
      response.ok(),
  );
  await action();
  await response;
  await expect(page.locator(".catalog-loading")).toHaveCount(0);
  if (await page.locator(".facet-fields").count())
    await expect(page.locator(".facet-fields")).toHaveAttribute(
      "aria-busy",
      "false",
    );
  else
    await expect(page.locator(".catalog-scroll")).toHaveAttribute(
      "aria-busy",
      "false",
    );
}
async function chooseCategory(page: Page, name: string) {
  const currentHeading = page.locator("#catalog-filter-heading");
  if (
    (await currentHeading.isVisible()) &&
    (await currentHeading.innerText()).trim() === name
  )
    return;
  const sidenav = page.locator("#catalog-sidenav");
  if (
    !(await sidenav
      .getByRole("group", { name: "Categorías del catálogo" })
      .isVisible())
  ) {
    if (await sidenav.isVisible())
      await sidenav
        .getByRole("button", { name: "Volver a categorías", exact: true })
        .click();
    else await page.locator(".catalog-breadcrumb button").click();
  }
  await change(page, () =>
    sidenav.getByRole("button", { name, exact: true }).click(),
  );
}
async function openFilters(page: Page) {
  if (!(await page.locator("#catalog-sidenav").isVisible()))
    await page.locator("#catalog-filter-toggle").click();
}
async function chooseAttribute(page: Page, name: string, value: string) {
  const field = page.getByRole("group", { name, exact: true });
  await expect(field).toBeVisible();
  const select = field.getByRole("combobox");
  if (await select.count()) {
    const label = new RegExp(
      "^" + value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\s|$)",
    );
    const raw = await select
      .getByRole("option", { name: label })
      .getAttribute("value");
    await change(page, () => select.selectOption(raw!));
  } else
    await change(page, () =>
      field.getByRole("radio", { name: value, exact: true }).check(),
    );
}
async function showResults(page: Page) {
  if (
    page.viewportSize()!.width <= 720 &&
    (await page.locator("#catalog-sidenav").isVisible())
  ) {
    await page.getByRole("button", { name: /^Ver \d+ útil(?:es)?$/ }).click();
  }
}
async function configureNotebooks(page: Page, type = "Cuadriculado") {
  await chooseCategory(page, "Cuadernos");
  await chooseAttribute(page, "Tipo de cuaderno", type);
  await chooseAttribute(page, "Formato", "Universitario");
  await showResults(page);
}
async function selectOption(page: Page, item: CatalogItem) {
  await page
    .getByRole("button", { name: "Incluir " + item.name, exact: true })
    .click();
}
async function review(page: Page) {
  await page
    .getByRole("button", { name: "Revisar opciones", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Opciones del útil",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function returnToList(page: Page) {
  const button = page.getByRole("button", { name: /Ver mi lista/ });
  if (await button.isVisible()) await button.click();
}
async function capture(page: Page, name: string) {
  await page.screenshot({ path: `${artifacts}/${name}.png` });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  writeFileSync(
    `${artifacts}/${name}-axe.json`,
    JSON.stringify(result.violations, null, 2),
  );
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
}
async function waitForItems(
  context: BrowserContext,
  id: string,
  count: number,
) {
  await expect
    .poll(async () => (await draft(context, id)).content.items.length)
    .toBe(count);
  return (await draft(context, id)).content.items;
}
async function fillGroup(dialog: Locator, name: string, quantity = "2") {
  await dialog.getByLabel("Nombre del requisito", { exact: true }).fill(name);
  await dialog.getByLabel("Cantidad total", { exact: true }).fill(quantity);
  await dialog
    .getByRole("combobox", { name: "Unidad", exact: true })
    .selectOption("unidad");
  await dialog
    .getByLabel("Nota opcional", { exact: true })
    .fill("Cualquiera de las opciones sirve; se pueden combinar.");
}

for (const width of [1366, 390, 320]) {
  test(`alternative notebooks ${width}: one saved requirement, shared quantity and parent checklist`, async ({
    page,
    context,
  }) => {
    const id = await editor(page, context, width);
    const grid = await notebook(context, "Cuadriculado"),
      ruled = await notebook(context, "Rayado");
    await configureNotebooks(page);
    await page
      .getByRole("button", { name: "Permitir alternativas", exact: true })
      .click();
    await selectOption(page, grid);
    await expect(
      page
        .getByRole("button", {
          name: "Quitar opción " + grid.name,
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(page.locator(".supply-row")).toHaveCount(0);
    expect((await draft(context, id)).content.items).toEqual([]);
    await openFilters(page);
    await chooseAttribute(page, "Tipo de cuaderno", "Rayado");
    await showResults(page);
    await selectOption(page, ruled);
    expect((await draft(context, id)).content.items).toEqual([]);
    await capture(page, `${width}-selected-options`);
    const dialog = await review(page);
    await expect(dialog).toContainText(grid.name);
    await expect(dialog).toContainText(ruled.name);
    await fillGroup(dialog, "Cuaderno universitario a elección");
    await capture(page, `${width}-review-options`);
    await dialog
      .locator(".options-form-body")
      .evaluate((element) => (element.scrollTop = 0));
    await page.screenshot({
      path: `${artifacts}/${width}-review-overview.png`,
    });
    await dialog
      .getByRole("button", { name: "Guardar opciones", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await returnToList(page);
    const [item] = await waitForItems(context, id, 1);
    expect(item.name).toBe("Cuaderno universitario a elección");
    expect(item.quantity).toBe("2");
    expect(item.unit).toBe("unidad");
    expect(item.catalog_id).toBe("");
    expect(item.alternatives?.map((option) => option.catalog_id)).toEqual([
      grid.id,
      ruled.id,
    ]);
    expect(item.alternatives?.map((option) => option.attributes)).toEqual([
      grid.attributes,
      ruled.attributes,
    ]);
    expect(item.attributes).not.toHaveProperty("tipo_cuaderno");
    expect(item.attributes).not.toHaveProperty("cuadricula_mm");
    expect(item.attributes).toHaveProperty("formato");
    expect(item.attributes).toHaveProperty("numero_hojas");
    await expect(page.locator(".supply-row")).toHaveCount(1);
    await capture(page, `${width}-saved-requirement`);
    await page.reload();
    await expect(
      page
        .locator(".supply-row")
        .getByRole("textbox", { name: "Útil", exact: true }),
    ).toHaveValue(item.name);
    expect((await draft(context, id)).content.items[0]).toEqual(item);
    await page
      .getByRole("button", { name: "Publicar lista", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/listas/${id}$`));
    const row = page.locator(".checklist-item");
    await expect(row).toHaveCount(1);
    await expect(row.getByRole("checkbox")).toHaveCount(1);
    await expect(row.locator(".quantity")).toContainText("2 unidad");
    await expect(row.locator(".quantity")).toContainText("en total");
    await expect(row.locator(".accepted-options-list > li")).toHaveCount(2);
    await expect(row.locator(".accepted-options")).toContainText(grid.name);
    await expect(row.locator(".accepted-options")).toContainText(ruled.name);
    await row.evaluate((element) =>
      element.scrollIntoView({ block: "start", behavior: "instant" }),
    );
    await row.screenshot({
      path: `${artifacts}/${width}-parent-requirement.png`,
    });
    await capture(page, `${width}-parent-options`);
    const checkbox = row.getByRole("checkbox", {
      name: "Ya tengo " + item.name,
      exact: true,
    });
    await checkbox.check();
    await expect
      .poll(
        async () =>
          (
            await api<Progress>(
              context,
              "GET",
              `/lists/${id}/progress?version=1`,
            )
          ).items[item.id]?.checked,
      )
      .toBe(true);
    await page.reload();
    await expect(checkbox).toBeChecked();
  });
}

test("cancel, convert an existing row and explicitly return to one option without changing occurrence identity", async ({
  page,
  context,
}) => {
  await account(context);
  const grid = await notebook(context, "Cuadriculado"),
    ruled = await notebook(context, "Rayado");
  const original: Item = {
    ...ordinary(grid.name),
    catalog_id: grid.id,
    category: grid.category,
    quantity: "3",
    note: "Conservar esta indicación",
    attributes: grid.attributes,
  };
  const separate = ordinary("Lápiz obligatorio separado");
  const id = await seed(context, content([original, separate]));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto(`/editar/${id}`);
  await expect(page.locator(".supply-row")).toHaveCount(2);
  const row = page.locator(".supply-row").first();
  await row
    .getByRole("button", { name: "Permitir alternativas", exact: true })
    .click();
  await expect(
    row.getByRole("button", {
      name: "Aumentar cantidad de " + original.name,
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    row.getByRole("button", { name: "Quitar " + original.name, exact: true }),
  ).toBeDisabled();
  await expect(
    row.getByRole("textbox", { name: "Cantidad", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Publicar lista", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Cancelar alternativas", exact: true })
    .click();
  expect((await draft(context, id)).content.items).toEqual([
    original,
    separate,
  ]);
  await row
    .getByRole("button", { name: "Permitir alternativas", exact: true })
    .click();
  await configureNotebooks(page, "Rayado");
  await selectOption(page, ruled);
  let dialog = await review(page);
  await expect(
    dialog.getByLabel("Cantidad total", { exact: true }),
  ).toHaveValue("3");
  await expect(dialog.getByLabel("Nota opcional", { exact: true })).toHaveValue(
    original.note,
  );
  await dialog
    .getByLabel("Nombre del requisito", { exact: true })
    .fill("Cuaderno con dos opciones");
  await dialog
    .getByRole("button", { name: "Guardar opciones", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await draft(context, id)).content.items[0].alternatives?.length,
    )
    .toBe(2);
  const grouped = (await draft(context, id)).content.items;
  expect(grouped[0].id).toBe(original.id);
  expect(grouped[0].quantity).toBe("3");
  expect(grouped[0].note).toBe(original.note);
  expect(grouped[1]).toEqual(separate);
  await row
    .getByRole("button", { name: "Editar opciones", exact: true })
    .click();
  dialog = await review(page);
  await dialog
    .getByLabel("Nombre del requisito", { exact: true })
    .fill("Este cambio se cancela");
  await dialog
    .getByRole("button", { name: "Cancelar alternativas", exact: true })
    .click();
  expect((await draft(context, id)).content.items).toEqual(grouped);
  await row
    .getByRole("button", { name: "Editar opciones", exact: true })
    .click();
  dialog = await review(page);
  await dialog
    .getByRole("button", { name: "Quitar opción " + ruled.name, exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Guardar opciones", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Usar solo esta opción", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await draft(context, id)).content.items[0].alternatives?.length || 0,
    )
    .toBe(0);
  const result = (await draft(context, id)).content.items;
  expect(result[0].id).toBe(original.id);
  expect(result[0].catalog_id).toBe(grid.id);
  expect(result[0].name).toBe(grid.name);
  expect(result[0].quantity).toBe("3");
  expect(result[0].note).toBe(original.note);
  expect(result[0].attributes).toEqual(grid.attributes);
  expect(result[1]).toEqual(separate);
  await page.reload();
  await expect(page.locator(".supply-row")).toHaveCount(2);
  await publish(context, id);
  await page.goto(`/listas/${id}`);
  await expect(page.locator(".checklist-item")).toHaveCount(2);
  await expect(
    page.locator(".checklist-item").getByRole("checkbox"),
  ).toHaveCount(2);
  await expect(page.locator(".accepted-options")).toHaveCount(0);
});

test("free-text alternatives leave unspecified characteristics open and preserve unfinished input when browsing", async ({
  page,
  context,
}) => {
  const id = await editor(page, context, 390);
  await chooseCategory(page, "Cuadernos");
  await showResults(page);
  await page
    .getByRole("button", { name: "Permitir alternativas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Escribir opciones", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Opciones del útil",
    exact: true,
  });
  await fillGroup(dialog, "Cuaderno universitario");
  const names = [
    "Cuaderno universitario cuadriculado",
    "Cuaderno universitario rayado",
  ];
  await dialog.getByLabel("Opción libre", { exact: true }).fill(names[0]);
  await dialog
    .getByRole("button", { name: "Volver al catálogo", exact: true })
    .click();
  expect((await draft(context, id)).content.items).toEqual([]);
  await page
    .getByRole("button", { name: "Escribir opciones", exact: true })
    .click();
  dialog = page.getByRole("dialog", { name: "Opciones del útil", exact: true });
  await expect(
    dialog.getByLabel("Nombre del requisito", { exact: true }),
  ).toHaveValue("Cuaderno universitario");
  await expect(dialog.getByLabel("Opción libre", { exact: true })).toHaveValue(
    names[0],
  );
  await dialog
    .getByRole("button", { name: "Agregar opción libre", exact: true })
    .click();
  await dialog.getByLabel("Opción libre", { exact: true }).fill(names[0]);
  await dialog
    .getByRole("button", { name: "Agregar opción libre", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Esa opción ya está incluida.",
  );
  await expect(dialog.locator(".review-options > li")).toHaveCount(1);
  await dialog.getByLabel("Opción libre", { exact: true }).fill(names[1]);
  await dialog
    .getByRole("button", { name: "Agregar opción libre", exact: true })
    .click();
  await expect(dialog.locator(".review-options > li")).toHaveCount(2);
  await dialog
    .getByLabel("Nota opcional", { exact: true })
    .fill("El número de hojas queda a elección de la familia.");
  await capture(page, "390-free-options-review");
  await dialog
    .getByRole("button", { name: "Guardar opciones", exact: true })
    .click();
  const [item] = await waitForItems(context, id, 1);
  expect(item.name).toBe("Cuaderno universitario");
  expect(item.quantity).toBe("2");
  expect(item.category).toBe("Cuadernos");
  expect(item.catalog_id).toBe("");
  expect(item.attributes).toEqual({});
  expect(item.alternatives).toEqual(
    names.map((name) => ({ name, catalog_id: "", attributes: {} })),
  );
  await page.reload();
  await expect(page.locator(".supply-row")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Publicar lista", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`/listas/${id}$`));
  const row = page.locator(".checklist-item");
  await expect(row.getByRole("checkbox")).toHaveCount(1);
  await expect(row.locator(".accepted-option-name")).toHaveText(names);
  await expect(row.locator(".accepted-options-list small")).toHaveCount(0);
  await expect(row).toContainText(
    "El número de hojas queda a elección de la familia.",
  );
  await row.evaluate((element) =>
    element.scrollIntoView({ block: "start", behavior: "instant" }),
  );
  await row.screenshot({
    path: `${artifacts}/390-free-parent-requirement.png`,
  });
  await capture(page, "390-free-parent-options");
  await page.getByRole("button", { name: "Descargar PDF", exact: true }).first().click();
  const pdfDialog = page.getByRole("dialog", { name: "Vista previa del PDF", exact: true });
  await expect(pdfDialog.locator("app-pdf-preview img")).toBeVisible();
  await pdfDialog.getByRole("button", { name: "Dos columnas", exact: true }).click();
  await pdfDialog.getByRole("combobox", { name: "Papel", exact: true }).selectOption("A4");
  const pending = page.waitForEvent("download");
  await pdfDialog.getByRole("button", { name: "Descargar PDF", exact: true }).click();
  const file = `${artifacts}/alternatives-simple.pdf`;
  await (await pending).saveAs(file);
  const pdf = await inspectPdf(file);
  writeFileSync(`${artifacts}/alternatives-simple-validation.json`, JSON.stringify(pdf, null, 2));
  expect(pdf.pages).toBe(1); expect(pdf.printable).toBe(1); expect(pdf.bounds).toEqual([]);
  for (const name of names) expect(pdf.text).toContain(name);
  expect(pdf.text).not.toMatch(/\b(?:80|100) hojas\b/);
  await capture(page, "390-free-pdf-preview");
});

async function inspectPdf(file: string) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: new Uint8Array(readFileSync(file)),
    useSystemFonts: true,
  });
  try {
    const document = await task.promise;
    const bounds: unknown[] = [],
      checkboxes = [],
      images: string[] = [];
    let text = "",
      printable = 0;
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number),
        viewport = page.getViewport({ scale: 1 });
      const boxes = await inspectCheckboxes(page);
      printable += boxes.printable;
      checkboxes.push({ page: number, ...boxes });
      for (const item of (await page.getTextContent()).items)
        if ("str" in item) {
          text += item.str + " ";
          if (
            item.str.trim() &&
            (item.transform[4] < -1 ||
              item.transform[4] + item.width > viewport.width + 1 ||
              item.transform[5] < -1 ||
              item.transform[5] > viewport.height + 1)
          ) {
            bounds.push({
              page: number,
              text: item.str,
              x: item.transform[4],
              y: item.transform[5],
              width: item.width,
            });
          }
        }
      const rendered = page.getViewport({ scale: 1.25 });
      const canvas = createCanvas(
        Math.ceil(rendered.width),
        Math.ceil(rendered.height),
      );
      await page.render({
        canvasContext: canvas.getContext("2d") as never,
        viewport: rendered,
      }).promise;
      const image = file.replace(".pdf", `-page-${number}.png`);
      writeFileSync(image, canvas.toBuffer("image/png"));
      images.push(image);
      page.cleanup();
    }
    return {
      pages: document.numPages,
      text,
      bounds,
      checkboxes,
      printable,
      images,
    };
  } finally {
    await task.destroy();
  }
}
for (const layout of ["Dos columnas", "Barra lateral", "Fichas"]) {
  test(`PDF alternatives retain all12 long options with one checkbox per requirement: ${layout}`, async ({
    page,
    context,
  }) => {
    test.setTimeout(180_000);
    await account(context);
    const options = Array.from({ length: 12 }, (_, i) => ({
      catalog_id: "",
      name:
        (
          `Opción ${i + 1} ` +
          "Cuaderno universitario de características aceptadas por el curso. ".repeat(
            8,
          )
        ).slice(0, 280) + ` FINOPCION${i}`,
      attributes: {
        detalle: {
          name: "Características",
          value:
            `Descripción de alternativa ${i + 1}. ` +
            "Se permite esta opción con sus detalles completos. ".repeat(5) +
            ` FINATRIBUTO${i}`,
        },
      },
    }));
    const group: Item = {
      ...ordinary("Cuaderno a elección GRUPOUNICO"),
      category: "Cuadernos",
      quantity: "2",
      note: "La cantidad es total y cualquiera de estas opciones sirve. FINNOTAGRUPO",
      alternatives: options,
    };
    const ordinaryItem = ordinary("Lápiz obligatorio FILAINDEPENDIENTE");
    const id = await seed(context, content([group, ordinaryItem]));
    await publish(context, id);
    await page.goto(`/listas/${id}`);
    await page
      .getByRole("button", { name: "Descargar PDF", exact: true })
      .first()
      .click();
    const dialog = page.getByRole("dialog", {
      name: "Vista previa del PDF",
      exact: true,
    });
    await expect(dialog.locator("app-pdf-preview img")).toBeVisible();
    await dialog.getByRole("button", { name: layout, exact: true }).click();
    await dialog
      .getByRole("combobox", { name: "Papel", exact: true })
      .selectOption("A4");
    const pending = page.waitForEvent("download");
    await dialog
      .getByRole("button", { name: "Descargar PDF", exact: true })
      .click();
    const file = `${artifacts}/alternatives-${layout.replaceAll(" ", "-")}.pdf`;
    await (await pending).saveAs(file);
    const report = await inspectPdf(file);
    writeFileSync(
      file.replace(".pdf", "-validation.json"),
      JSON.stringify(report, null, 2),
    );
    expect(report.pages).toBeGreaterThan(1);
    for (let i = 0; i < 12; i++) {
      expect(report.text, `option${i} name`).toContain(`FINOPCION${i}`);
      expect(report.text, `option${i} attributes`).toContain(`FINATRIBUTO${i}`);
    }
    for (const marker of ["GRUPOUNICO", "FINNOTAGRUPO", "FILAINDEPENDIENTE"])
      expect(report.text).toContain(marker);
    expect(report.text.match(/GRUPOUNICO/g)).toHaveLength(1);
    expect(report.bounds).toEqual([]);
    expect(report.printable).toBe(2);
    expect(report.checkboxes.flatMap((page) => page.offPaper)).toEqual([]);
    expect(
      report.checkboxes.every((page) => page.duplicatePositions === 0),
    ).toBe(true);
  });
}

import { test, expect, BrowserContext, Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const environment = JSON.parse(
  readFileSync("../.local/qa/environment.json", "utf8"),
);
const headers = { "X-Requested-With": "lista-escolar" };
const artifacts = "../.local/qa/attribute-admin";
mkdirSync(artifacts, { recursive: true });
interface Category {
  id: number;
  slug: string;
}
interface CatalogPage {
  items: { id: string; name: string; review_status: string }[];
  total: number;
}
async function api<T>(
  context: BrowserContext,
  method: string,
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await context.request.fetch("/api" + path, {
    method,
    headers,
    data,
  });
  expect(response.status(), path).toBe(200);
  return response.json();
}
async function change(page: Page, action: () => Promise<unknown>) {
  const response = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/admin/catalog/browse" &&
      response.ok(),
  );
  await action();
  await response;
  await expect(page.locator(".catalog-options")).toHaveAttribute(
    "aria-busy",
    "false",
  );
}
async function capture(page: Page, label: string) {
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  writeFileSync(
    `${artifacts}/${label}-axe.json`,
    JSON.stringify(results.violations, null, 2),
  );
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page.screenshot({ path: `${artifacts}/${label}.png` });
}

test("administrator can page beyond 200 items, filter pending review and moderate without losing results", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  const tag = "paging-" + randomUUID().slice(0, 8);
  await api(context, "POST", "/auth/register", {
    email: `${tag}@example.invalid`,
    password: "QA-catalog-paging-2026",
    display_name: "Familia QA",
  });
  await api(context, "POST", "/admin/login", environment.admin);
  const categories = await api<Category[]>(
    context,
    "GET",
    "/catalog/categories",
  );
  const writing = categories.find((c) => c.slug === "escritura")!;
  const geometry = categories.find((c) => c.slug === "geometria")!;
  for (let start = 1; start <= 205; start += 5) {
    await Promise.all(
      Array.from({ length: Math.min(5, 206 - start) }, (_, index) =>
        api(context, "POST", "/admin/catalog", {
          name: `Aprobado ${tag} ${String(start + index).padStart(3, "0")}`,
          category_id: writing.id,
          approve: true,
        }),
      ),
    );
  }
  const pendingName = `ZZ pendiente ${tag}`;
  await api(context, "POST", "/catalog", {
    name: pendingName,
    category_id: writing.id,
  });
  await api(context, "POST", "/admin/catalog", {
    name: `Otro ${tag}`,
    category_id: geometry.id,
    approve: true,
  });
  await page.goto("/admin");
  await page
    .getByRole("navigation", { name: "Secciones de administración" })
    .getByRole("button", { name: "Útiles", exact: true })
    .click();
  await page.getByLabel("Buscar útil", { exact: true }).fill(tag);
  await change(page, () =>
    page.getByRole("button", { name: "Buscar", exact: true }).click(),
  );
  await expect(page.locator(".catalog-option")).toHaveCount(50);
  await expect(page.locator(".catalog-option").first()).toHaveAttribute(
    "aria-label",
    `Revisar ${pendingName}`,
  );
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "1–50 de 207 resultados",
  );
  const navigation = page.getByRole("navigation", {
    name: "Páginas del catálogo",
  });
  for (let index = 0; index < 4; index++) {
    await change(page, () =>
      navigation
        .getByRole("button", { name: "Siguiente", exact: true })
        .click(),
    );
  }
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "201–207 de 207 resultados",
  );
  await expect(page.locator("#admin-catalog-results-heading")).toBeFocused();
  await expect(page.locator(".catalog-option")).toHaveCount(7);
  await expect(
    page.getByRole("button", {
      name: `Revisar Aprobado ${tag} 205`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    navigation.getByRole("button", { name: "Siguiente", exact: true }),
  ).toBeDisabled();
  await capture(page, "desktop-final-page");

  await change(page, () =>
    page
      .getByRole("combobox", { name: "Estado", exact: true })
      .selectOption("pending"),
  );
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "1–1 de 1 resultado",
  );
  await page
    .getByRole("button", { name: `Revisar ${pendingName}`, exact: true })
    .click();
  await change(page, () =>
    page
      .getByRole("button", { name: "Aprobar y guardar", exact: true })
      .click(),
  );
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "0 resultados",
  );
  expect(
    (
      await api<CatalogPage>(
        context,
        "GET",
        `/admin/catalog/browse?q=${tag}&status=pending`,
      )
    ).total,
  ).toBe(0);
  await change(page, () =>
    page
      .getByRole("combobox", { name: "Estado", exact: true })
      .selectOption("approved"),
  );
  await change(page, () =>
    page
      .getByRole("combobox", { name: "Categoría del catálogo", exact: true })
      .selectOption("escritura"),
  );
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "1–50 de 206 resultados",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await capture(page, "mobile-first-page");
  await page
    .getByLabel("Buscar útil", { exact: true })
    .fill(`Aprobado ${tag} 205`);
  await change(page, () =>
    page.getByRole("button", { name: "Buscar", exact: true }).click(),
  );
  await expect(page.locator("#admin-catalog-results-heading")).toHaveText(
    "1–1 de 1 resultado",
  );
  await page
    .getByRole("button", { name: `Revisar Aprobado ${tag} 205`, exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Revisión del útil" }),
  ).toBeVisible();
  await capture(page, "mobile-target-review");
});

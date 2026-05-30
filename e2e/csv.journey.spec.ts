import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { authFile } from "../playwright/roles";

/**
 * Phase-8 CSV round-trip journey — the ONLY flow that crosses the
 * client/server serialization boundary twice, end-to-end against the live
 * seeded `crate_dev` DB (DEC-012) as a `manager`. Reuses the manager
 * storageState (ZERO rate-limit budget), same harness contract as the
 * catalog/stock/transfer/adjustment/PO journeys.
 *
 * Why this spec matters beyond coverage: export and import are TWO independent
 * implementations of one snake_case header contract. Export is pure client
 * (`downloadCsv`: Papa.unparse → Blob → `<a download>`, no server hop); import
 * re-parses that shape (`Papa.parse`) and drives it through the server-side
 * `importProductsAction` upsert (`onConflictDoUpdate` on SKU, manager-gated).
 * A header rename on one side only would silently break the round-trip — this
 * is the assertion that catches it.
 *
 * One real asymmetry forces the upsert proof's shape: the insert-vs-update
 * verdict is INFERRED server-side (`|createdAt - updatedAt| < 1000ms`), not a
 * flag returned by Postgres. So the only way to prove the conflict target (SKU)
 * actually fired — rather than silently inserting a duplicate — is to re-import
 * the SAME SKU with an edited name and assert the result reads `0 inserted ·
 * 1 updated`, then confirm the catalog row carries the NEW name.
 *
 * Self-contained against the persistent DB: a unique SKU per run
 * (`E2E-CSV-<stamp>`) keeps both the upsert idempotent and the catalog filter
 * exact across reseeds. Server-observable assertions only (Bima DoD): the
 * download's real bytes, the import result card refetched from the action, and
 * the catalog row after a fresh navigation — never the transient toast. Runs
 * only in `journeys` (SKIP_DB_E2E=0); per DEC-012 use `--workers=1` to dodge
 * cold-concurrency.
 */
test.use({ storageState: authFile("manager") });

test.describe("catalog · CSV round-trip journey", () => {
  const stamp = Date.now();
  const sku = `E2E-CSV-${stamp}`;
  const createName = `E2E CSV Widget ${stamp}`;
  const updatedName = `E2E CSV Widget ${stamp} (updated)`;

  // The 12 snake_case headers, in the order importProductsAction expects.
  // Blank category_slug / supplier_name → null FK (resolved, not rejected).
  const HEADERS =
    "sku,name,description,image_url,unit,barcode,category_slug,supplier_name,reorder_point,cost_price,selling_price,is_active";

  /** One data row for our unique SKU, aligned to HEADERS column order. */
  const buildCsv = (name: string) =>
    `${HEADERS}\n${sku},${name},,,pcs,,,,12,1000.00,2500.00,true\n`;

  /** The single table row matching our unique SKU (header row never matches). */
  const rowBySku = (page: Page) => page.getByRole("row").filter({ hasText: sku });

  /** Fresh navigation to /catalog, then narrow the table to our row. */
  async function openCatalogFilteredToRow(page: Page) {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await page.getByPlaceholder(/filter by sku/i).fill(sku);
  }

  /** Drive the hidden `input[type=file]` with an in-memory CSV buffer. */
  async function uploadCsv(page: Page, csv: string) {
    await page.goto("/catalog/import");
    await expect(
      page.getByRole("heading", { name: "Bulk product import" }),
    ).toBeVisible();
    await page.locator('input[type="file"]').setInputFiles({
      name: "products.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv, "utf8"),
    });
  }

  test("manager exports the template, imports a new product, then re-imports to upsert it", async ({
    page,
  }) => {
    // --- PHASE 1 · EXPORT (client-side download) ------------------------
    // The template button serializes via the SAME downloadCsv used everywhere;
    // proving its real bytes carry the snake_case header contract is what makes
    // the import half meaningful (one contract, two implementations).
    await page.goto("/catalog/import");
    await expect(
      page.getByRole("heading", { name: "Bulk product import" }),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download template" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("products-import-template.csv");
    const templateBytes = readFileSync(await download.path(), "utf8");
    // Header line is the contract the import side must accept verbatim.
    expect(templateBytes).toContain("sku,name");
    expect(templateBytes).toContain("category_slug");

    // --- PHASE 2 · IMPORT INSERT (new SKU) ------------------------------
    await uploadCsv(page, buildCsv(createName));
    // Preview parsed our one row as valid (client Zod) before any server hop.
    await expect(page.getByText(/1 valid/)).toBeVisible();
    await page.getByRole("button", { name: "Import 1" }).click();
    // Server-observable: the result card is rendered FROM the resolved action
    // (inserted/updated/errors), not a toast. New SKU ⇒ one insert.
    await expect(page.getByText(/1 inserted/)).toBeVisible();

    // --- PHASE 3 · VERIFY INSERT (fresh RSC query) ----------------------
    await openCatalogFilteredToRow(page);
    await expect(rowBySku(page)).toContainText(createName);

    // --- PHASE 4 · IMPORT UPSERT (same SKU, edited name) ----------------
    // Re-import the SAME SKU. The conflict target is SKU; onConflictDoUpdate
    // must UPDATE, not insert a duplicate. Verdict is inferred server-side
    // (|createdAt - updatedAt| < 1000ms), so "0 inserted · 1 updated" is the
    // only proof the conflict fired.
    await uploadCsv(page, buildCsv(updatedName));
    await expect(page.getByText(/1 valid/)).toBeVisible();
    await page.getByRole("button", { name: "Import 1" }).click();
    await expect(page.getByText(/1 updated/)).toBeVisible();
    await expect(page.getByText(/0 inserted/)).toBeVisible();

    // --- PHASE 5 · VERIFY UPSERT (name changed, still one row) ----------
    await openCatalogFilteredToRow(page);
    await expect(rowBySku(page)).toContainText(updatedName);
    // No duplicate: exactly one row carries this unique SKU after the upsert.
    await expect(rowBySku(page)).toHaveCount(1);
  });
});

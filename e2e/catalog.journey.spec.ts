import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * DEC-010 catalog journey — product create → edit → archive, end-to-end
 * against the live seeded DB as a `manager`. Reuses the manager storageState
 * (no in-test login, so it spends ZERO rate-limit budget).
 *
 * Each phase asserts a SERVER-OBSERVABLE effect (Bima's DoD): after a full
 * navigation (fresh RSC query from Postgres) the new row / renamed row /
 * archived status is present — not merely a transient success toast. Dialog
 * close is itself a server signal here: the form only closes `onOpenChange`
 * AFTER the awaited server action resolves ok.
 *
 * Runs only in the `journeys` project (SKIP_DB_E2E=0). A unique SKU per run
 * keeps it idempotent against the persistent VPS-hosted `crate_dev` test DB
 * (DEC-012), reached over the SSH tunnel on localhost:5436.
 */
test.use({ storageState: authFile("manager") });

test.describe("catalog · product lifecycle journey", () => {
  const stamp = Date.now();
  const sku = `E2E-${stamp}`;
  const createName = `E2E Widget ${stamp}`;
  const editedName = `E2E Widget ${stamp} (edited)`;

  /** The single table row matching our unique SKU (header row never matches). */
  const rowBySku = (page: Page) => page.getByRole("row").filter({ hasText: sku });

  /** Fresh navigation to /catalog, then narrow the table to our row. */
  async function openCatalogFilteredToRow(page: Page) {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await page.getByPlaceholder(/filter by sku/i).fill(sku);
  }

  test("manager creates, renames, then archives a product", async ({ page }) => {
    await page.goto("/catalog");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

    // --- CREATE ---------------------------------------------------------
    await page.getByRole("button", { name: /new product/i }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog.getByText("New product")).toBeVisible();
    await createDialog.getByLabel("SKU").fill(sku);
    await createDialog.getByRole("textbox", { name: "Name", exact: true }).fill(createName);
    await createDialog.getByRole("button", { name: "Create product" }).click();
    // Dialog closes only after the server action committed → server-observable.
    await expect(createDialog).toBeHidden();

    await openCatalogFilteredToRow(page);
    await expect(rowBySku(page)).toContainText(createName);
    await expect(rowBySku(page).getByText("Active")).toBeVisible();

    // --- EDIT (rename) --------------------------------------------------
    // Exercises the DEC-009 fix for real: base-ui Menu.Item onSelect→onClick.
    await rowBySku(page).getByRole("button", { name: /^Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog.getByText("Edit product")).toBeVisible();
    await editDialog.getByRole("textbox", { name: "Name", exact: true }).fill(editedName);
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).toBeHidden();

    await openCatalogFilteredToRow(page);
    await expect(rowBySku(page)).toContainText(editedName);

    // --- ARCHIVE --------------------------------------------------------
    await rowBySku(page).getByRole("button", { name: /^Actions for/ }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    // No dialog here, and the action is fire-and-forget inside a transition.
    // Assert the SERVER-OBSERVABLE effect — the row's status badge flips to
    // "Archived" once revalidatePath refetches from Postgres — NOT the
    // transient success toast (same DoD principle as the create/edit phases;
    // the toast is ~4s, ambiguous with this badge, and lives in a layout that
    // an error boundary can unmount). Scoped to our row so nothing else matches.
    await expect(rowBySku(page).getByText("Archived")).toBeVisible();

    await openCatalogFilteredToRow(page);
    await expect(rowBySku(page).getByText("Archived")).toBeVisible();
    // The action flips to "Unarchive" — confirms isActive=false round-tripped.
    await rowBySku(page).getByRole("button", { name: /^Actions for/ }).click();
    await expect(page.getByRole("menuitem", { name: "Unarchive" })).toBeVisible();
  });
});

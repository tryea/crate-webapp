import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * Phase-8 stock-movement journey: stock-in → valid stock-out → insufficient
 * BLOCK, end-to-end against the live seeded `crate_dev` DB (DEC-012) as a
 * `manager`. Reuses the manager storageState (no in-test login → ZERO
 * rate-limit budget), same harness contract as catalog.journey.spec.ts.
 *
 * The third phase is the point: it proves Vox's §4.3 no-negative-stock
 * integrity rule is enforced SERVER-SIDE, not just by the client form. The
 * quantity schema is `z.number().int().positive()` with NO max, so a wildly
 * over-budget quantity passes the client zodResolver and reaches the server,
 * where the stock gate rejects it with a field error and the form STAYS put
 * (no router.push). Asserting "URL unchanged + error copy visible" is the
 * server-observable proof (Bima's DoD), the mirror of the create/edit phases.
 *
 * Idempotent against the persistent VPS test DB: each phase tags its ledger
 * row with a unique reference (`E2E-IN-<stamp>` / `E2E-OUT-<stamp>`) so the
 * /movements filter narrows to exactly the row this run created. Net effect of
 * a run is +12 then -5 = +7 units at BEV-001 · Jakarta Central A1; the block
 * phase requests 999999, which no amount of accumulated runs will approach.
 *
 * Runs only in the `journeys` project (SKIP_DB_E2E=0). Per DEC-012, run with
 * `--workers=1` (or E2E_PROD=1) to dodge the cold-concurrency CONNECT_TIMEOUT.
 */
test.use({ storageState: authFile("manager") });

test.describe("movements · stock lifecycle journey", () => {
  const stamp = Date.now();
  const refIn = `E2E-IN-${stamp}`;
  const refOut = `E2E-OUT-${stamp}`;

  /** Product + location are stable seed targets shared across all phases. */
  const PRODUCT = /BEV-001/; // "Mineral Water 600ml", unique SKU
  const LOCATION = /A1/; // first match = Jakarta Central A1 (deterministic order)

  /** The single ledger row carrying our unique reference (header never matches). */
  const rowByRef = (page: Page, ref: string) =>
    page.getByRole("row").filter({ hasText: ref });

  /**
   * Pick an option from a base-ui Select. The Trigger exposes role=combobox
   * labelled by its FormField <Label htmlFor>, so getByLabel resolves it; the
   * popup Items expose role=option (verified against @base-ui/react v1.5.0
   * source: R-ADAPTER discipline, never assume Radix semantics).
   */
  async function pick(page: Page, fieldLabel: string, optionName: RegExp) {
    await page.getByLabel(fieldLabel).click();
    await page.getByRole("option", { name: optionName }).first().click();
  }

  /** Fresh navigation to /movements, then narrow the ledger to one reference. */
  async function openLedgerFilteredTo(page: Page, ref: string) {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
    await page.getByPlaceholder(/filter by product/i).fill(ref);
  }

  test("manager records stock-in, a valid stock-out, then is blocked from overdrawing", async ({
    page,
  }) => {
    // --- PHASE 1 · STOCK-IN (+12) ---------------------------------------
    await page.goto("/movements/new/stock-in");
    await expect(page.getByRole("heading", { name: "Stock in" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Receive into", LOCATION);
    await page.getByLabel("Quantity").fill("12");
    await page.getByLabel("Reference").fill(refIn);
    await page.getByRole("button", { name: "Record stock-in" }).click();
    // Success path navigates back to the ledger only after the action commits.
    await expect(page).toHaveURL(/\/movements$/);

    await openLedgerFilteredTo(page, refIn);
    await expect(rowByRef(page, refIn)).toContainText("Stock in");
    await expect(rowByRef(page, refIn)).toContainText("+12");

    // --- PHASE 2 · VALID STOCK-OUT (-5) ---------------------------------
    // 5 ≤ 12 just received at the same location → the gate must pass.
    await page.goto("/movements/new/stock-out");
    await expect(page.getByRole("heading", { name: "Stock out" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Issue from", LOCATION);
    await page.getByLabel("Quantity").fill("5");
    await page.getByLabel("Reference").fill(refOut);
    await page.getByRole("button", { name: "Record stock-out" }).click();
    await expect(page).toHaveURL(/\/movements$/);

    await openLedgerFilteredTo(page, refOut);
    await expect(rowByRef(page, refOut)).toContainText("Stock out");
    await expect(rowByRef(page, refOut)).toContainText("-5");

    // --- PHASE 3 · INSUFFICIENT-STOCK BLOCK (server-side integrity) -----
    // 999999 passes the client schema (positive int, no max) and reaches the
    // server, where the no-negative-stock gate rejects it. The form maps the
    // field error and does NOT navigate → we stay on the stock-out route and
    // see the exact server copy. This is the §4.3 integrity rule proven for
    // real, not asserted.
    await page.goto("/movements/new/stock-out");
    await expect(page.getByRole("heading", { name: "Stock out" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Issue from", LOCATION);
    await page.getByLabel("Quantity").fill("999999");
    await page.getByRole("button", { name: "Record stock-out" }).click();

    // Server-observable proof of the block: error copy surfaces AND the form
    // never left the page (no router.push on a rejected action).
    await expect(
      page.getByText("More than available at this location."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/movements\/new\/stock-out$/);
  });
});

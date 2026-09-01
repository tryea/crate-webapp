import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * Phase-8 transfer journey: the two-sided, single-transaction flow, end-to-end
 * against the live seeded `crate_dev` DB (DEC-012) as a `manager`. Reuses the
 * manager storageState (ZERO rate-limit budget), same harness contract as
 * catalog/stock journeys.
 *
 * Why this spec matters beyond coverage: transfer's source-side decrement runs
 * through the SAME `getLevelLocked` gate that DEC-013 just repaired (advisory
 * lock, not `SUM … FOR UPDATE`). This drives that fix on a second flow and
 * proves the atomic pair lands: ONE transfer_out (−N at source) + ONE
 * transfer_in (+N at dest), both carrying our reference, never partial.
 *
 * Self-contained against the persistent DB: Phase 1 stock-ins +20 at the source
 * so the transfer can't depend on accumulated state (survives a fresh reseed).
 * Unique references (`E2E-TXSEED-/E2E-TX-<stamp>`) keep the ledger filter exact.
 *
 * Server-observable assertions only (Bima DoD): dialog/route transitions and
 * refetched ledger rows, never the transient toast. Runs only in `journeys`
 * (SKIP_DB_E2E=0); per DEC-012 use `--workers=1` to dodge cold-concurrency.
 */
test.use({ storageState: authFile("manager") });

test.describe("movements · transfer journey", () => {
  const stamp = Date.now();
  const refSeed = `E2E-TXSEED-${stamp}`;
  const refTx = `E2E-TX-${stamp}`;

  const PRODUCT = /BEV-001/; // "Mineral Water 600ml"
  const SOURCE = /A1/; // first match = Jakarta Central A1 (deterministic order)
  const DEST = /A2/; // first match = Jakarta Central A2, distinct from source

  const rowByRef = (page: Page, ref: string) =>
    page.getByRole("row").filter({ hasText: ref });

  /**
   * base-ui Select: combobox trigger → role=option (v1.5.0, R-ADAPTER). Target
   * the trigger by its `combobox` role with an EXACT accessible name, NOT
   * `getByLabel`. Two traps `getByRole` sidesteps at once:
   *   1. `getByLabel` substring-matches across roles, so the short "To"/"From"
   *      labels collide with the Next.js / TanStack devtools BUTTONS
   *      ("…Dev Tools" / "…devtools" both contain "to").
   *   2. `getByLabel` folds the required-field "*" into the label ("Product *"),
   *      so `{ exact: true }` there never matches. The combobox's accessible
   *      name is the bare field label (asterisk excluded), exact-matchable.
   */
  async function pick(page: Page, fieldLabel: string, optionName: RegExp) {
    await page.getByRole("combobox", { name: fieldLabel, exact: true }).click();
    await page.getByRole("option", { name: optionName }).first().click();
  }

  async function openLedgerFilteredTo(page: Page, ref: string) {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
    await page.getByPlaceholder(/filter by product/i).fill(ref);
  }

  test("manager seeds source stock, transfers between locations, then is blocked from over-transferring", async ({
    page,
  }) => {
    // --- PHASE 1 · SEED SOURCE (+20 at A1) ------------------------------
    await page.goto("/movements/new/stock-in");
    await expect(page.getByRole("heading", { name: "Stock in" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Receive into", SOURCE);
    await page.getByLabel("Quantity").fill("20");
    await page.getByLabel("Reference").fill(refSeed);
    await page.getByRole("button", { name: "Record stock-in" }).click();
    await expect(page).toHaveURL(/\/movements$/);

    // --- PHASE 2 · VALID TRANSFER (8 from A1 → A2) ----------------------
    await page.goto("/movements/new/transfer");
    await expect(page.getByRole("heading", { name: "Transfer" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "From", SOURCE);
    await pick(page, "To", DEST);
    await page.getByLabel("Quantity").fill("8");
    await page.getByLabel("Reference").fill(refTx);
    await page.getByRole("button", { name: "Record transfer" }).click();
    await expect(page).toHaveURL(/\/movements$/);

    // The atomic pair: filtering by our reference returns BOTH legs; split them
    // by their type badge and assert the signed qty + location on each.
    await openLedgerFilteredTo(page, refTx);
    const outLeg = rowByRef(page, refTx).filter({ hasText: "Transfer out" });
    const inLeg = rowByRef(page, refTx).filter({ hasText: "Transfer in" });
    await expect(outLeg).toContainText("-8");
    await expect(outLeg).toContainText("A1");
    await expect(inLeg).toContainText("+8");
    await expect(inLeg).toContainText("A2");

    // --- PHASE 3 · OVER-TRANSFER BLOCK (server-side integrity) ----------
    // 999999 passes the client schema (positive int, no max) → the server gate
    // rejects it against the SOURCE level. Distinct copy from stock-out: the
    // transfer field error says "…at source location."
    await page.goto("/movements/new/transfer");
    await expect(page.getByRole("heading", { name: "Transfer" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "From", SOURCE);
    await pick(page, "To", DEST);
    await page.getByLabel("Quantity").fill("999999");
    await page.getByRole("button", { name: "Record transfer" }).click();

    await expect(
      page.getByText("More than available at source location."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/movements\/new\/transfer$/);
  });
});

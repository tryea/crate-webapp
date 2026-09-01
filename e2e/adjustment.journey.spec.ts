import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * Phase-8 adjustment journey: the THIRD and final decrement flow that runs
 * through the shared `getLevelLocked` gate DEC-013 repaired (stock-out and
 * transfer are the other two). A negative `delta` takes the advisory lock +
 * checkDecrementAllowed exactly like the others; this proves the fix holds on
 * the signed-delta shape too. Manager storageState (ZERO rate-limit budget),
 * same harness contract as catalog/stock/transfer journeys.
 *
 * One real asymmetry forces a different assertion than the sibling journeys:
 * the adjustment movement has NO `reference` column (adjustments are explained
 * by a *required note*, not an external doc number), so the ref-based ledger
 * filter the other journeys lean on isn't available. Instead we assert the
 * MOST-RECENT `Adjustment` row: `listRecentMovementsServer` orders
 * `desc(createdAt)` and the table's initial sort state is empty (preserves
 * data order), so the first `Adjustment` row is deterministically the one we
 * just recorded, robust against ledger accumulation across reseeds.
 *
 * Self-contained against the persistent DB: Phase 1 stock-ins +30 at A1 so the
 * valid −6 can't depend on accumulated state (survives a fresh reseed). Notes
 * are REQUIRED on adjustments (Zod min(1)), filled in BOTH adjustment phases,
 * else the client schema would reject on `notes` before the server gate runs.
 *
 * Server-observable assertions only (Bima DoD): route transitions + refetched
 * ledger rows, never the transient toast. Runs only in `journeys`
 * (SKIP_DB_E2E=0); per DEC-012 use `--workers=1` to dodge cold-concurrency.
 */
test.use({ storageState: authFile("manager") });

test.describe("movements · adjustment journey", () => {
  const stamp = Date.now();
  const refSeed = `E2E-ADJSEED-${stamp}`;

  const PRODUCT = /BEV-001/; // "Mineral Water 600ml"
  const LOCATION = /A1/; // first match = Jakarta Central A1 (deterministic order)

  /**
   * base-ui Select: combobox trigger → role=option (v1.5.0, R-ADAPTER). Target
   * the trigger by its `combobox` role with an EXACT accessible name, NOT
   * `getByLabel`, which substring-matches across roles (short labels collide
   * with the Next.js / TanStack devtools buttons) and folds the required "*"
   * into the label so `{ exact }` never matches. The combobox's accessible
   * name is the bare field label (asterisk excluded), exact-matchable.
   */
  async function pick(page: Page, fieldLabel: string, optionName: RegExp) {
    await page.getByRole("combobox", { name: fieldLabel, exact: true }).click();
    await page.getByRole("option", { name: optionName }).first().click();
  }

  test("manager seeds stock, posts a valid negative adjustment, then is blocked from over-correcting", async ({
    page,
  }) => {
    // --- PHASE 1 · SEED STOCK (+30 at A1) -------------------------------
    await page.goto("/movements/new/stock-in");
    await expect(page.getByRole("heading", { name: "Stock in" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Receive into", LOCATION);
    await page.getByLabel("Quantity").fill("30");
    await page.getByLabel("Reference").fill(refSeed);
    await page.getByRole("button", { name: "Record stock-in" }).click();
    await expect(page).toHaveURL(/\/movements$/);

    // --- PHASE 2 · VALID NEGATIVE ADJUSTMENT (−6 damage at A1) ----------
    await page.goto("/movements/new/adjustment");
    await expect(page.getByRole("heading", { name: "Adjustment" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Location", LOCATION);
    await pick(page, "Reason", /Damage/);
    await page.getByLabel("Delta").fill("-6");
    await page
      .getByLabel("Notes")
      .fill(`E2E damage write-off, 6 units, ${stamp}`);
    await page.getByRole("button", { name: "Record adjustment" }).click();
    await expect(page).toHaveURL(/\/movements$/);

    // Re-fetch the ledger and assert the newest Adjustment row is ours: a
    // signed −6 at A1, reason "damage". (No reference to filter on, the
    // desc(createdAt) order makes the first Adjustment row deterministic.)
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
    const adjRow = page
      .getByRole("row")
      .filter({ hasText: "Adjustment" })
      .first();
    await expect(adjRow).toContainText("-6");
    await expect(adjRow).toContainText("A1");
    await expect(adjRow).toContainText("damage");

    // --- PHASE 3 · OVER-CORRECTION BLOCK (server-side integrity) --------
    // −999999 passes the client schema (non-zero int, no min) → the server
    // gate rejects it against the current level. Distinct copy from the other
    // two flows: the adjustment field error is on `delta`.
    await page.goto("/movements/new/adjustment");
    await expect(page.getByRole("heading", { name: "Adjustment" })).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await pick(page, "Location", LOCATION);
    await page.getByLabel("Delta").fill("-999999");
    await page.getByLabel("Notes").fill(`E2E over-correction probe, ${stamp}`);
    await page.getByRole("button", { name: "Record adjustment" }).click();

    await expect(
      page.getByText("Negative delta exceeds current level."),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/movements\/new\/adjustment$/);
  });
});

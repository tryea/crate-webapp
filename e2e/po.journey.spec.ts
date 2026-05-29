import { test, expect, type Page } from "@playwright/test";
import { authFile } from "../playwright/roles";

/**
 * Phase-8 purchase-order lifecycle journey — the full state machine end-to-end
 * against the live seeded `crate_dev` DB (DEC-012) as a `manager`. Reuses the
 * manager storageState (ZERO rate-limit budget), same harness contract as the
 * catalog/stock/transfer/adjustment journeys.
 *
 * Why this spec matters beyond coverage: PO is the only flow with a server-side
 * STATUS MACHINE (draft → sent → partial → received) plus a transactional
 * receive that writes a `stock_in` movement per line carrying the PO number as
 * its reference. This drives create → add-line → mark-sent → partial-receive,
 * then proves the OVER-RECEIVE guard (`receivePoAction`: projected qty >
 * quantityOrdered ⇒ rejected) holds against real DB state — not asserted.
 *
 * Two real asymmetries force a different shape than the sibling journeys:
 *   1. The PO number is GENERATED server-side ("PO-2026-NNN"), so we can't
 *      pre-seed a unique reference. Instead we capture the real number from the
 *      detail `<h1>` after creation and use IT as the ledger filter — the
 *      receive writes `stock_in` with `reference = po.poNumber`. Self-contained
 *      against a fresh reseed: every run drafts a brand-new PO.
 *   2. The over-receive error surfaces ONLY as a transient toast (the receive
 *      form has no field-error binding). Bima's DoD forbids asserting on the
 *      toast, so the block is proven SERVER-OBSERVABLY: after the rejected
 *      attempt the ledger still holds EXACTLY ONE `Stock in` row for this PO and
 *      the status is STILL "Partial" on reload — the second receipt never
 *      committed.
 *
 * Server-observable assertions only (Bima DoD): status badge in the heading,
 * refetched ledger rows, never the transient toast. Runs only in `journeys`
 * (SKIP_DB_E2E=0); per DEC-012 use `--workers=1` to dodge cold-concurrency.
 */
test.use({ storageState: authFile("manager") });

test.describe("orders · purchase-order lifecycle journey", () => {
  const PRODUCT = /BEV-001/; // "Mineral Water 600ml"

  const rowByRef = (page: Page, ref: string) =>
    page.getByRole("row").filter({ hasText: ref });

  /**
   * base-ui Select: combobox trigger → role=option (v1.5.0, R-ADAPTER). Target
   * the trigger by its `combobox` role with an EXACT accessible name — NOT
   * `getByLabel`, which substring-matches across roles AND folds the required
   * "*" into the label so `{ exact }` never matches. The combobox's accessible
   * name is the bare field label (asterisk excluded) — exact-matchable.
   */
  async function pick(page: Page, fieldLabel: string, optionName: RegExp) {
    await page.getByRole("combobox", { name: fieldLabel, exact: true }).click();
    await page.getByRole("option", { name: optionName }).first().click();
  }

  /** Same combobox contract, but take the FIRST option (supplier/warehouse are
   *  seed-dependent; we don't care which one, only that the PO is well-formed). */
  async function pickFirst(page: Page, fieldLabel: string) {
    await page.getByRole("combobox", { name: fieldLabel, exact: true }).click();
    await page.getByRole("option").first().click();
  }

  async function openLedgerFilteredTo(page: Page, ref: string) {
    await page.goto("/movements");
    await expect(page.getByRole("heading", { name: "Movements" })).toBeVisible();
    await page.getByPlaceholder(/filter by product/i).fill(ref);
  }

  test("manager drafts a PO, adds a line, sends it, partial-receives, then is blocked from over-receiving", async ({
    page,
  }) => {
    // --- PHASE 1 · CREATE DRAFT -----------------------------------------
    await page.goto("/orders");
    await expect(
      page.getByRole("heading", { name: "Purchase orders", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "New PO" }).click();
    await expect(
      page.getByRole("heading", { name: "New purchase order" }),
    ).toBeVisible();
    await pickFirst(page, "Supplier");
    await pickFirst(page, "Receive into warehouse");
    await page.getByRole("button", { name: "Create draft" }).click();

    // Success navigates to the detail route only after the draft commits.
    await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
    const poUrl = page.url();
    // The page <h1> ("PO-NNNN-NNN  <status>") collides with the app-shell brand
    // <h1> ("Crate") under a bare level=1 query — pin the PO heading by its
    // number pattern. The regex matches regardless of the status suffix, so the
    // same locator stays valid as the badge flips Draft → Sent → Partial.
    const heading = page.getByRole("heading", { name: /PO-\d{4}-\d+/ });
    await expect(heading).toContainText("Draft");

    // The PO number is generated server-side — capture it; it becomes the
    // ledger reference carried by the receive movement.
    const poNumber = (await heading.textContent())?.match(/PO-\d{4}-\d+/)?.[0] ?? "";
    expect(poNumber).toMatch(/^PO-\d{4}-\d+$/);

    // --- PHASE 2 · ADD LINE (BEV-001 × 10 @ 1500) -----------------------
    // `exact` on the header trigger excludes the empty-state "Add first line".
    await page.getByRole("button", { name: "Add line", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Add line" }),
    ).toBeVisible();
    await pick(page, "Product", PRODUCT);
    await page.getByLabel("Qty").fill("10");
    // Unit cost auto-fills from catalog price on product pick; pin it explicitly
    // so the money-regex can't trip on an unexpected seed cost shape.
    await page.getByLabel("Unit cost").fill("1500");
    // Submit "Add line" collides with the header trigger of the same name —
    // scope to the dialog.
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Add line" })
      .click();

    // Line landed: the row shows the SKU and an ordered qty of 10.
    await expect(rowByRef(page, "BEV-001")).toContainText("10");

    // --- PHASE 3 · MARK SENT --------------------------------------------
    // "Mark sent" appears only once the draft HAS a line (canSend = draft &&
    // hasLines) — its presence is itself proof the line persisted.
    await page.getByRole("button", { name: "Mark sent" }).click();
    await expect(heading).toContainText("Sent");

    // --- PHASE 4 · PARTIAL RECEIVE (4 of 10) ----------------------------
    // The receive form mounts only when status ∈ {sent, partial}. Default
    // receive-now = remaining (10); we take 4 → status must drop to "Partial".
    await page.getByLabel(/Receive now for/).fill("4");
    await page.getByRole("button", { name: "Record receipt" }).click();
    await expect(heading).toContainText("Partial");

    // Server-observable proof of the receipt: a stock_in carrying the PO number
    // landed for +4. (reference = po.poNumber, reason "purchase".)
    await openLedgerFilteredTo(page, poNumber);
    const receiptRow = rowByRef(page, poNumber).filter({ hasText: "Stock in" });
    await expect(receiptRow).toContainText("+4");

    // --- PHASE 5 · OVER-RECEIVE BLOCK (server-side integrity) -----------
    // Back on the PO: remaining is now 6. Typing 7 passes the client (the
    // `max` attr is a hint, not enforcement) → projected 4 + 7 = 11 > 10
    // ordered → the server gate rejects. Bima DoD: the error is a transient
    // toast, so we DON'T assert it — we prove the block by server state.
    await page.goto(poUrl);
    await expect(heading).toContainText("Partial");
    await page.getByLabel(/Receive now for/).fill("7");
    await page.getByRole("button", { name: "Record receipt" }).click();

    // Proof #1: exactly ONE receipt exists for this PO — the +7 never committed.
    await openLedgerFilteredTo(page, poNumber);
    await expect(
      rowByRef(page, poNumber).filter({ hasText: "Stock in" }),
    ).toHaveCount(1);

    // Proof #2: the PO is STILL "Partial" (not "Received") on a fresh load.
    await page.goto(poUrl);
    await expect(heading).toContainText("Partial");
  });
});

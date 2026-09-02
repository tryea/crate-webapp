import { test, expect, type Page } from "@playwright/test";

/**
 * DEC-007 spec: switching the UI language from the user menu re-renders
 * the shell in the new locale and persists via the NEXT_LOCALE cookie.
 *
 * Reality-based check (not a unit assertion on the catalog): drives the real
 * dropdown → server action → router.refresh() path and verifies the sidebar
 * nav actually flips English → Indonesian.
 *
 * Requires a live DB + seeded users.
 */
const SKIP_REASON =
  "Requires live DB + seeded users (run db:migrate + db:seed first). Set SKIP_DB_E2E=0 to enable.";

/**
 * Open the topbar user menu and do not continue until it is actually open.
 *
 * `expect(page).toHaveURL(...)` in the beforeEach resolves as soon as the
 * browser swaps the URL, which on the sign-in redirect happens while the new
 * document is still loading. A click that lands in that window moves focus to
 * the trigger natively but finds no React handler attached yet, so it is
 * swallowed: the menu never opens and the spec then waits out its full timeout
 * on an item that will never exist (observed on both `next dev` and a
 * production build, with the trigger focused and no `menu` node in the tree).
 *
 * Only the ACT step is retried, never an assertion: the menu still has to open
 * for real, and every behavioural assertion below is untouched.
 */
async function openUserMenu(page: Page, triggerName: string) {
  const trigger = page.getByRole("button", { name: triggerName });
  await expect(async () => {
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

test.describe("i18n · locale switch", () => {
  test.skip(process.env.SKIP_DB_E2E !== "0", SKIP_REASON);

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("admin@crate.local");
    // exact:true so we don't also match the "Show password" toggle button.
    await page.getByLabel("Password", { exact: true }).fill("ChangeMe!Admin");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("user menu switches shell language to Indonesian and back", async ({
    page,
  }) => {
    // The rail is a `navigation` landmark, not `complementary`: the primary
    // nav lives in `<nav aria-label="Primary">` inside an unnamed `<aside>`.
    // Scoping to the landmark (not the whole page) is what keeps this spec
    // about the SIDEBAR labels and not about stray text elsewhere.
    const sidebar = page.getByRole("navigation", { name: "Primary" });

    // Default locale (no cookie) renders English.
    await expect(
      sidebar.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();

    // Switch to Indonesian via the user menu's language radio group.
    await openUserMenu(page, "User menu");
    await page
      .getByRole("menuitemradio", { name: "Bahasa Indonesia" })
      .click();

    // router.refresh() re-renders RSC in the new locale; expect auto-retries.
    await expect(sidebar.getByRole("link", { name: "Dasbor" })).toBeVisible();
    await expect(
      sidebar.getByRole("link", { name: "Dashboard" }),
    ).toHaveCount(0);

    // The cookie persists the choice across a full reload (no URL change).
    await page.reload();
    await expect(sidebar.getByRole("link", { name: "Dasbor" })).toBeVisible();

    // Switch back to English to confirm the toggle is bidirectional.
    await openUserMenu(page, "Menu pengguna");
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(
      sidebar.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
  });
});

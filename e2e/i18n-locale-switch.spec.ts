import { test, expect } from "@playwright/test";

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
    const sidebar = page.getByRole("complementary", { name: "Primary" });

    // Default locale (no cookie) renders English.
    await expect(
      sidebar.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();

    // Switch to Indonesian via the user menu's language radio group.
    await page.getByRole("button", { name: "User menu" }).click();
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
    await page.getByRole("button", { name: "Menu pengguna" }).click();
    await page.getByRole("menuitemradio", { name: "English" }).click();
    await expect(
      sidebar.getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
  });
});

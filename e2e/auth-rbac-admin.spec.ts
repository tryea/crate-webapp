import { test, expect } from "@playwright/test";

/**
 * DEC-003 spec 3/3: a signed-in `admin` user can reach every protected
 * surface, including those gated to admin-only.
 *
 * Requires a live DB + seeded users.
 */
const SKIP_REASON =
  "Requires live DB + seeded users (run db:migrate + db:seed first). Set SKIP_DB_E2E=0 to enable.";

test.describe("auth · RBAC · admin", () => {
  test.skip(
    process.env.SKIP_DB_E2E !== "0",
    SKIP_REASON,
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("admin@crate.local");
    // exact:true so we don't also match the "Show password" toggle button.
    await page.getByLabel("Password", { exact: true }).fill("ChangeMe!Admin");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("admin sees dashboard with role indicator", async ({ page }) => {
    await expect(page.getByText(/signed in as.*admin/i)).toBeVisible();
  });

  // Phase 2.3+ will add /users etc., for now we just confirm admin lands
  // on dashboard without bouncing.
});

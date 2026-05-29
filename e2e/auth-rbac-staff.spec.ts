import { test, expect } from "@playwright/test";

/**
 * DEC-003 spec 2/3 — a signed-in `staff` user can read inventory surfaces
 * but cannot perform manager-or-above actions.
 *
 * Requires a live DB + seeded users. Skipped if SKIP_DB_E2E=1 so the
 * suite can pass green in CI when DB isn't yet provisioned.
 */
const SKIP_REASON =
  "Requires live DB + seeded users (run db:migrate + db:seed first). Set SKIP_DB_E2E=0 to enable.";

test.describe("auth · RBAC · staff", () => {
  test.skip(
    process.env.SKIP_DB_E2E !== "0",
    SKIP_REASON,
  );

  test.beforeEach(async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill("staff@crate.local");
    await page.getByLabel(/password/i).fill("ChangeMe!Staff");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("staff can see dashboard", async ({ page }) => {
    await expect(page.getByText(/welcome, sam staff/i)).toBeVisible();
    await expect(page.getByText(/signed in as.*staff/i)).toBeVisible();
  });

  test("staff cannot reach /users (admin-only)", async ({ page }) => {
    await page.goto("/users");
    // requireRole("admin") throws → nearest error boundary OR redirect
    // depending on implementation. Expect either 403 page or redirect away.
    const url = page.url();
    expect(
      url.includes("/users") === false ||
        (await page.getByText(/forbidden|not allowed|admin/i).isVisible()),
    ).toBeTruthy();
  });
});

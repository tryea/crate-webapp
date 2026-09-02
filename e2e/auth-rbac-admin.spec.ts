import { test, expect } from "@playwright/test";
import { roleIndicator } from "./role-indicator";

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
    // The shell carries the signed-in role in the topbar profile button
    // (`<span data-slot="user-role">`), not in a "signed in as ..." line.
    // Scope to that node and assert its exact text: the seeded display names
    // themselves contain the role word ("Admin", "Mira Manager", "Sam Staff"),
    // so a loose text match on the button would still pass with the role
    // indicator deleted, which would make this spec unable to fail.
    await expect(roleIndicator(page)).toHaveText("Admin");
  });

  // Phase 2.3+ will add /users etc., for now we just confirm admin lands
  // on dashboard without bouncing.
});

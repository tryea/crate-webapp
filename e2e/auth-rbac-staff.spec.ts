import { test, expect } from "@playwright/test";
import { roleIndicator } from "./role-indicator";

/**
 * DEC-003 spec 2/3: a signed-in `staff` user can read inventory surfaces
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
    // exact:true so we don't also match the "Show password" toggle button.
    await page.getByLabel("Password", { exact: true }).fill("ChangeMe!Staff");
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("staff can see dashboard", async ({ page }) => {
    // The dashboard opens with a one-sentence verdict, not a greeting, so
    // there is no "Welcome, ..." to look for. Anchor on the panel heading
    // instead: it is structural (always rendered) and it only appears once
    // the protected shell has actually rendered for this role.
    await expect(
      page.getByRole("heading", { level: 2, name: "Needs you" }),
    ).toBeVisible();
    // Same reasoning as auth-rbac-admin: assert the role node exactly, the
    // seeded name "Sam Staff" already contains the word "Staff".
    await expect(roleIndicator(page)).toHaveText("Staff");
  });

  test("staff cannot reach /users (admin-only)", async ({ page }) => {
    // DEC-003 / DEC-021: requireRolePage("admin") redirects an under-privileged
    // role to /dashboard (it does NOT throw, Next strips RSC error messages in
    // prod, so a redirect is the only gate that behaves identically dev↔prod).
    // The redirect settles client-side a frame after `goto` resolves on `load`,
    // so we assert with web-first auto-retrying matchers, never a one-shot
    // page.url() read. Two assertions, both required (Vox gate):
    //   1. positive, navigation lands on /dashboard (the gate fired)
    //   2. negative, the Users admin page never rendered (no content leak under
    //      a redirected URL).
    await page.goto("/users");
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(
      page.getByRole("heading", { level: 1, name: /^users$/i }),
    ).toHaveCount(0);
  });
});

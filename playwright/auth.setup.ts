import { test as setup, expect } from "@playwright/test";
import { ROLES, authFile } from "./roles";

/**
 * DEC-010 — E2E auth via storageState. Sign in ONCE per role and persist the
 * session cookie so journey specs reuse it (no per-test login). Three sign-ins
 * per run stays under BetterAuth's 5/15min rate limit even when the prod-build
 * harness (E2E_PROD=1) re-arms it — so NO production rate-limit code is touched.
 *
 * Runs only in the `setup` project (added when SKIP_DB_E2E=0, needs the seeded
 * DB). Outputs live in playwright/.auth/ which is gitignored and regenerated
 * every run, so a session-schema change can never leave stale cookies committed.
 *
 * The role catalog + `authFile()` path helper live in the SIDE-EFFECT-FREE
 * `./roles` module so journey specs can import the path without re-triggering
 * these sign-in registrations (which would multiply logins past the limit).
 */
for (const { role, email, password } of ROLES) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByLabel(/email/i).fill(email);
    // exact:true so we match the input, not the "Show password" toggle button.
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await page.context().storageState({ path: authFile(role) });
  });
}

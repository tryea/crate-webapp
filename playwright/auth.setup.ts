import { test as setup, expect } from "@playwright/test";
import path from "node:path";

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
 * Demo credentials are intentionally public (see project CLAUDE.md / seed).
 */
const ROLES = [
  { role: "admin", email: "admin@crate.local", password: "ChangeMe!Admin" },
  { role: "manager", email: "manager@crate.local", password: "ChangeMe!Manager" },
  { role: "staff", email: "staff@crate.local", password: "ChangeMe!Staff" },
] as const;

export type Role = (typeof ROLES)[number]["role"];

/** Canonical storageState path for a role — imported by journey specs. */
export const authFile = (role: Role): string =>
  path.join(__dirname, ".auth", `${role}.json`);

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

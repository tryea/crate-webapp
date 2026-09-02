import { test, expect } from "@playwright/test";

/**
 * DEC-026: open-redirect (CWE-601) revert-guard.
 *
 * Asserts the sign-in `callbackUrl` can never steer the post-login navigation
 * off-origin: an attacker URL collapses to the safe fallback, while a legit
 * internal path is preserved. The unit suite (`safe-redirect.test.ts`) proves
 * the pure guard; this is the live end-to-end proof that the guard is actually
 * wired into the real sign-in flow (`router.push` + BetterAuth `callbackURL`).
 *
 * Requires a live DB + seeded users. Set SKIP_DB_E2E=0 to enable.
 */
const SKIP_REASON =
  "Requires live DB + seeded users (run db:migrate + db:seed first). Set SKIP_DB_E2E=0 to enable.";

async function signInAs(
  page: import("@playwright/test").Page,
  email: string,
  password: string,
) {
  await page.getByLabel(/email/i).fill(email);
  // exact:true so we don't also match the "Show password" toggle button.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

test.describe("auth · sign-in callbackUrl open-redirect (DEC-026)", () => {
  test.skip(process.env.SKIP_DB_E2E !== "0", SKIP_REASON);

  test("off-origin callbackUrl is neutralized to the safe fallback", async ({
    page,
  }) => {
    await page.goto("/sign-in?callbackUrl=https://example.com/phish");
    // Capture the real app origin *after* navigating (before nav, url is about:blank).
    const origin = new URL(page.url()).origin;
    await signInAs(page, "admin@crate.local", "ChangeMe!Admin");

    // Must land on the in-app fallback, never example.com.
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page).not.toHaveURL(/example\.com/);
    expect(new URL(page.url()).origin).toBe(origin);
  });

  test("legit internal callbackUrl is preserved", async ({ page }) => {
    await page.goto("/sign-in?callbackUrl=/orders");
    await signInAs(page, "admin@crate.local", "ChangeMe!Admin");
    await expect(page).toHaveURL(/\/orders$/);
  });
});

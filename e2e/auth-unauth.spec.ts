import { test, expect } from "@playwright/test";

/**
 * DEC-003 spec 1/3: unauthenticated requests to protected surfaces must
 * redirect to /sign-in with a callbackUrl that preserves the target.
 *
 * This is the cheap-but-essential guardrail. It does not require a live DB
 * because proxy.ts performs a cookie-presence check at the edge.
 */
test.describe("auth · unauthenticated redirects", () => {
  test("GET /dashboard while signed out → /sign-in with callbackUrl", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);
    expect(page.url()).toContain("callbackUrl=%2Fdashboard");
  });

  test("GET /products while signed out → /sign-in", async ({ page }) => {
    await page.goto("/products");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("GET /sign-in while signed out → stays on sign-in (no loop)", async ({
    page,
  }) => {
    const res = await page.goto("/sign-in");
    expect(res?.status()).toBeLessThan(400);
    await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
  });
});

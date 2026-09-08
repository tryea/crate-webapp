import { test, expect } from "@playwright/test";

/**
 * FR-30 (D-08): a stranger cannot create an account while tenants share one
 * dataset. Measured on a real HTTP response, at BOTH surfaces a stranger can
 * reach, because closing only one of them closes nothing:
 *
 *   - the page  GET  /sign-up
 *   - the API   POST /api/auth/sign-up/email   (independently reachable, this
 *     is what actually answered on app.crate.ersaptaaristo.dev on 8 Sep 2026)
 *
 * No DB and no login needed, so this is an always-on guard like
 * security-headers.spec.ts, not a DB-gated one.
 */
test.describe("FR-30 · sign-up is closed", () => {
  test("GET /sign-up answers 404, not a form", async ({ page }) => {
    const res = await page.goto("/sign-up");
    expect(res?.status()).toBe(404);
    // Not merely "no 200": prove the form is gone. If the route were restored,
    // the password field is the thing a stranger needs.
    await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
  });

  test("POST /api/auth/sign-up/email is refused by better-auth", async ({
    request,
  }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: {
        email: `stranger-${Date.now()}@example.invalid`,
        password: "a-perfectly-valid-password",
        name: "Stranger",
      },
    });
    expect(res.status()).toBe(400);
    // The specific code, not just "not 2xx". A DB outage or a bad payload also
    // produces a non-2xx, and that green would be the tool failing, not the
    // gate holding.
    expect(await res.json()).toMatchObject({
      code: "EMAIL_PASSWORD_SIGN_UP_DISABLED",
    });
  });

  test("the sign-in endpoint is still wired (gate is sign-up only)", async ({
    request,
  }) => {
    // Positive control on the shared `emailAndPassword` switch: flipping
    // `enabled` instead of `disableSignUp` would shut sign-up AND lock every
    // existing account out. Deliberately wrong credentials, so this needs no
    // seeded DB and burns nothing that could later look like a 429.
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email: "nobody@example.invalid", password: "wrong-on-purpose" },
    });
    expect(res.status()).not.toBe(404);
    expect(await res.text()).not.toContain("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });

  test("the sign-in screen no longer advertises account creation", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: /sign in/i })).toBeVisible();
    await expect(page.locator('a[href="/sign-up"]')).toHaveCount(0);
  });
});

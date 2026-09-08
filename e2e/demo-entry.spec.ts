import { test, expect } from "@playwright/test";
import { roleIndicator } from "./role-indicator";

/**
 * FR-31 / tiket 106: a visitor with no credential reaches the demo from the
 * sign-in screen and lands INSIDE the app.
 *
 * Needs a live DB and seeded users, and needs the server to run with
 * CRATE_DEMO_EMAIL / CRATE_DEMO_PASSWORD pointing at the seeded manager. The
 * assertions below name "Manager" because that is what the seeded demo account
 * is; a deployment that points the door at another account changes that word.
 */
const SKIP_REASON =
  "Requires live DB + seeded users + CRATE_DEMO_* on the server. Set SKIP_DB_E2E=0 to enable.";

test.describe("FR-31 · demo entry", () => {
  test.skip(process.env.SKIP_DB_E2E !== "0", SKIP_REASON);

  test("a visitor with no credential walks from sign-in into the app", async ({
    page,
  }) => {
    // Control first: this browser has no session, so the app really is shut.
    // Without it, "lands on /dashboard" would prove nothing about the door.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in/);

    await page.goto("/sign-in");
    await page.getByRole("button", { name: /explore the demo/i }).click();

    await expect(page).toHaveURL(/\/dashboard/);
    // Being on the URL is not being inside: the shell only renders the role
    // badge for a session the server accepted.
    await expect(roleIndicator(page)).toHaveText("Manager");
  });

  test("the door answers 303 to /dashboard and hands back a session cookie", async ({
    request,
  }) => {
    const res = await request.post("/api/demo", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toBe("/dashboard");
    // Assert the REASON it is a redirect: a 303 with no cookie would send the
    // visitor to /dashboard only to be bounced straight back by the proxy.
    const cookies = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === "set-cookie");
    expect(cookies.some((c) => c.value.includes("crate.session_token"))).toBe(
      true,
    );
  });

  test("the sign-in screen offers the entry, and says what it opens", async ({
    page,
  }) => {
    await page.goto("/sign-in");
    await expect(
      page.getByRole("button", { name: /explore the demo/i }),
    ).toBeVisible();
    await expect(page.getByText(/no account needed/i)).toBeVisible();
  });
});

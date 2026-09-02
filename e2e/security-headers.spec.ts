import { test, expect } from "@playwright/test";

/**
 * DEC-027 — security response headers (OWASP A05) revert-guard.
 *
 * Asserts the app-layer security headers from `next.config.ts headers()` are
 * actually emitted on a real response. The clickjacking pair (`X-Frame-Options`
 * + CSP `frame-ancestors`) is the headline control: without it an attacker can
 * iframe the authenticated dashboard and UI-redress an operator into a
 * destructive click. Runs against the public `/sign-in` route — no DB, no login
 * needed, so this is an always-on CI guard (unlike the DB-gated specs).
 *
 * HSTS is intentionally NOT asserted: it is production-gated (`NODE_ENV`), and
 * the Playwright dev server runs in development over HTTP where browsers ignore
 * it anyway. Asserting its absence here would be brittle; its presence is a
 * build-time concern covered by the gated branch in next.config.ts.
 */
test.describe("security response headers (DEC-027)", () => {
  test("clickjacking + hardening headers are emitted on a real response", async ({
    page,
  }) => {
    const response = await page.goto("/sign-in");
    expect(response, "expected a response from /sign-in").not.toBeNull();
    const headers = response!.headers();

    // Clickjacking (CWE-1021) — both the legacy and the modern control.
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");

    // MIME-sniffing guard + referrer privacy + sensor lockdown.
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toContain("camera=()");
    expect(headers["permissions-policy"]).toContain("microphone=()");
    expect(headers["permissions-policy"]).toContain("geolocation=()");
  });
});

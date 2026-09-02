import {
  CREDENTIAL_SIGN_IN_PATH,
  CREDENTIAL_RATE_LIMIT_WINDOW,
  CREDENTIAL_RATE_LIMIT_MAX,
  credentialRateLimitRules,
} from "../rate-limit";

/**
 * DEC-028 regression guard. The real behavior is proven by R-ADAPTER source
 * reading (better-auth `resolveRateLimitConfig` applies `customRules` LAST,
 * overriding the built-in 3/10s `/sign-in` special rule). These assertions lock
 * in the SECURITY INTENT so a future edit can't silently weaken or unwire it:
 *   - the rule targets the exact better-auth credential route,
 *   - the sustained cap is strictly tighter than the 3/10s default we override,
 *   - it stays above a usability floor (shared-NAT office must not lock out).
 */

// better-auth's built-in special rule for `/sign-in*` (getDefaultSpecialRules).
const DEFAULT_SPECIAL_RULE = { window: 10, max: 3 } as const;
const defaultRatePerSec = DEFAULT_SPECIAL_RULE.max / DEFAULT_SPECIAL_RULE.window;

describe("DEC-028 credential rate-limit rule", () => {
  it("targets exactly better-auth's email sign-in route", () => {
    // createAuthEndpoint("/sign-in/email", …); customRules match exact path.
    expect(CREDENTIAL_SIGN_IN_PATH).toBe("/sign-in/email");
    expect(Object.keys(credentialRateLimitRules)).toEqual([
      "/sign-in/email",
    ]);
  });

  it("wires the window/max into the customRules object", () => {
    expect(credentialRateLimitRules[CREDENTIAL_SIGN_IN_PATH]).toEqual({
      window: CREDENTIAL_RATE_LIMIT_WINDOW,
      max: CREDENTIAL_RATE_LIMIT_MAX,
    });
  });

  it("enforces a SUSTAINED cap strictly tighter than the 3/10s default it overrides", () => {
    const ourRatePerSec =
      CREDENTIAL_RATE_LIMIT_MAX / CREDENTIAL_RATE_LIMIT_WINDOW;
    // The whole point of DEC-028: beat ~1080/hr/IP. Must be < 0.3 req/s.
    expect(ourRatePerSec).toBeLessThan(defaultRatePerSec);
    // ...and use a real sustained window, not another 10s burst window.
    expect(CREDENTIAL_RATE_LIMIT_WINDOW).toBeGreaterThanOrEqual(60);
  });

  it("stays above a usability floor so a small shared-NAT team is not locked out", () => {
    // Nadia's floor: the key is (ip, path), not per-account — keep room for a
    // small office shift on one egress IP. Tunable, but never punitively low.
    expect(CREDENTIAL_RATE_LIMIT_MAX).toBeGreaterThanOrEqual(5);
  });
});

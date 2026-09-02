/**
 * DEC-028 — credential-endpoint rate limiting (OWASP A07).
 *
 * Reality (R-ADAPTER, installed better-auth source — not memory):
 * `api/rate-limiter/index.mjs` ships a built-in "special rule" that caps any
 * path starting with `/sign-in` at **3 requests / 10s** (`getDefaultSpecialRules`).
 * Because that window resets every 10s, it permits ~1080 sustained attempts/hr
 * per IP — far looser than DEC-003 R2's documented "strict prod rate limiting",
 * and the demo username `admin@crate.local` is a public, known target. The
 * top-level `rateLimit.window/max` in `server.ts` does NOT govern sign-in: the
 * special rule overwrites it (`resolveRateLimitConfig`, the special-rule branch
 * runs before and is later overridden only by `customRules`).
 *
 * Lever: a `customRules` entry is applied LAST in `resolveRateLimitConfig`, so
 * it overrides the special rule. This is the library-native way to enforce a
 * real sustained cap on the credential endpoint — no fork, no plugin.
 *
 * Threshold calibration (DEC-028 Council battle): the rate-limit key is
 * `(ip, path)` — NOT per-account — so an over-tight per-IP cap would lock out a
 * shared-NAT office (e.g. a warehouse shift logging in from one egress IP).
 * `10 / 15min` = ~40 attempts/hr/IP (27x tighter than the 1080/hr status quo)
 * while tolerating a small team behind one IP. The proper IP-agnostic control —
 * per-account lockout — is logged as a Parking-Lot follow-up, not built here.
 *
 * Path is the exact better-auth email sign-in route (`sign-in.mjs`:
 * `createAuthEndpoint("/sign-in/email", …)`); customRules match exact path.
 */
export const CREDENTIAL_SIGN_IN_PATH = "/sign-in/email";

/** 15-minute window. */
export const CREDENTIAL_RATE_LIMIT_WINDOW = 60 * 15;

/** Max sign-in attempts per window, per IP. See calibration note above. */
export const CREDENTIAL_RATE_LIMIT_MAX = 10;

/**
 * Passed verbatim to better-auth `rateLimit.customRules`. Overrides the built-in
 * `/sign-in` 3/10s special rule with the calibrated sustained cap above.
 */
export const credentialRateLimitRules = {
  [CREDENTIAL_SIGN_IN_PATH]: {
    window: CREDENTIAL_RATE_LIMIT_WINDOW,
    max: CREDENTIAL_RATE_LIMIT_MAX,
  },
} as const;

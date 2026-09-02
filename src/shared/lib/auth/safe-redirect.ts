/**
 * `safeCallbackPath`: CWE-601 open-redirect guard for the sign-in `callbackUrl`
 * (DEC-026). Returns `raw` only when it is a safe **same-site, root-relative**
 * path (e.g. `/orders?status=draft#tab`). Anything that could steer a browser
 * off-origin collapses to `fallback`.
 *
 * Why a pure string check (not `new URL(...)`): it must run identically on the
 * server leg (BetterAuth `callbackURL`) and the client leg (`router.push`) with
 * no `window`/origin dependency, and stay trivially unit-testable. The rules
 * below are sufficient because Next treats any value whose parsed `origin`
 * differs from the page origin as an *external* navigation and hard-redirects
 * via `location.assign` (verified in installed next source: app-router-utils
 * `isExternalURL` + app-router `mpaNavigation` -> `location.assign`). Forcing a
 * single leading "/" with no "//" or "/\" makes the value un-parseable as an
 * absolute or protocol-relative URL, so it can only ever resolve same-origin.
 */
function hasControlChar(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    // C0 controls (incl. NUL/CR/LF/TAB) and DEL + C1 controls.
    if (c <= 0x1f || (c >= 0x7f && c <= 0x9f)) return true;
  }
  return false;
}

export function safeCallbackPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  // Must be root-relative: a single leading slash.
  if (raw[0] !== "/") return fallback;
  // Reject "//evil.com" (protocol-relative) and "/\evil.com" (backslash, which
  // browsers normalize to "//") -- both resolve to a foreign origin.
  if (raw[1] === "/" || raw[1] === "\\") return fallback;
  // Reject embedded control chars a browser or the server leg might strip to
  // re-expose a scheme or host.
  if (hasControlChar(raw)) return fallback;
  return raw;
}

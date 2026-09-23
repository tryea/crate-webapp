/**
 * Cross-origin wiring for the public waitlist endpoint (FR-32).
 *
 * WHY THIS FILE EXISTS: the marketing page and the app are different hosts
 * (crate.ersaptaaristo.dev serves the static Astro site, this app answers on
 * app.crate.ersaptaaristo.dev). A JSON fetch from the page to this app is
 * therefore cross-origin and preflighted, and without an answer to that
 * preflight the browser never sends the POST at all. That is the whole job.
 *
 * WHAT THIS FILE IS NOT: a security control. CORS is enforced by browsers, and
 * only against other web pages. `curl` ignores it entirely, so nothing here
 * stops a direct call to the endpoint, and it was never meant to. What keeps
 * the endpoint from being useful to an abuser lives elsewhere: the strict
 * schema that refuses any body but `{ email }`, the size ceiling below, and
 * the fact that this endpoint sends nothing to anyone, ever.
 *
 * The allowlist is named rather than `*` so that a reviewer can read which
 * pages are expected to call this, and so a future origin has to be added on
 * purpose instead of inherited.
 */

/**
 * Enough for `{"email":"<254 chars>"}` with room to spare, and far too little
 * for anything anyone would bother uploading. A request over this is refused
 * before it is parsed.
 */
export const WAITLIST_MAX_BODY_BYTES = 1024;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://crate.ersaptaaristo.dev",
  "http://localhost:4321",
] as const;

/**
 * Origins allowed to read the response of a waitlist submission.
 *
 * `CRATE_WAITLIST_ORIGINS` (comma-separated) overrides the defaults so a
 * preview host can be added without a rebuild of this list. The production
 * landing and the local Astro dev server are the defaults because those are
 * the two that exist today.
 */
export function waitlistAllowedOrigins(): string[] {
  const configured = process.env.CRATE_WAITLIST_ORIGINS;
  if (!configured) return [...DEFAULT_ALLOWED_ORIGINS];

  return configured
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * CORS headers for one request.
 *
 * An origin that is not on the list gets no `Access-Control-Allow-Origin` at
 * all, which is what makes the browser withhold the response from it. `Vary:
 * Origin` is not optional: without it a shared cache can hand the headers
 * computed for one origin to a page served from another.
 */
export function corsHeadersFor(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };

  if (origin && waitlistAllowedOrigins().includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "600";
  }

  return headers;
}

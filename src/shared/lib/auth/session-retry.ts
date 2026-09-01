/**
 * DEC-024: fail-closed resilience seam for the authenticated shell's session
 * fetch.
 *
 * Why this exists (reality, not theory): `(protected)/layout.tsx` awaits the
 * session with no try/catch. BetterAuth's `getSession` returns `null` for a
 * missing/expired session (the legit-unauth case) but RE-THROWS an
 * `APIError(INTERNAL_SERVER_ERROR)` on a DB/infra failure
 * (`node_modules/better-auth/.../api/routes/session.mjs:266-270`). A transient
 * tunnel `CONNECT_TIMEOUT` (witnessed during DEC-012) therefore throws out of
 * the layout, and, because a segment's `error.tsx` wraps its children but not
 * its own layout, bubbles to the ROOT `error.tsx`, replacing the whole
 * authenticated subtree (`<Toaster>` included). A one-request blip nukes the
 * shell mid-action.
 *
 * The contract (Council DEC-024):
 *   - `null` from the fetch is a legitimate "no session" → returned immediately,
 *     NOT retried (it is not an error).
 *   - a THROW is an infra failure → retried up to `retries` times with bounded
 *     backoff; if a retry succeeds, its value is returned (the common transient
 *     blip becomes invisible).
 *   - if all attempts throw → FAIL CLOSED: log the real cause server-side
 *     (DEC-023 parity, never leaked to the client) and return `null` so the
 *     caller redirects to /sign-in. We never re-throw (which crashes the shell)
 *     and never fabricate a session (which would render authed chrome
 *     unverified).
 *
 * Retry is safe against side-effects: BetterAuth's session refresh is an
 * idempotent UPDATE of expiresAt/updatedAt, re-running just re-freshes.
 */

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = [100, 250];

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export interface SessionRetryOptions {
  /** Number of RETRIES after the first attempt (total attempts = retries + 1). */
  retries?: number;
  /** Backoff before each retry; last value reused if fewer than `retries`. */
  backoffMs?: number[];
  /** Call-site tag for the server-side diagnostic log (never returned to client). */
  context?: string;
}

/**
 * Run `fetchSession` with bounded retry and a fail-closed `null` default.
 *
 * Generic over the session shape so it is pure-unit testable with no DB / no
 * BetterAuth import, the resilience boundary is pinned here (Bima/DEC-011).
 */
export async function resolveSessionWithRetry<T>(
  fetchSession: () => Promise<T | null>,
  opts: SessionRetryOptions = {},
): Promise<T | null> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  const backoff = opts.backoffMs ?? DEFAULT_BACKOFF_MS;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // `null` (legit unauth) returns here without further retries.
      return await fetchSession();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await sleep(backoff[Math.min(attempt, backoff.length - 1)] ?? 0);
      }
    }
  }

  // Exhausted: fail closed. Preserve diagnostics (DEC-023), leak nothing.
  console.error(`[auth:session${opts.context ? `:${opts.context}` : ""}]`, lastError);
  return null;
}

/**
 * FR-35 (tiket 278): a sustained cap in front of the demo door.
 *
 * Why better-auth's own limiter cannot do this job. `rate-limit.ts` caps
 * `/sign-in/email` at 10 per 15 min through better-auth `customRules`
 * (DEC-028), but better-auth applies that cap inside `onRequestRateLimit`,
 * which is only ever called from the `onRequest` hook of better-auth's OWN
 * router (installed source, `better-auth/dist/api/index.mjs`).
 * `POST /api/demo` calls `auth.api.signInEmail` in-process, so that hook never
 * runs and the cap never bites. Unguarded, every call mints a real session row
 * in the live database, and the caller supplies no credential to earn it.
 *
 * Threshold calibration, and why it is TIGHTER than the sign-in door:
 *   - A visitor needs exactly ONE successful call. The session it mints lasts
 *     7 days (`session.expiresIn`), so even a returning visitor rarely needs a
 *     second one.
 *   - Every call that gets through WRITES. A wrong-password sign-in writes
 *     nothing, so the sign-in door can afford to be looser; this one cannot.
 *   - 5 per 15 min = 20/hr per client, against the sign-in door's 40/hr. The
 *     window deliberately matches DEC-028 so an operator has one number to
 *     reason about, and it is a real sustained window: a 10s burst window at
 *     max 3 (better-auth's built-in default for `/sign-in*`) still permits
 *     ~1080/hr, which is the exact hole DEC-028 was written to close.
 *   - Headroom of 5 covers the realistic repeats: a double submit of the
 *     pre-hydration form, a cookie-blocking browser, and a second person on
 *     one office egress IP. Shared-NAT is accepted here in a way it was not at
 *     the sign-in door: being capped costs a stranger a wait for a DEMO, while
 *     real staff sign in through the looser credential door.
 *   - E2E budget, so a future reader does not mistake a cap for a flake:
 *     `e2e/demo-entry.spec.ts` spends 2 of the 5 slots (localhost sends no
 *     forwarding header, so the whole suite shares one bucket), leaving 3 for
 *     Playwright retries.
 *
 * Deliberately NOT gated on `NODE_ENV`. better-auth gates its whole limiter to
 * production, and that is precisely the shape NEXT-GOTCHAS 7 warns about: the
 * runtime you test stops being the runtime that runs.
 */

/** 15-minute window, matching DEC-028 at the credential door. */
export const DEMO_RATE_LIMIT_WINDOW = 60 * 15;

/** Max demo sessions one client may mint per window. See calibration above. */
export const DEMO_RATE_LIMIT_MAX = 5;

/** The only header a reverse proxy in front of this app is expected to set. */
export const FORWARDED_FOR_HEADER = "x-forwarded-for";

/**
 * Bucket for a caller whose address cannot be attributed: no forwarding header
 * at all. Shared on purpose. Skipping the limit instead (what better-auth does
 * when it cannot read an IP) would mean anyone reaching the container directly
 * gets no cap, and this door writes to the live database.
 */
export const UNATTRIBUTED_CLIENT_KEY = "unattributed";

/**
 * Ceiling on tracked clients, so a public endpoint cannot grow the table
 * without bound. Sweeping expired entries is tried first; a table still full
 * after that closes the door rather than forgetting who has been through it.
 */
export const DEMO_RATE_LIMIT_MAX_CLIENTS = 10_000;

/**
 * The client identity this limiter counts against.
 *
 * The LAST hop, not the first. `X-Forwarded-For` is a list the caller can start
 * and each proxy appends to, so the first entry is whatever the caller typed,
 * and keying on it (which is what better-auth's `getIp` does) would let anyone
 * buy a fresh bucket per request by varying one header. Behind exactly one
 * reverse proxy the last entry is the one that proxy appended, and the caller
 * cannot reach past it. Measured 25 Sep 2026: `app.crate.ersaptaaristo.dev`
 * answers with `via: 1.1 Caddy` and its name resolves straight to the origin,
 * so there is one hop and no CDN in front. Putting a second proxy in front of
 * Caddy would collapse every visitor into one bucket, which is why the hop
 * count is written down here rather than assumed.
 */
export function demoClientKey(headers: Headers): string {
  const forwarded = headers.get(FORWARDED_FOR_HEADER);
  if (!forwarded) return UNATTRIBUTED_CLIENT_KEY;
  const hops = forwarded
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  if (hops.length === 0) return UNATTRIBUTED_CLIENT_KEY;
  return hops[hops.length - 1];
}

export type DemoRateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type Bucket = { windowStartedAt: number; count: number };

const buckets = new Map<string, Bucket>();

const windowMs = DEMO_RATE_LIMIT_WINDOW * 1000;

function expired(bucket: Bucket, now: number): boolean {
  return now - bucket.windowStartedAt >= windowMs;
}

/**
 * Claim one slot for `key`, or refuse and say how long the caller must wait.
 *
 * Check and count are ONE call on purpose: a split `isAllowed()` / `record()`
 * pair is the shape where a later refactor keeps the check and drops the
 * count, and a limiter that never counts reads exactly like one that works.
 *
 * Fixed window, anchored at the first request in it. A refused call does not
 * push the window out, so a flood cannot extend its own lockout indefinitely,
 * and the operator can state the rule in one sentence.
 */
export function takeDemoRateLimitSlot(
  key: string,
  now: number = Date.now(),
): DemoRateLimitVerdict {
  const bucket = buckets.get(key);

  if (bucket && !expired(bucket, now)) {
    if (bucket.count >= DEMO_RATE_LIMIT_MAX) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.windowStartedAt + windowMs - now) / 1000),
        ),
      };
    }
    bucket.count += 1;
    return { allowed: true };
  }

  if (!bucket && buckets.size >= DEMO_RATE_LIMIT_MAX_CLIENTS) {
    for (const [tracked, entry] of buckets) {
      if (expired(entry, now)) buckets.delete(tracked);
    }
    if (buckets.size >= DEMO_RATE_LIMIT_MAX_CLIENTS) {
      return { allowed: false, retryAfterSeconds: DEMO_RATE_LIMIT_WINDOW };
    }
  }

  buckets.set(key, { windowStartedAt: now, count: 1 });
  return { allowed: true };
}

/** Test seam: the counters live for the lifetime of the server process. */
export function resetDemoRateLimit(): void {
  buckets.clear();
}

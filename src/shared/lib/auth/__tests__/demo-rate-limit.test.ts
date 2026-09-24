import {
  DEMO_RATE_LIMIT_MAX,
  DEMO_RATE_LIMIT_MAX_CLIENTS,
  DEMO_RATE_LIMIT_WINDOW,
  UNATTRIBUTED_CLIENT_KEY,
  demoClientKey,
  resetDemoRateLimit,
  takeDemoRateLimitSlot,
} from "../demo-rate-limit";
import {
  CREDENTIAL_RATE_LIMIT_MAX,
  CREDENTIAL_RATE_LIMIT_WINDOW,
} from "../rate-limit";

/**
 * FR-35 / tiket 278. The handler-level behaviour lives in
 * `src/app/api/demo/__tests__/route.test.ts`; what is measured here is the
 * policy itself: the numbers, the client key, and the window arithmetic. Time
 * is passed in rather than mocked, so none of this depends on the clock the
 * runner happens to have.
 */

const T0 = Date.UTC(2026, 8, 25, 6, 0, 0);
const windowMs = DEMO_RATE_LIMIT_WINDOW * 1000;

function headers(entries: Record<string, string>) {
  return new Headers(entries);
}

function spendTheCap(key: string, now: number) {
  for (let spent = 0; spent < DEMO_RATE_LIMIT_MAX; spent++) {
    takeDemoRateLimitSlot(key, now);
  }
}

beforeEach(resetDemoRateLimit);

describe("FR-35 demo door calibration", () => {
  it("is strictly tighter than the credential door it sits beside", () => {
    // Every call through this door that succeeds WRITES a session row, with no
    // credential from the caller. A refused sign-in writes nothing, so the
    // credential door can afford to be the looser of the two, never the tighter.
    const demoPerSecond = DEMO_RATE_LIMIT_MAX / DEMO_RATE_LIMIT_WINDOW;
    const credentialPerSecond =
      CREDENTIAL_RATE_LIMIT_MAX / CREDENTIAL_RATE_LIMIT_WINDOW;
    expect(demoPerSecond).toBeLessThan(credentialPerSecond);
  });

  it("uses a sustained window, not a burst window", () => {
    // better-auth's built-in `/sign-in*` rule is 3 per 10s, which still permits
    // ~1080/hr. A short window is how a cap looks strict and counts loose.
    expect(DEMO_RATE_LIMIT_WINDOW).toBeGreaterThanOrEqual(60);
  });

  it("leaves a real visitor room to arrive twice", () => {
    // One click is the whole honest use, but a pre-hydration double submit and
    // a cookie-blocking browser are both ordinary. A cap of 1 would read as a
    // broken door rather than a busy one.
    expect(DEMO_RATE_LIMIT_MAX).toBeGreaterThanOrEqual(2);
  });
});

describe("demoClientKey", () => {
  it("takes the LAST hop, the one the caller cannot reach past", () => {
    expect(
      demoClientKey(headers({ "x-forwarded-for": "192.0.2.99, 203.0.113.7" })),
    ).toBe("203.0.113.7");
  });

  it("takes the only hop when there is one", () => {
    expect(demoClientKey(headers({ "x-forwarded-for": "203.0.113.7" }))).toBe(
      "203.0.113.7",
    );
  });

  it("trims the whitespace a proxy leaves after the comma", () => {
    // "a, b" and "a,b" must land in the SAME bucket, or alternating between the
    // two spellings would double any caller's allowance.
    expect(
      demoClientKey(headers({ "x-forwarded-for": "192.0.2.99,  203.0.113.7" })),
    ).toBe(
      demoClientKey(headers({ "x-forwarded-for": "192.0.2.99,203.0.113.7" })),
    );
  });

  it("falls back to one shared bucket when nothing forwarded an address", () => {
    // Shared, NOT skipped. better-auth drops the limit entirely when it cannot
    // read an IP; here that would mean anyone reaching the container directly
    // gets no cap at all, and this door writes to the live database.
    expect(demoClientKey(new Headers())).toBe(UNATTRIBUTED_CLIENT_KEY);
    expect(demoClientKey(headers({ "x-forwarded-for": "" }))).toBe(
      UNATTRIBUTED_CLIENT_KEY,
    );
    expect(demoClientKey(headers({ "x-forwarded-for": " , " }))).toBe(
      UNATTRIBUTED_CLIENT_KEY,
    );
  });
});

describe("takeDemoRateLimitSlot", () => {
  it("allows exactly the cap, then refuses", () => {
    for (let attempt = 1; attempt <= DEMO_RATE_LIMIT_MAX; attempt++) {
      expect([attempt, takeDemoRateLimitSlot("a", T0)]).toEqual([
        attempt,
        { allowed: true },
      ]);
    }
    expect(takeDemoRateLimitSlot("a", T0).allowed).toBe(false);
  });

  it("counts the window down as it reports it", () => {
    spendTheCap("a", T0);
    const verdict = takeDemoRateLimitSlot("a", T0 + 60_000);
    expect(verdict).toEqual({
      allowed: false,
      retryAfterSeconds: DEMO_RATE_LIMIT_WINDOW - 60,
    });
  });

  it("holds the door shut one second before the window ends", () => {
    spendTheCap("a", T0);
    expect(takeDemoRateLimitSlot("a", T0 + windowMs - 1000).allowed).toBe(
      false,
    );
  });

  it("opens again once the window has passed", () => {
    spendTheCap("a", T0);
    expect(takeDemoRateLimitSlot("a", T0 + windowMs)).toEqual({
      allowed: true,
    });
  });

  it("does not let a flood extend its own lockout", () => {
    spendTheCap("a", T0);
    // Knocking all the way through the window must not push the window out; a
    // sliding reset would turn a burst into an unbounded ban and hide it behind
    // a `retryAfterSeconds` that never reaches zero.
    for (let ms = 0; ms < windowMs; ms += 60_000) {
      expect(takeDemoRateLimitSlot("a", T0 + ms).allowed).toBe(false);
    }
    expect(takeDemoRateLimitSlot("a", T0 + windowMs).allowed).toBe(true);
  });

  it("keeps one client's spending off another's account", () => {
    spendTheCap("a", T0);
    expect(takeDemoRateLimitSlot("b", T0)).toEqual({ allowed: true });
    expect(takeDemoRateLimitSlot("a", T0).allowed).toBe(false);
  });

  it("closes the door rather than tracking clients without bound", () => {
    for (let client = 0; client < DEMO_RATE_LIMIT_MAX_CLIENTS; client++) {
      takeDemoRateLimitSlot(`client-${client}`, T0);
    }

    // A full table refuses the newcomer instead of growing: this endpoint is
    // public, so "one entry per address, forever" is a memory leak an attacker
    // picks the size of.
    expect(takeDemoRateLimitSlot("newcomer", T0)).toEqual({
      allowed: false,
      retryAfterSeconds: DEMO_RATE_LIMIT_WINDOW,
    });

    // ...and it heals: once those entries age out, the sweep makes room again,
    // so the ceiling is pressure relief and not a permanent shutdown.
    expect(takeDemoRateLimitSlot("newcomer", T0 + windowMs)).toEqual({
      allowed: true,
    });
  });
});

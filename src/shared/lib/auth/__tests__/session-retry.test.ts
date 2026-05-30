/**
 * DEC-024 — pins the fail-closed resilience seam the protected shell layout
 * delegates to.
 *
 * BetterAuth's getSession + the DB need a live stack to throw, and our Jest
 * tier is pure-unit / no-DB (Bima/DEC-011). So we do NOT fake a DB — we pin
 * the HELPER, which is the actual resilience boundary: if it holds (null
 * passthrough, retry-then-succeed, exhaust→null+log, no leak), the layout
 * holds by construction.
 *
 * Backoff is set to [0,0] so the suite stays fast without faking timers — the
 * security-relevant behavior is the control flow, not the wall-clock delay.
 */
import { resolveSessionWithRetry } from "../session-retry";

const FAST = { backoffMs: [0, 0], context: "test" };

describe("resolveSessionWithRetry (DEC-024 session-fetch resilience seam)", () => {
  let errSpy: jest.SpyInstance;

  beforeEach(() => {
    errSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    errSpy.mockRestore();
  });

  test("returns the session on first success without retrying", async () => {
    const fetchSession = jest.fn().mockResolvedValue({ user: { id: "u1" } });
    const res = await resolveSessionWithRetry(fetchSession, FAST);

    expect(res).toEqual({ user: { id: "u1" } });
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
  });

  test("passes a legit null (no session) straight through — does NOT retry it", async () => {
    // null is the unauth signal, not an error; retrying it would be wrong.
    const fetchSession = jest.fn().mockResolvedValue(null);
    const res = await resolveSessionWithRetry(fetchSession, FAST);

    expect(res).toBeNull();
    expect(fetchSession).toHaveBeenCalledTimes(1);
    expect(errSpy).not.toHaveBeenCalled();
  });

  test("retries a transient throw and returns the value once it succeeds", async () => {
    // The DEC-012 reality: a cold tunnel CONNECT_TIMEOUT throws, the next
    // attempt succeeds. The operator should never notice.
    const fetchSession = jest
      .fn()
      .mockRejectedValueOnce(new Error("CONNECT_TIMEOUT"))
      .mockResolvedValueOnce({ user: { id: "u2" } });

    const res = await resolveSessionWithRetry(fetchSession, FAST);

    expect(res).toEqual({ user: { id: "u2" } });
    expect(fetchSession).toHaveBeenCalledTimes(2);
    expect(errSpy).not.toHaveBeenCalled(); // success → nothing logged
  });

  test("fails CLOSED to null after exhausting retries, and logs the real cause", async () => {
    const cause = new Error('connect ETIMEDOUT 127.0.0.1:5436');
    const fetchSession = jest.fn().mockRejectedValue(cause);

    const res = await resolveSessionWithRetry(fetchSession, FAST);

    // Never throws (which would crash the shell), never fabricates a session.
    expect(res).toBeNull();
    // retries:2 → 3 total attempts (1 + 2).
    expect(fetchSession).toHaveBeenCalledTimes(3);
    // Diagnostics preserved (DEC-023 parity), tagged, logged server-side.
    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(errSpy).toHaveBeenCalledWith("[auth:session:test]", cause);
  });

  test("honors a custom retries count", async () => {
    const fetchSession = jest.fn().mockRejectedValue(new Error("down"));
    const res = await resolveSessionWithRetry(fetchSession, {
      ...FAST,
      retries: 0,
    });

    expect(res).toBeNull();
    expect(fetchSession).toHaveBeenCalledTimes(1); // 1 attempt, no retry
  });

  test("handles a non-Error thrown value without leaking or crashing", async () => {
    const fetchSession = jest.fn().mockRejectedValue("raw string blowup");
    const res = await resolveSessionWithRetry(fetchSession, FAST);

    expect(res).toBeNull();
    expect(errSpy).toHaveBeenCalledWith("[auth:session:test]", "raw string blowup");
  });
});

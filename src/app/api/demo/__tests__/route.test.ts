/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import {
  DEMO_EMAIL_ENV,
  DEMO_LANDING_PATH,
  DEMO_PASSWORD_ENV,
} from "@/shared/lib/auth/demo-entry";

/**
 * FR-31 / tiket 106: the demo door itself.
 *
 * `@/shared/lib/auth/server` is mocked, and ONLY that. better-auth is
 * ESM-only and this repo's jest transform does not reach into node_modules,
 * so importing the real module here fails to parse (learned on tiket 105).
 * Replacing it with a factory means the real file is never executed.
 *
 * What that mock does and does not buy: it cannot prove better-auth accepts
 * the configured credential, so it cannot prove the visitor ends up inside
 * the app. That half lives in e2e/demo-entry.spec.ts against a real database.
 * What it DOES prove is everything between the visitor and better-auth: that
 * the door is shut when unconfigured, that the credential handed over is the
 * configured one, that the session better-auth mints reaches the browser, and
 * that a refusal is not dressed up as an entry.
 */
jest.mock("@/shared/lib/auth/server", () => ({
  auth: { api: { signInEmail: jest.fn() } },
}));

import { auth } from "@/shared/lib/auth/server";
import { POST } from "../route";

const signInEmail = auth.api.signInEmail as unknown as jest.Mock;

const EMAIL = "manager@crate.local";
const PASSWORD = "not-a-real-password";
const COOKIE_A = "crate.session_token=abc; Path=/; HttpOnly; SameSite=Lax";
const COOKIE_B = "crate.session_data=xyz; Path=/; HttpOnly";

function pintu() {
  return new NextRequest("http://localhost:3010/api/demo", { method: "POST" });
}

function bukaEnv() {
  process.env[DEMO_EMAIL_ENV] = EMAIL;
  process.env[DEMO_PASSWORD_ENV] = PASSWORD;
}

describe("POST /api/demo", () => {
  const asli = { ...process.env };

  beforeEach(() => {
    signInEmail.mockReset();
    delete process.env[DEMO_EMAIL_ENV];
    delete process.env[DEMO_PASSWORD_ENV];
  });

  afterAll(() => {
    process.env = asli;
  });

  it("answers 404 and never attempts a sign-in when the demo is unconfigured", async () => {
    const res = await POST(pintu());
    expect(res.status).toBe(404);
    // The stronger half of fail-closed: an unconfigured deployment must not
    // hand a half-built credential to the auth layer at all.
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("signs the visitor in with the configured credential and hands the session to the browser", async () => {
    bukaEnv();
    const dariAuth = new Response(null, { status: 200 });
    dariAuth.headers.append("set-cookie", COOKIE_A);
    dariAuth.headers.append("set-cookie", COOKIE_B);
    signInEmail.mockResolvedValue(dariAuth);

    const res = await POST(pintu());

    // The credential is the CONFIGURED one, not something read off the request.
    // A door that signed in as anyone would pass a bare status assertion.
    expect(signInEmail).toHaveBeenCalledTimes(1);
    expect(signInEmail.mock.calls[0][0]).toMatchObject({
      body: { email: EMAIL, password: PASSWORD },
      asResponse: true,
    });

    expect(res.status).toBe(303);
    // Exactly this string: an absolute URL built from req.url would hand the
    // visitor the origin the container sees, not the one they typed
    // (NEXT-GOTCHAS 9). Asserting the literal is what makes that regression red.
    // The literal, NOT `DEMO_LANDING_PATH`: an anchor that borrows the same
    // constant the handler reads would stay green if the landing path were
    // repointed at the sign-in screen, which is the door failing silently.
    expect(res.headers.get("location")).toBe("/dashboard");
    expect(DEMO_LANDING_PATH).toBe("/dashboard");
    // Every cookie, not just the first. Dropping one leaves the visitor with a
    // redirect to a page the proxy bounces them straight back out of.
    expect(res.headers.getSetCookie()).toEqual([COOKIE_A, COOKIE_B]);
  });

  it("sends the visitor back to sign-in, without a session, when the credential is refused", async () => {
    bukaEnv();
    const ditolak = new Response(JSON.stringify({ code: "INVALID" }), {
      status: 401,
    });
    ditolak.headers.append("set-cookie", COOKIE_A);
    signInEmail.mockResolvedValue(ditolak);

    const res = await POST(pintu());

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sign-in?demo=unavailable");
    // A rotated demo password must not leave a cookie behind: forwarding the
    // headers of a REFUSAL is how a "signed in" state gets faked.
    expect(res.headers.getSetCookie()).toEqual([]);
  });

  it("sends the visitor back to sign-in when the auth layer throws", async () => {
    bukaEnv();
    signInEmail.mockRejectedValue(new Error("connection refused"));

    const res = await POST(pintu());

    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/sign-in?demo=unavailable");
  });
});

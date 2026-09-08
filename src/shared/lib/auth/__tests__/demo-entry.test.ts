import {
  DEMO_EMAIL_ENV,
  DEMO_PASSWORD_ENV,
  demoCredential,
  demoEntryEnabled,
} from "../demo-entry";

/**
 * FR-31 policy tests: WHEN the demo door exists, and WHAT it hands to
 * better-auth when it does.
 *
 * These do not import `../server`: better-auth ships ESM-only and this repo's
 * jest transform does not reach into node_modules, so the import fails to
 * parse. The BEHAVIOUR of the door (a visitor with no credential ending up
 * inside the app) is therefore proven where a visitor actually stands, over
 * HTTP against a real session, in e2e/demo-entry.spec.ts. What is proven here
 * is the decision that governs it, at both settings.
 */
describe("FR-31 demo entry policy", () => {
  it("is closed when nothing is configured (fail-closed default)", () => {
    expect(demoEntryEnabled({})).toBe(false);
    expect(demoCredential({})).toBeNull();
  });

  it("is closed with only an email", () => {
    expect(demoEntryEnabled({ [DEMO_EMAIL_ENV]: "demo@crate.local" })).toBe(
      false,
    );
  });

  it("is closed with only a password", () => {
    expect(
      demoEntryEnabled({ [DEMO_PASSWORD_ENV]: "not-a-real-password" }),
    ).toBe(false);
  });

  it("is closed when the email is blank or whitespace", () => {
    for (const email of ["", "   ", "\t"]) {
      expect(
        demoEntryEnabled({
          [DEMO_EMAIL_ENV]: email,
          [DEMO_PASSWORD_ENV]: "not-a-real-password",
        }),
      ).toBe(false);
    }
  });

  /**
   * Positive control. Without this the four cases above stay green even if
   * `demoEntryEnabled` were hard-wired to `false`, i.e. even with the entry
   * deleted. It also spells out the pair the route hands to better-auth: a
   * policy that opened the door while returning the wrong credential would
   * pass a plain boolean assertion.
   */
  it("opens, and yields exactly the configured pair, when both are set", () => {
    const env = {
      [DEMO_EMAIL_ENV]: "  demo@crate.local  ",
      [DEMO_PASSWORD_ENV]: "not-a-real-password",
    };
    expect(demoEntryEnabled(env)).toBe(true);
    expect(demoCredential(env)).toEqual({
      // trimmed: a trailing newline from a `.env` file must not become part of
      // the address better-auth looks up.
      email: "demo@crate.local",
      password: "not-a-real-password",
    });
  });
});

import { SEED_SIGN_UP_ENV, signUpDisabled } from "../sign-up-gate";

/**
 * FR-30 (D-08) revert-guard for the sign-up policy itself.
 *
 * Scope note, deliberate: better-auth ships ESM-only and this repo's jest
 * transform does not reach into node_modules, so importing `../server` here
 * fails to parse. Rather than widen `transformIgnorePatterns` for 303 unrelated
 * tests, the BEHAVIOUR of the closed door is proven where a stranger actually
 * stands, over HTTP, in e2e/signup-closed.spec.ts. This file proves the policy
 * those options are built from.
 *
 * Both locks are exercised at BOTH settings. That is only possible because
 * `signUpDisabled` takes the environment as a parameter: a gate that read the
 * ambient environment at module load could only ever be observed in the single
 * environment jest happens to run in, which is the shape that lets a dead gate
 * look alive.
 */
describe("FR-30 · sign-up gate", () => {
  describe("policy: two locks of different kinds", () => {
    it("is closed when nothing is configured (fail-closed default)", () => {
      expect(signUpDisabled({} as NodeJS.ProcessEnv)).toBe(true);
    });

    it("stays closed in production even with the seed opt-in set", () => {
      // Lock 2 is the one that is not settable by whoever writes a deployment's
      // env file: this is the case that keeps app.crate.ersaptaaristo.dev shut
      // if CRATE_SEED_SIGN_UP ever leaks into the live environment.
      expect(
        signUpDisabled({
          NODE_ENV: "production",
          [SEED_SIGN_UP_ENV]: "1",
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    });

    it("stays closed outside production without the opt-in", () => {
      expect(
        signUpDisabled({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
      ).toBe(true);
    });

    it("opens ONLY for the seed: non-production plus an exact opt-in", () => {
      // Positive control. Without this case a gate hard-wired to `true` would
      // pass every assertion above while telling us nothing, and `bun run
      // db:seed` (the one legitimate account creator, DEC-003 R1) would be
      // silently dead.
      expect(
        signUpDisabled({
          NODE_ENV: "development",
          [SEED_SIGN_UP_ENV]: "1",
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    });

    it('treats any value other than the exact string "1" as closed', () => {
      for (const value of ["0", "true", "yes", "", " 1"]) {
        expect(
          signUpDisabled({
            NODE_ENV: "development",
            [SEED_SIGN_UP_ENV]: value,
          } as NodeJS.ProcessEnv),
        ).toBe(true);
      }
    });
  });
});

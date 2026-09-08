/**
 * FR-31 (D-08): a visitor can walk into the demo straight from the sign-in
 * screen, without a credential they first have to ask someone for.
 *
 * Why the credential lives in the environment and nowhere else: the demo user
 * is a real account in the live database. Its password was rotated on
 * 8 Sep 2026 precisely because it had been printed in a public README, so a
 * value committed here would recreate that leak through a different door. The
 * deployment configures it; the repo never sees it.
 *
 * Fail-closed by construction: with either variable missing there is no demo
 * entry at all. The button is not rendered and `POST /api/demo` answers 404. A
 * deployment that forgets to configure the demo therefore shows a plain
 * sign-in screen, not a button that dies under the visitor's finger.
 */
export const DEMO_EMAIL_ENV = "CRATE_DEMO_EMAIL";
export const DEMO_PASSWORD_ENV = "CRATE_DEMO_PASSWORD";

/** Where the visitor lands once the demo session exists. */
export const DEMO_LANDING_PATH = "/dashboard";

/** Query flag the door sets when sign-in fails, read by the sign-in form. */
export const DEMO_FAILED_PARAM = "demo";
export const DEMO_FAILED_VALUE = "unavailable";

/**
 * A plain string map, not `NodeJS.ProcessEnv`: Next's ambient types mark
 * `NODE_ENV` as required there, so the CLOSED state (`{}`) would not even
 * typecheck, and that is precisely the state most worth measuring.
 */
export type PetaEnv = Record<string, string | undefined>;

export type DemoCredential = { email: string; password: string };

/**
 * `env` is a parameter rather than a direct `process.env` read so both the
 * closed and the open state can be measured. A policy that reads the ambient
 * environment at module load can only ever be tested in the one environment
 * jest happens to run in, and that is exactly the shape that lets a dead gate
 * look alive.
 */
export function demoCredential(
  env: PetaEnv = process.env,
): DemoCredential | null {
  const email = env[DEMO_EMAIL_ENV]?.trim();
  const password = env[DEMO_PASSWORD_ENV];
  if (!email || !password) return null;
  return { email, password };
}

export function demoEntryEnabled(
  env: PetaEnv = process.env,
): boolean {
  return demoCredential(env) !== null;
}

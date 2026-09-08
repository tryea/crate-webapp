/**
 * FR-30 (D-08) temporary fence: self-service sign-up is CLOSED until FR-29
 * separates tenants.
 *
 * Why it has to be closed: today every account lands in the SAME dataset as the
 * live demo. A stranger who signs up does not get an empty workspace, they get
 * a seat at the client's table. The route was live on
 * app.crate.ersaptaaristo.dev, measured 8 Sep 2026.
 *
 * Two locks, deliberately of different kinds:
 *
 *   1. `CRATE_SEED_SIGN_UP` must be exactly "1". Absent = closed, so forgetting
 *      to configure anything keeps the door shut (fail-closed default).
 *   2. `NODE_ENV` must not be "production". This one is NOT settable by whoever
 *      writes the env file of a deployment: even if lock 1 leaks into the live
 *      environment, the live app still refuses.
 *
 * The only legitimate caller is `bun run db:seed`, which creates the three demo
 * accounts through BetterAuth's own sign-up API (DEC-003 R1) so the password
 * hash is produced by the code that later verifies it. That script already
 * refuses to run with NODE_ENV=production, so lock 2 costs it nothing.
 *
 * FR-29 hand-off: delete this module, drop `disableSignUp` from the auth
 * options, and restore src/app/sign-up/page.tsx to render <SignUpForm />.
 */
export const SEED_SIGN_UP_ENV = "CRATE_SEED_SIGN_UP";

/**
 * `env` is a parameter rather than a direct `process.env` read so both locks can
 * be measured at both settings. A gate that reads the ambient environment at
 * module load can only ever be tested in the one environment jest happens to
 * run in, which is exactly the shape that lets a dead gate look alive.
 */
export function signUpDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === "production") return true;
  return env[SEED_SIGN_UP_ENV] !== "1";
}

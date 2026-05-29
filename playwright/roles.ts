import path from "node:path";

/**
 * DEC-010 — role catalog + storageState path helper, kept in a SIDE-EFFECT-FREE
 * module on purpose. `auth.setup.ts` declares the per-role sign-in *tests*
 * (calls `setup(...)` in a loop); journey specs only need the cookie-file path.
 * If specs imported `authFile` from `auth.setup.ts`, Playwright would re-run
 * those `setup()` registrations while collecting each journey file — silently
 * adding 3 extra sign-ins per spec and blowing past BetterAuth's 5/15min rate
 * limit (the exact failure DEC-010 exists to avoid). Importing THIS module
 * registers nothing.
 *
 * Demo credentials are intentionally public (see project CLAUDE.md / seed).
 */
export const ROLES = [
  { role: "admin", email: "admin@crate.local", password: "ChangeMe!Admin" },
  { role: "manager", email: "manager@crate.local", password: "ChangeMe!Manager" },
  { role: "staff", email: "staff@crate.local", password: "ChangeMe!Staff" },
] as const;

export type Role = (typeof ROLES)[number]["role"];

/** Canonical storageState path for a role — `playwright/.auth/<role>.json` (gitignored). */
export const authFile = (role: Role): string =>
  path.join(__dirname, ".auth", `${role}.json`);

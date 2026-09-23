import { pgTable, text } from "drizzle-orm/pg-core";

import { createdAtOnly, id } from "./_shared";

/**
 * Waitlist signups collected from the public marketing page (FR-32).
 *
 * Two columns and nothing else on purpose: the address a stranger left and
 * the moment it arrived. No name, no source, no consent flags, because the
 * page asks for none of them and storing a field we never collected would be
 * a lie in the schema.
 *
 * `email` carries the UNIQUE constraint that makes a second submission of the
 * same address a no-op instead of a second row. The constraint is the real
 * guarantee; the normalisation in `waitlistSignupSchema` (trim + lowercase) is
 * what makes it case-insensitive in practice. Postgres text comparison is
 * case-SENSITIVE, so without that normalisation `A@b.com` and `a@b.com` would
 * be two distinct values and both would be accepted.
 */
export const waitlistSignup = pgTable("waitlist_signup", {
  id: id(),
  email: text("email").notNull().unique(),
  ...createdAtOnly(),
});

export type WaitlistSignupRow = typeof waitlistSignup.$inferSelect;
export type NewWaitlistSignupRow = typeof waitlistSignup.$inferInsert;

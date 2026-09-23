import "server-only";

import { asc } from "drizzle-orm";

import { db } from "@/db/client";
import { waitlistSignup } from "@/db/schema";

import type { WaitlistSignupValues } from "../model/waitlist-schema";

/**
 * What a caller outside this entity is allowed to see of a signup. Explicit
 * DTO, never the Drizzle row: the row carries a surrogate `id` that nothing
 * outside the table has any use for.
 */
export type WaitlistSignup = {
  email: string;
  createdAt: string;
};

/**
 * Record one address on the waitlist.
 *
 * The second submission of an address is NOT an error and NOT an update: it is
 * a no-op, enforced by the UNIQUE constraint on `waitlist_signup.email` plus
 * `onConflictDoNothing`. Doing the check in SQL rather than reading first and
 * inserting second is deliberate, a read-then-write pair loses the race
 * between two concurrent submissions of the same address and leaves two rows.
 *
 * The first arrival time is what survives: a returning address must not have
 * its `created_at` pushed forward, because then "when did this person sign up"
 * would answer with the last time they clicked rather than the first.
 *
 * `input` must already have been through `waitlistSignupSchema`, which is what
 * canonicalises the address. Passing a raw string here would defeat the
 * case-insensitivity of the constraint.
 */
export async function addToWaitlist(
  input: WaitlistSignupValues,
): Promise<void> {
  await db
    .insert(waitlistSignup)
    .values({ email: input.email })
    .onConflictDoNothing({ target: waitlistSignup.email });
}

/**
 * Read the waitlist back, oldest first.
 *
 * This is the machine-readable half of "a person can read the list back". The
 * human half needs no code and no screen, the table is `waitlist_signup` and an
 * operator reads it with either of:
 *
 *   bun run db:studio
 *   psql "$DATABASE_URL_DIRECT" -c \
 *     'select email, created_at from waitlist_signup order by created_at'
 *
 * No pagination on purpose: a list that outgrows one response is a problem the
 * page does not have yet, and inventing an admin surface for it is explicitly
 * out of scope for FR-32.
 */
export async function listWaitlistSignups(): Promise<WaitlistSignup[]> {
  const rows = await db
    .select({
      email: waitlistSignup.email,
      createdAt: waitlistSignup.createdAt,
    })
    .from(waitlistSignup)
    .orderBy(asc(waitlistSignup.createdAt));

  return rows.map((row) => ({
    email: row.email,
    createdAt: row.createdAt.toISOString(),
  }));
}

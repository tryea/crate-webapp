import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { resolveReadIdentity, withReadContext } from "./read-context";

/**
 * FR-29 (ticket 997, "CPP-TENANT-4"): which company the person making this
 * request belongs to.
 *
 * WHERE THIS SITS. `require-role.ts` answers "what may they do", this answers
 * "whose rows are they doing it to". Ticket 989 bound every read to a user
 * identity; 996 gave every domain row a `company_id`. Neither could connect
 * the two, because a user had no company to be read from. `company_members`
 * (src/db/schema/companies.ts, migration 0006) is that missing edge and this
 * is the only thing that reads it.
 *
 * THE REFUSAL IS THE FEATURE. There is a company id sitting in the schema that
 * would make every caller here succeed: `SINGLE_COMPANY_ID`, the default on
 * the `company_id` column. Handing it back for a user with no membership would
 * make this function total and would make tenant separation a lie, because the
 * one account that should have been stopped would be reading and writing the
 * first company's rows. A caller that cannot name a company must fail, and the
 * failure has to be loud enough to reach a log rather than a silently wrong
 * row. This module therefore has no fallback of any kind, deliberately, and
 * `src/shared/lib/auth/__tests__/company-context.test.ts` fails if one appears.
 */
export type NoCompanyReason = "no-session" | "no-membership";

export class NoCompanyError extends Error {
  /**
   * Which of the two ways this failed. Callers do not exist yet, and when they
   * do they will want different answers: no session is a sign-in redirect, no
   * membership is a refusal to an account that is signed in. Discriminating on
   * a field keeps that open without inventing two classes for one contract:
   * this request cannot name a company, so it must not touch company data.
   */
  readonly reason: NoCompanyReason;

  constructor(reason: NoCompanyReason, detail: string) {
    super(`Refused to resolve a company (${reason}): ${detail}`);
    this.name = "NoCompanyError";
    this.reason = reason;
  }
}

/**
 * WHY RAW SQL AND NOT THE DRIZZLE TABLE. The FSD boundary rule
 * (eslint.config.mjs) allows `shared` to import `shared` and nothing else, so
 * `@/db/schema` is out of reach from this layer, and this layer is where the
 * helper has to live: `shared` is the only layer every other layer may import,
 * and the write binding in `session-binding.ts` is a `shared` module that will
 * need this next. The names below are therefore strings rather than columns.
 *
 * What keeps them honest is not the type system, it is the suite: the tests
 * drive this module against a database built by replaying the real migration
 * files, so renaming the table or the column without changing this line turns
 * the suite red rather than production.
 */
const SELECT_COMPANY_FOR_USER = (userId: string) => sql`
  SELECT company_id FROM company_members WHERE user_id = ${userId} LIMIT 2
`;

/**
 * postgres.js hands back an array, PGlite hands back `{ rows }`. Both drivers
 * are real (the app runs on the first, the suites on the second), so read
 * whichever shape arrived rather than assuming one. Same normalisation as
 * `src/shared/lib/auth/__tests__/read-context.test.ts`.
 */
function rowsOf<T>(result: unknown): T[] {
  return (
    Array.isArray(result) ? result : ((result as { rows: T[] }).rows ?? [])
  ) as T[];
}

/**
 * The company id of the acting user, or a throw.
 *
 * `cache()` is React's per-request memo, the same one `resolveReadIdentity`
 * uses: a page that resolves the company for five reads pays for one query.
 * Outside a render it degrades to a plain call, which is what makes it safe to
 * drive from a test.
 *
 * Usage, once a caller exists:
 *
 *   const companyId = await resolveCompanyId();
 *   await withUserContext(user.id, user.role, (tx) =>
 *     tx.insert(products).values({ companyId, sku, name }),
 *   );
 *
 * @throws NoCompanyError when there is no session, or the session's user
 * belongs to no company. Never returns a default.
 */
export const resolveCompanyId = cache(async (): Promise<string> => {
  const identity = await resolveReadIdentity();
  if (!identity) {
    throw new NoCompanyError(
      "no-session",
      "this request carries no session, so there is no acting user to look up",
    );
  }

  // Through withReadContext like every other read in the app: the lookup runs
  // inside a transaction carrying `app.current_user_id`, so a future policy on
  // company_members ("a person may read their own membership") has an identity
  // to judge. LIMIT 2 rather than LIMIT 1 so a second membership is something
  // this function can SEE. The unique index on user_id is what stops it
  // existing; reading two would mean that index is gone, and a helper that
  // asked for one row would never notice.
  const rows = rowsOf<{ company_id: string }>(
    await withReadContext(
      (tx) => tx.execute(SELECT_COMPANY_FOR_USER(identity.userId)),
      "resolveCompanyId",
    ),
  );

  if (rows.length === 0) {
    throw new NoCompanyError(
      "no-membership",
      `user ${identity.userId} belongs to no company, so no company owns what this request would touch`,
    );
  }
  if (rows.length > 1) {
    throw new NoCompanyError(
      "no-membership",
      `user ${identity.userId} belongs to ${rows.length} companies and the session does not say which, ` +
        "so company_members_user_id_idx is missing from this database",
    );
  }

  return rows[0].company_id;
});

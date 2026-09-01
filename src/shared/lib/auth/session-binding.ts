import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { Role } from "./require-role";

/**
 * Transaction handle as seen by `db.transaction()` callbacks. Exported so
 * action-level helpers (e.g. level-lock) can type their `tx` parameter
 * against the same shape the binding provides.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Issue #2: per-request RLS user-context binding (the final layer of the
 * defense-in-depth chain: proxy → layout → requireRole → tx → SQL).
 *
 * Wraps `db.transaction()` and binds `app.current_user_id` +
 * `app.current_user_role` as TRANSACTION-LOCAL GUCs (`set_config(..., true)`)
 * before invoking `fn`. Transaction-local matters: the GUC resets on
 * commit/rollback, so pooled connections never leak one request's identity
 * into the next.
 *
 * Policy contract (src/db/rls/0003_user_aware_policies.sql):
 *   - UNBOUND queries (no GUC set) keep working, BetterAuth's own
 *     sign-in/session reads run on this same `app_user` connection without
 *     a context and must not break.
 *   - BOUND queries are restricted: identity-table SELECTs return only the
 *     bound user's rows (admins see all); identity-table WRITES are denied
 *     outright, a bound staff/manager transaction cannot escalate
 *     `user.role` even via SQL injection.
 *
 * Usage in a Server Action (after requireRole):
 *
 *   const { user } = await requireRole("staff");
 *   const row = await withUserContext(user.id, user.role, async (tx) => {
 *     // every read/write here carries the user context
 *   });
 */
export async function withUserContext<T>(
  userId: string,
  role: Role,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${userId}, true)`,
    );
    await tx.execute(
      sql`SELECT set_config('app.current_user_role', ${role}, true)`,
    );
    return fn(tx);
  });
}

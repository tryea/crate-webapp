import "server-only";
import { cache } from "react";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getServerSession, type Role } from "./require-role";
import type { Tx } from "./session-binding";

/**
 * FR-29 prerequisite (ticket 989, "CPP-TENANT-2"): the read half of the
 * session binding that `withUserContext` already gives every write.
 *
 * WHY THIS MODULE EXISTS AT ALL. The FR-29 survey
 * (`src/db/rls/TENANT-SEPARATION.md` §3) measured that all 32 bindings in the
 * app sit in an entity's `api/actions.ts`, so a tenant policy written in the
 * convention this repo already uses would hold on writes and be ignored on
 * every screen. The read path had no identity to be judged by. Binding it is
 * therefore a prerequisite for tenant separation, not a follow-up to it.
 *
 * TWO THINGS HAPPEN HERE, AND THE SECOND IS THE POINT:
 *
 *   1. The read runs inside a transaction that carries `app.current_user_id`
 *      and `app.current_user_role`, the same transaction-local GUCs
 *      `withUserContext` sets, so a future tenant policy can judge a read the
 *      same way it judges a write.
 *   2. A read issued with NO identity is REFUSED. It throws `UnboundReadError`
 *      instead of quietly returning every row in the table.
 *
 * WHY THE REFUSAL LIVES HERE AND NOT IN A POLICY. A row-level-security policy
 * that denies an unbound read does not refuse it, it returns zero rows, and a
 * screen that renders an empty table looks identical to a screen whose table
 * is genuinely empty. An exception cannot be mistaken for "no data". The
 * database identity is still set, so the policy layer keeps its options open.
 *
 * WHAT IS DELIBERATELY NOT CHANGED. Better Auth reads `user` and `session` on
 * this same `app_user` connection before any identity exists
 * (`src/db/rls/0003_user_aware_policies.sql:6-9`), so the unbound-read
 * allowance stays correct for the auth tables at the SQL layer. This module
 * constrains the app's own reads, which is a different surface.
 */
export class UnboundReadError extends Error {
  constructor(context = "read") {
    super(
      `Refused an unbound ${context}: no database identity for this request. ` +
        `Reads must run inside withReadContext() so a tenant policy can judge them.`,
    );
    this.name = "UnboundReadError";
  }
}

/**
 * Identity for the current request, or null when there is no session.
 *
 * `cache()` is React's per-request memo, so a page that issues five reads
 * resolves the session once rather than five times. Outside a render (a test,
 * a script) it degrades to a plain call rather than throwing, which is what
 * makes this safe to import from a Jest suite.
 */
export const resolveReadIdentity = cache(
  async (): Promise<{ userId: string; role: Role } | null> => {
    const session = await getServerSession();
    if (!session) return null;
    const role = ((session.user as { role?: Role }).role ?? "staff") as Role;
    return { userId: session.user.id, role };
  },
);

/**
 * Run `fn` inside a transaction bound to the current user, or refuse.
 *
 * Usage in a read helper (the counterpart to `withUserContext` in an action):
 *
 *   export async function listProductsServer(): Promise<Product[]> {
 *     return withReadContext((tx) =>
 *       tx.select().from(products).orderBy(asc(products.name)),
 *     );
 *   }
 */
export async function withReadContext<T>(
  fn: (tx: Tx) => Promise<T>,
  context = "read",
): Promise<T> {
  const identity = await resolveReadIdentity();
  if (!identity) throw new UnboundReadError(context);

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_user_id', ${identity.userId}, true)`,
    );
    await tx.execute(
      sql`SELECT set_config('app.current_user_role', ${identity.role}, true)`,
    );
    return fn(tx);
  });
}

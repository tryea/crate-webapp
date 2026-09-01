import { and, eq, sql } from "drizzle-orm";
import { stockMovements } from "@/db/schema";
import type { DB } from "@/db/client";

/**
 * Transaction handle, derived from the drizzle client's own `transaction()`
 * callback param. `import type` keeps this a TYPE-ONLY reference, the runtime
 * `db` (and its postgres.js connection) is never pulled in here, so a plain
 * integration script (no Next runtime) can import `getLevelLocked` and drive it
 * with its own connection. See the DEC-015 concurrency proof.
 */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Read current level inside a transaction, serialized against concurrent
 * decrements so two stock-outs cannot both read the same level and race past
 * zero, COUNCIL §4.3 concurrent-update handling (DEC-013).
 *
 * We CANNOT use `SELECT … FOR UPDATE` here: Postgres rejects row locks on an
 * aggregate ("FOR UPDATE is not allowed with aggregate functions"), and even a
 * row-lock over the raw movement rows would only lock rows that already exist,
 * it cannot lock the not-yet-inserted phantom row a concurrent decrement is
 * about to append. Instead we take a transaction-scoped ADVISORY lock on the
 * logical (product, location) key: it serializes all mutations for that key
 * regardless of row existence and auto-releases on commit/rollback. The level
 * stays a pure SUM over the append-only ledger (no denormalized balance row).
 *
 * Extracted out of the `"use server"` actions file (DEC-015) so the
 * parallel-decrement concurrency test can import and exercise the REAL gate
 * rather than a drifting copy, a `"use server"` module exports only RPC
 * endpoints (async, serializable args), so a `tx`-taking helper can't live
 * there as an importable symbol.
 */
export async function getLevelLocked(
  tx: Tx,
  productId: string,
  locationId: string,
): Promise<number> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${productId}), hashtext(${locationId}))`,
  );
  const [row] = await tx
    .select({
      total: sql<number>`COALESCE(SUM(${stockMovements.quantity}), 0)::int`,
    })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.productId, productId),
        eq(stockMovements.locationId, locationId),
      ),
    );
  return row?.total ?? 0;
}

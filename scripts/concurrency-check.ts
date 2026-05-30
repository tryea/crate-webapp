/**
 * DEC-015 — Parallel-decrement concurrency proof for the DEC-013 advisory lock.
 *
 * Standalone bun script (NOT Jest, NOT Playwright). Run via:
 *   bun run check:concurrency
 *
 * It drives the REAL `getLevelLocked` (imported from the extracted plain
 * module — DEC-015) against the live `crate_dev` DB over the SSH tunnel, and
 * compares it to a test-only `getLevelNaive` (the same SUM read MINUS the
 * advisory-lock line). The differential is the proof the lock is load-bearing:
 *
 *   Scenario A (REAL locked gate)  → 1 winner, 1 rejection, final level 0
 *   Scenario B (NAIVE gate)        → 2 winners, 0 rejections, final level -5
 *
 * Determinism comes from a rendezvous-with-timeout BARRIER: both
 * `db.transaction()`s open, both park just before the level read, then both
 * read concurrently — forcing a genuine overlap in the read-then-write window
 * (Vox's Red-Team risk: "two transactions that accidentally serialize prove
 * nothing"). The barrier lives ONLY in this test; no `pg_sleep` ever touches
 * the production critical section.
 *
 * Mutates `crate_dev` additively (a unique `E2E-CONC-*` product + a few
 * movement rows, exactly like the Playwright journeys leave `E2E-*` data),
 * with best-effort FK-ordered cleanup in each scenario. Never touches prod.
 */
import assert from "node:assert/strict";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { locations, products, stockMovements } from "@/db/schema";
import { checkDecrementAllowed } from "@/entities/stock-movement/domain/stock-math";
// The REAL production gate — same symbol actions.ts imports (DEC-015 extraction).
import { getLevelLocked, type Tx } from "@/entities/stock-movement/api/level-lock";

type Gate = (tx: Tx, productId: string, locationId: string) => Promise<number>;

/**
 * Counterfactual gate: byte-for-byte `getLevelLocked` MINUS the single
 * `pg_advisory_xact_lock` line. Defined HERE (test-only) so we can prove what
 * the lock buys us without shipping an unlocked read to production.
 */
const getLevelNaive: Gate = async (tx, productId, locationId) => {
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
};

/**
 * Rendezvous-with-timeout barrier (count-to-`parties`). `arrive()` blocks each
 * caller until either everyone has arrived OR `timeoutMs` elapses since the
 * first arrival — the timeout breaks the deadlock when one party legitimately
 * can't reach the barrier (e.g. it's blocked in the DB behind another party's
 * advisory lock). Latches open after first release, so latecomers pass through.
 */
function makeBarrier(parties: number, timeoutMs: number) {
  let count = 0;
  let released = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let open!: () => void;
  const gate = new Promise<void>((resolve) => {
    open = resolve;
  });

  const release = () => {
    if (released) return;
    released = true;
    if (timer) clearTimeout(timer);
    open();
  };

  return async function arrive(): Promise<void> {
    if (released) return; // latecomer — pass immediately
    count += 1;
    if (count >= parties) release();
    else if (!timer) timer = setTimeout(release, timeoutMs);
    await gate;
  };
}

/**
 * One concurrent stock-out attempt. Mirrors the production stockOutAction
 * decrement path: open a tx, read the level THROUGH the gate, run the real
 * `checkDecrementAllowed`, and only insert the negative movement if allowed.
 * Returns "won" if it committed a sale, "blocked" if the gate refused it.
 */
async function attemptStockOut(
  gate: Gate,
  productId: string,
  locationId: string,
  qty: number,
  arrive: () => Promise<void>,
): Promise<"won" | "blocked"> {
  return db.transaction(async (tx) => {
    // Both transactions are now OPEN (connection checked out). Park here so
    // neither reads the level until both are ready — guarantees real overlap.
    await arrive();

    const level = await gate(tx, productId, locationId);
    const decision = checkDecrementAllowed({
      currentLevel: level,
      decrementBy: qty,
      allowBackorder: false, // the proof is specifically the no-backorder guard
    });
    if (!decision.ok) return "blocked";

    await tx.insert(stockMovements).values({
      productId,
      locationId,
      type: "stock_out",
      reason: "sale",
      quantity: -qty, // server flips sign, same as the real action
    });
    return "won";
  });
}

async function levelOf(productId: string, locationId: string): Promise<number> {
  const [row] = await db
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

interface ScenarioResult {
  winners: number;
  blocked: number;
  finalLevel: number;
  sku: string;
}

/**
 * Seed a dedicated product at start-level +5, fire two simultaneous -5
 * stock-outs through `gate`, then read the final level. Best-effort cleanup.
 */
async function runScenario(
  label: string,
  gate: Gate,
  locationId: string,
): Promise<ScenarioResult> {
  const sku = `E2E-CONC-${label}-${Date.now()}`;
  const [product] = await db
    .insert(products)
    .values({ sku, name: `Concurrency Proof (${label})` })
    .returning();

  // Deterministic start level: a single +5 stock-in at the location.
  await db.insert(stockMovements).values({
    productId: product.id,
    locationId,
    type: "stock_in",
    reason: "purchase",
    quantity: 5,
  });

  const barrier = makeBarrier(2, 1500);
  const results = await Promise.all([
    attemptStockOut(gate, product.id, locationId, 5, barrier),
    attemptStockOut(gate, product.id, locationId, 5, barrier),
  ]);

  const winners = results.filter((r) => r === "won").length;
  const blocked = results.filter((r) => r === "blocked").length;
  const finalLevel = await levelOf(product.id, locationId);

  // Best-effort cleanup (FK order: movements → product). Non-fatal so a
  // cleanup hiccup can never fail the assertion.
  try {
    await db
      .delete(stockMovements)
      .where(eq(stockMovements.productId, product.id));
    await db.delete(products).where(eq(products.id, product.id));
  } catch (err) {
    console.warn(`[cleanup] ${label}: ${(err as Error).message}`);
  }

  return { winners, blocked, finalLevel, sku };
}

async function main() {
  // Movements must attach to a real location — reuse the first seeded one.
  const [loc] = await db.select({ id: locations.id }).from(locations).limit(1);
  assert(loc, "No seeded location found — run `bun run db:seed` first.");

  console.log(
    "→ Scenario A: REAL locked gate (getLevelLocked, pg_advisory_xact_lock)",
  );
  const locked = await runScenario("LOCKED", getLevelLocked, loc.id);
  console.log(
    `   winners=${locked.winners} blocked=${locked.blocked} finalLevel=${locked.finalLevel} (${locked.sku})`,
  );
  assert.equal(locked.winners, 1, `LOCKED: expected exactly 1 winner, got ${locked.winners}`);
  assert.equal(locked.blocked, 1, `LOCKED: expected exactly 1 rejection, got ${locked.blocked}`);
  assert.equal(locked.finalLevel, 0, `LOCKED: expected final level 0, got ${locked.finalLevel}`);
  console.log(
    "   ✓ lock held: one sale won, one rejected, level never went negative\n",
  );

  console.log(
    "→ Scenario B: NAIVE gate (plain SUM, NO advisory lock) — counterfactual",
  );
  const naive = await runScenario("NAIVE", getLevelNaive, loc.id);
  console.log(
    `   winners=${naive.winners} blocked=${naive.blocked} finalLevel=${naive.finalLevel} (${naive.sku})`,
  );
  assert.equal(naive.winners, 2, `NAIVE: expected both to win (proves the race), got ${naive.winners}`);
  assert.equal(naive.blocked, 0, `NAIVE: expected 0 rejections, got ${naive.blocked}`);
  assert.equal(naive.finalLevel, -5, `NAIVE: expected oversold final level -5, got ${naive.finalLevel}`);
  console.log(
    "   ✓ counterfactual confirmed: without the lock, both sold, level went to -5\n",
  );

  console.log(
    "PASS — DEC-013 advisory lock is load-bearing (locked final=0, naive final=-5).",
  );
}

main()
  .then(async () => {
    await db.$client.end();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("FAIL —", err instanceof Error ? err.message : err);
    await db.$client.end();
    process.exit(1);
  });

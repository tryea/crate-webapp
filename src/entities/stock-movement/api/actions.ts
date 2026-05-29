"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditLog,
  stockMovements,
  type StockMovement,
} from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
import {
  buildTransferPair,
  checkDecrementAllowed,
  validateMovementShape,
} from "../domain/stock-math";
import {
  adjustmentFormSchema,
  stockInFormSchema,
  stockOutFormSchema,
  transferFormSchema,
  type AdjustmentFormValues,
  type StockInFormValues,
  type StockOutFormValues,
  type TransferFormValues,
} from "../model/movement-schemas";
import { settings as settingsTable } from "@/db/schema";

/**
 * Read `allowBackorder` from the `settings` table directly — FSD
 * boundaries (DEC-002) forbid entity→entity imports, so we query the
 * raw table here rather than calling the settings entity's server fn.
 * Default false matches COUNCIL §0 + STOCK_SETTINGS_DEFAULTS.
 */
async function getAllowBackorder(): Promise<boolean> {
  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, "stock"))
    .limit(1);
  const v = row?.value as { allowBackorder?: unknown } | null;
  return v?.allowBackorder === true;
}

/**
 * Read current level inside a transaction, serialized against concurrent
 * decrements so two stock-outs cannot both read the same level and race past
 * zero — COUNCIL §4.3 concurrent-update handling (DEC-013).
 *
 * We CANNOT use `SELECT … FOR UPDATE` here: Postgres rejects row locks on an
 * aggregate ("FOR UPDATE is not allowed with aggregate functions"), and even a
 * row-lock over the raw movement rows would only lock rows that already exist —
 * it cannot lock the not-yet-inserted phantom row a concurrent decrement is
 * about to append. Instead we take a transaction-scoped ADVISORY lock on the
 * logical (product, location) key: it serializes all mutations for that key
 * regardless of row existence and auto-releases on commit/rollback. The level
 * stays a pure SUM over the append-only ledger (no denormalized balance row).
 */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function getLevelLocked(
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

function auditDiff(op: string, m: StockMovement) {
  return {
    op,
    productId: m.productId,
    locationId: m.locationId,
    quantity: m.quantity,
    reason: m.reason,
    transferGroupId: m.transferGroupId,
  };
}

// --- Stock In -----------------------------------------------------------

/**
 * Stock In — append a single positive movement at (product, location).
 *
 * Per COUNCIL §4.3:
 *  - Wrapped in a transaction so the audit_log row commits with the movement.
 *  - validateMovementShape() = same domain fn tested 34 ways in Jest.
 *  - requireRole("staff") per RBAC matrix.
 */
export async function stockInAction(
  input: StockInFormValues,
): Promise<ActionResult<StockMovement>> {
  const { user } = await requireRole("staff");

  const parsed = stockInFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid stock-in data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const shape = validateMovementShape({ type: "stock_in", quantity: parsed.data.quantity });
  if (!shape.ok) return { ok: false, error: shape.error };

  const unitCost = parsed.data.unitCost && parsed.data.unitCost !== ""
    ? parsed.data.unitCost
    : null;

  try {
    const row = await db.transaction(async (tx) => {
      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId: parsed.data.productId,
          locationId: parsed.data.locationId,
          type: "stock_in",
          reason: parsed.data.reason,
          quantity: parsed.data.quantity,
          unitCost,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          createdBy: user.id,
        })
        .returning();

      await tx.insert(auditLog).values({
        userId: user.id,
        action: "stock_movement",
        resourceType: "stock_movement",
        resourceId: movement.id,
        diff: auditDiff("stock_in", movement),
      });

      return movement;
    });

    revalidatePath("/movements");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

// --- Stock Out ----------------------------------------------------------

/**
 * Stock Out — locks the level via SELECT FOR UPDATE inside the tx, runs
 * checkDecrementAllowed (tested), refuses with field-level error when
 * insufficient. Concurrent decrements at the same (product, location)
 * serialize through the lock so two parallel sales can't both pass the
 * "have 5, want 3" check and leave the level at -1.
 */
export async function stockOutAction(
  input: StockOutFormValues,
): Promise<ActionResult<StockMovement>> {
  const { user } = await requireRole("staff");

  const parsed = stockOutFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid stock-out data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const row = await db.transaction(async (tx) => {
      const currentLevel = await getLevelLocked(
        tx,
        parsed.data.productId,
        parsed.data.locationId,
      );
      const allowBackorder = await getAllowBackorder();
      const gate = checkDecrementAllowed({
        currentLevel,
        decrementBy: parsed.data.quantity,
        allowBackorder,
      });
      if (!gate.ok) {
        // Throwing rolls back the empty transaction; caller catches.
        throw new Error(`INSUFFICIENT_STOCK::${gate.error}`);
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId: parsed.data.productId,
          locationId: parsed.data.locationId,
          type: "stock_out",
          reason: parsed.data.reason,
          quantity: -parsed.data.quantity, // server flips sign
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          createdBy: user.id,
        })
        .returning();

      await tx.insert(auditLog).values({
        userId: user.id,
        action: "stock_movement",
        resourceType: "stock_movement",
        resourceId: movement.id,
        diff: auditDiff("stock_out", movement),
      });

      return movement;
    });

    revalidatePath("/movements");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.startsWith("INSUFFICIENT_STOCK::")) {
      return {
        ok: false,
        error: message.replace("INSUFFICIENT_STOCK::", ""),
        fieldErrors: { quantity: ["More than available at this location."] },
      };
    }
    return { ok: false, error: message };
  }
}

// --- Transfer (atomic two-sided) ---------------------------------------

/**
 * Transfer — buildTransferPair() builds the paired rows; both insert in
 * ONE transaction. If either fails, both roll back. checkDecrementAllowed
 * gate runs against the SOURCE location with FOR UPDATE lock.
 */
export async function transferAction(
  input: TransferFormValues,
): Promise<ActionResult<{ source: StockMovement; dest: StockMovement }>> {
  const { user } = await requireRole("staff");

  const parsed = transferFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid transfer data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const sourceLevel = await getLevelLocked(
        tx,
        parsed.data.productId,
        parsed.data.sourceLocationId,
      );
      const allowBackorder = await getAllowBackorder();
      const gate = checkDecrementAllowed({
        currentLevel: sourceLevel,
        decrementBy: parsed.data.quantity,
        allowBackorder,
      });
      if (!gate.ok) {
        throw new Error(`INSUFFICIENT_STOCK::${gate.error}`);
      }

      const pair = buildTransferPair({
        productId: parsed.data.productId,
        sourceLocationId: parsed.data.sourceLocationId,
        destLocationId: parsed.data.destLocationId,
        quantity: parsed.data.quantity,
        transferGroupId: randomUUID(),
      });

      const sourceShared = {
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        createdBy: user.id,
      };

      const [source] = await tx
        .insert(stockMovements)
        .values({
          productId: pair.source.productId,
          locationId: pair.source.locationId,
          type: pair.source.type,
          reason: pair.source.reason,
          quantity: pair.source.quantity,
          transferGroupId: pair.source.transferGroupId ?? null,
          ...sourceShared,
        })
        .returning();

      const [dest] = await tx
        .insert(stockMovements)
        .values({
          productId: pair.dest.productId,
          locationId: pair.dest.locationId,
          type: pair.dest.type,
          reason: pair.dest.reason,
          quantity: pair.dest.quantity,
          transferGroupId: pair.dest.transferGroupId ?? null,
          ...sourceShared,
        })
        .returning();

      await tx.insert(auditLog).values([
        {
          userId: user.id,
          action: "stock_movement",
          resourceType: "stock_movement",
          resourceId: source.id,
          diff: auditDiff("transfer_out", source),
        },
        {
          userId: user.id,
          action: "stock_movement",
          resourceType: "stock_movement",
          resourceId: dest.id,
          diff: auditDiff("transfer_in", dest),
        },
      ]);

      return { source, dest };
    });

    revalidatePath("/movements");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.startsWith("INSUFFICIENT_STOCK::")) {
      return {
        ok: false,
        error: message.replace("INSUFFICIENT_STOCK::", ""),
        fieldErrors: { quantity: ["More than available at source location."] },
      };
    }
    return { ok: false, error: message };
  }
}

// --- Adjustment ---------------------------------------------------------

/**
 * Adjustment — signed delta (+ found, − correction). When delta is
 * negative, we run the same lock + checkDecrementAllowed gate. Notes
 * are required (Zod min(1)) so adjustments are explainable.
 */
export async function adjustmentAction(
  input: AdjustmentFormValues,
): Promise<ActionResult<StockMovement>> {
  const { user } = await requireRole("staff");

  const parsed = adjustmentFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid adjustment data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const shape = validateMovementShape({ type: "adjustment", quantity: parsed.data.delta });
  if (!shape.ok) return { ok: false, error: shape.error };

  try {
    const row = await db.transaction(async (tx) => {
      if (parsed.data.delta < 0) {
        const currentLevel = await getLevelLocked(
          tx,
          parsed.data.productId,
          parsed.data.locationId,
        );
        const allowBackorder = await getAllowBackorder();
        const gate = checkDecrementAllowed({
          currentLevel,
          decrementBy: Math.abs(parsed.data.delta),
          allowBackorder,
        });
        if (!gate.ok) {
          throw new Error(`INSUFFICIENT_STOCK::${gate.error}`);
        }
      }

      const [movement] = await tx
        .insert(stockMovements)
        .values({
          productId: parsed.data.productId,
          locationId: parsed.data.locationId,
          type: "adjustment",
          reason: parsed.data.reason,
          quantity: parsed.data.delta,
          notes: parsed.data.notes,
          createdBy: user.id,
        })
        .returning();

      await tx.insert(auditLog).values({
        userId: user.id,
        action: "stock_movement",
        resourceType: "stock_movement",
        resourceId: movement.id,
        diff: auditDiff("adjustment", movement),
      });

      return movement;
    });

    revalidatePath("/movements");
    revalidatePath("/dashboard");
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.startsWith("INSUFFICIENT_STOCK::")) {
      return {
        ok: false,
        error: message.replace("INSUFFICIENT_STOCK::", ""),
        fieldErrors: { delta: ["Negative delta exceeds current level."] },
      };
    }
    return { ok: false, error: message };
  }
}

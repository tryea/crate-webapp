"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import {
  auditLog,
  stockMovements,
  type StockMovement,
} from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
import { validateMovementShape } from "../domain/stock-math";
import {
  stockInFormSchema,
  type StockInFormValues,
} from "../model/movement-schemas";

/**
 * Stock In — append a single positive movement at a (product, location).
 *
 * Per COUNCIL §4.3:
 *  - Wrapped in a transaction so the audit_log row commits with the
 *    movement (or both roll back).
 *  - Validates the sign convention via stock-math (the same function
 *    Jest tests cover with 34 specs).
 *  - requireRole("staff") — staff can record receiving per RBAC matrix.
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

  // Domain-layer shape validation (tested 34 ways). Positive qty + nonzero.
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
          quantity: parsed.data.quantity, // positive — checked above
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
        diff: {
          op: "stock_in",
          productId: movement.productId,
          locationId: movement.locationId,
          quantity: movement.quantity,
          reason: movement.reason,
        },
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

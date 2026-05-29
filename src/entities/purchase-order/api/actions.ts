"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  poLines,
  purchaseOrders,
  type PurchaseOrder,
} from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
import {
  poHeaderFormSchema,
  poIdSchema,
  poLineFormSchema,
  poStatusEnumZ,
  type PoHeaderFormValues,
  type PoLineFormValues,
  type PoStatusValue,
} from "../model/po-schema";
import { nextPoNumberServer } from "./server";

/**
 * Create a draft PO. PO number auto-generated server-side via
 * nextPoNumberServer; we retry once on po_number_idx conflict to handle
 * the rare two-operators-at-once race.
 */
export async function createPurchaseOrderAction(
  input: PoHeaderFormValues,
): Promise<ActionResult<PurchaseOrder>> {
  const { user } = await requireRole("manager");

  const parsed = poHeaderFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid PO data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const poNumber = await nextPoNumberServer();
      const [row] = await db
        .insert(purchaseOrders)
        .values({
          poNumber,
          supplierId: parsed.data.supplierId,
          warehouseId: parsed.data.warehouseId,
          status: "draft",
          expectedDate: parsed.data.expectedDate || null,
          notes: parsed.data.notes || null,
          createdBy: user.id,
        })
        .returning();
      revalidatePath("/orders");
      return { ok: true, data: row };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Database error";
      if (message.includes("po_number_idx") && attempt === 0) continue;
      return { ok: false, error: message };
    }
  }
  return { ok: false, error: "Could not allocate a PO number — retry." };
}

export async function setPoStatusAction(
  id: string,
  status: PoStatusValue,
): Promise<ActionResult<PurchaseOrder>> {
  const { user } = await requireRole("manager");
  void user;

  const idParse = poIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid PO id." };
  const statusParse = poStatusEnumZ.safeParse(status);
  if (!statusParse.success) return { ok: false, error: "Invalid status." };

  try {
    const [row] = await db
      .update(purchaseOrders)
      .set({ status: statusParse.data })
      .where(eq(purchaseOrders.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "PO not found." };
    revalidatePath("/orders");
    revalidatePath(`/orders/${idParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

export async function addPoLineAction(
  poId: string,
  input: PoLineFormValues,
): Promise<ActionResult<{ id: string }>> {
  await requireRole("manager");

  const idParse = poIdSchema.safeParse(poId);
  if (!idParse.success) return { ok: false, error: "Invalid PO id." };

  const parsed = poLineFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid line data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db
      .insert(poLines)
      .values({
        poId: idParse.data,
        productId: parsed.data.productId,
        quantityOrdered: parsed.data.quantityOrdered,
        unitCost: parsed.data.unitCost,
      })
      .returning({ id: poLines.id });
    revalidatePath(`/orders/${idParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

export async function deletePoLineAction(
  lineId: string,
): Promise<ActionResult<void>> {
  await requireRole("manager");

  const idParse = poIdSchema.safeParse(lineId);
  if (!idParse.success) return { ok: false, error: "Invalid line id." };

  try {
    const [row] = await db
      .delete(poLines)
      .where(eq(poLines.id, idParse.data))
      .returning({ id: poLines.id, poId: poLines.poId });
    if (!row) return { ok: false, error: "Line not found." };
    revalidatePath(`/orders/${row.poId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

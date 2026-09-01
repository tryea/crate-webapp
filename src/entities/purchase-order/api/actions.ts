"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import {
  poLines,
  purchaseOrders,
  type PurchaseOrder,
} from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import { withUserContext } from "@/shared/lib/auth/session-binding";
import type { ActionResult } from "@/shared/lib/server-action/types";
import { unexpectedActionError } from "@/shared/lib/server-action/errors";
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
      const [row] = await withUserContext(user.id, user.role, async (tx) =>
        tx
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
          .returning(),
      );
      revalidatePath("/orders");
      return { ok: true, data: row };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Database error";
      if (message.includes("po_number_idx") && attempt === 0) continue;
      return unexpectedActionError(err, "createPurchaseOrder");
    }
  }
  return { ok: false, error: "Could not allocate a PO number. Retry." };
}

export async function setPoStatusAction(
  id: string,
  status: PoStatusValue,
): Promise<ActionResult<PurchaseOrder>> {
  const { user } = await requireRole("manager");

  const idParse = poIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid PO id." };
  const statusParse = poStatusEnumZ.safeParse(status);
  if (!statusParse.success) return { ok: false, error: "Invalid status." };

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .update(purchaseOrders)
        .set({ status: statusParse.data })
        .where(eq(purchaseOrders.id, idParse.data))
        .returning(),
    );
    if (!row) return { ok: false, error: "PO not found." };
    revalidatePath("/orders");
    revalidatePath(`/orders/${idParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    return unexpectedActionError(err, "setPoStatus");
  }
}

export async function addPoLineAction(
  poId: string,
  input: PoLineFormValues,
): Promise<ActionResult<{ id: string }>> {
  const { user } = await requireRole("manager");

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
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .insert(poLines)
        .values({
          poId: idParse.data,
          productId: parsed.data.productId,
          quantityOrdered: parsed.data.quantityOrdered,
          unitCost: parsed.data.unitCost,
        })
        .returning({ id: poLines.id }),
    );
    revalidatePath(`/orders/${idParse.data}`);
    return { ok: true, data: row };
  } catch (err) {
    return unexpectedActionError(err, "addPoLine");
  }
}

export async function deletePoLineAction(
  lineId: string,
): Promise<ActionResult<void>> {
  const { user } = await requireRole("manager");

  const idParse = poIdSchema.safeParse(lineId);
  if (!idParse.success) return { ok: false, error: "Invalid line id." };

  try {
    const [row] = await withUserContext(user.id, user.role, async (tx) =>
      tx
        .delete(poLines)
        .where(eq(poLines.id, idParse.data))
        .returning({ id: poLines.id, poId: poLines.poId }),
    );
    if (!row) return { ok: false, error: "Line not found." };
    revalidatePath(`/orders/${row.poId}`);
    return { ok: true, data: undefined };
  } catch (err) {
    return unexpectedActionError(err, "deletePoLine");
  }
}

// --- Receive against PO -------------------------------------------------

import { and, inArray } from "drizzle-orm";
import { auditLog, stockMovements, locations } from "@/db/schema";
import {
  poReceiveFormSchema,
  type PoReceiveFormValues,
} from "../model/po-schema";

/**
 * Receive against PO. Transactional: for each line where receiveNow > 0,
 *   - INSERT a stock_in movement (qty = receiveNow at the PO's warehouse
 *     first-location, we pick a default; operator can later split via
 *     transfer if needed). Phase 7 polish can add per-line location picker.
 *   - UPDATE po_lines.quantityReceived += receiveNow.
 *   - DB CHECK po_lines_qty_received_le_ordered prevents over-receive.
 *     If the CHECK fires (race or stale UI), we surface a clean error.
 *   - INSERT one audit_log row per movement.
 * After all lines: re-derive po.status from the updated lines.
 *   - if every line is fully received → "received"
 *   - else if any line has received > 0 → "partial"
 *   - else → keep current
 */
export async function receivePoAction(
  input: PoReceiveFormValues,
): Promise<
  ActionResult<{ poId: string; movementsCreated: number; newStatus: PoStatusValue }>
> {
  const { user } = await requireRole("staff");

  const parsed = poReceiveFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid receive payload.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  const linesToReceive = parsed.data.lines.filter((l) => l.receiveNow > 0);
  if (linesToReceive.length === 0) {
    return { ok: false, error: "Enter a positive receive quantity on at least one line." };
  }

  try {
    const result = await withUserContext(user.id, user.role, async (tx) => {
      // Fetch the PO + its lines + the first location of the warehouse.
      const [po] = await tx
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, parsed.data.poId))
        .for("update")
        .limit(1);
      if (!po) throw new Error("PO_NOT_FOUND::PO not found.");
      if (po.status === "cancelled" || po.status === "received") {
        throw new Error(`PO_CLOSED::Cannot receive against a ${po.status} PO.`);
      }

      const lineIds = linesToReceive.map((l) => l.lineId);
      const lineRows = await tx
        .select()
        .from(poLines)
        .where(and(eq(poLines.poId, po.id), inArray(poLines.id, lineIds)));
      const linesById = new Map(lineRows.map((r) => [r.id, r]));

      // Pick a destination location: first location in the PO's warehouse.
      // Phase 7 polish: per-line location picker.
      const [destLoc] = await tx
        .select()
        .from(locations)
        .where(eq(locations.warehouseId, po.warehouseId))
        .limit(1);
      if (!destLoc) {
        throw new Error(
          "NO_LOCATION::This warehouse has no locations, add at least one location before receiving.",
        );
      }

      let movementsCreated = 0;
      for (const inputLine of linesToReceive) {
        const line = linesById.get(inputLine.lineId);
        if (!line) throw new Error("LINE_MISSING::A PO line vanished mid-tx.");

        const projected = line.quantityReceived + inputLine.receiveNow;
        if (projected > line.quantityOrdered) {
          throw new Error(
            `OVER_RECEIVE::${line.id}::Line would over-receive (${projected} > ${line.quantityOrdered}).`,
          );
        }

        // 1. stock_in movement
        const [movement] = await tx
          .insert(stockMovements)
          .values({
            productId: line.productId,
            locationId: destLoc.id,
            type: "stock_in",
            reason: "purchase",
            quantity: inputLine.receiveNow,
            unitCost: line.unitCost,
            reference: po.poNumber,
            notes: `Received against ${po.poNumber}`,
            createdBy: user.id,
          })
          .returning();
        movementsCreated++;

        // 2. update po_lines.quantityReceived
        await tx
          .update(poLines)
          .set({ quantityReceived: projected })
          .where(eq(poLines.id, line.id));

        // 3. audit row
        await tx.insert(auditLog).values({
          userId: user.id,
          action: "po_receive",
          resourceType: "po_line",
          resourceId: line.id,
          diff: {
            poId: po.id,
            poNumber: po.poNumber,
            lineId: line.id,
            quantityReceivedDelta: inputLine.receiveNow,
            quantityReceivedAfter: projected,
            stockMovementId: movement.id,
          },
        });
      }

      // 4. Re-derive PO status from updated lines.
      const allLines = await tx
        .select()
        .from(poLines)
        .where(eq(poLines.poId, po.id));
      const fullyReceived = allLines.every(
        (l) => l.quantityReceived >= l.quantityOrdered,
      );
      const anyReceived = allLines.some((l) => l.quantityReceived > 0);
      const newStatus: PoStatusValue = fullyReceived
        ? "received"
        : anyReceived
          ? "partial"
          : po.status;

      if (newStatus !== po.status) {
        await tx
          .update(purchaseOrders)
          .set({
            status: newStatus,
            receivedDate: fullyReceived
              ? new Date().toISOString().slice(0, 10)
              : po.receivedDate,
          })
          .where(eq(purchaseOrders.id, po.id));

        await tx.insert(auditLog).values({
          userId: user.id,
          action: "po_status_change",
          resourceType: "purchase_order",
          resourceId: po.id,
          diff: { from: po.status, to: newStatus, poNumber: po.poNumber },
        });
      }

      return { poId: po.id, movementsCreated, newStatus };
    });

    revalidatePath("/orders");
    revalidatePath(`/orders/${parsed.data.poId}`);
    revalidatePath("/movements");
    revalidatePath("/catalog");
    revalidatePath("/dashboard");
    return { ok: true, data: result };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.startsWith("PO_NOT_FOUND::")) {
      return { ok: false, error: message.replace("PO_NOT_FOUND::", "") };
    }
    if (message.startsWith("PO_CLOSED::")) {
      return { ok: false, error: message.replace("PO_CLOSED::", "") };
    }
    if (message.startsWith("NO_LOCATION::")) {
      return { ok: false, error: message.replace("NO_LOCATION::", "") };
    }
    if (message.startsWith("OVER_RECEIVE::")) {
      // OVER_RECEIVE::<lineId>::<msg>
      const [, lineId, ...rest] = message.split("::");
      return {
        ok: false,
        error: rest.join("::"),
        fieldErrors: { [`line_${lineId}`]: ["Cannot exceed quantity ordered."] },
      };
    }
    if (message.toLowerCase().includes("po_lines_qty_received_le_ordered")) {
      return {
        ok: false,
        error: "One or more lines would over-receive. Refresh and retry.",
      };
    }
    return unexpectedActionError(err, "receivePo");
  }
}

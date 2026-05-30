"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { suppliers, type Supplier } from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
import { unexpectedActionError } from "@/shared/lib/server-action/errors";
import {
  supplierFormSchema,
  supplierIdSchema,
  type SupplierFormValues,
} from "../model/supplier-schema";

export async function createSupplierAction(
  input: SupplierFormValues,
): Promise<ActionResult<Supplier>> {
  await requireRole("manager");

  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid supplier data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db.insert(suppliers).values(parsed.data).returning();
    revalidatePath("/catalog/suppliers");
    return { ok: true, data: row };
  } catch (err) {
    return unexpectedActionError(err, "createSupplier");
  }
}

export async function updateSupplierAction(
  id: string,
  input: SupplierFormValues,
): Promise<ActionResult<Supplier>> {
  await requireRole("manager");

  const idParse = supplierIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid supplier id." };

  const parsed = supplierFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid supplier data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db
      .update(suppliers)
      .set(parsed.data)
      .where(eq(suppliers.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Supplier not found." };
    revalidatePath("/catalog/suppliers");
    return { ok: true, data: row };
  } catch (err) {
    return unexpectedActionError(err, "updateSupplier");
  }
}

/**
 * Hard-delete. products.supplierId FK is ON DELETE SET NULL so deleting
 * a supplier leaves its products intact with no supplier — safe.
 */
export async function deleteSupplierAction(
  id: string,
): Promise<ActionResult<Supplier>> {
  await requireRole("manager");

  const idParse = supplierIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid supplier id." };

  try {
    const [row] = await db
      .delete(suppliers)
      .where(eq(suppliers.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Supplier not found." };
    revalidatePath("/catalog/suppliers");
    return { ok: true, data: row };
  } catch (err) {
    return unexpectedActionError(err, "deleteSupplier");
  }
}

export async function recreateSupplierAction(
  row: Supplier,
): Promise<ActionResult<Supplier>> {
  await requireRole("manager");

  try {
    const [restored] = await db
      .insert(suppliers)
      .values(row)
      .onConflictDoNothing()
      .returning();
    revalidatePath("/catalog/suppliers");
    return { ok: true, data: restored ?? row };
  } catch (err) {
    return unexpectedActionError(err, "recreateSupplier");
  }
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { products, type Product } from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import type { ActionResult } from "@/shared/lib/server-action/types";
import {
  productFormSchema,
  productIdSchema,
  toProductInsert,
  type ProductFormValues,
} from "../model/product-schema";

export async function createProductAction(
  input: ProductFormValues,
): Promise<ActionResult<Product>> {
  await requireRole("manager");

  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid product data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db.insert(products).values(toProductInsert(parsed.data)).returning();
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("products_sku_idx")) {
      return {
        ok: false,
        error: "That SKU is already taken.",
        fieldErrors: { sku: ["Already in use — pick a different SKU."] },
      };
    }
    return { ok: false, error: message };
  }
}

export async function updateProductAction(
  id: string,
  input: ProductFormValues,
): Promise<ActionResult<Product>> {
  await requireRole("manager");

  const idParse = productIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid product id." };

  const parsed = productFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid product data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db
      .update(products)
      .set(toProductInsert(parsed.data))
      .where(eq(products.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Product not found." };
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("products_sku_idx")) {
      return {
        ok: false,
        error: "That SKU is already taken.",
        fieldErrors: { sku: ["Already in use — pick a different SKU."] },
      };
    }
    return { ok: false, error: message };
  }
}

/**
 * Hard-delete. stock_movements.productId is ON DELETE RESTRICT, so the
 * action catches FK violations and surfaces a domain-specific error.
 * Most operators should ARCHIVE (isActive=false) instead of delete.
 */
export async function deleteProductAction(
  id: string,
): Promise<ActionResult<Product>> {
  await requireRole("manager");

  const idParse = productIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid product id." };

  try {
    const [row] = await db
      .delete(products)
      .where(eq(products.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Product not found." };
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.toLowerCase().includes("violates foreign key")) {
      return {
        ok: false,
        error: "This product has stock movements — archive it (set inactive) instead of deleting.",
      };
    }
    return { ok: false, error: message };
  }
}

export async function recreateProductAction(
  row: Product,
): Promise<ActionResult<Product>> {
  await requireRole("manager");
  try {
    const [restored] = await db
      .insert(products)
      .values(row)
      .onConflictDoNothing()
      .returning();
    revalidatePath("/catalog");
    return { ok: true, data: restored ?? row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

/**
 * Archive toggle — common-case alternative to delete. Sets isActive
 * without touching anything else. UI surfaces this as the safe choice.
 */
export async function setProductActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult<Product>> {
  await requireRole("manager");

  const idParse = productIdSchema.safeParse(id);
  if (!idParse.success) return { ok: false, error: "Invalid product id." };

  try {
    const [row] = await db
      .update(products)
      .set({ isActive })
      .where(eq(products.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Product not found." };
    revalidatePath("/catalog");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

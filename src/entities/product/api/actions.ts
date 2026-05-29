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

// --- Phase 7.3: bulk import ---------------------------------------------

import { sql } from "drizzle-orm";
import { categories, suppliers } from "@/db/schema";
import {
  productImportRowSchema,
  type ProductImportRow,
} from "../model/import-schema";

export interface ProductImportRowResult {
  rowNumber: number; // 1-indexed, including header offset (data starts at 2)
  status: "inserted" | "updated" | "skipped" | "error";
  sku?: string;
  error?: string;
}

export interface ProductImportResult {
  totalRows: number;
  inserted: number;
  updated: number;
  errors: number;
  perRow: ProductImportRowResult[];
}

/**
 * Bulk product import. Each row was already client-side validated; this
 * action re-parses through Zod (never trust the client) and runs the
 * batch in a single db.transaction.
 *
 * Upsert by SKU: if a product with that SKU exists, UPDATE fields.
 * Otherwise INSERT. ON CONFLICT (sku) DO UPDATE.
 *
 * Lookups (category_slug, supplier_name) resolve to FK ids; unknown
 * lookups null the FK and emit a per-row note rather than rejecting
 * the whole row.
 */
export async function importProductsAction(
  rows: unknown[],
): Promise<ActionResult<ProductImportResult>> {
  await requireRole("manager");

  if (!Array.isArray(rows)) {
    return { ok: false, error: "Expected an array of rows." };
  }
  if (rows.length === 0) {
    return { ok: false, error: "No rows to import." };
  }
  if (rows.length > 5000) {
    return { ok: false, error: "Maximum 5,000 rows per import." };
  }

  // Re-validate every row server-side.
  const parsed: Array<{ rowNumber: number; data?: ProductImportRow; error?: string }> = rows.map(
    (raw, i) => {
      const result = productImportRowSchema.safeParse(raw);
      if (!result.success) {
        const firstIssue = result.error.issues[0];
        const path = firstIssue?.path?.[0] ?? "row";
        return { rowNumber: i + 2, error: `${String(path)}: ${firstIssue?.message ?? "invalid"}` };
      }
      return { rowNumber: i + 2, data: result.data };
    },
  );

  const valid = parsed.filter((p) => p.data) as Array<{ rowNumber: number; data: ProductImportRow }>;
  const invalid = parsed.filter((p) => p.error) as Array<{ rowNumber: number; error: string }>;

  if (valid.length === 0) {
    return {
      ok: false,
      error: `All ${rows.length} rows failed validation.`,
    };
  }

  // Resolve category + supplier lookups in batch.
  const slugs = Array.from(
    new Set(valid.map((v) => v.data.categorySlug).filter((s): s is string => Boolean(s))),
  );
  const supplierNames = Array.from(
    new Set(valid.map((v) => v.data.supplierName).filter((s): s is string => Boolean(s))),
  );

  const catRows = slugs.length
    ? await db
        .select({ id: categories.id, slug: categories.slug })
        .from(categories)
        .where(sql`${categories.slug} IN (${sql.join(slugs.map((s) => sql`${s}`), sql`, `)})`)
    : [];
  const supRows = supplierNames.length
    ? await db
        .select({ id: suppliers.id, name: suppliers.name })
        .from(suppliers)
        .where(sql`${suppliers.name} IN (${sql.join(supplierNames.map((s) => sql`${s}`), sql`, `)})`)
    : [];

  const catBySlug = new Map(catRows.map((c) => [c.slug, c.id]));
  const supByName = new Map(supRows.map((s) => [s.name, s.id]));

  const perRow: ProductImportRowResult[] = [...invalid.map((iv) => ({
    rowNumber: iv.rowNumber,
    status: "error" as const,
    error: iv.error,
  }))];

  let inserted = 0;
  let updated = 0;

  try {
    await db.transaction(async (tx) => {
      for (const { rowNumber, data } of valid) {
        const categoryId = data.categorySlug ? catBySlug.get(data.categorySlug) ?? null : null;
        const supplierId = data.supplierName ? supByName.get(data.supplierName) ?? null : null;

        const insertValues = {
          sku: data.sku,
          name: data.name,
          description: data.description,
          imageUrl: data.imageUrl,
          unit: data.unit,
          barcode: data.barcode,
          categoryId,
          supplierId,
          reorderPoint: data.reorderPoint,
          costPrice: data.costPrice,
          sellingPrice: data.sellingPrice,
          isActive: data.isActive,
        };

        try {
          const [row] = await tx
            .insert(products)
            .values(insertValues)
            .onConflictDoUpdate({
              target: products.sku,
              set: {
                name: insertValues.name,
                description: insertValues.description,
                imageUrl: insertValues.imageUrl,
                unit: insertValues.unit,
                barcode: insertValues.barcode,
                categoryId: insertValues.categoryId,
                supplierId: insertValues.supplierId,
                reorderPoint: insertValues.reorderPoint,
                costPrice: insertValues.costPrice,
                sellingPrice: insertValues.sellingPrice,
                isActive: insertValues.isActive,
              },
            })
            .returning({ id: products.id, sku: products.sku, createdAt: products.createdAt, updatedAt: products.updatedAt });

          const wasInsert =
            row.createdAt instanceof Date &&
            row.updatedAt instanceof Date &&
            Math.abs(row.createdAt.getTime() - row.updatedAt.getTime()) < 1000;

          if (wasInsert) inserted++;
          else updated++;

          perRow.push({
            rowNumber,
            status: wasInsert ? "inserted" : "updated",
            sku: row.sku,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Database error";
          perRow.push({
            rowNumber,
            status: "error",
            sku: data.sku,
            error: message.slice(0, 200),
          });
          throw err; // roll back the whole tx — partial imports aren't allowed
        }
      }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: `Import rolled back due to: ${message}` };
  }

  revalidatePath("/catalog");
  perRow.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    ok: true,
    data: {
      totalRows: rows.length,
      inserted,
      updated,
      errors: invalid.length,
      perRow,
    },
  };
}

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, type Category } from "@/db/schema";
import { requireRole } from "@/shared/lib/auth/require-role";
import {
  categoryFormSchema,
  categoryIdSchema,
  type CategoryFormValues,
} from "../model/category-schema";

/**
 * Server actions for category CRUD. Every one calls requireRole() —
 * scripts/check-auth-guards.sh enforces this at lint time (DEC-003).
 * The Zod schema runs server-side too — never trust client validation.
 */

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

export async function createCategoryAction(
  input: CategoryFormValues,
): Promise<ActionResult<Category>> {
  await requireRole("manager");

  const parsed = categoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid category data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  try {
    const [row] = await db.insert(categories).values(parsed.data).returning();
    revalidatePath("/catalog/categories");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("categories_slug_idx")) {
      return {
        ok: false,
        error: "That slug is already taken.",
        fieldErrors: { slug: ["Already in use — pick a different slug."] },
      };
    }
    return { ok: false, error: message };
  }
}

export async function updateCategoryAction(
  id: string,
  input: CategoryFormValues,
): Promise<ActionResult<Category>> {
  await requireRole("manager");

  const idParse = categoryIdSchema.safeParse(id);
  if (!idParse.success) {
    return { ok: false, error: "Invalid category id." };
  }

  const parsed = categoryFormSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid category data.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }

  // Self-parent guard (can't be your own parent — would be a structural cycle).
  if (parsed.data.parentId === idParse.data) {
    return {
      ok: false,
      error: "A category cannot be its own parent.",
      fieldErrors: { parentId: ["Pick a different parent or leave empty."] },
    };
  }

  try {
    const [row] = await db
      .update(categories)
      .set(parsed.data)
      .where(eq(categories.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Category not found." };
    revalidatePath("/catalog/categories");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    if (message.includes("categories_slug_idx")) {
      return {
        ok: false,
        error: "That slug is already taken.",
        fieldErrors: { slug: ["Already in use — pick a different slug."] },
      };
    }
    return { ok: false, error: message };
  }
}

/**
 * Hard-delete. FKs from products.categoryId have ON DELETE SET NULL, so
 * deleting a category leaves its products intact with no category — safe.
 *
 * Pairs with `recreateCategoryAction` to power the undo-toast pattern:
 * the deleted row is returned so the client can re-create with the same id.
 */
export async function deleteCategoryAction(
  id: string,
): Promise<ActionResult<Category>> {
  await requireRole("manager");

  const idParse = categoryIdSchema.safeParse(id);
  if (!idParse.success) {
    return { ok: false, error: "Invalid category id." };
  }

  try {
    const [row] = await db
      .delete(categories)
      .where(eq(categories.id, idParse.data))
      .returning();
    if (!row) return { ok: false, error: "Category not found." };
    revalidatePath("/catalog/categories");
    return { ok: true, data: row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

/**
 * Undo helper — re-creates a previously deleted category with its
 * original id so any references that haven't been GC'd elsewhere can
 * heal. Idempotent on (id, slug) uniqueness.
 */
export async function recreateCategoryAction(
  row: Category,
): Promise<ActionResult<Category>> {
  await requireRole("manager");

  try {
    const [restored] = await db
      .insert(categories)
      .values(row)
      .onConflictDoNothing()
      .returning();
    revalidatePath("/catalog/categories");
    return { ok: true, data: restored ?? row };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Database error";
    return { ok: false, error: message };
  }
}

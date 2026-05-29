import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { categories } from "@/db/schema";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Form-input schema for create/edit. Built by extending the Drizzle table
 * schema with business rules that aren't expressible as SQL CHECK
 * (slug regex, sane min lengths, parent self-ref guard at the form layer).
 *
 * Per COUNCIL §0 rule 5: Zod is SSOT for validation. Server actions parse
 * the same schema before any DB write.
 */
export const categoryFormSchema = createInsertSchema(categories, {
  name: (s) =>
    s
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
  slug: (s) =>
    s
      .min(1, "Slug is required")
      .max(120, "Slug must be 120 characters or fewer")
      .regex(SLUG_REGEX, "Slug must be lowercase letters/numbers separated by dashes"),
  parentId: (s) => s.nullable().optional(),
}).pick({ name: true, slug: true, parentId: true });

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;

export const categoryIdSchema = z.uuid();

/**
 * Helper for the create form: turn "Cold Brews" into "cold-brews".
 */
export function suggestSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

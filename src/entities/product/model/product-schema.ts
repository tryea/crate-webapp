import { z } from "zod";

const SKU_REGEX = /^[A-Z0-9][A-Z0-9-]*$/;
const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

/**
 * Form-side schema (no transforms, input type == output type) so
 * react-hook-form's Resolver generic stays sound. Server-side
 * normalization (empty string → null, money string → 2-decimal,
 * reorderPoint coerce) happens in the action before DB insert.
 *
 * Validated empty-allowed fields are typed as plain string and
 * fall through to `null` in the action when blank.
 */
export const productFormSchema = z.object({
  sku: z
    .string()
    .min(1, "SKU is required")
    .max(64, "SKU must be 64 characters or fewer")
    .regex(SKU_REGEX, "SKU must be uppercase letters/numbers with optional dashes"),
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional(),
  imageUrl: z.string().max(500).optional(),
  unit: z.string().min(1, "Unit is required").max(16),
  categoryId: z.string().optional(),
  supplierId: z.string().optional(),
  barcode: z.string().max(64).optional(),
  reorderPoint: z
    .number()
    .int("Whole numbers only")
    .min(0, "Cannot be negative"),
  costPrice: z
    .string()
    .regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)"),
  sellingPrice: z
    .string()
    .regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)"),
  isActive: z.boolean(),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;
export const productIdSchema = z.uuid();

/**
 * Normalise the form values before DB insert. Run inside the server action.
 *  - Blank string → null for optional FK ids and free-text fields
 *  - Money strings stay as strings (Drizzle numeric(14,2) expects string)
 */
export function toProductInsert(values: ProductFormValues) {
  const blankToNull = (v: string | undefined | null): string | null =>
    v && v.trim() !== "" ? v : null;

  return {
    sku: values.sku,
    name: values.name,
    description: blankToNull(values.description),
    imageUrl: blankToNull(values.imageUrl),
    unit: values.unit,
    categoryId: blankToNull(values.categoryId),
    supplierId: blankToNull(values.supplierId),
    barcode: blankToNull(values.barcode),
    reorderPoint: values.reorderPoint,
    costPrice: values.costPrice,
    sellingPrice: values.sellingPrice,
    isActive: values.isActive,
  };
}

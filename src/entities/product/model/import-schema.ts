import { z } from "zod";

/**
 * Schema for ONE row of a product CSV import. Looser than productFormSchema:
 *  - Accepts string-typed numeric/boolean fields (CSV has no types)
 *  - All optional fields default to sensible values
 *  - sku and name remain required
 *
 * Validation runs CLIENT-SIDE per row so the operator gets immediate
 * line-by-line feedback before submitting. Server re-validates everything
 * the client submits (never trust the client).
 */
const SKU_REGEX = /^[A-Z0-9][A-Z0-9-]*$/;
const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;

const toMoneyString = (v: unknown): string => {
  if (v == null || v === "") return "0.00";
  if (typeof v === "number") return v.toFixed(2);
  return String(v).trim();
};

const toInt = (v: unknown): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Math.trunc(v);
  const n = Number.parseInt(String(v).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
};

const toBool = (v: unknown): boolean => {
  if (v == null || v === "") return true;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "y";
};

const trimToNull = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export const productImportRowSchema = z
  .object({
    sku: z.string(),
    name: z.string(),
    description: z.unknown().optional(),
    image_url: z.unknown().optional(),
    unit: z.unknown().optional(),
    barcode: z.unknown().optional(),
    category_slug: z.unknown().optional(),
    supplier_name: z.unknown().optional(),
    reorder_point: z.unknown().optional(),
    cost_price: z.unknown().optional(),
    selling_price: z.unknown().optional(),
    is_active: z.unknown().optional(),
  })
  .transform((raw) => ({
    sku: String(raw.sku ?? "").trim().toUpperCase(),
    name: String(raw.name ?? "").trim(),
    description: trimToNull(raw.description),
    imageUrl: trimToNull(raw.image_url),
    unit: trimToNull(raw.unit) ?? "pcs",
    barcode: trimToNull(raw.barcode),
    categorySlug: trimToNull(raw.category_slug),
    supplierName: trimToNull(raw.supplier_name),
    reorderPoint: toInt(raw.reorder_point),
    costPrice: toMoneyString(raw.cost_price),
    sellingPrice: toMoneyString(raw.selling_price),
    isActive: toBool(raw.is_active),
  }))
  .pipe(
    z.object({
      sku: z
        .string()
        .min(1, "SKU is required")
        .max(64, "SKU max 64 chars")
        .regex(SKU_REGEX, "SKU must be uppercase letters/numbers/dashes"),
      name: z.string().min(1, "Name is required").max(200),
      description: z.string().max(2000).nullable(),
      imageUrl: z.string().max(500).nullable(),
      unit: z.string().min(1).max(16),
      barcode: z.string().max(64).nullable(),
      categorySlug: z.string().max(120).nullable(),
      supplierName: z.string().max(160).nullable(),
      reorderPoint: z.number().int().min(0, "Cannot be negative").refine(Number.isFinite, "Must be an integer"),
      costPrice: z.string().regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)"),
      sellingPrice: z.string().regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)"),
      isActive: z.boolean(),
    }),
  );

export type ProductImportRow = z.infer<typeof productImportRowSchema>;

export const PRODUCT_IMPORT_CSV_HEADERS = [
  "sku",
  "name",
  "description",
  "image_url",
  "unit",
  "barcode",
  "category_slug",
  "supplier_name",
  "reorder_point",
  "cost_price",
  "selling_price",
  "is_active",
] as const;

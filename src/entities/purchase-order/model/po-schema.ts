import { z } from "zod";

/**
 * Purchase Orders: header form + line-item form (added on detail page).
 * PO number is generated server-side ("PO-2026-NNN") so two operators
 * creating drafts concurrently never collide.
 */

export const poStatusEnumZ = z.enum([
  "draft",
  "sent",
  "partial",
  "received",
  "cancelled",
]);
export type PoStatusValue = z.infer<typeof poStatusEnumZ>;

export const poHeaderFormSchema = z.object({
  supplierId: z.uuid("Pick a supplier"),
  warehouseId: z.uuid("Pick a warehouse"),
  expectedDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
});
export type PoHeaderFormValues = z.infer<typeof poHeaderFormSchema>;

const POSITIVE_INT = z
  .number()
  .int("Whole numbers only")
  .positive("Quantity must be greater than zero");

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;
const moneyString = z
  .string()
  .regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)");

export const poLineFormSchema = z.object({
  productId: z.uuid("Pick a product"),
  quantityOrdered: POSITIVE_INT,
  unitCost: moneyString,
});
export type PoLineFormValues = z.infer<typeof poLineFormSchema>;

/**
 * Receive form: captures per-line "received THIS time" qty. Server adds
 * to po_lines.quantityReceived and inserts a stock_in movement per line
 * in the same transaction.
 */
export const poReceiveLineSchema = z.object({
  lineId: z.uuid(),
  receiveNow: z.number().int().min(0, "Cannot be negative"),
});
export const poReceiveFormSchema = z.object({
  poId: z.uuid(),
  lines: z.array(poReceiveLineSchema).min(1, "Add at least one line"),
});
export type PoReceiveFormValues = z.infer<typeof poReceiveFormSchema>;

export const poIdSchema = z.uuid();

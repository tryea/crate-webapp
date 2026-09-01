import { z } from "zod";

/**
 * Zod schemas for stock-movement flow forms. Match the DB enums but are
 * the authoritative validation surface per COUNCIL §0 rule 5. Server
 * actions re-parse with these before any DB write.
 */
export const movementReasonEnum = z.enum([
  "purchase",
  "sale",
  "return_to_supplier",
  "return_from_customer",
  "damage",
  "lost",
  "count_correction",
  "transfer",
  "other",
]);
export type MovementReasonValue = z.infer<typeof movementReasonEnum>;

const POSITIVE_INT = z
  .number()
  .int("Whole numbers only")
  .positive("Quantity must be greater than zero");

const optionalText = (max: number) =>
  z.string().max(max).optional();

const MONEY_REGEX = /^\d+(\.\d{1,2})?$/;
const optionalMoney = z
  .string()
  .regex(MONEY_REGEX, "Use up to 2 decimals (e.g. 1500.00)")
  .optional()
  .or(z.literal(""));

/**
 * Stock-In form. Reasons restricted to ones that make sense for receiving.
 */
export const stockInFormSchema = z.object({
  productId: z.uuid("Pick a product"),
  locationId: z.uuid("Pick a location"),
  quantity: POSITIVE_INT,
  reason: z.enum(["purchase", "return_from_customer", "other"]),
  unitCost: optionalMoney,
  reference: optionalText(120),
  notes: optionalText(500),
});
export type StockInFormValues = z.infer<typeof stockInFormSchema>;

/**
 * Stock-Out form: caller submits magnitude (positive), server flips sign.
 * Insufficient-stock check happens in the action via checkDecrementAllowed
 * BEFORE the insert transaction begins.
 */
export const stockOutFormSchema = z.object({
  productId: z.uuid("Pick a product"),
  locationId: z.uuid("Pick a location"),
  quantity: POSITIVE_INT,
  reason: z.enum(["sale", "damage", "lost", "return_to_supplier", "other"]),
  reference: optionalText(120),
  notes: optionalText(500),
});
export type StockOutFormValues = z.infer<typeof stockOutFormSchema>;

/**
 * Transfer form: same product moves between two locations. Server uses
 * buildTransferPair (tested) and inserts BOTH rows in one transaction so
 * partial failure is impossible.
 */
export const transferFormSchema = z
  .object({
    productId: z.uuid("Pick a product"),
    sourceLocationId: z.uuid("Pick a source location"),
    destLocationId: z.uuid("Pick a destination location"),
    quantity: POSITIVE_INT,
    reference: optionalText(120),
    notes: optionalText(500),
  })
  .refine(
    (v) => v.sourceLocationId !== v.destLocationId,
    {
      message: "Source and destination must be different.",
      path: ["destLocationId"],
    },
  );
export type TransferFormValues = z.infer<typeof transferFormSchema>;

/**
 * Adjustment form: caller submits a SIGNED delta (positive = found
 * extra; negative = correction down). reason MUST be count_correction
 * for true counts; other reasons allowed for damage/loss adjustments.
 */
export const adjustmentFormSchema = z.object({
  productId: z.uuid("Pick a product"),
  locationId: z.uuid("Pick a location"),
  delta: z
    .number()
    .int("Whole numbers only")
    .refine((n) => n !== 0, "Delta must not be zero"),
  reason: z.enum(["count_correction", "damage", "lost", "other"]),
  notes: z.string().min(1, "Adjustments require a note explaining why").max(500),
});
export type AdjustmentFormValues = z.infer<typeof adjustmentFormSchema>;

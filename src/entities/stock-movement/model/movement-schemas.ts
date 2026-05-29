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

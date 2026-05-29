import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { locations, warehouses } from "@/db/schema";

const CODE_REGEX = /^[A-Z0-9][A-Z0-9-]*$/;

/**
 * Warehouses — code is uppercase, dash-allowed, unique. Address optional.
 */
export const warehouseFormSchema = createInsertSchema(warehouses, {
  name: (s) => s.min(1, "Name is required").max(160),
  code: (s) =>
    s
      .min(1, "Code is required")
      .max(32, "Code must be 32 characters or fewer")
      .regex(CODE_REGEX, "Code must be uppercase letters/numbers with optional dashes"),
}).pick({ name: true, code: true, address: true }).extend({
  address: z
    .string()
    .max(300)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export type WarehouseFormValues = z.infer<typeof warehouseFormSchema>;
export const warehouseIdSchema = z.uuid();

/**
 * Locations — code is uppercase, scoped per-warehouse (unique by
 * warehouseId + code). Name optional (e.g. "Aisle A · Bin 1").
 */
export const locationFormSchema = createInsertSchema(locations, {
  code: (s) =>
    s
      .min(1, "Code is required")
      .max(32, "Code must be 32 characters or fewer")
      .regex(CODE_REGEX, "Code must be uppercase letters/numbers with optional dashes"),
}).pick({ code: true, name: true }).extend({
  name: z
    .string()
    .max(160)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

export type LocationFormValues = z.infer<typeof locationFormSchema>;
export const locationIdSchema = z.uuid();

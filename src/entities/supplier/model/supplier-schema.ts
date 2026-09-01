import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { suppliers } from "@/db/schema";

/**
 * Suppliers schema: no unique constraints, no FKs to itself, so the
 * shape is leaner than Categories. Optional contact fields get
 * nullable-empty handling so the form can submit a blank input as null
 * (Zod default would coerce empty string → fail email validation).
 */
const optionalEmail = z
  .union([z.string().length(0), z.email("Enter a valid email")])
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const optionalText = z
  .string()
  .max(200, "Too long")
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const supplierFormSchema = createInsertSchema(suppliers, {
  name: (s) =>
    s.min(1, "Name is required").max(160, "Name must be 160 characters or fewer"),
}).pick({ name: true }).extend({
  contactEmail: optionalEmail,
  contactPhone: optionalText,
  address: optionalText,
});

export type SupplierFormValues = z.infer<typeof supplierFormSchema>;

export const supplierIdSchema = z.uuid();

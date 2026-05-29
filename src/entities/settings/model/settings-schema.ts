import { z } from "zod";

/**
 * Stock-domain settings — currently just the backorder toggle. Each
 * setting "domain" is one row in the `settings` table, keyed by the
 * domain name ("stock", "valuation", "locations", …).
 */
export const stockSettingsSchema = z.object({
  allowBackorder: z.boolean(),
});
export type StockSettings = z.infer<typeof stockSettingsSchema>;

export const STOCK_SETTINGS_DEFAULTS: StockSettings = {
  allowBackorder: false,
};

export const STOCK_SETTINGS_KEY = "stock" as const;

/**
 * Form-side schema = same shape; we extend later when more fields land
 * (e.g. defaultValuationMethod). Kept separate for forward compatibility.
 */
export const stockSettingsFormSchema = stockSettingsSchema;
export type StockSettingsFormValues = z.infer<typeof stockSettingsFormSchema>;

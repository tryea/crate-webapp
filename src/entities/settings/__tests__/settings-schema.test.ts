/**
 * @jest-environment node
 *
 * Phase 8 coverage — stock settings schema + defaults. The schema is the
 * fallback guard: getStockSettingsServer parses the JSONB row through it and
 * falls back to STOCK_SETTINGS_DEFAULTS on a bad/missing value, so the
 * boolean contract here is what keeps the backorder toggle safe.
 */
import {
  stockSettingsSchema,
  STOCK_SETTINGS_DEFAULTS,
  STOCK_SETTINGS_KEY,
} from "../model/settings-schema";

describe("stockSettingsSchema", () => {
  test("accepts a boolean allowBackorder", () => {
    expect(stockSettingsSchema.safeParse({ allowBackorder: true }).success).toBe(true);
    expect(stockSettingsSchema.safeParse({ allowBackorder: false }).success).toBe(true);
  });

  test("rejects a non-boolean (no coercion — string 'true' fails)", () => {
    expect(stockSettingsSchema.safeParse({ allowBackorder: "true" }).success).toBe(false);
    expect(stockSettingsSchema.safeParse({ allowBackorder: 1 }).success).toBe(false);
  });

  test("rejects a missing field", () => {
    expect(stockSettingsSchema.safeParse({}).success).toBe(false);
  });
});

describe("STOCK_SETTINGS_DEFAULTS", () => {
  test("defaults are safe (backorder OFF) and satisfy the schema", () => {
    expect(STOCK_SETTINGS_DEFAULTS.allowBackorder).toBe(false);
    expect(stockSettingsSchema.safeParse(STOCK_SETTINGS_DEFAULTS).success).toBe(true);
  });

  test("settings key is the 'stock' domain", () => {
    expect(STOCK_SETTINGS_KEY).toBe("stock");
  });
});

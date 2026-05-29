import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { settings } from "@/db/schema";
import {
  STOCK_SETTINGS_DEFAULTS,
  STOCK_SETTINGS_KEY,
  stockSettingsSchema,
  type StockSettings,
} from "../model/settings-schema";

/**
 * Read the stock-domain settings, falling back to defaults when the row
 * doesn't exist. Cheap one-row lookup; not a hot path so no caching.
 *
 * Defaults intentionally bake in the COUNCIL §0 standing rule: "Negative
 * stock is forbidden unless a setting explicitly allows backorder."
 * Until a row is explicitly inserted, allowBackorder is `false`.
 */
export async function getStockSettingsServer(): Promise<StockSettings> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.key, STOCK_SETTINGS_KEY))
    .limit(1);

  if (!row) return STOCK_SETTINGS_DEFAULTS;

  const parsed = stockSettingsSchema.safeParse(row.value);
  // Bad JSONB shape → silently fall back to defaults. If this ever fires
  // in production we want the safe path, not a 500.
  return parsed.success ? parsed.data : STOCK_SETTINGS_DEFAULTS;
}

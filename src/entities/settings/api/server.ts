import "server-only";
import { and, eq } from "drizzle-orm";
import { withCompanyReadContext } from "@/shared/lib/auth/company-context";
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
 *
 * THE COMPANY PREDICATE IS THE WHOLE OF THE LOOKUP NOW. Since ticket 1009 the
 * primary key of this table is `(company_id, key)`, so a company that has
 * never saved its settings owns no `stock` row and reads the defaults, and a
 * company that has saved them reads its own row rather than whichever one the
 * installation happened to hold. The defaults are the safe direction to fall
 * back to: they forbid backorder. Looking the key up alone would now return an
 * arbitrary company's switch, because more than one row may carry it.
 */
export async function getStockSettingsServer(): Promise<StockSettings> {
  const [row] = await withCompanyReadContext(
    async (tx, companyId) =>
      tx
        .select()
        .from(settings)
        .where(
          and(
            eq(settings.key, STOCK_SETTINGS_KEY),
            eq(settings.companyId, companyId),
          ),
        )
        .limit(1),
    "getStockSettingsServer",
  );

  if (!row) return STOCK_SETTINGS_DEFAULTS;

  const parsed = stockSettingsSchema.safeParse(row.value);
  // Bad JSONB shape → silently fall back to defaults. If this ever fires
  // in production we want the safe path, not a 500.
  return parsed.success ? parsed.data : STOCK_SETTINGS_DEFAULTS;
}

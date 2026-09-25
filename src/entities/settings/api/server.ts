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
 * THE COMPANY PREDICATE CHANGES WHAT "DOESN'T EXIST" MEANS HERE, and that is
 * the point. `key` is still the primary key of this table, so it holds one row
 * per config domain for the whole installation (see the note in
 * src/db/schema/settings.ts; the composite key is item 4 of
 * src/db/rls/TENANT-SEPARATION.md and its own piece of work). A company that
 * does not own the single `stock` row therefore reads no row and falls back to
 * the defaults, which is the safe direction: the fallback forbids backorder.
 * The alternative, looking up the key alone, would hand that company the other
 * one's switch.
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

import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { companyId } from "./companies";

/**
 * Settings: key/JSONB table for app-level config that operators can flip
 * at runtime without redeploy. One row per config domain:
 *  - "stock": { allowBackorder: boolean }
 *  - more in future iterations (valuation method, location defaults, …)
 *
 * Single-row-per-domain (not a `(domain, key)` two-level table) keeps the
 * reads cheap and the policy boundary obvious, admin updates the "stock"
 * row as a whole; no per-field GRANT churn.
 *
 * THE OWNER COLUMN HERE IS NOT YET THE WHOLE STORY. `key` is still the
 * primary key, so the table still holds one row per config domain for the
 * whole installation and a second company could not keep its own backorder
 * switch. Moving to a composite `(company_id, key)` key changes the only
 * reader as well (getStockSettingsServer looks up the key and nothing else)
 * and is its own piece of work in the FR-29 survey, §2 and item 4 of
 * src/db/rls/TENANT-SEPARATION.md. The column lands now so the row has an
 * owner to be filtered by when it does.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  ...companyId(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;

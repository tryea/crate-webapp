import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Settings — key/JSONB table for app-level config that operators can flip
 * at runtime without redeploy. One row per config domain:
 *  - "stock" — { allowBackorder: boolean }
 *  - more in future iterations (valuation method, location defaults, …)
 *
 * Single-row-per-domain (not a `(domain, key)` two-level table) keeps the
 * reads cheap and the policy boundary obvious — admin updates the "stock"
 * row as a whole; no per-field GRANT churn.
 */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;

import {
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { companyId } from "./companies";

/**
 * Settings: key/JSONB table for app-level config that operators can flip
 * at runtime without redeploy. One row per config domain PER COMPANY:
 *  - "stock": { allowBackorder: boolean }
 *  - more in future iterations (valuation method, location defaults, …)
 *
 * Single-row-per-domain (not a `(domain, key)` two-level table) keeps the
 * reads cheap and the policy boundary obvious, admin updates the "stock"
 * row as a whole; no per-field GRANT churn.
 *
 * THE PRIMARY KEY IS COMPOSITE, AND THAT IS THE WHOLE OF ITEM 4 (ticket 1009,
 * src/db/rls/TENANT-SEPARATION.md §2). `key` alone meant one row per config
 * domain for the whole installation: the backorder switch FR-04 is built on
 * was shared, and a second company saving it did not get a row of its own, it
 * overwrote the first company's value through the upsert's ON CONFLICT target
 * while still reading the defaults itself. `(company_id, key)` makes the row
 * the company's own, and it is also what the upsert now names as its conflict
 * target: a bare `settings.key` target no longer matches any unique index and
 * would fail the save outright rather than quietly writing to the wrong row.
 *
 * COLUMN ORDER IS THE INDEX ORDER. `company_id` leads so the primary key's
 * btree also serves "every setting this company owns", which is the shape
 * every reader here uses; a `(key, company_id)` key would serve "every
 * company that set this switch", which nothing asks for.
 */
export const settings = pgTable(
  "settings",
  {
    key: text("key").notNull(),
    ...companyId(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.companyId, table.key] })],
);

export type SettingsRow = typeof settings.$inferSelect;
export type NewSettingsRow = typeof settings.$inferInsert;

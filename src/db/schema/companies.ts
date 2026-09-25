import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { id, timestamps } from "./_shared";

/**
 * A company is the unit of ownership for every domain row (FR-29). The FR-29
 * survey (src/db/rls/TENANT-SEPARATION.md §1) left the choice between "company
 * with members" and "personal workspace per user" open; the ticket that opened
 * this file settled it on company, which is also the way the code already
 * leans: the role vocabulary is admin/manager/staff, job titles inside one
 * business, and the Users screen is an admin roster rather than an invite flow.
 *
 * There is no creation flow and no membership table yet, both are separate
 * work in the survey's list. Exactly one company exists, the installation that
 * is running today, and it is seeded by the migration that adds this table.
 */
export const companies = pgTable("companies", {
  id: id(),
  name: text("name").notNull(),
  ...timestamps(),
});

/**
 * The one company that exists today. A fixed id rather than a generated one
 * because two separate things have to name the same row without talking to
 * each other: the migration that inserts it, and the column default that every
 * domain table uses until writes learn to resolve a company of their own.
 */
export const SINGLE_COMPANY_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Owner column for a domain table. Reused via spread the same way `id()` and
 * `timestamps()` are.
 *
 * ON THE DEFAULT: it is scaffolding with a known removal date, not a resting
 * state. Nothing in the app can answer "which company is this write for" yet,
 * because a user has no membership to read it from (survey §1). Until write
 * binding lands, the default is what keeps every new row owned rather than
 * leaving the column nullable and the invariant unenforceable. The moment a
 * write path can name its own company, this default comes off and the column
 * stays NOT NULL.
 *
 * `restrict` on delete, not `cascade`: deleting a company should refuse while
 * it still owns stock, rather than quietly taking the ledger with it.
 */
export const companyId = () => ({
  companyId: uuid("company_id")
    .notNull()
    .default(SINGLE_COMPANY_ID)
    .references(() => companies.id, { onDelete: "restrict" }),
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;

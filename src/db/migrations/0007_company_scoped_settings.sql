-- FR-29, the last two shared things: `settings` becomes one row per company
-- instead of one row per installation, and the `company_id` DEFAULT comes off
-- all ten domain tables.
--
-- THIS MIGRATION CHANGES SHAPE, SO IT IS NOT THE "migrate first, it only adds"
-- kind. Two statements below are visible to code that is already running:
--
--   1. The primary key of `settings` moves from `key` to `(company_id, key)`.
--     Code up to ticket 1004 upserts settings with `ON CONFLICT (key)`, which
--     stops matching any unique index the moment the old key is dropped, so
--     saving settings fails until the new image is serving. The new image's
--     `ON CONFLICT (company_id, key)` fails the same way against the old key.
--     There is no ordering that keeps that one action working across the swap,
--     which is why the deploy order is: build the image to completion first,
--     then migrate, then swap immediately. Only the settings screen is in that
--     window, and it is seconds long.
--
--   2. The default comes off `company_id`. Every write path has named its own
--     company since ticket 1003, so nothing in the app relies on it any more;
--     an insert that omits the column now raises 23502 instead of quietly
--     stamping the row with the first company. Code OLDER than 1003 would
--     break here, which is the other half of "image first, then migrate".
--
-- ON THE HAND EDIT. drizzle-kit cannot name an existing primary key
-- constraint, so it emits the DROP commented out with instructions. The name
-- is `settings_pkey`: 0001_settings.sql creates the table with `"key" text
-- PRIMARY KEY`, and Postgres names an unnamed table constraint
-- `<table>_pkey`. It is spelled out rather than looked up on purpose, so a
-- database whose settings key is named something else stops here loudly
-- instead of ending up with two primary keys' worth of assumptions.
--
-- ORDER WITHIN THE FILE: the old key goes before the new one, because a table
-- may hold only one primary key. The whole file runs in one transaction
-- (drizzle's migrator), so `settings` is never visible without a key.
ALTER TABLE "settings" DROP CONSTRAINT "settings_pkey";--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_company_id_key_pk" PRIMARY KEY("company_id","key");--> statement-breakpoint
ALTER TABLE "categories" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "suppliers" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "locations" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "warehouses" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "stock_movements" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "po_lines" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "purchase_orders" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "company_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "settings" ALTER COLUMN "company_id" DROP DEFAULT;

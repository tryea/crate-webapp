-- FR-29: every domain table carries its owner, and the four global unique
-- indexes become unique per company instead of per installation.
--
-- ORDER MATTERS HERE, AND drizzle-kit DOES NOT GET IT RIGHT ON ITS OWN.
-- The generated trail adds each NOT NULL column with a default (which is the
-- backfill: Postgres writes the default into every existing row) and only
-- afterwards adds the foreign key. On a database that already holds rows, that
-- foreign key is validated against rows that already point at a company, so
-- the company has to exist BEFORE the first ALTER TABLE, not after. The INSERT
-- below is therefore hand-placed ahead of them, and it is the one edit to the
-- generated file.
--
-- ON THE FIXED ID: the same row has to be named by two things that cannot talk
-- to each other, this migration and the column default in
-- src/db/schema/companies.ts. A generated uuid would leave the default
-- pointing at nothing. The id is spelled out in both places and the test
-- src/db/__tests__/tenant-ownership.test.ts fails if they ever drift apart.
--
-- ON THE NAME: no screen shows it and no flow sets it, because company
-- creation does not exist yet (FR-29 survey, item 6). It is a placeholder an
-- operator renames with one UPDATE, not a decision.
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The one company that exists today. Every row already in this database
-- belongs to it, because the app has never had a second one: seed.ts builds a
-- single dataset (src/db/seed.ts) and nothing can create a company.
INSERT INTO "companies" ("id", "name")
VALUES ('00000000-0000-4000-8000-000000000001', 'Default company')
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
DROP INDEX "categories_slug_idx";--> statement-breakpoint
DROP INDEX "warehouses_code_idx";--> statement-breakpoint
DROP INDEX "products_sku_idx";--> statement-breakpoint
DROP INDEX "po_number_idx";--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "locations" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "warehouses" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "po_lines" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "settings" ADD COLUMN "company_id" uuid DEFAULT '00000000-0000-4000-8000-000000000001' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_lines" ADD CONSTRAINT "po_lines_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settings" ADD CONSTRAINT "settings_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categories_slug_idx" ON "categories" USING btree ("company_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_code_idx" ON "warehouses" USING btree ("company_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "products_sku_idx" ON "products" USING btree ("company_id","sku");--> statement-breakpoint
CREATE UNIQUE INDEX "po_number_idx" ON "purchase_orders" USING btree ("company_id","po_number");
--> statement-breakpoint
-- Table privileges for the runtime role on the new table, for the reason
-- 0004_waitlist_grants.sql spells out at length: `GRANT ... ON ALL TABLES` was
-- a one-shot over the tables that existed at that moment, so every table added
-- after it starts with no privileges for `app_user` and the app meets
-- "permission denied" at runtime. SELECT only: nothing in the app writes a
-- company yet, and a grant is easier to widen later than to take back.
--
-- The role check is the same guard and the same reason: `app_user` is created
-- outside this repo, so the CI Postgres service and scripts/e2e-db.sh both run
-- databases where it is absent, and an unguarded GRANT would take the whole
-- migration step down there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT ON TABLE public.companies TO app_user';
  ELSE
    RAISE NOTICE 'role app_user is absent, so companies grants were skipped';
  END IF;
END
$$;

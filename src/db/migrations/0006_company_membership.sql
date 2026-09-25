-- FR-29: a person belongs to a company, and everyone who already had an
-- account belongs to the one company that exists.
--
-- WHAT THIS UNBLOCKS. 0005 gave all ten domain tables a `company_id`, but it
-- filled the column from a DEFAULT, because nothing in the app could answer
-- "which company is this write for": a user had no company to be read from.
-- This table is that answer. Until it exists, a second company cannot be told
-- apart from the first, because no account belongs to either one.
--
-- THE BACKFILL IS THE HALF THAT CANNOT BE REDONE LATER. Every account in this
-- database predates the idea of membership, so there is exactly one company it
-- can mean, the one 0005 inserted. Running this on a database that has grown a
-- second company would put every existing account in the first one, which is
-- why the INSERT names its company literally rather than picking one: on the
-- single-company database this is written for, the literal and the choice are
-- the same row, and on any other database the FK is what says so out loud.
--
-- The id is spelled out here and in SINGLE_COMPANY_ID
-- (src/db/schema/companies.ts) for the reason 0005 gives at length: the
-- migration and the column default have to name the same row without being
-- able to talk to each other.
CREATE TABLE "company_members" (
	"company_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_members_company_id_user_id_pk" PRIMARY KEY("company_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- One company per person, enforced rather than assumed. A session carries who
-- is asking and nothing else, so a second membership would leave
-- `resolveCompanyId` (src/shared/lib/auth/company-context.ts) picking one
-- silently. See the comment on `companyMembers` in src/db/schema/companies.ts
-- for what comes off the day a person may belong to two.
CREATE UNIQUE INDEX "company_members_user_id_idx" ON "company_members" USING btree ("user_id");--> statement-breakpoint
-- Every account that exists today joins the one company that exists today.
-- ON CONFLICT DO NOTHING so a re-run over a partially applied trail is a
-- no-op rather than a unique violation.
INSERT INTO "company_members" ("company_id", "user_id")
SELECT '00000000-0000-4000-8000-000000000001', "id" FROM "user"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Table privileges for the runtime role, for the reason 0004_waitlist_grants
-- spells out: `GRANT ... ON ALL TABLES` was a one-shot over the tables that
-- existed at that moment, so a table added later starts with no privileges for
-- `app_user` and the app meets "permission denied" at runtime. The role check
-- is the same guard for the same reason: `app_user` is created outside this
-- repo, so the CI Postgres service and scripts/e2e-db.sh run databases where
-- it is absent.
--
-- SELECT, INSERT and TRUNCATE, and nothing else. SELECT is the runtime verb,
-- the only read is `resolveCompanyId`. INSERT and TRUNCATE are there for
-- `bun run db:seed`, which connects as `app_user` (src/db/rls/README.md, the
-- two-role table) and rebuilds the demo dataset from scratch. No UPDATE and no
-- DELETE: nothing in the app moves a person between companies, and a grant is
-- easier to widen later than to take back.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT, TRUNCATE ON TABLE public.company_members TO app_user';
  ELSE
    RAISE NOTICE 'role app_user is absent, so company_members grants were skipped';
  END IF;
END
$$;

-- Table privileges for the runtime role on waitlist_signup (FR-32).
--
-- WHY THIS EXISTS
-- ---------------
-- 0003 created the table as the migration role (a superuser), so the table
-- landed owned by that role with no privileges for anyone else. The app does
-- not connect as that role: per src/db/rls/README.md the runtime connection is
-- `app_user`, which is exactly the role that must not be a superuser. The
-- result was a public route that parsed, validated and then died on
-- `permission denied for table waitlist_signup`, surfacing as the handler's
-- 500 branch in src/app/api/waitlist/route.ts.
--
-- The older tables escaped this because the role was granted its privileges
-- once, out of band, before waitlist_signup existed. `GRANT ... ON ALL TABLES`
-- is a one-shot over the tables that exist at that moment, not a standing rule
-- for tables added later, so every future table would repeat this bug. Fixing
-- it by hand on the server would not survive the next database rebuild, which
-- is why the grant belongs in the migration trail.
--
-- WHY A MIGRATION AND NOT src/db/rls/
-- -----------------------------------
-- src/db/apply-rls.ts replays its whole directory on every run and its files
-- carry CREATE POLICY, which errors on a policy that already exists. On a
-- database that has been through `db:rls` once, the run therefore stops at
-- 0002 and never reaches a later file. A grant parked there would only ever
-- land on freshly built databases, never on the one already serving. The
-- drizzle ledger has the property this needs: applied exactly once, in order,
-- on new and existing databases alike.
--
-- WHY THE ROLE CHECK
-- ------------------
-- `app_user` is created outside this repo (README: "app_user must already
-- exist"), so a database can legitimately exist without it: the CI Postgres
-- service ships only `postgres`, and scripts/e2e-db.sh builds its throwaway
-- database around its own role. An unguarded GRANT would fail there and take
-- the migration step down with it. Where the role is absent there is nobody to
-- grant to, and saying so out loud is better than a silent skip.
--
-- SELECT and INSERT, and nothing else: they are the two verbs
-- src/entities/waitlist/api/server.ts uses (addToWaitlist inserts with ON
-- CONFLICT DO NOTHING, listWaitlistSignups reads the list back). No UPDATE and
-- no DELETE, because an address on a waitlist is never edited in place.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    EXECUTE 'GRANT SELECT, INSERT ON TABLE public.waitlist_signup TO app_user';
  ELSE
    RAISE NOTICE 'role app_user is absent, so waitlist_signup grants were skipped';
  END IF;
END
$$;

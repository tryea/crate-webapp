-- Enable RLS on sensitive tables + force it so even table-owners must
-- have a passing policy. Apply after `drizzle-kit migrate` has created
-- the tables (i.e. run by `bun run db:rls`).

-- Audit log: read by manager+, write by anyone (server controls who can
-- call the action; policy is the belt-and-suspenders).
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- Identity tables (BetterAuth), restrict in Phase 8 once per-request
-- user binding ships; for now RLS is enabled w/ permissive policies
-- so app_user can still operate.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" FORCE ROW LEVEL SECURITY;

ALTER TABLE session ENABLE ROW LEVEL SECURITY;
ALTER TABLE session FORCE ROW LEVEL SECURITY;

ALTER TABLE account ENABLE ROW LEVEL SECURITY;
ALTER TABLE account FORCE ROW LEVEL SECURITY;

ALTER TABLE verification ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification FORCE ROW LEVEL SECURITY;

-- Stock movements: append-only is enforced at app layer + CHECK
-- constraints. RLS adds: deny UPDATE/DELETE for app_user regardless of
-- code path (only superuser migrations can rewrite history).
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements FORCE ROW LEVEL SECURITY;

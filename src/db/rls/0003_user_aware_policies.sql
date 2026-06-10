-- Issue #2 — replace permissive `_rw_all` identity policies with
-- user-aware versions, per docs/setup/02-docker-postgres-rls.md §"Per-request
-- user binding".
--
-- ===== The binding model: RESTRICT-WHEN-BOUND ============================
--
-- BetterAuth runs on the SAME app_user connection as the app but NEVER sets
-- app.current_user_id (sign-in must read "user" before any identity is
-- known). Two query classes therefore exist:
--
--   UNBOUND (GUC unset) → BetterAuth internals + server-component reads.
--                         Policies allow these (status quo) so auth flows
--                         keep working.
--   BOUND   (GUC set via withUserContext) → all mutation Server Actions.
--                         Policies restrict these: identity SELECTs return
--                         only the bound user's rows (admin sees all);
--                         identity WRITES are denied outright.
--
-- The hard invariant this buys: a transaction bound as staff/manager cannot
-- read another user's session NOR escalate "user".role — even via SQL
-- injection inside a bound action. Verified manually:
--
--   psql "$DATABASE_URL"   -- as app_user
--   SELECT set_config('app.current_user_id', '<staff-id>', false);
--   SELECT set_config('app.current_user_role', 'staff', false);
--   SELECT * FROM session WHERE user_id <> '<staff-id>';  -- 0 rows
--   UPDATE "user" SET role = 'admin' WHERE id = '<staff-id>';  -- 0 rows updated
--
-- audit_log + stock_movements policies are NOT touched (read-by-all is
-- intentional per the RBAC matrix; append-only already enforced by 0002).

-- Helper predicates, inlined into every policy (Postgres has no CREATE
-- MACRO; keep the expressions textually identical for auditability):
--   unbound:  current_setting('app.current_user_id', true) IS NULL
--             OR current_setting('app.current_user_id', true) = ''
--   is_admin: current_setting('app.current_user_role', true) = 'admin'

-- ===== "user" ============================================================
DROP POLICY IF EXISTS user_rw_all ON "user";

CREATE POLICY user_select_bound_own ON "user"
  FOR SELECT TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_user_role', true) = 'admin'
  );

-- Writes: only unbound (BetterAuth sign-up/update) or bound-admin.
CREATE POLICY user_insert_unbound_or_admin ON "user"
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY user_update_unbound_or_admin ON "user"
  FOR UPDATE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY user_delete_unbound_or_admin ON "user"
  FOR DELETE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

-- ===== session ===========================================================
DROP POLICY IF EXISTS session_rw_all ON session;

CREATE POLICY session_select_bound_own ON session
  FOR SELECT TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY session_insert_unbound_or_admin ON session
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY session_update_unbound_or_admin ON session
  FOR UPDATE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY session_delete_unbound_or_admin ON session
  FOR DELETE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

-- ===== account (holds password hashes — most sensitive) =================
DROP POLICY IF EXISTS account_rw_all ON account;

CREATE POLICY account_select_bound_own ON account
  FOR SELECT TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR user_id = current_setting('app.current_user_id', true)
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY account_insert_unbound_or_admin ON account
  FOR INSERT TO app_user
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY account_update_unbound_or_admin ON account
  FOR UPDATE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

CREATE POLICY account_delete_unbound_or_admin ON account
  FOR DELETE TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

-- ===== verification ======================================================
-- No user column (identifier/value rows for email flows). BetterAuth needs
-- full access pre-identity, but a BOUND transaction has no business reading
-- pending verification tokens — deny everything when bound (non-admin).
DROP POLICY IF EXISTS verification_rw_all ON verification;

CREATE POLICY verification_all_unbound_or_admin ON verification
  FOR ALL TO app_user
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR current_setting('app.current_user_role', true) = 'admin'
  );

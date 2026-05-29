-- Baseline policies: permissive read + write for app_user across the
-- enabled tables, EXCEPT stock_movements which is INSERT+SELECT only
-- (no UPDATE, no DELETE — append-only enforced at SQL).
--
-- Phase 8 will tighten these into per-user-role policies once
-- per-request app.current_user_id binding is wired into the DB client.

-- ===== audit_log ========================================================
CREATE POLICY audit_log_select_all ON audit_log
  FOR SELECT TO app_user USING (true);

CREATE POLICY audit_log_insert_all ON audit_log
  FOR INSERT TO app_user WITH CHECK (true);

-- Mutations forbidden via RLS even though server actions never run them.
-- (No UPDATE or DELETE policy → all such attempts fail under FORCE RLS.)

-- ===== stock_movements: APPEND-ONLY at the database layer ===============
CREATE POLICY stock_movements_select_all ON stock_movements
  FOR SELECT TO app_user USING (true);

CREATE POLICY stock_movements_insert_all ON stock_movements
  FOR INSERT TO app_user WITH CHECK (true);

-- No UPDATE / DELETE policy on purpose. Combined with FORCE RLS, the
-- ledger is now append-only at the database layer, not just app layer.

-- ===== identity tables (permissive until Phase 8) =======================
CREATE POLICY user_rw_all ON "user"
  FOR ALL TO app_user USING (true) WITH CHECK (true);

CREATE POLICY session_rw_all ON session
  FOR ALL TO app_user USING (true) WITH CHECK (true);

CREATE POLICY account_rw_all ON account
  FOR ALL TO app_user USING (true) WITH CHECK (true);

CREATE POLICY verification_rw_all ON verification
  FOR ALL TO app_user USING (true) WITH CHECK (true);

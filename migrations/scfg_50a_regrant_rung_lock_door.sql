-- scfg_50a_regrant_rung_lock_door.sql
-- ============================================================================
-- Fix-up to scfg_50 (applied to the DB under its original name scfg_40, renamed on disk to avoid colliding with aidream's scfg_40a-40d convergence records): its GRANT on platform.knob_rung_lock_set ran BEFORE the
-- platform.client_callable_door registration in the same migration, so the
-- DDL guard revoked it (ddl_guard_log #3939, rule definer_client_grant_revoked
-- — the guard working exactly as documented in db-rules §6d-4). The door row
-- exists; this re-issues the grant, which now sticks
-- (proacl: authenticated=X/postgres, verified live 2026-08-29).
-- ============================================================================
grant execute on function platform.knob_rung_lock_set(text, text, uuid, text[], text)
  to authenticated;

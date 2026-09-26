--
-- ops_check_run_and_item_2026_09_26b_run_access.sql
--
-- Regenerate ops.check_run alone (the policy-lock window is this one call to COMMIT). Its registry
-- row was set by ops_check_run_and_item_2026_09_26.sql: confidential, suppress_platform_admin_lane,
-- client_read_only — so the generator emits admin-only reads and SELECT-only client grants and
-- ASSERTS no client mutation privilege remains. Design: common-docs/projects/checks-run-in-the-app/
-- P2-STORAGE-DESIGN.md §3 + §7.
select iam.apply_rls('ops', 'check_run', 'ops_check_run', 'system');

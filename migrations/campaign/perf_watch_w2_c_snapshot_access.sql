--
-- perf_watch_w2_c_snapshot_access.sql
--
-- Regenerate ops.perf_statement_snapshot alone (the policy-lock window is this one call to
-- COMMIT). Its registry row was set by perf_watch_w2_b_statement_snapshot.sql:
-- suppress_platform_admin_lane, client_read_only — so the generator emits admin-only reads and
-- SELECT-only client grants and ASSERTS no client mutation privilege remains.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §2, §3.
-- Inverse: migrations/inverse/perf_watch_w2_c_snapshot_access_down.sql.
select iam.apply_rls('ops', 'perf_statement_snapshot', 'ops_perf_statement_snapshot', 'system');

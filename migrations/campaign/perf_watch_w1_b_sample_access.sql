--
-- perf_watch_w1_b_sample_access.sql
--
-- Regenerate ops.perf_sample alone (the policy-lock window is this one call to COMMIT). Its
-- registry row was set by perf_watch_w1_a_catalog_and_sample.sql: confidential,
-- suppress_platform_admin_lane, client_read_only — so the generator emits admin-only reads and
-- SELECT-only client grants and ASSERTS no client mutation privilege remains.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §3.
-- Inverse: migrations/inverse/perf_watch_w1_b_sample_access_down.sql.
select iam.apply_rls('ops', 'perf_sample', 'ops_perf_sample', 'system');

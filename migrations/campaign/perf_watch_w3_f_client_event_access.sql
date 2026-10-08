--
-- perf_watch_w3_f_client_event_access.sql
--
-- Regenerate ops.perf_client_event alone (the policy-lock window is this one call to COMMIT). Its
-- registry row was set by perf_watch_w3_e_client_event.sql: suppress_platform_admin_lane,
-- client_read_only — so the generator emits admin-only reads and SELECT-only client grants and
-- ASSERTS no client mutation privilege remains.
-- Design: common-docs/systems/architecture/observability/performance-watch/PLAN.md §2, §3.
-- Inverse: migrations/inverse/perf_watch_w3_f_client_event_access_down.sql.
select iam.apply_rls('ops', 'perf_client_event', 'ops_perf_client_event', 'system');

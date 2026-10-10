-- chair-step: inverse of perf_watch2_pages_a_page_probe_and_bundle.sql — drops the three page-probe functions and their door rows, deletes the five perf.page_probe_* knobs, and soft-deletes the pageprobe:* watches (their samples stay as history).
set local lock_timeout = '3s';
update ops.proof_check set deleted_at = now() where kind = 'perf' and slug like 'pageprobe:%' and deleted_at is null;
delete from platform.client_callable_door where schema_name = 'ops' and function_name in ('perf_page_probe_settings', 'perf_page_probe_report', 'perf_page_bundle_report');
drop function if exists ops.perf_page_bundle_report(jsonb);
drop function if exists ops.perf_page_probe_report(jsonb);
drop function if exists ops.perf_page_probe_settings();
delete from platform.feature_knob where feature = 'perf' and key like 'page\_probe\_%';

-- chair-step: inverse of perf_watch_w3_g_vitals_and_cli.sql — unschedules perf-watch-vitals, drops the four wave-3 functions and their door rows, and soft-deletes the vital and page watches (their samples stay as history).
set local lock_timeout = '3s';
select cron.unschedule('perf-watch-vitals') where exists (select 1 from cron.job where jobname = 'perf-watch-vitals');
delete from platform.client_callable_door where schema_name = 'ops'
   and function_name in ('perf_client_report', 'perf_vital_rollup', 'perf_cli_ingest', 'perf_route_template');
drop function if exists ops.perf_client_report(jsonb);
drop function if exists ops.perf_vital_rollup();
drop function if exists ops.perf_cli_ingest(jsonb);
drop function if exists ops.perf_route_template(text);
update ops.proof_check set is_active = false, deleted_at = now() where kind = 'perf' and perf_kind in ('vital', 'page') and deleted_at is null;

-- chair-step: inverse of perf_watch_w2_d_functions.sql — drops ops.perf_statement_collect, ops.perf_health_run and the admin edit door ops.perf_watch_update, their client_callable_door rows, the four wave-2 perf knobs and the ops_perf_statement_snapshot retention row. Apply perf_watch_w2_e_seed_and_cron_down.sql first (its cron jobs call these functions).
--
-- WHAT IT DOES NOT UNDO: edits people made through the door stay on the watches (budget, pause,
-- pinned baseline, metadata.perf_edits); alert rows already written stay.
drop function if exists ops.perf_statement_collect();
drop function if exists ops.perf_health_run();
drop function if exists ops.perf_watch_update(uuid, numeric, boolean, numeric, boolean);
delete from platform.client_callable_door
 where schema_name = 'ops' and function_name in ('perf_statement_collect', 'perf_health_run', 'perf_watch_update');
delete from platform.feature_knob
 where feature = 'perf' and key in ('statement_top_n', 'statement_cadence_minutes', 'statement_snapshot_retention_days', 'stale_after_cadences');
delete from platform.retention_policy where entity_token = 'ops_perf_statement_snapshot';
notify pgrst, 'reload schema';

-- chair-step: inverse of perf_watch_w1_c_functions.sql — drops the ops.perf_* functions, their client_callable_door rows, the perf knobs, the platform.perf.watch_alert event type and the ops_perf_sample retention row. Apply perf_watch_w1_d_seed_and_cron_down.sql first (the cron jobs call these functions).
--
-- WHAT IT DOES NOT UNDO: alert rows already written to ops.system_error and bells already queued
-- in communication.notification stay; they are history of what happened.
drop function if exists ops.perf_probe_run(uuid);
drop function if exists ops.perf_sample_retention();
drop function if exists ops.perf_record_sample(uuid, text, jsonb, boolean);
drop function if exists ops.perf_alert(jsonb);
drop function if exists ops.perf_watch_declare(text, text, text, jsonb, numeric, text, integer, text, text);
drop function if exists ops.perf_judge(uuid);
drop function if exists ops.perf_knobs();
drop function if exists ops.perf_door_sql(jsonb);
drop function if exists ops.perf_judge_rule(jsonb, jsonb, jsonb, timestamptz);
delete from platform.client_callable_door
 where schema_name = 'ops' and function_name in ('perf_probe_run', 'perf_sample_retention', 'perf_record_sample', 'perf_alert',
                                                 'perf_watch_declare', 'perf_judge', 'perf_knobs', 'perf_door_sql', 'perf_judge_rule');
delete from platform.feature_knob where feature = 'perf';
delete from communication.notification_event_type where event_key = 'platform.perf.watch_alert';
delete from platform.retention_policy where entity_token = 'ops_perf_sample';
notify pgrst, 'reload schema';

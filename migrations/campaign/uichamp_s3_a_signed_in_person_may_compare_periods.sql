-- chair-step: it (re)opens the signed-in lane on the two door rows S3 re-created and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated`
--   that those `platform.client_callable_door` rows declare, for
--   `custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)` and
--   `custom.dashboard_run(uuid, uuid, jsonb, jsonb, text)`. A dropped function takes its grants
--   with it and the ddl guard takes a new definer's client EXECUTE back at birth, so without this
--   file every signed-in chart and dashboard is refused ("permission denied"). A GRANT is the one
--   shape the production allow-list refuses by name, so it comes through this route (the same
--   route as gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql). Nothing is
--   replaced, dropped or revoked; `anon` gains nothing. Apply IMMEDIATELY AFTER
--   uichamp_s3_a_number_knows_last_month_and_its_target.sql, in the same window. The inverse is
--   `migrations/inverse/uichamp_s3_a_signed_in_person_may_compare_periods_down.sql`.
-- lane: S3
-- lock: custom,platform

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('record_aggregate', 'dashboard_run')
   and identity_argtypes in (
     platform.door_argtypes((select proargtypes from pg_catalog.pg_proc
                              where oid = 'custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb)'::regprocedure)),
     platform.door_argtypes((select proargtypes from pg_catalog.pg_proc
                              where oid = 'custom.dashboard_run(uuid, uuid, jsonb, jsonb, text)'::regprocedure)));

select custom.reopen_declared_doors();

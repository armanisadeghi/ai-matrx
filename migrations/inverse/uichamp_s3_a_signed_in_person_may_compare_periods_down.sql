-- chair-step: the inverse of uichamp_s3_a_signed_in_person_may_compare_periods.sql. It REVOKES
--   EXECUTE on the widened custom.record_aggregate(…, jsonb) and custom.dashboard_run(…, jsonb,
--   text) from authenticated. What it undoes: a signed-in person's charts and dashboards are
--   refused ("permission denied") until the up file's own inverse puts the older doors back. The
--   door rows stay (they belong to the up file); their signed-in lane is CLOSED first, with its
--   reason, because the declared-doors sweep would otherwise put the grant straight back. Run
--   this BEFORE uichamp_s3_a_number_knows_last_month_and_its_target_down.sql, which re-opens the
--   rows for the older identities.
-- lane: S3
-- lock: custom,platform

set local lock_timeout = '2s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by uichamp_s3_a_signed_in_person_may_compare_periods_down.sql: the signed-in grant on the S3 identity was taken back'
 where schema_name = 'custom' and function_name in ('record_aggregate', 'dashboard_run');

revoke execute on function custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) from authenticated;
revoke execute on function custom.dashboard_run(uuid, uuid, jsonb, jsonb, text) from authenticated;

-- chair-step: it (re)opens the signed-in lane on S4's two door rows and runs
--   `select custom.reopen_declared_doors()`, which ISSUES the EXECUTE grant to `authenticated`
--   that S4's two `platform.client_callable_door` rows declare, for
--   `custom.pipeline_move_many(uuid, jsonb)` and `custom.work_decide_many(uuid, jsonb)`. A GRANT
--   is the one shape the production allow-list refuses by name, so it comes through this route
--   (the precedent is gridprim_a_signed_in_person_may_count_rows_and_read_headers.sql). Nothing
--   is replaced, dropped or revoked; `anon` gains nothing. Apply AFTER
--   uichamp_s4_a_selection_moves_and_decides_in_one_call.sql. The inverse is
--   `migrations/inverse/uichamp_s4_a_signed_in_person_may_move_and_decide_many_down.sql`.
-- lane: S4
-- lock: custom,platform
--
-- LANE S4, THE GRANT. The ddl guard takes a new definer's client EXECUTE back at birth
-- ("definer_client_grant_revoked"), so without this file a real signed-in connection gets
-- "permission denied for function pipeline_move_many" while a psql suite that re-opens the
-- declared doors inside its own transaction passes. The S4 seat suite judges the grant BEFORE
-- any fixture for that reason.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name in ('pipeline_move_many', 'work_decide_many')
   and declared_by = 'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql';

select custom.reopen_declared_doors();

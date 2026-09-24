-- lock: custom,platform
-- lane: S4
-- chair-step: the inverse of uichamp_s4_a_signed_in_person_may_move_and_decide_many.sql.
-- It REVOKES EXECUTE on custom.pipeline_move_many(uuid, jsonb) and custom.work_decide_many(uuid, jsonb)
-- from authenticated. What it undoes: a signed-in person's batch move and batch decide are refused
-- again ("permission denied"). The door rows stay (they belong to S4's own file) but their
-- signed-in lane is CLOSED first, with its reason — otherwise the declared-doors sweep puts the
-- grant straight back in the same statement.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by uichamp_s4_a_signed_in_person_may_move_and_decide_many_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name in ('pipeline_move_many', 'work_decide_many')
   and declared_by = 'uichamp_s4_a_selection_moves_and_decides_in_one_call.sql';

revoke execute on function custom.pipeline_move_many(uuid, jsonb) from authenticated;
revoke execute on function custom.work_decide_many(uuid, jsonb) from authenticated;

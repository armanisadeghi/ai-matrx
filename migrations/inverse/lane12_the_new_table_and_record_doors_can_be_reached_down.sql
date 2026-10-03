-- chair-step: the inverse of lane12_the_new_table_and_record_doors_can_be_reached.sql. It REVOKEs EXECUTE on the three lane-12 doors from `authenticated` and closes their platform.client_callable_door rows to the signed-in lane. No DROP, no data movement; every other grant is untouched.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom

set local lock_timeout = '2s';

update platform.client_callable_door
   set signed_in_callers = false, non_client_lane = 'closed by lane12_the_new_table_and_record_doors_can_be_reached_down.sql'
 where (schema_name, function_name) in (('custom', 'table_find'), ('custom', 'table_ensure'), ('custom', 'record_upsert'));

revoke execute on function custom.table_find(uuid, text, text, text) from authenticated;
revoke execute on function custom.table_ensure(uuid, jsonb) from authenticated;
revoke execute on function custom.record_upsert(uuid, uuid, text[], jsonb, integer) from authenticated;

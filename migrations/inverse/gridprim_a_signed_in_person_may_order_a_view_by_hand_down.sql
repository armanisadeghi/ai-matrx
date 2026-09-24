-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_signed_in_person_may_order_a_view_by_hand.sql.
-- It REVOKES EXECUTE on custom.view_record_order_set and custom.read_records_in_view_order
-- from authenticated. What it undoes: a signed-in person's hand-set view order is
-- refused again ("permission denied"). The door rows stay (they belong to G13's own file) but
-- their signed-in lane is CLOSED first, with its reason — otherwise the declared-doors sweep
-- puts the grant straight back in the same statement.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'closed by gridprim_a_signed_in_person_may_order_a_view_by_hand_down.sql: the signed-in grant was taken back'
 where schema_name = 'custom' and function_name in ('view_record_order_set', 'read_records_in_view_order')
   and declared_by = 'gridprim_a_view_keeps_the_order_a_person_dragged.sql';

revoke execute on function custom.view_record_order_set(uuid, uuid, uuid[]) from authenticated;
revoke execute on function custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer) from authenticated;

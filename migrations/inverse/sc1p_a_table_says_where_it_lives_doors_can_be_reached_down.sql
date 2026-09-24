-- chair-step: this REVOKEs EXECUTE on custom.table_home(uuid, uuid) and custom.table_move(uuid, uuid, integer) from `authenticated`, which is exactly what sc1p_a_table_says_where_it_lives_doors_can_be_reached.sql granted and nothing more. The functions stay; no client can call them, and the object pages show the organization from custom.where_id_opens alone, with no move control.
-- lane: SC-1
--
-- The door register hands a declared signed-in door its grant straight back
-- (platform.reopen_declared_doors), so the two rows are closed first, with the reason, and then
-- the grant is taken back.

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by sc1p_a_table_says_where_it_lives_doors_can_be_reached_down.sql: moving a table between organizations is switched off; re-apply sc1p_a_table_says_where_it_lives_doors_can_be_reached.sql to reopen it.'
 where (schema_name, function_name) in (('custom', 'table_home'), ('custom', 'table_move'));

revoke execute on function custom.table_home(uuid, uuid) from authenticated;
revoke execute on function custom.table_move(uuid, uuid, integer) from authenticated;

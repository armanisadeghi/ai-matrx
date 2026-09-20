-- inverse of writeperf_the_page_decision_is_declared_then_granted.sql
-- WHAT IT DOES NOT UNDO: nothing. Taking the door rows out is itself what takes the grant away,
-- because schema custom sweeps a client grant with no door row behind it — which puts
-- custom.entity_records_find back to dying on `permission denied for function page_size` for
-- every signed-in caller.
revoke execute on function custom.page_ceiling(uuid) from authenticated;
revoke execute on function custom.export_ceiling(uuid) from authenticated;
revoke execute on function custom.page_size(uuid, text, integer, integer, integer) from authenticated;
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('page_ceiling', 'export_ceiling', 'page_size');

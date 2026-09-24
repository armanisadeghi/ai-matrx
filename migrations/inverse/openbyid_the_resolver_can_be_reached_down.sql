-- chair-step: this REVOKEs EXECUTE on platform.resolve_id(uuid, text) and custom.where_id_opens(uuid) from `authenticated`, which is exactly what openbyid_the_resolver_can_be_reached.sql granted and nothing more. The functions stay; no client can call them, and /o/<id> says its door did not answer.
-- lane: ROUTE-RESOLVER
--
-- The door register hands a declared signed-in door its grant straight back
-- (platform.reopen_declared_doors), so the two rows are closed first, with the reason, and then
-- the grant is taken back.

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by openbyid_the_resolver_can_be_reached_down.sql: the /o/<id> address is switched off; re-apply openbyid_the_resolver_can_be_reached.sql to reopen it.'
 where (schema_name, function_name) in (('platform', 'resolve_id'), ('custom', 'where_id_opens'));

revoke execute on function platform.resolve_id(uuid, text) from authenticated;
revoke execute on function custom.where_id_opens(uuid) from authenticated;

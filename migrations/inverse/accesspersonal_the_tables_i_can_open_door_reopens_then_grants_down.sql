-- chair-step: this REVOKEs EXECUTE on custom.tables_i_can_open() from `authenticated`, which is exactly what accesspersonal_the_tables_i_can_open_door_reopens_then_grants.sql granted and nothing more. The function stays; no client can call it, and the Data hub's "All my organizations" says it could not be read.
-- lane: ACCESS-IS-PERSONAL (successor lane ACTIVE-ORG-PAGES)
--
-- The door register hands a declared signed-in door its grant straight back
-- (platform.reopen_declared_doors), so the row is closed first, with the reason, and then the
-- grant is taken back.

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by accesspersonal_the_tables_i_can_open_door_reopens_then_grants_down.sql: the Data hub''s "All my organizations" list is switched off; re-apply accesspersonal_the_tables_i_can_open_door_reopens_then_grants.sql to reopen it.'
 where schema_name = 'custom' and function_name = 'tables_i_can_open';

revoke execute on function custom.tables_i_can_open() from authenticated;

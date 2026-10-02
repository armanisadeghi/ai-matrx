-- chair-step: this REVOKEs EXECUTE on custom.table_duplicate(uuid, boolean, text, uuid) from `authenticated`, closes its platform.client_callable_door row and DROPs the four functions tableactions_a_table_can_be_duplicated.sql added (custom.table_duplicate, custom._uuid_remap, custom._copied_metadata, custom._without_rows_of). The schema-wide door-reopen sweep is held off for this transaction only, as in the up file: nothing it would do concerns these functions. Nothing else existed before that file, so nothing else is put back. Copies already made stay: they are ordinary Tables.
-- lane: TABLE-ACTIONS
--
-- The door register hands a declared signed-in door its grant straight back
-- (platform.reopen_declared_doors), so the row is closed first, with the reason, then the grant
-- is taken back and the functions are dropped; the row is then removed, because the function
-- it describes no longer exists.

select set_config('platform.closed_schema_sweep', '1', true);

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'Closed by tableactions_a_table_can_be_duplicated_down.sql: duplicating a table is switched off; re-apply tableactions_a_table_can_be_duplicated.sql to reopen it.'
 where schema_name = 'custom' and function_name = 'table_duplicate';

revoke execute on function custom.table_duplicate(uuid, boolean, text, uuid) from authenticated;

drop function if exists custom.table_duplicate(uuid, boolean, text, uuid);
drop function if exists custom._uuid_remap(jsonb, jsonb);
drop function if exists custom._copied_metadata(jsonb);
drop function if exists custom._without_rows_of(jsonb, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_duplicate'
   and declared_by = 'tableactions_a_table_can_be_duplicated.sql';

select set_config('platform.closed_schema_sweep', '0', true);

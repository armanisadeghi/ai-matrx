-- chair-step: this REVOKEs EXECUTE on custom.table_duplicate(uuid, boolean, text, uuid) and custom.table_duplicate_continue(uuid) from `authenticated`, closes their two platform.client_callable_door rows and DROPs the seven functions tableactions_a_table_can_be_duplicated.sql added (custom.table_duplicate, custom.table_duplicate_continue, custom._table_duplicate_step, custom._duplicate_id, custom._uuid_remap, custom._copied_metadata, custom._without_rows_of). A copy left half-made stays as it is: a kept table (kept_for copying) a person can archive. The schema-wide door-reopen sweep is held off for this transaction only, as in the up file: nothing it would do concerns these functions. Nothing else existed before that file, so nothing else is put back. Copies already made stay: they are ordinary Tables.
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
 where schema_name = 'custom' and function_name in ('table_duplicate', 'table_duplicate_continue');

-- Each revoke only where the function exists, so the inverse also runs over an earlier shape of
-- this file (a clone that holds the first, unpaged door).
do $do$
begin
  if to_regprocedure('custom.table_duplicate(uuid, boolean, text, uuid)') is not null then
    revoke execute on function custom.table_duplicate(uuid, boolean, text, uuid) from authenticated;
  end if;
  if to_regprocedure('custom.table_duplicate_continue(uuid)') is not null then
    revoke execute on function custom.table_duplicate_continue(uuid) from authenticated;
  end if;
end
$do$;

drop function if exists custom.table_duplicate(uuid, boolean, text, uuid);
drop function if exists custom.table_duplicate_continue(uuid);
drop function if exists custom._table_duplicate_step(uuid, interval);
drop function if exists custom._duplicate_id(uuid, uuid);
drop function if exists custom._uuid_remap(jsonb, jsonb);
drop function if exists custom._copied_metadata(jsonb);
drop function if exists custom._without_rows_of(jsonb, uuid, uuid);

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('table_duplicate', 'table_duplicate_continue')
   and declared_by = 'tableactions_a_table_can_be_duplicated.sql';

select set_config('platform.closed_schema_sweep', '0', true);

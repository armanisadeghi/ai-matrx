-- chair-step: undo chairdoors4_a_a_record_is_found_by_its_name_in_every_table.sql - drops custom.records_search(text, integer, integer, uuid[], uuid[], boolean) with its platform.client_callable_door row. Nothing else is touched.
-- lane: CHAIR-DOORS

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'records_search'
   and declared_by = 'chairdoors4_a_a_record_is_found_by_its_name_in_every_table.sql';
drop function if exists custom.records_search(text, integer, integer, uuid[], uuid[], boolean);

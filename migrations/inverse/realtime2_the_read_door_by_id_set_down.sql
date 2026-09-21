-- chair-step: INVERSE of realtime2_the_read_door_by_id_set.sql and
-- realtime2_the_switch_that_opens_the_by_ids_door.sql. Drops custom.read_records_by_ids and
-- removes its door row. Nothing else is touched: custom.read_records, the ladder and every
-- other door are untouched, because this door only ever ADDED a second way to ask the same
-- ladder the same question. Running it puts a realtime nudge back to re-reading whole pages.
drop function if exists custom.read_records_by_ids(uuid, uuid, uuid[], boolean);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'read_records_by_ids';

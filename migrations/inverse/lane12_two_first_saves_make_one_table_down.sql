-- chair-step: the inverse of lane12_two_first_saves_make_one_table.sql. It DROPS the function custom.table_ensure(uuid, jsonb) and deletes its platform.client_callable_door row. Nothing else existed before it and nothing else is touched; afterwards the records client answers door_absent for this door, as it did before lane 12.
-- lane: PLATFORM-APP-DATA (v6 lane 12)
-- lock: custom

set local lock_timeout = '2s';
set local statement_timeout = '60s';

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'table_ensure';
drop function if exists custom.table_ensure(uuid, jsonb);

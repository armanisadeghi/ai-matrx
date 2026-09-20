-- STORE-T, the inverse: the migration-log door closed again.

revoke execute on function custom.migrations(uuid, uuid, integer) from authenticated;
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'migrations'
   and declared_by = 'migrations/campaign/storet_history_has_a_door.sql (lane STORE-T)';
drop function if exists custom.migrations(uuid, uuid, integer);

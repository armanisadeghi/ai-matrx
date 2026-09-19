-- STORE-REL 6's inverse — retention and pruning go back to being server-only, which is why
-- T14's second half could not be asked at all.

drop function if exists custom.history_prune(uuid, text, uuid, boolean);
drop function if exists custom.history_retention_floor_raise(uuid, integer);
drop function if exists custom.history_retention_set(uuid, uuid, integer);
drop function if exists custom.history_retention(uuid, uuid);
drop function if exists custom.assert_organization_admin(uuid, text, text);
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('history_prune', 'history_retention_floor_raise',
                         'history_retention_set', 'history_retention');

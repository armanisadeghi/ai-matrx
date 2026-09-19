-- chair-step: DOOR-FIX 4c's inverse — removes the store switch's two doors and their
-- declarations. Any organization-rung override already written for custom/system_enabled STAYS:
-- an inverse that turned organizations off would be a data change dressed as a rollback.
-- After this file the switch screen's store row disappears (its GET returns no storeSwitch and
-- the screen renders nothing for it — absent, never disabled-looking).

drop function if exists platform.unified_data_store_set(uuid, boolean, uuid, text);
drop function if exists platform.unified_data_store_state(uuid);
delete from platform.client_callable_door
 where schema_name = 'platform'
   and function_name in ('unified_data_store_state', 'unified_data_store_set');

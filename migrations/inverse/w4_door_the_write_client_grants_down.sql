-- chair-step: the DOWN migration for w4_door_the_write_client_grants.sql. It takes back the eight client EXECUTE grants on the store's write-side doors and puts the four record doors' registry rows back to `signed_in_callers = false` with the lane sentence they carried before. A REVOKE on a live door and an UPDATE of a registry row are both outside the additive allow-list, which is exactly why this is a chair step.
--
-- Run this BEFORE `w4_door_the_write_doors_are_client_callable_down.sql`: a client EXECUTE
-- left standing on a body that no longer decides membership is the hole the lane closed.

set lock_timeout = '2s';
set statement_timeout = '120s';

revoke execute on function custom.record_write(uuid, uuid, jsonb) from authenticated;
revoke execute on function custom.record_update(uuid, uuid, jsonb, integer) from authenticated;
revoke execute on function custom.record_delete(uuid, uuid) from authenticated;
revoke execute on function custom.record_restore(uuid, uuid) from authenticated;

revoke execute on function custom.table_declare(uuid, jsonb) from authenticated;
revoke execute on function custom.applicable_fields(uuid, uuid, text) from authenticated;
revoke execute on function custom.table_capacity(uuid, uuid) from authenticated;
revoke execute on function custom.promote_table(uuid, uuid) from authenticated;

update platform.client_callable_door
   set signed_in_callers = false,
       declared_by       = 'W4-DOOR',
       non_client_lane   = 'server_only: the campaign''s own server lanes reach this door as the role that owns custom.record; a client grant on it is switch-checklist work with its own step, never a lane''s.'
 where schema_name = 'custom'
   and function_name in ('record_write', 'record_update', 'record_delete', 'record_restore');

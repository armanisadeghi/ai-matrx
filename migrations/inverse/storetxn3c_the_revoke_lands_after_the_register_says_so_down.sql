-- chair-step: the inverse of `storetxn3c_the_revoke_lands_after_the_register_says_so.sql`, for
--   rule 27 ON THE CLONE only. It re-opens the register row and the grant together, in the order
--   §6d-4 enforces, because a grant on a closed door is refused at the door.
-- lock: custom,platform

set lock_timeout = '5s';
set statement_timeout = '300s';

update platform.client_callable_door
   set signed_in_callers = true, non_client_lane = null
 where schema_name = 'custom' and function_name = 'migrate_purge_hard';

grant execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  to authenticated;

update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane   = 'chair_only: restored by the storetxn3c inverse on the clone.'
 where schema_name = 'custom' and function_name = 'migrate_purge_hard';

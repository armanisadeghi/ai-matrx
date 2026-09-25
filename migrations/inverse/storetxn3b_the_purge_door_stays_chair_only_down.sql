-- chair-step: the inverse of `migrations/campaign/storetxn3b_the_purge_door_stays_chair_only.sql`,
--   for rule 27 (up -> inverse -> up) ON THE CLONE. It re-opens the grant the up took back and is
--   never run on the main database: the up exists because that grant is the wrong shape there.
-- lock: custom,platform

set lock_timeout = '2s';
set statement_timeout = '300s';

update platform.client_callable_door
   set signed_in_callers = true,
       non_client_lane   = null
 where schema_name = 'custom'
   and function_name = 'migrate_purge_hard';

grant execute on function custom.migrate_purge_hard(uuid, uuid, text, integer, boolean)
  to authenticated;

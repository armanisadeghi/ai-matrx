-- VIS-2 (3 of 3) — THE INVERSE. Both functions are new, so the inverse is their removal and
-- their two door rows. Nothing was captured, nothing was stored and nothing else was touched,
-- so there is no earlier body to restore.

set lock_timeout = '3s';
set statement_timeout = '60s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('visibility_as_of', 'record_state_as_of');

drop function if exists custom.visibility_as_of(uuid, uuid, timestamptz);
drop function if exists custom.record_state_as_of(uuid, timestamptz);

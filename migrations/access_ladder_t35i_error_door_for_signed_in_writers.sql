-- lane: access-ladder T-35i — the error door answers the database writers that run as the signed-in person.
-- Three writers of ops.system_error run with the caller's rights (provenance, the provisioner's two
-- kernel reports); they call ops.record_system_error, so the signed-in role needs EXECUTE. The door is
-- safe to call directly: it records the caller as itself, owns the row by the system organization and
-- nobody but the admin apps reads it.
set local lock_timeout = '2s';

update platform.client_callable_door
   set signed_in_callers = true,
       non_client_lane = null,
       reason = reason || ' Signed-in callers: the three database writers that run with the caller''s rights reach it as the signed-in role; calling it directly files one admin-only error row as the caller.'
 where schema_name = 'ops' and function_name = 'record_system_error';

grant execute on function ops.record_system_error(jsonb) to authenticated;

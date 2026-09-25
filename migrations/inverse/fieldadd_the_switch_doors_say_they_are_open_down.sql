-- INVERSE of migrations/campaign/fieldadd_the_switch_doors_say_they_are_open.sql.
--
-- It puts the three declaration rows back to SERVER-ONLY and takes the client
-- EXECUTE grant with them, which is lawful here and only here: this lane opened
-- those grants in the same hour, nothing else has ever held them, and the admin
-- API route's service_role lane — the one the screen worked through before — is
-- untouched, so nothing a person could do yesterday stops working.

set lock_timeout = '2s';
set statement_timeout = '600s';

update platform.client_callable_door
   set signed_in_callers = false,
       anonymous_callers = false,
       non_client_lane   = 'server_only: reached by the admin API route, which establishes from the caller''s own session that they are a super admin before it uses the service key. Restored by the inverse of the FIELD-ADD lane.',
       declared_by       = 'migrations/inverse/fieldadd_the_switch_doors_say_they_are_open_down.sql (lane FIELD-ADD)'
 where schema_name = 'platform'
   and function_name in ('unified_data_ramp_state', 'unified_data_store_state', 'unified_data_store_set');

revoke execute on function platform.unified_data_ramp_state(uuid) from authenticated;
revoke execute on function platform.unified_data_store_state(uuid) from authenticated;
revoke execute on function platform.unified_data_store_set(uuid, boolean, uuid, text) from authenticated;

-- INVERSE of migrations/campaign/tidy_the_provenance_write_is_reachable_from_the_turn.sql
-- Takes the grant back and puts the door's declaration back to server_only. The flush then
-- cannot call it from the person's session, which is the defect this file fixed.

set lock_timeout = '3s';
set statement_timeout = '2min';

revoke execute on function custom.provenance_write(uuid, uuid, text, jsonb) from authenticated;
update platform.client_callable_door
   set signed_in_callers = false,
       non_client_lane = 'server_only: called by matrx_records.merge.sink.flush_turn at the end of a context assembly.'
 where schema_name = 'custom' and function_name = 'provenance_write';

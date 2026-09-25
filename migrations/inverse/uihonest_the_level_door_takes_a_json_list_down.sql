-- INVERSE of migrations/campaign/uihonest_the_level_door_takes_a_json_list.sql
--
-- Takes the jsonb signature away. It does NOT put the uuid[] one back: that
-- signature was one hour old, reachable from only one of the two transports
-- this platform uses, and restoring it would restore the defect. Running the
-- first file's own inverse after this one leaves the store exactly as it was
-- before this lane.

set lock_timeout = '2s';
set statement_timeout = '600s';

delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name = 'my_levels'
   and identity_argtypes = array['uuid'::regtype::oid, 'jsonb'::regtype::oid, 'text'::regtype::oid];

drop function if exists custom.my_levels(uuid, jsonb, text);

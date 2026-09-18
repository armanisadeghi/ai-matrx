-- chair-step: REVOKE, which closes schema custom again. It grants nothing and opens nothing; it is the exact inverse of w4_door_the_client_grants.sql.

set lock_timeout = '5s';

revoke execute on function custom.assert_store_door(uuid, text) from authenticated;
revoke execute on function custom.caller_role() from authenticated;
revoke execute on function custom.store_is_open(uuid) from authenticated;
revoke execute on function custom.read_record(uuid, uuid, boolean) from authenticated;
revoke execute on function custom.read_records(uuid, uuid, boolean, integer, integer) from authenticated;
revoke usage on schema custom from authenticated;

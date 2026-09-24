-- lock: custom,platform
-- lane: S1-PRIME-VIEW-KEYS
-- chair-step: the inverse of uichamp_s1_a_signed_in_person_may_read_the_view_keys.sql. It REVOKES
-- EXECUTE on custom.view_keys() from authenticated and deletes its platform.client_callable_door
-- row. What it undoes: a signed-in person's view-settings controls are refused the registry again
-- ("permission denied"); custom.view_declare still judges every save by it. Nothing else changes.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'view_keys'
   and declared_by = 'uichamp_s1_a_signed_in_person_may_read_the_view_keys.sql';

revoke execute on function custom.view_keys() from authenticated;

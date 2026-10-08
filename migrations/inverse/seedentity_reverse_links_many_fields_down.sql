-- Inverse of migrations/campaign/seedentity_reverse_links_many_fields.sql: revokes and drops the one door it added and its
-- platform.client_callable_door row. Nothing else is touched.
-- lane: SEED-ENTITY
-- guard: custom/system_enabled

revoke execute on function custom.reverse_links_many_fields(uuid, uuid, uuid[], uuid[], integer, integer) from authenticated;
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'reverse_links_many_fields';
drop function custom.reverse_links_many_fields(uuid, uuid, uuid[], uuid[], integer, integer);

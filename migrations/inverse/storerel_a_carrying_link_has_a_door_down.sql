-- STORE-REL 2's inverse — the carrying link has no client door again, which is why T2 failed.

drop function if exists custom.relation_carry(uuid, uuid, uuid);
drop function if exists custom.relation_uncarry(uuid, uuid, uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('relation_carry', 'relation_uncarry');

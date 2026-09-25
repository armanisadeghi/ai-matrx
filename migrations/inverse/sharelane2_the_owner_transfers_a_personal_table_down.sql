-- INVERSE of migrations/campaign/sharelane2_the_owner_transfers_a_personal_table.sql: drops the two doors and their register rows. Audit rows and notices a transfer already wrote are history and stay.
-- lane: SHARE-LANE-2
set local lock_timeout = '30s';
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('table_transfer_owner', 'member_personal_tables');
drop function if exists custom.table_transfer_owner(uuid, uuid, text);
drop function if exists custom.member_personal_tables(uuid, uuid);

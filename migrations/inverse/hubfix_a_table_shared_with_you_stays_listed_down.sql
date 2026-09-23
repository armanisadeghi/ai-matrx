-- chair-step: this DROPs the one function hubfix_a_table_shared_with_you_stays_listed.sql added, custom.tables_shared_with_me(), and deletes its platform.client_callable_door row. Nothing else existed before it and nothing else is touched; the hub falls back to listing pending invitations only.
-- lane: HUB-FIX

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'tables_shared_with_me';

drop function if exists custom.tables_shared_with_me();

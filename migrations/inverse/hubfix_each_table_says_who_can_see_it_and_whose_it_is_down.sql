-- chair-step: this DROPs the one function hubfix_each_table_says_who_can_see_it_and_whose_it_is.sql added, custom.table_facts(uuid), and deletes its platform.client_callable_door row. Nothing else existed before it and nothing else is touched; the hub then says its lanes cannot be decided and shows Everything only.
-- lane: HUB-FIX

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_facts';

drop function if exists custom.table_facts(uuid);

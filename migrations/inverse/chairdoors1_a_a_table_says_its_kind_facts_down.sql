-- chair-step: undo chairdoors1_a_a_table_says_its_kind_facts.sql — drops custom.table_kind_facts(uuid) and its platform.client_callable_door row. Nothing else is touched.
-- lane: CHAIR-DOORS-1
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_kind_facts'
   and declared_by = 'chairdoors1_a_a_table_says_its_kind_facts.sql';
drop function if exists custom.table_kind_facts(uuid);

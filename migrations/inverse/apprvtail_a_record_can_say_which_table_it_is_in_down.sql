-- INVERSE of apprvtail_a_record_can_say_which_table_it_is_in.sql
-- It takes the one new door away again, with its declaration row. Running it puts the hole
-- back: a record can no longer say which table it is in from a client seat, so every agent
-- verb that names a record asks the organization's question about NO TABLE — which is
-- answered "a new table the agent makes goes ahead". That is what the red twin proves.
drop function if exists custom.record_table(uuid, uuid);
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_table';

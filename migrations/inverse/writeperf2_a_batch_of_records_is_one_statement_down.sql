-- additive: yes
--
-- chair-step: it DROPS custom.record_write_many and its client_callable_door row.
--
-- THE INVERSE of writeperf2_a_batch_of_records_is_one_statement.sql: the batched door goes away
-- and the store is back to one row per statement. Run for real by
-- scripts/campaign-tests/writeperf2_red.sql inside a rolled-back transaction.
delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'record_write_many';
drop function if exists custom.record_write_many(uuid, uuid, jsonb[], uuid[]);

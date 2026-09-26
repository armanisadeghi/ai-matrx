-- chair-step: inverse of migrations/campaign/doorspeed_a_page_is_sorted_searched_and_counted_and_a_batch_is_one_transaction.sql - removes the doors custom.read_records_page and custom.record_change_many and their platform.client_callable_door declarations. Nothing else was changed by that file, so nothing else is restored, and no record is touched. The Sheet then reads the page door as absent and says so.
-- lane: data-tables-grid-overhaul

delete from platform.client_callable_door where schema_name = 'custom' and function_name in ('read_records_page', 'record_change_many');
drop function if exists custom.record_change_many(uuid, uuid, jsonb);
drop function if exists custom.read_records_page(uuid, uuid, jsonb, text, jsonb, uuid, boolean, integer, integer);

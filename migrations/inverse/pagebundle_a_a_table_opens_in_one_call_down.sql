-- chair-step: undo pagebundle_a_a_table_opens_in_one_call.sql - removes custom.table_page_bundle and its client-door declaration; every part it answered is still answered by its own door, so nothing else changes
-- lane: PAGE-BUNDLE

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name = 'table_page_bundle';

drop function if exists custom.table_page_bundle(uuid, uuid, uuid);

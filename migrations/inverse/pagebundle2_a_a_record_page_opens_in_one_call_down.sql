-- chair-step: undo pagebundle2_a_a_record_page_opens_in_one_call.sql — remove custom.record_page_bundle and its door row; the record page asks each door itself again (records client falls back on a missing door).
-- lane: PAGE-BUNDLE-2
delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'record_page_bundle';
DROP FUNCTION IF EXISTS custom.record_page_bundle(uuid, uuid);

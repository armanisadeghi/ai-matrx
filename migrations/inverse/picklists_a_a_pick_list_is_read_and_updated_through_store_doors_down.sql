-- chair-step: INVERSE of migrations/campaign/picklists_a_a_pick_list_is_read_and_updated_through_store_doors.sql (lane PICK-LISTS). Drops custom.pick_list_get, pick_list_for_selection and pick_list_update; the public functions they mirror are untouched and keep answering.
-- lane: PICK-LISTS

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('pick_list_get', 'pick_list_for_selection', 'pick_list_update');
drop function if exists custom.pick_list_get(uuid);
drop function if exists custom.pick_list_for_selection(uuid);
drop function if exists custom.pick_list_update(uuid, text, text, jsonb);

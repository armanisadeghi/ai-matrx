-- chair-step: lane HANDOVER — removes the Lists page's two store doors (custom.pick_list_index, custom.pick_list_index_everywhere) and their helper, with their door rows; nothing else read them before listsindex_the_lists_page_reads_one_store_door.sql.

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('pick_list_index', 'pick_list_index_everywhere');
drop function if exists custom.pick_list_index_everywhere();
drop function if exists custom.pick_list_index(uuid);
drop function if exists custom._pick_list_index_of(uuid, uuid);

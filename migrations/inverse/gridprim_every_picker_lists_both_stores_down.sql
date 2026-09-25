-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_every_picker_lists_both_stores.sql. It DROPS custom.table_list_everywhere(uuid), deletes its platform.client_callable_door row. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: nothing is stored by the door; every picker that called it is refused by name and goes back to the older list.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop function if exists custom.table_list_everywhere(uuid);

delete from platform.client_callable_door
 where schema_name = 'custom' and declared_by = 'gridprim_every_picker_lists_both_stores.sql';


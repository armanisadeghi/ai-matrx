-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_synced_sheet_is_one_table_that_refreshes.sql. It DROPS custom.table_sync(uuid, uuid, jsonb), deletes its platform.client_callable_door row and the knob row it added. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: a Table a refresh made stays, with its sync_source and every row it wrote (an organization's own data); the next refresh cannot find it through this door.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists custom.table_sync(uuid, uuid, jsonb);

delete from platform.client_callable_door
 where schema_name = 'custom' and declared_by = 'gridprim_a_synced_sheet_is_one_table_that_refreshes.sql';

delete from platform.feature_knob where feature = 'custom' and key = 'table_sync_rows_max';

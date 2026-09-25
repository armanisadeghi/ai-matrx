-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_table_can_start_from_a_real_example.sql. It DROPS the
-- three functions that file created, deletes their two platform.client_callable_door rows and
-- the knob row it added. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: tables an organization built from an example are that organization's own
-- tables and stay; numbers custom.autonumber_backfill gave stay on their records.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

drop function if exists custom.autonumber_backfill(uuid, uuid);
drop function if exists custom.table_from_example(uuid, uuid, jsonb);
drop function if exists custom._example_placeholder(text);

delete from platform.client_callable_door
 where schema_name = 'custom'
   and declared_by = 'gridprim_a_table_can_start_from_a_real_example.sql';

delete from platform.feature_knob where feature = 'custom' and key = 'example_rows_max';

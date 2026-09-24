-- lock: custom,platform
-- lane: GRID-PRIMITIVES
-- chair-step: the inverse of gridprim_a_view_keeps_the_order_a_person_dragged.sql. It DROPS custom.view_record_order_set(uuid, uuid, uuid[]) and custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer), deletes their platform.client_callable_door rows and the knob custom/view_record_order_max. Nothing it created replaced a live body.
-- WHAT IT DOES NOT UNDO: a view that was ordered by hand keeps `definition.order = "manual"` and its `metadata.record_positions` — they are the person's order and are kept (soft-delete law), but nothing reads them until this file is applied again.

set local lock_timeout = '5s';
set local statement_timeout = '60s';

drop function if exists custom.view_record_order_set(uuid, uuid, uuid[]);
drop function if exists custom.read_records_in_view_order(uuid, uuid, boolean, integer, integer);
delete from platform.client_callable_door
 where declared_by = 'gridprim_a_view_keeps_the_order_a_person_dragged.sql';
delete from platform.feature_knob where feature = 'custom' and key = 'view_record_order_max';

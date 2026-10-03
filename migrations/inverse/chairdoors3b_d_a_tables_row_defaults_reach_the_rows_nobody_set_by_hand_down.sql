-- chair-step: undo chairdoors3b_d_a_tables_row_defaults_reach_the_rows_nobody_set_by_hand.sql: removes the door row and drops custom.table_row_defaults_apply. The reserved metadata key record/row_controls_from_default is LEFT registered: rows already carry the marker and the window file's insert trigger may write it, and removing the registration would make every later client write to such a row's metadata key refuse. Rows the door changed keep the values it gave them.
-- lane: CHAIR-DOORS-3B
delete from platform.client_callable_door
 where declared_by = 'chairdoors3b_d_a_tables_row_defaults_reach_the_rows_nobody_set_by_hand.sql';
drop function if exists custom.table_row_defaults_apply(uuid, uuid, uuid, integer);

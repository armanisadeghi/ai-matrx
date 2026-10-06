-- lane: CHAIR-WORLD-LANE-2
-- based-on: custom.door_reads_only(text) 4ce78d72c5274ccb49a1157181c89466030e57cae1f62e700b8916002eb56b7b
-- Inverse of migrations/campaign/chairworld_h_a_public_reader_sees_where_each_value_came_from.sql: the read-door list as chairworld_g left it.

set local lock_timeout = '3s';

CREATE OR REPLACE FUNCTION custom.door_reads_only(p_door text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- THE READ DOORS THE WORLD LANE ADMITS (CHAIR-WORLD-LANE), by the name each passes to
  -- custom.assert_client_may_reach. A door joins this list only when it names its Table to
  -- custom.assert_may_know_table / custom.assert_client_may_open (or to
  -- custom.assert_public_reader_names_a_public_table) right after the wall, and writes nothing.
  select coalesce(p_door = any (array[
    'platform.resolve_id',
    'custom.where_id_opens',
    'custom.read_records',
    'custom.read_records_page',
    'custom.read_record',
    'custom.read_records_by_ids',
    'custom.read_records_matching',
    'custom.read_records_in_view_order',
    'custom.record_aggregate',
    'custom.applicable_fields',
    'custom.views',
    'custom.view_look_read',
    'custom.table_decorations',
    'custom.table_dimensions',
    'custom.table_kind_facts',
    -- CHAIR-WORLD-LANE-2: field_options names the Field's Table, record_change_actions names its Table, and
    -- work_inbox answers a world-lane reader empty (custom.world_reader_only) — none of them writes.
    'custom.field_options',
    'custom.record_change_actions',
    'custom.work_inbox',
    -- CHAIR-WORLD-LANE-2 (e): grid_layout, row_actions, reverse_columns and table_capacity name their Table through
    -- custom.assert_may_know_table; io_imports answers a world-lane reader an empty list and my_levels answers her
    -- only about a Public Table and its own rows (custom.world_reader_may_know_row) — none of them writes.
    'custom.grid_layout',
    'custom.row_actions',
    'custom.reverse_columns',
    'custom.table_capacity',
    'custom.io_imports',
    'custom.my_levels',
    -- CHAIR-WORLD-LANE-2 (f): record_headers answers a world-lane reader only the rows of a Public Table (each Table
    -- named to custom.assert_public_reader_names_a_public_table first); the live-updates socket for a Table names it
    -- through custom.assert_may_know_table (custom.realtime_topic_admits) and carries ids only.
    'custom.record_headers',
    'the live updates for this table',
    -- CHAIR-WORLD-LANE-2 (g): table_facts answers a world-lane reader the lane facts of the organization's Public
    -- Tables and of nothing else (so a Table page can say "Public · read only").
    'custom.table_facts'
  ]), false)
$function$;

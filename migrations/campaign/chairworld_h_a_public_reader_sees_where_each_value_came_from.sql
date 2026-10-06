-- additive: yes
-- lane: CHAIR-WORLD-LANE-2
-- based-on: custom.door_reads_only(text) 9c8f59d07bd44980ad6c5ed1314fce3dae1d48230db85add8baab980c80c4b9a
-- LOCKS: one function body (CREATE OR REPLACE keeps its grants). No table, row, trigger, grant or policy is touched.
--
-- A PUBLIC READER SEES WHERE EACH VALUE CAME FROM (CHAIR-WORLD-LANE-2, after chairworld_g). records-ui 0.101.26 asks
-- custom.enrich_cells for the rows on screen of "Example: Project Tracker"; it refused test@test.com at the wall.
-- It is read-only, names its Table to custom.assert_may_know_table right after the wall (so only a Public Table
-- passes for a world-lane reader), masks columns at her own level and reads only rows custom.query_visible_ids
-- gives her. custom.door_reads_only adds it. Writes are untouched.
-- Inverse: migrations/inverse/chairworld_h_a_public_reader_sees_where_each_value_came_from_down.sql.

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
    'custom.table_facts',
    -- CHAIR-WORLD-LANE-2 (h): enrich_cells (where each value of the rows on screen came from) names its Table
    -- through custom.assert_may_know_table, masks by the reader's own level and lists only rows she may see.
    'custom.enrich_cells'
  ]), false)
$function$;

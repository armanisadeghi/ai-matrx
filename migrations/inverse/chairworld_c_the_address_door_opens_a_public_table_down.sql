-- lane: CHAIR-WORLD-LANE
-- based-on: custom.door_reads_only(text) 9ada100f089b76a188251f85668ce1b2b5367cf2a59f89adb01cdb7387c03a96
-- Inverse of migrations/campaign/chairworld_c_the_address_door_opens_a_public_table.sql: the read-door list
-- as chairworld_a left it (without custom.where_id_opens).

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
    'custom.table_kind_facts'
  ]), false)
$function$

;

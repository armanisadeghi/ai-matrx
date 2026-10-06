-- additive: yes
-- lane: CHAIR-WORLD-LANE
-- based-on: custom.door_reads_only(text) 2ac687c0ecb85b341d32f2fac581d9ba066549a2341060878d837f830a191d32
-- LOCKS: one function body (CREATE OR REPLACE keeps its grants). Nothing is tightened.
--
-- THE ADDRESS DOOR OPENS A PUBLIC TABLE TOO. custom.where_id_opens — what /data/<id> asks first to learn
-- where a table lives — passes its own name to the wall ('custom.where_id_opens', not
-- 'platform.resolve_id'), so a signed-in outsider still got "you don't have access" on a Public table
-- (measured live 2026-10-05 as test@test.com on Example: Project Tracker: where_id_opens answered null).
-- It names its subject to custom.assert_client_may_open right after the wall, which turns every Table that
-- is not Public back into the wall's refusal, so it joins custom.door_reads_only.
-- Inverse: migrations/inverse/chairworld_c_the_address_door_opens_a_public_table_down.sql.

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
    'custom.table_kind_facts'
  ]), false)
$function$;

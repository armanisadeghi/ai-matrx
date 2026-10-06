-- additive: yes
-- lane: CHAIR-WORLD-LANE-2
-- based-on: custom.door_reads_only(text) 0ce0cbcf584809015204964f642b75f4d1d456edac066fa6780cbd60ac3f3d28
-- based-on: custom.record_headers(uuid, uuid[]) ce6c1ed3e09dc710fab0af85c278d5d41379a3aba8451096cf0ed98613b73f14
-- LOCKS: two function bodies (CREATE OR REPLACE keeps their grants). No table, row, trigger, grant or policy is touched.
--
-- A PUBLIC READER GETS ROW HEADERS AND LIVE UPDATES (CHAIR-WORLD-LANE-2, after chairworld_e). With e live the
-- Project Tracker grid drew its rows for test@test.com; two refusals were left: custom.record_headers (the
-- grid's versions of the rows on screen) and the live-updates socket for the Table (custom.realtime_topic_admits
-- asks custom.assert_may_know_table under the door name 'the live updates for this table'; CHANNEL_ERROR, retried).
--
-- 1. custom.door_reads_only adds 'custom.record_headers' and 'the live updates for this table'. The socket names its
--    Table through custom.assert_may_know_table, so only a Public Table is admitted; its notices carry ids only.
-- 2. custom.record_headers, for a world-lane-only seat: only rows of a live Public Table, each such Table named to
--    custom.assert_public_reader_names_a_public_table before its rows are read. Everyone else: unchanged.
-- Writes are untouched.
-- Inverse: migrations/inverse/chairworld_f_a_public_reader_gets_row_headers_and_live_updates_down.sql.

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
    'the live updates for this table'
  ]), false)
$function$;

CREATE OR REPLACE FUNCTION custom.record_headers(p_organization_id uuid, p_ids uuid[])
 RETURNS TABLE(id uuid, table_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, version integer, deleted_at timestamp with time zone, mine boolean, created_by uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me uuid := custom.query_principal();
  v_t  uuid;
  v_world boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_headers');
  v_world := custom.world_reader_only(p_organization_id);
  if coalesce(cardinality(p_ids), 0) > 1000 then
    raise exception 'One call answers at most 1000 records; this one named %.', cardinality(p_ids)
      using errcode = '54000', hint = 'Ask for the rows a page shows. Nothing was read.';
  end if;

  for v_t in
    select distinct r.table_id
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = any(coalesce(p_ids, '{}'::uuid[]))
       -- LANE 10 FD (2026-10-02): a TABLE's own record answers too. A Table is a record of the Table
       -- kernel; its settings (its name, its Foundation mark) are written through record_update at the
       -- version a person saw, and this was the only door that tells a client that version — so every
       -- such write (rename included) refused with "latest changes could not be checked". Who may
       -- read a row is unchanged: the rows below still pass the store's own reach check for their table.
       and r.data_class in ('record', 'table') and r.deleted_at is null
       -- CHAIR-WORLD-LANE-2: a person admitted only through the world lane is answered the rows of a live Public
       -- Table and nothing else; each such Table is named to the public-reader check before its rows are read.
       and (not v_world
            or exists (select 1 from custom.record t
                        where t.organization_id = p_organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.deleted_at is null
                          and t.published_to_web))
  loop
    if v_world then
      perform custom.assert_public_reader_names_a_public_table(p_organization_id, v_t, 'custom.record_headers');
    end if;
    return query
      select r.id, r.table_id, r.created_at, r.updated_at, r.version, r.deleted_at,
             (v_me is not null and r.created_by = v_me),
             case when v_me is not null and r.created_by = v_me then v_me end
        from custom.record r
       where r.organization_id = p_organization_id
         and r.table_id = v_t
         and r.id = any(p_ids)
         -- CHAIR-ACCESS b: a row of a Confidential Table this person is not named on still answers
         -- its header here (this door never carries a value): id, when it was made, nothing else.
         and (r.id in (select v from custom.query_visible_ids(p_organization_id, v_t, 'viewer') v)
              or custom.confidential_header(v_me, r.id) is not null);
  end loop;
end
$function$;

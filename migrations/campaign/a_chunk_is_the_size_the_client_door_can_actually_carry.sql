-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.table_archive(uuid, uuid, integer, boolean) 256f8ca8aae3bf31c2d9c5cb9849bfbbf690064647dc76dbc62a062d2288d3b0
--
-- LANE FIX-10B — two things the first live run of `custom.table_archive` proved wrong about
-- itself, measured against Rincon Plumbing Co's 1,399-record "Truck 1 dispatch backlog" on
-- 2026-09-22.
--
-- 1. THE DEFAULT CHUNK WAS A NUMBER THAT CANNOT WORK. 200 records per call took longer than
--    the ~8 s ceiling PostgREST puts on ONE door call, so a screen that took the default got
--    `SQLSTATE 57014` — the exact sentence this primitive exists to abolish — on its first
--    pass. The whole call rolls back, so nothing is lost and nothing half-happens, but a
--    default that cannot finish is a stand-in that does not announce itself. Measured: 200
--    records → 57014 after 8.1 s; 50 records → ~2.2 s a pass, 1,399 records archived in 26
--    passes and 58.4 s with room to spare. The default is 50. The hard cap stays at 1,000 for
--    a caller with a real budget (psql, a job, the runner), because that caller is not going
--    through the door that has the ceiling — and the number a screen gets should be the one
--    that works, not the one that is theoretically allowed.
--
-- 2. THE LAST PASS CLAIMED SOMETHING IT HAD NOT DONE. Archiving a table's CONTENTS and leaving
--    the table itself (`include_table => false`, which is what a cleanup wants and what the
--    screen's "empty this table" would want) still ended with "Truck 1 dispatch backlog is
--    archived." The table was not archived; only everything in it was. A screen never lies —
--    the sentence now says which of the two happened.
--
-- The inverse is `migrations/inverse/a_chunk_is_the_size_the_client_door_can_actually_carry_down.sql`.
-- The function keeps its exact signature, its door row and its grant; only the default value
-- of one argument and two sentences change.

create or replace function custom.table_archive(
  p_organization_id uuid,
  p_table_id        uuid,
  p_chunk           integer default 50,
  p_include_table   boolean default true)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  -- THE MOST ONE CALL WILL TAKE ON. Not the most a SCREEN should ask for: a client call goes
  -- through PostgREST, which cancels at ~8 s whatever this function would have been happy to
  -- do, so `p_chunk`'s DEFAULT (50) is the honest number and this cap is for a caller with a
  -- real budget.
  c_max     constant integer := 1000;
  v_chunk   integer;
  v_id      uuid;
  v_did     integer := 0;
  v_live    integer;
  v_gone    integer;
  v_name    text;
  v_table   boolean;                   -- is the Table record itself still live?
  v_whole   boolean;                   -- was this call asked to archive the Table too?
  v_done    boolean := false;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- The rung is the one `custom.record_delete` asks of the Table record, asked ONCE here so a
  -- person who may not do this is told before the first row moves rather than after.
  perform custom.assert_store_door(p_organization_id, 'custom.table_archive');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_archive');

  if p_organization_id is null or p_table_id is null then
    raise exception 'Archiving a table needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at is null
    into v_name, v_table
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = p_table_id
     and r.data_class = 'table';
  if not found then
    raise exception 'There is no table % in this organization, so there is nothing to archive.', p_table_id
      using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.';
  end if;

  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_archive');

  v_whole := coalesce(p_include_table, true);
  -- HOW MUCH THIS CALL TAKES ON. 0 means "tell me, change nothing" — which is what a screen
  -- asks before it shows a person a number and a button. Above c_max is clamped rather than
  -- refused, because a caller asking for too much wants the work done, not a lecture; the
  -- answer says what it actually did.
  v_chunk := least(greatest(coalesce(p_chunk, 50), 0), c_max);

  if v_chunk > 0 then
    for v_id in select r.id
                  from custom.record r
                 where r.organization_id = p_organization_id
                   and r.table_id = p_table_id
                   and r.data_class = 'record'
                   and r.deleted_at is null
                 order by r.created_at, r.id
                 limit v_chunk
    loop
      -- A RECORD THAT CONTAINS OTHER RECORDS TAKES THEM WITH IT, so a row this loop is about
      -- to reach may already have gone with an earlier one. That is not an error and it is
      -- not a second delete; it is simply already done.
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_id and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_id);
        v_did := v_did + 1;
      end if;
    end loop;
  end if;

  select count(*) filter (where r.deleted_at is null),
         count(*) filter (where r.deleted_at is not null)
    into v_live, v_gone
    from custom.record r
   where r.organization_id = p_organization_id
     and r.table_id = p_table_id
     and r.data_class = 'record';

  -- THE TABLE GOES LAST, AND ONLY WHEN IT IS EMPTY. By now its own cascade is the Fields, the
  -- saved views and the Rules it carries — tens of rows, not thousands — so the one call that
  -- could not finish before is now the cheapest one in the run.
  if v_live = 0 and v_whole and v_table then
    perform custom.record_delete(p_organization_id, p_table_id);
    v_table := false;
  end if;

  v_done := v_live = 0 and (not v_whole or not v_table);

  return jsonb_build_object(
    'table_id',   p_table_id,
    'table_name', v_name,
    'archived',   v_did,                 -- what THIS call archived
    'remaining',  v_live,                -- records still live in this table
    'total',      v_live + v_gone,       -- records this table has ever held
    'archived_total', v_gone,            -- records of this table already archived, all runs
    'table_archived', not v_table,
    'done',       v_done,
    'chunk',      v_chunk,
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      when v_done and v_did = 0 and not v_whole then
        format('Nothing is left to archive in %s. Nothing was changed.', v_name)
      when v_done and v_did = 0 then
        format('%s is already archived. Nothing was changed.', v_name)
      -- WHICH OF THE TWO ACTUALLY HAPPENED. Archiving everything IN a table is not archiving
      -- the table, and a screen that says it is has lied to the person who kept it on purpose.
      when v_done and not v_whole then
        format('%s record%s archived. %s is now empty and still here, and everything in it can be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      when v_done then
        format('%s record%s archived. %s is archived, and everything in it can still be brought back.',
               v_did, case when v_did = 1 then '' else 's' end, v_name)
      else
        format('%s record%s archived, %s to go in %s. Call again to carry on — it picks up where this left off.',
               v_did, case when v_did = 1 then '' else 's' end, v_live, v_name)
    end);
end;
$function$;

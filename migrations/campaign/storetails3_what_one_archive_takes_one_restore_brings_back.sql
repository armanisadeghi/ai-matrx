-- chair-step: a STORE FIX (STORE-LEAK-FORMULA found it while testing, item 3). It REPLACES three
--   bodies, each declared below with the body it was written against — `custom.record_delete`
--   (the one archive door every other archive path ends in), `custom.table_archive` (the chunked
--   "archive this table" door a screen drives) and `custom.record_restore` (the one "bring it
--   back" door) — and adds one read-only function, `custom.archive_event_of`. No table, column,
--   trigger, policy or grant is added: the ARCHIVE EVENT is a row of the one Migration log that
--   already exists for exactly this (`history.migration_log`, HIS-8: "one row per logged
--   Migration, carrying the INVERSE stored at the time"), written through its own door
--   `history.migration_record`, and undone the way every logged Migration is undone.
--   No row of anybody's data is rewritten by this file. The archive events for tables archived
--   BEFORE this file are the separate, audited repair
--   `storetails3_every_archived_table_remembers_what_it_took.sql`.
--   Inverse: `migrations/inverse/storetails3_what_one_archive_takes_one_restore_brings_back_down.sql`.
--   Applied directly (owner, 2026-09-24 ~17:30 PT: "all db stuff applied directly"), proven on
--   the dev clone first (suite RED on the old bodies, GREEN on these; up, inverse, up).
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom.record_delete(uuid, uuid) ab8cb4964d017fe98b4d9617856627178167aa0ecb2e9c0a4f8a7528378533d4
-- based-on: custom.table_archive(uuid, uuid, integer, boolean) e139db9ebd0824628d319710d335d6ae69940cf4be53c4a8e5dd467b4f3d3165
-- based-on: custom.record_restore(uuid, uuid) fa8a168c125ec9e60017a7cc71729eea9b925a93f2972ae2d4a2bf0d3fae29cb
--
-- ════════════════════════════════════════════════════════════════════════════════════════
-- WHAT ONE ARCHIVE TAKES, ONE RESTORE BRINGS BACK
-- ════════════════════════════════════════════════════════════════════════════════════════
--
-- THE DEFECT (production, 2026-09-24, Rooms). "Archive this table" takes the table AS A UNIT:
-- its records (in chunks, through `custom.table_archive`), then — through `custom.record_delete`
-- and `custom.delete_rule` — its saved views, its Rules, its Fields and finally the Table row,
-- plus whatever each record contained, with every association edge they held tombstoned beside
-- them. "Bring it back" (`custom.record_restore`) un-deleted ONE row: the table came back empty,
-- with no columns and no rows, and every column and row stayed in the archive with nothing that
-- said they belonged to it. The two halves were not symmetric, so the undo of a table archive was
-- a smaller version of the same loss.
--
-- THE RULE. What one archive takes as a unit, one restore brings back as a unit — exactly:
--
--   1. THE ARCHIVE EVENT. Every archive that takes more than one row (a table, or a record that
--      took what it contained or what a relation cascades to) writes ONE `history.migration_log`
--      row: verb `archive`, target = the root, inverse kind `restore` with `record_id` (the root),
--      `also` (every other row it took — the list `history.migration_undo` already walks) and
--      `took`: every row it took, root included, IN THE ORDER IT TOOK THEM, each with the exact
--      `deleted_at` it was given. `custom.table_archive` keeps ONE event open across all of its
--      chunks (a screen calls it until `done`), so the records archived by chunk one and the
--      columns archived by the last call are the same event; it is closed when the table goes
--      (or, for "empty it but keep it", when it is empty).
--   2. THE RESTORE. `custom.record_restore` of a root finds the event that archived THIS archive
--      of it (the root's own `deleted_at` must be the one the event recorded — a root restored and
--      archived again since is a different archive) and brings back every row of it that is STILL
--      archived AT THE MOMENT THE EVENT ARCHIVED IT: structure first (tables, then fields, then
--      rules, then saved views), then the records in the order they were taken (a container before
--      what it contained). A row brought back on its own since, or archived again on its own since,
--      is not this event's any more and is left exactly as it is — so a restore is exact even if
--      things changed after the archive. Each row goes back through the same access question the
--      archive asked of it, and every association edge its archive tombstoned comes back with it
--      (the existing `platform._gc_entity_associations_stmt_softdelete` restores exactly the edges
--      a row's own trashing removed). The event is then stamped undone, and the History versions
--      of the restore carry the event's id and read "undo of archive".
--   3. NOTHING ELSE MOVES. A record archived on its own BEFORE the table was archived is not in
--      the table's event and stays archived when the table comes back (it was a separate act, and
--      its own restore still brings it back). A single row archived with nothing else writes no
--      event: its restore was always exact.
--
-- LOCKS. `create or replace function` takes nothing on `custom.record`. No data work.

set local lock_timeout = '30s';
set local statement_timeout = '120s';

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- READING AN ARCHIVE EVENT
-- ═════════════════════════════════════════════════════════════════════════════════════════

create function custom.archive_event_of(p_organization_id uuid, p_record_id uuid)
returns history.migration_log
language sql
stable
security definer
set search_path to 'pg_catalog'
as $$
  -- The closed, not-yet-undone archive event that archived THIS archive of the row: the row is
  -- archived now, and the event's `took` names it with the very `deleted_at` it carries.
  select m.*
    from history.migration_log m
    join custom.record r
      on r.organization_id = p_organization_id
     and r.id = p_record_id
     and r.deleted_at is not null
   where m.organization_id = p_organization_id
     and m.target_id = p_record_id
     and m.verb = 'archive'
     and m.undone_at is null
     and m.inverse ->> 'kind' = 'restore'
     and not coalesce((m.inverse ->> 'open')::boolean, false)
     and exists (select 1 from jsonb_array_elements(coalesce(m.inverse -> 'took', '[]'::jsonb)) t
                  where t ->> 0 = p_record_id::text
                    and (t ->> 1)::timestamptz = r.deleted_at)
   order by m.applied_at desc
   limit 1;
$$;
comment on function custom.archive_event_of(uuid, uuid) is
  'STORE-TAILS-3: the closed, not-yet-undone archive event (history.migration_log, verb archive) whose took names this archived row at its current deleted_at — the unit custom.record_restore brings back.';
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), string_to_array(p.proargtypes::text, ' ')::oid[],
       'STORE-TAILS-3: which archive event a restore brings back; asked by custom.record_restore after it has decided the caller may restore the row.',
       'STORE-TAILS-3',
       'server_only: it reads history.migration_log rows of any organization by id without asking who is asking; custom.record_restore asks it only after its own access decision.',
       false, false
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.oid = 'custom.archive_event_of(uuid, uuid)'::regprocedure;
revoke all on function custom.archive_event_of(uuid, uuid) from public;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE ARCHIVE DOOR RECORDS WHAT IT TOOK
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.record_delete(p_organization_id uuid, p_record_id uuid)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_at    timestamptz;
  v_plan  jsonb;
  v_child uuid;
  v_first boolean;
  v_depth integer;
  v_prev  text;
  -- STORE-TAILS-3: THE ARCHIVE EVENT this call belongs to, and what it took.
  v_event     uuid;
  v_own_event boolean := false;
  v_took      uuid[];
  v_class     text;
begin
  -- THE SWITCH. Every line below is behind custom/system_enabled: custom.assert_store_door
  -- resolves that knob and, while it is false, this store takes writes only from the role that
  -- owns custom.record. The switch never removes a check; it closes the door.
  perform custom.assert_store_door(p_organization_id, 'custom.record_delete');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_delete');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_delete: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- HOW DEEP THIS HAS GONE. A cascade that nests past 64 is a cycle somebody built, and
  -- saying so beats recursing until the server runs out of stack.
  v_depth := coalesce(nullif(current_setting('custom.delete_depth', true), '')::integer, 0);
  if v_depth > 64 then
    raise exception 'this delete reaches through more than 64 levels of containment, which is a loop rather than a hierarchy'
      using errcode = '54001',
            hint = 'REC-12: something contains one of its own containers. Break that link and delete again.';
  end if;

  -- STORE-TAILS-3: THE TOP OF ONE ARCHIVE. Everything this call and its cascade take is written
  -- down, in order, so the restore can bring back exactly this set. A Table's archive opens its
  -- event HERE, before the first row moves, so every History version this statement writes
  -- carries the event's id; `custom.table_archive` opens one for all of its chunks and says so
  -- in `custom.archive_event`.
  if v_depth = 0 then
    perform set_config('custom.archive_took', '', true);
    v_event := nullif(current_setting('custom.archive_event', true), '')::uuid;
    select r.data_class into v_class
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_record_id and r.deleted_at is null;
    if v_event is null
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = p_record_id
                      and r.table_id = custom.table_kernel_id() and r.data_class <> 'kernel'
                      and r.deleted_at is null) then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   'STORE-TAILS-3: a table archived as one unit — its fields, saved views, rules and records with it; restoring the table brings back exactly this set.');
      v_own_event := true;
    end if;
  end if;
  perform set_config('custom.delete_depth', (v_depth + 1)::text, true);

  -- THE RULE, BEFORE ANYTHING IS WRITTEN. It raises the refusals by name (a Field a formula
  -- reads, a Home its Tables live in, a Table whose fields something outside still reads, a
  -- relation set to refuse), detaches the set_null edges, and hands back everything this
  -- delete has to take with it.
  v_plan  := custom.delete_rule(p_organization_id, p_record_id, true);
  v_first := coalesce((v_plan ->> 'contents_first')::boolean, false);

  -- A TABLE FIRST TAKES WHAT IS IN IT. Its records, its saved views, its Rules and then its
  -- Fields all go while the Table is still there, so every guard on custom.record still has
  -- the Table and the Fields it validates against in front of it. Nothing is switched off.
  if v_first then
    -- THE WHOLE SET, SAID OUT LOUD BEFORE THE FIRST ROW GOES. REC-18 refuses a Field something
    -- still reads; inside this table, what reads it is going too, so it is not something that
    -- still reads it. Transaction-local, and put back exactly as it was afterwards.
    v_prev := coalesce(current_setting('custom.delete_set', true), '');
    perform set_config('custom.delete_set',
      v_prev || ',' || p_record_id::text || ',' ||
      coalesce((select string_agg(x #>> '{}', ',')
                  from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x), ''),
      true);
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if v_child <> p_record_id
         and exists (select 1 from custom.record r
                      where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
    perform set_config('custom.delete_set', v_prev, true);
  end if;

  update custom.record
     set deleted_at = now()
   where organization_id = p_organization_id and id = p_record_id and deleted_at is null
  returning deleted_at into v_at;

  if v_at is null then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was already deleted, so nothing changed.'
        using errcode = '02000',
              hint = 'REC-23: it is still here and still reversible - custom.record_restore(organization, record) brings it back.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'Nothing was deleted. The store is keyed (organization_id, id), so a record of another organization is not found by this one.';
  end if;

  -- STORE-TAILS-3: this row is part of what this archive took, in the order it went.
  perform set_config('custom.archive_took',
                     coalesce(current_setting('custom.archive_took', true), '') || p_record_id::text || ',',
                     true);

  -- THE CASCADE GOES THROUGH THIS SAME DOOR — so every record it takes is judged by the
  -- caller's own access, gets its own history capture, and applies its own rule in turn. The
  -- container is marked deleted first, which is also what stops a containment loop here.
  if not v_first then
    for v_child in select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_plan -> 'cascade_to', '[]'::jsonb)) x loop
      if exists (select 1 from custom.record r
                  where r.organization_id = p_organization_id and r.id = v_child and r.deleted_at is null) then
        perform custom.record_delete(p_organization_id, v_child);
      end if;
    end loop;
  end if;

  perform set_config('custom.delete_depth', v_depth::text, true);

  -- STORE-TAILS-3: THE BOTTOM OF ONE ARCHIVE. Write down what it took. A single row that took
  -- nothing with it needs no event (bringing it back was always exact); anything more — a table,
  -- a record that took what it contained, a row archived inside a table's chunked archive —
  -- is written to its event, each row with the exact moment it was archived.
  if v_depth = 0 then
    v_took := coalesce(string_to_array(rtrim(coalesce(current_setting('custom.archive_took', true), ''), ','), ',')::uuid[],
                       '{}'::uuid[]);
    perform set_config('custom.archive_took', '', true);
    if v_event is null and cardinality(v_took) > 1 then
      v_event := history.migration_record(p_organization_id, 'archive', coalesce(v_class, 'record'), p_record_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_record_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true),
                   format('STORE-TAILS-3: archived with %s row(s) it contained or cascaded to; restoring it brings back exactly this set.',
                          cardinality(v_took) - 1));
      v_own_event := true;
    end if;
    if v_event is not null and cardinality(v_took) > 0 then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'also', coalesce(m.inverse -> 'also', '[]'::jsonb)
                       || coalesce((select jsonb_agg(t.x::text order by t.o)
                                      from unnest(v_took) with ordinality as t(x, o)
                                     where t.x::text is distinct from m.inverse ->> 'record_id'), '[]'::jsonb),
               'took', coalesce(m.inverse -> 'took', '[]'::jsonb)
                       || (select jsonb_agg(jsonb_build_array(t.x::text, v_at) order by t.o)
                             from unnest(v_took) with ordinality as t(x, o)),
               'open', case when v_own_event then 'false'::jsonb else coalesce(m.inverse -> 'open', 'true'::jsonb) end,
               'archived_at', case when v_own_event then to_jsonb(v_at) else m.inverse -> 'archived_at' end)
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;
  return v_at;
end
$function$;

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE CHUNKED TABLE ARCHIVE IS ONE EVENT ACROSS ALL OF ITS CALLS
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.table_archive(p_organization_id uuid, p_table_id uuid, p_chunk integer DEFAULT 50, p_include_table boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
  v_table_now boolean := false;      -- did THIS call archive the Table record itself?
  v_event   uuid;                    -- STORE-TAILS-3: the one archive event of this operation
  v_prev_event text;
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

  -- STORE-TAILS-3: ONE EVENT FOR THE WHOLE OPERATION. A screen calls this door until `done`;
  -- every call's rows are written to the SAME open event, so the restore brings back the records
  -- chunk one archived together with the columns the last call archived. Opened only when this
  -- call is going to archive something.
  if v_chunk > 0
     and (exists (select 1 from custom.record r
                   where r.organization_id = p_organization_id and r.table_id = p_table_id
                     and r.data_class = 'record' and r.deleted_at is null)
          or (v_whole and v_table)) then
    select m.id into v_event
      from history.migration_log m
     where m.organization_id = p_organization_id
       and m.verb = 'archive'
       and m.target_kind = 'table'
       and m.target_id = p_table_id
       and m.undone_at is null
       and coalesce((m.inverse ->> 'open')::boolean, false)
     order by m.applied_at desc
     limit 1;
    if v_event is null then
      v_event := history.migration_record(p_organization_id, 'archive', 'table', p_table_id,
                   jsonb_build_object('kind', 'restore', 'record_id', p_table_id::text,
                                      'also', '[]'::jsonb, 'took', '[]'::jsonb, 'open', true,
                                      'whole', v_whole),
                   format('STORE-TAILS-3: %s archived as one unit — its records, fields, saved views and rules with it; restoring it brings back exactly this set.', v_name));
    end if;
    v_prev_event := coalesce(current_setting('custom.archive_event', true), '');
    perform set_config('custom.archive_event', v_event::text, true);
  end if;

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
  -- … AND ONLY WHEN THIS CALL WAS ASKED TO CHANGE SOMETHING. `p_chunk = 0` means "tell me,
  -- change nothing" (ARGS-RULED-2, 2026-09-23): until this line an empty Table with the table
  -- included was archived by the very call that promised to change nothing.
  if v_chunk > 0 and v_live = 0 and v_whole and v_table then
    perform custom.record_delete(p_organization_id, p_table_id);
    v_table := false;
    v_table_now := true;
  end if;

  v_done := v_live = 0 and (not v_whole or not v_table);

  -- STORE-TAILS-3: THE EVENT CLOSES WHEN THE OPERATION IS DONE — the table archived, or (for
  -- "empty it but keep it") every record archived. From then on a restore of the table brings
  -- back exactly what it names, and a later archive is a new event.
  if v_event is not null then
    perform set_config('custom.archive_event', v_prev_event, true);
    if v_done then
      update history.migration_log m
         set inverse = m.inverse || jsonb_build_object(
               'open', false,
               'archived_at', (select to_jsonb(r.deleted_at) from custom.record r
                                where r.organization_id = p_organization_id and r.id = p_table_id))
       where m.organization_id = p_organization_id and m.id = v_event;
    end if;
  end if;

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
    'archive_event', v_event,            -- STORE-TAILS-3: what "Bring it back" will restore
    'message',    case
      when v_chunk = 0 and v_live > 0 then
        format('%s record%s in %s would be archived. Nothing has been changed yet.',
               v_live, case when v_live = 1 then '' else 's' end, v_name)
      -- SAY WHAT THIS CALL DID (ARGS-RULED-2). An empty Table archived by THIS call used to be
      -- told "is already archived. Nothing was changed." — the opposite of what had happened.
      when v_chunk = 0 and v_whole and v_table then
        format('%s has no records left, so archiving it now would archive the table itself. Nothing has been changed yet.', v_name)
      when v_table_now and v_did = 0 then
        format('%s had no records left to archive, so the table itself is now archived — it can be brought back.', v_name)
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

-- ═════════════════════════════════════════════════════════════════════════════════════════
-- THE RESTORE BRINGS BACK THE UNIT
-- ═════════════════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION custom.record_restore(p_organization_id uuid, p_record_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rows  bigint;
  e       history.migration_log;       -- STORE-TAILS-3: the archive event this restore undoes
  m       record;
  v_back  integer := 0;
  v_left  integer := 0;
  v_wait  uuid[] := '{}';              -- structure rows whose guard wants another row back first
  v_again uuid[];
  v_round integer := 0;
  v_why   text;
  v_whose text;
  v_root_at timestamptz;               -- the moment the root was archived
  v_back_ids uuid[] := '{}';           -- every row this restore brought back (root included)
  v_back_at  timestamptz[] := '{}';    -- ... and the moment each had been archived
  a        record;
  v_joined integer := 0;
  v_kept   integer := 0;
  v_recon  boolean := false;           -- an event reconstructed for an archive made before events existed
  v_refused integer := 0;
  v_refused_why text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.record_restore');
  perform custom.assert_client_may_change(p_organization_id, p_record_id, 'custom.record_restore');

  if p_organization_id is null or p_record_id is null then
    raise exception 'custom.record_restore: organization_id and the record id are both required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;

  -- STORE-TAILS-3: WHAT THIS ARCHIVE TOOK WITH IT, read before the row moves (the event names
  -- the row by the `deleted_at` it carries now).
  e := custom.archive_event_of(p_organization_id, p_record_id);
  if e.id is not null
     and coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    -- The History versions this restore writes read "undo of archive" and carry the event's id.
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   e.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive',           true);
  end if;

  select r.deleted_at into v_root_at
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_record_id;

  update custom.record
     set deleted_at = null
   where organization_id = p_organization_id and id = p_record_id and deleted_at is not null;
  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    if exists (select 1 from custom.record r
                where r.organization_id = p_organization_id and r.id = p_record_id) then
      raise exception 'That record was not deleted, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
    raise exception 'There is no record % in this organization.', p_record_id
      using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.';
  end if;

  v_back_ids := array[p_record_id];
  v_back_at  := array[v_root_at];
  v_recon := coalesce((e.inverse ->> 'reconstructed')::boolean, false);

  if e.id is not null then
  -- EVERYTHING THE ARCHIVE TOOK, EXACTLY. Structure first — tables, then fields, then rules,
  -- then saved views — so every guard on a returning record has its table and its columns in
  -- front of it; then the records in the order they went (a container before what it
  -- contained). A row that is no longer archived at the moment this event archived it was
  -- brought back, or archived again, on its own since: it is not this event's, and it is left.
  --
  -- A column can depend on another column of the same set (a rollup reads through a relation
  -- column; a formula reads another formula), and the order the archive took them in says
  -- nothing about that. So a structure row whose own guard refuses it NOW is asked again after
  -- the rest of the structure is back, round by round, until a round brings nothing more back;
  -- one still refused then is refused by name, and nothing of this restore is kept.
  for m in
    select t.id, t.at, r.deleted_at as now_at,
           case when r.table_id = custom.table_kernel_id() then 1
                when r.table_id = custom.field_kernel_id() then 2
                when r.table_id = custom.rule_kernel_id() then 3
                when r.data ? 'layout' then 4
                else 5 end as pass,
           t.o
      from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
              from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) with ordinality as j(x, o)) t
      join custom.record r
        on r.organization_id = p_organization_id and r.id = t.id
     where t.id <> p_record_id
     order by pass, t.o
  loop
    -- The structure is not all back yet: the records wait for it (below).
    exit when m.pass = 5 and cardinality(v_wait) > 0;
    if m.now_at is null or m.now_at <> m.at then
      v_left := v_left + 1;
      continue;
    end if;
    perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
    if m.pass < 5 then
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        v_wait := v_wait || m.id;
      end;
    else
      -- The structure is all back by now, so a record that is refused is refused for itself.
      -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
      -- records by inference, so one of them refused on its own (a unique value that another
      -- record now holds) is left archived and counted, not a reason to bring back nothing.
      if v_recon then
        begin
          update custom.record
             set deleted_at = null
           where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
          v_back := v_back + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
        exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                    or invalid_parameter_value or not_null_violation then
          get stacked diagnostics v_refused_why = message_text;
          v_refused := v_refused + 1;
        end;
      else
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      end if;
    end if;
  end loop;

  while cardinality(v_wait) > 0 loop
    v_round := v_round + 1;
    v_again := '{}';
    v_why := null;
    for m in select t.id, t.at
               from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                       from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
              where t.id = any (v_wait)
              order by t.o loop
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        get stacked diagnostics v_why = message_text;
        v_again := v_again || m.id;
      end;
    end loop;
    if cardinality(v_again) = cardinality(v_wait) then
      select coalesce(nullif(r.data ->> 'label', ''), nullif(r.data ->> 'name', ''), r.data ->> 'key', r.id::text)
        into v_whose
        from custom.record r where r.organization_id = p_organization_id and r.id = v_wait[1];
      raise exception 'This could not be brought back as it was archived: "%" is refused on its own (%), so nothing was brought back.', v_whose, v_why
        using errcode = '23514',
              hint = 'STORE-TAILS-3: a restore brings back the whole of what its archive took, or none of it. Change what the refusal names (it changed after the archive), then bring it back again.';
    end if;
    v_wait := v_again;
    if cardinality(v_wait) = 0 then
      -- The structure is complete: now the records, in the order they went.
      for m in
        select t.id, t.at, r.deleted_at as now_at
          from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                  from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
          join custom.record r on r.organization_id = p_organization_id and r.id = t.id
         where t.id <> p_record_id
           and r.table_id is distinct from custom.table_kernel_id()
           and r.table_id is distinct from custom.field_kernel_id()
           and r.table_id is distinct from custom.rule_kernel_id()
           and not (r.data ? 'layout')
         order by t.o
      loop
        if m.now_at is not null and m.now_at = m.at then
          perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
          -- A RECONSTRUCTED event (an archive made before events existed, rebuilt by a rule) names
          -- records by inference, so one of them refused on its own (a unique value that another
          -- record now holds) is left archived and counted, not a reason to bring back nothing.
          if v_recon then
            begin
              update custom.record
                 set deleted_at = null
               where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
              v_back := v_back + 1;
              v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
            exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                        or invalid_parameter_value or not_null_violation then
              get stacked diagnostics v_refused_why = message_text;
              v_refused := v_refused + 1;
            end;
          else
            update custom.record
               set deleted_at = null
             where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
            v_back := v_back + 1;
            v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
          end if;
        else
          v_left := v_left + 1;
        end if;
      end loop;
    end if;
  end loop;

  end if;

  -- THE POINTERS THE ARCHIVE TOOK OUT OF OTHER RECORDS GO BACK IN. A relation set to "clear it"
  -- (`set_null`, `platform.relation_on_delete`) took this row's id out of every live record that
  -- pointed at it and tombstoned that edge in the same transaction — the tombstone (`deleted_at`
  -- = the moment this row was archived, no `deleted_via`, a relation field) is the record of it.
  -- For every row this restore brought back, each such pointer is written back into the record
  -- that held it, if that record is still here, the relation column still exists, and the
  -- pointer's place is still free (a single-value relation that now points somewhere else was
  -- changed on purpose since, and is left). The relation's own triggers put the edge back.
  for a in
    select x.id as edge_id, x.source_id, x.role, x.target_id
      from unnest(v_back_ids, v_back_at) as b(id, at)
      join platform.associations x
        on x.organization_id = p_organization_id
       and x.target_type = 'record' and x.target_id = b.id
       and x.source_type = 'record'
       and x.relation_field_id is not null
       and x.deleted_at = b.at
       and x.deleted_via_type is null
     order by x.created_at
  loop
    if exists (select 1 from custom.record s
                where s.organization_id = p_organization_id and s.id = a.source_id and s.deleted_at is null)
       and platform.relation_edge_has_a_live_field(p_organization_id,
             (select x.relation_field_id from platform.associations x where x.id = a.edge_id)) then
      update custom.record s
         set data = case
               when jsonb_typeof(s.data -> a.role) = 'array' then
                 case when s.data -> a.role @> to_jsonb(array[a.target_id::text]) then s.data
                      else jsonb_set(s.data, array[a.role], (s.data -> a.role) || to_jsonb(a.target_id::text)) end
               when jsonb_typeof(s.data -> a.role) = 'string' then s.data
               else jsonb_set(s.data, array[a.role],
                              case when coalesce((select (f.data ->> 'multi')::boolean
                                                    from custom.record f
                                                   where f.organization_id = p_organization_id
                                                     and f.id = (select x.relation_field_id from platform.associations x where x.id = a.edge_id)), false)
                                   then jsonb_build_array(a.target_id::text)
                                   else to_jsonb(a.target_id::text) end)
             end
       where s.organization_id = p_organization_id and s.id = a.source_id
         and jsonb_typeof(s.data -> a.role) is distinct from 'string';
      if found then v_joined := v_joined + 1; else v_kept := v_kept + 1; end if;
    else
      v_kept := v_kept + 1;
    end if;
  end loop;

  if e.id is null then
    if v_joined > 0 or v_kept > 0 then
      raise notice 'Linked back: % record(s) that pointed at it%.', v_joined,
        case when v_kept > 0 then format('; %s had changed since and were left as they are', v_kept) else '' end;
    end if;
    return;
  end if;

  update history.migration_log l
     set undone_at = now(),
         undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid()))
   where l.organization_id = p_organization_id and l.id = e.id;

  raise notice '%', format('Brought back with it: %s row(s) this archive took%s%s; %s record(s) that pointed at them linked back%s.',
    v_back,
    case when v_left > 0
         then format('; %s it also took had already come back or been archived again on their own since, and were left as they are', v_left)
         else '' end,
    case when v_refused > 0
         then format('; %s record(s) this reconstructed archive named were refused on their own and left archived (the last said: %s)', v_refused, v_refused_why)
         else '' end,
    v_joined,
    case when v_kept > 0 then format(' (%s had changed since and were left)', v_kept) else '' end);
end
$function$;

-- chair-step: this adds ONE new client door, custom.table_restore(uuid, uuid, integer) — declared in platform.client_callable_door first, then EXECUTE granted to `authenticated` (signed-in callers only; anon gains nothing; PUBLIC's implicit EXECUTE is cleared at birth by the definer guard). It replaces THREE bodies (same signatures and grants): public._trash_store_restore (a Table in Trash comes back through custom.table_restore's first pass and the Trash screen carries the rest on), and custom._record_field_validation + custom.validate_values (A RESTORE IS NOT AN EDIT: a row brought back exactly as it was archived is still judged for type and shape, but never refused by a `required` or a value rule declared after it went — for every restore door); custom.record_restore's own body is untouched. No table, column, index, trigger or policy is touched; the only row written is the door-register row. No strong lock: CREATE FUNCTION, one INSERT, one GRANT.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: public._trash_store_restore(uuid, uuid) 2dc9b3e8b96fffa290fb03afdfd1ee71d57de980f0c85b41d5f1703c3e73c729
-- based-on: custom._record_field_validation() 4e17ee9ad345855850cc1a28f839444787bce306257bb01bd06d616ddc71dd66
-- based-on: custom.validate_values(uuid, custom.record[], jsonb, text) 6e9fcd3b9a0df8f00630aae02a38eb947a6ddf8c6e5d176a3f23a7f8d141cbac
--
-- The inverse is `migrations/inverse/tableactions_c_a_table_comes_back_in_passes_too_down.sql`.
--
-- A TABLE COMES BACK IN PASSES TOO (TABLE-ACTIONS, 2026-10-03).
--
-- THE DEFECT. custom.record_restore on a Table brings back, in ONE statement, the Table, its Fields,
-- every record and every row built on it that its archive event took. On the clone it timed out for
-- "Referral Intake Queue 2026-Q4 (copy 7)"; the archive side was already chunked
-- (custom.table_archive, tableactions_b), the restore was not, and the Undo, the Data home's Restore
-- and the trash all called it.
--
-- THE FIX: custom.table_restore(organization, table, chunk) — the mirror of custom.table_archive,
-- one pass at a time, the caller looping until `done`:
--   · the Table comes back FIRST, with all of its structure (Fields, rules and saved views kept as
--     records) in the first pass, all of it or none of it — every returning record is judged against
--     its Table and Fields, so they must stand first; the event is then marked `restoring`, which is
--     how the next pass finds it once the Table is live;
--   · records come back in the order they went, at most `chunk` a pass, nothing new started once a
--     pass has run 1 s and done something; one refused on its own now is left archived and named
--     (the event's restore_left), so a run never stalls on a row and never hides one;
--   · then what was built on the Table (forms, inbound addresses, saved views, portals, child Tables
--     through this same door), from the event's `built_on`, each only if it still carries this
--     archive's moment — a row archived on its own earlier stays archived;
--   · the event is marked undone only when nothing it took is still waiting.
-- FIX ROUND (independent verifier, 2026-10-03): a restore is not an edit — `required` and value rules
-- added after a row went (a booking page's required "Appointment") never refuse it coming back, in
-- every restore door (custom._record_field_validation names the write, custom.validate_values skips
-- those two checks for it); an answer never says "is back" while rows stayed archived, and each row
-- left keeps its own reason in restore_left ({id: reason}); every open `restoring` event of the
-- Table is finished, oldest first, before the run is done (a re-archive mid-restore leaves two);
-- only rows an update actually changed are counted (two concurrent restores never both count one).
-- Same event, same rows, same moments as custom.record_restore; what is still waiting is read off
-- the rows every call, so a cut mid-run is carried on by the next call.

CREATE OR REPLACE FUNCTION custom.table_restore(p_organization_id uuid, p_table_id uuid, p_chunk integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- BRINGING A WHOLE TABLE BACK — ONE PASS OF IT (TABLE-ACTIONS, 2026-10-03). The mirror of
  -- custom.table_archive: custom.record_restore on a Table brought back, in ONE statement, the
  -- Table, its Fields, every record and every row built on it that its archive event took, and
  -- timed out on the clone for "Referral Intake Queue 2026-Q4 (copy 7)". This door does the same
  -- work, scoped to the same one archive event, in passes the caller loops until `done`.
  --
  -- THE TABLE COMES BACK FIRST, with its structure (its Fields, the rules and saved views kept as
  -- records that the event took) in the first pass, all of it or none of it, exactly as
  -- custom.record_restore does it. It cannot come back last: every returning record is judged by
  -- the store's guards against its Table and its Fields, so they must stand before the first
  -- record does. While the run is under way the event is marked `restoring` (a reload, a closed
  -- tab or a deploy mid-run leaves a next call that carries on from exactly there); records come
  -- back in the order they went, then what was built on the Table; the event is marked undone only
  -- when nothing it took is still waiting.
  --
  -- A PASS takes at most p_chunk rows (records, then built-on rows; each child-Table pass counts
  -- what it took) and starts nothing new once it has run for c_pass and done something.
  -- p_chunk = 0 changes nothing and only reports.
  c_max     constant integer := 1000;
  c_pass    constant interval := interval '1 second';
  v_until   timestamptz := clock_timestamp() + c_pass;
  v_chunk   integer;
  v_left    integer;
  e         history.migration_log;
  v_root_at timestamptz;
  v_name    text;
  v_is_table boolean;
  v_table_now boolean := false;      -- did THIS call bring the Table row itself back?
  m         record;
  a         record;
  v_on      record;
  v_struct  integer := 0;            -- Table, Fields, rules, saved views this call brought back
  v_back    integer := 0;            -- records this call brought back
  v_on_did  integer := 0;            -- built-on rows (and child-Table passes) this call brought back
  v_more    boolean := false;        -- something built on the table waits for the next call
  v_wait    uuid[] := '{}';
  v_again   uuid[];
  v_round   integer := 0;
  v_why     text;
  v_whose   text;
  v_fwait   uuid[] := '{}';
  v_fwhy    text;
  v_fleft   integer := 0;
  v_back_ids uuid[] := '{}';
  v_back_at  timestamptz[] := '{}';
  v_refused_why text;
  v_kept    jsonb;                   -- this event's rows left archived: {id: the store's reason}
  v_kept_all integer := 0;           -- rows left archived across every event this run finished
  v_last_why text;
  v_events  integer := 0;            -- events this call finished
  v_waiting integer := 0;            -- restoring events still open after this call
  v_recs    integer;
  v_on_wait integer;
  v_child_res jsonb;
  v_n       integer;
  v_done    boolean := false;
  v_joined  integer := 0;
  v_ok      boolean;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.table_restore');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_restore');
  if p_organization_id is null or p_table_id is null then
    raise exception 'Bringing a table back needs the organization and the table, and this call does not say which.'
      using errcode = '22004';
  end if;

  select coalesce(nullif(r.data ->> 'name', ''), 'this table'), r.deleted_at,
         r.table_id = custom.table_kernel_id() and r.data_class = 'table'
    into v_name, v_root_at, v_is_table
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_table_id;
  if not found or not coalesce(v_is_table, false) then
    raise exception 'There is no such table in this organization, so there is nothing to bring back.' using errcode = '02000',
            hint = 'The store is keyed (organization_id, id), so a table of another organization is not found by this one. Nothing was changed.',
            detail = jsonb_build_object('table_id', p_table_id)::text;
  end if;
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_restore');
  v_chunk := least(greatest(coalesce(p_chunk, 20), 0), c_max);

  -- THE EVENT THE FIRST PASS UNDOES (every later pass works through every open `restoring` event of
  -- this Table, oldest first — a Table archived again mid-restore leaves two): the archive event of the Table while it is archived; once the
  -- first pass has brought the Table back, the event this run marked `restoring`.
  if v_root_at is not null then
    e := custom.archive_event_of(p_organization_id, p_table_id);
  else
    select l.* into e
      from history.migration_log l
     where l.organization_id = p_organization_id
       and l.target_id = p_table_id
       and l.verb = 'archive'
       and l.undone_at is null
       and l.inverse ->> 'kind' = 'restore'
       and coalesce((l.inverse ->> 'restoring')::boolean, false)
     order by l.applied_at desc
     limit 1;
    if e.id is null then
      raise exception 'That table was not archived, so there was nothing to bring back.'
        using errcode = '02000', hint = 'REC-23: it is already here.';
    end if;
  end if;

  -- AN ARCHIVE WITH NO EVENT (made before events existed, or outside the store's doors) names no
  -- records: the record door's own restore brings back the Table and the Fields archived with it.
  if e.id is null then
    if v_chunk > 0 then
      perform custom.record_restore(p_organization_id, p_table_id);
    end if;
    return jsonb_build_object(
      'table_id', p_table_id, 'table_name', v_name, 'restored', 0, 'structure_restored', 0,
      'built_on_restored', 0, 'remaining', 0, 'built_on_remaining', 0, 'left', 0,
      'table_restored', v_chunk > 0, 'done', v_chunk > 0, 'chunk', v_chunk, 'archive_event', null,
      'message', case when v_chunk = 0
                      then format('%s would be brought back. Nothing has been changed yet.', v_name)
                      else format('%s is back.', v_name) end);
  end if;


  if v_chunk > 0
     and coalesce(nullif(current_setting('history.mark_at', true), ''), '') <> statement_timestamp()::text then
    -- The History versions this restore writes read "undo of archive" and carry the event's id.
    perform set_config('history.mark_at',   statement_timestamp()::text, true);
    perform set_config('history.mark_id',   e.id::text,                  true);
    perform set_config('history.mark_verb', 'undo of archive',           true);
  end if;

  -- ══ PASS ONE: THE TABLE AND ITS STRUCTURE, all of it or none of it ═════════════════════════
  if v_chunk > 0 and v_root_at is not null then
    update custom.record set deleted_at = null
     where organization_id = p_organization_id and id = p_table_id and deleted_at = v_root_at;
    -- Counted only when THIS call changed the row (a concurrent restore that got there first did it).
    if found then
      v_table_now := true;
      v_struct := 1;
      v_back_ids := array[p_table_id]; v_back_at := array[v_root_at];
    end if;

    -- FIELD-ARCHIVE-CASCADE: the Fields archived at the Table's own moment that the event does not name.
    for m in
      select f.id
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.data ->> 'entity_definition_id' = p_table_id::text
         and f.deleted_at = v_root_at
         and not exists (select 1 from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) t
                          where t ->> 0 = f.id::text)
       order by f.created_at, f.id
    loop
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.table_restore');
      begin
        update custom.record set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        if found then
          v_struct := v_struct + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
        end if;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        v_fwait := v_fwait || m.id;
      end;
    end loop;

    -- The structure the event took — tables, then fields, then rules, then saved views — each only
    -- if it still carries this event's moment. One whose own guard refuses it now is asked again
    -- after the rest is back, round by round; one still refused then refuses the whole pass by name.
    for m in
      select t.id, t.at
        from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) with ordinality as j(x, o)) t
        join custom.record r on r.organization_id = p_organization_id and r.id = t.id
       where t.id <> p_table_id
         and r.deleted_at = t.at
         and (r.table_id in (custom.table_kernel_id(), custom.field_kernel_id(), custom.rule_kernel_id())
              or r.data ? 'layout')
       order by case when r.table_id = custom.table_kernel_id() then 1
                     when r.table_id = custom.field_kernel_id() then 2
                     when r.table_id = custom.rule_kernel_id() then 3
                     else 4 end, t.o
    loop
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.table_restore');
      begin
        update custom.record set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        if found then
          v_struct := v_struct + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
        end if;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        v_wait := v_wait || m.id;
      end;
    end loop;
    while cardinality(v_wait) > 0 loop
      v_round := v_round + 1;
      v_again := '{}';
      for m in select t.id, t.at
                 from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                         from jsonb_array_elements(e.inverse -> 'took') with ordinality as j(x, o)) t
                where t.id = any (v_wait)
                order by t.o loop
        begin
          update custom.record set deleted_at = null
           where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
          if found then
            v_struct := v_struct + 1;
            v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
          end if;
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
                hint = 'STORE-TAILS-3: a table comes back with the whole of its structure or none of it. Change what the refusal names (it changed after the archive), then bring it back again.';
      end if;
      v_wait := v_again;
    end loop;

    -- The Fields that waited for the rest of the structure, asked once more; one still refused stays
    -- archived and is named — never a reason to keep the Table itself archived.
    for m in select x.id from unnest(v_fwait) with ordinality as x(id, o) order by x.o loop
      begin
        update custom.record set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        if found then
          v_struct := v_struct + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
        end if;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        get stacked diagnostics v_fwhy = message_text;
        v_fleft := v_fleft + 1;
      end;
    end loop;
    if v_fleft > 0 then
      raise notice '%', format('Columns brought back with the table: %s; %s stayed archived (the last said: %s).',
                               greatest(v_struct - 1, 0), v_fleft, v_fwhy);
    end if;

    update history.migration_log l
       set inverse = l.inverse || jsonb_build_object('restoring', true, 'restoring_from', to_jsonb(v_root_at),
                                                     'restoring_since', to_jsonb(now()))
     where l.organization_id = p_organization_id and l.id = e.id;
  end if;



  -- ══ EVERY OPEN `restoring` EVENT OF THIS TABLE, OLDEST FIRST ════════════════════════════════
  -- A Table archived again in the middle of a restore carries two: the first run's rows still
  -- waiting under their own moment, and the second archive's. Each is finished in turn, and the run
  -- is done only when none is open (TABLE-ACTIONS ruling 2, 2026-10-03).
  v_left := v_chunk;
  v_recs := 0; v_on_wait := 0;
  <<events>>
  loop
    exit when v_chunk = 0;
    select l.* into e
      from history.migration_log l
     where l.organization_id = p_organization_id
       and l.target_id = p_table_id
       and l.verb = 'archive'
       and l.undone_at is null
       and l.inverse ->> 'kind' = 'restore'
       and coalesce((l.inverse ->> 'restoring')::boolean, false)
     order by l.applied_at asc
     limit 1;
    exit when e.id is null;
    perform set_config('history.mark_id', e.id::text, true);
    v_kept := coalesce(e.inverse -> 'restore_left', '{}'::jsonb);
    if jsonb_typeof(v_kept) <> 'object' then v_kept := '{}'::jsonb; end if;
    v_back_ids := '{}'; v_back_at := '{}';

    -- THE RECORDS, in the order they went. One refused on its own now (a value another row took
    -- since) is left archived with the store's own reason, per row, in the event's restore_left.
    for m in
      select t.id, t.at
        from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at, o
                from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) with ordinality as j(x, o)) t
        join custom.record r on r.organization_id = p_organization_id and r.id = t.id
       where t.id <> p_table_id
         and r.deleted_at = t.at
         -- a row with no table (a checklist template, a dashboard) is a record here, as in custom.record_restore
         and (r.table_id is null
              or r.table_id not in (custom.table_kernel_id(), custom.field_kernel_id(), custom.rule_kernel_id()))
         and not (r.data ? 'layout')
         and not (v_kept ? t.id::text)
       order by t.o
    loop
      if v_left < 1 or (v_struct + v_back + v_on_did > 0 and clock_timestamp() > v_until) then
        v_more := true;
        exit;
      end if;
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.table_restore');
      begin
        update custom.record set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
        -- Counted only when THIS call changed the row (ruling 3: a concurrent restore that got there
        -- first is not counted twice).
        if found then
          v_back := v_back + 1;
          v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
        end if;
      exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        get stacked diagnostics v_refused_why = message_text;
        v_kept := v_kept || jsonb_build_object(m.id::text, v_refused_why);
        v_last_why := v_refused_why;
      end;
      v_left := v_left - 1;
    end loop;

    -- THE POINTERS THE ARCHIVE TOOK OUT OF OTHER RECORDS GO BACK IN, for every row this pass
    -- brought back (custom.record_restore's own rule: a `set_null` relation's tombstone at this
    -- row's archive moment, the source still here, the column still live, the place still free).
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
        if found then v_joined := v_joined + 1; end if;
      end if;
    end loop;


    -- WHAT WAS BUILT ON THE TABLE, once this event's records are back.
    if not v_more and not exists (
         select 1
           from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at
                   from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) x) t
           join custom.record r on r.organization_id = p_organization_id and r.id = t.id
          where t.id <> p_table_id and r.deleted_at = t.at and not (v_kept ? t.id::text)) then
      for v_on in
        select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
          from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x
      loop
        continue when v_kept ? v_on.id::text;
        continue when not case v_on.kind
          when 'anon_form' then exists (select 1 from custom.anon_form x where x.organization_id = p_organization_id and x.id = v_on.id and x.deleted_at = v_on.at)
          when 'anon_inbound' then exists (select 1 from custom.anon_inbound x where x.organization_id = p_organization_id and x.id = v_on.id and x.deleted_at = v_on.at)
          when 'saved_view' then exists (select 1 from platform.saved_view x where x.organization_id = p_organization_id and x.id = v_on.id and x.deleted_at = v_on.at)
          when 'portal' then exists (select 1 from custom.portal x where x.organization_id = p_organization_id and x.id = v_on.id and x.archived_at = v_on.at)
          when 'table' then exists (select 1 from custom.record c where c.organization_id = p_organization_id and c.id = v_on.id and c.data_class = 'table' and c.deleted_at is not null)
                         or exists (select 1 from history.migration_log l where l.organization_id = p_organization_id and l.target_id = v_on.id
                                       and l.verb = 'archive' and l.undone_at is null and coalesce((l.inverse ->> 'restoring')::boolean, false))
          else false end;
        if v_left < 1 or (v_struct + v_back + v_on_did > 0 and clock_timestamp() > v_until) then
          v_more := true;
          exit;
        end if;
        if v_on.kind = 'table' then
          -- A child Table (a bookings Table's slots) comes back through this same door, one pass of
          -- it per pass of the parent, with everything its own archive event took.
          v_child_res := custom.table_restore(p_organization_id, v_on.id, v_left);
          v_n := greatest(coalesce((v_child_res ->> 'restored')::integer, 0)
                          + coalesce((v_child_res ->> 'structure_restored')::integer, 0)
                          + coalesce((v_child_res ->> 'built_on_restored')::integer, 0), 1);
          v_left := v_left - v_n;
          v_on_did := v_on_did + v_n;
          perform set_config('history.mark_id', e.id::text, true);
          if not coalesce((v_child_res ->> 'done')::boolean, true) then
            v_more := true;
            exit;
          end if;
          continue;
        end if;
        begin
          if v_on.kind = 'anon_form' then
            update custom.anon_form set deleted_at = null
             where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
          elsif v_on.kind = 'anon_inbound' then
            update custom.anon_inbound set deleted_at = null
             where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
          elsif v_on.kind = 'saved_view' then
            update platform.saved_view set deleted_at = null
             where organization_id = p_organization_id and id = v_on.id and deleted_at = v_on.at;
          elsif v_on.kind = 'portal' then
            update custom.portal set archived_at = null, archived_by = null, archive_reason = null
             where organization_id = p_organization_id and id = v_on.id and archived_at = v_on.at;
          end if;
          if found then v_on_did := v_on_did + 1; end if;
        exception when unique_violation or check_violation then
          get stacked diagnostics v_refused_why = message_text;
          v_kept := v_kept || jsonb_build_object(v_on.id::text, v_refused_why);
          v_last_why := v_refused_why;
        end;
        v_left := v_left - 1;
      end loop;
    end if;

    -- What this event has left archived, carried on it with each row's own reason.
    if v_kept is distinct from coalesce(e.inverse -> 'restore_left', '{}'::jsonb) then
      update history.migration_log l
         set inverse = l.inverse || jsonb_build_object('restore_left', v_kept)
       where l.organization_id = p_organization_id and l.id = e.id;
    end if;

    -- WHAT IS STILL WAITING in this event (read off the rows themselves).
    select count(*) into v_recs
      from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at
              from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) x) t
      join custom.record r on r.organization_id = p_organization_id and r.id = t.id
     where r.deleted_at = t.at
       and not (v_kept ? t.id::text);
    select count(*) into v_on_wait
      from (select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
              from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x) b
     where not (v_kept ? b.id::text)
       and case b.kind
         when 'anon_form' then exists (select 1 from custom.anon_form x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
         when 'anon_inbound' then exists (select 1 from custom.anon_inbound x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
         when 'saved_view' then exists (select 1 from platform.saved_view x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
         when 'portal' then exists (select 1 from custom.portal x where x.organization_id = p_organization_id and x.id = b.id and x.archived_at = b.at)
         when 'table' then exists (select 1 from custom.record c where c.organization_id = p_organization_id and c.id = b.id and c.data_class = 'table' and c.deleted_at is not null)
                        or exists (select 1 from history.migration_log l where l.organization_id = p_organization_id and l.target_id = b.id
                                      and l.verb = 'archive' and l.undone_at is null and coalesce((l.inverse ->> 'restoring')::boolean, false))
         else false end;

    exit events when v_more or v_recs > 0 or v_on_wait > 0;

    -- THIS EVENT IS UNDONE: nothing it took is still waiting. On to the next open one, if any.
    update history.migration_log l
       set undone_at = now(),
           undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
           inverse = l.inverse - 'restoring'
     where l.organization_id = p_organization_id and l.id = e.id;
    v_events := v_events + 1;
    v_kept_all := v_kept_all + (select count(*) from jsonb_object_keys(v_kept));
  end loop;

  -- A LOOK (p_chunk = 0) counts what the event would bring back; it changes nothing.
  if v_chunk = 0 then
    v_kept := coalesce(e.inverse -> 'restore_left', '{}'::jsonb);
    if jsonb_typeof(v_kept) <> 'object' then v_kept := '{}'::jsonb; end if;
    select count(*) into v_recs
      from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at
              from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) x) t
      join custom.record r on r.organization_id = p_organization_id and r.id = t.id
     where r.deleted_at = t.at and not (v_kept ? t.id::text);
    select count(*) into v_on_wait from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb));
  end if;

  select count(*) into v_waiting
    from history.migration_log l
   where l.organization_id = p_organization_id and l.target_id = p_table_id and l.verb = 'archive'
     and l.undone_at is null and coalesce((l.inverse ->> 'restoring')::boolean, false);
  v_done := v_chunk > 0 and v_waiting = 0
            and not exists (select 1 from custom.record r
                             where r.organization_id = p_organization_id and r.id = p_table_id and r.deleted_at is not null);
  if v_done then
    -- EVERYTHING STILL LEFT ARCHIVED, whichever event of this Table left it (the run may have
    -- finished two): each row named with the store's own reason, only while it is still archived.
    select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) into v_kept
      from history.migration_log l
      cross join lateral jsonb_each(case when jsonb_typeof(l.inverse -> 'restore_left') = 'object'
                                          then l.inverse -> 'restore_left' else '{}'::jsonb end) k
     where l.organization_id = p_organization_id and l.target_id = p_table_id and l.verb = 'archive'
       and l.undone_at is not null
       -- THIS run's events: finished since its first pass (the latest `restoring_since`), never a
       -- row an earlier, separate restore of this Table left behind.
       and l.undone_at >= coalesce((select max((x.inverse ->> 'restoring_since')::timestamptz)
                                      from history.migration_log x
                                     where x.organization_id = p_organization_id and x.target_id = p_table_id
                                       and x.verb = 'archive'), '-infinity'::timestamptz)
       and exists (select 1 from custom.record r
                    where r.organization_id = p_organization_id and r.id = k.key::uuid and r.deleted_at is not null);
  end if;

  return jsonb_build_object(
    'table_id',           p_table_id,
    'table_name',         v_name,
    'restored',           v_back,                -- records THIS call brought back (rows it changed)
    'structure_restored', v_struct,              -- the Table, its Fields, rules and views (first pass)
    'built_on_restored',  v_on_did,              -- what is built on the Table, THIS call
    'remaining',          v_recs,                -- rows of the event being finished still waiting
    'built_on_remaining', v_on_wait,
    'events_open',        v_waiting,             -- restoring events of this Table still open
    'left',               coalesce((select count(*) from jsonb_object_keys(coalesce(v_kept, '{}'::jsonb))), 0),
    'left_ids',           coalesce((select jsonb_agg(k) from jsonb_object_keys(coalesce(v_kept, '{}'::jsonb)) k), '[]'::jsonb),
    'left_reasons',       coalesce(v_kept, '{}'::jsonb),
    'table_restored',     not exists (select 1 from custom.record r
                                       where r.organization_id = p_organization_id and r.id = p_table_id and r.deleted_at is not null),
    'done',               v_done,
    'chunk',              v_chunk,
    'archive_event',      e.id,
    'message', case
      when v_chunk = 0 then
        format('%s record%s and %s thing%s built on %s would be brought back. Nothing has been changed yet.',
               v_recs, case when v_recs = 1 then '' else 's' end,
               v_on_wait, case when v_on_wait = 1 then '' else 's' end, v_name)
      -- NO "IS BACK" WHILE ROWS STAYED (ruling 1): how many came back and how many stayed, and why.
      when v_done and coalesce((select count(*) from jsonb_object_keys(coalesce(v_kept, '{}'::jsonb))), 0) > 0 then
        format('%s is back, but %s of what it held stayed archived: each is refused on its own now (%s).',
               v_name, (select count(*) from jsonb_object_keys(v_kept)),
               coalesce(v_last_why, (select v from jsonb_each_text(v_kept) as j(k, v) limit 1)))
      when v_done then format('%s is back, with everything its archive took.', v_name)
      else format('%s is coming back; %s record%s and %s thing%s built on it still to bring back. Call again to carry on.',
                  v_name, v_recs, case when v_recs = 1 then '' else 's' end,
                  v_on_wait, case when v_on_wait = 1 then '' else 's' end)
    end);
end
$function$
;

comment on function custom.table_restore(uuid, uuid, integer) is
  'TABLE-ACTIONS. Brings an archived Table back in resumable passes, scoped to its one archive event: the Table and its whole structure first (all or none), then its records in the order they went, then what was built on it; at most p_chunk rows a pass, nothing new started 1 s into a call; the caller loops until done. p_chunk = 0 reports and changes nothing.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values
  ('custom', 'table_restore',
   'p_organization_id uuid, p_table_id uuid, p_chunk integer',
   array['uuid'::regtype::oid, 'uuid'::regtype::oid, 'int4'::regtype::oid],
   'Bring an archived table back in resumable passes. The one-statement restore (custom.record_restore on a Table) timed out on a table with records and things built on it, so the screen restores in passes. Every row comes back exactly as the archive event took it; nothing else is touched.',
   'tableactions_c_a_table_comes_back_in_passes_too.sql', null, true, false,
   jsonb_build_object(
     'version', 1,
     'declared_by', 'tableactions_c_a_table_comes_back_in_passes_too.sql',
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false,
         'check', 'custom.assert_store_door then custom.assert_client_may_reach(p_organization_id, ''custom.table_restore''): a non-member is refused 42501 by name before any read; a NULL organization is refused 22004.',
         'access', 'member', 'entity', 'organization',
         'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
         'null_rule', jsonb_build_object('says', 'needs the organization and the table', 'sqlstate', '22004')),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false,
         'check', 'The Table is resolved WHERE organization_id = p_organization_id AND id = p_table_id and must be a Table (data_class table on the Table kernel) — another organization''s is not found, 02000, exactly as an invented one — then custom.assert_client_may_change(organization, table) asks the rung custom.record_restore asks, and every row brought back is asked the same rung.',
         'access', 'the rung custom.record_restore asks of the Table', 'entity', 'custom_record',
         'foreign', jsonb_build_object('sqlstate', '02000', 'same_as_invented', true,
                                       'note', 'the sentence quotes back the id the CALLER passed and nothing else'),
         'null_rule', jsonb_build_object('says', 'needs the organization and the table', 'sqlstate', '22004')),
       'p_chunk', jsonb_build_object(
         'type', 'integer', 'position', 3, 'optional', true, 'sql_default', '20',
         'check', 'A KNOB: how many rows this pass brings back (records, then what is built on the Table). 0 = tell me, change nothing; clamped to 0..1000.',
         'foreign', jsonb_build_object('not_an_id', true),
         'null_rule', jsonb_build_object('means', '20')))))
on conflict do nothing;

grant execute on function custom.table_restore(uuid, uuid, integer) to authenticated;

CREATE OR REPLACE FUNCTION public._trash_store_restore(p_organization_id uuid, p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_class text;
begin
  select r.data_class into v_class
    from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id;
  case v_class
    when 'field'        then perform custom.field_restore(p_organization_id, p_id);
    when 'rule'         then perform custom.rule_restore(p_organization_id, p_id);
    when 'relation'     then perform custom.relation_restore(p_organization_id, p_id);
    when 'doc_template' then perform custom.doc_template_restore(p_organization_id, p_id);
    when 'dashboard'    then perform custom.dashboard_restore(p_organization_id, p_id);
    -- TABLE-ACTIONS (2026-10-03): a Table comes back in passes. Trash brings back the Table, its
    -- structure and a first bounded pass; the Trash screen carries the rest on through the same door.
    when 'table'        then perform custom.table_restore(p_organization_id, p_id, 20);
    else perform custom.record_restore(p_organization_id, p_id);
  end case;
end
$function$
;

CREATE OR REPLACE FUNCTION custom.validate_values(p_organization_id uuid, p_fields custom.record[], p_values jsonb, p_record_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  f        custom.record;
  d        jsonb;
  v_label  text;
  v_key    text;
  v_type   text;
  v_multi  boolean;
  v_val    jsonb;
  v_one    jsonb;
  v_items  jsonb;
  v_n      integer;
  v_rule   jsonb;
  v_kind   text;
  v_other  jsonb;
  v_table  uuid;
  v_map    jsonb;
  v_field  jsonb;
  v_types  text[];
begin
  if p_fields is null or array_length(p_fields, 1) is null then
    return;
  end if;

  -- CHOICE-VALUE. The type field's value is the option's KEY now, and `applies_to_types` was
  -- written by whoever declared the Field or the Rule - in words, in keys, or (before this
  -- lane) in option ids. All three name the same choice, so all three are asked. This is what
  -- keeps T8's Square rule attached to the square.
  -- THE MAP IS BUILT FROM THE FIELDS THEMSELVES, not from a Table id. MEASURED 2026-09-20
  -- 07:27Z: the fields of a STANDARD entity's `custom_fields` (REC-40) carry `table_token` and
  -- no `entity_definition_id` at all, so asking `custom.choice_field_map` for a Table produced
  -- an empty map and every valid choice on `crm.party` was refused. Each list Field already
  -- names the Table its choices come from; that is the only thing this needs.
  select coalesce(jsonb_object_agg(f2.data ->> 'key', jsonb_build_object(
           'label',   coalesce(nullif(f2.data ->> 'label', ''), f2.data ->> 'key'),
           'options', custom.choice_options(p_organization_id,
                        (f2.data -> 'config' ->> 'options_table_id')::uuid))), '{}'::jsonb)
    into v_map
    from unnest(p_fields) f2
   where f2.data ->> 'type' = 'list'
     and nullif(f2.data -> 'config' ->> 'options_table_id', '') is not null;

  v_types := case when p_record_type is null then '{}'::text[]
                  else custom.choice_synonyms_in(v_map, p_record_type) end;

  foreach f in array p_fields loop
    d       := f.data;
    v_key   := d ->> 'key';
    v_label := coalesce(nullif(d ->> 'label', ''), v_key);
    v_type  := d ->> 'type';
    v_multi := coalesce((d ->> 'multi')::boolean, false);
    v_val   := p_values -> v_key;

    -- REQUIRED. An absent key and a null value are the same absence and are said the same way.
    if v_val is null or jsonb_typeof(v_val) = 'null'
       or (v_multi and jsonb_typeof(v_val) = 'array' and jsonb_array_length(v_val) = 0) then
      -- A RESTORE IS NOT AN EDIT (TABLE-ACTIONS ruling, 2026-10-03): a row brought back exactly as
      -- it was archived is never refused by a `required` declared after it went (a bookings page's
      -- "Appointment"); custom._record_field_validation names that write in custom.validating_restore.
      if coalesce((d ->> 'required')::boolean, false)
         and coalesce(current_setting('custom.validating_restore', true), '') <> '1' then
        raise exception '% is required', v_label
          using errcode = '23514', hint = format('REC-51: the field %s of this table.', v_key);
      end if;
      continue;
    end if;

    -- A FORMULA IS NEVER WRITTEN BY HAND (FLD-9): the declaration says who computes it.
    if v_type = 'formula' then
      raise exception '% is worked out by the system, so it cannot be typed in', v_label
        using errcode = '23514',
              hint = format('FLD-9: this formula computes on %s.', coalesce(d ->> 'compute_on', 'write'));
    end if;

    -- A RELATION'S CARDINALITY IS `relation_max`, AND ONE TARGET IS A LIST OF ONE (REL-7,
    -- lane STORE-TXN-3 2026-09-22). FLD-2's `multi` and FLD-13's `relation_max` are two words
    -- for one fact and the store let them disagree: `custom._field_document_for` DERIVES
    -- relation_max from multi but never the reverse, so a caller that declared
    -- `relation_max: 50` and said nothing about multi got a column whose declaration reads
    -- "many" (`platform.relation_declaration` answers cardinality `many` off relation_max) and
    -- whose value shape was refused as "holds one value, and it was given a list". Measured
    -- 2026-09-22 on the field `matrx_records`' own `field_propose` declares for the keyword
    -- research graph. REL-7 already settles it in words — *"a relation points at at most one
    -- thing, or at many — both are written as a list, so the shape never has to change when
    -- the cardinality does. One target is a list of one."* — so for a relation the shape is
    -- read here, a scalar is a list of one, and the CEILING below is the only limit.
    if v_type = 'relation' then
      v_items := case when jsonb_typeof(v_val) = 'array'
                      then v_val else jsonb_build_array(v_val) end;
    elsif v_multi then
      if jsonb_typeof(v_val) <> 'array' then
        raise exception '% holds many values, so it takes a list', v_label
          using errcode = '23514', hint = 'FLD-2: the multi modifier.';
      end if;
      v_items := v_val;
    else
      if jsonb_typeof(v_val) = 'array' then
        raise exception '% holds one value, and it was given a list', v_label
          using errcode = '23514', hint = 'FLD-2: multi is off for this field.';
      end if;
      v_items := jsonb_build_array(v_val);
    end if;

    for v_one in select e from jsonb_array_elements(v_items) e loop
      -- TYPE.
      if v_type = 'boolean' then
        -- LIMITS-FIX: a tick is a REAL boolean. A record that never answered carries no key
        -- at all and left through the absence branch above, so `false` arriving here is a
        -- person SAYING no — a different fact from never having been asked, and the store
        -- keeps the two apart rather than flattening them into one empty box.
        if jsonb_typeof(v_one) <> 'boolean' then
          raise exception '% is ticked or left unticked, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-1: boolean. Write true or false. The WORDS "Yes" and "No" are a choice list, which is a different kind of column.';
        end if;
      elsif v_type = 'text' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes words, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: text.';
        end if;
      elsif v_type = 'range' then
        if jsonb_typeof(v_one) = 'number' then
          null;
        elsif jsonb_typeof(v_one) = 'string'
              and coalesce(d -> 'config' ->> 'kind', 'number') in ('date', 'datetime') then
          begin
            perform (v_one #>> '{}')::timestamptz;
          exception when others then
            raise exception '% takes a date, and % is not one', v_label, v_one #>> '{}'
              using errcode = '23514', hint = 'FLD-1: range, of kind date.';
          end;
        else
          raise exception '% takes a number, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: range.';
        end if;
      elsif v_type = 'list' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% takes one of its choices, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514',
                  hint = 'FLD-5 / FLD-6: a list field stores the option''s own KEY - a short stable word - because every pick-list is already a Table.';
        end if;
        -- OPTION MEMBERSHIP. The value is the KEY of an option of this Field's own Table.
        -- A RETIRED option's key passes here ON PURPOSE: a record that already holds one has
        -- to stay editable when somebody changes a different column. Picking a retired choice
        -- ANEW is refused by custom._resolve_choice_words, which is the only place that can
        -- tell a new pick from a value that was already there.
        -- A TOKEN THAT NAMES ONE OF THE CHOICES. The KEY is the contract and is what
        -- `custom._resolve_choice_words` stores; the label and the option's own id are
        -- accepted too, because a surface with no normaliser in front of it (a standard
        -- entity's `custom_fields`) writes what its caller sent and must not be refused for
        -- naming the right choice a different way.
        v_field := v_map -> v_key;
        -- LIST-COPY-PERMISSIVE (2026-09-26): a column that takes other values
        -- (`config.allow_other`) holds a word that is none of its choices as an other value;
        -- custom._resolve_choice_words keeps it as typed, and it passes here.
        if v_field is null
           or (custom.choice_key_of(v_field, v_one #>> '{}') is null
               and not coalesce((d -> 'config' ->> 'allow_other')::boolean, false)) then
          raise exception '% was given a choice that is not one of its choices', v_label
            using errcode = '23514',
                  hint = format('REC-51: option membership. The choices for %s are %s.', v_label,
                                coalesce(custom.choice_words(coalesce(v_field, '{}'::jsonb)),
                                         'the records of its own table, and it has none yet'));
        end if;
      elsif v_type = 'relation'
            and jsonb_typeof(d -> 'config' -> 'allowed_types') = 'array'
            and jsonb_array_length(d -> 'config' -> 'allowed_types') > 0 then
        -- ── SC-R / P12: AN ENTITY REFERENCE. Each value is {token, id}: which kind of platform
        -- thing, and which one. The kind is one this Field allows; the thing is live and the
        -- writer may open it (custom._entity_reference_target_ok, the relation rule asked of a
        -- platform entity). Missing and forbidden say the same sentence.
        if jsonb_typeof(v_one) <> 'object'
           or nullif(btrim(coalesce(v_one ->> 'token', '')), '') is null
           or coalesce(v_one ->> 'id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something on the platform, and it was given %', v_label,
                          case when jsonb_typeof(v_one) = 'object' then 'something with no kind or no id'
                               else 'a ' || jsonb_typeof(v_one) end
            using errcode = '23514',
                  hint = format('SC-R / P12: each value of %s is {"token": "<kind>", "id": "<uuid>"} — the kind is one of %s.',
                                v_label, (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(d -> 'config' -> 'allowed_types') x));
        end if;
        if not ((d -> 'config' -> 'allowed_types') ? lower(btrim(v_one ->> 'token'))) then
          raise exception '% points at %, and it can only point at %', v_label,
                          coalesce((select e.label from platform.entity_types e where e.token = lower(btrim(v_one ->> 'token'))),
                                   v_one ->> 'token'),
                          (select string_agg(coalesce(e.label, x #>> '{}'), ', ' order by o)
                             from jsonb_array_elements(d -> 'config' -> 'allowed_types') with ordinality as a(x, o)
                             left join platform.entity_types e on e.token = x #>> '{}')
            using errcode = '23514',
                  hint = 'SC-R / P12: config.allowed_types is what this column may name. Point it at one of those, or widen the column.';
        end if;
        if not custom._entity_reference_target_ok(p_organization_id, lower(btrim(v_one ->> 'token')), (v_one ->> 'id')::uuid) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'SC-R / P12 / REC-51: an entity reference points at a live thing the person writing it may open. It was deleted, it never existed, or it has not been shared with you.';
        end if;
        continue;   -- an entity reference carries no value Rules; its ceiling is asked below
      elsif v_type = 'relation' then
        if jsonb_typeof(v_one) <> 'string' then
          raise exception '% points at a record, and it was given a %', v_label, jsonb_typeof(v_one)
            using errcode = '23514', hint = 'FLD-1: relation.';
        end if;
        -- RELATION RULES. The target is a live record the relation's DECLARATION allows —
        -- `custom.relation_value_target_ok`, which asks what platform.enforce_relation_edge
        -- asks of the association beside it: the declared table (or `several`'s list, or
        -- `any`), and another organization only through the REC-29 opening both have made.
        -- The id SHAPE first, for the same reason as the list branch above.
        if (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = format('REC-51: %s stores the id of a record, and what it was given is not an id at all.', v_label);
        end if;
        if not custom.relation_value_target_ok(p_organization_id, f.id, d, (v_one #>> '{}')::uuid)
           -- A REFERENCE KEPT ON AN ARCHIVED RECORD (lane REFERENCE-KEEPS-ARCHIVED, chair ruling B3-21,
           -- 2026-10-01). An archive keeps every pointer at what it archived, so a record may hold one
           -- while its target sits in Archived items. That pointer is not a new link: when the row
           -- being changed (custom._record_field_validation names it) ALREADY holds this id under this
           -- key and the target is an archived record of this organization, the value stands, and the
           -- rest of the record stays editable. A NEW pointer at an archived record is still refused.
           and not (
             nullif(current_setting('custom.validating_record', true), '') is not null
             and exists (select 1 from custom.record t
                          where t.organization_id = p_organization_id
                            and t.id = (v_one #>> '{}')::uuid
                            and t.deleted_at is not null)
             and exists (select 1 from custom.record s
                          where s.organization_id = p_organization_id
                            and s.id = nullif(current_setting('custom.validating_record', true), '')::uuid
                            and (s.data -> v_key = v_one
                                 or (jsonb_typeof(s.data -> v_key) = 'array'
                                     and s.data -> v_key @> jsonb_build_array(v_one)))))
           -- A POINTER MOVED IN FROM THE OLD STORE AT A RECORD THAT IS NOW ARCHIVED (CHAIR-DOORS-3A,
           -- asked by lane 9, scopes-b ruling 1). References survive an archive: the old scope value
           -- named a scope that was archived afterwards, and a copy that lands the value AFTER the
           -- archive is not making a new link, it is carrying one that existed. So when this key's
           -- value envelope names a source of kind `move` (the copy's own provenance, interned in
           -- the record's `_sources`), a pointer at an ARCHIVED record of this organization, in the
           -- one table this relation points at, stands. A person's write carries no such source and is
           -- refused a new pointer at an archived record exactly as before.
           and not (
             -- the source as the writer handed it (an object), or as the store interned it (a pointer)
             -- (coalesced to false: with no envelope at all this must be FALSE, never NULL, or the
             --  whole refusal below would be skipped by three-valued logic)
             coalesce(coalesce(case when jsonb_typeof(p_values -> '_values' -> v_key -> 'src') = 'object'
                                    then p_values -> '_values' -> v_key -> 'src' ->> 'kind' end,
                               p_values -> '_sources' -> (p_values -> '_values' -> v_key ->> 'src') ->> 'kind') = 'move',
                      false)
             and exists (select 1 from custom.record t
                          where t.organization_id = p_organization_id
                            and t.id = (v_one #>> '{}')::uuid
                            and t.deleted_at is not null
                            and t.table_id = nullif(d ->> 'relation_target', '')::uuid)) then
          raise exception '% points at something that is not there', v_label
            using errcode = '23514',
                  hint = 'REC-51 / REL-8 / REC-29: a relation field points at a live record of a table it declares — or, across organizations, only where the table allows it and both organizations have turned on links to other organizations.';
        end if;
      end if;

      -- FLD-3: the attached validation Rules, read through the ONE seam.
      -- FLD-10 says the type field selects which Fields AND RULES apply, so a Rule carries
      -- its own applies_to_types: T8's Width applies to a rectangle and to a square, and the
      -- "the sides are equal" Rule attached to it applies to the SQUARE alone. A Rule with an
      -- empty list applies wherever its Field does.
      -- A RESTORE IS NOT AN EDIT: the value rules (at least, at most, length, pattern…) judge what a
      -- write changes; a row brought back exactly as it was is not judged by them again.
      for v_rule in select r from jsonb_array_elements(coalesce(d -> 'rules', '[]'::jsonb)) r
                     where coalesce(current_setting('custom.validating_restore', true), '') <> '1' loop
        if jsonb_array_length(coalesce(v_rule -> 'applies_to_types', '[]'::jsonb)) > 0
           and not (p_record_type is not null and (v_rule -> 'applies_to_types') ?| v_types) then
          continue;
        end if;
        v_kind := v_rule ->> 'kind';
        if v_kind = 'min' and jsonb_typeof(v_one) = 'number'
           and (v_one #>> '{}')::numeric < (v_rule ->> 'value')::numeric then
          raise exception '% has to be at least %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'max' and jsonb_typeof(v_one) = 'number'
              and (v_one #>> '{}')::numeric > (v_rule ->> 'value')::numeric then
          raise exception '% cannot be more than %', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3: an attached validation Rule, not a behavior.';
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and coalesce(v_rule ->> 'value', '') <> ''
              and length(v_one #>> '{}') > (v_rule ->> 'value')::integer then
          raise exception '% is longer than % characters', v_label, v_rule ->> 'value'
            using errcode = '23514', hint = 'FLD-3.';
        -- STORE-RULE-GAPS (3): the SHORTEST, beside the longest. An empty string is a blank,
        -- not a short answer - whether a blank is allowed is `required`'s question, as it
        -- was in the older grid, so it is not asked twice.
        elsif v_kind = 'length' and jsonb_typeof(v_one) = 'string'
              and coalesce(v_rule ->> 'min', '') <> ''
              and (v_one #>> '{}') <> ''
              and length(v_one #>> '{}') < (v_rule ->> 'min')::integer then
          raise exception '% has to be at least % characters long', v_label, v_rule ->> 'min'
            using errcode = '23514', hint = 'FLD-3.',
                  detail = jsonb_build_object('field_key', v_key, 'rule', 'length',
                                              'min', (v_rule ->> 'min')::integer)::text;
        -- STORE-RULE-GAPS (1): a pattern that carries an example SAYS it — the remedy is the
        -- shape a person should type, and the example travels in `detail` as well so the one
        -- refusal builder reads it as data rather than fishing it out of a sentence.
        elsif v_kind = 'pattern' and jsonb_typeof(v_one) = 'string'
              and (v_one #>> '{}') !~ (v_rule ->> 'value') then
          if coalesce(btrim(v_rule ->> 'example'), '') <> '' then
            raise exception '% is not written the way this field expects', v_label
              using errcode = '23514',
                    hint = format('Enter it like %s.', btrim(v_rule ->> 'example')),
                    detail = jsonb_build_object('field_key', v_key, 'rule', 'pattern',
                                                'example', btrim(v_rule ->> 'example'))::text;
          end if;
          raise exception '% is not written the way this field expects', v_label
            using errcode = '23514', hint = 'FLD-3.';
        elsif v_kind = 'equals_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and jsonb_typeof(v_other) <> 'null' and v_other <> v_one then
            raise exception '% and % have to be the same', v_label, v_rule ->> 'value'
              using errcode = '23514',
                    hint = 'FLD-3 / T8: a constraint across two fields is a Rule attached to one of them, never a behavior.';
          end if;
        elsif v_kind = 'differs_from_field' then
          v_other := p_values -> (v_rule ->> 'value');
          if v_other is not null and v_other = v_one then
            raise exception '% and % have to be different', v_label, v_rule ->> 'value'
              using errcode = '23514', hint = 'FLD-3.';
          end if;
        end if;
      end loop;
    end loop;

    -- RELATION MAX, once per field rather than once per item. Asked of EVERY relation now,
    -- not only of the ones that also said `multi`: it is the cardinality, so a single relation
    -- handed two targets is refused here by the column's own name rather than being let
    -- through because a second word was missing.
    if v_type = 'relation' then
      v_n := jsonb_array_length(v_items);
      if v_n > coalesce((d ->> 'relation_max')::integer, v_n) then
        raise exception '% points at % things, and it can point at % at most',
                        v_label, v_n, d ->> 'relation_max'
          using errcode = '23514', hint = 'REC-51: relation_max.';
      end if;
    end if;
  end loop;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom._record_field_validation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type_field text;
  v_rtype      text;
  v_fields     custom.record[];
  v_gone       custom.record[];
  g            custom.record;
  v_retired    jsonb;
  v_env        jsonb;
begin
  -- THE DOOR. One call to the ONE predicate (`custom.assert_store_door`), which
  -- judges `custom.caller_role()` - the identity the caller actually held - and not
  -- `current_user`, which a SECURITY DEFINER door has already rewritten to itself.
  -- The switch never removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');
  -- THE SWITCH, by name: custom.assert_store_door resolves custom/system_enabled through
  -- custom.store_is_open, and while it is off this store takes writes only from the role
  -- that owns custom.record.

  -- The kernel is defined in code, the Tables and the Fields and the merge fields have their
  -- own shape guards, and a relation row carries an edge rather than a document.
  if new.data_class in ('kernel', 'relation')
     or new.table_id is null
     or new.table_id = custom.table_kernel_id()
     or new.table_id = custom.field_kernel_id() then
    return new;
  end if;


  -- A RETIREMENT IS NOT A CHANGE OF SHAPE (the shared rule DOOR-FIX and TABLE-DELETE built,
  -- now asked as ONE question). The only change in this update is `deleted_at` going from
  -- nothing to a time: the document is byte-for-byte what it was, so there is no new shape
  -- to judge. This is what lets a dependent field retire in the SAME operation as the
  -- relation it reads through - the sweep, the cascade and the door all arrive here.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at,
                                old.data, new.data,
                                old.table_id, new.table_id,
                                old.organization_id, new.organization_id,
                                old.data_class, new.data_class) then
    return new;
  end if;

  v_type_field := custom.table_type_field(new.organization_id, new.table_id);
  if v_type_field is not null then
    v_rtype := new.data ->> v_type_field;
  end if;

  select array_agg(f) into v_fields
    from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) f;
  if v_fields is null then
    return new;               -- a Table that declared no definitions validates nothing.
  end if;

  -- T8's retype: a Value that stops applying is neither coerced nor deleted. It is moved,
  -- WITH ITS REASON, and the field is then hidden by custom.applicable_fields. This is a
  -- STAND-IN for History and says so: W3-HIST (HIS-*) owns the real store, and when it
  -- lands this block writes there instead. Until then the value is in the document, not gone.
  if tg_op = 'UPDATE' and v_type_field is not null
     and (old.data ->> v_type_field) is distinct from v_rtype then
    select array_agg(f) into v_gone
      from custom.applicable_fields(new.organization_id, new.table_id,
                                    old.data ->> v_type_field) f
     where not exists (select 1
                         from custom.applicable_fields(new.organization_id, new.table_id, v_rtype) a
                        where a.id = f.id);
    v_retired := coalesce(new.data -> '_retired', '[]'::jsonb);
    if v_gone is not null then
      foreach g in array v_gone loop
        if old.data ? (g.data ->> 'key') and jsonb_typeof(old.data -> (g.data ->> 'key')) <> 'null' then
          v_retired := v_retired || jsonb_build_object(
            'key',   g.data ->> 'key',
            'label', g.data ->> 'label',
            'value', old.data -> (g.data ->> 'key'),
            -- W1-VAL (1 of 2): a retired Value takes its ENVELOPE with it. Where a value came
            -- from, who wrote it and its other candidates are facts about that value, so they
            -- belong beside it in _retired and not orphaned in _values pointing at nothing.
            'envelope', old.data -> '_values' -> (g.data ->> 'key'),
            'reason', format('this record became a %s, and %s does not apply to a %s',
                             custom.said(v_rtype, 'different kind of thing'),
                             coalesce(nullif(g.data ->> 'label', ''), g.data ->> 'key'),
                             custom.said(v_rtype, 'record of that kind')),
            'at', to_jsonb(now()));
          new.data := new.data - (g.data ->> 'key');
          if jsonb_typeof(new.data -> '_values') = 'object' then
            new.data := jsonb_set(new.data, '{_values}',
                                  (new.data -> '_values') - (g.data ->> 'key'));
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_retired) > 0 then
        new.data := jsonb_set(new.data, '{_retired}', v_retired);
      end if;
    end if;
  end if;

  -- REFERENCE-KEEPS-ARCHIVED: which stored row this write changes, so a pointer it already holds at
  -- an archived record is judged as kept rather than as a new link (custom.validate_values).
  perform set_config('custom.validating_record', case when tg_op = 'UPDATE' then old.id::text else '' end, true);
  -- A RESTORE IS NOT AN EDIT (TABLE-ACTIONS ruling, 2026-10-03): `deleted_at` going from a time to
  -- nothing with the document byte-for-byte what it was is a row coming back as it was. Its values
  -- are still judged for type and shape; `required` and the value rules declared since it went are
  -- not asked of it (they judge what a write changes). One rule for every restore door —
  -- custom.record_restore, custom.table_restore and the Trash all land here.
  perform set_config('custom.validating_restore',
    case when tg_op = 'UPDATE' and old.deleted_at is not null and new.deleted_at is null
              and old.data = new.data then '1' else '' end, true);
  perform custom.validate_values(new.organization_id, v_fields, new.data, v_rtype);
  perform set_config('custom.validating_restore', '', true);
  perform set_config('custom.validating_record', '', true);
  -- W1-VAL (2 of 2): the half of the envelope law that needs the definitions.
  -- lane STORE-RESTORE-DOORS: ON AN UPDATE, ONLY THE ENVELOPES THIS WRITE CHANGED ARE JUDGED — the
  -- rule custom._undeclared_key_guard already keeps for values. A column removed with
  -- custom.field_retire leaves its values AND their envelopes in every record, so the column comes
  -- back whole from Trash; judging the untouched envelope refused every later edit of those records
  -- ("This record carries where … came from", 62 live records on production 2026-09-26) and every
  -- restore of one. An envelope a write adds or changes is judged exactly as before.
  v_env := new.data;
  if tg_op = 'UPDATE' and jsonb_typeof(new.data -> '_values') = 'object' then
    v_env := jsonb_set(new.data, '{_values}',
      coalesce((select jsonb_object_agg(e.key, e.value)
                  from jsonb_each(new.data -> '_values') e
                 where (old.data -> '_values' -> e.key) is distinct from e.value), '{}'::jsonb));
  end if;
  perform custom.validate_value_envelope(new.organization_id, v_fields, v_env);
  return new;
end;
$function$
;

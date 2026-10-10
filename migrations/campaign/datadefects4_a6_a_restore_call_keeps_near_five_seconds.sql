-- lane: DATA-DEFECTS-4
-- lock: custom
-- based-on: custom.table_restore(uuid, uuid, integer) 8ab36b663682c84135e3b64dfac01cf4681440a69aa18d820263796c78b92649
--
-- The inverse is `migrations/inverse/datadefects4_a6_a_restore_call_keeps_near_five_seconds_down.sql`.
--
-- A RESTORE CALL KEEPS NEAR FIVE SECONDS (DATA-DEFECTS-4, 2026-10-10). A 3,000-row restore's slowest call was 5.4 s.
-- Now steps of 50 rows and a 2 s record budget (as the archive door); the caller's loop does the rest.

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
  -- DATA-DEFECTS-4: the record phase works for its own time budget, like custom.table_archive.
  c_rows_pass constant interval := interval '2000 milliseconds';
  c_call_rows constant integer := 5000;
  c_batch     constant integer := 50; 
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
  v_ids     uuid[];
  v_ats     timestamptz[];
  rb        record;
  v_rows_until timestamptz;
  v_flag_ev jsonb := '{}'::jsonb;    -- this event's rows brought back that no longer meet the rules: {id: why}
  v_flag_out jsonb := '{}'::jsonb;
  v_flag_all jsonb := '{}'::jsonb;
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
      perform custom._record_restore_one(p_organization_id, p_table_id);
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
  v_left := case when v_chunk > 0 then c_call_rows else 0 end;
  v_rows_until := clock_timestamp() + c_rows_pass;
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
    v_flag_ev := coalesce(e.inverse -> 'restore_flagged', '{}'::jsonb);
    if jsonb_typeof(v_flag_ev) <> 'object' then v_flag_ev := '{}'::jsonb; end if;
    v_back_ids := '{}'; v_back_at := '{}';

    -- THE RECORDS, in the order they went, now in SET-BASED STEPS (DATA-DEFECTS-4). Per step: the access
    -- question is asked of every row (same door as before); the step is judged once against the table's
    -- CURRENT rules (custom._restore_check: a unique value another row took since holds the row back,
    -- left archived with the store's reason in restore_left; anything else it no longer meets comes back
    -- FLAGGED in restore_flagged — nothing is lost), then brought back by ONE update. The call works for
    -- its own time budget, not the caller's chunk (p_chunk > 0 only means "do work"); `remaining` says
    -- what is left and the caller's loop carries on.
    loop
      exit when v_left < 1;
      if v_struct + v_back + v_on_did > 0 and clock_timestamp() > v_rows_until then
        v_more := true;
        exit;
      end if;
      select coalesce(array_agg(s.id order by s.o), '{}'), coalesce(array_agg(s.at order by s.o), '{}')
        into v_ids, v_ats
        from (select t.id, t.at, t.o
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
               limit least(c_batch, v_left)) s;
      exit when cardinality(v_ids) = 0;
      perform custom.assert_client_may_change(p_organization_id, x, 'custom.table_restore') from unnest(v_ids) x;
      select * into rb from custom._restore_records_batch(p_organization_id, v_ids, v_ats);
      v_back := v_back + coalesce(cardinality(rb.back_ids), 0);
      v_back_ids := v_back_ids || coalesce(rb.back_ids, '{}'); v_back_at := v_back_at || coalesce(rb.back_at, '{}');
      if rb.held <> '{}'::jsonb then
        v_kept := v_kept || rb.held;
        select v into v_last_why from jsonb_each_text(rb.held) as j(k, v) limit 1;
      end if;
      v_flag_ev := v_flag_ev || coalesce(rb.flagged, '{}'::jsonb);
      v_left := v_left - cardinality(v_ids);
    end loop;
    v_until := clock_timestamp() + c_pass;

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
    if v_flag_ev is distinct from coalesce(e.inverse -> 'restore_flagged', '{}'::jsonb) then
      update history.migration_log l
         set inverse = l.inverse || jsonb_build_object('restore_flagged', v_flag_ev)
       where l.organization_id = p_organization_id and l.id = e.id;
    end if;
    v_flag_out := v_flag_out || v_flag_ev;

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

  -- Rows that came back flagged: every pass of this restore (the events' own record of it), live rows only.
  select coalesce(jsonb_object_agg(k.key, k.value), '{}'::jsonb) into v_flag_all
    from history.migration_log l
    cross join lateral jsonb_each(case when jsonb_typeof(l.inverse -> 'restore_flagged') = 'object'
                                        then l.inverse -> 'restore_flagged' else '{}'::jsonb end) k
   where l.organization_id = p_organization_id and l.target_id = p_table_id and l.verb = 'archive'
     and l.inverse ? 'restore_flagged'
     and (l.undone_at is null or l.undone_at >= coalesce((select max((x.inverse ->> 'restoring_since')::timestamptz)
                                      from history.migration_log x
                                     where x.organization_id = p_organization_id and x.target_id = p_table_id
                                       and x.verb = 'archive'), '-infinity'::timestamptz))
     and exists (select 1 from custom.record r where r.organization_id = p_organization_id and r.id = k.key::uuid and r.deleted_at is null);

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
    'flagged',            (select count(*) from jsonb_object_keys(v_flag_all)),
    'flagged_ids',        coalesce((select jsonb_agg(k) from jsonb_object_keys(v_flag_all) k), '[]'::jsonb),
    'flagged_reasons',    v_flag_all,
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
      when v_done and (select count(*) from jsonb_object_keys(v_flag_all)) > 0 then
        format('%s is back, with everything its archive took; %s of its records no longer meet what the table asks of a record (the first said: %s). They are back, flagged — nothing was dropped.',
               v_name, (select count(*) from jsonb_object_keys(v_flag_all)), (select v from jsonb_each_text(v_flag_all) as j(k, v) limit 1))
      when v_done then format('%s is back, with everything its archive took.', v_name)
      else format('%s is coming back; %s record%s and %s thing%s built on it still to bring back. Call again to carry on.',
                  v_name, v_recs, case when v_recs = 1 then '' else 's' end,
                  v_on_wait, case when v_on_wait = 1 then '' else 's' end)
    end);
end
$function$
;

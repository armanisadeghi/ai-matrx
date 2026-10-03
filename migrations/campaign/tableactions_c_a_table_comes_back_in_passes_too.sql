-- chair-step: this adds ONE new client door, custom.table_restore(uuid, uuid, integer) — declared in platform.client_callable_door first, then EXECUTE granted to `authenticated` (signed-in callers only; anon gains nothing; PUBLIC's implicit EXECUTE is cleared at birth by the definer guard). It replaces ONE body, public._trash_store_restore (same signature and grants): a Table in Trash now comes back through custom.table_restore's first pass and the Trash screen carries the rest on; custom.record_restore is untouched. No table, column, index, trigger or policy is touched; the only row written is the door-register row. No strong lock: CREATE FUNCTION, one INSERT, one GRANT.
-- lane: TABLE-ACTIONS
-- lock: custom
-- based-on: public._trash_store_restore(uuid, uuid) 2dc9b3e8b96fffa290fb03afdfd1ee71d57de980f0c85b41d5f1703c3e73c729
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
  v_refused  jsonb := '[]'::jsonb;   -- rows refused on their own this call (left archived, named)
  v_refused_why text;
  v_kept    jsonb;                   -- every row this run has left archived (the event's restore_left)
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

  -- THE ONE EVENT THIS RUN UNDOES: the archive event of the Table while it is archived; once the
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

  v_kept := coalesce(e.inverse -> 'restore_left', '[]'::jsonb);

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
    v_table_now := true;
    v_struct := 1;
    v_back_ids := array[p_table_id]; v_back_at := array[v_root_at];

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
        v_struct := v_struct + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
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
        v_struct := v_struct + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
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
          v_struct := v_struct + 1;
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
        v_struct := v_struct + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        get stacked diagnostics v_fwhy = message_text;
        v_fleft := v_fleft + 1;
      end;
    end loop;
    if v_fleft > 0 then
      raise notice '%', format('Columns brought back with the table: %s; %s stayed archived (the last said: %s).',
                               v_struct - 1, v_fleft, v_fwhy);
    end if;

    update history.migration_log l
       set inverse = l.inverse || jsonb_build_object('restoring', true, 'restoring_from', to_jsonb(v_root_at))
     where l.organization_id = p_organization_id and l.id = e.id;
  end if;

  -- ══ THE RECORDS, in the order they went, at most v_left a pass ═════════════════════════════
  v_left := v_chunk;
  if v_chunk > 0 then
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
         and not (v_kept @> jsonb_build_array(t.id::text))
       order by t.o
    loop
      if v_left < 1 or (v_struct + v_back > 0 and clock_timestamp() > v_until) then
        exit;
      end if;
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.table_restore');
      -- A record refused on its own (a unique value another record took since) is left archived and
      -- named in the event's restore_left — a run never stalls on one row and never hides it.
      v_ok := true;
      begin
        update custom.record set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = m.at;
      exception when check_violation or unique_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation then
        get stacked diagnostics v_refused_why = message_text;
        v_refused := v_refused || jsonb_build_array(m.id::text);
        v_ok := false;
      end;
      v_left := v_left - 1;
      if v_ok then
        v_back := v_back + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || m.at;
      end if;
    end loop;
  end if;

  -- THE POINTERS THE ARCHIVE TOOK OUT OF OTHER RECORDS GO BACK IN, for every row this pass brought
  -- back (custom.record_restore's own sentence, verbatim in effect: a `set_null` relation's tombstone
  -- at this row's archive moment, the source still here, the column still live, the place still free).
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

  -- ══ WHAT WAS BUILT ON THE TABLE, once its records are back, at most v_left a pass ════════════
  if v_chunk > 0 and not exists (
       select 1
         from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at
                 from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) x) t
         join custom.record r on r.organization_id = p_organization_id and r.id = t.id
        where t.id <> p_table_id and r.deleted_at = t.at
          and not ((v_kept || v_refused) @> jsonb_build_array(t.id::text))) then
    for v_on in
      select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
        from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x
    loop
      continue when (v_kept || v_refused) @> jsonb_build_array(v_on.id::text);
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
        -- A child Table (a bookings Table's slots) comes back through this same door, one pass of it
        -- per pass of the parent, with everything its own archive event took.
        v_child_res := custom.table_restore(p_organization_id, v_on.id, v_left);
        v_n := greatest(coalesce((v_child_res ->> 'restored')::integer, 0)
                        + coalesce((v_child_res ->> 'structure_restored')::integer, 0)
                        + coalesce((v_child_res ->> 'built_on_restored')::integer, 0), 1);
        v_left := v_left - v_n;
        v_on_did := v_on_did + v_n;
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
        v_on_did := v_on_did + 1;
      exception when unique_violation or check_violation then
        get stacked diagnostics v_refused_why = message_text;
        v_refused := v_refused || jsonb_build_array(v_on.id::text);
      end;
      v_left := v_left - 1;
    end loop;
  end if;

  -- What this run has left archived, carried on the event so the next pass does not ask again.
  if jsonb_array_length(v_refused) > 0 then
    v_kept := v_kept || v_refused;
    update history.migration_log l
       set inverse = l.inverse || jsonb_build_object('restore_left', v_kept)
     where l.organization_id = p_organization_id and l.id = e.id;
  end if;

  -- ══ WHAT IS STILL WAITING (read off the rows themselves, every call) ════════════════════════
  select count(*) into v_recs
    from (select (x ->> 0)::uuid as id, (x ->> 1)::timestamptz as at
            from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) x) t
    join custom.record r on r.organization_id = p_organization_id and r.id = t.id
   where r.deleted_at = t.at
     and not (v_kept @> jsonb_build_array(t.id::text));
  select count(*) into v_on_wait
    from (select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
            from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x) b
   where not (v_kept @> jsonb_build_array(b.id::text))
     and case b.kind
       when 'anon_form' then exists (select 1 from custom.anon_form x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
       when 'anon_inbound' then exists (select 1 from custom.anon_inbound x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
       when 'saved_view' then exists (select 1 from platform.saved_view x where x.organization_id = p_organization_id and x.id = b.id and x.deleted_at = b.at)
       when 'portal' then exists (select 1 from custom.portal x where x.organization_id = p_organization_id and x.id = b.id and x.archived_at = b.at)
       when 'table' then exists (select 1 from custom.record c where c.organization_id = p_organization_id and c.id = b.id and c.data_class = 'table' and c.deleted_at is not null)
                      or exists (select 1 from history.migration_log l where l.organization_id = p_organization_id and l.target_id = b.id
                                    and l.verb = 'archive' and l.undone_at is null and coalesce((l.inverse ->> 'restoring')::boolean, false))
       else false end;

  -- THE EVENT IS UNDONE WHEN NOTHING IT TOOK IS STILL WAITING — and only in a call that changed
  -- something (p_chunk = 0 promises to change nothing).
  if v_chunk > 0 and v_recs = 0 and v_on_wait = 0 and not v_more then
    update history.migration_log l
       set undone_at = now(),
           undone_by = coalesce(nullif(current_setting('app.user_id', true), '')::uuid, (select auth.uid())),
           inverse = l.inverse - 'restoring'
     where l.organization_id = p_organization_id and l.id = e.id;
    v_done := true;
  end if;

  return jsonb_build_object(
    'table_id',           p_table_id,
    'table_name',         v_name,
    'restored',           v_back,                -- records THIS call brought back
    'structure_restored', v_struct,              -- the Table, its Fields, rules and views (first pass)
    'built_on_restored',  v_on_did,              -- what is built on the Table, THIS call
    'remaining',          v_recs,                -- records (and structure) the event took still waiting
    'built_on_remaining', v_on_wait,
    'left',               jsonb_array_length(v_kept),  -- refused on their own, left archived and named
    'left_ids',           v_kept,
    'table_restored',     v_root_at is null or v_table_now,
    'done',               v_done,
    'chunk',              v_chunk,
    'archive_event',      e.id,
    'message', case
      when v_chunk = 0 then
        format('%s record%s and %s thing%s built on %s would be brought back. Nothing has been changed yet.',
               v_recs, case when v_recs = 1 then '' else 's' end,
               v_on_wait, case when v_on_wait = 1 then '' else 's' end, v_name)
      when v_done and jsonb_array_length(v_kept) > 0 then
        format('%s is back. %s thing%s it held stayed archived because each is refused on its own now (the last said: %s).',
               v_name, jsonb_array_length(v_kept), case when jsonb_array_length(v_kept) = 1 then '' else 's' end,
               coalesce(v_refused_why, 'changed since'))
      when v_done then format('%s is back, with everything its archive took.', v_name)
      else format('%s is back; %s record%s and %s thing%s built on it still to bring back. Call again to carry on.',
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

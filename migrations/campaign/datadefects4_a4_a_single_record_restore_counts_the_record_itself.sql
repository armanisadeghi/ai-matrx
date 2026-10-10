-- lane: DATA-DEFECTS-4
-- lock: custom
-- based-on: custom._record_restore_one(uuid, uuid) ff80acd3369a02336c362b72bdaf72357330a74e8b0b0b45507302c4ad3844f1
--
-- The inverse is `migrations/inverse/datadefects4_a4_a_single_record_restore_counts_the_record_itself_down.sql`.
--
-- custom._record_restore_one counted only the rows an archive event took, so restoring one plain record answered
-- restored: 0 although the record was back. It now counts the record itself (+1).

CREATE OR REPLACE FUNCTION custom._record_restore_one(p_organization_id uuid, p_record_id uuid)
 RETURNS jsonb
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
  v_is_table boolean := false;         -- FIELD-ARCHIVE-CASCADE: is the row brought back a Table?
  v_fback    integer := 0;             -- ... Fields brought back with it (archived at its moment)
  v_fwait    uuid[] := '{}';           -- ... Fields whose guard wants the rest of the Table back first
  v_fleft    integer := 0;             -- ... Fields still refused after that
  v_fwhy     text;
  v_on       record;                   -- T2.1: one row built on a Table that its archive took
  v_on_back  integer := 0;
  v_on_left  integer := 0;
  v_on_why   text;
  v_bulk_ids uuid[] := '{}';           -- DATA-DEFECTS-3: records of the event brought back by one update
  v_bulk_at  timestamptz[] := '{}';
  v_flagged  jsonb := '{}'::jsonb;     -- DATA-DEFECTS-4: rows brought back that no longer meet the table's rules: {id: why}
  rb         record;
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

  -- DATA-DEFECTS-4: the row triggers stand aside for a restore (a deleted_at-only update); an ordinary
  -- record is judged here instead, against the table's CURRENT rules (a unique value another row took
  -- since refuses it, as before; anything else it no longer meets is flagged, and it comes back).
  if v_root_at is not null then
    v_flagged := v_flagged || custom._restore_guard_one(p_organization_id, p_record_id, v_root_at);
  end if;

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
    raise exception 'There is no such record in this organization.' using errcode = '02000',
            hint = 'REC-23: a record is reversible while its table still keeps its history, and this one is not in this organization at all.',
            detail = jsonb_build_object('record_id', p_record_id)::text;
  end if;

  v_back_ids := array[p_record_id];
  v_back_at  := array[v_root_at];

  -- A TABLE COMES BACK WITH THE FIELDS ITS ARCHIVE TOOK (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
  -- Every archive of a Table archives its live Fields at the Table's own moment (the trigger
  -- zz_w4_approvals_withdraw_on_archive, custom._work_approvals_withdraw_on_archive), whatever wrote it
  -- — so a Table archived outside custom.record_delete has no event naming them. Exactly the Fields
  -- archived at that moment come back, before any record (a record's values are judged against its
  -- Fields); a Field a person retired earlier carries an earlier moment and is left. A Field the event
  -- below names is the event's. One whose guard refuses it now is asked again after the event's
  -- structure is back.
  select r.table_id = custom.table_kernel_id() and r.data_class = 'table' into v_is_table
    from custom.record r where r.organization_id = p_organization_id and r.id = p_record_id;
  if coalesce(v_is_table, false) and v_root_at is not null then
    for m in
      select f.id
        from custom.record f
       where f.organization_id = p_organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.data ->> 'entity_definition_id' = p_record_id::text
         and f.deleted_at = v_root_at
         and not exists (select 1 from jsonb_array_elements(coalesce(e.inverse -> 'took', '[]'::jsonb)) t
                          where t ->> 0 = f.id::text)
       order by f.created_at, f.id
    loop
      perform custom.assert_client_may_change(p_organization_id, m.id, 'custom.record_restore');
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        v_fback := v_fback + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        v_fwait := v_fwait || m.id;
      end;
    end loop;
  end if;
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
          v_flagged := v_flagged || custom._restore_guard_one(p_organization_id, m.id, m.at);
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
        -- DATA-DEFECTS-3: collected, brought back by ONE update below (access was asked of this row above).
        v_bulk_ids := v_bulk_ids || m.id; v_bulk_at := v_bulk_at || m.at;
      end if;
    end if;
  end loop;

  if cardinality(v_bulk_ids) > 0 then
    -- DATA-DEFECTS-4: ONE set-based step — judged against the current rules, then ONE update.
    select * into rb from custom._restore_records_batch(p_organization_id, v_bulk_ids, v_bulk_at);
    if rb.held <> '{}'::jsonb then
      select v into v_why from jsonb_each_text(rb.held) as j(k, v) limit 1;
      raise exception 'This could not be brought back as it was archived: a record is refused on its own (%), so nothing was brought back.', v_why
        using errcode = '23514',
              hint = 'STORE-TAILS-3: a restore brings back the whole of what its archive took, or none of it. Change what the refusal names (it changed after the archive), then bring it back again.';
    end if;
    v_flagged := v_flagged || rb.flagged;
    v_back := v_back + coalesce(cardinality(rb.back_ids), 0);
    v_back_ids := v_back_ids || coalesce(rb.back_ids, '{}'); v_back_at := v_back_at || coalesce(rb.back_at, '{}');
  end if;

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
              v_flagged := v_flagged || custom._restore_guard_one(p_organization_id, m.id, m.at);
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
            v_flagged := v_flagged || custom._restore_guard_one(p_organization_id, m.id, m.at);
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

  -- FIELD-ARCHIVE-CASCADE: the Fields that waited for the rest of the Table, asked once more. One still
  -- refused stays archived and is named below — never a reason to keep the Table itself archived.
  if cardinality(v_fwait) > 0 then
    for m in select x.id from unnest(v_fwait) with ordinality as x(id, o) order by x.o loop
      begin
        update custom.record
           set deleted_at = null
         where organization_id = p_organization_id and id = m.id and deleted_at = v_root_at;
        v_fback := v_fback + 1;
        v_back_ids := v_back_ids || m.id; v_back_at := v_back_at || v_root_at;
      exception when check_violation or foreign_key_violation or raise_exception
                  or invalid_parameter_value or not_null_violation or unique_violation then
        get stacked diagnostics v_fwhy = message_text;
        v_fleft := v_fleft + 1;
      end;
    end loop;
  end if;
  if v_fback > 0 or v_fleft > 0 then
    raise notice '%', format('Columns brought back with the table: %s%s.', v_fback,
      case when v_fleft > 0 then format('; %s stayed archived (the last said: %s)', v_fleft, v_fwhy) else '' end);
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
    return jsonb_build_object('restored', v_back + 1, 'flagged', v_flagged);
  end if;

  -- T2.1 (2026-10-02): WHAT WAS BUILT ON THE TABLE COMES BACK WITH IT — the forms, booking pages,
  -- inbound addresses, saved views and portals custom.table_archive named in this event's
  -- `built_on`, each only if it still carries the moment this archive put it away (one archived
  -- or brought back on its own since is left as it is). A row whose name a live one took meanwhile
  -- stays archived and is counted, never a reason to keep the table archived.
  for v_on in
    select x ->> 'kind' as kind, (x ->> 'id')::uuid as id, (x ->> 'at')::timestamptz as at
      from jsonb_array_elements(coalesce(e.inverse -> 'built_on', '[]'::jsonb)) x
  loop
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
      elsif v_on.kind = 'table' then
        -- CHAIR-ACCESS d (lane 2): a child Table its parent's archive took (a bookings Table's slots,
        -- custom.table_archive `built_on` kind table) comes back through its OWN restore, with
        -- everything its own archive event took; one already brought back on its own is left as it is.
        if exists (select 1 from custom.record c
                    where c.organization_id = p_organization_id and c.id = v_on.id
                      and c.data_class = 'table' and c.deleted_at is not null) then
          perform custom.record_restore(p_organization_id, v_on.id);
          v_on_back := v_on_back + 1;
        else
          v_on_left := v_on_left + 1;
        end if;
        continue;
      end if;
      if found then v_on_back := v_on_back + 1; else v_on_left := v_on_left + 1; end if;
    exception when unique_violation or check_violation then
      get stacked diagnostics v_on_why = message_text;
      v_on_left := v_on_left + 1;
    end;
  end loop;
  if v_on_back > 0 or v_on_left > 0 then
    raise notice '%', format('Built on it and brought back: %s%s.', v_on_back,
      case when v_on_left > 0 then format('; %s stayed as they were (the last said: %s)', v_on_left, coalesce(v_on_why, 'changed since')) else '' end);
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

  if v_flagged <> '{}'::jsonb then
    raise notice '%', format('%s record(s) came back that no longer meet what this table asks of a record (flagged, not dropped; the first said: %s).',
                             (select count(*) from jsonb_object_keys(v_flagged)), (select v from jsonb_each_text(v_flagged) as j(k, v) limit 1));
  end if;
  return jsonb_build_object('restored', v_back + 1, 'flagged', v_flagged);
end
$function$
;

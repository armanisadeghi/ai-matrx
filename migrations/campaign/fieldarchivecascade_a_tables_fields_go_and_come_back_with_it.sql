-- additive: yes
-- based-on: custom._work_approvals_withdraw_on_archive() bfed784004871d82c54662448ca210a94c21feac7d2b3f4b05f82d039692dcec
-- based-on: custom.record_restore(uuid, uuid) c816b39b78c3a14ee258022d9a877092c6b9406234da6ae8bf49a28fb70476aa
-- chair-step: it REPLACES two live bodies and nothing else — `custom._work_approvals_withdraw_on_archive()`
--   (the AFTER UPDATE OF deleted_at row trigger on custom.record that already fires on every archive
--   of a Table or record) and `custom.record_restore(uuid, uuid)`. No table, trigger, index, grant,
--   policy or data row is touched by this file; CREATE OR REPLACE FUNCTION takes only the pg_proc row
--   lock. Neither body is in the access kernel's fingerprint (iam.entity_read_kernel_members). The
--   inverse is `migrations/inverse/fieldarchivecascade_a_tables_fields_go_and_come_back_with_it_down.sql`.
-- lane: FIELD-ARCHIVE-CASCADE
--
-- A TABLE'S FIELDS GO, AND COME BACK, WITH IT (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
--
-- THE DEFECT (class). Archiving a Table left its Field definitions live whenever the archive did not
-- pass custom.record_delete: the context follow and custom._ctx_store_type (four scope columns only),
-- the mover, a test's clean-up. A live Field under an archived Table is refused by every later write
-- (FLD-8, custom._field_shape_guard: "the field … says it belongs to a table this organization does
-- not have") and cannot be brought back on its own. Production 2026-09-30 23:36Z: 42 live Fields
-- under archived Tables in 3 organizations; the final-switch rehearsal 15 on the clone stopped on
-- FLD-8 in admin's Workspace.
--
-- THE FIX, WHERE EVERY PATH PASSES.
--   1. The archive trigger (fires on EVERY archive of a Table row, whatever wrote it) archives the
--      Table's live Fields at the Table's own deleted_at — a pure retirement every guard reads as one.
--      Inside custom.record_delete the door has taken them already; one archived here during that run
--      is written into the same archive event.
--   2. custom.record_restore, bringing back a Table, brings back exactly the Fields archived at the
--      Table's moment (and not named by its archive event, which brings back its own), before any
--      record; a Field a person retired earlier carries an earlier moment and is left.
--
-- Proof: scripts/campaign-tests/fieldarchivecascade_green.sql (RED on the bodies this replaces at B2;
-- B4 RED on the trigger alone without the restore half); the STORE-TAILS-3 suites stay green.

CREATE OR REPLACE FUNCTION custom._work_approvals_withdraw_on_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  a        record;
  v_reason text;
  v_by     uuid := custom.query_principal();
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_fields uuid[];                     -- FIELD-ARCHIVE-CASCADE: the field definitions this Table took
  v_why    text;
begin
  -- A TABLE'S ARCHIVE TAKES ITS FIELD DEFINITIONS WITH IT (lane FIELD-ARCHIVE-CASCADE, 2026-10-01).
  -- custom.record_delete already archives a Table's Fields before the Table (its delete rule), but a
  -- Table is also archived by statements that never pass that door: the context follow and
  -- custom._ctx_store_type (which archived only the four scope columns), the mover, the clean-up of a
  -- test. Each left the Table's other Fields live, and a live Field under an archived Table is refused
  -- by every later write (FLD-8: "the field … says it belongs to a table this organization does not
  -- have") and cannot be brought back on its own (custom._field_shape_guard). Measured on production
  -- 2026-09-30: 42 live Fields under archived Tables in 3 organizations. This trigger fires on EVERY
  -- archive of a Table record, whatever wrote it, so the class is closed where all of them pass.
  --
  -- THE MARK IS THE MOMENT. Each Field is archived at the Table's own deleted_at — a pure retirement
  -- (only deleted_at changes, so every guard reads it as one) — and custom.record_restore brings back
  -- exactly the Fields archived at that moment when the Table comes back; a Field a person retired
  -- earlier carries its own, earlier moment and stays retired. Inside custom.record_delete the door has
  -- taken the Fields already (none is left live here); a Field archived here during that door's run is
  -- written into the same archive event, so "Bring it back" names it too.
  if new.data_class = 'table' and new.table_id = custom.table_kernel_id() then
    begin
      with gone as (
        update custom.record f
           set deleted_at = new.deleted_at
         where f.organization_id = new.organization_id
           and f.table_id = custom.field_kernel_id()
           and f.data_class <> 'kernel'
           and f.data ->> 'entity_definition_id' = new.id::text
           and f.deleted_at is null
        returning f.id)
      select coalesce(array_agg(g.id), '{}'::uuid[]) into v_fields from gone g;
    exception when check_violation or foreign_key_violation or raise_exception
                or invalid_parameter_value or not_null_violation or unique_violation then
      -- Never a reason to refuse the Table's own archive (that was always allowed): the Fields stay
      -- as they were, and the warning says so by name.
      get stacked diagnostics v_why = message_text;
      v_fields := '{}'::uuid[];
      raise warning 'The table was archived, but its columns could not be archived with it: %', v_why
        using hint = 'FIELD-ARCHIVE-CASCADE: archive the columns, then bring the table back to check they return with it.';
    end;
    if cardinality(v_fields) > 0
       and coalesce(nullif(current_setting('custom.delete_depth', true), ''), '0') <> '0' then
      perform set_config('custom.archive_took',
                         coalesce(current_setting('custom.archive_took', true), '') || array_to_string(v_fields, ',') || ',',
                         true);
    end if;
  end if;

  for a in
    select x.id, x.data
      from custom.record x
     where x.organization_id = new.organization_id
       and x.data_class = 'work_approval'
       and x.deleted_at is null
       and x.data @> jsonb_build_object('subject_id', new.id::text, 'state', 'pending')
    union
    select x.id, x.data
      from custom.record x
     where new.data_class = 'table'
       and x.organization_id = new.organization_id
       and x.data_class = 'work_approval'
       and x.deleted_at is null
       and x.data @> jsonb_build_object('subject_table_id', new.id::text, 'state', 'pending')
  loop
    v_reason := custom.work_approval_withdrawal(new.organization_id, a.data);
    continue when v_reason is null;
    update custom.record r
       set data = r.data || jsonb_strip_nulls(jsonb_build_object(
             'state',            'withdrawn',
             'decided_at',       v_at,
             'withdrawn_by',     v_by::text,
             'withdrawn_reason', v_reason,
             'outcome',          'Withdrawn. ' || v_reason))
     where r.organization_id = new.organization_id and r.id = a.id;
  end loop;
  return null;
end
$function$;

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
  v_is_table boolean := false;         -- FIELD-ARCHIVE-CASCADE: is the row brought back a Table?
  v_fback    integer := 0;             -- ... Fields brought back with it (archived at its moment)
  v_fwait    uuid[] := '{}';           -- ... Fields whose guard wants the rest of the Table back first
  v_fleft    integer := 0;             -- ... Fields still refused after that
  v_fwhy     text;
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

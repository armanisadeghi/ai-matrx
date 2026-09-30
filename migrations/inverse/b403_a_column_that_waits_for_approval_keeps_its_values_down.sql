-- chair-step: inverse of b403_a_column_that_waits_for_approval_keeps_its_values.sql (lane SAVE-AS-TABLE-EVERYWHERE) — puts custom.io_import_rows, custom.io_import_finish and custom.work_approval_decide back to their previous bodies and drops custom._io_fill_held_column (a column approved from an import arrives empty again; values kept on runs stay in io_import.metadata, unread).
-- lane: SAVE-AS-TABLE-EVERYWHERE
-- lock: custom
set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_keep    constant integer := 500;   -- the cap on kept refusals / duplicates, said out loud
  v_run     custom.io_import;
  v_map     jsonb;
  v_fields  jsonb := '{}'::jsonb;      -- field key -> the Field document
  v_f       record;
  v_row     jsonb;
  v_doc     jsonb;
  v_values  jsonb;
  v_src     jsonb;
  v_key     text;
  v_val     jsonb;
  v_word    text;
  v_mapped  text;
  v_cell    jsonb;
  v_order   text;
  v_dk      text;
  v_dkvals  text[];
  v_exist   jsonb := '{}'::jsonb;      -- duplicate-key value -> the record already holding it
  v_seen    integer := 0;
  v_landed  integer := 0;
  v_dupes   integer := 0;
  v_bad     integer := 0;
  v_out     jsonb := '[]'::jsonb;      -- this batch's per-row outcomes
  v_ref     jsonb := '[]'::jsonb;
  v_dup     jsonb := '[]'::jsonb;
  v_unmap   jsonb := '{}'::jsonb;
  v_props   jsonb := '[]'::jsonb;
  v_patch   jsonb;
  v_reason  text;
  v_index   integer;
  v_mode    text;
  v_made    jsonb := '[]'::jsonb;      -- the columns this call had to declare after all
  v_decl    jsonb;
  -- THE PLAN. One entry per row of this batch, in file order, decided before anything is
  -- written; `ord` is a row's place in the batched statement, which is also where its id is.
  v_plan    jsonb := '[]'::jsonb;
  v_entry   jsonb;
  v_ord     integer := 0;
  v_docs    jsonb[] := array[]::jsonb[];
  v_ids     uuid[] := array[]::uuid[];
  v_id      uuid;
  v_fell    text := null;              -- why the batched statement was refused, if it was
  v_failed  jsonb := '{}'::jsonb;      -- ord -> why THAT row could not be written on its own
  -- THE UNIQUE RULE, HELD INSIDE THE BATCH (see the migration header, (c)).
  v_uq      text[] := array[]::text[]; -- the keys of the columns carrying a unique rule
  v_uqlab   jsonb := '{}'::jsonb;      -- key -> the word a person reads
  v_uqseen  jsonb := '{}'::jsonb;      -- "key|lowered value" -> the row that took it
  v_u       text;
  -- IMPORT-2: how long the WRITING phase of this call took, and what that makes a comfortable
  -- number of rows for the next one. Measured, never assumed.
  c_comfort numeric;                   -- the milliseconds of MEASURED writing work a call aims at:
                                       -- HALF of knob copy/max_auth_lock_ms (lane FOLLOW-BATCH-2;
                                       -- it was a fixed 2000). Every call locks the sign-in table
                                       -- from its first insert to its COMMIT (each row names who
                                       -- created it), so a call is a step of a copy; half leaves
                                       -- room for the outcome phase after the writes and for a
                                       -- database that gets twice as busy between two calls.
  v_t0      timestamptz;
  v_wrote   numeric;
  v_perrow  numeric;
  v_next    integer;
begin
  c_comfort := greatest(100, 0.5 * (platform.knob_resolve('copy', 'max_auth_lock_ms', p_organization_id) #>> '{}')::numeric);
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_rows');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_rows');

  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to add rows to.'
      using errcode = '23503',
            hint = 'Open one with custom.io_import_begin first. Nothing was written.';
  end if;
  if v_run.state = 'finished' then
    raise exception 'That import is finished, so no more rows go into it.' using errcode = '23514',
            hint = 'Start a new import for the rest of the file. Nothing was written.',
            detail = jsonb_build_object('finished_at', coalesce(v_run.finished_at, v_run.updated_at))::text;
  end if;
  -- THE RUNG, ON THE TABLE THIS RUN BELONGS TO, on every batch.
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_rows',
                                          'editor'::public.permission_level, 'table');

  v_map   := coalesce(v_run.mapping, '{}'::jsonb) || coalesce(p_mapping, '{}'::jsonb);
  v_order := lower(coalesce(nullif(v_run.policy ->> 'date_order', ''), 'mdy'));
  v_dk    := nullif(btrim(coalesce(v_run.dedupe_key, '')), '');
  v_mode  := lower(coalesce(nullif(v_run.policy ->> 'unmapped', ''), 'propose'));

  -- ── THE COLUMNS. A run whose wizard took the `io_import_declare_columns` step finds every
  --    column already here and declares NOTHING; a caller that skipped it still lands its
  --    rows, because FIX-10B's pre-pass is the safety net rather than the normal path.
  if v_mode = 'create' then
    v_decl := custom._io_declare_unmapped(p_organization_id, v_run.table_id, p_rows, v_map);
    v_map  := v_decl -> 'mapping';
    v_made := (select coalesce(jsonb_agg(c || jsonb_build_object('import_id', p_import_id::text)), '[]'::jsonb)
                 from jsonb_array_elements(v_decl -> 'columns_added') c);
  end if;

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH — after any declaration above, so
  -- the batch is written against what the table actually has.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
    if exists (select 1 from jsonb_array_elements(coalesce(v_f.data -> 'rules', '[]'::jsonb)) x
                where x ->> 'kind' = 'unique') then
      v_uq    := v_uq || (v_f.data ->> 'key');
      v_uqlab := v_uqlab || jsonb_build_object(v_f.data ->> 'key',
                              coalesce(nullif(v_f.data ->> 'label', ''), v_f.data ->> 'key'));
    end if;
  end loop;

  -- WHAT IS ALREADY HERE, for exactly the key values this batch carries.
  if v_dk is not null then
    select array_agg(distinct w) into v_dkvals
      from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) r,
           lateral (select btrim(coalesce(
                      r.value ->> coalesce((select k from jsonb_each_text(v_map) m(k, val) where val = v_dk limit 1), v_dk),
                      r.value ->> v_dk, '')) as w) s
     where s.w <> '';
    if v_dkvals is not null and cardinality(v_dkvals) > 0 then
      select coalesce(jsonb_object_agg(t.w, t.id), '{}'::jsonb) into v_exist
        from (select r.data ->> v_dk as w, min(r.id::text) as id
                from custom.record r
               where r.organization_id = p_organization_id
                 and r.table_id = v_run.table_id
                 and r.data_class = 'record'
                 and r.deleted_at is null
                 and r.data ->> v_dk = any (v_dkvals)
               group by 1) t;
    end if;
  end if;

  -- THE SOURCE EVERY VALUE OF THIS RUN POINTS AT.
  v_src := jsonb_strip_nulls(jsonb_build_object(
             'kind',      'import',
             'import_id', p_import_id::text,
             'file',      v_run.source_name,
             'hash',      v_run.file_hash,
             'format',    v_run.format));

  -- ══ PHASE ONE — THE PLAN. Nothing is written here. ═══════════════════════════════════════
  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen  := v_seen + 1;
    v_index := coalesce(v_run.rows_seen, 0) + v_seen;
    v_doc   := '{}'::jsonb;
    v_values:= '{}'::jsonb;
    v_reason:= null;

    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      v_mapped := coalesce(v_map ->> v_key,
                           case when v_fields ? v_key then v_key else null end);
      if v_mapped is null then
        -- SCR-N-7: not an error, an OFFER.
        v_unmap := v_unmap || jsonb_build_object(
          v_key, coalesce(v_unmap -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_unmap -> v_key, '[]'::jsonb)) < 12
                        and coalesce(v_val #>> '{}', '') <> ''
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
        continue;
      end if;
      if not (v_fields ? v_mapped) then
        v_reason := format('This table has no column called "%s", so "%s" has nowhere to go.', v_mapped, v_key);
        exit;
      end if;
      v_word := v_val #>> '{}';
      v_cell := custom.io_cell(p_organization_id, v_fields -> v_mapped, v_word, v_order);
      if not (v_cell ->> 'ok')::boolean then
        v_reason := v_cell ->> 'reason';
        exit;
      end if;
      if coalesce((v_cell ->> 'skip')::boolean, false) then
        continue;
      end if;
      v_doc    := v_doc    || jsonb_build_object(v_mapped, v_cell -> 'value');
      v_values := v_values || jsonb_build_object(v_mapped, jsonb_build_object('src', v_src));
    end loop;

    -- LIMITS-FIX 2026-09-21: A ROW WITH NOTHING IN IT IS NOT A RECORD.
    if v_reason is null and v_doc = '{}'::jsonb then
      v_reason := case
        when jsonb_typeof(v_row) = 'object' and (select count(*) from jsonb_object_keys(v_row)) = 0
          then 'This row is empty, so there is nothing to save.'
        when v_unmap = '{}'::jsonb
          then 'Every column in this row was blank, so there is nothing to save.'
        else format('None of this row''s columns go anywhere in this table, so there is nothing to save. Unmatched: %s.',
                    (select string_agg(k, ', ' order by k) from jsonb_object_keys(v_unmap) k))
      end;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    -- ALREADY HERE? The duplicate key decides, and the policy decides what that means.
    -- A key this batch has already PLANNED counts, exactly as a key it had already written
    -- counted before — `v_exist` carries `pending:<ord>` for those, because the id is minted
    -- in the plan and `custom.record_write_many` gives the rows back in input order.
    if v_dk is not null then
      v_word := v_doc ->> v_dk;
      if v_word is not null and v_exist ? v_word then
        v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                    'kind', 'duplicate', 'row', v_index, 'key', v_word,
                    'hit', v_exist ->> v_word, 'doc', v_doc, 'values', v_values, 'source', v_row));
        continue;
      end if;
    end if;

    -- THE UNIQUE RULE, INSIDE THIS BATCH. custom._unique_rule_holds asks custom.record, and a
    -- row written earlier in the SAME statement is not there to be found, so the door holds
    -- the line for the batch with that trigger's own sentence and SQLSTATE. Anything this
    -- batch cannot see — another session, an earlier batch, a record already here — is still
    -- the trigger's to refuse.
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u = '' then continue; end if;
        if v_uqseen ? (v_key || '|' || v_u) then
          v_reason := format('Another record here already has %s "%s", and %s has to be different on every record.',
                             v_uqlab ->> v_key, btrim(v_word), v_uqlab ->> v_key);
          exit;
        end if;
      end loop;
    end if;

    if v_reason is not null then
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                  'kind', 'refused', 'row', v_index, 'reason', v_reason, 'source', v_row));
      continue;
    end if;

    v_ord  := v_ord + 1;
    v_id   := gen_random_uuid();
    v_ids  := v_ids  || v_id;
    v_docs := v_docs || (
                v_doc
                || case when v_values = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_values', v_values) end
                || jsonb_build_object('_actor', 'system',
                                      '_source', jsonb_strip_nulls(jsonb_build_object(
                                        'via', 'import', 'import_id', p_import_id::text,
                                        'file', v_run.source_name, 'row', v_index))));
    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
                'kind', 'write', 'row', v_index, 'ord', v_ord, 'source', v_row));
    if v_dk is not null and v_doc ->> v_dk is not null then
      v_exist := v_exist || jsonb_build_object(v_doc ->> v_dk, 'pending:' || v_ord::text);
    end if;
    if cardinality(v_uq) > 0 then
      foreach v_key in array v_uq loop
        v_word := v_doc ->> v_key;
        if v_word is null then continue; end if;
        v_u := lower(btrim(v_word));
        if v_u <> '' then v_uqseen := v_uqseen || jsonb_build_object(v_key || '|' || v_u, v_ord); end if;
      end loop;
    end if;
  end loop;

  -- ══ PHASE TWO — ONE STATEMENT. ═══════════════════════════════════════════════════════════
  v_t0 := clock_timestamp();
  if cardinality(v_ids) > 0 then
    begin
      perform custom.record_write_many(p_organization_id, v_run.table_id, v_docs, v_ids);
    exception when others then
      -- A BAD ROW REFUSES THE WHOLE STATEMENT, WHICH IS RIGHT FOR A PASTE AND WRONG FOR AN
      -- IMPORT. The plan is replayed through the single-row door so every row carries its own
      -- outcome and the good rows still land. Only a refused batch pays for this.
      v_fell := sqlerrm;
    end;
  end if;

  if v_fell is not null then
    v_ids := array_fill(null::uuid, array[cardinality(v_ids)]);
    for v_entry in select value from jsonb_array_elements(v_plan) where value ->> 'kind' = 'write' loop
      v_ord := (v_entry ->> 'ord')::integer;
      begin
        v_ids[v_ord] := custom.record_write(p_organization_id, v_run.table_id, v_docs[v_ord]);
      exception when others then
        v_ids[v_ord] := null;
        v_failed := v_failed || jsonb_build_object(v_ord::text,
                      jsonb_build_object('reason', sqlerrm, 'sqlstate', sqlstate));
      end;
    end loop;
  end if;

  -- HOW MANY ROWS THIS DATABASE CAN COMFORTABLY TAKE IN ONE CALL, from what it just did.
  -- Only the writing phase is measured, because that is the part that scales with the batch.
  v_wrote  := extract(epoch from clock_timestamp() - v_t0) * 1000;
  v_perrow := case when cardinality(v_ids) > 0 then v_wrote / cardinality(v_ids) else null end;
  v_next   := case when coalesce(v_perrow, 0) <= 0 then null
                   else greatest(25, least(1000, floor(c_comfort / v_perrow)::integer)) end;

  -- ══ PHASE THREE — WHAT HAPPENED TO EVERY ROW, IN FILE ORDER. ═════════════════════════════
  for v_entry in select value from jsonb_array_elements(v_plan) loop
    v_index := (v_entry ->> 'row')::integer;

    if v_entry ->> 'kind' = 'refused' then
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', '22023', 'reason', v_entry ->> 'reason', 'source', v_entry -> 'source'));
      end if;

    elsif v_entry ->> 'kind' = 'write' then
      v_ord := (v_entry ->> 'ord')::integer;
      if v_ids[v_ord] is null then
        v_bad := v_bad + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'refused',
                   'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        if jsonb_array_length(v_ref) < c_keep then
          v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'sqlstate', coalesce(v_entry ->> 'sqlstate', '22023'),
                     'reason', coalesce(v_failed -> v_ord::text ->> 'reason', v_fell), 'source', v_entry -> 'source'));
        end if;
      else
        v_landed := v_landed + 1;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'landed', 'record_id', v_ids[v_ord]));
      end if;

    else  -- a duplicate of something already here, or of a row this very batch planned
      v_word := v_entry ->> 'hit';
      if left(v_word, 8) = 'pending:' then
        v_ord := substr(v_word, 9)::integer;
        if v_ids[v_ord] is null then
          -- The row this one repeats was refused after all, so this copy is not a repeat of
          -- anything that exists. It is written on its own, exactly as it would have been.
          begin
            v_id := custom.record_write(p_organization_id, v_run.table_id,
                      (v_entry -> 'doc')
                      || case when (v_entry -> 'values') = '{}'::jsonb then '{}'::jsonb
                              else jsonb_build_object('_values', v_entry -> 'values') end
                      || jsonb_build_object('_actor', 'system',
                                            '_source', jsonb_strip_nulls(jsonb_build_object(
                                              'via', 'import', 'import_id', p_import_id::text,
                                              'file', v_run.source_name, 'row', v_index))));
            v_landed := v_landed + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'landed', 'record_id', v_id));
          exception when others then
            v_bad := v_bad + 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
            if jsonb_array_length(v_ref) < c_keep then
              v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                         'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
            end if;
          end;
          continue;
        end if;
        v_word := v_ids[v_ord]::text;
      end if;

      v_dupes := v_dupes + 1;
      v_patch := (v_entry -> 'doc') - v_dk;
      if lower(coalesce(v_run.policy ->> 'on_duplicate', 'skip')) = 'update' then
        begin
          if v_patch <> '{}'::jsonb then
            perform custom.record_update(p_organization_id, v_word::uuid,
                      v_patch || jsonb_build_object('_values', (v_entry -> 'values') - v_dk, '_actor', 'system'), null);
          end if;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid,
                     'updated', v_patch <> '{}'::jsonb,
                     'reason', format('A record with %s = "%s" was already here, and it was brought up to date.', v_dk, v_entry ->> 'key')));
        exception when others then
          v_bad := v_bad + 1; v_dupes := v_dupes - 1;
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_entry -> 'source'));
          if jsonb_array_length(v_ref) < c_keep then
            v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_entry -> 'source'));
          end if;
          continue;
        end;
      else
        v_out := v_out || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'outcome', 'duplicate', 'record_id', v_word::uuid, 'updated', false,
                   'reason', format('A record with %s = "%s" was already here, and it was left alone.', v_dk, v_entry ->> 'key')));
      end if;
      if jsonb_array_length(v_dup) < c_keep then
        v_dup := v_dup || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'key', v_dk, 'value', v_entry ->> 'key',
                   'record_id', v_word::uuid, 'source', v_entry -> 'source'));
      end if;
    end if;
  end loop;

  -- THE PROPOSALS, built from everything this batch saw and MERGED with what earlier batches saw.
  select coalesce(jsonb_agg(p), '[]'::jsonb) into v_props
    from (
      select jsonb_build_object('column', u.key,
                                'samples', u.value,
                                'import_id', p_import_id::text)
             || (custom.io_infer_column(p_organization_id, v_run.table_id, u.key, u.value)
                   - 'header' - 'matched')
             || jsonb_build_object('state', 'proposed') as p
        from jsonb_each(v_unmap) u
       where not exists (select 1 from jsonb_array_elements(v_run.proposals) q
                          where q ->> 'column' = u.key)
    ) s;

  update custom.io_import
     set rows_seen      = rows_seen + v_seen,
         rows_written   = rows_written + v_landed,
         rows_duplicate = rows_duplicate + v_dupes,
         refusals       = refusals || v_ref,
         duplicates     = duplicates || v_dup,
         proposals      = proposals || v_made || v_props,
         mapping        = v_map,
         state          = 'written'
   where organization_id = p_organization_id and id = p_import_id;

  return jsonb_build_object(
    'import_id',      p_import_id,
    'rows_seen',      v_seen,
    'rows_written',   v_landed,
    'rows_duplicate', v_dupes,
    'rows_refused',   v_bad,
    'outcomes',       v_out,
    'proposals',      v_props,
    'columns_added',  v_made,
    -- Said out loud rather than hidden: this batch could not be written as one statement, so
    -- every row was written on its own and the refusals below name the rows that could not be.
    'one_statement',  v_fell is null,
    -- The measurement, said out loud: what the writing phase of THIS call cost a row, and how
    -- many rows that makes three seconds' worth. A caller that ignores them loses nothing.
    'write_ms',       round(v_wrote),
    'ms_per_row',     round(coalesce(v_perrow, 0), 2),
    'rows_per_call',  v_next,
    'refusals',       v_ref);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.io_import_finish(p_organization_id uuid, p_import_id uuid, p_unmapped text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_run    custom.io_import;
  v_mode   text;
  v_p      jsonb;
  v_spec   jsonb;
  v_next   jsonb := '[]'::jsonb;
  v_filed  integer := 0;
  v_made   integer := 0;
  v_left   integer := 0;
  v_id     uuid;
  v_ask    jsonb;
  v_admin  boolean;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_finish');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_finish');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here to finish.' using errcode = '23503';
  end if;
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_finish',
                                          'editor'::public.permission_level, 'table');

  v_mode := lower(coalesce(nullif(btrim(coalesce(p_unmapped, '')), ''),
                           nullif(v_run.policy ->> 'unmapped', ''), 'propose'));
  if v_mode not in ('propose', 'create', 'ignore') then
    raise exception 'A column this table does not have is offered ("propose"), added outright ("create") or left out ("ignore"), and this asked for "%".', v_mode
      using errcode = '22023';
  end if;
  v_admin := custom.my_level(p_organization_id, v_run.table_id, 'table') = 'admin'::public.permission_level
             or custom.query_is_store_owner();
  if v_mode = 'create' and not v_admin then
    raise exception 'Adding columns to this table outright is for its admins. Your columns can still be OFFERED, and whoever admins this table decides.'
      using errcode = '42501',
            hint = 'Finish with "propose" and every new column goes to the approvals inbox instead. The rows that landed are unaffected either way.';
  end if;

  for v_p in select value from jsonb_array_elements(coalesce(v_run.proposals, '[]'::jsonb)) loop
    if coalesce(v_p ->> 'state', 'proposed') <> 'proposed' then
      v_next := v_next || jsonb_build_array(v_p);
      continue;
    end if;
    v_spec := custom.io_proposal_spec(v_p);
    if v_mode = 'ignore' then
      v_left := v_left + 1;
      v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'ignored'));
    elsif v_mode = 'create' then
      -- THE SAME DOOR A HAND-MADE COLUMN GOES THROUGH, so nothing downstream ever has to ask
      -- where a column came from. A refusal is kept ON the proposal rather than ending the
      -- finish: nineteen good columns are not lost because the twentieth collided.
      begin
        v_id := custom.field_declare(p_organization_id, v_run.table_id, v_spec);
        v_made := v_made + 1;
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'accepted', 'field_id', v_id));
      exception when others then
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
      end;
    else
      -- THE ONE INBOX. A column an import wants and a column an agent wants are the same
      -- waiting change, in the same queue, decided by the same people with the same right —
      -- and approving it runs `custom.field_declare` with THIS spec, in that transaction.
      begin
        v_ask := custom.work_approval_request(
                   p_organization_id, v_run.table_id,
                   jsonb_build_object('kind', 'field_add', 'field', v_spec),
                   format('The file "%s" has a column called "%s" that this table does not. %s',
                          coalesce(v_run.source_name, 'you imported'),
                          v_p ->> 'column',
                          coalesce(v_p ->> 'why', '')),
                   null, 'person', null);
        v_filed := v_filed + 1;
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object(
                    'state', 'waiting', 'approval_id', v_ask ->> 'approval_id'));
      exception when others then
        v_next := v_next || jsonb_build_array(v_p || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
      end;
    end if;
  end loop;

  update custom.io_import
     set proposals   = v_next,
         state       = 'finished',
         finished_at = now(),
         policy      = policy || jsonb_build_object('unmapped', v_mode)
   where organization_id = p_organization_id and id = p_import_id
  returning * into v_run;

  return jsonb_build_object(
    'import_id',       p_import_id,
    'state',           'finished',
    'rows_seen',       v_run.rows_seen,
    'rows_written',    v_run.rows_written,
    'rows_duplicate',  v_run.rows_duplicate,
    'rows_refused',    v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate,
    'columns_offered', v_filed,
    'columns_added',   v_made,
    'columns_ignored', v_left,
    'proposals',       v_next,
    'message', format('%s row%s landed, %s were already here, %s refused.%s',
                      v_run.rows_written, case when v_run.rows_written = 1 then '' else 's' end,
                      v_run.rows_duplicate,
                      v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate,
                      case when v_filed > 0 then format(' %s new column%s %s waiting in the approvals inbox.',
                                                        v_filed, case when v_filed = 1 then '' else 's' end,
                                                        case when v_filed = 1 then 'is' else 'are' end)
                           when v_made > 0 then format(' %s new column%s added.', v_made,
                                                       case when v_made = 1 then '' else 's' end)
                           else '' end));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.work_approval_decide(p_organization_id uuid, p_approval_id uuid, p_approve boolean, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_me      uuid := custom.query_principal();
  v_row     custom.record;
  v_change  jsonb;
  v_kind    text;
  v_subject uuid;
  v_outcome text;
  v_key     text;
  v_fields  jsonb;
  v_spec    jsonb;
  v_field   uuid;
  v_version integer;
  v_written uuid[] := '{}';
  v_one     uuid;
  v_doc     jsonb;
  v_table   uuid;
  v_conv    uuid;
  v_at      timestamptz;
  v_why     text;
  v_by_name text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.work_approval_decide');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.work_approval_decide');

  select r.* into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_approval_id
     and r.data_class = 'work_approval' and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no such approval in this organization.' using errcode = '02000';
  end if;
  -- LANE S5-PRIME: A WITHDRAWN APPROVAL SAYS WHY. Nobody decided it; the store closed it when the
  -- thing it would change was archived, and the reason is on the approval itself.
  if v_row.data ->> 'state' = 'withdrawn' then
    -- HANDOVER (2026-09-27): no clock in the sentence. WHEN it closed is a fact for the reader's
    -- own clock, so it rides in DETAIL (ISO 8601) and the screen says it in the reader's words.
    raise exception 'That was withdrawn. %', coalesce(v_row.data ->> 'withdrawn_reason', '')
      using errcode = '23505',
            hint = 'A withdrawn approval is closed. Bring the record back from the archive and ask again if the change still needs making.',
            detail = jsonb_build_object('state', 'withdrawn',
                                        'decided_at', nullif(v_row.data ->> 'decided_at', ''))::text;
  end if;
  if coalesce(v_row.data ->> 'state', 'pending') <> 'pending' then
    -- HANDOVER (2026-09-27): WHO in the sentence, WHEN in DETAIL. The sentence read "That was
    -- already approved, on 2026-09-28T01:23:12.271Z." on a person's screen; the time is now a
    -- structured fact (state, decided_at, decided_by, decided_by_name) the card says as
    -- "Approved by admin 12 minutes ago."
    v_by_name := (select coalesce(nullif(u.raw_user_meta_data ->> 'display_name', ''),
                                   nullif(u.raw_user_meta_data ->> 'full_name', ''),
                                   split_part(u.email::text, '@', 1))::text
                      from auth.users u where u.id = nullif(v_row.data ->> 'decided_by', '')::uuid);
    raise exception 'That was already % by %.', v_row.data ->> 'state', coalesce(v_by_name, 'somebody')
      using errcode = '23505',
            hint = 'An approval is decided once. Ask for the change again if it still needs making.',
            detail = jsonb_build_object('state', v_row.data ->> 'state',
                                        'decided_at', nullif(v_row.data ->> 'decided_at', ''),
                                        'decided_by', nullif(v_row.data ->> 'decided_by', ''),
                                        'decided_by_name', v_by_name)::text;
  end if;

  if not custom.work_approval_may_decide(p_organization_id, p_approval_id) then
    raise exception 'You are not one of the people who can approve this.'
      using errcode = '42501',
            hint = 'AGT-4: an approval is decided by the person it was addressed to, by anybody with admin on the thing being changed, or by an owner or admin of this organization. Ask one of them.';
  end if;
  -- THE SECOND PAIR OF EYES IS FOR A PERSON'S REQUEST. An agent's call runs as the person it
  -- is working for, so `requested_by` on an agent request names THAT person — the very one
  -- `ask` exists to consult. Holding the bar there would have made every agent wait
  -- undecidable by the only person looking at it. It still holds for `origin = 'person'`.
  if v_me is not null and nullif(v_row.data ->> 'requested_by', '')::uuid = v_me
     and coalesce(v_row.data ->> 'origin', 'person') <> 'agent'
     and not custom.query_is_store_owner() then
    raise exception 'You asked for this change, so somebody else approves it.'
      using errcode = '42501',
            hint = 'The point of asking is that a second person says yes. If nobody else needs to, make the change directly instead.';
  end if;

  -- LANE S5-PRIME: NOTHING IS DECIDED ABOUT AN ARCHIVED THING. Archiving withdraws the
  -- approvals waiting on it (custom._work_approvals_withdraw_on_archive); this is the door's own
  -- refusal for any that reach it anyway, in the store's words, before anything is applied.
  v_why := custom.work_approval_withdrawal(p_organization_id, v_row.data);
  if v_why is not null then
    raise exception '%', v_why
      using errcode = '55000',
            hint = 'Nothing was changed. Bring it back from the archive first; then ask for the change again.';
  end if;

  v_subject := nullif(v_row.data ->> 'subject_id', '')::uuid;
  v_change  := v_row.data -> 'change';
  v_kind    := lower(coalesce(v_change ->> 'kind', ''));
  v_conv    := nullif(v_row.data ->> 'conversation_id', '')::uuid;

  if p_approve then
    if v_kind = 'record_patch' then
      -- STAGE-RULES: THE GATE THAT ASKED FOR THIS APPROVAL STEPS ASIDE FOR THIS ONE WRITE.
      -- A stage gate whose on_fail is `require_approval` refuses the write by raising, which
      -- is HOW this change got into the queue at all. Applying the yes has to get past the
      -- same gate, and it gets past it by NAMING THE RECORD it is applying an approved
      -- change to, for the length of that one statement and no longer. Every plain refusal,
      -- every other validator and the whole value envelope still run, so an approver is
      -- never told yes over a write the store itself would refuse.
      perform set_config('custom.applying_approval_for', v_subject::text, true);
      v_version := custom.record_update(p_organization_id, v_subject, v_change -> 'patch', null);
      perform set_config('custom.applying_approval_for', '', true);
      v_outcome := format('Applied. %s is now at version %s.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'), v_version);
    elsif v_kind = 'record_add' then
      -- THE SAME DOOR THE UNATTENDED PATH USES, once per row, in THIS transaction. Every
      -- guard, every validator and the value envelope run per row exactly as they would for
      -- an agent that was never asked; the difference is whose name is on the history row.
      -- One refused row rolls the whole decision back, which is what a person means by
      -- saying yes to a batch.
      for v_doc in select value from jsonb_array_elements(v_change -> 'rows')
      loop
        v_one := custom.record_write(p_organization_id, v_subject, v_doc);
        v_written := v_written || v_one;
      end loop;
      v_outcome := format('Applied. %s %s now in %s.',
                          cardinality(v_written),
                          case when cardinality(v_written) = 1 then 'record is' else 'records are' end,
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    elsif v_kind = 'record_delete' then
      -- THE STORE'S OWN DELETE, AS THE APPROVER, IN THIS TRANSACTION. custom.record_delete
      -- runs custom.delete_rule first, so a record something still reads is refused here in
      -- the store's own words and the decision rolls back — an approver is never told yes
      -- over a delete the store would have refused.
      v_at := custom.record_delete(p_organization_id, v_subject);
      v_outcome := format('Removed. %s was deleted on %s and can be put back.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'),
                          to_char(v_at at time zone 'utc', 'YYYY-MM-DD HH24:MI'));
    elsif v_kind = 'record_restore' then
      perform custom.record_restore(p_organization_id, v_subject);
      v_outcome := format('Put back. %s is here again.',
                          coalesce(v_row.data ->> 'subject_title', 'That record'));
    elsif v_kind = 'table_add' then
      -- EXACTLY WHAT THE DIRECT PATH RUNS, IN EXACTLY THAT ORDER: custom.table_declare with
      -- the spec that was shown, then custom.field_declare once per column. Not a re-derived
      -- spec and not a second way of making a table — the same two doors, so an approved
      -- table and an unasked one are the same bytes.
      v_table := custom.table_declare(p_organization_id, v_change -> 'table');
      for v_doc in select value from jsonb_array_elements(coalesce(v_change -> 'fields', '[]'::jsonb))
      loop
        v_field := custom.field_declare(p_organization_id, v_table, v_doc);
      end loop;
      -- THE CONVERSATION'S CLAIM TRAVELS WITH THE APPROVAL. A table a person said yes to is
      -- still the table this conversation made, so the agent's next change to it is not a
      -- change to somebody's pre-existing table.
      if v_conv is not null then
        perform custom.agent_table_claim(p_organization_id, v_table, v_conv);
      end if;
      v_field := null;
      v_outcome := format('Created. %s is now a table in %s, with %s column%s.',
                          coalesce(nullif(v_change #>> '{table,name}', ''), 'That table'),
                          coalesce(v_row.data ->> 'subject_title', 'this organization'),
                          jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)),
                          case when jsonb_array_length(coalesce(v_change -> 'fields', '[]'::jsonb)) = 1
                               then '' else 's' end);
    elsif v_kind = 'doc_template_add' then
      -- THE SAME DOOR THE UNASKED PATH USES, with the bytes that were shown on the card.
      -- `custom.doc_template_save` re-runs every one of its own refusals here, as the
      -- approver — including the one that names a token pointing at no column — so an
      -- approved template and one written directly are the same template.
      v_written := array[custom.doc_template_save(
                           p_organization_id, v_subject,
                           v_change #>> '{template,name}',
                           coalesce(v_change #>> '{template,body}', ''),
                           nullif(v_change #>> '{template,template_id}', '')::uuid)];
      v_outcome := format('Saved. %s is now a document template on %s.',
                          coalesce(nullif(v_change #>> '{template,name}', ''), 'That template'),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    else
      v_spec := v_change -> 'field';
      v_key  := coalesce(nullif(v_spec ->> 'key', ''), nullif(v_spec ->> 'name', ''));
      if v_key is null then
        raise exception 'That column has no name, so it cannot be added.' using errcode = '22004';
      end if;
      -- ── FIELD-TRUTH 2026-09-21: THE NAME AND THE DEFINITION GO ON TOGETHER. ─────────
      -- This used to write the NAME into the table's `fields` list in one statement and
      -- then define the column in the next. Between those two statements the table claimed
      -- a column that no Field record backed — a name with no type, no rules and no
      -- validation, which `custom.applicable_fields` never answers with and no grid can
      -- draw. `custom.assert_columns_are_defined` refuses exactly that shape now, and it
      -- refused this door: *"Estimates says it has a column called "rate_card", and there
      -- is no such field"* when an agent's Rate card proposal was approved.
      -- The pre-add was also REDUNDANT: `custom.field_declare` appends the name to the
      -- table's list itself, in the same call that writes the definition, which is the
      -- whole point of there being one door for a column.
      v_field := custom.field_declare(p_organization_id, v_subject,
                   v_spec || jsonb_build_object('key', v_key));
      v_outcome := format('%s is now a column on %s.',
                          coalesce(nullif(v_spec ->> 'label', ''), v_key),
                          coalesce(v_row.data ->> 'subject_title', 'that table'));
    end if;
  else
    v_outcome := case
                   when v_kind = 'field_add'
                     then format('The column %s was not added.',
                                 coalesce(nullif(v_change #>> '{field,label}', ''),
                                          nullif(v_change #>> '{field,key}', ''), 'asked for'))
                   when v_kind = 'record_add'
                     then format('%s %s not written to %s.',
                                 jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)),
                                 case when jsonb_array_length(coalesce(v_change -> 'rows', '[]'::jsonb)) = 1
                                      then 'record was' else 'records were' end,
                                 coalesce(v_row.data ->> 'subject_title', 'that table'))
                   when v_kind = 'record_delete'
                     then format('%s was not deleted, and is still here.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'record_restore'
                     then format('%s was not put back, and is still deleted.',
                                 coalesce(v_row.data ->> 'subject_title', 'That record'))
                   when v_kind = 'table_add'
                     then format('The table %s was not created.',
                                 coalesce(nullif(v_change #>> '{table,name}', ''), 'asked for'))
                   when v_kind = 'doc_template_add'
                     then format('The document template %s was not saved.',
                                 coalesce(nullif(v_change #>> '{template,name}', ''), 'asked for'))
                   else format('%s was left as it was.',
                               coalesce(v_row.data ->> 'subject_title', 'That record')) end;
  end if;

  update custom.record r
     set data = r.data || jsonb_strip_nulls(jsonb_build_object(
           'state',         case when p_approve then 'approved' else 'declined' end,
           'decided_by',    v_me::text,
           'decided_at',    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
           'decision_note', nullif(btrim(coalesce(p_note, '')), ''),
           'applied_field_id', v_field::text,
           'applied_table_id', v_table::text,
           'applied_record_ids', case when cardinality(v_written) > 0
                                      then to_jsonb(v_written) end,
           'outcome',       v_outcome))
   where r.organization_id = p_organization_id and r.id = p_approval_id;

  return jsonb_build_object(
    'approval_id', p_approval_id,
    'state',       case when p_approve then 'approved' else 'declined' end,
    'subject_id',  v_subject,
    'applied',     coalesce(p_approve, false),
    'field_id',    v_field,
    'table_id',    v_table,
    'record_ids',  case when cardinality(v_written) > 0 then to_jsonb(v_written) end,
    'version',     v_version,
    'message',     v_outcome);
end
$function$;

DROP FUNCTION IF EXISTS custom._io_fill_held_column(uuid, uuid, uuid, uuid, text);

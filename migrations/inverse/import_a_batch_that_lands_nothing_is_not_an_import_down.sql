-- INVERSE of migrations/campaign/import_a_batch_that_lands_nothing_is_not_an_import.sql
-- (lane FIX-10B, VERIFIER-10 F2). It puts `custom.io_import_begin` and `custom.io_import_rows`
-- back to the LIVE bytes they held before that file ran, read out of the catalogue with
-- `pg_get_functiondef` immediately before the forward file was written. Both keep their exact
-- signatures and their existing grants, so nothing that calls them changes.
--
-- Running this restores the two defects on purpose: a batch that lands nothing is remembered
-- as an import, and the write no longer waits for the columns the run asked for.

-- custom.io_import_begin(p_organization_id uuid, p_table_id uuid, p_format text, p_source_name text, p_source_columns jsonb, p_file_hash text, p_policy jsonb, p_dedupe_key text, p_file_bytes bigint, p_force boolean)
CREATE OR REPLACE FUNCTION custom.io_import_begin(p_organization_id uuid, p_table_id uuid, p_format text DEFAULT 'csv'::text, p_source_name text DEFAULT NULL::text, p_source_columns jsonb DEFAULT '[]'::jsonb, p_file_hash text DEFAULT NULL::text, p_policy jsonb DEFAULT '{}'::jsonb, p_dedupe_key text DEFAULT NULL::text, p_file_bytes bigint DEFAULT NULL::bigint, p_force boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_prior  custom.io_import;
  v_policy jsonb;
  v_dupes  text;
  v_unmap  text;
  v_id     uuid;
begin
  -- THE SWITCH, THE WALL, THE RUNG — all three by name, before anything is read or written.
  -- Opening an import is a change to the Table's contents, so it is the editor rung, exactly
  -- as `custom.io_import_open` has always asked.
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_begin');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_begin',
                                          'editor'::public.permission_level, 'table');

  if p_organization_id is null or p_table_id is null then
    raise exception 'An import belongs to one organization and one table, and this one does not say which.'
      using errcode = '22004';
  end if;
  if coalesce(p_format, '') not in ('csv', 'xlsx') then
    raise exception 'A file is read as a spreadsheet (xlsx) or as a comma-separated file (csv), and "%" is neither.', p_format
      using errcode = '22023',
            hint = 'The parse differs; nothing after it does.';
  end if;

  v_policy := coalesce(p_policy, '{}'::jsonb);
  v_dupes  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'on_duplicate', '')), ''), 'skip'));
  v_unmap  := lower(coalesce(nullif(btrim(coalesce(v_policy ->> 'unmapped', '')), ''), 'propose'));
  if v_dupes not in ('skip', 'update') then
    raise exception 'A row that is already here is either left alone ("skip") or brought up to date ("update"), and this import asked for "%".', v_dupes
      using errcode = '22023',
            hint = 'Nothing was opened. Writing a second copy is not one of the choices, which is the whole point of naming a duplicate key.';
  end if;
  if v_unmap not in ('propose', 'create', 'ignore') then
    raise exception 'A column this table does not have is offered as a new column ("propose"), added outright ("create") or left out ("ignore"), and this import asked for "%".', v_unmap
      using errcode = '22023', hint = 'Nothing was opened.';
  end if;
  -- ADDING A COLUMN OUTRIGHT IS AN ADMIN'S ACT, AND IT IS ASKED HERE RATHER THAN AT THE END.
  -- A person who chose "just add them" and is told at the end of a 5,000-row run that they
  -- may not has been made to wait for a refusal the store knew at the start.
  if v_unmap = 'create'
     and custom.my_level(p_organization_id, p_table_id, 'table') <> 'admin'::public.permission_level
     and not custom.query_is_store_owner() then
    raise exception 'Adding columns to this table outright is for its admins. Your columns can still be OFFERED, and whoever admins this table decides.'
      using errcode = '42501',
            hint = 'Open the import with unmapped set to "propose" and every new column goes to the approvals inbox instead. Nothing was opened.';
  end if;
  if nullif(btrim(coalesce(p_dedupe_key, '')), '') is not null
     and not exists (select 1 from custom.applicable_fields(p_organization_id, p_table_id, null) f
                      where f.data ->> 'key' = btrim(p_dedupe_key)) then
    raise exception 'This table has no column called "%", so it cannot be what makes a row the same row.', btrim(p_dedupe_key)
      using errcode = '23503',
            hint = 'The columns are: ' ||
                   coalesce((select string_agg(coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key'), ', ' order by f.data ->> 'key')
                               from custom.applicable_fields(p_organization_id, p_table_id, null) f), '(none yet)') ||
                   '. Nothing was opened.';
  end if;

  -- THE SAME FILE, TWICE. This is the whole of "a re-import doubles nothing", and it is
  -- decided here rather than per row: the second run is never opened at all, so there is no
  -- half-run to reconcile and no second set of proposals for the same columns.
  if nullif(btrim(coalesce(p_file_hash, '')), '') is not null and not coalesce(p_force, false) then
    select * into v_prior
      from custom.io_import i
     where i.organization_id = p_organization_id
       and i.table_id = p_table_id
       and i.file_hash = btrim(p_file_hash)
       and i.deleted_at is null
     order by i.created_at
     limit 1;
    if found then
      return jsonb_build_object(
        'import_id',     v_prior.id,
        'state',         v_prior.state,
        'already',       true,
        'opened_at',     v_prior.created_at,
        'rows_seen',     v_prior.rows_seen,
        'rows_written',  v_prior.rows_written,
        'rows_duplicate',v_prior.rows_duplicate,
        'source_name',   v_prior.source_name,
        'message',       format('This file was already imported into this table on %s — %s row%s landed then. Nothing was written again.',
                                to_char(v_prior.created_at at time zone 'utc', 'FMDay FMDD FMMonth, HH24:MI'),
                                v_prior.rows_written,
                                case when v_prior.rows_written = 1 then '' else 's' end));
    end if;
  end if;

  insert into custom.io_import (organization_id, table_id, format, source_name, source_columns,
                                file_hash, file_bytes, dedupe_key, policy, state)
  values (p_organization_id, p_table_id, p_format, p_source_name,
          coalesce(p_source_columns, '[]'::jsonb),
          nullif(btrim(coalesce(p_file_hash, '')), ''),
          p_file_bytes,
          nullif(btrim(coalesce(p_dedupe_key, '')), ''),
          jsonb_build_object('on_duplicate', v_dupes, 'unmapped', v_unmap)
            || (v_policy - 'on_duplicate' - 'unmapped')
            || case when coalesce(p_force, false) then jsonb_build_object('forced', true) else '{}'::jsonb end,
          'open')
  returning id into v_id;

  return jsonb_build_object('import_id', v_id, 'state', 'open', 'already', false,
                            'rows_seen', 0, 'rows_written', 0, 'rows_duplicate', 0,
                            'source_name', p_source_name,
                            'message', 'Ready. Send the rows in batches.');
end;
$function$
;

-- custom.io_import_rows(p_organization_id uuid, p_import_id uuid, p_rows jsonb, p_mapping jsonb)
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
  v_hit     uuid;
  v_seen    integer := 0;
  v_landed  integer := 0;
  v_dupes   integer := 0;
  v_bad     integer := 0;
  v_out     jsonb := '[]'::jsonb;      -- this batch's per-row outcomes
  v_ref     jsonb := '[]'::jsonb;
  v_dup     jsonb := '[]'::jsonb;
  v_unmap   jsonb := '{}'::jsonb;
  v_props   jsonb := '[]'::jsonb;
  v_id      uuid;
  v_patch   jsonb;
  v_reason  text;
  v_index   integer;
begin
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
    raise exception 'That import was finished on %, so no more rows go into it.',
                    to_char(coalesce(v_run.finished_at, v_run.updated_at) at time zone 'utc', 'FMDay FMDD FMMonth, HH24:MI')
      using errcode = '23514',
            hint = 'Start a new import for the rest of the file. Nothing was written.';
  end if;
  -- THE RUNG, ON THE TABLE THIS RUN BELONGS TO. `io_import_open` asked it when the run was
  -- opened and this door never did, so a person whose access was taken away mid-import kept
  -- writing. It is asked on every batch now, which is the only place it can be true.
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_rows',
                                          'editor'::public.permission_level, 'table');

  v_map   := coalesce(v_run.mapping, '{}'::jsonb) || coalesce(p_mapping, '{}'::jsonb);
  v_order := lower(coalesce(nullif(v_run.policy ->> 'date_order', ''), 'mdy'));
  v_dk    := nullif(btrim(coalesce(v_run.dedupe_key, '')), '');

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH. Five hundred rows asking the
  -- applicable-field question five hundred times is the same answer five hundred times.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
  end loop;

  -- WHAT IS ALREADY HERE, for exactly the key values this batch carries. One question for the
  -- batch rather than one per row, and bounded by the batch rather than by the table.
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

  -- THE SOURCE EVERY VALUE OF THIS RUN POINTS AT. One object, written on every value; the
  -- store interns it to ONE pointer per record (VAL-1), so a forty-column row carries the
  -- file's identity once rather than forty times.
  v_src := jsonb_strip_nulls(jsonb_build_object(
             'kind',      'import',
             'import_id', p_import_id::text,
             'file',      v_run.source_name,
             'hash',      v_run.file_hash,
             'format',    v_run.format));

  for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
    v_seen  := v_seen + 1;
    v_index := coalesce(v_run.rows_seen, 0) + v_seen;
    v_doc   := '{}'::jsonb;
    v_values:= '{}'::jsonb;
    v_reason:= null;

    for v_key, v_val in select key, value from jsonb_each(v_row) loop
      -- The mapping is authored (a person chose), or it is the identity (the header already
      -- spells a Field key). Both are the same row here: a mapped column is a mapped column.
      v_mapped := coalesce(v_map ->> v_key,
                           case when v_fields ? v_key then v_key else null end);
      if v_mapped is null then
        -- SCR-N-7: not an error, an OFFER. Remembered WITH a sample so the proposal can say
        -- what the column actually looked like rather than merely that it existed.
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

    -- ── LIMITS-FIX 2026-09-21: A ROW WITH NOTHING IN IT IS NOT A RECORD. ────────────────
    -- If no column of this row mapped to a column of this table — or every mapped cell was
    -- blank — `v_doc` is still `{}` and no reason was set, so the row fell through to
    -- `custom.record_write` and became an EMPTY record. Real-data crew C hit exactly that:
    -- the import "silently writes fully-empty rows when nothing maps". Crew E2 hit its
    -- mirror image, an import that reported writing rows and persisted none.
    -- A blank line in a spreadsheet is not a thing the business has; neither is a row whose
    -- every column the table has never heard of. Both are refused HERE, with the reason and
    -- the remedy, and they land in this call's own per-row report like any other refusal —
    -- so the wizard has something true to show instead of a silent success.
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
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', v_reason, 'source', v_row));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', '22023', 'reason', v_reason, 'source', v_row));
      end if;
      continue;
    end if;

    -- ALREADY HERE? The duplicate key decides, and the policy decides what that means.
    if v_dk is not null then
      v_word := v_doc ->> v_dk;
      if v_word is not null and v_exist ? v_word then
        v_hit := (v_exist ->> v_word)::uuid;
        v_dupes := v_dupes + 1;
        if lower(coalesce(v_run.policy ->> 'on_duplicate', 'skip')) = 'update' then
          v_patch := v_doc - v_dk;
          begin
            if v_patch <> '{}'::jsonb then
              perform custom.record_update(p_organization_id, v_hit,
                        v_patch || jsonb_build_object('_values', v_values - v_dk, '_actor', 'system'), null);
            end if;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'duplicate', 'record_id', v_hit,
                       'updated', v_patch <> '{}'::jsonb,
                       'reason', format('A record with %s = "%s" was already here, and it was brought up to date.', v_dk, v_word)));
          exception when others then
            v_bad := v_bad + 1; v_dupes := v_dupes - 1;
            v_out := v_out || jsonb_build_array(jsonb_build_object(
                       'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_row));
            if jsonb_array_length(v_ref) < c_keep then
              v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                         'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_row));
            end if;
            continue;
          end;
        else
          v_out := v_out || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'outcome', 'duplicate', 'record_id', v_hit, 'updated', false,
                     'reason', format('A record with %s = "%s" was already here, and it was left alone.', v_dk, v_word)));
        end if;
        if jsonb_array_length(v_dup) < c_keep then
          v_dup := v_dup || jsonb_build_array(jsonb_build_object(
                     'row', v_index, 'key', v_dk, 'value', v_word, 'record_id', v_hit, 'source', v_row));
        end if;
        continue;
      end if;
    end if;

    -- THE ONE WRITE DOOR. Validation, the value envelope, the provenance interning, the rules,
    -- the history capture and the outbox all hang off this call; an INSERT here would skip
    -- every one of them.
    begin
      v_id := custom.record_write(p_organization_id, v_run.table_id,
                v_doc
                || case when v_values = '{}'::jsonb then '{}'::jsonb else jsonb_build_object('_values', v_values) end
                || jsonb_build_object('_actor', 'system',
                                      '_source', jsonb_strip_nulls(jsonb_build_object(
                                        'via', 'import', 'import_id', p_import_id::text,
                                        'file', v_run.source_name, 'row', v_index))));
      v_landed := v_landed + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'landed', 'record_id', v_id));
      -- A KEY THIS BATCH JUST WROTE IS NOW "ALREADY HERE" for the rest of the batch. Without
      -- this, a file that repeats a row inside one batch lands it twice although the caller
      -- named a duplicate key.
      if v_dk is not null and v_doc ->> v_dk is not null then
        v_exist := v_exist || jsonb_build_object(v_doc ->> v_dk, v_id::text);
      end if;
    exception when others then
      v_bad := v_bad + 1;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
                 'row', v_index, 'outcome', 'refused', 'reason', sqlerrm, 'source', v_row));
      if jsonb_array_length(v_ref) < c_keep then
        v_ref := v_ref || jsonb_build_array(jsonb_build_object(
                   'row', v_index, 'sqlstate', sqlstate, 'reason', sqlerrm, 'source', v_row));
      end if;
    end;
  end loop;

  -- THE PROPOSALS, built from everything this batch saw and MERGED with what earlier batches
  -- saw. A column that only appears from row 400 onwards is still offered.
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
         proposals      = proposals || v_props,
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
    -- The old shape, kept so nothing that already reads this door has to change.
    'refusals',       v_ref);
end;
$function$
;

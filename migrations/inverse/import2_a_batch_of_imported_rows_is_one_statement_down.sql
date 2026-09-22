-- additive: yes
--
-- chair-step: it DROPS custom.io_import_declare_columns and custom._io_declare_unmapped, REVOKES the client grant on the first, and DELETEs their platform.client_callable_door rows — which is the whole point of an inverse of a file that added them.
--
-- IMPORT-2 — THE INVERSE of import2_a_batch_of_imported_rows_is_one_statement.sql.
--
-- It puts back the EXACT body `custom.io_import_rows` carried before this lane (FIX-10B's,
-- sha256 6fccc44cbacbcff1be437beed38d933dc29633bec3a32f9e1c7f7d9985b0bc68, dumped from the live
-- catalogue), and takes away the two objects the lane added and the client grant on the one
-- that had one. Run to prove the lane's suite goes RED; the up file is re-applied after it.
--
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 5c64f5bb79ff4aa170c414e89b213fb6b4385e17cf273beb2c5b4442878ce251

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
  -- FIX-10B: the pre-pass that makes the write wait for the columns it asked for.
  v_mode    text;
  v_new     jsonb := '{}'::jsonb;      -- header -> samples, for headers this table has not got
  v_made    jsonb := '[]'::jsonb;      -- the proposal documents this call ACCEPTED, for the run
  v_prop    jsonb;
  v_inf     jsonb;
  v_spec    jsonb;
  v_fid     uuid;
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
  v_mode  := lower(coalesce(nullif(v_run.policy ->> 'unmapped', ''), 'propose'));

  -- THE TABLE'S OWN COLUMNS, READ ONCE FOR THE WHOLE BATCH. Five hundred rows asking the
  -- applicable-field question five hundred times is the same answer five hundred times.
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
  end loop;

  -- ── FIX-10B (VERIFIER-10 F2): THE WRITE WAITS FOR THE DECLARED COLUMNS. ────────────────
  -- The run's own policy already says what a column this table has not got is: offered,
  -- added outright, or left out. `create` was answered one call too late — `io_import_finish`
  -- made the columns AFTER every row had already been refused against their absence, so the
  -- very first import into a fresh table could not land a single row. A column is declared
  -- here, before this batch writes anything, through `custom.field_declare` with the SAME
  -- spec `io_import_finish` builds, and the accepted proposal is recorded on the run so the
  -- finish has nothing left to do for it. `propose` and `ignore` are untouched.
  if v_mode = 'create' then
    for v_row in select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) loop
      for v_key, v_val in select key, value from jsonb_each(v_row) loop
        if (v_map ? v_key) or (v_fields ? v_key) then
          continue;
        end if;
        v_new := v_new || jsonb_build_object(
          v_key, coalesce(v_new -> v_key, '[]'::jsonb) ||
                 case when jsonb_array_length(coalesce(v_new -> v_key, '[]'::jsonb)) < 12
                        and coalesce(v_val #>> '{}', '') <> ''
                      then jsonb_build_array(v_val) else '[]'::jsonb end);
      end loop;
    end loop;

    for v_key in select k from jsonb_object_keys(v_new) k loop
      v_inf  := custom.io_infer_column(p_organization_id, v_run.table_id, v_key, v_new -> v_key);
      v_prop := jsonb_build_object('column', v_key,
                                   'samples', v_new -> v_key,
                                   'import_id', p_import_id::text)
                || (v_inf - 'header' - 'matched')
                || jsonb_build_object('state', 'proposed');
      -- A HEADER THAT ALREADY NAMES A COLUMN IS A MAPPING, NOT A NEW COLUMN. `io_infer_column`
      -- has always answered this (a header matching a Field's LABEL — "Job Number" against
      -- `job_number`), and nothing at write time consumed the answer, so a header spelled the
      -- way a person spells it was refused unless somebody mapped it by hand.
      if coalesce((v_inf ->> 'matched')::boolean, false) then
        v_map := v_map || jsonb_build_object(v_key, v_prop ->> 'field_key');
        continue;
      end if;
      v_spec := custom.io_proposal_spec(v_prop);
      begin
        v_fid  := custom.field_declare(p_organization_id, v_run.table_id, v_spec);
        v_map  := v_map || jsonb_build_object(v_key, v_spec ->> 'key');
        v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'accepted', 'field_id', v_fid));
      exception when others then
        -- NINETEEN GOOD COLUMNS ARE NOT LOST BECAUSE THE TWENTIETH COLLIDED, and the rows that
        -- only needed the nineteen still land. The refusal is kept ON the proposal, exactly as
        -- `io_import_finish` keeps it, so the screen can say which column and why.
        v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
      end;
    end loop;

    -- THE COLUMNS ARE NOW REAL, so the batch is written against what the table actually has.
    if jsonb_array_length(v_made) > 0 then
      v_fields := '{}'::jsonb;
      for v_f in select f.data as data from custom.applicable_fields(p_organization_id, v_run.table_id, null) f
      loop
        v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
      end loop;
    end if;
  end if;

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
         -- The columns this call MADE are recorded as accepted proposals, so the run's own
         -- report says which columns appeared and `io_import_finish` has nothing left to do
         -- for them (it skips any proposal whose state is not `proposed`).
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
    -- The columns this call declared before it wrote a row, so a screen can say "eight
    -- columns were added" instead of leaving the person to notice.
    'columns_added',  v_made,
    -- The old shape, kept so nothing that already reads this door has to change.
    'refusals',       v_ref);
end;
$function$

;

revoke execute on function custom.io_import_declare_columns(uuid, uuid, jsonb, jsonb) from authenticated;
drop function if exists custom.io_import_declare_columns(uuid, uuid, jsonb, jsonb);
drop function if exists custom._io_declare_unmapped(uuid, uuid, jsonb, jsonb);
-- A DOOR FOLLOWS ITS FUNCTION: both rows go, or provision_shape_guard refuses the commit
-- (it did, the first time this inverse was run).
delete from platform.client_callable_door
 where schema_name = 'custom'
   and function_name in ('io_import_declare_columns', '_io_declare_unmapped');

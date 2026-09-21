-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 752f536831d0fec97f492e58771981f30f58ce40a71056e1c380b12afc085e4b
--
-- LIMITS-FIX — AN IMPORT ROW WITH NOTHING IN IT IS NOT A RECORD.
--
-- Real-data crew C, entering three trades businesses through the live system: the import
-- "silently writes fully-empty rows when nothing maps". Real-data crew E2 hit the mirror
-- image on a clean table: the wizard's final "Write N rows" reported success and persisted
-- 0 of 2, with no on-screen error.
--
-- THE DEFECT, exactly. In `custom.io_import_rows`, a source column with no mapping is not
-- an error — it is remembered as an OFFER (SCR-N-7) and the loop moves on. That is right.
-- But when NO column of a row maps, the loop simply ends with `v_doc` still `{}` and
-- `v_reason` still null, so the row falls past the refusal branch and into
-- `custom.record_write` — and an empty document is a record with no values in it. The same
-- fall-through happens when every mapped cell was blank and `custom.io_cell` said `skip`.
--
-- A blank line in a spreadsheet is not something the business has, and neither is a row
-- whose every column this table has never heard of. Both are now refused where every other
-- bad row is refused, with the reason and — when the columns simply did not match — the
-- names of the ones that did not, so a person can map them or add them.
--
-- THIS CHANGES NO GOOD ROW. A row with even one mapped, non-blank value is untouched. The
-- refusal lands in this call's own per-row report (`outcome: refused`, with `reason`), which
-- the door already returns, so the wizard has something true to show instead of a silent
-- success. Showing it is the screen's half and belongs to lane LIMITS-FIX-UI.
--
-- NOT A DEFECT, checked while here and recorded so nobody re-reports it: the door's header
-- matching is NOT case-sensitive. `custom.io_infer_column` matches `lower(key)` and
-- `lower(label)` against the lower-cased header and falls back to a normalised form
-- (`[^a-z0-9]+` collapsed to `_`), so "Stem Count", "stem count" and "Stem-Count" all find
-- `stem_count`. If a crew saw case-sensitive matching, it was the package's client-side
-- mapper and not this door.
--
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

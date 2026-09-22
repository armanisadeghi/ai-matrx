-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_import_begin(uuid, uuid, text, text, jsonb, text, jsonb, text, bigint, boolean) 23450f00214e944d0d28a9c4c2fb6424ee05e176589b9bea7cd6184ecbf4427d
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 34f730c6674bf3d09aadf930783bcd031ec53de43f9937ebcb0c12209e2a8e0f
--
-- LANE FIX-10B — VERIFIER-10 finding F2 (BLOCKING).
--
-- WHAT A PERSON DID, AND WHAT HAPPENED. An admin of Rincon Plumbing Co made a table with
-- `New table`, opened Import, chose a 1,000-row dispatch-backlog CSV, set "Columns this table
-- does not have" to "are added straight away", and pressed `Import 1000 rows`.
--
--   pass 1:  0 landed · 0 already here · 1000 refused
--            every row: "Nothing to save. Unmatched: Crew, Customer, Job Number, Notes,
--            Scheduled Date, Service Address, Service Type, Status."
--   pass 2:  "This file was already imported into this table on Tuesday 22 September, 01:17
--            — 0 rows landed then. Nothing was written again."   0 · 0 · 0
--
-- The eight columns WERE created by pass 1. The file is now refused forever. The feature
-- itself works: a never-seen file, with the columns present, imports perfectly. So there are
-- exactly two defects here and they are both about ORDER and MEMORY, not about importing.
--
-- ── DEFECT 1: THE WRITE DID NOT WAIT FOR THE COLUMNS IT ASKED FOR. ────────────────────────
-- `custom.io_import_rows` writes every row FIRST and `custom.io_import_finish` creates the
-- columns AFTERWARDS. With `unmapped = 'create'` — the person's own answer to the screen's
-- own question — that order can only ever produce what it produced: a thousand rows refused
-- against columns that did not exist yet, and the columns created one call too late for any
-- of them. Nothing was wrong with the writes; they were asked the wrong question.
--
-- THE RULE THIS FILE MAKES TRUE: **the write waits for the declared columns.** A batch whose
-- run says "add the columns outright" now DECLARES this batch's unmapped columns before it
-- writes a single row of that batch, through `custom.field_declare` — the same door a
-- hand-made column goes through, the same spec `io_import_finish` builds, the same proposal
-- document recorded on the run. One evaluator, not two: `io_import_finish` is untouched and
-- still finishes a run whose proposals are already accepted, so a run that used `propose`
-- behaves exactly as it did.
--
-- A SECOND, SMALLER WRONG CLOSES WITH IT. `custom.io_infer_column` already answers "this
-- table already has a column called X" when a header matches a Field's LABEL rather than its
-- key ("Job Number" → `job_number`). Nothing consumed that answer at write time, so a header
-- spelled the way a person spells it was "unmatched" unless the screen had mapped it by hand.
-- The pre-pass consumes it: a matched header is MAPPED, never re-declared.
--
-- ── DEFECT 2: A BATCH THAT LANDED NOTHING WAS REMEMBERED AS AN IMPORT. ────────────────────
-- `custom.io_import_begin` asks "have I seen this file?" when the only question worth asking
-- is "did anything land?". A run that wrote zero rows and zero duplicates is not an import of
-- that file; it is a run that failed. Remembering it closes the door on the file permanently,
-- which is the worst of both worlds: the guard that exists to stop DOUBLE writing instead
-- stopped ANY writing.
--
-- THE RULE: a run is only "the time this file was imported" if it actually landed something
-- (`rows_written > 0 or rows_duplicate > 0`). Everything the guard was built for is
-- unchanged — a file that landed rows is still refused a second time, with the true count and
-- the true date — and this also releases every file already locked out by a zero run,
-- including the one VERIFIER-10 hit, with no data change and nothing to migrate.
--
-- The inverse is `migrations/inverse/import_a_batch_that_lands_nothing_is_not_an_import_down.sql`.
-- Nothing is dropped, nothing is revoked, no grant changes, no row of any feature is deleted
-- or rewritten, and both functions keep their exact signatures and their existing grants.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. THE MEMORY. Only a run that landed something is the time this file landed.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_import_begin(
  p_organization_id uuid,
  p_table_id        uuid,
  p_format          text    default 'csv',
  p_source_name     text    default null,
  p_source_columns  jsonb   default '[]'::jsonb,
  p_file_hash       text    default null,
  p_policy          jsonb   default '{}'::jsonb,
  p_dedupe_key      text    default null,
  p_file_bytes      bigint  default null,
  p_force           boolean default false)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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
  --
  -- 🚨 FIX-10B (VERIFIER-10 F2). The question is "DID ANYTHING LAND", not "have I seen this
  -- file". A run that wrote nothing and matched nothing is not the time this file was
  -- imported — it is a run that failed — and remembering it turned a guard against DOUBLE
  -- writing into a guard against ANY writing: the file that created a table's columns on its
  -- first pass could never be imported again. A run that landed rows or matched duplicates is
  -- still answered exactly as before, with its own date and its own true count.
  if nullif(btrim(coalesce(p_file_hash, '')), '') is not null and not coalesce(p_force, false) then
    select * into v_prior
      from custom.io_import i
     where i.organization_id = p_organization_id
       and i.table_id = p_table_id
       and i.file_hash = btrim(p_file_hash)
       and i.deleted_at is null
       and (coalesce(i.rows_written, 0) > 0 or coalesce(i.rows_duplicate, 0) > 0)
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
$function$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. THE ORDER. A batch whose run says "add them outright" declares this batch's
--    columns BEFORE it writes this batch's rows.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function custom.io_import_rows(
  p_organization_id uuid,
  p_import_id       uuid,
  p_rows            jsonb,
  p_mapping         jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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
$function$;

comment on function custom.io_import_rows(uuid, uuid, jsonb, jsonb) is
  'Feed rows into an open import run. Every row goes through the store''s ONE write door. '
  'When the run''s policy says an unknown column is "added straight away", this call DECLARES '
  'this batch''s new columns through custom.field_declare BEFORE it writes a single row of '
  'that batch — the write waits for the columns it asked for (VERIFIER-10 F2). A refused row '
  'is recorded with its reason rather than failing the run.';

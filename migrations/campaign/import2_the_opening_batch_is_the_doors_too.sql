-- IMPORT-2 — the opening batch size is the door's, and it aims at two seconds of work.
--
-- MEASURED TWICE ON THE MAIN DATABASE, 2026-09-22, the same 1,000-row Rincon Plumbing Co file
-- through the batched writer:
--     quiet   250-row batches: 3999 · 3876 · 3654 · 3600 ms   (12-13 ms a row)
--     loaded  250-row batches: 8203 ms, SQLSTATE 57014        (22-33 ms a row)
-- So 250 rows a call is not safe at every hour of the day, and no constant is: the write path
-- costs what the database is busy with. The door already measures its own writing phase and
-- answers `rows_per_call`; two things are fixed here.
--
--   1. IT AIMS AT TWO SECONDS OF MEASURED WORK, NOT THREE. A suggestion computed from the last
--      call is only as good as the next moment, and a database that gets 50% busier between two
--      calls must still land inside three seconds. Two seconds of measured work is that margin,
--      and the ~8 s ceiling is then four times away rather than two and a half.
--   2. THE FIRST NUMBER COMES FROM `custom.io_import_begin`, NOT FROM A SCREEN. Nothing has
--      been measured when a run opens, so exactly one number in the whole walk is chosen rather
--      than observed — and it is chosen in the store, once, with the measurement that chose it
--      written beside it, instead of as a constant in a wizard nobody re-measures.
--
-- based-on: custom.io_import_begin(uuid, uuid, text, text, jsonb, text, jsonb, text, bigint, boolean) 313c18da2e02323ef3374ed130645416ccd6ca64367c660a83a7a764bb57bcd1

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
        'rows_per_call', 100,
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
                            -- IMPORT-2: THE OPENING GUESS, SAID BY THE DOOR RATHER THAN BY A
                            -- SCREEN. Nothing has been measured yet, so this is the one number
                            -- in the whole walk that is chosen rather than observed, and it is
                            -- chosen HERE so that there is exactly one of it. 100 because the
                            -- writing phase measured 12-13 ms a row on a quiet database and
                            -- 22-33 ms a row on a loaded one (both measured 2026-09-22 on the
                            -- main database, 250-row batches of a real 8-column dispatch file),
                            -- and 100 x 33 ms is 3.3 s - comfortably inside the ~8 s ceiling on
                            -- the worst moment seen. Every call after the first uses the
                            -- rows_per_call custom.io_import_rows measured on the call before.
                            'rows_per_call', 100,
                            'message', 'Ready. Send the rows in batches.');
end;
$function$;

-- AND THE AIM IS TWO SECONDS OF MEASURED WORK. The body below is the one that is live, with
-- that one constant changed and its reason written beside it. Written out in full rather than
-- rewritten from pg_get_functiondef inside a DO block: a body built at run time is invisible to
-- the runner's based-on check (DD-220), which is the whole point of that check.
--
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 1fbe11e40e10aa17bf83274f5d600ea8cd210689ffb422c0216104e44ef23910

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
  c_comfort constant numeric := 2000;  -- the milliseconds of MEASURED work a call aims at: a
                                       -- database that gets 50% busier between two calls is
                                       -- still inside the three seconds a person should wait,
                                       -- and the ~8 s ceiling is four times away, not two.
  v_t0      timestamptz;
  v_wrote   numeric;
  v_perrow  numeric;
  v_next    integer;
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

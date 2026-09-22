-- IMPORT-2 — a batch of imported rows is ONE statement, and the columns are their own step.
--
-- THE DEFECT (FIX-10B's own concern (1), measured live 2026-09-22 04:13 UTC, Rincon Plumbing
-- Co's September service board — 1,000 tickets, 8 columns the table had not got):
--
--     batch 1: 7432 ms   batch 2: 6318 ms   batch 3: 6255 ms
--     batch 4: 8146 ms — THREW 57014 canceling statement due to statement timeout
--
-- The first batch carried 8 `custom.field_declare` calls on top of 250 `custom.record_write`
-- calls; every batch after it still made 250 round trips through the write door inside one
-- PostgREST call whose budget is ~8 s. The whole call rolls back and the person is told the
-- import failed, so the fourth quarter of her file is simply not there until she retries.
--
-- TWO THINGS ARE WRONG AND BOTH ARE FIXED HERE.
--
-- 1. DECLARING COLUMNS IS NOT WRITING ROWS. `custom.io_import_declare_columns` is a door of
--    its own, table-scoped, called BEFORE the run is opened — so the wizard shows "8 columns
--    added" as its own step, and the person can then name one of those columns as the file's
--    duplicate key (`io_import_begin` refuses a key naming a column that does not exist yet,
--    which is why the declaration cannot live inside the writing call).
--    The pre-pass FIX-10B put inside `io_import_rows` is not deleted — it moves, whole, into
--    `custom._io_declare_unmapped`, and both doors call that one body. A run whose columns
--    were already declared finds nothing to declare and makes zero `field_declare` calls.
--
-- 2. A BATCH IS ONE STATEMENT. The row loop no longer writes; it PLANS. Every row becomes one
--    of three things — refused, a duplicate of a record already here, or a document to write —
--    and the whole batch's documents go through `custom.record_write_many`, the batched door
--    WRITE-PERF-2 built, in ONE `insert … select` over the after-STATEMENT triggers.
--
-- THE THREE THINGS BATCHING WOULD HAVE BROKEN, AND WHAT HOLDS THEM.
--
--   (a) THE IN-BATCH DUPLICATE MAP. `v_exist` used to be updated at write time, so a ticket
--       number this very call had just written counted as "already here" for the rest of the
--       batch. The ids are now MINTED IN THE PLAN (`record_write_many` takes them and returns
--       them in input order, which is why WRITE-PERF-2 mints them in the door), so the map is
--       updated at plan time with the id the row is about to get. Same answers, one statement.
--
--   (b) A BAD ROW MUST NOT TAKE ITS BATCH WITH IT. `record_write_many` refuses the whole
--       statement by name on one bad row — correct for a paste, wrong for an import, where the
--       report is per row. So a refused batch FALLS BACK: the plan is replayed in file order
--       through `custom.record_write`, one row at a time, and every row gets its own outcome.
--       The fall-back costs nothing on the normal path because it only runs after a refusal.
--
--   (c) THE UNIQUE RULE. `custom._unique_rule_holds` is a BEFORE-ROW trigger that asks
--       `custom.record` whether another record already holds this value — and a row inserted
--       earlier in the SAME statement is not visible to it. Two rows of one batch carrying the
--       same unique ticket number would both have landed. The door holds that line itself now,
--       in the plan, with the trigger's own sentence and the trigger's own SQLSTATE; across
--       batches and across sessions the trigger is still the one that decides.
--
-- Nothing else moves: the mapping, the cell conversion, the empty-row refusal (LIMITS-FIX),
-- the provenance envelope, the proposals, the run's counters and the answer's shape are the
-- bytes that were already there.
--
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 6fccc44cbacbcff1be437beed38d933dc29633bec3a32f9e1c7f7d9985b0bc68

-- ── 1. THE COLUMN PRE-PASS, LIFTED OUT WHOLE. ────────────────────────────────────────────
-- FIX-10B's body, unchanged except that it takes a table rather than a run and answers with
-- what it made instead of writing it onto the run. Internal: the two doors below are the ways
-- in, and each asks its own questions first.
create or replace function custom._io_declare_unmapped(
  p_organization_id uuid,
  p_table_id        uuid,
  p_rows            jsonb,
  p_mapping         jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_map    jsonb := coalesce(p_mapping, '{}'::jsonb);
  v_fields jsonb := '{}'::jsonb;
  v_f      record;
  v_row    jsonb;
  v_key    text;
  v_val    jsonb;
  v_new    jsonb := '{}'::jsonb;
  v_made   jsonb := '[]'::jsonb;
  v_prop   jsonb;
  v_inf    jsonb;
  v_spec   jsonb;
  v_fid    uuid;
begin
  for v_f in select f.data as data from custom.applicable_fields(p_organization_id, p_table_id, null) f
  loop
    v_fields := v_fields || jsonb_build_object(v_f.data ->> 'key', v_f.data);
  end loop;

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
    v_inf  := custom.io_infer_column(p_organization_id, p_table_id, v_key, v_new -> v_key);
    v_prop := jsonb_build_object('column', v_key, 'samples', v_new -> v_key)
              || (v_inf - 'header' - 'matched')
              || jsonb_build_object('state', 'proposed');
    -- A HEADER THAT ALREADY NAMES A COLUMN IS A MAPPING, NOT A NEW COLUMN.
    if coalesce((v_inf ->> 'matched')::boolean, false) then
      v_map := v_map || jsonb_build_object(v_key, v_prop ->> 'field_key');
      continue;
    end if;
    v_spec := custom.io_proposal_spec(v_prop);
    begin
      v_fid  := custom.field_declare(p_organization_id, p_table_id, v_spec);
      v_map  := v_map || jsonb_build_object(v_key, v_spec ->> 'key');
      v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'accepted', 'field_id', v_fid));
    exception when others then
      -- NINETEEN GOOD COLUMNS ARE NOT LOST BECAUSE THE TWENTIETH COLLIDED.
      v_made := v_made || jsonb_build_array(v_prop || jsonb_build_object('state', 'refused', 'reason', sqlerrm));
    end;
  end loop;

  return jsonb_build_object('mapping', v_map, 'columns_added', v_made);
end
$fn$;

comment on function custom._io_declare_unmapped(uuid, uuid, jsonb, jsonb) is
  'IMPORT-2: the one body that turns a file''s unrecognised headers into real columns. Called by custom.io_import_declare_columns (its own wizard step) and by custom.io_import_rows (the safety net for a run that never took that step).';

-- §6d-4: a SECURITY DEFINER function says IN DATA who may call it. Nobody may: the two doors
-- above and below are the call surface, and each asks its own questions before it gets here.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('custom', '_io_declare_unmapped',
   'p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb',
   array[2950, 2950, 3802, 3802]::oid[],
   'p_organization_id is the organization every column is declared into and is passed straight to custom.field_declare, which asks custom.assert_store_door and the admin rung itself; NULL is refused there. p_table_id is the custom Table the columns are added to and is passed to the same door; NULL is refused there. p_rows and p_mapping are the file and the headers a person already mapped, read only for header names and sample values, and reach no access decision. NULL p_rows means an empty file and NULL p_mapping means nothing was mapped by hand.',
   'IMPORT-2',
   'server_only: this is the shared body behind custom.io_import_declare_columns (the wizard step, a declared client door that asks the admin rung first) and custom.io_import_rows (the writing door, which asks the editor rung and whose run already named the table). No client ever reaches it directly, and it makes no access decision of its own - custom.field_declare does, on every column.',
   false, false)
on conflict do nothing;

-- ── 2. THE DOOR THE SCREEN SHOWS AS ITS OWN STEP. ────────────────────────────────────────
create or replace function custom.io_import_declare_columns(
  p_organization_id uuid,
  p_table_id        uuid,
  p_rows            jsonb,
  p_mapping         jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_out   jsonb;
  v_made  integer;
  v_bad   integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_declare_columns');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_declare_columns');
  -- Adding a column to a table is an ADMIN change, and that is what custom.field_declare asks
  -- of every caller; it is asked here too so the refusal names this door rather than that one.
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.io_import_declare_columns',
                                          'admin'::public.permission_level, 'table');

  v_out  := custom._io_declare_unmapped(p_organization_id, p_table_id, p_rows, p_mapping);
  v_made := (select count(*) from jsonb_array_elements(v_out -> 'columns_added') c where c ->> 'state' = 'accepted');
  v_bad  := (select count(*) from jsonb_array_elements(v_out -> 'columns_added') c where c ->> 'state' = 'refused');

  return v_out || jsonb_build_object(
    'table_id', p_table_id,
    'message', case
      when v_made = 0 and v_bad = 0 then 'This table already has a column for every column in the file.'
      when v_bad = 0 then format('%s column%s added. The file can be sent now.', v_made, case when v_made = 1 then '' else 's' end)
      else format('%s column%s added, %s could not be: %s',
                  v_made, case when v_made = 1 then '' else 's' end, v_bad,
                  (select string_agg(format('%s — %s', c ->> 'column', c ->> 'reason'), '; ')
                     from jsonb_array_elements(v_out -> 'columns_added') c where c ->> 'state' = 'refused'))
    end);
end
$fn$;

comment on function custom.io_import_declare_columns(uuid, uuid, jsonb, jsonb) is
  'IMPORT-2: add the columns a file has and a table has not, as a step of its own BEFORE the rows are sent. Answers columns_added, the mapping the file should be written with, and one sentence a screen can show.';

-- THE DECLARATION BEFORE THE GRANT — platform._ddl_guard sweeps an undeclared client grant.
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason,
   anonymous_callers, signed_in_callers, identity_argtypes, argument_rules)
values
  ('custom', 'io_import_declare_columns',
   'p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb',
   'IMPORT-2',
   'IMPORT-2: the import wizard adds the columns a file has and the table has not as a step of its own, before any row is sent. It is the pre-pass FIX-10B put inside custom.io_import_rows, moved out so that the writing calls declare nothing and stay well under the ~8 s PostgREST ceiling, and so that a person can name one of the new columns as the duplicate key of the file. The store is switched per organization by custom/system_enabled and the body asks custom.assert_store_door first; membership and the ADMIN rung on the Table are decided by custom.assert_client_may_change for auth.uid() before anything is declared, which is the same rung custom.field_declare itself asks.',
   false, true,
   array[2950, 2950, 3802, 3802]::oid[],
   jsonb_build_object(
     'version', 1,
     'arguments', jsonb_build_object(
       'p_organization_id', jsonb_build_object(
         'type', 'uuid', 'position', 1, 'optional', false, 'entity', null,
         'check', 'the organization of the caller: it is handed to custom.assert_store_door and custom.assert_client_may_change, and every column declared is written into the Field kernel of that organization.',
         'null_rule', jsonb_build_object('sqlstate', '22004'),
         'entity_reason', 'It is an organization id and this door makes no access decision with it beyond handing it to the two predicates custom.field_declare already uses.'),
       'p_table_id', jsonb_build_object(
         'type', 'uuid', 'position', 2, 'optional', false, 'entity', null,
         'check', 'the custom Table the columns are added to; it is handed to custom.assert_client_may_change, which is where the admin rung on the Table is decided.',
         'null_rule', jsonb_build_object('sqlstate', '23503'),
         'entity_reason', 'Access is decided by organization_id and the admin rung on this Table, asked before anything is declared; the id names the table the new Field documents point at.'),
       'p_rows', jsonb_build_object(
         'type', 'jsonb', 'position', 3, 'optional', false,
         'check', 'the rows of the file, read ONLY for their header names and up to twelve sample values a column, so the store can infer what each new column holds. Nothing in them reaches an access decision and no row is written.',
         'null_rule', jsonb_build_object('default', '[]')),
       'p_mapping', jsonb_build_object(
         'type', 'jsonb', 'position', 4, 'optional', true,
         'check', 'headers the person has already mapped to columns by hand; a mapped header is never declared as a new column. It decides nothing but which headers are left over.',
         'null_rule', jsonb_build_object('default', '{}')))))
on conflict do nothing;

grant execute on function custom.io_import_declare_columns(uuid, uuid, jsonb, jsonb) to authenticated;

-- ── 3. THE WRITING DOOR, ONE STATEMENT A BATCH. ──────────────────────────────────────────
create or replace function custom.io_import_rows(
  p_organization_id uuid,
  p_import_id       uuid,
  p_rows            jsonb,
  p_mapping         jsonb default '{}'::jsonb
) returns jsonb
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
    'refusals',       v_ref);
end;
$function$;

comment on function custom.io_import_rows(uuid, uuid, jsonb, jsonb) is
  'IMPORT-2: plans every row of a batch, then writes them all in ONE statement through custom.record_write_many; falls back to one write a row (and says so in one_statement) only when the batched statement is refused. Holds the in-batch duplicate key and the in-batch unique rule itself, because one statement cannot see its own rows.';

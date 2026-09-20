-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_import_rows(uuid, uuid, jsonb, jsonb) 0b9eb52e7688aa34d72e9384732ab8f69b741178829eaff6b17a69e5f3deb932
--
-- chair-step: it GRANTS EXECUTE to `authenticated` on FOUR new functions of schema `custom`
--   (`custom.io_import_finish`, `custom.io_import_report`, `custom.io_imports`,
--   `custom.io_import_forget`) and REPLACES ONE existing function in place with its exact
--   signature (`custom.io_import_rows(uuid, uuid, jsonb, jsonb)`), whose grant and
--   `platform.client_callable_door` row already exist and are untouched. Two internals are
--   created with no grant at all (`custom.io_cell`, `custom.io_proposal_spec`). Every granted
--   function is SECURITY DEFINER, asks the organization wall and the switch by name before it
--   reads or writes anything, and every row it writes goes through `custom.record_write` or
--   `custom.record_update` — there is not one INSERT against `custom.record` in this file.
--   Nothing is dropped, nothing is revoked, no row of any feature is deleted or rewritten. The
--   inverse is `migrations/inverse/import_every_row_says_what_happened_to_it_down.sql`, and it
--   restores the previous `custom.io_import_rows` body byte for byte.
--
-- LANE IMPORT — EVERY ROW SAYS WHAT HAPPENED TO IT, AND EVERY VALUE SAYS WHERE IT CAME FROM.
--
-- DOOR-11 · SCR-10 · SCR-N-7 · VAL-1. What W4-IO's `custom.io_import_rows` did, and what it
-- could not do, measured on the main database 2026-09-20:
--
--   IT DID: take a batch of parsed rows, map each header onto a Field key, build a document
--   and write it through `custom.record_write`, recording a refusal per row without letting
--   one bad row end the run, and collecting unmapped columns as proposals. All of that is
--   kept, and this file is a replacement rather than a second importer for exactly that
--   reason — two import paths is how two imports start behaving differently.
--
--   IT COULD NOT:
--     * PUT A VALUE IN THE SHAPE ITS COLUMN WANTS. Every cell went in as the string the file
--       held. `$1,250.00` into a money column is not a number; `dana@example.com` into a
--       person column is not a person; `Northwind Trading` into a column that points at
--       Accounts is not a record id. So the store refused those rows one at a time, correctly,
--       and the person was told their file was wrong when the file was right.
--     * SAY A ROW WAS ALREADY HERE. There was no duplicate key, so the second import of a
--       corrected spreadsheet made a second copy of every row.
--     * SAY WHERE A VALUE CAME FROM. VAL-1 gives every value a source and the importer wrote
--       none, so an imported cell and a typed one were indistinguishable forever after.
--     * HAND BACK THE ROW IT REFUSED. `refusals` held a row NUMBER into a file the screen no
--       longer has.
--
-- WHAT A PERSON GETS NOW. Per row, one of exactly three outcomes, each with the thing you
-- need in order to act on it: `landed` with the record's id, `duplicate` with the id of the
-- record that was already there (and, if the policy says so, the fields that were brought up
-- to date), or `refused` with the store's own sentence AND the source row itself, so the
-- wizard's outcome table can be clicked through to the line of the spreadsheet that has to be
-- fixed. Nothing is a count with nothing behind it.
--
-- ONE ROW'S REFUSAL NEVER ENDS THE RUN, AND IT NEVER SILENTLY ROLLS BACK THE ROWS BEFORE IT.
-- Each row is written inside its own BEGIN…EXCEPTION block, which is a subtransaction: the
-- refused row leaves nothing behind and every row that already landed stays landed. A partial
-- import that pretends to be a whole one is the failure this door exists to make impossible,
-- and so is an import that throws away 4,999 good rows because of one.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ONE CELL, IN THE SHAPE ITS COLUMN WANTS.
--
-- The answer is `{"ok":true,"value":<what to write>}` or `{"ok":false,"reason":"<a sentence a
-- person reads>"}`. It never raises: a cell that cannot be read is a fact about one row, and
-- the row engine turns it into that row's refusal with the column named.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_cell(
  p_organization_id uuid,
  p_field           jsonb,
  p_word            text,
  p_date_order      text default 'mdy')
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_parity text := coalesce(custom.parity_type(p_field), p_field ->> 'type');
  v_label  text := coalesce(nullif(p_field ->> 'label', ''), p_field ->> 'key');
  v_word   text := btrim(coalesce(p_word, ''));
  v_num    text;
  v_user   uuid;
  v_person uuid;
  v_target uuid;
  v_title  text;
  v_ids    uuid[];
  v_parts  text[];
  v_out    jsonb;
  v_part   text;
begin
  -- AN EMPTY CELL IS NOT A VALUE AND IT IS NOT AN ERROR. It is left out of the document
  -- entirely, so the Field's own default and the store's own "never asked" absence stand.
  -- Writing '' into a money column instead would be a value nobody entered.
  if v_word = '' then
    return jsonb_build_object('ok', true, 'skip', true);
  end if;

  -- A COLUMN THAT IS WORKED OUT CANNOT BE IMPORTED, AND SAYING SO IS THE WHOLE ANSWER.
  -- Silently dropping it would leave a person convinced their totals came across.
  if v_parity in ('formula', 'lookup', 'rollup') then
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is worked out from other columns, so it cannot be imported — it will fill itself in.', v_label));
  end if;
  if v_parity = 'attachment' then
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" holds files, and a spreadsheet cell is not a file. Attach the files to the records after the import.', v_label));
  end if;

  -- A PERSON. The store already knows this organization's roster, so an email address in a
  -- person column is resolved to the person rather than refused as "not a uuid".
  if v_parity = 'member' then
    if v_word ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    select m.user_id into v_user
      from iam.organization_member m
      join auth.users u on u.id = m.user_id
     where m.organization_id = p_organization_id
       and lower(u.email::text) = lower(v_word)
     limit 1;
    if v_user is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" is not somebody in this organization, so "%s" has nobody to point at. Invite them first, or leave the cell empty.', v_word, v_label));
    end if;
    v_person := custom.work_person(p_organization_id, v_user, true);
    return jsonb_build_object('ok', true, 'value', to_jsonb(v_person::text));
  end if;

  -- A POINTER AT ANOTHER TABLE. The cell holds the record's NAME, because that is what a
  -- spreadsheet holds; the store turns it into the record. An ambiguous name is refused BY
  -- NAME rather than resolved to whichever row happened to be first.
  if v_parity is null and (p_field ->> 'type') = 'relation' then
    v_target := nullif(p_field ->> 'relation_target', '')::uuid;
  end if;
  if v_target is not null then
    if v_word ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    select r.data ->> 'title_field' into v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = v_target and r.deleted_at is null;
    if v_title is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" points at a table that has no name column, so "%s" cannot be looked up.', v_label, v_word));
    end if;
    select array_agg(r.id) into v_ids
      from custom.record r
     where r.organization_id = p_organization_id
       and r.table_id = v_target
       and r.data_class = 'record'
       and r.deleted_at is null
       and r.data ->> v_title = v_word;
    if v_ids is null or cardinality(v_ids) = 0 then
      return jsonb_build_object('ok', false, 'reason',
        format('There is no "%s" for "%s" to point at yet. Import that table first, or add it there.', v_word, v_label));
    end if;
    if cardinality(v_ids) > 1 then
      return jsonb_build_object('ok', false, 'reason',
        format('There are %s records called "%s", so "%s" cannot tell which one this row means.', cardinality(v_ids), v_word, v_label));
    end if;
    return jsonb_build_object('ok', true, 'value', to_jsonb(v_ids[1]::text));
  end if;

  -- MONEY, PERCENTAGES AND PLAIN NUMBERS. A spreadsheet writes `$1,250.00`, `(45.00)` for a
  -- negative and `12%`; the store holds a number. The symbols, the thousands separators, the
  -- accountant's brackets and the trailing currency code all come off here, once.
  if v_parity in ('currency', 'percent') or (p_field ->> 'type') = 'range' then
    v_num := regexp_replace(v_word, '[$€£¥%,\s]', '', 'g');
    v_num := regexp_replace(v_num, '(?i)(USD|EUR|GBP|CAD|AUD)$', '');
    if v_num ~ '^[(].*[)]$' then
      v_num := '-' || btrim(v_num, '()');
    end if;
    if v_parity = 'datetime' or (p_field -> 'config' ->> 'kind') in ('date', 'datetime') then
      -- A DATE IS NOT A NUMBER and falls through to the date arm below.
      null;
    elsif v_num ~ '^[+-]?[0-9]+([.][0-9]+)?$' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_num::numeric));
    else
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" is a number column and "%s" is not a number.', v_label, v_word));
    end if;
  end if;

  -- A DATE. ISO goes straight through. The slashed forms are read in the order this run was
  -- opened with — never guessed per row, because a file whose first rows happen to have a day
  -- above 12 would otherwise be read one way at the top and another way at the bottom.
  if v_parity = 'datetime' or (p_field -> 'config' ->> 'kind') in ('date', 'datetime') then
    if v_word ~ '^\d{4}-\d{2}-\d{2}' then
      return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
    end if;
    if v_word ~ '^\d{1,2}/\d{1,2}/\d{2,4}$' then
      begin
        return jsonb_build_object('ok', true, 'value',
          to_jsonb(to_char(to_date(v_word, case when lower(coalesce(p_date_order, 'mdy')) = 'dmy'
                                                then 'DD/MM/YYYY' else 'MM/DD/YYYY' end), 'YYYY-MM-DD')));
      exception when others then
        return jsonb_build_object('ok', false, 'reason',
          format('"%s" is a date column and "%s" is not a date this store can read.', v_label, v_word));
      end;
    end if;
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is a date column and "%s" is not a date. Dates written year-month-day always work.', v_label, v_word));
  end if;

  -- A CHOICE. The word goes in as the word: `custom._resolve_choice_words` turns a label, a
  -- key or an option''s id into the one key the store keeps, and refuses a word that names no
  -- choice with the choices listed. Doing it a second time here would be a second vocabulary.
  if v_parity = 'multi_select' or coalesce((p_field ->> 'multi')::boolean, false) then
    v_parts := array(select btrim(x) from unnest(regexp_split_to_array(v_word, '\s*[;,|]\s*')) x
                      where btrim(x) <> '');
    if cardinality(v_parts) = 0 then
      return jsonb_build_object('ok', true, 'skip', true);
    end if;
    v_out := '[]'::jsonb;
    foreach v_part in array v_parts loop
      v_out := v_out || jsonb_build_array(to_jsonb(v_part));
    end loop;
    return jsonb_build_object('ok', true, 'value', v_out);
  end if;

  return jsonb_build_object('ok', true, 'value', to_jsonb(v_word));
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A PROPOSAL, AS THE SPEC custom.field_declare TAKES.
--    One translation, used by the direct arm and by the approvals arm alike, so an approved
--    column and an admin's outright one are the same bytes.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_proposal_spec(p_proposal jsonb)
returns jsonb
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select jsonb_strip_nulls(jsonb_build_object(
    'key',             p_proposal ->> 'field_key',
    'label',           coalesce(nullif(p_proposal ->> 'label', ''), p_proposal ->> 'column'),
    'type',            coalesce(nullif(p_proposal ->> 'type', ''), 'text'),
    'unit',            nullif(p_proposal ->> 'unit', ''),
    'relation_target', nullif(p_proposal ->> 'relation_target', ''),
    'source',          'manual',
    'source_config',   jsonb_build_object('origin', 'import',
                                          'import_id', p_proposal ->> 'import_id',
                                          'source_column', p_proposal ->> 'column')))
  || case when jsonb_typeof(p_proposal -> 'options') = 'array'
          then jsonb_build_object('options', p_proposal -> 'options') else '{}'::jsonb end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. THE ROW ENGINE.
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. FINISHING: the columns the file had and this table did not.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_import_finish(
  p_organization_id uuid,
  p_import_id       uuid,
  p_unmapped        text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. READING THE OUTCOMES BACK — the click-through.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_import_report(
  p_organization_id uuid,
  p_import_id       uuid,
  p_state           text    default null,
  p_limit           integer default 100,
  p_offset          integer default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  c_keep constant integer := 500;
  v_run  custom.io_import;
  v_kept integer;
  v_all  integer;
  v_rows jsonb;
  v_lim  integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_off  integer := greatest(coalesce(p_offset, 0), 0);
  v_what text := lower(coalesce(nullif(btrim(coalesce(p_state, '')), ''), 'refused'));
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_report');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then
    raise exception 'There is no import run here.' using errcode = '23503';
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_run.table_id, 'custom.io_import_report');

  if v_what not in ('refused', 'duplicate') then
    raise exception 'The rows this can show you are the ones that were refused and the ones that were already here, not "%".', v_what
      using errcode = '22023',
            hint = 'The rows that landed are records of the table — open the table to see them.';
  end if;

  if v_what = 'refused' then
    v_all  := v_run.rows_seen - v_run.rows_written - v_run.rows_duplicate;
    v_kept := jsonb_array_length(coalesce(v_run.refusals, '[]'::jsonb));
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_rows
      from (select value from jsonb_array_elements(coalesce(v_run.refusals, '[]'::jsonb))
             offset v_off limit v_lim) s;
  else
    v_all  := v_run.rows_duplicate;
    v_kept := jsonb_array_length(coalesce(v_run.duplicates, '[]'::jsonb));
    select coalesce(jsonb_agg(value), '[]'::jsonb) into v_rows
      from (select value from jsonb_array_elements(coalesce(v_run.duplicates, '[]'::jsonb))
             offset v_off limit v_lim) s;
  end if;

  return jsonb_build_object(
    'import_id',  p_import_id,
    'table_id',   v_run.table_id,
    'state',      v_what,
    'rows',       v_rows,
    'kept',       v_kept,
    'total',      v_all,
    -- THE CAP, SAID OUT LOUD. A number with nothing behind it is the failure this closes; a
    -- number that says which part it can show is honest.
    'capped',     v_kept >= c_keep and v_all > v_kept,
    'note',       case when v_kept >= c_keep and v_all > v_kept
                       then format('This run kept the first %s of %s. The other %s were counted, not kept — re-run the file against the same table to see them, or fix these first.',
                                   v_kept, v_all, v_all - v_kept)
                       else null end);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. THE RUNS THEMSELVES — so a person can find yesterday's import.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_imports(
  p_organization_id uuid,
  p_table_id        uuid    default null,
  p_limit           integer default 25)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_out jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_imports');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.io_imports');
  end if;
  select coalesce(jsonb_agg(row_to_json(s)::jsonb order by s.opened_at desc), '[]'::jsonb) into v_out
    from (
      select i.id as import_id, i.table_id, i.format, i.source_name, i.file_hash,
             i.dedupe_key, i.policy, i.state, i.rows_seen, i.rows_written, i.rows_duplicate,
             i.rows_seen - i.rows_written - i.rows_duplicate as rows_refused,
             jsonb_array_length(coalesce(i.proposals, '[]'::jsonb)) as columns_offered,
             i.created_at as opened_at, i.finished_at, i.created_by
        from custom.io_import i
       where i.organization_id = p_organization_id
         and i.deleted_at is null
         and (p_table_id is null or i.table_id = p_table_id)
         -- A RUN IS ON A TABLE, so who may know about the run is who may know about the
         -- table. Listing every organization's runs to any member would name Tables they
         -- cannot open (T10).
         and custom.table_is_live(p_organization_id, i.table_id)
       order by i.created_at desc
       limit least(greatest(coalesce(p_limit, 25), 1), 200)) s;
  return v_out;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. FORGETTING A RUN — so re-importing the same corrected file is possible at all.
--    The run is soft-deleted, which is what makes the hash stop matching. The RECORDS it
--    wrote are untouched: this forgets the receipt, never the data.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.io_import_forget(p_organization_id uuid, p_import_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_run custom.io_import;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.io_import_forget');
  perform custom.assert_store_door(p_organization_id, 'custom.io_import_forget');
  select * into v_run from custom.io_import
   where organization_id = p_organization_id and id = p_import_id and deleted_at is null;
  if not found then return false; end if;
  perform custom.assert_client_may_change(p_organization_id, v_run.table_id, 'custom.io_import_forget',
                                          'admin'::public.permission_level, 'table');
  update custom.io_import set deleted_at = now()
   where organization_id = p_organization_id and id = p_import_id;
  return true;
end;
$function$;

-- ── DECLARE, THEN GRANT (the GRANT is what the DDL guard fires on). ──────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, reason)
select 'custom', v.fn, iam.door_identity_args(p.oid), platform.door_argtypes(p.proargtypes),
       true, false,
       'migrations/campaign/import_every_row_says_what_happened_to_it.sql (lane IMPORT)',
       v.why
  from (values
    ('io_import_finish',
     'Close an import and decide what happens to the columns the file had and the table did not: offered in the ONE approvals inbox (the default, and the only one a non-admin can choose), added outright by an admin, or left out. Answers the run''s whole summary.'),
    ('io_import_report',
     'The rows that were refused and the rows that were already here, WITH the source row itself, so the wizard''s outcome table can be clicked through to the line of the spreadsheet that has to be fixed. States its own cap when it has one.'),
    ('io_imports',
     'This organization''s import runs, newest first, narrowed to the tables the caller may open. How a person finds yesterday''s import.'),
    ('io_import_forget',
     'Forget the receipt for a file so the same bytes can be imported again deliberately. Soft-deletes the RUN and never touches the records it wrote. An admin''s act on the table.')
  ) as v(fn, why)
  join pg_proc p on p.proname = v.fn and p.pronamespace = 'custom'::regnamespace
 where not exists (select 1 from platform.client_callable_door d
                    where d.schema_name = 'custom' and d.function_name = v.fn
                      and d.identity_argtypes = platform.door_argtypes(p.proargtypes));

grant execute on function custom.io_import_finish(uuid, uuid, text) to authenticated;
grant execute on function custom.io_import_report(uuid, uuid, text, integer, integer) to authenticated;
grant execute on function custom.io_imports(uuid, uuid, integer) to authenticated;
grant execute on function custom.io_import_forget(uuid, uuid) to authenticated;


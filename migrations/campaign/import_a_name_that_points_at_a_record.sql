-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.io_cell(uuid, jsonb, text, text) 868d98b6f8b0106226d5b522ecab551481c00b8eff8de2de17fea61310c1bc52
--
-- LANE IMPORT — A NAME IN A COLUMN THAT POINTS AT ANOTHER TABLE IS THAT RECORD.
--
-- ONE CONDITION, AND IT WAS THE WRONG ONE. `custom.io_cell` has an arm that turns the record
-- NAME a spreadsheet holds into the record the column points at — the single thing that makes
-- an imported flat file into a database rather than a pile of strings, and the thing Airtable's
-- importer is famous for. It was guarded by `v_parity is null`, and `v_parity` is
-- `coalesce(custom.parity_type(field), field->>'type')`, which for a relation at one of the
-- organization's OWN Tables is `coalesce(null, 'relation')` = 'relation'. Never null. So the
-- arm was unreachable and every such cell went to the write door as a bare string.
--
-- Measured on the main database at 2026-09-20 14:36 UTC, from the seat `authenticated`, on a
-- Deals table with an Account column pointing at an Accounts table holding "Northwind Trading"
-- and "Acme Supplies": rows 1, 2 and 4 of a five-row file were all refused `23514 Account
-- points at something that is not there` — including the two whose account plainly existed.
-- A person reading that is told their file is wrong when their file is right.
--
-- The arm now also REFUSES BY NAME a relation column that names no target at all, rather than
-- falling through to writing the raw string: a column that points at nothing is a defect in
-- the column, and the person importing is not the one who can fix it from a cell.
--
-- Nothing else in the function changes; this file is the previous body with that one condition
-- replaced, so the `-- based-on:` hash above is the proof of what it was.

CREATE OR REPLACE FUNCTION custom.io_cell(p_organization_id uuid, p_field jsonb, p_word text, p_date_order text DEFAULT 'mdy'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
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
  -- MEASURED 2026-09-20, on the main database, by running a real import: this arm never
  -- fired. `custom.parity_type` answers NOTHING for a relation that points at one of the
  -- organization's own Tables — `member` and `attachment` are the only two relations it
  -- names — so `v_parity` is `coalesce(null, 'relation')` = 'relation', and the condition
  -- `v_parity is null` was false for exactly the case it was written for. Every "Account"
  -- cell went to the write door as the literal string "Northwind Trading" and the store
  -- refused it, correctly, with "Account points at something that is not there" — telling a
  -- person their file was wrong when the file was right. It is the condition that was wrong.
  if v_parity = 'relation' then
    v_target := nullif(p_field ->> 'relation_target', '')::uuid;
    if v_target is null then
      return jsonb_build_object('ok', false, 'reason',
        format('"%s" points at other records and does not say which table, so "%s" cannot be looked up.', v_label, v_word));
    end if;
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
$function$

;

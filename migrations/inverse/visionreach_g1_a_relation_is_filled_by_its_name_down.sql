-- chair-step: this puts custom.io_cell, custom._relation_kernel_targets and custom._io_declare_unmapped back to the bodies visionreach_g1_a_relation_is_filled_by_its_name.sql was written against (an import matches a relation's name only byte-exactly again and takes a several-records cell as one name; every other write door refuses a name again; a new column is judged on its first 12 values again), deletes the custom.relation_names_match door row and DROPs the three functions that file added (custom.relation_names_match, custom._relation_names_resolve, custom.relation_name_key); nothing else calls them.
-- lane: VISION-REACH
-- guard: custom/system_enabled
-- based-on: custom.io_cell(uuid, jsonb, text, text) b30683c7eabdf8ed5055298de28a0618bafe29b28749802c92c72fbff600bb5f
-- based-on: custom._relation_kernel_targets() 40b36608ae2c51a33db2e6c9df6808153b2e1c847c87e39fa02aa311ad5c9515
-- based-on: custom._io_declare_unmapped(uuid, uuid, jsonb, jsonb) b02a7d7eba4e7b3f91296509e192ed5b309c1f2337a6840f1feccd9519976be7

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

  -- A TICK. A spreadsheet writes yes, no, TRUE, 1, 0, Y, N or a check mark, and the store
  -- holds a real boolean. A word that is none of those is refused BY NAME rather than read
  -- as "not ticked": a box silently left empty because a cell said "n/a" is the quiet half
  -- of the defect this type exists to close.
  if v_parity = 'checkbox' then
    if lower(v_word) in ('true', 't', 'yes', 'y', '1', 'on', 'x', '✓', '✔') then
      return jsonb_build_object('ok', true, 'value', to_jsonb(true));
    end if;
    if lower(v_word) in ('false', 'f', 'no', 'n', '0', 'off', '☐') then
      return jsonb_build_object('ok', true, 'value', to_jsonb(false));
    end if;
    return jsonb_build_object('ok', false, 'reason',
      format('"%s" is a yes/no column and "%s" is neither. Yes, no, true, false, 1, 0 and a check mark all work; an empty cell stays unanswered.', v_label, v_word));
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
$function$;

CREATE OR REPLACE FUNCTION custom._relation_kernel_targets()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_on    boolean;
  f       record;
  v_val   jsonb;
  v_items jsonb;
  v_out   jsonb;
  v_one   jsonb;
  v_to    uuid;
  v_new   jsonb;
  v_org   text;
  v_key   text;
  v_flds  jsonb;
begin
  -- Only an ordinary, live record of an ordinary Table holds cells to resolve.
  if new.data_class is distinct from 'record' or new.table_id is null
     or new.deleted_at is not null
     or new.data is null or jsonb_typeof(new.data) <> 'object' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.data is not distinct from new.data
     and old.table_id is not distinct from new.table_id then
    return new;
  end if;

  -- THIS TABLE'S RELATION FIELDS, READ ONCE PER STATEMENT. The same statement memo
  -- `custom.record_relation_edges` keeps (WRITE-PERF-3b), under its own key, cleared by the same
  -- structure triggers — so a 250-row import asks the catalogue once, and a Table with no
  -- relation column stops here without reading the switch at all.
  v_key  := 'rkt:' || new.organization_id::text || ':' || new.table_id::text;
  v_flds := platform.memo_s_get(v_key)::jsonb;
  if v_flds is null then
    select coalesce(jsonb_agg(jsonb_build_object(
             'k', x.k, 'label', x.label, 'tgt', x.tgt, 'is_kernel', x.is_kernel) order by x.k), '[]'::jsonb)
      into v_flds
      from (
    select coalesce(nullif(fd.data ->> 'key', ''), fd.data ->> 'name')        as k,
           coalesce(nullif(fd.data ->> 'label', ''), fd.data ->> 'name')      as label,
           case when (fd.data ->> 'relation_target') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                then (fd.data ->> 'relation_target')::uuid end                as tgt,
           coalesce(fd.data ->> 'relation_target' in (custom.person_kernel_id()::text,
                                                      custom.file_kernel_id()::text), false)
                                                                              as is_kernel
      from custom.record fd
     where fd.table_id = custom.field_kernel_id()
       and fd.data_class <> 'kernel'
       and fd.deleted_at is null
       and fd.organization_id = new.organization_id
       and nullif(fd.data ->> 'entity_definition_id', '')::uuid = new.table_id
       and fd.data ->> 'type' = 'relation'
      ) x;
    perform platform.memo_s_put(v_key, v_flds::text);
  end if;
  if v_flds = '[]'::jsonb then
    return new;
  end if;

  -- THE SWITCH, as custom._resolve_choice_words reads it: while the store is off for this
  -- organization the document is left exactly as the writer sent it.
  begin
    v_on := custom.store_is_open(new.organization_id);
  exception when others then
    v_on := false;
  end;
  if not v_on then
    return new;
  end if;

  for f in
    select * from jsonb_to_recordset(v_flds) as j(k text, label text, tgt uuid, is_kernel boolean)
  loop
    v_val := new.data -> f.k;
    if v_val is null or jsonb_typeof(v_val) not in ('string', 'array') then
      continue;
    end if;
    -- An ordinary relation has only one thing to normalize — a repeated id — so it is looked
    -- at only when the cell is a list and the writer actually sent it. A cell nobody touched
    -- is left byte-for-byte as it stands.
    if not f.is_kernel
       and (jsonb_typeof(v_val) <> 'array'
            or (tg_op = 'UPDATE' and old.data -> f.k is not distinct from v_val)) then
      continue;
    end if;

    v_items := case when jsonb_typeof(v_val) = 'array' then v_val else jsonb_build_array(v_val) end;
    v_out   := '[]'::jsonb;

    for v_one in select x from jsonb_array_elements(v_items) x loop
      -- Not an id at all: custom.validate_values refuses it in its own words.
      if jsonb_typeof(v_one) <> 'string'
         or (v_one #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        v_out := v_out || jsonb_build_array(v_one);
        continue;
      end if;

      if not f.is_kernel then
        v_to := (v_one #>> '{}')::uuid;
      else
        v_to := custom.relation_kernel_record(new.organization_id, f.tgt, (v_one #>> '{}')::uuid);
      end if;

      if v_to is null then
        select coalesce(nullif(o.name, ''), 'this organization') into v_org
          from iam.organizations o where o.id = new.organization_id;
        -- A kernel record of this organization that has been REMOVED is a different sentence
        -- from a stranger: the person (or file) was here, and somebody took their record away.
        if exists (select 1 from custom.record t
                    where t.organization_id = new.organization_id
                      and t.id = (v_one #>> '{}')::uuid
                      and t.table_id = f.tgt) then
          raise exception '% names % that was removed from %.', f.label,
                case when f.tgt = custom.person_kernel_id() then 'a person' else 'a file' end,
                coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('Pick %s again for %s, or restore the removed record first — the store never points a column at something that is gone.',
                                case when f.tgt = custom.person_kernel_id() then 'who it is now' else 'the file' end,
                                f.label);
        end if;
        if f.tgt = custom.person_kernel_id() then
          raise exception '% names someone who is not a member of %.', f.label, coalesce(v_org, 'this organization')
            using errcode = '23514',
                  hint = format('%s holds a member of this organization — pick them from the list, or give their user id and the store finds their Person record. Somebody who is not a member has to be invited first.', f.label);
        end if;
        raise exception '% names a file % does not have.', f.label, coalesce(v_org, 'this organization')
          using errcode = '23514',
                hint = format('%s holds a file of this organization — upload it here first, then give its id and the store makes its File record. A file that belongs to another organization cannot be attached here.', f.label);
      end if;

      -- ONE RECORD, ONCE, IN THE ORDER IT WAS FIRST NAMED. A relation that names the same record
      -- twice states one fact twice; the association beside it is one row per (target, role),
      -- so the value keeps the first mention and drops the repeat — and a member named by user
      -- id AND by Person record id is the same person, caught here after resolution.
      if v_out @> jsonb_build_array(to_jsonb(v_to::text)) then
        continue;
      end if;
      v_out := v_out || jsonb_build_array(to_jsonb(v_to::text));
    end loop;

    v_new := case when jsonb_typeof(v_val) = 'array' then v_out else v_out -> 0 end;
    if v_new is distinct from v_val then
      new.data := new.data || jsonb_build_object(f.k, v_new);
    end if;
  end loop;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._io_declare_unmapped(p_organization_id uuid, p_table_id uuid, p_rows jsonb, p_mapping jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
$function$;

delete from platform.client_callable_door
 where schema_name = 'custom' and function_name in ('relation_names_match', '_relation_names_resolve');

drop function custom.relation_names_match(uuid, uuid, text[]);
drop function custom._relation_names_resolve(uuid, uuid, text[]);
drop function custom.relation_name_key(text);

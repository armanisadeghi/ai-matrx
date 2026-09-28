-- additive: yes
-- based-on: custom._field_type_converts_values() 94f77619dd3f58192907d77339b05653279fc71b3a3e24c394326e07f768e281
--
-- DATA-V2-BASICS-2 (2026-09-28) — A CHOICE COLUMN CHANGED INTO SOMETHING ELSE KEEPS ITS WORDS.
-- MEASURED on the Sheet (Clinic Supplies Count, admin@admin.com): Stock Status changed from a choice
-- column to Text (Configure Table → Shows as Text) left every cell reading "in_stock" — the choice's
-- hidden key, in words nobody wrote. And a Text column changed to a choice column set EVERY word
-- aside, even "In stock" when In stock was one of the choices, because custom.field_value_convert
-- takes only an option's id for a list. The conversion trigger now carries each value through
-- custom._field_value_carry: a held choice goes by its own words (several read "Gloves, Masks" as
-- Text), words — or a key, or an option's id — find their choice, a column that takes other values
-- keeps an unmatched word, and anything else is set aside in `_retired` as before, now with what the
-- column was (`field_then`) so a choice set aside comes back as its words. One choice ↔ several keeps
-- the cell (a list of one ↔ that one). Nothing is rewritten by hand; values change only when a
-- column is changed.
-- New: custom._field_value_carry(uuid, jsonb, jsonb, jsonb) (internal; the closed schema's DDL guard keeps it off the client lane).
-- Guard: scripts/campaign-tests/databasics2_a_choice_changed_keeps_its_words.sql
-- Inverse: migrations/inverse/databasics2_a_choice_changed_keeps_its_words_down.sql

CREATE OR REPLACE FUNCTION custom._field_value_carry(p_organization_id uuid, p_from jsonb, p_to jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
-- ONE VALUE, CARRIED FROM WHAT A COLUMN WAS TO WHAT IT IS NOW (DATA-V2-BASICS-2, 2026-09-28).
-- custom.field_value_convert judges a value by the new behaviour alone, and a choice column's cell
-- holds the choice's KEY — so a choice column changed to Text read "in_stock" in every cell, and a
-- Text column changed to a choice column set every word aside, even the ones naming a choice.
-- Here a held choice goes by its own words, and words (or a key, or an option's id) find their
-- choice. Returns SQL null when the value does not fit, and the caller keeps it in `_retired`.
-- Neither side a choice column: exactly custom.field_value_convert.
declare
  v_from_list boolean := coalesce(p_from ->> 'type', '') = 'list';
  v_to_list   boolean := coalesce(p_to ->> 'type', '') = 'list';
  v_from_tbl  uuid    := case when v_from_list then nullif(p_from -> 'config' ->> 'options_table_id', '')::uuid end;
  v_to_tbl    uuid    := case when v_to_list then nullif(p_to -> 'config' ->> 'options_table_id', '')::uuid end;
  v_from      jsonb;
  v_to        jsonb;
  v_items     jsonb;
  v_words     jsonb := '[]'::jsonb;
  v_out       jsonb := '[]'::jsonb;
  v_one       jsonb;
  v_tok       text;
  v_word      text;
  v_k         text;
  v_hit       text;
  v_allow     boolean := coalesce((p_to -> 'config' ->> 'allow_other')::boolean, false);
  v_many_to   boolean := coalesce((p_to ->> 'multi')::boolean, false);
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;
  end if;
  if not v_from_list and not v_to_list then
    return custom.field_value_convert(p_to, p_value);
  end if;
  if jsonb_typeof(p_value) = 'object' then
    return null;
  end if;

  v_from := jsonb_build_object('options', case when v_from_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_from_tbl) end);
  v_to   := jsonb_build_object('options', case when v_to_tbl is null then '{}'::jsonb
                                               else custom.choice_options(p_organization_id, v_to_tbl) end);
  v_items := case when jsonb_typeof(p_value) = 'array' then p_value else jsonb_build_array(p_value) end;

  -- ── INTO A CHOICE COLUMN ─────────────────────────────────────────────────────────────
  if v_to_list then
    for v_one in select e from jsonb_array_elements(v_items) e loop
      if jsonb_typeof(v_one) in ('object', 'array') then
        return null;
      end if;
      v_tok  := btrim(v_one #>> '{}');
      v_word := v_tok;
      v_hit  := null;
      if v_from_list then
        v_k := custom.choice_key_of(v_from, v_tok);
        if v_k is not null then
          v_word := coalesce(v_from -> 'options' -> v_k ->> 'label', v_tok);
        end if;
      end if;
      if v_from_list and v_from_tbl is not distinct from v_to_tbl then
        -- The same list: the key it held is still the key, a retired one included.
        v_hit := custom.choice_key_of(v_to, v_tok);
      else
        v_hit := coalesce(custom.choice_key_of(v_to, v_word), custom.choice_key_of(v_to, v_tok));
        -- Nothing retired is picked anew.
        if v_hit is not null and coalesce((v_to -> 'options' -> v_hit ->> 'retired')::boolean, false) then
          v_hit := null;
        end if;
      end if;
      if v_hit is not null then
        v_out := v_out || jsonb_build_array(to_jsonb(v_hit));
      elsif v_allow and v_word <> '' then
        v_out := v_out || jsonb_build_array(to_jsonb(v_word));   -- an other value, kept as its words
      else
        return null;
      end if;
    end loop;
    if v_many_to then
      return v_out;
    end if;
    if jsonb_array_length(v_out) = 0 then
      return 'null'::jsonb;
    end if;
    if jsonb_array_length(v_out) = 1 then
      return v_out -> 0;
    end if;
    return null;                            -- several choices do not fit one; kept, never dropped
  end if;

  -- ── OUT OF A CHOICE COLUMN: each held choice becomes its words ────────────────────────
  for v_one in select e from jsonb_array_elements(v_items) e loop
    if jsonb_typeof(v_one) = 'string' then
      v_k := custom.choice_key_of(v_from, v_one #>> '{}');
      v_words := v_words || jsonb_build_array(
        case when v_k is not null then coalesce(v_from -> 'options' -> v_k -> 'label', v_one) else v_one end);
    else
      v_words := v_words || jsonb_build_array(v_one);
    end if;
  end loop;
  if jsonb_array_length(v_words) = 0 then
    return 'null'::jsonb;
  end if;
  if jsonb_array_length(v_words) = 1 then
    return custom.field_value_convert(p_to, v_words -> 0);
  end if;
  if coalesce(p_to ->> 'type', '') = 'text' then
    -- Several choices read as one line of words: "Gloves, Masks".
    return to_jsonb((select string_agg(e #>> '{}', ', ' order by ord)
                       from jsonb_array_elements(v_words) with ordinality t(e, ord)));
  end if;
  return null;                              -- several choices are not one number, date or tick
end;
$function$;

CREATE OR REPLACE FUNCTION custom._field_type_converts_values()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_key       text;
  v_label     text;
  v_table     uuid;
  v_was       text;
  v_now       text;
  v_converted integer := 0;
  v_retired_n integer := 0;
  r           record;
  v_val       jsonb;
  v_new       jsonb;
  v_data      jsonb;
  v_retired   jsonb;
  v_alts      jsonb;
  v_keep_alts jsonb;
  v_alt       jsonb;
  v_conv_alt  jsonb;
  v_alts_retired integer := 0;
  -- DATA-V2-BASICS-2: values an earlier change set aside that fit again.
  v_back_n    integer := 0;
  v_entry     jsonb;
  v_ord       bigint;
  -- DATA-V2-BASICS-2: the column as it was, enough to read a choice's key as its words later.
  v_then      jsonb;
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not custom.store_is_open(new.organization_id) then
    perform custom.assert_store_door(new.organization_id, 'custom.record');
  end if;

  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return null;
  end if;

  v_was := custom.field_behaviour(old.data);
  v_now := custom.field_behaviour(new.data);
  if v_was is not distinct from v_now then
    return null;                          -- the Field still asks for the same thing
  end if;

  v_key   := new.data ->> 'key';
  v_then  := jsonb_strip_nulls(jsonb_build_object('type', old.data -> 'type', 'multi', old.data -> 'multi',
               'config', case when old.data ->> 'type' = 'list'
                              then jsonb_build_object('options_table_id', old.data -> 'config' -> 'options_table_id') end));
  v_label := coalesce(nullif(new.data ->> 'label', ''), v_key, 'this field');
  v_table := nullif(new.data ->> 'entity_definition_id', '')::uuid;
  if v_key is null or v_table is null then
    return null;
  end if;

  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and x.data ? v_key
  loop
    v_val := r.data -> v_key;
    if v_val is null or jsonb_typeof(v_val) = 'null' then
      continue;
    end if;
    -- DATA-V2-BASICS-2: a choice goes by its words, and words find their choice (custom._field_value_carry).
    v_new := custom._field_value_carry(new.organization_id, old.data, new.data, v_val);

    if v_new is not null then
      -- THE ALTERNATES COME TOO. VAL-3: an alternate is a candidate for the SAME field, so
      -- custom.validate_value_envelope judges it by the SAME behaviour — and a converted value
      -- sitting beside an unconverted alternate is a document that cannot be written at all.
      -- (Measured: converting Phone to a number while a merge's "222" alternate stayed a
      -- string failed the very write that was doing the converting.) One that does not convert
      -- is kept in _retired as what it was, with its rank and its source.
      v_data := r.data;
      v_alts := coalesce(v_data -> '_values' -> v_key -> 'alternates', '[]'::jsonb);
      if jsonb_typeof(v_alts) = 'array' and jsonb_array_length(v_alts) > 0 then
        v_keep_alts := '[]'::jsonb;
        v_retired   := coalesce(v_data -> '_retired', '[]'::jsonb);
        if jsonb_typeof(v_retired) <> 'array' then
          v_retired := '[]'::jsonb;
        end if;
        for v_alt in select e from jsonb_array_elements(v_alts) e loop
          v_conv_alt := custom._field_value_carry(new.organization_id, old.data, new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
              'field_then', v_then,
              'reason', format('%s changed what it holds and this other candidate for it does not convert, so it is kept here as it was (FLD-4 / T12)', v_label),
              'at', to_jsonb(now()));
            v_alts_retired := v_alts_retired + 1;
          end if;
        end loop;
        if jsonb_array_length(v_keep_alts) > 0 then
          v_data := jsonb_set(v_data, array['_values', v_key, 'alternates'], v_keep_alts);
        else
          v_data := jsonb_set(v_data, array['_values', v_key],
                              (v_data -> '_values' -> v_key) - 'alternates');
        end if;
        if jsonb_array_length(v_retired) > 0 then
          v_data := v_data || jsonb_build_object('_retired', v_retired);
        end if;
      end if;
      if v_new is distinct from v_val then
        v_data := v_data || jsonb_build_object(v_key, v_new);
        v_converted := v_converted + 1;
      end if;
      if v_data is distinct from r.data then
        update custom.record x set data = v_data
         where x.organization_id = new.organization_id and x.id = r.id;
      end if;
    else
      -- IT DOES NOT CONVERT. The same place, the same shape and the same reason T8's retype
      -- already uses: the value and its envelope are kept in `_retired`, and the key leaves
      -- the document so the record can be written again.
      v_data    := r.data;
      v_retired := coalesce(v_data -> '_retired', '[]'::jsonb);
      if jsonb_typeof(v_retired) <> 'array' then
        v_retired := '[]'::jsonb;
      end if;
      v_retired := v_retired || jsonb_build_object(
        'key',      v_key,
        'label',    v_label,
        'value',    v_val,
        'envelope', v_data -> '_values' -> v_key,
        -- What the column was when this was set aside, so a choice's key comes back as its words.
        'field_then', v_then,
        'reason',   format('%s now holds %s, and %s is not one — this value was kept here when the field changed, neither coerced nor deleted (FLD-4 / T12)',
                           v_label,
                           case when new.data ->> 'type' = 'range'
                                     and custom.said(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'boolean' then 'a tick or nothing'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else custom.said(new.data ->> 'type', 'something else') end,
                           coalesce('"' || (v_val #>> '{}') || '"', 'that value')),
        'at',       to_jsonb(now()));
      v_data := v_data - v_key;
      if jsonb_typeof(v_data -> '_values') = 'object' then
        v_data := jsonb_set(v_data, '{_values}', (v_data -> '_values') - v_key);
      end if;
      v_data := v_data || jsonb_build_object('_retired', v_retired);
      update custom.record x set data = v_data
       where x.organization_id = new.organization_id and x.id = r.id;
      v_retired_n := v_retired_n + 1;
    end if;
  end loop;

  -- ── DATA-V2-BASICS-2 (2026-09-27): A VALUE SET ASIDE COMES BACK WHEN IT FITS AGAIN. ──────
  -- MEASURED on Harbor Dental's "Operatory Supply Orders": Operatory (Op 1 · Op 2 · Op 3) changed to
  -- a Number set all three aside in `_retired`, and changing it back to Text — by hand or by the
  -- migration's own undo — brought none of them back: the undo patches the Field and this trigger
  -- converted only the values still in place. Now a record with no value for this column takes back
  -- the newest value an earlier change set aside for it, when that value fits what the column now
  -- holds; it leaves `_retired`. Alternates keep their own path above.
  for r in
    select x.id, x.data from custom.record x
     where x.organization_id = new.organization_id
       and x.table_id = v_table
       and x.deleted_at is null
       and not (x.data ? v_key)
       and jsonb_typeof(x.data -> '_retired') = 'array'
       and exists (select 1 from jsonb_array_elements(x.data -> '_retired') e
                    where e ->> 'key' = v_key and not (e ? 'was_an_alternate_ranked'))
  loop
    select t.e, t.ord into v_entry, v_ord
      from jsonb_array_elements(r.data -> '_retired') with ordinality t(e, ord)
     where t.e ->> 'key' = v_key and not (t.e ? 'was_an_alternate_ranked')
     order by t.ord desc
     limit 1;
    v_new := custom._field_value_carry(new.organization_id, coalesce(v_entry -> 'field_then', '{}'::jsonb), new.data, v_entry -> 'value');
    if v_new is null or jsonb_typeof(v_new) = 'null' then
      continue;
    end if;
    v_retired := (select coalesce(jsonb_agg(t.e order by t.ord), '[]'::jsonb)
                    from jsonb_array_elements(r.data -> '_retired') with ordinality t(e, ord)
                   where t.ord <> v_ord);
    v_data := r.data || jsonb_build_object(v_key, v_new);
    v_data := case when jsonb_array_length(v_retired) = 0 then v_data - '_retired'
                   else jsonb_set(v_data, '{_retired}', v_retired) end;
    update custom.record x set data = v_data
     where x.organization_id = new.organization_id and x.id = r.id;
    v_back_n := v_back_n + 1;
  end loop;
  if v_back_n > 0 then
    raise notice 'custom: "%" took back % value(s) an earlier change had set aside, because they fit again.', v_label, v_back_n;
  end if;

  -- 🚨 VIS-2 (2026-09-19) — AND IT WRITES ITS MIGRATION ROW, IN THIS SAME TRANSACTION.
  -- MEASURED: `custom.migrate_retype` records a `history.migration_log` row before it patches
  -- the Field, but the CONVERSION is this trigger's, and this trigger is what runs when the
  -- same Field is retyped through the ordinary write door. So a type change made the normal
  -- way rewrote every value of the table, moved what would not convert into `_retired`, and
  -- left NOTHING in the migration log: HIS-8's undo did not exist for it and the Migrations
  -- screen did not know it had happened. The row is written here, where the rewrite is, so
  -- both routes leave the same trace.
  --
  -- The inverse is the Field's own previous shape, which is a `patch` on the Field record -
  -- the identical inverse `custom.migrate_retype` stores, and `custom.record_update` on the
  -- Field is what puts it back, firing this trigger again to convert the values the other way.
  --
  -- ONE ROW, NOT TWO. When `custom.migrate_retype` is the caller it has already recorded its
  -- row a few statements earlier IN THIS TRANSACTION, and `now()` is the transaction
  -- timestamp, so `applied_at >= now()` is exactly "recorded by this transaction" - it cannot
  -- match an older row and there are no newer ones.
  if not exists (select 1 from history.migration_log m
                  where m.organization_id = new.organization_id
                    and m.verb = 'retype'
                    and m.target_kind = 'field'
                    and m.target_id = new.id
                    and m.applied_at >= now()) then
    perform history.migration_record(
      new.organization_id, 'retype', 'field', new.id,
      jsonb_build_object(
        'kind', 'patch',
        'record_id', new.id::text,
        'patch', jsonb_strip_nulls(jsonb_build_object(
                   'type',   old.data ->> 'type',
                   'config', old.data -> 'config'))),
      format('%s behaves as %s instead of %s; %s value(s) converted, %s kept in _retired with the reason, %s other candidate(s) kept too. Recorded by the conversion itself, so a retype through the ordinary write door leaves the same trace as one through custom.migrate_retype (FLD-4 / T12 / HIS-8).',
             v_label, v_now, v_was, v_converted, v_retired_n, v_alts_retired));
  end if;

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$
;

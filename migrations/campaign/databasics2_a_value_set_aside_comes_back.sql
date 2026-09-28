-- additive: yes
-- based-on: custom._field_type_converts_values() 0797c29542109f051f516a735b4b7db69cb2b080c5565d249059b9bcb1309034
--
-- DATA-V2-BASICS-2 (2026-09-27) — A VALUE A TYPE CHANGE SET ASIDE COMES BACK WHEN IT FITS AGAIN.
-- Changing Harbor Dental's "Operatory" (Op 1 · Op 2 · Op 3) to a Number set every value aside in
-- `_retired` (kept, never deleted), and changing it back — by hand or by the migration's own undo —
-- brought none of them back. The conversion trigger now also returns, for a record with no value in
-- this column, the newest value an earlier change set aside, when it fits what the column now holds.
-- Replaces one body (trigger function, same signature).
-- Guard: scripts/campaign-tests/databasics2_a_value_set_aside_comes_back.sql
-- Inverse: migrations/inverse/databasics2_a_value_set_aside_comes_back_down.sql

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
    v_new := custom.field_value_convert(new.data, v_val);

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
          v_conv_alt := custom.field_value_convert(new.data, v_alt -> 'value');
          if v_conv_alt is not null then
            v_keep_alts := v_keep_alts || jsonb_build_array(v_alt || jsonb_build_object('value', v_conv_alt));
          else
            v_retired := v_retired || jsonb_build_object(
              'key', v_key, 'label', v_label, 'value', v_alt -> 'value',
              'was_an_alternate_ranked', v_alt -> 'rank', 'envelope', v_alt -> 'src',
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
    v_new := custom.field_value_convert(new.data, v_entry -> 'value');
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
$function$;

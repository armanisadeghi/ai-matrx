-- VIS-2 (4 of 4) — THE INVERSE. custom._field_type_converts_values() exactly as it stood at
-- 78a21879e5697fc372e75297c1b5be899f093599555298cc76ec07f2ac3766e3.

set lock_timeout = '3s';
set statement_timeout = '60s';

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
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  if not coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false) then
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
                                     and coalesce(new.data -> 'config' ->> 'kind', 'number') in ('date','datetime')
                                then 'dates'
                                when new.data ->> 'type' = 'range' then 'numbers'
                                when new.data ->> 'type' = 'text' then 'words'
                                when new.data ->> 'type' = 'list' then 'one of its choices'
                                when new.data ->> 'type' = 'relation' then 'a link to a record'
                                else coalesce(new.data ->> 'type', 'something else') end,
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

  if v_converted > 0 or v_retired_n > 0 or v_alts_retired > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason, % other candidate(s) kept too.',
      v_label, v_was, v_now, v_converted, v_retired_n, v_alts_retired;
  end if;
  return null;
end;
$function$;

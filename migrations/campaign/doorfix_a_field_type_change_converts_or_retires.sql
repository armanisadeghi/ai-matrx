-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
--
-- DOOR-FIX 3 — T12. CHANGING WHAT A FIELD HOLDS CONVERTS THE VALUES, OR RETIRES THEM SAYING WHY.
--
-- THE ROOT CAUSE, AND WHY IT BRICKS THE ROW
-- -----------------------------------------
-- `custom._record_field_validation` validates the WHOLE document on every write, against the
-- Table's Fields as they stand NOW. That is right, and it is why changing a Field's behaviour
-- was fatal: the values already written were neither converted nor retired, so the first value
-- that no longer fits makes EVERY later write to that record fail — naming a field the writer
-- never touched. Measured on the main database 2026-09-19: Phone text -> number with "abc"
-- already stored, then a rename of the person's NAME: "Phone takes a number, and it was given
-- a string". The record could not be saved again, by anybody, ever.
--
-- THE CLASS, NOT THE INSTANCE. The store already knows how to do this correctly in one place:
-- T8's retype moves a value that stops applying into `_retired`, WITH ITS ENVELOPE AND ITS
-- REASON, when a record changes kind. A Field changing kind is the same event seen from the
-- other side, and it now does the same thing — for every record of that Table, in the same
-- transaction as the change that caused it, whichever way in was used: `custom.record_update`
-- on the Field row, the `custom.migrate_retype` verb, or a direct write. It is an AFTER
-- trigger on the Field row, so there is no "ordinary way in" that can miss it.
--
-- CONVERT FIRST, RETIRE ONLY WHAT WILL NOT CONVERT. "12" becoming the number 12 is not data
-- loss and must not cost the person their value; "abc" becoming a number is impossible and
-- must not be invented. `custom.field_value_convert` is the whole conversion table, one place,
-- and it is deliberately narrow: it never rounds, never truncates, never guesses a date
-- format Postgres itself will not take, and never turns one thing into another to make a
-- write succeed.
--
-- NOTHING FAILS SILENTLY. Every record touched is counted and the counts are raised as a
-- NOTICE naming the field, the conversions and the retirements.
--
-- based-on: custom.migrate_retype(uuid, uuid, text, text) e8d125b7e9e4ba3eb3306234eb5a0365ad6f47e1019e6b7b1d460c7672209f53
--
-- INVERSE: migrations/inverse/doorfix_a_field_type_change_converts_or_retires_down.sql

set lock_timeout = '3s';
set statement_timeout = '5min';

-- ─────────────────────────────────────────────────────────────────────────────
-- WHAT A FIELD HOLDS, as one comparable string. Two Field documents with the same
-- signature ask the same thing of a value, so nothing has to be converted.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.field_behaviour(p_field_data jsonb)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select coalesce(p_field_data ->> 'type', '') || '/'
      || coalesce(p_field_data -> 'config' ->> 'kind', '') || '/'
      || coalesce(p_field_data ->> 'format', '') || '/'
      || coalesce(p_field_data ->> 'relation_target', '') || '/'
      || coalesce(p_field_data -> 'config' ->> 'options_table_id', '') || '/'
      || case when coalesce((p_field_data ->> 'multi')::boolean, false) then 'many' else 'one' end;
$function$;

comment on function custom.field_behaviour(jsonb) is
  'FLD-1 / T12: what a Field asks of a value, as one comparable string — behaviour, kind, format, target, options table and multi. The trigger that converts values reads it to decide whether anything has to happen at all.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE CONVERSION TABLE. One place, narrow on purpose. NULL means "this value does
-- not become that", which is an answer and not a failure.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom.field_value_convert(p_to jsonb, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'pg_catalog'
as $function$
declare
  v_type text := p_to ->> 'type';
  v_kind text := coalesce(p_to -> 'config' ->> 'kind', 'number');
  v_txt  text;
  v_num  numeric;
  v_one  jsonb;
  v_out  jsonb;
begin
  if p_value is null or jsonb_typeof(p_value) = 'null' then
    return p_value;                       -- an absence is already whatever the field wants
  end if;

  -- MULTI: a list of values converts when every one of them does, and not otherwise. A half
  -- converted list is a value nobody asked for.
  if jsonb_typeof(p_value) = 'array' then
    v_out := '[]'::jsonb;
    for v_one in select e from jsonb_array_elements(p_value) e loop
      v_one := custom.field_value_convert(p_to, v_one);
      if v_one is null then
        return null;
      end if;
      v_out := v_out || jsonb_build_array(v_one);
    end loop;
    return v_out;
  end if;

  if jsonb_typeof(p_value) = 'object' then
    return null;                          -- no field behaviour takes an object
  end if;

  v_txt := p_value #>> '{}';

  if v_type = 'text' then
    -- ANYTHING SCALAR READS AS WORDS. 12 becomes "12"; true becomes "true". Nothing is lost.
    return to_jsonb(v_txt);

  elsif v_type = 'range' and v_kind in ('date', 'datetime') then
    if jsonb_typeof(p_value) <> 'string' then
      return null;
    end if;
    begin
      perform v_txt::timestamptz;         -- exactly the test custom.validate_values applies
    exception when others then
      return null;
    end;
    return p_value;

  elsif v_type = 'range' then
    if jsonb_typeof(p_value) = 'number' then
      return p_value;
    end if;
    begin
      v_num := v_txt::numeric;
    exception when others then
      return null;
    end;
    return to_jsonb(v_num);

  elsif v_type in ('list', 'relation') then
    -- Both store the id of a record. A value that is not an id is not one of its choices and
    -- is not going to become one by being converted.
    if jsonb_typeof(p_value) = 'string'
       and v_txt ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return p_value;
    end if;
    return null;

  elsif v_type = 'formula' then
    -- FLD-9: a formula is never written by hand, so a typed-in value cannot survive the change.
    return null;
  end if;

  return null;
end;
$function$;

comment on function custom.field_value_convert(jsonb, jsonb) is
  'T12: the whole conversion table for a Field that changes what it holds — text <-> number, text -> date, id-shaped strings for list and relation, and NULL for everything that does not convert. It never rounds, never truncates and never invents a value to make a write succeed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- THE TRIGGER. Whichever way in changed the Field, the records follow in the same
-- transaction.
-- ─────────────────────────────────────────────────────────────────────────────
create function custom._field_type_converts_values()
returns trigger
language plpgsql
set search_path to 'pg_catalog'
as $function$
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
begin
  -- THE DOOR. custom.assert_store_door resolves custom/system_enabled and, while it is false,
  -- this store takes writes only from the role that owns custom.record. The switch never
  -- removes a check: everything below runs exactly as before.
  perform custom.assert_store_door(new.organization_id, 'custom.record');

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
      if v_new is distinct from v_val then
        update custom.record x set data = x.data || jsonb_build_object(v_key, v_new)
         where x.organization_id = new.organization_id and x.id = r.id;
        v_converted := v_converted + 1;
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

  if v_converted > 0 or v_retired_n > 0 then
    raise notice 'custom: "%" changed what it holds (% -> %): % value(s) converted, % kept in _retired with the reason.',
      v_label, v_was, v_now, v_converted, v_retired_n;
  end if;
  return null;
end;
$function$;

create trigger custom_record_field_type_converts_values
  after update on custom.record
  for each row
  execute function custom._field_type_converts_values();

-- ─────────────────────────────────────────────────────────────────────────────
-- THE VERB SAYS WHAT NOW HAPPENS. It used to promise "values: unchanged", which was
-- true and was the defect.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function custom.migrate_retype(p_organization_id uuid, p_id uuid, p_to text, p_note text default null)
returns jsonb
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_row     custom.record%rowtype;
  v_log     uuid;
  v_keep    jsonb;
  v_misfit  jsonb := '{}'::jsonb;
  v_ok      text[];
  v_key     text;
  v_to_tbl  uuid;
  v_was     text;
  v_conv    integer;
  v_ret     integer;
begin
  -- THE SWITCH. custom.assert_store_door resolves custom/system_enabled.
  perform custom.assert_store_door(p_organization_id, 'custom.migrate_retype');

  select * into v_row from custom.record r
   where r.organization_id = p_organization_id and r.id = p_id and r.deleted_at is null;
  if v_row.id is null then
    raise exception 'There is no record % here to retype.', p_id using errcode = '02000';
  end if;

  -- ── ARM TWO FIRST, because it is the smaller one: a FIELD changes what it behaves as
  --    (FLD-4 / T12). The values already written are CONVERTED where they convert and kept in
  --    `_retired` with their reason where they do not — by the trigger on the Field row, so
  --    this verb and an ordinary write behave identically.
  if v_row.data_class = 'field' then
    v_was := v_row.data ->> 'type';
    if v_was = p_to then
      return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                                'changed', false, 'at', now());
    end if;
    v_log := history.migration_record(p_organization_id, 'retype', 'field', p_id,
               jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                  'patch', jsonb_build_object('type', v_was)),
               coalesce(p_note, format('%s behaves as %s instead of %s; values that fit are converted and values that do not are kept in _retired with the reason, neither coerced nor deleted (FLD-4)', coalesce(v_row.data ->> 'label', v_row.data ->> 'key'), p_to, v_was)));
    perform custom.record_update(p_organization_id, p_id, jsonb_build_object('type', p_to));
    select count(*) filter (where true) into v_ret
      from custom.record x, lateral jsonb_array_elements(coalesce(x.data -> '_retired', '[]'::jsonb)) e
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and e ->> 'key' = (v_row.data ->> 'key');
    select count(*) into v_conv
      from custom.record x
     where x.organization_id = p_organization_id
       and x.table_id = nullif(v_row.data ->> 'entity_definition_id', '')::uuid
       and x.deleted_at is null
       and x.data ? (v_row.data ->> 'key');
    return jsonb_build_object('verb', 'retype', 'field_id', p_id, 'was', v_was, 'now', p_to,
                              'changed', true, 'migration_id', v_log,
                              'records_still_holding_a_value', v_conv,
                              'values_in_retired_for_this_field', v_ret,
                              'values', 'converted where they convert; kept in _retired with the reason where they do not (FLD-4 / T12)',
                              'at', now());
  end if;

  -- ── ARM ONE: a RECORD moves to another Table (REC-N-18 / T9). The id does not change, so
  --    every relation to it still resolves — that is the whole point of the verb.
  select t.id into v_to_tbl from custom.record t
   where t.organization_id = p_organization_id and t.data_class = 'table'
     and t.deleted_at is null
     and (t.id::text = p_to or t.data ->> 'slug' = p_to or t.data ->> 'name' = p_to)
   limit 1;
  if v_to_tbl is null then
    raise exception 'There is no table "%" in this organization to retype it to.', p_to
      using errcode = '02000', hint = 'REC-N-18: name the table by id, slug or name.';
  end if;

  select coalesce(array_agg(f.data ->> 'key'), '{}')
    into v_ok
    from custom.applicable_fields(p_organization_id, v_to_tbl, null) f;

  v_keep := v_row.data;
  for v_key in select jsonb_object_keys(v_row.data) loop
    if left(v_key, 1) = '_' or v_key in ('parent_id') then
      continue;
    end if;
    if not (v_key = any (v_ok)) then
      v_misfit := v_misfit || jsonb_build_object(v_key, v_row.data -> v_key);
      v_keep := v_keep - v_key;
      -- THE ENVELOPE GOES WITH THE VALUE. A record saying where a value it no longer holds
      -- came from is orphan provenance, and W1-VAL refuses it by name — correctly.
      v_keep := case when v_keep ? '_values'
                     then jsonb_set(v_keep, array['_values'], (v_keep -> '_values') - v_key)
                     else v_keep end;
    end if;
  end loop;

  v_log := history.migration_record(p_organization_id, 'retype', 'record', p_id,
             jsonb_build_object('kind', 'patch', 'record_id', p_id::text,
                                'patch', v_row.data, 'table_id', v_row.table_id::text),
             coalesce(p_note, format('retyped to %s; %s value(s) did not fit and are in History with this reason, neither coerced nor deleted',
                                     coalesce((select t.data ->> 'name' from custom.record t
                                                where t.organization_id = p_organization_id and t.id = v_to_tbl), p_to),
                                     (select count(*) from jsonb_object_keys(v_misfit)))));

  update custom.record r
     set table_id = v_to_tbl, data = v_keep
   where r.organization_id = p_organization_id and r.id = p_id;

  return jsonb_build_object('verb', 'retype', 'record_id', p_id, 'kept_the_id', true,
                            'from_table', v_row.table_id, 'to_table', v_to_tbl,
                            'migration_id', v_log,
                            'misfits', v_misfit,
                            'misfits_are', 'in History with the reason, on migration ' || v_log::text,
                            'at', now());
end;
$function$;

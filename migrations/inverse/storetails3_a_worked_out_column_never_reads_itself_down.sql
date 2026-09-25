-- chair-step: the INVERSE of storetails3_a_worked_out_column_never_reads_itself.sql.
--   Puts `custom.lookup_value`, `custom.rollup_value` (the far record read whole through
--   custom.record_values) and `custom._field_reads_what_it_reads` (STORE-LEAK-FORMULA's body, no
--   circle check) back to the exact bodies that file was written against, and drops
--   `custom.far_value`, `custom.record_value_one` and `custom.field_cycle` with its door row.
-- lock: custom
-- lane: STORE-TAILS-3
-- based-on: custom.lookup_value(uuid, uuid, jsonb) 5a08a3ebfd866cd4c1a2ed6bd5ae78a491adecf12d671ce3c477e4c8ebb539d7
-- based-on: custom.rollup_value(uuid, uuid, jsonb) 234e4609ec344c07d56fc16e47d96aae2c44d2a357c15938b75475072ce22a9c
-- based-on: custom._field_reads_what_it_reads() e9e61b6d546bb5a215bac7a1d3eaa1c45b78f64b0ede25531d5f75539e4c23da

set local lock_timeout = '30s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom.lookup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via   text := p_field_data -> 'config' ->> 'via';
  v_pick  text := p_field_data -> 'config' ->> 'pick';
  v_multi boolean := coalesce((p_field_data ->> 'multi')::boolean, false);
  v_out   jsonb := '[]'::jsonb;
  v_one   jsonb;
  v_t     uuid;
begin
  for v_t in select * from custom.relation_targets(p_organization_id, p_record_id, v_via) loop
    if v_t = p_record_id then
      continue;                     -- a record cannot look itself up through itself.
    end if;
    -- THE FAR SIDE IS READ THROUGH THE SAME ONE READER every consumer uses, so a lookup OF
    -- a computed Value, or of another lookup, answers without a second code path.
    v_one := custom.record_values(p_organization_id, v_t) -> v_pick;
    if v_one is not null then
      v_out := v_out || jsonb_build_array(v_one);
    end if;
  end loop;
  if v_multi then
    return v_out;
  end if;
  return case when jsonb_array_length(v_out) = 0 then null else v_out -> 0 end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.rollup_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_via  text := p_field_data -> 'config' ->> 'via';
  v_of   text := p_field_data -> 'config' ->> 'of';
  v_agg  text := p_field_data -> 'config' ->> 'agg';
  v_nums numeric[] := array[]::numeric[];
  v_n    integer := 0;
  v_one  jsonb;
  v_t    uuid;
begin
  for v_t in select * from custom.relation_targets(p_organization_id, p_record_id, v_via) loop
    if v_t = p_record_id then
      continue;                     -- a record is never one of the things it adds up.
    end if;
    v_n := v_n + 1;                                    -- count counts RECORDS, once each.
    if v_of is not null then
      v_one := custom.record_values(p_organization_id, v_t) -> v_of;
      if v_one is not null and jsonb_typeof(v_one) = 'number' then
        v_nums := v_nums || (v_one #>> '{}')::numeric;
      end if;
    end if;
  end loop;

  if v_agg = 'count' then
    return to_jsonb(v_n);
  end if;
  if array_length(v_nums, 1) is null then
    return null;                    -- nothing to work out is an absence, never a zero.
  end if;
  return case v_agg
    when 'sum' then to_jsonb((select sum(x) from unnest(v_nums) x))
    when 'min' then to_jsonb((select min(x) from unnest(v_nums) x))
    when 'max' then to_jsonb((select max(x) from unnest(v_nums) x))
    when 'avg' then to_jsonb((select avg(x) from unnest(v_nums) x))
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;
  if coalesce(new.data ->> 'type', '') <> 'formula'
     or not (coalesce(new.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']) then
    return new;
  end if;
  -- A retirement is not a change of shape (the shared rule): the document stays byte-for-byte
  -- what it was, so every guard after this one still sees a retirement.
  if tg_op = 'UPDATE'
     and custom.is_a_retirement(old.deleted_at, new.deleted_at, old.data, new.data,
                                old.table_id, new.table_id, old.organization_id,
                                new.organization_id, old.data_class, new.data_class) then
    return new;
  end if;

  -- depends_on: the columns of THIS table it reads, by key (the list custom.field_dependants
  -- and REC-18's "this field is used by …" read). Worked out from the definition, never typed.
  select coalesce(jsonb_agg(distinct i.input_key order by i.input_key), '[]'::jsonb)
    into v_deps
    from custom.field_inputs_of(new.organization_id, new.data) i
   where i.input_table::text = new.data ->> 'entity_definition_id'
     and not i.retired;
  if new.data -> 'depends_on' is distinct from v_deps then
    new.data := jsonb_set(new.data, '{depends_on}', v_deps);
  end if;

  select * into v_floor
    from custom.field_sensitivity_floor(new.organization_id, new.data, new.id);
  if v_floor.sensitivity is not null
     and custom.sensitivity_rank(new.data ->> 'sensitivity') < custom.sensitivity_rank(v_floor.sensitivity) then
    raise notice 'the column "%" reads %, which is %, so it is % too (it was %)',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_floor.reads) e),
      v_floor.sensitivity, v_floor.sensitivity, coalesce(new.data ->> 'sensitivity', 'nothing');
    new.data := jsonb_set(new.data, '{sensitivity}', to_jsonb(v_floor.sensitivity));
  end if;
  return new;
end;
$function$;

drop function if exists custom.far_value(uuid, uuid, text, jsonb);
drop function if exists custom.record_value_one(uuid, uuid, text);
delete from platform.client_callable_door
 where declared_by = 'STORE-TAILS-3' and schema_name = 'custom' and function_name = 'field_cycle';
drop function if exists custom.field_cycle(uuid, jsonb, uuid);

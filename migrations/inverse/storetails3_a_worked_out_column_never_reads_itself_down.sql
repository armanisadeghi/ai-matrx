-- chair-step: the INVERSE of storetails3_a_worked_out_column_never_reads_itself.sql.
--   Drops the Field-row trigger and its function, puts `custom.lookup_value` and
--   `custom.rollup_value` back to the exact bodies that file was written against (its two
--   based-on hashes: the far record read whole through custom.record_values), and drops
--   `custom.far_value`, `custom.record_value_one` and `custom.field_cycle` with its door row.
-- lock: custom
-- lane: STORE-TAILS-3

set local lock_timeout = '30s';
set local statement_timeout = '120s';

drop trigger if exists custom_record_field_never_reads_itself on custom.record;
drop function if exists custom._field_never_reads_itself();

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

drop function if exists custom.far_value(uuid, uuid, text, jsonb);
drop function if exists custom.record_value_one(uuid, uuid, text);
delete from platform.client_callable_door
 where declared_by = 'STORE-TAILS-3' and schema_name = 'custom' and function_name = 'field_cycle';
drop function if exists custom.field_cycle(uuid, uuid);

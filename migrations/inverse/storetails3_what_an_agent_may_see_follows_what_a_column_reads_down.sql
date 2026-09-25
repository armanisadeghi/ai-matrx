-- chair-step: the INVERSE of storetails3_what_an_agent_may_see_follows_what_a_column_reads.sql.
--   Puts the two Field-row trigger functions back to the exact STORE-LEAK-FORMULA bodies that file
--   was written against, re-creates the AFTER trigger with its sensitivity-only WHEN, and drops
--   `custom.field_context_policy_floor` (with its door row) and `custom.context_policy_rank`.
--   A column the repair raised keeps its stricter word (the repair's own inverse puts it back).
-- lock: custom
-- lane: STORE-TAILS-3

set local lock_timeout = '30s';
set local statement_timeout = '120s';

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

CREATE OR REPLACE FUNCTION custom._field_sensitivity_reaches_its_readers()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  r record;
begin
  if custom.sensitivity_rank(new.data ->> 'sensitivity')
     <= custom.sensitivity_rank(old.data ->> 'sensitivity') then
    return null;                        -- only a rise travels; a lowered input lowers nothing
  end if;
  for r in
    select f.organization_id, f.id
      from custom.record f
     where f.organization_id = new.organization_id
       and f.table_id = custom.field_kernel_id()
       and f.data_class <> 'kernel'
       and f.id <> new.id
       and f.data ->> 'type' = 'formula'
       and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
       and custom.sensitivity_rank(f.data ->> 'sensitivity') < custom.sensitivity_rank(new.data ->> 'sensitivity')
       and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                    where c.input_id = new.id)
  loop
    -- The reader's own trigger (half 1) re-derives it, and its own rise travels on in turn.
    update custom.record
       set data = jsonb_set(data, '{sensitivity}', to_jsonb(new.data ->> 'sensitivity'))
     where organization_id = r.organization_id
       and id = r.id;
  end loop;
  return null;
end;
$function$;

drop trigger custom_record_field_sensitivity_reaches_its_readers on custom.record;
create trigger custom_record_field_sensitivity_reaches_its_readers
  after update on custom.record
  for each row
  when (new.table_id = '11111111-0000-4000-8000-000000000002'::uuid
        and (old.data ->> 'sensitivity') is distinct from (new.data ->> 'sensitivity'))
  execute function custom._field_sensitivity_reaches_its_readers();

delete from platform.client_callable_door
 where declared_by = 'STORE-TAILS-3' and schema_name = 'custom' and function_name = 'field_context_policy_floor';
drop function if exists custom.field_context_policy_floor(uuid, jsonb, uuid);
drop function if exists custom.context_policy_rank(text);

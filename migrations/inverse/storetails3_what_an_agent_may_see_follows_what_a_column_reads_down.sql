-- chair-step: the INVERSE of storetails3_what_an_agent_may_see_follows_what_a_column_reads.sql.
--   Puts `custom._field_reads_what_it_reads` back to the exact body that file was written against
--   (storetails3_a_worked_out_column_never_reads_itself.sql's: the circle check, no
--   agent-visibility floor) and drops `custom.field_context_policy_floor` (with its door row) and
--   `custom.context_policy_rank`. A column the repair raised keeps its stricter word (the repair's
--   own inverse puts it back).
-- lock: custom
-- lane: STORE-TAILS-3
-- ground-standing-ok: b — the body this restores calls custom.field_cycle, which the sibling inverse storetails3_a_worked_out_column_never_reads_itself_down.sql drops. The order is fixed: this file was applied AFTER that one's up, so this inverse runs FIRST; the sibling's inverse then puts back the STORE-LEAK-FORMULA body, which calls nothing it drops. Run alone, this inverse leaves field_cycle standing and called.
-- based-on: custom._field_reads_what_it_reads() 22aaa6382efe9f384d9c696a9902c7a172c9dfbd8019a31b33bacd7c53124c6f

set local lock_timeout = '2s';
set local statement_timeout = '120s';

CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
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

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  if new.deleted_at is null then
    v_path := custom.field_cycle(new.organization_id, new.data, new.id);
    if v_path is not null then
      raise exception 'The column "%" would be worked out from itself: % — so it was not saved.',
        coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
        array_to_string(v_path, ' reads ')
        using errcode = '42P17',
              hint = 'STORE-TAILS-3: a formula, lookup or rollup that reads itself round a circle has no answer. Point one of the columns in that circle at something outside it, and save again.';
    end if;
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

delete from platform.client_callable_door
 where declared_by = 'STORE-TAILS-3' and schema_name = 'custom' and function_name = 'field_context_policy_floor';
drop function if exists custom.field_context_policy_floor(uuid, jsonb, uuid);
drop function if exists custom.context_policy_rank(text);

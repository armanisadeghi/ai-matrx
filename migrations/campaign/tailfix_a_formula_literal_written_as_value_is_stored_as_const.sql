-- target: branch,production
-- additive: yes
-- TAIL-FIX, a STORE FIX for a formula the evaluator cannot read. It ADDS one function
--   (custom._formula_literal_normalised(jsonb)) and REPLACES one trigger body,
--   custom._field_reads_what_it_reads() (the trigger on custom.record that already fires only for Field
--   definition rows, before the shape guards). No trigger is created. No table, column, policy, grant or stored
--   row is touched; the one live column that carries the old spelling is corrected afterwards through
--   the column's own door (custom.field_update), not here.
--   Inverse: migrations/inverse/tailfix_a_formula_literal_written_as_value_is_stored_as_const_down.sql.
-- guard: custom/system_enabled
-- lock: custom
-- based-on: custom._field_reads_what_it_reads() 5d5ae705f31cc077940ca85aeff9543fcf7d688e6db8988294f0c14cd34bdef3
-- lane: TAIL-FIX
--
-- THE GAP. Movers' Rate Card's "Peak season rate" stored {"op":"add","args":[{"field":…},{"value":25}]}.
-- The store's evaluator (custom.formula_eval / custom.rule_eval) knows a literal only as {"const":25},
-- so every row read "This formula could not be worked out". The writer was the table-kind golden fixture
-- (apps/shared/records/scripts/table-kind-golden.ts), which wrote the leaf as `value`; the store took the
-- definition without a word.
--
-- THE RULE (validation offers, never blocks). On every write of a formula column's definition, a leaf
-- that is exactly {"value": x} is the literal {"const": x}: the store stores the canonical spelling and
-- says so in a notice. Nothing is refused. A {"const": {...}} payload is left alone.


create function custom._formula_literal_normalised(p_expr jsonb)
 returns jsonb
 language plpgsql
 immutable
 set search_path to 'pg_catalog'
as $$
declare
  v_out jsonb;
  v_k   text;
begin
  if p_expr is null then
    return null;
  end if;
  if jsonb_typeof(p_expr) = 'array' then
    select coalesce(jsonb_agg(custom._formula_literal_normalised(e) order by o), '[]'::jsonb)
      into v_out
      from jsonb_array_elements(p_expr) with ordinality as t(e, o);
    return v_out;
  end if;
  if jsonb_typeof(p_expr) <> 'object' then
    return p_expr;
  end if;
  if p_expr ? 'value' and (select count(*) from jsonb_object_keys(p_expr)) = 1 then
    return jsonb_build_object('const', p_expr -> 'value');
  end if;
  v_out := '{}'::jsonb;
  for v_k in select jsonb_object_keys(p_expr) loop
    v_out := v_out || jsonb_build_object(
      v_k,
      case when v_k = 'const' then p_expr -> v_k
           else custom._formula_literal_normalised(p_expr -> v_k) end);
  end loop;
  return v_out;
end;
$$;
comment on function custom._formula_literal_normalised(jsonb) is
  'TAIL-FIX: rewrites every leaf that is exactly {"value": x} to {"const": x} in a formula expression; a const payload is never entered.';


CREATE OR REPLACE FUNCTION custom._field_reads_what_it_reads()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_deps  jsonb;
  v_floor record;
  v_path  text[];                      -- STORE-TAILS-3: a circle this definition would close
  v_cp    record;                      -- STORE-TAILS-3: the agent-visibility floor
  r       record;
begin
  if new.table_id is distinct from custom.field_kernel_id() or new.data_class = 'kernel' then
    return new;
  end if;

  -- STORE-TAILS-3: A COLUMN AN AGENT IS NOW KEPT FROM MORE FIRMLY TAKES ITS READERS WITH IT
  -- (any column, worked out or not — Budget is a plain number). Every formula, lookup and rollup
  -- that reads it, directly or through another, is given at least the same word, here, in the
  -- write that raised it; each reader's own write passes this same trigger and carries it on.
  if tg_op = 'UPDATE'
     and custom.context_policy_rank(new.data ->> 'context_policy')
         > custom.context_policy_rank(old.data ->> 'context_policy') then
    for r in
      select f.organization_id, f.id
        from custom.record f
       where f.organization_id = new.organization_id
         and f.table_id = custom.field_kernel_id()
         and f.data_class <> 'kernel'
         and f.id <> new.id
         and f.data ->> 'type' = 'formula'
         and coalesce(f.data -> 'config', '{}'::jsonb) ?| array['expr', 'pick', 'agg']
         and custom.context_policy_rank(f.data ->> 'context_policy') < custom.context_policy_rank(new.data ->> 'context_policy')
         and exists (select 1 from custom.field_input_closure(f.organization_id, f.data, f.id) c
                      where c.input_id = new.id)
    loop
      update custom.record
         set data = jsonb_set(data, '{context_policy}', to_jsonb(new.data ->> 'context_policy'))
       where organization_id = r.organization_id
         and id = r.id;
    end loop;
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

  -- TAIL-FIX: A LITERAL SPELLED {"value": x} IS THE LITERAL {"const": x}. The evaluator knows only
  -- `const`; a column stored with `value` read "could not be worked out" on every row. The store keeps
  -- the canonical spelling (and says so) instead of refusing: validation offers, it never blocks.
  if (custom.store_is_open(new.organization_id)
      or coalesce((platform.knob_resolve('custom', 'system_enabled', new.organization_id) #>> '{}')::boolean, false))
     and jsonb_typeof(new.data -> 'config' -> 'expr') = 'object'
     and custom._formula_literal_normalised(new.data -> 'config' -> 'expr') is distinct from new.data -> 'config' -> 'expr' then
    raise notice 'the column "%" wrote a number or word as {"value": …}; the store reads that as {"const": …} and kept it that way',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key');
    new.data := jsonb_set(new.data, '{config,expr}', custom._formula_literal_normalised(new.data -> 'config' -> 'expr'));
  end if;

  -- STORE-TAILS-3: A COLUMN THAT WOULD READ ITSELF IS NOT SAVED. The walk starts from the
  -- definition being written (not the stored one) and comes back to this column's id through
  -- whatever reads it — by id, or by key for a lookup's far column and the older formula shape.
  -- TABLE-ACTIONS: a column custom.table_duplicate copies is not walked for a circle. The graph
  -- is the source's, already proven acyclic when its columns were saved, and the copy remaps it
  -- one to one (every id it reads becomes the copy's own), so the walk could only say "no" —
  -- at 5-6 s a computed column in a large organization. Marked by the copy's own transaction-
  -- local setting, which no client can set (set_config is no client door).
  if new.deleted_at is null
     and coalesce(current_setting('custom.table_duplicate_into', true), '') is distinct from new.data ->> 'entity_definition_id' then
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

  -- STORE-TAILS-3: WHAT AN AGENT MAY SEE FOLLOWS WHAT THE COLUMN READS, the same way sensitivity
  -- does. A column worked out from one the organization keeps out of conversations (`exclude`),
  -- gives an agent only on request, or only as a summary, is kept from an agent at least as
  -- firmly — raised to the strictest word among everything it reads, never lowered here.
  select * into v_cp
    from custom.field_context_policy_floor(new.organization_id, new.data, new.id);
  if v_cp.context_policy is not null
     and custom.context_policy_rank(new.data ->> 'context_policy') < custom.context_policy_rank(v_cp.context_policy) then
    raise notice 'the column "%" reads %, which an agent is given as "%", so an agent is given it as "%" too (it was "%")',
      coalesce(nullif(new.data ->> 'label', ''), new.data ->> 'key'),
      (select string_agg(format('"%s"', e ->> 'label'), ', ') from jsonb_array_elements(v_cp.reads) e),
      v_cp.context_policy, v_cp.context_policy, coalesce(new.data ->> 'context_policy', 'nothing');
    new.data := jsonb_set(new.data, '{context_policy}', to_jsonb(v_cp.context_policy));
  end if;
  return new;
end;
$function$
;

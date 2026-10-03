-- chair-step: the INVERSE of migrations/campaign/chairmath_a_a_formula_reads_a_worked_out_column.sql.
--   It restores the three bodies exactly as they stood on production on 2026-10-03 before that file
--   (`custom.formula_value`, `custom.derived_values_of`, `custom.formula_compile_sql`) and drops the
--   helper it added (`custom.formula_field_keys`). Nothing else is touched.
--   Hazard 4 (chair guidance): re-base these bodies on production's current ones before running
--   this after any later file has replaced them.
--
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) 3603e71be2dc6fc80f59dd2e4eb621426a4681e241f729ac12cadecad917dc44
-- based-on: custom.derived_values_of(custom.record) adbbedc37c37a94f7cdffbe36a602fb3535c19923dc65200d3c0a85dd1f8e471
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) 7daf5d8d9e252341c9d972853de496d5561c7e51e89e3798767748fece63cae7

CREATE OR REPLACE FUNCTION custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_values jsonb := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
begin
  -- REC-15's evaluator, not a second one: every Rule node, every refusal and REC-17's
  -- "by id, never by name" still come from custom.rule_eval, which custom.formula_eval hands
  -- them to unchanged. GRID-PRIMITIVES G3 adds the formula language's own `fx.*` nodes, and
  -- the three facts only a formula about ITS OWN record can use (its id, its column, its table:
  -- autonumber and the created / modified stamps). They ride under fx_* keys so no Rule node
  -- that reads the context (stage_count, sibling_count read `table_id`) answers differently.
  return custom.formula_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                             v_values,
                             coalesce(custom.rule_context(p_organization_id, p_record_id), '{}'::jsonb)
                             || jsonb_build_object('fx_self_id', p_record_id,
                                                   'fx_field_key', p_field_data ->> 'key',
                                                   'fx_table_id', p_field_data ->> 'entity_definition_id'));
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.derived_values_of(v_rec custom.record)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_out   jsonb := '{}'::jsonb;
  f       custom.record;
  v_rtype text;
  v_key   text;
  v_plain jsonb;
begin
  if v_rec.id is null or v_rec.table_id is null
     or v_rec.data_class in ('kernel', 'relation') then
    return '{}'::jsonb;
  end if;

  -- WHAT WAS STAMPED AT WRITE TIME comes back exactly as it was stamped (FLD-9: the
  -- declaration says WHEN it is worked out, and a `write` formula is a fact about the
  -- moment it was saved).
  v_out := custom.computed_block(v_rec.data -> '_derived');

  -- 🚨 THE VALUES A READ-TIME FORMULA IS EVALUATED AGAINST ARE ASSEMBLED HERE AND PASSED
  -- IN, never fetched by the evaluator. `custom.record_values` calls THIS body, so a
  -- formula that re-entered it for its own record's values would recurse until the stack
  -- ran out — a crash instead of an answer. The values are the document, plus W1-RULE's
  -- computed block, plus what was stamped at write time: everything that is knowable
  -- without asking this function again.
  v_plain := (v_rec.data - '_computed' - '_retired' - '_values' - '_sources' - '_derived')
             || custom.computed_block(v_rec.data -> '_computed')
             || v_out;

  v_key := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
  if v_key is not null then
    v_rtype := v_rec.data ->> v_key;
  end if;

  -- AND WHAT IS WORKED OUT ON READ is worked out now, every time, from what is there now.
  for f in select * from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'read' then
      v_out := v_out || jsonb_build_object(f.data ->> 'key',
                          custom.derived_value(v_rec.organization_id, v_rec.id, f.data, v_plain));
    end if;
  end loop;
  return v_out;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op   text;
  v_args jsonb;
  v_n    integer;
  v_spec record;
  v_key  text;
  v_type text;
  v_leaf text;
  v_a    text;
  v_b    text;
begin
  -- A FORMULA, PLANNED ONCE PER QUERY (VISION-REACH W3, 2026-10-02). custom.formula_eval works a
  -- formula out one record at a time, and on every record it looks each referenced Field up again,
  -- re-reads the node catalogue and walks custom.rule_eval: ~3.6 ms a record, so the grid's summary
  -- bar over a 5,000-row table took 18 s. For the one shape that is most of what people write —
  -- ARITHMETIC (+ − × ÷ % ROUND and unary minus) over columns and constants — this returns ONE SQL
  -- expression (numeric) over the row's values (`p_values_sql`, a jsonb expression), with every
  -- lookup done here, once. Anything else returns NULL and the caller keeps custom.formula_eval:
  -- this never guesses, so every function lane VIEWS-AND-FIELDS adds is still worked out by the one
  -- evaluator.
  --
  -- IDENTICAL BY CONSTRUCTION to custom.formula_eval for this subset, node by node:
  --   a column  -> formula_eval's field branch (a list or object reads as its JSON text; a list or
  --                relation column is NOT compiled, its words come from custom.field_words) fed to
  --                custom._fx_loose, the same parser custom._fx_num uses;
  --   a constant-> custom._fx_loose of the constant;
  --   + − × % ROUND −x -> the same numeric operators; ÷ and % keep trim_scale;
  --   an argument that is not a number (custom._fx_num would raise) or a divisor of 0 is SQL NULL,
  --   and NULL carries to the top — exactly what custom.derived_value answers when formula_eval
  --   raises (the column is empty on that read). Every node here is strict, so "one argument failed"
  --   and "the whole formula failed" are the same answer.
  -- Proven on the clone: equal to custom.derived_value on every record of every compilable formula
  -- Field (scripts/campaign-tests/visionreach_w3_formula_compile_equality.sql).
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return null;
  end if;

  -- A constant: exactly {"const": …}.
  if (select array_agg(k order by k) from jsonb_object_keys(p_expr) k) = array['const'] then
    return format('custom._fx_loose(%L::jsonb)', (p_expr -> 'const')::text);
  end if;

  -- A column: exactly {"field": "<id>"}.
  if (select array_agg(k order by k) from jsonb_object_keys(p_expr) k) = array['field'] then
    if jsonb_typeof(p_expr -> 'field') <> 'string'
       or (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'field')::uuid);
    if v_key is null then
      return null;
    end if;
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return null;
    end if;
    v_leaf := format('(%s -> %L)', p_values_sql, v_key);
    -- A stored number is read straight (custom._fx_loose's own first answer for a JSON number,
    -- without a function call per row); anything else goes through custom._fx_loose itself.
    return format('(case when jsonb_typeof(%1$s) = ''number'' then (%1$s #>> ''{}'')::numeric '
                  'else custom._fx_loose(case when jsonb_typeof(%1$s) in (''array'', ''object'') '
                  'then to_jsonb((%1$s)::text) else %1$s end) end)',
                  v_leaf);
  end if;

  if (select array_agg(k order by k) from jsonb_object_keys(p_expr) k) <> array['args', 'op'] then
    return null;
  end if;
  v_op := p_expr ->> 'op';
  if v_op is null or v_op not in ('fx.add', 'fx.sub', 'fx.mul', 'fx.div', 'fx.mod', 'fx.neg', 'fx.round') then
    return null;
  end if;
  v_args := p_expr -> 'args';
  if jsonb_typeof(v_args) <> 'array' then
    return null;
  end if;
  v_n := jsonb_array_length(v_args);
  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null or v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    return null;
  end if;

  v_a := custom.formula_compile_sql(p_organization_id, v_args -> 0, p_values_sql);
  if v_a is null then
    return null;
  end if;
  if v_n > 1 then
    v_b := custom.formula_compile_sql(p_organization_id, v_args -> 1, p_values_sql);
    if v_b is null then
      return null;
    end if;
  end if;

  return case v_op
    when 'fx.add' then format('(%s + %s)', v_a, v_b)
    when 'fx.sub' then format('(%s - %s)', v_a, v_b)
    when 'fx.mul' then format('(%s * %s)', v_a, v_b)
    when 'fx.div' then format('trim_scale(%s / nullif(%s, 0))', v_a, v_b)
    when 'fx.mod' then format('trim_scale(mod(%s, nullif(%s, 0)))', v_a, v_b)
    when 'fx.neg' then format('(- %s)', v_a)
    when 'fx.round' then case when v_n > 1
                              then format('round(%s, (trunc(%s))::integer)', v_a, v_b)
                              else format('round(%s, 0)', v_a) end
  end;
end;
$function$

;

drop function if exists custom.formula_field_keys(uuid, jsonb);

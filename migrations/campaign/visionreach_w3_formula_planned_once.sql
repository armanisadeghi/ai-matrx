-- target: branch,production
-- additive: yes
--   It ADDS one helper, `custom.formula_compile_sql(uuid, jsonb, text)` (EXECUTE to postgres only,
--   as the store's event trigger leaves every new custom function), and REPLACES one body, declared
--   below with the body it was written against. custom.formula_eval and every formula function are
--   NOT touched. No table, column, trigger, policy, grant or row of anybody's data is touched.
--   Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w3_formula_planned_once_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.agg_field_value_sql(uuid, uuid, text) 8d2989994cec09199217033e8fd93b00d0edebff5eeda3c8d02b1c5217c9ffe6
--
-- LANE 5 VISION-REACH, WAVE 3 — A FORMULA COLUMN IS ADDED UP IN UNDER A SECOND, NOT EIGHTEEN.
--
-- THE DEFECT (measured on the clone 2026-10-02, a 5,000-visit Cedar Ridge ledger,
-- scripts/campaign-tests/_visionreach_w3_visit_ledger_fixture.sql): the grid's summary bar over the
-- formula column "Expected copay total" ({Copay} * {Sessions authorized}) took 17.9–19.5 s (the
-- stored Copay column: 0.4 s), past the signed-in statement timeout. Profiled per record:
-- custom.rule_eval for each column reference 0.6 ms (custom.rule_field_key and the node checks,
-- every row), a Field-type look-up per reference, custom.formula_node_kinds() per node, and the
-- value assembly — ~3.6 ms a record, all of it the SAME work on every record.
--
-- THE FIX: plan the formula ONCE per query. custom.formula_compile_sql writes arithmetic over
-- columns and constants (+ − × ÷ % ROUND, unary minus) as one SQL expression with every look-up
-- done at planning time; custom.agg_field_value_sql (wave 2's one question, which the aggregate,
-- the filter, the date period and the window all ask) uses it when it can and keeps the per-row
-- custom.derived_value path for every other shape. Identical answers are proven on every record of
-- every plannable formula Field on the clone (scripts/campaign-tests/visionreach_w3_formula_compile_equality.sql).

create function custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
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
$function$;

CREATE OR REPLACE FUNCTION custom.agg_field_value_sql(p_organization_id uuid, p_table_id uuid, p_key text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_field jsonb;
  v_sql   text;
begin
  -- THE ONE QUESTION, asked once per call and never per row: is this key a WORKED-OUT column of this
  -- table (a formula, a lookup, a roll-up or a Rule-filled column — all of them Fields of type
  -- `formula`)? Then its value is the read path's own answer for the row `r`. Otherwise it is the
  -- stored value, read exactly as custom.agg_value_sql always read it.
  if p_table_id is not null then
    select f.data into v_field
      from custom.record f
     where f.organization_id = p_organization_id
       and f.table_id = custom.field_kernel_id()
       and f.deleted_at is null
       and (f.data ->> 'entity_definition_id')::uuid = p_table_id
       and f.data ->> 'key' = custom.agg_assert_key(p_key)
       and f.data ->> 'type' = 'formula'
     limit 1;
  end if;
  if v_field is null then
    return custom.agg_value_sql(p_key);
  end if;

  -- THE COMMON CASE, WITHOUT THE PER-ROW LOOK-UPS: a column worked out ON READ, on a table whose
  -- columns do not depend on a record's type, applying to every record. Its definition is the same
  -- for every row, so it is read here once and handed to custom.derived_value — the call
  -- custom.record_value_one makes — with the row's values assembled exactly as record_value_one
  -- assembles them (the document, the Rule layer's block, what was stamped at write time). Measured
  -- on the clone, 2026-10-02: record_value_one's own re-fetch and field look-up were ~1.5 ms of
  -- ~4.3 ms a row.
  if custom.parity_type(v_field) in ('formula', 'lookup', 'rollup')
     and coalesce(v_field ->> 'compute_on', '') = 'read'
     and jsonb_array_length(coalesce(v_field -> 'applies_to_types', '[]'::jsonb)) = 0
     and custom.table_type_field(p_organization_id, p_table_id) is null then
    -- VISION-REACH W3 (2026-10-02): PLANNED ONCE, NOT WORKED OUT PER ROW. When the formula is
    -- arithmetic over columns and constants, custom.formula_compile_sql writes it as ONE SQL
    -- expression over the same assembled values custom.derived_value is handed below — identical
    -- answers, measured ~18 s -> under a second for 5,000 visits. Any other shape returns NULL
    -- here and keeps the per-row path, unchanged.
    if custom.parity_type(v_field) = 'formula' then
      v_sql := custom.formula_compile_sql(p_organization_id, v_field -> 'config' -> 'expr',
        '(case when r.data ? ''_computed'' or r.data ? ''_derived'' '
        'then (r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
        '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'') '
        'else r.data end)');
      if v_sql is not null then
        return format('custom.agg_value_text(to_jsonb(%s))', v_sql);
      end if;
    end if;
    return format(
      'custom.agg_value_text(custom.derived_value(%L::uuid, r.id, %L::jsonb, '
      '(r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
      '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'')))',
      p_organization_id, v_field);
  end if;
  -- Everything else (a column stamped at write time, a Rule-filled column, a typed table) asks the
  -- read path's one-column answer itself.
  return format('custom.agg_value_text(custom.record_value_one(%L::uuid, r.id, %L))',
                p_organization_id, p_key);
end;
$function$;

-- additive: yes
--
-- chair-step: it REPLACES `custom.formula_value`, `custom.derived_values_of` and
--   `custom.formula_compile_sql` — three function bodies — and ADDS one helper,
--   `custom.formula_field_keys`. Nothing is dropped, nothing is revoked, no row of anybody's data
--   is touched. The inverse is `migrations/inverse/chairmath_a_a_formula_reads_a_worked_out_column_down.sql`.
--
-- CHAIR-MATH (a) — A FORMULA THAT READS A WORKED-OUT COLUMN READS ITS ANSWER, NOT A BLANK.
--
-- THE DEFECT (lane 8 TEMPLATES, 2026-10-03): "{Visit charges} + 1" answered 1 on every row of the
-- clone while the Visit charges roll-up itself answered 125. Formulas over STORED columns were fine.
--
-- ROOT CAUSE. Every formula is evaluated against a values document the CALLER assembles and hands
-- in (`custom.derived_values_of`, `custom.record_value_one`, `custom.agg_field_value_sql`), and that
-- document is the stored row plus the Rule layer's block plus what was stamped at write time —
-- never the OTHER read-time worked-out columns of the same record. A roll-up, a lookup or a read-time
-- formula has no stored value, so the key is absent, `custom._fx_loose` reads an absence as 0
-- (looseNumber, by design), and 0 + 1 = 1. `custom.formula_compile_sql` compiled the same read as a
-- stored-document read over `r.data`, so the planned-once path on the grid's summary bar and on
-- filters answered the same 1.
--
-- THE FIX, FOR THE CLASS (roll-up, lookup AND a formula that reads another formula):
--   1. `custom.formula_field_keys(org, expr)` — the keys of every `{"field": <id>}` a formula reads.
--   2. `custom.formula_value` resolves, before it evaluates, every referenced key that is a read-time
--      worked-out column of this record and is ABSENT from the values it was handed — through
--      `custom.far_value`, the one cycle-guarded reader (STORE-TAILS-3), so A↔B still refuses with
--      its sentence instead of recursing. Every caller that hands values in is corrected at once.
--   3. `custom.derived_values_of` works the lookups and roll-ups out first, then the formulas in
--      dependency order, feeding each answer into the values the next one reads — so the common
--      case never pays the on-demand re-read at all, and a stale stored value under a worked-out
--      column's key can no longer shadow the worked-out answer.
--   4. `custom.formula_compile_sql` declines (returns NULL) a formula that reads a read-time
--      worked-out column, which hands that formula to the per-row path above. A formula stamped at
--      write time is still in `_derived` and still compiles.
--
-- GUARD: scripts/campaign-tests/chairmath_a_green.sql — red before this file (1, 1, 1), green after
-- (126, 126, 251): a formula over a roll-up, over a lookup, and over a formula over a roll-up.
--
-- based-on: custom.formula_value(uuid, uuid, jsonb, jsonb) 67c106584e2fc938da29300c14fa11b30b6444e7e4cbf022eba37c1046db8c6d
-- based-on: custom.derived_values_of(custom.record) 6f692f50e9dcfda06b63eeff0a918dc7cb2a1f42ba2dd0b62f8c01b64942240a
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) 4e86c988f7c4824816547e54c529d5e14c57215339f19da93860e290c93376b2

create or replace function custom.formula_field_keys(p_organization_id uuid, p_expr jsonb)
returns text[]
language sql
stable
set search_path to 'pg_catalog'
as $function$
  -- THE COLUMNS A FORMULA READS, BY KEY. Every `{"field": "<id>"}` node anywhere in the expression
  -- (the same walk `custom.field_inputs_of` makes), resolved to the Field's key by id (REC-17). A
  -- reference to a Field that no longer exists resolves to nothing and is simply not listed.
  select coalesce(array_agg(distinct k), '{}'::text[])
    from (
      select custom.rule_field_key(p_organization_id, (v #>> '{}')::uuid) as k
        from jsonb_path_query(
               case when jsonb_typeof(p_expr) in ('object', 'array') then p_expr else 'null'::jsonb end,
               'strict $.**.field') v
       where jsonb_typeof(v) = 'string'
         and (v #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    ) s
   where k is not null;
$function$;

create or replace function custom.formula_value(p_organization_id uuid, p_record_id uuid, p_field_data jsonb, p_values jsonb default null::jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_values jsonb := coalesce(p_values, custom.record_values(p_organization_id, p_record_id));
  v_rec    custom.record;
  v_rtype  text;
  v_tf     text;
  v_key    text;
  v_keys   text[];
begin
  -- REC-15's evaluator, not a second one: every Rule node, every refusal and REC-17's
  -- "by id, never by name" still come from custom.rule_eval, which custom.formula_eval hands
  -- them to unchanged. GRID-PRIMITIVES G3 adds the formula language's own `fx.*` nodes, and
  -- the three facts only a formula about ITS OWN record can use (its id, its column, its table:
  -- autonumber and the created / modified stamps). They ride under fx_* keys so no Rule node
  -- that reads the context (stage_count, sibling_count read `table_id`) answers differently.
  --
  -- CHAIR-MATH (a): A WORKED-OUT COLUMN THIS FORMULA READS IS WORKED OUT FIRST. The values a
  -- caller hands in are the stored row, the Rule layer's block and what was stamped at write
  -- time; a roll-up, a lookup or another read-time formula is none of those, so its key is
  -- absent and the evaluator read it as blank (0). Each such key is resolved here through
  -- custom.far_value — the one reader that refuses a circle by sentence instead of recursing —
  -- and only when it is absent, so a caller that already worked it out (custom.derived_values_of
  -- in dependency order) pays nothing more.
  if p_values is not null and p_record_id is not null then
    v_keys := custom.formula_field_keys(p_organization_id, p_field_data -> 'config' -> 'expr');
    if cardinality(v_keys) > 0 then
      select * into v_rec from custom.record
       where organization_id = p_organization_id and id = p_record_id;
      if v_rec.id is not null and v_rec.table_id is not null
         and v_rec.data_class not in ('kernel', 'relation') then
        v_tf := custom.table_type_field(v_rec.organization_id, v_rec.table_id);
        if v_tf is not null then
          v_rtype := v_rec.data ->> v_tf;
        end if;
        for v_key in
          select a.data ->> 'key'
            from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) a
           where (a.data ->> 'key') = any (v_keys)
             and (a.data ->> 'key') is distinct from (p_field_data ->> 'key')
             and custom.parity_type(a.data) in ('lookup', 'rollup', 'formula')
             and coalesce(a.data ->> 'compute_on', '') = 'read'
             and not (v_values ? (a.data ->> 'key'))
        loop
          v_values := v_values || jsonb_build_object(v_key,
                        custom.far_value(p_organization_id, p_record_id, v_key, p_field_data));
        end loop;
      end if;
    end if;
  end if;

  return custom.formula_eval(p_organization_id, p_field_data -> 'config' -> 'expr',
                             v_values,
                             coalesce(custom.rule_context(p_organization_id, p_record_id), '{}'::jsonb)
                             || jsonb_build_object('fx_self_id', p_record_id,
                                                   'fx_field_key', p_field_data ->> 'key',
                                                   'fx_table_id', p_field_data ->> 'entity_definition_id'));
end;
$function$;

create or replace function custom.derived_values_of(v_rec custom.record)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_out      jsonb := '{}'::jsonb;
  f          custom.record;
  v_rtype    text;
  v_key      text;
  v_plain    jsonb;
  v_one      jsonb;
  v_formulas jsonb[] := '{}';
  v_pending  jsonb[];
  v_keys     text[];
  v_pkeys    text[];
  v_doc      jsonb;
  v_moved    boolean;
  v_i        integer;
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
  --
  -- CHAIR-MATH (a): IN AN ORDER A FORMULA CAN READ. A formula that read a roll-up, a lookup or
  -- another read-time formula of the same record found its key absent from `v_plain` and read it
  -- as blank — "{Visit charges} + 1" was 1 on every row. So: (1) a stale stored value under a
  -- worked-out column's key is dropped from the values, so it can never shadow the answer; (2)
  -- the lookups and roll-ups are worked out first and their answers fed into the values; (3) the
  -- formulas follow in dependency order (a formula waits for the formulas it reads), each answer
  -- fed in before the next; (4) a circle among formulas is left to custom.formula_value, which
  -- reads through custom.far_value and is refused there by sentence (STORE-TAILS-3), never looped.
  for f in select * from custom.applicable_fields(v_rec.organization_id, v_rec.table_id, v_rtype) loop
    if custom.parity_type(f.data) in ('lookup', 'rollup', 'formula')
       and coalesce(f.data ->> 'compute_on', '') = 'read' then
      v_plain := v_plain - (f.data ->> 'key');
      if custom.parity_type(f.data) = 'formula' then
        v_formulas := v_formulas || f.data;
      else
        v_one := custom.derived_value(v_rec.organization_id, v_rec.id, f.data, v_plain);
        v_out := v_out || jsonb_build_object(f.data ->> 'key', v_one);
        v_plain := v_plain || jsonb_build_object(f.data ->> 'key', v_one);
      end if;
    end if;
  end loop;

  v_pending := v_formulas;
  while cardinality(v_pending) > 0 loop
    select coalesce(array_agg(d ->> 'key'), '{}'::text[]) into v_pkeys from unnest(v_pending) d;
    v_moved := false;
    v_formulas := '{}';
    foreach v_doc in array v_pending loop
      v_keys := custom.formula_field_keys(v_rec.organization_id, v_doc -> 'config' -> 'expr');
      if not exists (select 1 from unnest(v_keys) k
                      where k = any (v_pkeys) and k is distinct from (v_doc ->> 'key')) then
        v_one := custom.derived_value(v_rec.organization_id, v_rec.id, v_doc, v_plain);
        v_out := v_out || jsonb_build_object(v_doc ->> 'key', v_one);
        v_plain := v_plain || jsonb_build_object(v_doc ->> 'key', v_one);
        v_moved := true;
      else
        v_formulas := v_formulas || v_doc;
      end if;
    end loop;
    v_pending := v_formulas;
    exit when not v_moved;
  end loop;
  -- The circle, if any: each is evaluated with what there is; the reader it goes through refuses
  -- the loop by name (custom.far_value) and custom.derived_value leaves that column empty, warned.
  foreach v_doc in array v_pending loop
    v_one := custom.derived_value(v_rec.organization_id, v_rec.id, v_doc, v_plain);
    v_out := v_out || jsonb_build_object(v_doc ->> 'key', v_one);
    v_plain := v_plain || jsonb_build_object(v_doc ->> 'key', v_one);
  end loop;
  return v_out;
end;
$function$;

create or replace function custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
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
  v_when text;
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
  --
  -- CHAIR-MATH (a): A COLUMN WORKED OUT ON READ IS NOT IN THE ROW'S VALUES. A roll-up, a lookup or
  -- a read-time formula has no stored value, so compiling its read as `p_values_sql -> key` read an
  -- absence (0). Such a formula is NOT compiled: NULL hands it to the per-row path, where
  -- custom.formula_value now works the referenced column out first. A formula stamped at write
  -- time is in the `_derived` block the caller's `p_values_sql` already includes, and still compiles.
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
    select f.data ->> 'type', coalesce(f.data ->> 'compute_on', '') into v_type, v_when
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return null;
    end if;
    if v_type = 'formula' and v_when = 'read' then
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

-- The helper is reached only from inside the store's own readers, like every other `custom.*`
-- helper (postgres=X): the client roles never call it directly.
revoke all on function custom.formula_field_keys(uuid, jsonb) from public;

-- Inverse of migrations/campaign/formula2_a_notion_list_functions_let_and_more_date_units.sql: restores the six replaced bodies to what they were and drops the helpers it added.
-- A formula column already saved with a list function keeps its stored expression and reads empty (formula_eval refuses an unknown
-- node by name) until this is applied forward again.
-- lane: FORMULA-2
-- guard: custom/system_enabled
-- chair-step: restores six live function bodies in one transaction after a list-function release; run only by the owning session

CREATE OR REPLACE FUNCTION custom._nfx_colkind(p_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case
    when p_type in ('text', 'long_text', 'rich_text', 'email', 'url', 'phone', 'choice', 'status') then 'text'
    when p_type in ('number', 'integer', 'decimal', 'currency', 'percent', 'rating', 'duration', 'autonumber') then 'number'
    when p_type = 'checkbox' then 'boolean'
    when p_type in ('date', 'datetime', 'created_time', 'modified_time') then 'date'
    else 'any' end
$function$;

CREATE OR REPLACE FUNCTION custom._nfx_primary(p_t jsonb, p_i integer, p_types jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_tok jsonb := p_t -> p_i;
  v_k text := v_tok ->> 'k';
  v_v text := v_tok ->> 'v';
  v_i integer := p_i + 1;
  v_r jsonb;
  v_c jsonb;
begin
  if v_k = 'num' then
    return jsonb_build_object('s', v_v, 'k', 'number', 'i', v_i);
  elsif v_k = 'str' then
    return jsonb_build_object('s', '"' || replace(replace(v_v, '\', '\\'), '"', '\"') || '"', 'k', 'text', 'lit', v_v, 'i', v_i);
  elsif v_k = 'op' and v_v = '(' then
    v_r := custom._nfx_expr(p_t, v_i, 0, p_types);
    if p_t -> ((v_r ->> 'i')::integer) <> '{"k": "op", "v": ")"}'::jsonb then
      raise exception 'expected ")" in the formula' using errcode = '22023';
    end if;
    return jsonb_build_object('s', v_r ->> 's', 'k', v_r ->> 'k', 'n', coalesce(v_r -> 'n', '[]'::jsonb), 'i', (v_r ->> 'i')::integer + 1);
  elsif v_k = 'id' then
    if v_v in ('true', 'false') then
      return jsonb_build_object('s', upper(v_v), 'k', 'boolean', 'i', v_i);
    end if;
    if p_t -> v_i = '{"k": "op", "v": "("}'::jsonb then
      v_r := custom._nfx_arglist(p_t, v_i, p_types);
      v_c := custom._nfx_call(v_v, v_r -> 'args', p_types);
      return v_c || jsonb_build_object('i', (v_r ->> 'i')::integer);
    end if;
    if v_v in ('current', 'index', 'acc') then
      raise exception 'it works through a list item by item (current / index), which the table''s formulas do not have' using errcode = '22023';
    end if;
    raise exception '"%" is a name Notion formulas only allow in a function call or as true/false', v_v using errcode = '22023';
  end if;
  raise exception 'unexpected "%" where a value should start', v_v using errcode = '22023';
end
$function$;

CREATE OR REPLACE FUNCTION custom._nfx_call(p_name text, p_args jsonb, p_types jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  low text := lower(p_name);
  c integer := jsonb_array_length(p_args);
  a jsonb[] := array(select e from jsonb_array_elements(p_args) e);
  notes jsonb := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(p_args) e, jsonb_array_elements(coalesce(e -> 'n', '[]'::jsonb)) x);
  s text;
  k text := 'any';
  v_lit text;
  v_unit text;
  v_key text;
  v_spec text[];
  v_factor integer;
  v_n text;
  v_all text;
  i integer;
begin
  select string_agg(e ->> 's', ', ' order by ord) into v_all from jsonb_array_elements(p_args) with ordinality t(e, ord);

  if low = 'prop' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[1] ->> 'lit';
    if v_lit is null then raise exception 'prop() names its column with something other than plain text' using errcode = '22023'; end if;
    if position('}' in v_lit) > 0 or position('{' in v_lit) > 0 then
      raise exception 'the column name "%" holds a brace, which a formula cannot name', v_lit using errcode = '22023';
    end if;
    return jsonb_build_object('s', '{' || v_lit || '}', 'k', custom._nfx_colkind(p_types ->> v_lit), 'n', notes);
  end if;

  if low = 'if' then
    if c not between 2 and 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'IF(' || v_all || ')'; k := 'any';
  elsif low = 'ifs' then
    if c < 3 or c % 2 = 0 then
      raise exception 'ifs() needs pairs of condition and value, then a last value' using errcode = '22023';
    end if;
    s := a[c] ->> 's';
    i := c - 2;
    while i >= 1 loop
      s := 'IF(' || (a[i] ->> 's') || ', ' || (a[i + 1] ->> 's') || ', ' || s || ')';
      i := i - 2;
    end loop;
    k := 'any';
  elsif low in ('and', 'or') then
    if c < 2 then raise exception '%() needs two or more conditions', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'boolean';
  elsif low = 'not' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'NOT(' || v_all || ')'; k := 'boolean';
  elsif low = 'concat' then
    if c = 0 then raise exception 'concat() has nothing to join' using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low in ('format', 'tostring') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'CONCATENATE(' || v_all || ')'; k := 'text';
  elsif low = 'contains' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('contains(): the table''s CONTAINS ignores upper/lower case; Notion''s does not.'::text);
    s := 'CONTAINS(' || v_all || ')'; k := 'boolean';
  elsif low in ('replace', 'replaceall') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_lit := a[2] ->> 'lit';
    if v_lit is null or v_lit ~ '[\\^$.|?*+()\[\]{}]' then
      raise exception '%() uses a pattern (regular expression), not a plain piece of text', p_name using errcode = '22023';
    end if;
    s := 'SUBSTITUTE(' || v_all || case when low = 'replace' then ', 1' else '' end || ')'; k := 'text';
  elsif low = 'test' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'REGEX_MATCH(' || v_all || ')'; k := 'boolean';
  elsif low = 'length' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'LEN(' || v_all || ')'; k := 'number';
  elsif low in ('lower', 'upper', 'trim') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'text';
  elsif low = 'empty' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ISBLANK(' || v_all || ')'; k := 'boolean';
  elsif low in ('now', 'today') then
    if c <> 0 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '()'; k := 'date';
  elsif low in ('dateadd', 'datesubtract') then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'month' then array['months', '1'] when 'year' then array['years', '1'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    v_n := a[2] ->> 's';
    if v_factor <> 1 then v_n := '(' || v_n || ' * ' || v_factor || ')'; end if;
    if low = 'datesubtract' then v_n := '(-' || v_n || ')'; end if;
    s := 'DATEADD(' || (a[1] ->> 's') || ', ' || v_n || ', "' || v_spec[1] || '")'; k := 'date';
  elsif low = 'datebetween' then
    if c <> 3 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    v_unit := a[3] ->> 'lit';
    if v_unit is null then raise exception 'its date unit is not a plain word like "days"' using errcode = '22023'; end if;
    v_key := rtrim(lower(v_unit), 's');
    v_spec := case v_key when 'day' then array['days', '1'] when 'week' then array['days', '7']
                         when 'hour' then array['hours', '1'] when 'minute' then array['minutes', '1'] end;
    if v_spec is null then
      raise exception 'its date unit "%" is not one the table''s date functions have', v_unit using errcode = '22023';
    end if;
    v_factor := v_spec[2]::integer;
    s := 'DATEDIFF(' || (a[2] ->> 's') || ', ' || (a[1] ->> 's') || ', "' || v_spec[1] || '")';
    if v_factor <> 1 then s := '(' || s || ' / ' || v_factor || ')'; end if;
    k := 'number';
  elsif low = 'formatdate' then
    if c <> 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DATETIME_FORMAT(' || v_all || ')'; k := 'text';
  elsif low in ('year', 'month') then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'date' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'DAY(' || v_all || ')'; k := 'number';
  elsif low = 'round' then
    if c not between 1 and 2 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ROUND(' || v_all || ')'; k := 'number';
  elsif low = 'abs' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    s := 'ABS(' || v_all || ')'; k := 'number';
  elsif low in ('min', 'max', 'sum') then
    if c = 0 then raise exception '%() has no values', p_name using errcode = '22023'; end if;
    s := upper(low) || '(' || v_all || ')'; k := 'number';
  elsif low = 'tonumber' then
    if c <> 1 then raise exception '%() was given % values', p_name, c using errcode = '22023'; end if;
    notes := notes || to_jsonb('toNumber(): worked out as the value times 1.'::text);
    s := '(' || v_all || ' * 1)'; k := 'number';
  else
    raise exception 'it uses %(), which the table''s formulas do not have', p_name using errcode = '22023';
  end if;
  return jsonb_build_object('s', s, 'k', k, 'n', notes);
end
$function$;

CREATE OR REPLACE FUNCTION custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_keys text[];
  v_op   text;
  v_args jsonb;
  v_n    integer;
  v_spec record;
  v_key  text;
  v_type text;
  v_when text;
  v_leaf text;
  v_one  text;
  v_sql  text[] := '{}';
  v_i    integer;
  v_self text;
begin
  -- A FORMULA, PLANNED ONCE PER QUERY (VISION-REACH W3 arithmetic, W5 everything common, 2026-10-02).
  -- custom.formula_eval works a formula out one record at a time and on every record looks each
  -- referenced Field up again, re-reads the node catalogue and walks custom.rule_eval: ~4–8 ms a
  -- record, so a filter on "Copay tier" (an IF) took 42 s over 5,000 visits. This returns ONE SQL
  -- expression (jsonb — exactly custom.formula_eval's answer; SQL NULL where formula_eval would
  -- raise, which custom.derived_value reads as an empty column) over the row's values
  -- (`p_values_sql`, a jsonb expression), with every look-up done here, once.
  --
  -- PLANNED (custom._fxc_apply, whose branches are formula_eval's own): columns, constants,
  -- arithmetic (+ − × ÷ % ROUND ABS, unary minus, SUM MIN MAX AVERAGE), comparisons
  -- (= != < <= > >=), IF AND OR NOT ISBLANK BLANK, text (CONCATENATE and &, UPPER LOWER TRIM LEN
  -- LEFT RIGHT CONTAINS) and dates (DATEADD DATEDIFF YEAR MONTH DAY TODAY NOW).
  -- HANDED BACK, PART BY PART (custom._fxc_eval): every other formula function and a list or
  -- relation column — custom.formula_eval works out just that part, from the row's values, so a
  -- function lane VIEWS-AND-FIELDS adds is answered by the one evaluator and the rest of the
  -- formula is still planned.
  -- NOT PLANNED AT ALL (NULL here; the caller keeps custom.derived_value for the whole formula):
  -- a formula with any part that reads more of the record than its values — a Rule node (a
  -- parent's column, a count of siblings, who is acting) or AUTONUMBER / CREATED_TIME /
  -- MODIFIED_TIME — because those need the record's context, built per row.
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return null;
  end if;
  if not custom._fxc_context_free(p_expr) then
    return null;
  end if;
  v_self := format('custom._fxc_eval(%L::uuid, %L::jsonb, %s)', p_organization_id, p_expr::text, p_values_sql);
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_expr) k;

  -- A constant: exactly {"const": …} — custom.rule_eval answers the constant itself.
  if v_keys = array['const'] then
    return format('%L::jsonb', (p_expr -> 'const')::text);
  end if;

  -- A column: exactly {"field": "<id>"} — formula_eval's field branch. A list or an object reads
  -- as its JSON text; no value reads as JSON null. A list or relation column reads as its words.
  if v_keys = array['field'] then
    if jsonb_typeof(p_expr -> 'field') <> 'string'
       or (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return v_self;
    end if;
    v_key := custom.rule_field_key(p_organization_id, (p_expr ->> 'field')::uuid);
    if v_key is null then
      return v_self;
    end if;
    select f.data ->> 'type', coalesce(f.data ->> 'compute_on', '') into v_type, v_when
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return v_self;
    end if;
    -- CHAIR-MATH (a), carried here (2026-10-03): A COLUMN WORKED OUT ON READ IS NOT IN THE ROW'S
    -- VALUES. A roll-up, a lookup or a read-time formula (all Fields of type `formula`,
    -- compute_on = 'read') has no stored value, so reading `p_values_sql -> key` would read an
    -- absence (0, ''). Such a formula is NOT planned: NULL hands the WHOLE formula to the per-row
    -- path, where custom.formula_value works the referenced column out first. A formula stamped at
    -- write time is in the `_derived` block the caller's `p_values_sql` already includes, and plans.
    if v_type = 'formula' and v_when = 'read' then
      return null;
    end if;
    v_leaf := format('(%s -> %L)', p_values_sql, v_key);
    return format('(case when jsonb_typeof(%1$s) in (''array'', ''object'') then to_jsonb((%1$s)::text) '
                  'else coalesce(%1$s, ''null''::jsonb) end)', v_leaf);
  end if;

  -- A Rule node ({"op": "sub"}, {"op": "concat"} — what most formulas written before the formula
  -- language still are): formula_eval hands every node that is not its own to custom.rule_eval,
  -- so it is planned with rule_eval's own meaning (custom._fxc_rule_sql), not the formula's.
  if left(coalesce(p_expr ->> 'op', ''), 3) <> 'fx.' then
    return custom._fxc_rule_sql(p_organization_id, p_expr, p_values_sql);
  end if;

  v_op := p_expr ->> 'op';
  if not (v_keys = array['args', 'op'] or v_keys = array['op'])
     or v_op not in (
       'fx.add', 'fx.sub', 'fx.mul', 'fx.div', 'fx.mod', 'fx.neg', 'fx.round', 'fx.abs',
       'fx.sum', 'fx.min', 'fx.max', 'fx.average',
       'fx.eq', 'fx.ne', 'fx.lt', 'fx.lte', 'fx.gt', 'fx.gte',
       'fx.if', 'fx.and', 'fx.or', 'fx.not', 'fx.isblank', 'fx.blank',
       'fx.concatenate', 'fx.upper', 'fx.lower', 'fx.trim', 'fx.len', 'fx.left', 'fx.right', 'fx.contains',
       'fx.datediff', 'fx.dateadd', 'fx.year', 'fx.month', 'fx.day', 'fx.today', 'fx.now') then
    return v_self;
  end if;
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if jsonb_typeof(v_args) <> 'array' then
    return v_self;
  end if;
  v_n := jsonb_array_length(v_args);
  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null or v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    return v_self;   -- formula_eval refuses it by name, as it always has
  end if;

  -- Nodes with no arguments: formula_eval's own answers.
  if v_op = 'fx.blank' then
    return '''null''::jsonb';
  elsif v_op = 'fx.today' then
    return format('to_jsonb(to_char(now() at time zone %L, ''YYYY-MM-DD''))', custom.day_zone(p_organization_id));
  elsif v_op = 'fx.now' then
    return 'to_jsonb(to_char(now() at time zone ''UTC'', ''YYYY-MM-DD"T"HH24:MI:SS.MS"Z"''))';
  end if;

  for v_i in 0 .. v_n - 1 loop
    v_one := custom.formula_compile_sql(p_organization_id, v_args -> v_i, p_values_sql);
    if v_one is null then
      return null;
    end if;
    v_sql := v_sql || v_one;
  end loop;
  return format('custom._fxc_apply(%L, array[%s]::jsonb[])', v_op, array_to_string(v_sql, ', '));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.formula_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op    text;
  v_args  jsonb;
  v_n     integer;
  v_spec  record;
  v_vals  jsonb[] := '{}';
  v_one   jsonb;
  v_a     jsonb;
  v_b     jsonb;
  v_x     numeric;
  v_y     numeric;
  v_nums  numeric[] := '{}';
  v_s     text;
  v_t     text;
  v_d1    record;
  v_d2    record;
  v_u     text;
  v_type  text;
  v_ts    timestamp;
  v_i     integer;
  v_k     integer;
  v_p     integer;
begin
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  -- ── A COLUMN. What the older grid's `displayValueOf` seam did: a choice or a relation is
  -- the WORDS a person reads (so `{Status} = "No-show"` compares the label), everything else
  -- is its stored value; a list or an object reads as its JSON (normalizeCell).
  if p_expr ? 'field' and not (p_expr ? 'op') then
    v_a := custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
    if v_a is null or jsonb_typeof(v_a) = 'null' then
      return 'null'::jsonb;
    end if;
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return to_jsonb(custom.field_words(p_organization_id, (p_expr ->> 'field')::uuid, v_a));
    end if;
    if jsonb_typeof(v_a) in ('array', 'object') then
      return to_jsonb(v_a::text);
    end if;
    return v_a;
  end if;

  v_op := p_expr ->> 'op';
  if v_op is null or left(v_op, 3) <> 'fx.' then
    -- Every node that is not the formula language's own is a Rule node, answered by the
    -- Rules' evaluator, unchanged — so every formula written before today answers the same.
    return custom.rule_eval(p_organization_id, p_expr, p_values, coalesce(p_context, '{}'::jsonb));
  end if;

  select * into v_spec from custom.formula_node_kinds() k where k.node = v_op;
  if v_spec.node is null then
    raise exception 'This formula asks for %, and the formula language has no such function.', v_op
      using errcode = '22023', hint = 'select node, signature from custom.formula_node_kinds() is the whole list.';
  end if;
  v_args := coalesce(p_expr -> 'args', '[]'::jsonb);
  if jsonb_typeof(v_args) <> 'array' then
    raise exception '`%` was given something that is not a list of values.', v_spec.signature using errcode = '22023';
  end if;
  v_n := jsonb_array_length(v_args);
  if v_n < v_spec.min_args or (v_spec.max_args is not null and v_n > v_spec.max_args) then
    raise exception '`%` was given % value%. Use %.', upper(substr(v_op, 4)), v_n,
                    case when v_n = 1 then '' else 's' end, v_spec.signature
      using errcode = '22023';
  end if;

  -- ── short-circuit: IF, AND, OR ──────────────────────────────────────────────────────────
  if v_op = 'fx.if' then
    if custom._fx_truthy(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context)) then
      return custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context);
    end if;
    if v_n > 2 then
      return custom.formula_eval(p_organization_id, v_args -> 2, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.and' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if not custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'false'::jsonb;
      end if;
    end loop;
    return 'true'::jsonb;
  elsif v_op = 'fx.or' then
    for v_one in select e from jsonb_array_elements(v_args) e loop
      if custom._fx_truthy(custom.formula_eval(p_organization_id, v_one, p_values, p_context)) then
        return 'true'::jsonb;
      end if;
    end loop;
    return 'false'::jsonb;
  elsif v_op = 'fx.switch' then
    -- SWITCH(value, match, result, …, otherwise?) — Airtable's order. Only the value, the
    -- matches up to the first that holds, and that one result are worked out; a match compares
    -- exactly as `=` does (numbers as numbers, an empty value matches BLANK()).
    v_a := coalesce(custom.formula_eval(p_organization_id, v_args -> 0, p_values, p_context), 'null'::jsonb);
    v_i := 1;
    while v_i + 1 < v_n loop
      if custom._fx_cmp(v_a, coalesce(custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context),
                                      'null'::jsonb)) = 0 then
        return custom.formula_eval(p_organization_id, v_args -> (v_i + 1), p_values, p_context);
      end if;
      v_i := v_i + 2;
    end loop;
    if v_i < v_n then
      return custom.formula_eval(p_organization_id, v_args -> v_i, p_values, p_context);
    end if;
    return 'null'::jsonb;
  elsif v_op = 'fx.arrayjoin' then
    -- ARRAYJOIN(values, separator?) reads a COLUMN's stored list, not its words joined already:
    -- a many-choice column is each choice's own label, a link each record's own title. An empty
    -- item stays, as an empty piece between two separators — Airtable leaves removing them to
    -- ARRAYCOMPACT.
    v_s := case when v_n > 1
                then custom._fx_text(custom.formula_eval(p_organization_id, v_args -> 1, p_values, p_context))
                else ', ' end;
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return to_jsonb(coalesce((select string_agg(custom._fx_text(u.x), v_s order by u.i)
                                from jsonb_array_elements(v_a) with ordinality u(x, i)), ''));
  elsif v_op = 'fx.arraycompact' then
    -- ARRAYCOMPACT(values): the list without empty items (null and ""). false, 0 and text of
    -- spaces stay, as in Airtable.
    v_a := custom._fx_items(p_organization_id, v_args -> 0, p_values, p_context);
    return coalesce((select jsonb_agg(u.x order by u.i)
                       from jsonb_array_elements(v_a) with ordinality u(x, i)
                      where not custom._fx_blank(u.x)), '[]'::jsonb);
  end if;

  -- ── the store's own kinds ───────────────────────────────────────────────────────────────
  if v_op = 'fx.autonumber' then
    return to_jsonb(custom._fx_autonumber(p_organization_id,
             nullif(p_context ->> 'fx_table_id', '')::uuid,
             nullif(p_context ->> 'fx_field_key', ''),
             nullif(p_context ->> 'fx_self_id', '')::uuid));
  elsif v_op in ('fx.created_time', 'fx.modified_time') then
    select case when v_op = 'fx.created_time' then r.created_at else r.updated_at end into v_ts
      from custom.record r
     where r.organization_id = p_organization_id
       and r.id = nullif(p_context ->> 'fx_self_id', '')::uuid;
    if v_ts is null then
      return 'null'::jsonb;   -- a reader that has no record yet leaves it blank, never invents one
    end if;
    return to_jsonb(to_char((v_ts::timestamptz) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  elsif v_op = 'fx.blank' then
    return 'null'::jsonb;
  elsif v_op = 'fx.today' then
    return to_jsonb(to_char(now() at time zone custom.day_zone(p_organization_id), 'YYYY-MM-DD'));
  elsif v_op = 'fx.now' then
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  -- ── everything else evaluates every argument first ─────────────────────────────────────
  for v_one in select e from jsonb_array_elements(v_args) e loop
    v_vals := v_vals || coalesce(custom.formula_eval(p_organization_id, v_one, p_values, p_context), 'null'::jsonb);
  end loop;
  v_a := case when v_n >= 1 then v_vals[1] end;
  v_b := case when v_n >= 2 then v_vals[2] end;

  case v_op
    when 'fx.sum', 'fx.min', 'fx.max', 'fx.average' then
      foreach v_one in array v_vals loop
        if not custom._fx_blank(v_one) then
          v_nums := v_nums || custom._fx_num(v_one, format('`%s`', upper(substr(v_op, 4))));
        end if;
      end loop;
      if v_op = 'fx.sum' then
        return to_jsonb(coalesce((select sum(x) from unnest(v_nums) x), 0));
      end if;
      if cardinality(v_nums) = 0 then return 'null'::jsonb; end if;
      if v_op = 'fx.min' then return to_jsonb((select min(x) from unnest(v_nums) x)); end if;
      if v_op = 'fx.max' then return to_jsonb((select max(x) from unnest(v_nums) x)); end if;
      return to_jsonb(trim_scale((select sum(x) from unnest(v_nums) x) / cardinality(v_nums)));
    when 'fx.round' then
      v_x := custom._fx_num(v_a, '`ROUND`');
      v_y := case when v_n > 1 then trunc(custom._fx_num(v_b, '`ROUND`')) else 0 end;
      -- numeric round() rounds halves away from zero, which is the older grid's rule.
      return to_jsonb(round(v_x, v_y::integer));
    when 'fx.abs' then
      return to_jsonb(abs(custom._fx_num(v_a, '`ABS`')));
    when 'fx.len' then
      return to_jsonb(char_length(custom._fx_text(v_a)));
    when 'fx.upper' then
      return to_jsonb(upper(custom._fx_text(v_a)));
    when 'fx.lower' then
      return to_jsonb(lower(custom._fx_text(v_a)));
    when 'fx.trim' then
      return to_jsonb(regexp_replace(custom._fx_text(v_a), '^\s+|\s+$', '', 'g'));
    when 'fx.concatenate' then
      return to_jsonb((select string_agg(custom._fx_text(x), '' order by i)
                         from unnest(v_vals) with ordinality u(x, i)));
    when 'fx.left' then
      v_x := trunc(custom._fx_num(v_b, '`LEFT`'));
      return to_jsonb(left(custom._fx_text(v_a), greatest(0, v_x)::integer));
    when 'fx.right' then
      v_x := trunc(custom._fx_num(v_b, '`RIGHT`'));
      if v_x <= 0 then return '""'::jsonb; end if;
      return to_jsonb(right(custom._fx_text(v_a), v_x::integer));
    when 'fx.contains' then
      return to_jsonb(strpos(lower(custom._fx_text(v_a)), lower(custom._fx_text(v_b))) > 0);
    when 'fx.not' then
      return to_jsonb(not custom._fx_truthy(v_a));
    when 'fx.isblank' then
      return to_jsonb(custom._fx_blank(v_a));
    when 'fx.datediff' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEDIFF`');
      select * into v_d2 from custom._fx_date(v_b, '`DATEDIFF`');
      v_u := custom._fx_unit(v_vals[3], array['days', 'hours', 'minutes'], 'DATEDIFF');
      return to_jsonb(trunc(extract(epoch from (v_d2.ts - v_d1.ts))
                            / case v_u when 'days' then 86400 when 'hours' then 3600 else 60 end));
    when 'fx.year' then
      select * into v_d1 from custom._fx_date(v_a, '`YEAR`');
      return to_jsonb(extract(year from v_d1.ts)::integer);
    when 'fx.month' then
      select * into v_d1 from custom._fx_date(v_a, '`MONTH`');
      return to_jsonb(extract(month from v_d1.ts)::integer);
    when 'fx.day' then
      select * into v_d1 from custom._fx_date(v_a, '`DAY`');
      return to_jsonb(extract(day from v_d1.ts)::integer);
    when 'fx.dateadd' then
      select * into v_d1 from custom._fx_date(v_a, '`DATEADD`');
      v_x := trunc(custom._fx_num(v_b, '`DATEADD`'));
      v_u := custom._fx_unit(v_vals[3], array['days', 'months', 'years'], 'DATEADD');
      -- An interval of months clamps to the end of a shorter month, as the older grid does.
      v_ts := case v_u when 'days' then v_d1.ts + make_interval(days => v_x::integer)
                       when 'months' then v_d1.ts + make_interval(months => v_x::integer)
                       else v_d1.ts + make_interval(years => v_x::integer) end;
      return to_jsonb(custom._fx_iso(v_ts, v_d1.date_only));
    when 'fx.find' then
      -- FIND(part, text, start?): Airtable's startFromPosition, which defaults to 0, is
      -- JavaScript's indexOf start — the number of characters skipped before the search. The
      -- answer counts from 1, and 0 means the part is not there. Upper and lower case differ.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_x := case when v_n > 2 then greatest(trunc(custom._fx_num(v_vals[3], '`FIND`')), 0) else 0 end;
      v_x := least(v_x, char_length(v_t));
      if v_s = '' then
        return to_jsonb(v_x + 1);
      end if;
      v_k := strpos(substr(v_t, v_x::integer + 1), v_s);
      return to_jsonb(case when v_k = 0 then 0 else v_k + v_x::integer end);
    when 'fx.substitute' then
      -- SUBSTITUTE(text, old, new, which?): every `old` replaced, or only the which-th one.
      v_s := custom._fx_text(v_a);
      v_t := custom._fx_text(v_b);
      v_u := custom._fx_text(v_vals[3]);
      if v_t = '' then
        return to_jsonb(v_s);
      end if;
      if v_n < 4 then
        return to_jsonb(replace(v_s, v_t, v_u));
      end if;
      v_x := trunc(custom._fx_num(v_vals[4], '`SUBSTITUTE`'));
      if v_x < 1 then
        raise exception '`SUBSTITUTE` counts which one to replace from 1, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      v_i := 0;   -- characters already passed
      v_k := 0;   -- occurrences seen
      loop
        v_p := strpos(substr(v_s, v_i + 1), v_t);
        exit when v_p = 0;
        v_i := v_i + v_p;
        v_k := v_k + 1;
        if v_k = v_x then
          return to_jsonb(left(v_s, v_i - 1) || v_u || substr(v_s, v_i + char_length(v_t)));
        end if;
        v_i := v_i + char_length(v_t) - 1;
      end loop;
      return to_jsonb(v_s);
    when 'fx.regex_match' then
      -- REGEX_MATCH(text, pattern), read as RE2 reads it (custom._fx_regex). Postgres's `~`
      -- answers yes/no without tracking captures, so the classic runaway shapes ((a+)+,
      -- (\w+\s?)+) run in milliseconds and are accepted, as RE2 accepts them. A pattern the
      -- database cannot read, or one too complex to compile (both 2201B), or one that runs past
      -- the statement's time is said in a plain sentence; a timeout keeps its own sqlstate
      -- (57014) so custom.derived_value still re-raises it as a cancelled read, never an empty
      -- cell. This is the only handler in the evaluator.
      v_t := custom._fx_regex(custom._fx_text(v_b), 'REGEX_MATCH');
      begin
        return to_jsonb(custom._fx_text(v_a) ~ v_t);
      exception
        when invalid_regular_expression then
          if sqlerrm like '%too complex%' then
            raise exception '`REGEX_MATCH` cannot work out a pattern this complex: "%".', custom._fx_text(v_b)
              using errcode = '22023';
          end if;
          raise exception '`REGEX_MATCH` cannot read the pattern "%".', custom._fx_text(v_b)
            using errcode = '22023';
        when query_canceled then
          raise exception '`REGEX_MATCH` took too long on this text. Try a simpler pattern.'
            using errcode = '57014';
      end;
    when 'fx.datetime_format' then
      select * into v_d1 from custom._fx_date(v_a, '`DATETIME_FORMAT`');
      if v_n < 2 or btrim(custom._fx_text(v_b)) = '' then
        return to_jsonb(custom._fx_iso(v_d1.ts, v_d1.date_only));
      end if;
      return to_jsonb(custom._fx_datetime_format(v_d1.ts, custom._fx_text(v_b)));
    when 'fx.workday' then
      select * into v_d1 from custom._fx_date(v_a, '`WORKDAY`');
      v_x := trunc(custom._fx_num(v_b, '`WORKDAY`'));
      if abs(v_x) > 36500 then
        raise exception '`WORKDAY` moves at most 36500 working days, but was given %.', custom._fx_num_text(v_x)
          using errcode = '22023';
      end if;
      return to_jsonb(custom._fx_iso(
        custom._fx_workday(v_d1.ts, v_x::integer, case when v_n > 2 then v_vals[3] end), v_d1.date_only));
    when 'fx.add' then
      return to_jsonb(custom._fx_num(v_a, '`+`') + custom._fx_num(v_b, '`+`'));
    when 'fx.sub' then
      return to_jsonb(custom._fx_num(v_a, '`-`') - custom._fx_num(v_b, '`-`'));
    when 'fx.mul' then
      return to_jsonb(custom._fx_num(v_a, '`*`') * custom._fx_num(v_b, '`*`'));
    when 'fx.div', 'fx.mod' then
      v_y := custom._fx_num(v_b, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      if v_y = 0 then
        raise exception 'This formula divides by zero.' using errcode = '22012';
      end if;
      v_x := custom._fx_num(v_a, case when v_op = 'fx.div' then '`/`' else '`%`' end);
      -- trim_scale: 142.5 / 3 is 47.5, not 47.5000000000000000 (a number reads as the older grid prints it).
      return to_jsonb(trim_scale(case when v_op = 'fx.div' then v_x / v_y else mod(v_x, v_y) end));
    when 'fx.neg' then
      return to_jsonb(- custom._fx_num(v_a, '`-`'));
    when 'fx.eq'  then return to_jsonb(custom._fx_cmp(v_a, v_b) = 0);
    when 'fx.ne'  then return to_jsonb(custom._fx_cmp(v_a, v_b) <> 0);
    when 'fx.lt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) < 0);
    when 'fx.lte' then return to_jsonb(custom._fx_cmp(v_a, v_b) <= 0);
    when 'fx.gt'  then return to_jsonb(custom._fx_cmp(v_a, v_b) > 0);
    when 'fx.gte' then return to_jsonb(custom._fx_cmp(v_a, v_b) >= 0);
    else
      raise exception 'The formula language lists % and this evaluator does not work it out.', v_op
        using errcode = '22023', hint = 'That is a defect in custom.formula_eval, not in the formula.';
  end case;
end
$function$;

CREATE OR REPLACE FUNCTION custom.formula_node_kinds()
 RETURNS TABLE(node text, min_args integer, max_args integer, result text, signature text, says text)
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  -- The older grid's FUNCTION_SPECS (features/data-tables/formulas.ts), and its operators,
  -- as the store's `fx.*` nodes. max_args null = any number.
  select * from (values
    ('fx.sum',         1, null::integer, 'number',  'SUM(number, …)',                  'Adds every value, ignoring empty ones.'),
    ('fx.min',         1, null, 'number',  'MIN(number, …)',                  'The smallest value, ignoring empty ones.'),
    ('fx.max',         1, null, 'number',  'MAX(number, …)',                  'The largest value, ignoring empty ones.'),
    ('fx.average',     1, null, 'number',  'AVERAGE(number, …)',              'The average of the values that are filled in. Empty values are not counted.'),
    ('fx.round',       1, 2,    'number',  'ROUND(number, places?)',          'Rounds to the given number of decimal places (0 when omitted). Halves round away from zero.'),
    ('fx.abs',         1, 1,    'number',  'ABS(number)',                     'The value without its minus sign.'),
    ('fx.len',         1, 1,    'number',  'LEN(text)',                       'How many characters the text has.'),
    ('fx.upper',       1, 1,    'text',    'UPPER(text)',                     'The text in capitals.'),
    ('fx.lower',       1, 1,    'text',    'LOWER(text)',                     'The text in lower case.'),
    ('fx.trim',        1, 1,    'text',    'TRIM(text)',                      'The text without leading or trailing spaces.'),
    ('fx.concatenate', 1, null, 'text',    'CONCATENATE(text, …)',            'Joins every value into one piece of text. The & operator is the same join.'),
    ('fx.left',        2, 2,    'text',    'LEFT(text, count)',               'The first few characters of the text.'),
    ('fx.right',       2, 2,    'text',    'RIGHT(text, count)',              'The last few characters of the text.'),
    ('fx.contains',    2, 2,    'boolean', 'CONTAINS(text, part)',            'Yes when the text contains that part. Upper and lower case are treated the same.'),
    ('fx.if',          2, 3,    'unknown', 'IF(condition, then, otherwise?)', 'The second value when the condition holds, otherwise the third (empty when omitted).'),
    ('fx.and',         1, null, 'boolean', 'AND(condition, …)',               'Yes when every condition holds.'),
    ('fx.or',          1, null, 'boolean', 'OR(condition, …)',                'Yes when at least one condition holds.'),
    ('fx.not',         1, 1,    'boolean', 'NOT(condition)',                  'Turns yes into no and no into yes.'),
    ('fx.blank',       0, 0,    'unknown', 'BLANK()',                         'An empty value, for comparing against or returning.'),
    ('fx.isblank',     1, 1,    'boolean', 'ISBLANK(value)',                  'Yes when the value is empty.'),
    ('fx.today',       0, 0,    'date',    'TODAY()',                         'Today''s date.'),
    ('fx.now',         0, 0,    'date',    'NOW()',                           'The current date and time.'),
    ('fx.datediff',    3, 3,    'number',  'DATEDIFF(from, to, ''days'' | ''hours'' | ''minutes'')', 'How far the second date is after the first. Negative when it is earlier.'),
    ('fx.year',        1, 1,    'number',  'YEAR(date)',                      'The four-digit year of the date.'),
    ('fx.month',       1, 1,    'number',  'MONTH(date)',                     'The month of the date, 1 to 12.'),
    ('fx.day',         1, 1,    'number',  'DAY(date)',                       'The day of the month, 1 to 31.'),
    ('fx.dateadd',     3, 3,    'date',    'DATEADD(date, count, ''days'' | ''months'' | ''years'')', 'The date moved forward by that many units. Use a negative count to go back.'),
    -- VIEWS-AND-FIELDS F4: seven of Airtable's functions, in Airtable's argument order
    ('fx.switch',      2, null, 'unknown', 'SWITCH(value, match, result, …, otherwise?)', 'The result beside the first match for the value, else the last value.'),
    ('fx.find',        2, 3,    'number',  'FIND(part, text, start?)',        'Where the part first appears, counting from 1, or 0; a start skips that many characters.'),
    ('fx.substitute',  3, 4,    'text',    'SUBSTITUTE(text, old, new, which?)', 'The text with every old part replaced, or only the numbered one.'),
    ('fx.regex_match', 2, 2,    'boolean', 'REGEX_MATCH(text, pattern)',      'Yes when the text matches the pattern.'),
    ('fx.datetime_format', 1, 2, 'text',   'DATETIME_FORMAT(date, format?)', 'The date written in the format given, such as ''MMM D, YYYY'', in UTC.'),
    ('fx.workday',     2, 3,    'date',    'WORKDAY(start, days, holidays?)', 'The date that many working days on, skipping weekends and the holidays listed.'),
    ('fx.arrayjoin',   1, 2,    'text',    'ARRAYJOIN(values, separator?)',   'Every value of a list as one piece of text, ", " between them unless told.'),
    ('fx.arraycompact', 1, 1,   'unknown', 'ARRAYCOMPACT(values)',            'The list without its empty values.'),
    -- the operators
    ('fx.add',         2, 2,    'number',  'a + b',  'A sum. An empty value counts as 0.'),
    ('fx.sub',         2, 2,    'number',  'a - b',  'A difference. An empty value counts as 0.'),
    ('fx.mul',         2, 2,    'number',  'a * b',  'A product. An empty value counts as 0.'),
    ('fx.div',         2, 2,    'number',  'a / b',  'A quotient. Dividing by zero is refused by name.'),
    ('fx.mod',         2, 2,    'number',  'a % b',  'What is left over after dividing. Dividing by zero is refused by name.'),
    ('fx.neg',         1, 1,    'number',  '-a',     'The value with its sign turned over.'),
    ('fx.eq',          2, 2,    'boolean', 'a = b',  'The same. Numbers compare as numbers, anything else as text; an empty value matches 0 and "".'),
    ('fx.ne',          2, 2,    'boolean', 'a != b', 'Not the same (also written <>).'),
    ('fx.lt',          2, 2,    'boolean', 'a < b',  'Less than.'),
    ('fx.lte',         2, 2,    'boolean', 'a <= b', 'At most.'),
    ('fx.gt',          2, 2,    'boolean', 'a > b',  'Greater than.'),
    ('fx.gte',         2, 2,    'boolean', 'a >= b', 'At least.'),
    -- the store's own column kinds (G5): a formula Field with a system expression
    ('fx.autonumber',  0, 0,    'number',  'AUTONUMBER()',    'The record''s number in this table: assigned once, when the record is first written, never reused.'),
    ('fx.created_time',0, 0,    'date',    'CREATED_TIME()',  'When the record was created.'),
    ('fx.modified_time',0, 0,   'date',    'MODIFIED_TIME()', 'When the record was last changed.')
  ) as t(node, min_args, max_args, result, signature, says)
$function$;

drop function custom._fx_listop(uuid, text, jsonb, jsonb, jsonb);
drop function custom._fx_recprop(uuid, jsonb, text);
drop function custom._fx_list(uuid, jsonb, jsonb, jsonb);
drop function custom._fx_item_text(jsonb);
drop function custom._fx_itemkey(jsonb);

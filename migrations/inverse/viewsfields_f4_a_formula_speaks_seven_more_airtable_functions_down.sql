-- lock: custom
-- lane: VIEWS-AND-FIELDS
-- based-on: custom.formula_node_kinds() 167dae64dd5fb2ad275f1851e6da2f98419c89b8659eb26e16433f8cf997da8f
-- based-on: custom.formula_eval(uuid, jsonb, jsonb, jsonb) 4b2d05c5b7392281941a2744ca265fcb63815ad05184e54c5eebf91a8d53ac9f
-- based-on: custom._fxp_type(jsonb, jsonb) a0887838d72777784413b691317f7e1ebca94567757effc4ae72d79218f5f29b
-- based-on: custom._fx_ordinal(integer) e1a8cd17b9c816c642cab14686915afb546543f3ce59d51d4f5992643b313a14
-- based-on: custom._fx_datetime_format(timestamp without time zone, text) fb9c2a084acbf65e1a6aa66af69c89b0d50a5cfef048a62f74009c727efeba2f
-- based-on: custom._fx_regex(text, text) 3d672b4a276e607345b8ebb90f59d5367c471fba54d498fd37086d4f7c5419d3
-- based-on: custom._fx_items(uuid, jsonb, jsonb, jsonb) 01fa5c29c9e8f9cebfbb6cb1176aa095e6d67469de5f621415e0c2f8583b4e74
-- based-on: custom._fx_workday(timestamp without time zone, integer, jsonb) 865a962f7497147ffc51b7b254d3c19d113b1b6cf6b70a3e3a74ca49f4c5ecd2
-- chair-step: the inverse of viewsfields_f4_a_formula_speaks_seven_more_airtable_functions.sql.
-- It puts back, byte for byte, custom.formula_node_kinds, custom.formula_eval and custom._fxp_type
-- as the main database held them before (2026-10-02), and drops the five helpers that file
-- created. What it undoes: SWITCH, FIND, SUBSTITUTE, REGEX_MATCH, DATETIME_FORMAT, WORKDAY,
-- ARRAYJOIN and ARRAYCOMPACT leave the formula language; a formula column already written with
-- one of them is refused by name ("There is no function called …") on its next read.

set local statement_timeout = '60s';

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
    return to_jsonb(to_char(now() at time zone 'UTC', 'YYYY-MM-DD'));
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

CREATE OR REPLACE FUNCTION custom._fxp_type(p_node jsonb, p_fields jsonb)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_op   text := p_node ->> 'op';
  v_f    jsonb;
  v_a    text;
  v_b    text;
begin
  -- formulaResultType: best effort, and `unknown` is always a legal answer.
  if p_node ? 'const' then
    return case jsonb_typeof(p_node -> 'const') when 'number' then 'number' when 'string' then 'text'
                                                 when 'boolean' then 'boolean' else 'unknown' end;
  end if;
  if p_node ? 'field' then
    select f into v_f from jsonb_array_elements(p_fields) f where f ->> 'id' = p_node ->> 'field' limit 1;
    return case
      when v_f ->> 'type' = 'boolean' then 'boolean'
      when v_f ->> 'type' = 'range' and v_f -> 'config' ->> 'kind' in ('date', 'datetime') then 'date'
      when v_f ->> 'type' = 'range' then 'number'
      when v_f ->> 'type' in ('text', 'list', 'relation') then 'text'
      else 'unknown' end;
  end if;
  if v_op = 'fx.if' then
    v_a := custom._fxp_type(p_node -> 'args' -> 1, p_fields);
    if jsonb_array_length(p_node -> 'args') < 3 then return v_a; end if;
    v_b := custom._fxp_type(p_node -> 'args' -> 2, p_fields);
    return case when v_a = v_b then v_a when v_a = 'unknown' then v_b when v_b = 'unknown' then v_a else 'unknown' end;
  end if;
  if v_op in ('fx.min', 'fx.max') then
    if jsonb_array_length(p_node -> 'args') > 0
       and not exists (select 1 from jsonb_array_elements(p_node -> 'args') a
                        where custom._fxp_type(a, p_fields) <> 'date') then
      return 'date';
    end if;
    return 'number';
  end if;
  return coalesce((select k.result from custom.formula_node_kinds() k where k.node = v_op), 'unknown');
end
$function$;

drop function custom._fx_items(uuid, jsonb, jsonb, jsonb);
drop function custom._fx_regex(text, text);
drop function custom._fx_datetime_format(timestamp, text);
drop function custom._fx_ordinal(integer);
drop function custom._fx_workday(timestamp, integer, jsonb);

-- lane: AUTOMATION-DOOR
-- lock: custom,platform
-- based-on: custom._action_coerce(jsonb, jsonb, uuid) d78b01549151f5bc353b1e87fea304e97274ca17cbfa7d99833350d26457859d
-- based-on: custom._action_coerce(jsonb, jsonb) 6941569c4f0dfd35d62f3d6d4d06f3849b4cb9b6d03999ee141c833d7427ab19
-- based-on: custom.formula_eval(uuid, jsonb, jsonb, jsonb) 82e5d12a653ff5cbf96a34b58a1d2ae43d15eac36051ead2c3fd68b34ffe763b
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) b04dc35215bd627b656c30b01e17eae5f8ab0d0c35fc203d8ba3d0b5f73ad5ec
-- based-on: custom.action_run(uuid, uuid, uuid[]) 7823becd3c7d119238a10f09d5189cc1a697580809760d7381d97a69e7e498a3
-- chair-step: the inverse of automation_door_b_a_day_is_the_persons_day.sql. It puts back the previous bodies of
-- custom.formula_eval, custom.formula_compile_sql, custom.action_run and custom._action_coerce(jsonb,jsonb) (the UTC
-- day again), turns the 3-argument custom._action_coerce back into the same UTC behaviour (custom._automation_fire,
-- which automation_door_a created, still calls it, so it stays until that file's inverse drops the fire path), and
-- drops custom.day_zone. Rows written meanwhile keep the day they were written with.

set local lock_timeout = '2s';
set local statement_timeout = '60s';

create or replace function custom._action_coerce(p_field jsonb, p_value jsonb, p_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type text := p_field ->> 'type';
  v_kind text := p_field -> 'config' ->> 'kind';
  v_s    text;
  v_n    numeric;
begin
  if custom._fx_blank(p_value) then
    return 'null'::jsonb;
  end if;
  if v_type = 'range' and v_kind in ('date', 'datetime') then
    v_s := custom._fx_text(p_value);
    if v_kind = 'date' and v_s ~ '^\d{4}-\d{2}-\d{2}T' then v_s := left(v_s, 10); end if;
    return to_jsonb(v_s);
  elsif v_type = 'range' then
    v_n := custom._fx_loose(p_value);
    return case when v_n is null then 'null'::jsonb else to_jsonb(v_n) end;
  elsif v_type = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then return p_value; end if;
    if jsonb_typeof(p_value) = 'string' then
      return to_jsonb(lower(btrim(p_value #>> '{}')) in ('true', 'yes', '1'));
    end if;
    return to_jsonb(custom._fx_truthy(p_value));
  elsif v_type in ('text', 'list') and jsonb_typeof(p_value) in ('number', 'boolean') then
    return to_jsonb(custom._fx_text(p_value));
  end if;
  return p_value;
end
$function$;

create or replace function custom._action_coerce(p_field jsonb, p_value jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_type text := p_field ->> 'type';
  v_kind text := p_field -> 'config' ->> 'kind';
  v_s    text;
  v_n    numeric;
begin
  if custom._fx_blank(p_value) then
    return 'null'::jsonb;
  end if;
  if v_type = 'range' and v_kind in ('date', 'datetime') then
    v_s := custom._fx_text(p_value);
    if v_kind = 'date' and v_s ~ '^\d{4}-\d{2}-\d{2}T' then v_s := left(v_s, 10); end if;
    return to_jsonb(v_s);
  elsif v_type = 'range' then
    v_n := custom._fx_loose(p_value);
    return case when v_n is null then 'null'::jsonb else to_jsonb(v_n) end;
  elsif v_type = 'boolean' then
    if jsonb_typeof(p_value) = 'boolean' then return p_value; end if;
    if jsonb_typeof(p_value) = 'string' then
      return to_jsonb(lower(btrim(p_value #>> '{}')) in ('true', 'yes', '1'));
    end if;
    return to_jsonb(custom._fx_truthy(p_value));
  elsif v_type in ('text', 'list') and jsonb_typeof(p_value) in ('number', 'boolean') then
    return to_jsonb(custom._fx_text(p_value));
  end if;
  return p_value;
end
$function$;

create or replace function custom.formula_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb, p_context jsonb DEFAULT '{}'::jsonb)
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

create or replace function custom.formula_compile_sql(p_organization_id uuid, p_expr jsonb, p_values_sql text)
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
    return 'to_jsonb(to_char(now() at time zone ''UTC'', ''YYYY-MM-DD''))';
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

create or replace function custom.action_run(p_organization_id uuid, p_action_id uuid, p_record_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_table    uuid;
  v_tdoc     jsonb;
  v_action   jsonb;
  v_step     jsonb;
  v_fields   jsonb;
  v_field    jsonb;
  v_rid      uuid;
  v_rec      custom.record;
  v_patch    jsonb;
  v_val      jsonb;
  v_values   jsonb;
  v_ctx      jsonb;
  v_refused  jsonb := '[]'::jsonb;
  v_one      jsonb;
  v_done     jsonb := '[]'::jsonb;
  v_ver      integer;
  v_msg      text;
  v_hint     text;
  v_state    text;
  v_whole    text;
  v_named    boolean;
  v_title    text;
  v_max      integer;
  v_n        integer;
  v_run      uuid;      -- CHAIR-DOORS-4: the run row
  k          text;
begin
  perform custom.assert_store_door(p_organization_id, 'custom.action_run');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.action_run');

  -- The action is found inside THIS organization's Tables only, and only on a Table this
  -- person may know; any other id answers exactly as an invented one.
  select t.id, t.data into v_table, v_tdoc
    from custom.record t
   where t.organization_id = p_organization_id
     and t.table_id = custom.table_kernel_id()
     and t.deleted_at is null
     and t.data -> 'row_actions' @> jsonb_build_array(jsonb_build_object('id', p_action_id::text))
   limit 1;
  if v_table is null then
    raise exception 'There is no such row action here.' using errcode = '23503', hint = 'It may have been removed from its table, or it belongs to another organization. Nothing was changed.',
            detail = jsonb_build_object('action_id', p_action_id)::text;
  end if;
  perform custom.assert_may_know_table(p_organization_id, v_table, 'custom.action_run');
  select a into v_action from jsonb_array_elements(v_tdoc -> 'row_actions') a where a ->> 'id' = p_action_id::text;

  if v_action ->> 'kind' = 'agent' then
    raise exception '"%" asks an agent, and an agent is not a fixed change, so it does not run here.', v_action ->> 'name'
      using errcode = '22023',
            hint = 'Open the record''s chat with the action''s prompt (the record-chat launcher does); the agent proposes its changes and a person confirms them. Nothing was changed.';
  end if;

  v_n := coalesce(cardinality(p_record_ids), 0);
  if v_n = 0 then
    raise exception '"%" was run on no records.', v_action ->> 'name'
      using errcode = '22023', hint = 'Select the records it should change. Nothing was changed.';
  end if;
  v_max := coalesce((platform.knob_resolve('custom', 'action_run_records_max', p_organization_id) #>> '{}')::integer, 5000);
  if v_n > v_max then
    raise exception '"%" can run on at most % records at once, and % were selected.', v_action ->> 'name', v_max, v_n
      using errcode = '54000',
            hint = 'Run it on a filtered view in parts. The ceiling is the organization knob custom/action_run_records_max. Nothing was changed.';
  end if;

  -- The columns the steps name, read once.
  select coalesce(jsonb_object_agg(f.id::text, jsonb_build_object('key', f.data ->> 'key', 'label', f.data ->> 'label',
                                   'type', f.data ->> 'type', 'config', f.data -> 'config')), '{}'::jsonb)
    into v_fields
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and f.data ->> 'entity_definition_id' = v_table::text;
  for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
    if not (v_fields ? (v_step ->> 'field')) then
      raise exception '"%" changes a column that is gone, so it cannot run until it is edited.', v_action ->> 'name'
        using errcode = '23503', hint = 'custom.row_actions names the step under stale. Nothing was changed.';
    end if;
  end loop;
  v_title := coalesce(nullif(v_tdoc ->> 'title_field', ''), 'name');

  foreach v_rid in array p_record_ids loop
    select * into v_rec from custom.record r
     where r.organization_id = p_organization_id and r.id = v_rid and r.table_id = v_table
       and r.data_class = 'record' and r.deleted_at is null;
    if v_rec.id is null then
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'record', null, 'field_id', null, 'field', null,
                     'says', format('This record is not a live record of %s.', coalesce(v_tdoc ->> 'name', 'this table'))));
      continue;
    end if;

    -- The patch, worked out against THIS record's own values (row-actions.ts compileRowAction).
    v_values := custom.record_values(p_organization_id, v_rid);
    v_ctx := coalesce(custom.rule_context(p_organization_id, v_rid), '{}'::jsonb)
             || jsonb_build_object('fx_self_id', v_rid, 'fx_table_id', v_table);
    v_patch := '{}'::jsonb;
    begin
      for v_step in select e from jsonb_array_elements(v_action -> 'steps') e loop
        v_field := v_fields -> (v_step ->> 'field');
        v_val := case v_step ->> 'set'
                   when 'clear' then 'null'::jsonb
                   when 'value' then v_step -> 'value'
                   else custom.formula_eval(p_organization_id, v_step -> 'expr', v_values, v_ctx) end;
        v_patch := v_patch || jsonb_build_object(v_field ->> 'key', custom._action_coerce(v_field, v_val));
      end loop;
    exception when others then
      get stacked diagnostics v_msg = message_text;
      v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                     'record', v_rec.data ->> v_title, 'field_id', v_step ->> 'field', 'field', v_field ->> 'label',
                     'says', format('"%s": %s', v_field ->> 'label', v_msg)));
      continue;
    end;

    -- The write, through the store's own door. A refusal is tried again one column at a time
    -- so it names the FIELD; only this record's attempt is rolled back.
    begin
      v_ver := custom.record_update(p_organization_id, v_rid, v_patch);
      v_done := v_done || jsonb_build_array(jsonb_build_object('record_id', v_rid, 'version', v_ver));
    exception when others then
      get stacked diagnostics v_whole = message_text, v_hint = pg_exception_hint, v_state = returned_sqlstate;
      v_named := false;
      -- A record this person may not change is refused as a RECORD, not column by column.
      for k in select x from jsonb_object_keys(v_patch) x where v_state <> '42501' loop
        begin
          perform custom.record_update(p_organization_id, v_rid, jsonb_build_object(k, v_patch -> k));
          raise exception using errcode = 'P0001', message = 'gridprim action probe passed';
        exception when others then
          get stacked diagnostics v_msg = message_text, v_state = returned_sqlstate;
          if v_msg <> 'gridprim action probe passed' then
            v_named := true;
            select value into v_field from jsonb_each(v_fields) where value ->> 'key' = k;
            v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                           'record', v_rec.data ->> v_title,
                           'field_id', (select key from jsonb_each(v_fields) where value ->> 'key' = k),
                           'field', v_field ->> 'label', 'code', v_state, 'says', v_msg));
          end if;
        end;
      end loop;
      if not v_named then
        -- The columns pass one by one and fail together (a rule that compares two of them).
        v_refused := v_refused || jsonb_build_array(jsonb_build_object('record_id', v_rid,
                       'record', v_rec.data ->> v_title, 'field_id', null, 'field', null, 'code', v_state, 'says', v_whole));
      end if;
    end;
  end loop;

  if jsonb_array_length(v_refused) > 0 then
    v_one := v_refused -> 0;
    raise exception '"%" changed nothing: % of the % selected records refused it. First: %',
      v_action ->> 'name', (select count(distinct r ->> 'record_id') from jsonb_array_elements(v_refused) r), v_n,
      case when v_one ->> 'record' is not null then (v_one ->> 'record') || ' — ' else '' end
      || case when v_one ->> 'field' is not null then (v_one ->> 'field') || ': ' || (v_one ->> 'says') else v_one ->> 'says' end
      using errcode = '23514',
            detail = v_refused::text,
            hint = 'The selection is one change: it happens for every record or for none. DETAIL lists every record and field that refused and why; fix those (or run the action on the others) and run it again.';
  end if;

  -- THE RUN ROW (CHAIR-DOORS-4, lane 11 need 1d-b): what ran, on which records, by whom, when, and how
  -- it went — a row of the store itself (data_class action_run, no Table, the way checklist runs are
  -- kept), read back by custom.record_runs. A refused selection raises above and so leaves no row:
  -- the door's contract is that nothing is written, and that includes this.
  insert into custom.record (organization_id, table_id, data_class, data)
  values (p_organization_id, null, 'action_run', jsonb_build_object(
            'action_id',  p_action_id,
            'action',     v_action ->> 'name',
            'table_id',   v_table,
            'record_ids', (select coalesce(jsonb_agg(d -> 'record_id'), '[]'::jsonb) from jsonb_array_elements(v_done) d),
            'ran',        jsonb_array_length(v_done),
            'selected',   v_n,
            'outcome',    'ran',
            'ran_by',     custom.query_principal(),
            'ran_at',     now()))
  returning id into v_run;

  return jsonb_build_object('action_id', p_action_id, 'action', v_action ->> 'name', 'table_id', v_table,
                            'ran', jsonb_array_length(v_done), 'records', v_done, 'run_id', v_run);
end
$function$;

drop function if exists custom.day_zone(uuid);

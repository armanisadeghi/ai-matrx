-- draft: VISION-REACH clone rehearsal in progress
-- target: branch,production
-- additive: yes
--   It ADDS four helpers — custom._fxc_apply(text, jsonb[]) (one planned formula node),
--   custom.formula_result_kind(uuid, jsonb), custom.field_value_kind(uuid, jsonb) and
--   custom.agg_field_kind(uuid, uuid, text) (what kind of value a column holds) — EXECUTE to
--   postgres only, as the store's event trigger leaves every new custom function, and REPLACES four
--   bodies, each declared below with the body it was written against. custom.formula_eval, every
--   _fx_* function, custom.visible_set and custom.visible_predicate_sql are NOT touched. No table,
--   column, index, trigger, policy, grant or row of anybody's data is touched.
--   Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w5_every_common_formula_is_planned_once_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) 4e86c988f7c4824816547e54c529d5e14c57215339f19da93860e290c93376b2
-- based-on: custom.agg_field_value_sql(uuid, uuid, text) 2913f67eb9f0f9dfe4e622a87844d34e27eee4eb7672fad2f0de6f43c00bdcaf
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 6ffb66bb2c9ab5ead25366c494769674b4f8c4ff17db54d3e75da05e4cb92694
-- based-on: custom.record_aggregate_as_of(uuid, uuid, timestamp with time zone, text, text, text, jsonb) 1545cb1bd29c9abd16739212885198a2b504cf781d3f39029bac18769fd0eccc
--
-- LANE 5 VISION-REACH, WAVE 5 — EVERY COMMON FORMULA IS WORKED OUT ONCE PER QUESTION, A DATE
-- FORMULA HAS AN EARLIEST AND A LATEST, AND "AS IT STOOD" READS ONLY THE HISTORY IT NEEDS.
--
-- THE DEFECTS (measured on the clone 2026-10-02 as test@test.com, a 5,000-visit Cedar Ridge ledger):
--   · filtering, grouping or summing a formula that is not plain arithmetic — IF ("Copay tier"),
--     & and UPPER ("Visit label"), DATEDIFF, AND with comparisons, MONTH — took 24–94 s, and the
--     grid page filtered on one 60–82 s: wave 3 planned only arithmetic, every other formula was
--     worked out by custom.formula_eval record by record (~4–8 ms each);
--   · a date period on a DATEADD formula took 23.5 s, the same cause;
--   · min / max of any date column, stored or formula, and of a text formula died on
--     `invalid input syntax for type numeric: "2026-08-01"`;
--   · an as-of total of a stored column took 10.6 s on its first call: every one of 5,000 ids was
--     probed in every monthly history partition, so September's index was read from disk for rows
--     created in October.
-- THE FIX: custom.formula_compile_sql now plans the common shapes as nested custom._fxc_apply calls
-- (each branch formula_eval's own); custom.agg_sql types min/max by custom.agg_field_kind; the
-- as-of door seeks history from the earliest creation of the records it reads, falling back to
-- the whole history for any record with no version there. Proven equal to custom.derived_value on
-- every record of every formula Field, clone and production:
-- scripts/campaign-tests/visionreach_w5_formula_planned_equality.sql.

create function custom._fxc_apply(p_op text, p_vals jsonb[])
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_n     integer := coalesce(cardinality(p_vals), 0);
  v_a     jsonb;
  v_b     jsonb;
  v_one   jsonb;
  v_x     numeric;
  v_y     numeric;
  v_nums  numeric[] := '{}';
  v_s     text;
  v_t     text;
  v_u     text;
  v_an    boolean;
  v_bn    boolean;
  v_c     integer;
  v_i     integer;
  v_d1    timestamp;
  v_d2    timestamp;
  v_do    boolean;
begin
  -- ONE NODE OF A PLANNED FORMULA, its arguments already worked out (VISION-REACH W5, 2026-10-02).
  -- custom.formula_compile_sql writes a formula as nested calls of this function over the row's
  -- values, so the per-node work custom.formula_eval repeats on every record — the node catalogue,
  -- each column's Field look-up, custom.rule_eval's checks — is done ONCE, when the query is
  -- planned. Each branch is custom.formula_eval's own branch for that node, with its helpers
  -- (custom._fx_blank, _fx_truthy, _fx_loose, _fx_num, _fx_text, _fx_num_text, _fx_cmp, _fx_date,
  -- _fx_unit, _fx_iso) written out in place for the values they meet on every row — a JSON number,
  -- a plain string, a boolean, JSON null — because each of those is a function call with its own
  -- search_path and, for _fx_loose and _fx_date, its own subtransaction (measured: _fx_cmp alone
  -- 210 µs a call). Anything rarer (a string that might be a number) still asks the helper itself.
  --
  -- A FAILED ARGUMENT IS SQL NULL; a value never is (formula_eval answers JSON null for "empty").
  -- Where formula_eval raises — a value that is not a number or a date, an unknown unit, dividing
  -- by zero — custom.derived_value answers an empty column; here the same failure is SQL NULL,
  -- carried to the top, which reads as the same empty column. IF, AND and OR short-circuit exactly
  -- as formula_eval does: a failure formula_eval never reaches changes nothing. A cancelled
  -- statement (query_canceled) is never caught. Proven equal to custom.derived_value on every
  -- record of every formula Field, on the clone and on production
  -- (scripts/campaign-tests/visionreach_w5_formula_planned_equality.sql).

  -- ── short-circuit: IF, AND, OR (formula_eval's own order) ─────────────────────────────────
  if p_op = 'fx.if' then
    v_a := p_vals[1];
    if v_a is null then
      return null;
    end if;
    -- custom._fx_truthy
    if (case when v_a = 'null'::jsonb or v_a = '""'::jsonb then false
             when jsonb_typeof(v_a) = 'boolean' then (v_a #>> '{}')::boolean
             when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric <> 0
             else true end) then
      return p_vals[2];
    end if;
    if v_n > 2 then
      return p_vals[3];
    end if;
    return 'null'::jsonb;
  elsif p_op in ('fx.and', 'fx.or') then
    for v_i in 1 .. v_n loop
      v_a := p_vals[v_i];
      if v_a is null then
        return null;
      end if;
      v_an := case when v_a = 'null'::jsonb or v_a = '""'::jsonb then false
                   when jsonb_typeof(v_a) = 'boolean' then (v_a #>> '{}')::boolean
                   when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric <> 0
                   else true end;
      if p_op = 'fx.and' and not v_an then
        return 'false'::jsonb;
      end if;
      if p_op = 'fx.or' and v_an then
        return 'true'::jsonb;
      end if;
    end loop;
    return case when p_op = 'fx.and' then 'true'::jsonb else 'false'::jsonb end;
  end if;

  -- Every other node works every argument out first: one failed argument fails the node.
  if array_position(p_vals, null) is not null then
    return null;
  end if;
  v_a := p_vals[1];
  v_b := p_vals[2];

  -- ── numbers: + − × ÷ % and unary minus ───────────────────────────────────────────────────
  -- custom._fx_num(v) is custom._fx_loose(v) or a refusal: JSON null and "" read 0, a number is
  -- itself, a boolean 1 or 0, a string is parsed by _fx_loose; anything else refuses.
  if p_op in ('fx.add', 'fx.sub', 'fx.mul', 'fx.div', 'fx.mod', 'fx.neg') then
    v_x := case when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric
                when v_a = 'null'::jsonb or v_a = '""'::jsonb then 0
                when jsonb_typeof(v_a) = 'boolean' then case when (v_a #>> '{}')::boolean then 1 else 0 end
                else custom._fx_loose(v_a) end;
    if p_op = 'fx.neg' then
      return case when v_x is null then null else to_jsonb(- v_x) end;
    end if;
    v_y := case when jsonb_typeof(v_b) = 'number' then (v_b #>> '{}')::numeric
                when v_b = 'null'::jsonb or v_b = '""'::jsonb then 0
                when jsonb_typeof(v_b) = 'boolean' then case when (v_b #>> '{}')::boolean then 1 else 0 end
                else custom._fx_loose(v_b) end;
    if v_x is null or v_y is null then
      return null;
    end if;
    return case p_op
      when 'fx.add' then to_jsonb(v_x + v_y)
      when 'fx.sub' then to_jsonb(v_x - v_y)
      when 'fx.mul' then to_jsonb(v_x * v_y)
      -- 'This formula divides by zero.' (22012) in formula_eval
      when 'fx.div' then case when v_y = 0 then null else to_jsonb(trim_scale(v_x / v_y)) end
      else case when v_y = 0 then null else to_jsonb(trim_scale(mod(v_x, v_y))) end
    end;
  end if;

  -- ── comparisons: custom._fx_cmp ──────────────────────────────────────────────────────────
  if p_op in ('fx.eq', 'fx.ne', 'fx.lt', 'fx.lte', 'fx.gt', 'fx.gte') then
    if (v_a = 'null'::jsonb or v_a = '""'::jsonb) and (v_b = 'null'::jsonb or v_b = '""'::jsonb) then
      v_c := 0;
    else
      -- "reads as a number": a JSON number, or a non-blank string _fx_loose can read. A string
      -- with no digit reads as a number only when it is nothing but , space $ € £ ¥ % (→ 0).
      v_an := jsonb_typeof(v_a) = 'number'
              or (jsonb_typeof(v_a) = 'string' and btrim(v_a #>> '{}') <> ''
                  and case when (v_a #>> '{}') ~ '[0-9]' then custom._fx_loose(v_a) is not null
                           else (v_a #>> '{}') ~ '^[,\s$€£¥%]*$' end);
      v_bn := jsonb_typeof(v_b) = 'number'
              or (jsonb_typeof(v_b) = 'string' and btrim(v_b #>> '{}') <> ''
                  and case when (v_b #>> '{}') ~ '[0-9]' then custom._fx_loose(v_b) is not null
                           else (v_b #>> '{}') ~ '^[,\s$€£¥%]*$' end);
      if ((v_a = 'null'::jsonb or v_a = '""'::jsonb) and v_bn)
         or ((v_b = 'null'::jsonb or v_b = '""'::jsonb) and v_an)
         or (v_an and v_bn) then
        v_x := coalesce(case when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric
                             when v_a = 'null'::jsonb or v_a = '""'::jsonb then 0
                             else custom._fx_loose(v_a) end, 0);
        v_y := coalesce(case when jsonb_typeof(v_b) = 'number' then (v_b #>> '{}')::numeric
                             when v_b = 'null'::jsonb or v_b = '""'::jsonb then 0
                             else custom._fx_loose(v_b) end, 0);
        v_c := case when v_x < v_y then -1 when v_x > v_y then 1 else 0 end;
      elsif jsonb_typeof(v_a) = 'boolean' or jsonb_typeof(v_b) = 'boolean' then
        v_an := case when v_a = 'null'::jsonb or v_a = '""'::jsonb then false
                     when jsonb_typeof(v_a) = 'boolean' then (v_a #>> '{}')::boolean
                     when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric <> 0
                     else true end;
        v_bn := case when v_b = 'null'::jsonb or v_b = '""'::jsonb then false
                     when jsonb_typeof(v_b) = 'boolean' then (v_b #>> '{}')::boolean
                     when jsonb_typeof(v_b) = 'number' then (v_b #>> '{}')::numeric <> 0
                     else true end;
        v_c := case when v_an = v_bn then 0 when v_an then 1 else -1 end;
      else
        v_s := case when jsonb_typeof(v_a) = 'null' then ''
                    when jsonb_typeof(v_a) = 'number' then custom._fx_num_text((v_a #>> '{}')::numeric)
                    when jsonb_typeof(v_a) in ('boolean', 'string') then v_a #>> '{}'
                    else v_a::text end;
        v_t := case when jsonb_typeof(v_b) = 'null' then ''
                    when jsonb_typeof(v_b) = 'number' then custom._fx_num_text((v_b #>> '{}')::numeric)
                    when jsonb_typeof(v_b) in ('boolean', 'string') then v_b #>> '{}'
                    else v_b::text end;
        v_c := case when v_s collate "C" < v_t collate "C" then -1
                    when v_s collate "C" > v_t collate "C" then 1 else 0 end;
      end if;
    end if;
    return to_jsonb(case p_op when 'fx.eq' then v_c = 0 when 'fx.ne' then v_c <> 0
                              when 'fx.lt' then v_c < 0 when 'fx.lte' then v_c <= 0
                              when 'fx.gt' then v_c > 0 else v_c >= 0 end);
  end if;

  -- ── text: custom._fx_text of each value ──────────────────────────────────────────────────
  if p_op in ('fx.concatenate', 'fx.upper', 'fx.lower', 'fx.trim', 'fx.len', 'fx.contains') then
    if p_op = 'fx.concatenate' then
      v_s := '';
      foreach v_one in array p_vals loop
        v_s := v_s || case when jsonb_typeof(v_one) = 'null' then ''
                           when jsonb_typeof(v_one) = 'number' then custom._fx_num_text((v_one #>> '{}')::numeric)
                           when jsonb_typeof(v_one) in ('boolean', 'string') then v_one #>> '{}'
                           else v_one::text end;
      end loop;
      return to_jsonb(v_s);
    end if;
    v_s := case when jsonb_typeof(v_a) = 'null' then ''
                when jsonb_typeof(v_a) = 'number' then custom._fx_num_text((v_a #>> '{}')::numeric)
                when jsonb_typeof(v_a) in ('boolean', 'string') then v_a #>> '{}'
                else v_a::text end;
    if p_op = 'fx.contains' then
      v_t := case when jsonb_typeof(v_b) = 'null' then ''
                  when jsonb_typeof(v_b) = 'number' then custom._fx_num_text((v_b #>> '{}')::numeric)
                  when jsonb_typeof(v_b) in ('boolean', 'string') then v_b #>> '{}'
                  else v_b::text end;
      return to_jsonb(strpos(lower(v_s), lower(v_t)) > 0);
    end if;
    return case p_op
      when 'fx.upper' then to_jsonb(upper(v_s))
      when 'fx.lower' then to_jsonb(lower(v_s))
      when 'fx.trim'  then to_jsonb(regexp_replace(v_s, '^\s+|\s+$', '', 'g'))
      else to_jsonb(char_length(v_s))
    end;
  end if;

  if p_op = 'fx.not' then
    return to_jsonb(not (case when v_a = 'null'::jsonb or v_a = '""'::jsonb then false
                              when jsonb_typeof(v_a) = 'boolean' then (v_a #>> '{}')::boolean
                              when jsonb_typeof(v_a) = 'number' then (v_a #>> '{}')::numeric <> 0
                              else true end));
  elsif p_op = 'fx.isblank' then
    return to_jsonb(v_a = 'null'::jsonb or v_a = '""'::jsonb);
  end if;

  -- ── dates: custom._fx_date (an ISO string, read in UTC), _fx_unit, _fx_iso ───────────────
  if p_op in ('fx.datediff', 'fx.dateadd', 'fx.year', 'fx.month', 'fx.day') then
    -- _fx_date: an empty value or anything but a string that reads as a date refuses.
    if jsonb_typeof(v_a) <> 'string' or v_a = '""'::jsonb then
      return null;
    end if;
    v_s := btrim(v_a #>> '{}');
    v_do := v_s ~ '^\d{4}-\d{2}-\d{2}$';
    begin
      if v_do then
        v_d1 := v_s::date::timestamp;
      else
        v_d1 := (v_s::timestamptz at time zone 'UTC');
      end if;
      if p_op = 'fx.year' then
        return to_jsonb(extract(year from v_d1)::integer);
      elsif p_op = 'fx.month' then
        return to_jsonb(extract(month from v_d1)::integer);
      elsif p_op = 'fx.day' then
        return to_jsonb(extract(day from v_d1)::integer);
      end if;
      -- _fx_unit: the third value's text, lower-cased and trimmed, one of the allowed units
      v_one := p_vals[3];
      v_u := lower(btrim(case when jsonb_typeof(v_one) = 'null' then ''
                              when jsonb_typeof(v_one) = 'number' then custom._fx_num_text((v_one #>> '{}')::numeric)
                              when jsonb_typeof(v_one) in ('boolean', 'string') then v_one #>> '{}'
                              else v_one::text end));
      if p_op = 'fx.datediff' then
        if jsonb_typeof(v_b) <> 'string' or v_b = '""'::jsonb then
          return null;
        end if;
        v_t := btrim(v_b #>> '{}');
        if v_t ~ '^\d{4}-\d{2}-\d{2}$' then
          v_d2 := v_t::date::timestamp;
        else
          v_d2 := (v_t::timestamptz at time zone 'UTC');
        end if;
        if not (v_u = any (array['days', 'hours', 'minutes'])) then
          return null;
        end if;
        return to_jsonb(trunc(extract(epoch from (v_d2 - v_d1))
                              / case v_u when 'days' then 86400 when 'hours' then 3600 else 60 end));
      end if;
      -- DATEADD
      v_x := trunc(case when jsonb_typeof(v_b) = 'number' then (v_b #>> '{}')::numeric
                        else custom._fx_num(v_b, '`DATEADD`') end);
      if not (v_u = any (array['days', 'months', 'years'])) then
        return null;
      end if;
      v_d2 := case v_u when 'days' then v_d1 + make_interval(days => v_x::integer)
                       when 'months' then v_d1 + make_interval(months => v_x::integer)
                       else v_d1 + make_interval(years => v_x::integer) end;
      return to_jsonb(case when v_do then to_char(v_d2, 'YYYY-MM-DD')
                           else to_char(v_d2, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end);
    exception when others then
      return null;
    end;
  end if;

  -- ── the rest, as formula_eval writes them, with its own helpers ──────────────────────────
  begin
    case p_op
      when 'fx.sum', 'fx.min', 'fx.max', 'fx.average' then
        foreach v_one in array p_vals loop
          if not (v_one = 'null'::jsonb or v_one = '""'::jsonb) then
            v_nums := v_nums || custom._fx_num(v_one, format('`%s`', upper(substr(p_op, 4))));
          end if;
        end loop;
        if p_op = 'fx.sum' then
          return to_jsonb(coalesce((select sum(x) from unnest(v_nums) x), 0));
        end if;
        if cardinality(v_nums) = 0 then return 'null'::jsonb; end if;
        if p_op = 'fx.min' then return to_jsonb((select min(x) from unnest(v_nums) x)); end if;
        if p_op = 'fx.max' then return to_jsonb((select max(x) from unnest(v_nums) x)); end if;
        return to_jsonb(trim_scale((select sum(x) from unnest(v_nums) x) / cardinality(v_nums)));
      when 'fx.round' then
        v_x := custom._fx_num(v_a, '`ROUND`');
        v_y := case when v_n > 1 then trunc(custom._fx_num(v_b, '`ROUND`')) else 0 end;
        return to_jsonb(round(v_x, v_y::integer));
      when 'fx.abs' then
        return to_jsonb(abs(custom._fx_num(v_a, '`ABS`')));
      when 'fx.left' then
        v_x := trunc(custom._fx_num(v_b, '`LEFT`'));
        return to_jsonb(left(custom._fx_text(v_a), greatest(0, v_x)::integer));
      when 'fx.right' then
        v_x := trunc(custom._fx_num(v_b, '`RIGHT`'));
        if v_x <= 0 then return '""'::jsonb; end if;
        return to_jsonb(right(custom._fx_text(v_a), v_x::integer));
      else
        return null;   -- never planned: custom.formula_compile_sql names every node it hands here
    end case;
  exception when others then
    return null;
  end;
end;
$function$;

create function custom._fxc_eval(p_organization_id uuid, p_expr jsonb, p_values jsonb)
 returns jsonb
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
begin
  -- ONE PART OF A PLANNED FORMULA THAT IS NOT PLANNED, worked out by custom.formula_eval itself
  -- (VISION-REACH W5, 2026-10-02): a function custom._fxc_apply does not write out (FIND,
  -- SUBSTITUTE, REGEX_MATCH, DATETIME_FORMAT, WORKDAY, SWITCH, ARRAYJOIN, ARRAYCOMPACT and any
  -- added later) or a list / relation column (its words, custom.field_words). Only parts that need
  -- nothing of the record but its values are handed here (custom.formula_compile_sql decides), so
  -- no context is built per row. What formula_eval raises is an empty answer, as
  -- custom.derived_value makes it; a refusal about access and a cancelled read still stop the read.
  return coalesce(custom.formula_eval(p_organization_id, p_expr, p_values, '{}'::jsonb), 'null'::jsonb);
exception
  when insufficient_privilege or query_canceled then
    raise;
  when others then
    return null;
end;
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
    select f.data ->> 'type' into v_type
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id();
    if v_type in ('list', 'relation') then
      return v_self;
    end if;
    v_leaf := format('(%s -> %L)', p_values_sql, v_key);
    return format('(case when jsonb_typeof(%1$s) in (''array'', ''object'') then to_jsonb((%1$s)::text) '
                  'else coalesce(%1$s, ''null''::jsonb) end)', v_leaf);
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

create function custom._fxc_context_free(p_expr jsonb)
 returns boolean
 language sql
 immutable
 set search_path to 'pg_catalog'
as $function$
  -- Does this formula (part) need nothing of its record but the record's values? Constants,
  -- columns and the formula language's own functions do — except AUTONUMBER, CREATED_TIME and
  -- MODIFIED_TIME, which read the record itself. Anything else is a Rule node, whose answer can
  -- depend on the record's parent, its siblings or who is acting (custom.rule_context).
  with recursive n(e) as (
    select p_expr
    union all
    select a.value
      from n, jsonb_array_elements(case when jsonb_typeof(n.e) = 'object' and jsonb_typeof(n.e -> 'args') = 'array'
                                        then n.e -> 'args' else '[]'::jsonb end) a
  )
  select coalesce(bool_and(
           jsonb_typeof(n.e) = 'object'
           and ((select array_agg(k order by k) from jsonb_object_keys(n.e) k) in (array['const'], array['field'])
                or (left(coalesce(n.e ->> 'op', ''), 3) = 'fx.'
                    and (n.e ->> 'op') not in ('fx.autonumber', 'fx.created_time', 'fx.modified_time')
                    and (select array_agg(k order by k) from jsonb_object_keys(n.e) k) in (array['op'], array['args', 'op'])))), false)
    from n;
$function$;

create function custom.formula_result_kind(p_organization_id uuid, p_expr jsonb)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_keys  text[];
  v_field jsonb;
  v_res   text;
  v_a     text;
  v_b     text;
begin
  -- WHAT KIND OF VALUE A FORMULA ANSWERS — number, date, text or boolean, NULL when it cannot be
  -- told (VISION-REACH W5, 2026-10-02). Read once per question, never per row. The measure door
  -- uses it so the earliest and latest of "Follow-up due" (a DATEADD) are dates, not a raw
  -- `invalid input syntax for type numeric`. Each node's kind is custom.formula_node_kinds()'s
  -- own `result`; IF is its two branches' kind when they agree; a column is its Field's kind.
  if p_expr is null or jsonb_typeof(p_expr) <> 'object' then
    return null;
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_expr) k;
  if v_keys = array['const'] then
    return case jsonb_typeof(p_expr -> 'const') when 'number' then 'number' when 'string' then 'text'
                                                when 'boolean' then 'boolean' end;
  end if;
  if v_keys = array['field'] then
    if (p_expr ->> 'field') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return null;
    end if;
    select f.data into v_field
      from custom.record f
     where f.organization_id = p_organization_id and f.id = (p_expr ->> 'field')::uuid
       and f.table_id = custom.field_kernel_id() and f.deleted_at is null;
    return custom.field_value_kind(p_organization_id, v_field);
  end if;
  if (p_expr ->> 'op') = 'fx.if' then
    v_a := custom.formula_result_kind(p_organization_id, p_expr -> 'args' -> 1);
    v_b := case when jsonb_array_length(p_expr -> 'args') > 2
                then custom.formula_result_kind(p_organization_id, p_expr -> 'args' -> 2) else v_a end;
    return case when v_a = v_b then v_a end;
  end if;
  select k.result into v_res from custom.formula_node_kinds() k where k.node = p_expr ->> 'op';
  return case when v_res in ('number', 'date', 'text', 'boolean') then v_res end;
end;
$function$;

create function custom.field_value_kind(p_organization_id uuid, p_field_data jsonb)
 returns text
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- The kind of value a Field holds, for a measure: a date (a datetime Field), text, a yes/no, a
  -- number — or, for a formula, what its expression answers (custom.formula_result_kind).
  select case
    when p_field_data is null then null
    when p_field_data ->> 'type' = 'formula' then
      case when custom.parity_type(p_field_data) = 'formula'
                and coalesce(p_field_data -> 'config' ->> 'system', '') = ''
           then custom.formula_result_kind(p_organization_id, p_field_data -> 'config' -> 'expr') end
    when custom.parity_type(p_field_data) = 'datetime' then 'date'
    when p_field_data ->> 'type' = 'boolean' then 'boolean'
    when p_field_data ->> 'type' = 'range' then 'number'
    when p_field_data ->> 'type' = 'text' then 'text'
  end;
$function$;

create function custom.agg_field_kind(p_organization_id uuid, p_table_id uuid, p_key text)
 returns text
 language sql
 stable
 set search_path to 'pg_catalog'
as $function$
  -- The kind of value a Table's column holds, for a measure (custom.field_value_kind): the two
  -- stamps are dates; a key no Field declares has no kind and is measured as before.
  select case
    when p_key in ('created_at', 'updated_at') then 'date'
    else (select custom.field_value_kind(p_organization_id, f.data)
            from custom.record f
           where f.organization_id = p_organization_id
             and f.table_id = custom.field_kernel_id()
             and f.deleted_at is null
             and (f.data ->> 'entity_definition_id')::uuid = p_table_id
             and f.data ->> 'key' = p_key
           order by (f.data ->> 'type' = 'formula') desc
           limit 1)
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
    -- VISION-REACH W3/W5 (2026-10-02): PLANNED ONCE, NOT WORKED OUT PER ROW. When the formula is
    -- one of the common shapes (arithmetic, comparisons, IF/AND/OR, text, dates — the list is in
    -- custom.formula_compile_sql), it is written as ONE SQL expression over the same assembled
    -- values custom.derived_value is handed below — identical answers, a filter on an IF column
    -- over 5,000 visits measured 42 s -> under a second. Any other shape returns NULL here and
    -- keeps the per-row path, unchanged. A who-made-it column (config.system) is never planned:
    -- custom.formula_value answers it from the record's stamps, not from an expression.
    if custom.parity_type(v_field) = 'formula'
       and coalesce(v_field -> 'config' ->> 'system', '') = '' then
      v_sql := custom.formula_compile_sql(p_organization_id, v_field -> 'config' -> 'expr',
        '(case when r.data ? ''_computed'' or r.data ? ''_derived'' '
        'then (r.data - ''_computed'' - ''_retired'' - ''_values'' - ''_sources'' - ''_derived'') '
        '|| custom.computed_block(r.data -> ''_computed'') || custom.computed_block(r.data -> ''_derived'') '
        'else r.data end)');
      if v_sql is not null then
        return format('custom.agg_value_text(%s)', v_sql);
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
$function$
;

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_window jsonb DEFAULT NULL::jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_val        text;
  v_cal        jsonb;
  v_tz         text;
  v_ws         text;
  v_window_sql text := 'true';
  v_read_keys  text[] := '{}';
  v_as         text;
  v_expr       text;
  v_dir        text;
  v_order      text;
  v_i          integer;
  v_lat_key    text[] := '{}';
  v_lat_expr   text[] := '{}';
  v_mom        text;
  v_blank_last text;
  v_kind       text;
  v_moment     text;
  v_label      text;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- VISION-REACH W2: a group is read the way the record read reads it — a FORMULA column has
    -- no stored value, so it is worked out by the read path (custom.agg_field_value_sql).
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_val := format('w.v%s', v_i);
    end if;
    v_group_sel := array_append(v_group_sel, v_val);
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
    v_read_keys := array_append(v_read_keys, v_key);
  end loop;

  -- S3: THE ORGANIZATION'S CALENDAR, read once and only when a date is being cut.
  if (p_bucket is not null and jsonb_typeof(p_bucket) = 'object')
     or (p_window is not null and jsonb_typeof(p_window) = 'object') then
    v_cal := custom.agg_calendar(p_organization_id);
    v_tz  := v_cal ->> 'time_zone';
    v_ws  := v_cal ->> 'week_start';
  end if;

  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_read_keys := array_append(v_read_keys, v_key);
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- VISION-REACH W3: A DATE PERIOD OF A WORKED-OUT COLUMN reads the column as the record read
    -- reads it (custom.agg_field_value_sql, one lateral value a row), so "visits by follow-up
    -- week" buckets the formula's dates instead of one empty period.
    v_mom := custom.agg_moment_sql(v_key, v_tz);
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_mom := replace(v_mom, custom.agg_value_sql(v_key), format('w.v%s', v_i));
    end if;
    v_group_sel := array_append(v_group_sel,
      format('custom.agg_local_label(custom.agg_period_start((%s) at time zone %L, %L, %L), %L)',
             v_mom, v_tz, v_by, v_ws, v_tz));
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- S3: ONE HALF-OPEN WINDOW on one date, read in the SAME calendar as the bucket, so the
  -- window's first bucket and its first day are the same day. `from` and `to` arrive as
  -- moments custom.agg_compare_windows already judged; they are re-cast here, never spliced.
  if p_window is not null and jsonb_typeof(p_window) = 'object' then
    v_key := custom.agg_assert_key(p_window ->> 'key');
    v_read_keys := array_append(v_read_keys, v_key);
    -- VISION-REACH W3: a window on a worked-out date column reads it as the bucket does.
    v_mom := custom.agg_moment_sql(v_key, v_tz);
    v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
    if v_val <> custom.agg_value_sql(v_key) then
      v_i := array_position(v_lat_key, v_key);
      if v_i is null then
        v_lat_key  := array_append(v_lat_key, v_key);
        v_lat_expr := array_append(v_lat_expr, v_val);
        v_i := cardinality(v_lat_key);
      end if;
      v_mom := replace(v_mom, custom.agg_value_sql(v_key), format('w.v%s', v_i));
    end if;
    v_window_sql := format('(%1$s >= %2$L::timestamptz and %1$s < %3$L::timestamptz)',
                           v_mom,
                           (p_window ->> 'from')::timestamptz, (p_window ->> 'to')::timestamptz);
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    -- DRILL-CUSTOM-PARITY: a measure may carry the NAME its answer is keyed by (`as`), so a
    -- measure asked by its contract name (custom.drill_resolve) comes back under that name.
    -- Judged by the same shape rule as a Field key; absent, the label is `<op>_<key>` as before.
    v_as := case when m ? 'as' and nullif(m ->> 'as', '') is not null
                 then custom.agg_assert_key(m ->> 'as') end;
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_expr := 'count(*)::numeric';
      v_meas_sel := array_append(v_meas_sel, quote_literal(coalesce(v_as, 'count')) || ', ' || v_expr);
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_read_keys := array_append(v_read_keys, v_key);
      -- VISION-REACH W2 (the $640 / $1,440 defect, 2026-10-01): A FORMULA IS MEASURED AS IT IS
      -- READ. A formula, lookup or roll-up column has no stored value in `r.data` — it is worked
      -- out when the record is read — so reading `r.data` here summed nothing and answered NULL
      -- under a success. The value now comes from the SAME read path the record read uses
      -- (custom.record_value_one -> custom.derived_value -> custom.formula_eval), so every formula
      -- function, today's and any added later, is measured exactly as it is shown. A plain stored
      -- column is read straight out of the row as before.
      v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
      -- WORKED OUT ONCE A ROW. Every measure and group over the same worked-out column reads ONE
      -- lateral value (`w.v<n>`), so sum + average + maximum of a formula evaluate it once per row,
      -- not three times.
      if v_val <> custom.agg_value_sql(v_key) then
        v_i := array_position(v_lat_key, v_key);
        if v_i is null then
          v_lat_key  := array_append(v_lat_key, v_key);
          v_lat_expr := array_append(v_lat_expr, v_val);
          v_i := cardinality(v_lat_key);
        end if;
        v_val := format('w.v%s', v_i);
      end if;
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      -- VISION-REACH W5 (2026-10-02): A MEASURE IS TYPED BY WHAT THE COLUMN HOLDS. The earliest and
      -- latest of a DATE column — a datetime Field, the two stamps, or a formula answering a date
      -- (DATEADD) — are the earliest and latest moments, answered as the value itself
      -- ("2026-07-15"), where they used to die on `invalid input syntax for type numeric`. A
      -- formula answering TEXT or yes/no takes its first and last in plain character order. Adding
      -- up or averaging a date is refused by the column's name. Everything else is measured as a
      -- number, exactly as before.
      v_kind := null;
      if v_op in ('min', 'max', 'sum', 'avg', 'median') then
        v_kind := custom.agg_field_kind(p_organization_id, p_table_id, v_key);
      end if;
      if v_kind = 'date' and v_op in ('sum', 'avg', 'median') then
        select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') into v_label
          from custom.record f
         where f.organization_id = p_organization_id
           and f.table_id = custom.field_kernel_id()
           and f.deleted_at is null
           and (f.data ->> 'entity_definition_id')::uuid = p_table_id
           and f.data ->> 'key' = v_key
         limit 1;
        raise exception '% holds dates, so it can be counted or its earliest and latest found, but not %.',
          coalesce(v_label, v_key), case v_op when 'sum' then 'added up' else 'averaged' end
          using errcode = '22023', hint = 'Ask for min or max of it, or count. Nothing was measured.';
      end if;
      if v_kind = 'date' and v_op in ('min', 'max') then
        v_tz := coalesce(v_tz, custom.agg_calendar(p_organization_id) ->> 'time_zone');
        -- a value that is not a date has no moment and is passed over, never cast into an error
        v_moment := format(
          '(case when (%1$s) ~ ''^[0-9]{4}-[0-9]{2}-[0-9]{2}$'' and pg_input_is_valid(%1$s, ''date'') '
          'then ((%1$s)::date::timestamp at time zone %2$L) '
          'when pg_input_is_valid(%1$s, ''timestamptz'') then (%1$s)::timestamptz end)',
          v_val, coalesce(v_tz, 'UTC'));
        v_expr := format('(array_agg(%1$s order by %2$s %3$s) filter (where %2$s is not null))[1]',
                         v_val, v_moment, case v_op when 'min' then 'asc' else 'desc' end);
      elsif v_kind in ('text', 'boolean') and v_op in ('min', 'max')
            and v_val <> custom.agg_value_sql(v_key) then
        v_expr := format('%s(nullif(%s, '''') collate "C")', v_op, v_val);
      elsif v_op = 'median' then
        v_expr := format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val);
      elsif v_op = 'filled' then
        v_expr := format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val);
      elsif v_op = 'empty' then
        v_expr := format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val);
      elsif v_op = 'unique' then
        v_expr := format('(count(distinct nullif(%s, '''')))::numeric', v_val);
      else
        v_expr := format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val);
      end if;
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' || v_expr);
    end if;
    -- VISION-REACH W2: TOP-N BY THE MEASURED VALUE. A measure may carry `order` ("desc" or
    -- "asc"); the first one that does orders the groups by its own value ("the five patients
    -- with the highest copay"). Absent, groups come back largest-first by row count, as always.
    if v_order is null and m ? 'order' then
      v_dir := lower(coalesce(m ->> 'order', ''));
      if v_dir not in ('desc', 'asc') then
        raise exception 'A measure is ordered "desc" or "asc", and this one says "%".', m ->> 'order'
          using errcode = '22023',
                hint = 'Leave `order` out to keep the groups largest-first by how many records each has. Nothing was read.';
      end if;
      v_order := format('%s %s nulls last', v_expr, v_dir);
    end if;
  end loop;
  -- S2-PRIME AGG-FIELD-READ: EVERY COLUMN THIS QUESTION READS — a measure's, a group's, the
  -- bucket's and the window's date — is one this reader may read, or the question is refused by
  -- that column's own name. Before this, a sum of a confidential column answered a member who may
  -- not read it. One check, here, so every door built on this SQL inherits it.
  perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, v_read_keys, p_required);

  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- LANE 11 NEED 10a (CHAIR-DOORS-2, 2026-10-02): A BLANK GROUP SORTS LAST. Groups came back
  -- largest-first, so when blank was the most common value it took the first slot, and inside a
  -- small limit it pushed a real value off the end. Every group expression (a Field's value or a
  -- date period's label, both text) now sorts blank (no value or the empty string) after every
  -- real value BEFORE any other order, so a blank never takes a slot a real value could fill.
  if cardinality(v_group_sel) > 0 then
    select string_agg(format('(nullif(%s, %L) is null)', v_group_sel[i], ''), ', ' order by i)
      into v_blank_last
      from generate_subscripts(v_group_sel, 1) i;
  end if;

  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.record r %s
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
       and %s
     %s
     order by %s
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    -- `offset 0` keeps the planner from folding the lateral back into each expression, which would
    -- work the column out once per mention again.
    case when cardinality(v_lat_expr) = 0 then ''
         else 'cross join lateral (select ' ||
              (select string_agg(v_lat_expr[i] || ' as v' || i, ', ') from generate_subscripts(v_lat_expr, 1) i) ||
              ' offset 0) w' end,
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    -- S2-PRIME FILTER-GROUPS: the one fragment, in either shape (flat map or Rule expression).
    custom.record_filter_sql(p_organization_id, p_table_id, p_filter),
    v_window_sql,
    -- DRILL-CUSTOM-PARITY: GROUP BY THE EXPRESSIONS, never by position. The select list has ONE
    -- `groups` column, so `group by 1, 2` named `groups` and then `measures` — an aggregate — and
    -- every question with two groups, or a group and a date period, died with "aggregate
    -- functions are not allowed in GROUP BY" (measured on the main database 2026-09-29).
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || array_to_string(v_group_sel, ', ') end,
    coalesce(v_blank_last || ', ', '') || coalesce(v_order || ', count(*) desc', 'count(*) desc'),
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$
;

CREATE OR REPLACE FUNCTION custom.record_aggregate_as_of(p_organization_id uuid, p_table_id uuid, p_recorded_at timestamp with time zone, p_measure text DEFAULT 'count'::text, p_field_key text DEFAULT NULL::text, p_group_by text DEFAULT NULL::text, p_match jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(bucket text, result numeric, row_count bigint, not_numbers bigint, a_non_number text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
declare
  v_measure text := lower(coalesce(nullif(btrim(p_measure), ''), 'count'));
  v_keys    text[] := '{}';
  v_key     text;
  v_label   text;
  v_ids     uuid[];
  v_from    timestamptz;
begin
  -- A TABLE AS IT STOOD, MEASURED IN THE STORE (VISION-REACH W3, 2026-10-02). "What was the total
  -- copay before this morning's correction" used to be answered by the records tool reading every
  -- page of custom.query_table_as_of into Python and adding it up there. Now it is one statement:
  --   WHICH RECORDS — custom.query_visible_ids, the one ladder, exactly the set the page door reads;
  --   WHICH COLUMNS — every column the question reads (the measured one, the group, each match) is
  --     asked custom.agg_fields_readable_assert, the aggregate door's own refusal, BEFORE anything
  --     is read: a column this reader may not see is refused by its name, as custom.record_aggregate
  --     refuses it;
  --   WHAT IT SAID THEN — each record's latest version at or before the moment (history.row_versions,
  --     the rows history.record_at reads, chosen set-based), then the world clock's value in force
  --     today (history.value_in_force), exactly as custom.query_record_as_of reads one record.
  -- The match is the records tool's: equality ignoring case and surrounding spaces; null means
  -- "had no value".
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate_as_of');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate_as_of');
  if p_recorded_at is null then
    raise exception 'An as-of question needs the moment it is about.' using errcode = '22004',
      hint = 'Send p_recorded_at, e.g. 2026-09-25T17:00:00Z, or ask custom.record_aggregate about now. Nothing was measured.';
  end if;
  if v_measure not in ('count', 'sum', 'avg', 'min', 'max') then
    raise exception '"%" is not a measure an as-of question can take.', p_measure using errcode = '22023',
      hint = 'count, sum, avg, min or max. Nothing was measured.';
  end if;
  if v_measure <> 'count' and nullif(p_field_key, '') is null then
    raise exception 'A % needs the column it measures.', v_measure using errcode = '22004',
      hint = 'Send p_field_key. Nothing was measured.';
  end if;
  if p_match is not null and jsonb_typeof(p_match) not in ('object', 'null') then
    raise exception 'A match is a set of column conditions, like {"status": "Completed"}.' using errcode = '22023',
      hint = 'Nothing was measured.';
  end if;

  if nullif(p_field_key, '') is not null then v_keys := v_keys || custom.agg_assert_key(p_field_key); end if;
  if nullif(p_group_by, '') is not null then v_keys := v_keys || custom.agg_assert_key(p_group_by); end if;
  for v_key in select k from jsonb_object_keys(coalesce(nullif(p_match, 'null'::jsonb), '{}'::jsonb)) k loop
    v_keys := v_keys || custom.agg_assert_key(v_key);
  end loop;
  perform custom.agg_fields_readable_assert(p_organization_id, p_table_id, v_keys, 'viewer');

  -- A column worked out on read is not in a past version of the record.
  select coalesce(nullif(f.data ->> 'label', ''), f.data ->> 'key') into v_label
    from custom.record f
   where f.organization_id = p_organization_id
     and f.table_id = custom.field_kernel_id()
     and f.deleted_at is null
     and (f.data ->> 'entity_definition_id')::uuid = p_table_id
     and f.data ->> 'key' = any (v_keys)
     and f.data ->> 'type' = 'formula'
   limit 1;
  if v_label is not null then
    raise exception '% is worked out when a record is read, and a past version of a record does not carry it, so it cannot be measured as of a moment.', v_label
      using errcode = '22023', hint = 'Ask without as_of to measure it now. Nothing was measured.';
  end if;

  select coalesce(array_agg(v), '{}'::uuid[]) into v_ids
    from custom.query_visible_ids(p_organization_id, p_table_id, 'viewer') v;

  -- VISION-REACH W5 (2026-10-02): THE HISTORY IS READ FROM WHERE THESE RECORDS BEGIN. Every id was
  -- probed in every monthly history partition, so a first call over 5,000 visits read September's
  -- whole index from disk for rows created in October (10.6 s, past the statement limit). Now the
  -- versions are first sought from the earliest of these records' own creation onward (`near`,
  -- which prunes the older partitions): a record with any version in that range has its latest
  -- version at or before the moment there, so its answer is the same. Only a record with no
  -- version there (none is expected; one imported with a later creation stamp could be) is sought
  -- in the whole history (`far`), exactly as before.
  select min(r.created_at) into v_from
    from custom.record r
   where r.organization_id = p_organization_id
     and r.id = any (v_ids);

  return query
  with near as materialized (
    select distinct on (rv.row_id) rv.row_id,
           coalesce(rv.row_data -> 'data', rv.row_data) as d
      from history.row_versions rv
     where rv.entity_type = 'custom.record'
       and rv.organization_id = p_organization_id
       and rv.row_id = any (v_ids)
       and rv.occurred_at <= p_recorded_at
       and rv.occurred_at >= v_from
     order by rv.row_id, rv.occurred_at desc, rv.id desc
  ), far as (
    select distinct on (rv.row_id) rv.row_id,
           coalesce(rv.row_data -> 'data', rv.row_data) as d
      from history.row_versions rv
     where rv.entity_type = 'custom.record'
       and rv.organization_id = p_organization_id
       and rv.row_id = any (array(select u.id from unnest(v_ids) u(id)
                                   where not exists (select 1 from near n where n.row_id = u.id)))
       and rv.occurred_at <= p_recorded_at
     order by rv.row_id, rv.occurred_at desc, rv.id desc
  ), doc as (
    select near.row_id, near.d from near
    union all
    select far.row_id, far.d from far
  ), val as (
    select d,
           custom.agg_value_text(history.value_in_force(d, p_field_key, current_date) -> 'value') as x,
           custom.agg_value_text(history.value_in_force(d, p_group_by, current_date) -> 'value') as g
      from doc
     where d is not null
       and not exists (
         select 1 from jsonb_each(coalesce(nullif(p_match, 'null'::jsonb), '{}'::jsonb)) w
          where case when jsonb_typeof(w.value) = 'null'
                     then custom.agg_value_text(history.value_in_force(d, w.key, current_date) -> 'value') is not null
                     else lower(btrim(coalesce(custom.agg_value_text(history.value_in_force(d, w.key, current_date) -> 'value'), '')))
                          <> lower(btrim(w.value #>> '{}')) end)
  )
  select case when nullif(p_group_by, '') is null then 'all' else val.g end,
         case v_measure
           when 'count' then count(*)::numeric
           when 'sum' then sum(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           when 'avg' then avg(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           when 'min' then min(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
           else max(case when val.x ~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$' then val.x::numeric end)
         end,
         count(*)::bigint,
         count(*) filter (where nullif(val.x, '') is not null and val.x !~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$')::bigint,
         min(val.x) filter (where nullif(val.x, '') is not null and val.x !~ '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$')
    from val
   group by 1;
end;
$function$
;


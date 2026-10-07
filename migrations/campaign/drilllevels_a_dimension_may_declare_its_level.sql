-- chair-step: lane DRILL-LEVELS (Arman 2026-10-07: "The point of a drilldown is to take you to a table that then gives you further information about that thing") — A DIMENSION MAY DECLARE ITS LEVEL. Replaces ONE body of the read door, the validator platform.drill_definition_problems, adding the LEVELS block (each Dimension's optional level: breakouts, show, attributes, records — every key a reference the definition answers). Nothing else in the body changes. No table, policy, grant or row of anybody's data is touched.
-- lane: DRILL-LEVELS
-- lock: platform
-- based-on: platform.drill_definition_problems(jsonb) 11291cd9106934d7336463f1f9431d9c803058b33713b09b3c6ac11e3fa2b612
-- (based-on hash: pg_get_functiondef on PRODUCTION, read-only, 2026-10-07)
--
-- drill_describe already hands a declared definition to the screen whole, so a Dimension's `level`
-- reaches the explorer with no other body changed; drill_ask and drill_rows never read it.
-- Apply BEFORE migrations/campaign/drilllevels_*_definitions.sql (the declared definitions that carry levels).

CREATE OR REPLACE FUNCTION platform.drill_definition_problems(p_def jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_ident  constant text := '^[a-z][a-z0-9_]{0,62}$';
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','percentile','rate','filled','empty'];
  c_kinds  constant text[] := array['choice','relation','boolean','text','time'];
  c_grains constant text[] := array['year','quarter','month','week','day','hour'];
  c_lanes  constant text[] := array['mine','organization','platform'];
  p        text[] := '{}';
  v_key    text;
  v_fact   record;
  v_mode   text;
  v_lane   text;
  v_rule   jsonb;
  j        jsonb;
  d        jsonb;
  m        jsonb;
  v_alias  jsonb := '{}'::jsonb;   -- alias -> {schema, table}
  v_col    jsonb;
  v_from   text;
  v_a      text;
  v_c      text;
  v_fk     jsonb;
  v_dims   text[] := '{}';
  v_meas   text[] := '{}';
  v_lvl    text;
  v_x      text;
  v_rec    record;
  v_rcol   jsonb;
  v_wm     regclass;
  v_keys   text[];
  f        jsonb;
  h        jsonb;
  v_fkey   text;
begin
  if p_def is null or jsonb_typeof(p_def) <> 'object' then
    return array['A drill definition is a JSON object.'];
  end if;
  v_key := p_def ->> 'key';
  if v_key is null or v_key !~ c_ident then
    p := p || format('"%s" is not a definition key: a lower-case letter, then letters, digits or underscores.', coalesce(v_key, ''));
  end if;
  if coalesce(btrim(p_def ->> 'label'), '') = '' then
    p := p || 'A definition needs a label a person reads, such as "AI usage".'::text;
  end if;

  select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.is_active
    into v_fact from platform.entity_types e where e.token = p_def ->> 'fact';
  if v_fact.token is null then
    return p || format('The fact "%s" is not a table in the registry; name its registry token.', coalesce(p_def ->> 'fact', ''));
  end if;
  if not v_fact.is_active then
    p := p || format('The table "%s" has been retired.', v_fact.token);
  end if;
  if v_fact.type in ('restricted', 'deprecated') or v_fact.data_class = 'confidential' then
    p := p || format('"%s" is a %s table; it is never offered for drilling.', v_fact.token,
                     case when v_fact.data_class = 'confidential' then 'Confidential' else initcap(v_fact.type) end);
  end if;
  if v_key is not null and v_key <> v_fact.token
     and exists (select 1 from platform.entity_types e where e.token = v_key) then
    p := p || format('"%s" is already the registry token of another table. A definition keyed by a token overrides THAT table; a fact over several tables takes a key of its own.', v_key);
  end if;
  v_alias := jsonb_build_object('', jsonb_build_object('schema', v_fact.schema_name, 'table', v_fact.table_name));

  v_mode := coalesce(p_def ->> 'mode', 'invoker');
  if v_mode not in ('invoker', 'definer') then
    p := p || format('"%s" is not a mode: invoker (the table''s own row security decides, the default) or definer.', v_mode);
  end if;

  -- LANES. A definer definition reads past row security, so it must say, for EVERY lane it
  -- offers, the one rule that narrows it — from a closed vocabulary, never a SQL fragment.
  if jsonb_typeof(p_def -> 'lanes') is distinct from 'array' or jsonb_array_length(p_def -> 'lanes') = 0 then
    p := p || 'A definition lists its lanes: some of mine, organization, platform.'::text;
  else
    for v_lane in select x #>> '{}' from jsonb_array_elements(p_def -> 'lanes') x loop
      if not (v_lane = any (c_lanes)) then
        p := p || format('"%s" is not a lane: mine, organization or platform.', v_lane);
        continue;
      end if;
      if v_mode = 'definer' then
        v_rule := p_def -> 'lane_rules' -> v_lane;
        if v_rule is null or jsonb_typeof(v_rule) <> 'object' then
          p := p || format('This definition reads past row security, and its %s lane names no rule that narrows it. Every lane of a definer definition says how it narrows: mine {"column": <person column>}, organization {"column": <organization column>, "rule": "member" | "admin"}, platform {"rule": "super_admin"}.', v_lane);
        elsif v_lane in ('mine', 'organization') then
          v_col := platform._drill_column(v_fact.schema_name, v_fact.table_name, v_rule ->> 'column');
          if v_col is null or v_col ->> 'cat' <> 'uuid' then
            p := p || format('The %s lane''s column "%s" is not a uuid column of %s.%s.', v_lane, coalesce(v_rule ->> 'column', ''), v_fact.schema_name, v_fact.table_name);
          end if;
          if v_lane = 'organization' and coalesce(v_rule ->> 'rule', '') not in ('member', 'admin') then
            p := p || 'The organization lane''s rule is "member" (any member of the organization) or "admin" (its owners and admins).'::text;
          end if;
        elsif v_lane = 'platform' and coalesce(v_rule ->> 'rule', '') <> 'super_admin' then
          p := p || 'The platform lane''s rule is "super_admin".'::text;
        end if;
      end if;
    end loop;
  end if;
  if v_mode = 'invoker' and p_def ? 'lane_rules' then
    p := p || 'lane_rules belong to a definer definition only; an invoker definition is narrowed by the table''s own row security.'::text;
  end if;
  -- A definition keyed by its fact's own token overrides that table and keeps its row security —
  -- unless the fact is System machinery no client reads at all (a server-only rollup or records
  -- view): there is no row security to keep, so it is asked definer, every lane's rule compiled in.
  if v_mode = 'definer' and v_key = v_fact.token and v_fact.type is distinct from 'system' then
    p := p || 'An override of one table keeps that table''s own row security; only a fact over several tables, or a System fact no client reads, may be a definer definition.'::text;
  end if;
  if v_mode = 'definer' and exists (select 1 from jsonb_object_keys(coalesce(p_def -> 'lane_rules', '{}'::jsonb)) k
                                      where not (k = any (select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'lanes', '[]'::jsonb)) x))) then
    p := p || 'lane_rules names a lane the definition does not offer.'::text;
  end if;

  -- JOINS: a star, many-to-one only, each along a real foreign key.
  for j in select x from jsonb_array_elements(coalesce(p_def -> 'joins', '[]'::jsonb)) x loop
    if coalesce(j ->> 'as', '') !~ c_ident or v_alias ? (j ->> 'as') then
      p := p || format('The join "%s" needs a new name of its own.', coalesce(j ->> 'as', ''));
      continue;
    end if;
    v_from := coalesce(j ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    if not v_alias ? v_a then
      p := p || format('The join "%s" starts from "%s", which is neither the fact nor an earlier join.', j ->> 'as', v_from);
      continue;
    end if;
    v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, j ->> 'token');
    if v_fk is null or v_fk ->> 'token' is distinct from j ->> 'token' then
      p := p || format('The join "%s" must follow a foreign key from %s to the table "%s" names; there is none, so it could fan out.', j ->> 'as', v_from, coalesce(j ->> 'token', ''));
      continue;
    end if;
    select e.type, e.data_class::text into v_x, v_lvl from platform.entity_types e where e.token = j ->> 'token';
    if v_x in ('restricted', 'deprecated') or v_lvl = 'confidential' then
      p := p || format('The join "%s" reaches a %s table, which is never offered for drilling.', j ->> 'as', coalesce(v_lvl, v_x));
    end if;
    -- A definer definition narrows only its FACT by the lane rule; a joined row is read with the
    -- definer's rights, so a definer join may reach only Reference data (the same for everyone).
    if v_mode = 'definer' and v_x is distinct from 'reference' then
      p := p || format('The join "%s" reaches "%s", which is not Reference data. A definition that reads past row security may join only Reference tables, because the lane rule narrows the fact alone.', j ->> 'as', j ->> 'token');
    end if;
    v_alias := v_alias || jsonb_build_object(j ->> 'as', jsonb_build_object('schema', v_fk ->> 'schema', 'table', v_fk ->> 'table'));
  end loop;

  -- DIMENSIONS and MEASURES: every column they read is a real one and may be read.
  for d in select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]'::jsonb)) x loop
    if coalesce(d ->> 'key', '') !~ c_ident or (d ->> 'key') = any (v_dims) or d ->> 'key' = 'other' then
      p := p || format('The dimension "%s" needs a key of its own (lower case, letters, digits, underscores).', coalesce(d ->> 'key', ''));
      continue;
    end if;
    v_dims := v_dims || (d ->> 'key');
    if not coalesce(d ->> 'kind', '') = any (c_kinds) then
      p := p || format('The dimension "%s" has no kind: choice, relation, boolean, text or time.', d ->> 'key');
    end if;
    v_from := coalesce(d ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
    if v_col is null then
      p := p || format('The dimension "%s" reads "%s", which is not a column of the fact or of a join.', d ->> 'key', v_from);
    elsif (v_col ->> 'excluded')::boolean then
      p := p || format('The dimension "%s" reads "%s", a column that is never offered (kept from clients, governed, or a row-access column).', d ->> 'key', v_from);
    elsif (v_col ->> 'array')::boolean or v_col ->> 'cat' = 'other' then
      p := p || format('The dimension "%s" reads "%s" (%s), which cannot be grouped by.', d ->> 'key', v_from, v_col ->> 'type');
    elsif d ->> 'kind' = 'time' and v_col ->> 'cat' <> 'time' then
      p := p || format('The dimension "%s" is a time but "%s" is %s.', d ->> 'key', v_from, v_col ->> 'type');
    end if;
    if d ? 'empty_label' and (jsonb_typeof(d -> 'empty_label') <> 'string' or btrim(d ->> 'empty_label') = '') then
      p := p || format('The dimension "%s": empty_label is the words its empty group reads ("No embedding").', d ->> 'key');
    end if;
    if d ? 'choices' and (jsonb_typeof(d -> 'choices') <> 'array' or exists (
         select 1 from jsonb_array_elements(d -> 'choices') c
          where jsonb_typeof(c) <> 'object' or jsonb_typeof(c -> 'value') <> 'string' or coalesce(btrim(c ->> 'label'), '') = '')) then
      p := p || format('The dimension "%s": choices is a list of {value, label} a person reads.', d ->> 'key');
    end if;
    -- (lane DRILL-PARITY-LAST) a choice may keep one colour everywhere: a chart token, never a raw colour
    if jsonb_typeof(d -> 'choices') = 'array' and exists (
         select 1 from jsonb_array_elements(d -> 'choices') c
          where jsonb_typeof(c) = 'object' and c ? 'color' and coalesce(c ->> 'color', '') !~ '^--matrx-chart-([1-9]|10|other)$') then
      p := p || format('The dimension "%s": a choice''s color is a chart token, --matrx-chart-1 … --matrx-chart-10 or --matrx-chart-other.', d ->> 'key');
    end if;
    if d ->> 'kind' = 'time' and d ? 'grains' and exists (
         select 1 from jsonb_array_elements_text(d -> 'grains') g where not (g = any (c_grains))) then
      p := p || format('The dimension "%s" names a grain that is not one of %s.', d ->> 'key', array_to_string(c_grains, ', '));
    end if;
  end loop;

  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x loop
    if coalesce(m ->> 'key', '') !~ c_ident or (m ->> 'key') = any (v_meas) then
      p := p || format('The measure "%s" needs a key of its own.', coalesce(m ->> 'key', ''));
      continue;
    end if;
    v_meas := v_meas || (m ->> 'key');
    -- (lane DRILL-GAPS) a scale multiplies a ratio or a run rate only
    if m ? 'scale' and (m ->> 'op' not in ('ratio', 'rate') or jsonb_typeof(m -> 'scale') <> 'number' or (m ->> 'scale')::numeric <= 0) then
      p := p || format('The measure "%s": scale is a number above 0 that multiplies a ratio or a run rate (1000 = per 1,000).', m ->> 'key');
    end if;
    -- (lane DRILL-PARITY-LAST) a moment: the latest (max) or earliest (min) of a time column, never added up
    if m ->> 'unit' = 'time' and (coalesce(m ->> 'op', '') not in ('min', 'max') or coalesce((m ->> 'additive')::boolean, false)) then
      p := p || format('The measure "%s" is a moment (unit time): the max or min of a time column, never added up.', m ->> 'key');
    end if;
    if m ->> 'op' in ('ratio', 'sum_of') then
      if m ? 'where' then
        p := p || case when m ->> 'op' = 'ratio'
          then format('The ratio "%s" is narrowed through its parts (each part may have its own where), not a where of its own.', m ->> 'key')
          else format('The sum "%s" is narrowed through its parts (each part may have its own where), not a where of its own.', m ->> 'key') end;
      end if;
      continue;   -- judged below, once every measure key is known
    end if;
    if not coalesce(m ->> 'op', '') = any (c_ops) then
      p := p || format('The measure "%s" has no operation it can use: %s, ratio, sum_of.', m ->> 'key', array_to_string(c_ops, ', '));
      continue;
    end if;
    -- (lane DRILL-GAPS) a Measure's own where: dimension key -> a value, null or a list, never a time
    if m ? 'where' then
      if jsonb_typeof(m -> 'where') <> 'object' or m -> 'where' = '{}'::jsonb then
        p := p || format('The measure "%s": where is an object of dimension key -> value (a value, null or a list).', m ->> 'key');
      else
        for v_x, h in select key, value from jsonb_each(m -> 'where') loop
          d := (select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]'::jsonb)) x where x ->> 'key' = v_x);
          if d is null or d ->> 'kind' = 'time' then
            p := p || format('The measure "%s" is narrowed by "%s", which is not a dimension that is not a time.', m ->> 'key', v_x);
          elsif jsonb_typeof(h) = 'object' or (jsonb_typeof(h) = 'array' and exists (
                  select 1 from jsonb_array_elements(h) y where jsonb_typeof(y) in ('object', 'array'))) then
            p := p || format('The measure "%s" is narrowed by %s with a value, null or a list of values.', m ->> 'key', v_x);
          end if;
        end loop;
      end if;
    end if;
    if m ->> 'op' = 'percentile' and (jsonb_typeof(m -> 'p') is distinct from 'number' or (m ->> 'p')::numeric <= 0 or (m ->> 'p')::numeric >= 1) then
      p := p || format('The percentile "%s" names p, a fraction above 0 and below 1 (0.9 = p90).', m ->> 'key');
    end if;
    if m ->> 'op' <> 'percentile' and m ? 'p' then
      p := p || format('The measure "%s": p belongs to a percentile.', m ->> 'key');
    end if;
    if m ->> 'op' = 'rate' and coalesce(m ->> 'per', '') not in ('day', 'month') then
      p := p || format('The run rate "%s" names per: day, or month (30 days).', m ->> 'key');
    end if;
    if m ->> 'op' <> 'rate' and m ? 'per' then
      p := p || format('The measure "%s": per belongs to a run rate.', m ->> 'key');
    end if;
    if m ->> 'op' in ('percentile', 'rate') and m ? 'at_grain' then
      p := p || format('The measure "%s" (%s) cannot be counted once per another column.', m ->> 'key', m ->> 'op');
    end if;
    if m ->> 'op' = 'count' then
      if m ? 'of' then p := p || format('The measure "%s" counts rows, so it reads no column.', m ->> 'key'); end if;
      continue;
    end if;
    foreach v_from in array array[m ->> 'of', m ->> 'at_grain'] loop
      continue when v_from is null and m ? 'of';
      if v_from is null then
        p := p || format('The measure "%s" (%s) names no column.', m ->> 'key', m ->> 'op');
        continue;
      end if;
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
      if v_col is null then
        p := p || format('The measure "%s" reads "%s", which is not a column of the fact or of a join.', m ->> 'key', v_from);
      elsif (v_col ->> 'excluded')::boolean then
        p := p || format('The measure "%s" reads "%s", a column that is never offered.', m ->> 'key', v_from);
      elsif v_from = m ->> 'of' and m ->> 'op' in ('sum', 'avg', 'median', 'percentile', 'rate') and v_col ->> 'cat' <> 'number' then
        p := p || format('The measure "%s" adds up "%s", which is %s, not a number.', m ->> 'key', v_from, v_col ->> 'type');
      elsif v_from = m ->> 'of' and m ->> 'op' in ('min', 'max') and v_col ->> 'cat' not in ('number', 'time') then
        p := p || format('The measure "%s" takes the %s of "%s", which is neither a number nor a time.', m ->> 'key', m ->> 'op', v_from);
      elsif v_from = m ->> 'of' and m ->> 'op' in ('min', 'max') and v_col ->> 'cat' = 'time' and coalesce(m ->> 'unit', '') <> 'time' then
        p := p || format('The measure "%s" takes the %s of the time "%s": its unit is "time", so a screen reads it as a moment.', m ->> 'key', m ->> 'op', v_from);
      elsif v_from = m ->> 'of' and m ->> 'unit' = 'time' and v_col ->> 'cat' <> 'time' then
        p := p || format('The measure "%s" is a moment, but "%s" is %s.', m ->> 'key', v_from, v_col ->> 'type');
      end if;
    end loop;
  end loop;
  if cardinality(v_meas) = 0 then
    p := p || 'A definition needs at least one measure (a count is enough).'::text;
  end if;
  -- RATIO: (the sum of num) / (the sum of den) × scale; each part a measure of this definition that
  -- adds up (sum or count, optionally narrowed by its own where) or another ratio (lane DRILL-GAPS:
  -- den may be a list — hits ÷ (hits + calls) —, a part may be a ratio — the enrichment multiplier).
  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x where x ->> 'op' = 'ratio' loop
    if m ? 'of' or m ? 'at_grain' then
      p := p || format('The ratio "%s" is made of other measures (num and den), so it reads no column itself.', m ->> 'key');
    end if;
    if jsonb_typeof(m -> 'num') is distinct from 'array' or jsonb_array_length(m -> 'num') = 0
       or not (jsonb_typeof(m -> 'den') = 'string' or (jsonb_typeof(m -> 'den') = 'array' and jsonb_array_length(m -> 'den') > 0))
       or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(m -> 'den') = 'array' then m -> 'num' || (m -> 'den') else m -> 'num' end) y where jsonb_typeof(y) <> 'string') then
      p := p || format('The ratio "%s" names its parts: num (a list of measure keys, added up) and den (one measure key, or a list added up).', m ->> 'key');
      continue;
    end if;
    for v_x in select x #>> '{}' from jsonb_array_elements(m -> 'num') x
               union all select x #>> '{}' from jsonb_array_elements(case when jsonb_typeof(m -> 'den') = 'array' then m -> 'den' else jsonb_build_array(m -> 'den') end) x loop
      h := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = v_x);
      if h is null then
        p := p || format('The ratio "%s" names "%s", which is not a measure of this definition.', m ->> 'key', v_x);
      elsif h ->> 'op' in ('ratio', 'sum_of') then
        null;   -- a ratio of ratios (or of a sum): its own parts are judged where it is declared
      elsif not (h ->> 'op' in ('sum', 'count') and coalesce((h ->> 'additive')::boolean, true)) or h ? 'at_grain' then
        p := p || format('The ratio "%s" is made of "%s", which does not add up (a part is a sum, a count or another ratio).', m ->> 'key', v_x);
      end if;
    end loop;
    begin
      perform platform._drill_measure_plan(p_def, m ->> 'key');
    exception when others then
      p := p || format('The ratio "%s": %s', m ->> 'key', sqlerrm);
    end;
  end loop;

  -- SUM OF MEASURES (lane DRILL-PARITY-LAST): the parts added up, per group, Other and the total —
  -- total tokens = input + cached + output. Each part adds up (a sum or a count) or is another sum.
  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x where x ->> 'op' = 'sum_of' loop
    if m ? 'of' or m ? 'at_grain' or m ? 'num' or m ? 'den' or m ? 'scale' then
      p := p || format('The sum "%s" is made of other measures (parts), so it reads no column, num, den or scale itself.', m ->> 'key');
    end if;
    if jsonb_typeof(m -> 'parts') is distinct from 'array' or jsonb_array_length(m -> 'parts') < 2
       or exists (select 1 from jsonb_array_elements(m -> 'parts') y where jsonb_typeof(y) <> 'string') then
      p := p || format('The sum "%s" names its parts: a list of at least two measure keys, added up.', m ->> 'key');
      continue;
    end if;
    for v_x in select x #>> '{}' from jsonb_array_elements(m -> 'parts') x loop
      h := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = v_x);
      if h is null then
        p := p || format('The sum "%s" names "%s", which is not a measure of this definition.', m ->> 'key', v_x);
      elsif h ->> 'op' = 'sum_of' then
        null;
      elsif not (h ->> 'op' in ('sum', 'count') and coalesce((h ->> 'additive')::boolean, true)) or h ? 'at_grain' then
        p := p || format('The sum "%s" is made of "%s", which does not add up (a part is a sum, a count or another sum).', m ->> 'key', v_x);
      end if;
    end loop;
    begin
      perform platform._drill_measure_plan(p_def, m ->> 'key');
    exception when others then
      p := p || format('The sum "%s": %s', m ->> 'key', sqlerrm);
    end;
  end loop;

  for d in select x from jsonb_array_elements(coalesce(p_def -> 'paths', '[]'::jsonb)) x loop
    for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(d -> 'levels', '[]'::jsonb)) x loop
      if not split_part(v_lvl, ':', 1) = any (v_dims) then
        p := p || format('The drill path "%s" names "%s", which is not a dimension of this definition.', coalesce(d ->> 'key', ''), v_lvl);
      end if;
    end loop;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    if not split_part(v_lvl, ':', 1) = any (v_dims) then
      p := p || format('The first screen groups by "%s", which is not a dimension.', v_lvl);
    end if;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'show', '[]'::jsonb)) x loop
    if not v_lvl = any (v_meas) then
      p := p || format('The first screen shows "%s", which is not a measure.', v_lvl);
    end if;
  end loop;
  if p_def ? 'default' then
    p := p || platform._drill_question_problems(p_def, p_def -> 'default', 'The first screen');
  end if;

  -- RECORDS (decision 14): the relation the records behind a definer definition's numbers are read
  -- from — the same filter compiler and the same lane rule, so every column the definition reads
  -- must be a column of it too, of the same kind.
  if p_def ? 'records' then
    if jsonb_typeof(p_def -> 'records') <> 'object' or jsonb_typeof(p_def -> 'records' -> 'columns') is distinct from 'array'
       or jsonb_array_length(p_def -> 'records' -> 'columns') = 0 then
      p := p || 'records is {"fact": <registry token of the records relation>, "columns": [the columns a record shows]}.'::text;
    else
      -- (lane DRILL-GAPS) an invoker definition may declare records too: they are its own rows
      -- (records.fact = its fact), read as the person, among the columns it already reads
      if v_mode <> 'definer' then
        if p_def -> 'records' ->> 'fact' is distinct from p_def ->> 'fact' then
          p := p || 'Records read from another relation belong to a definer definition only; an invoker definition''s records are its own rows (records.fact is its own fact), read as the person.'::text;
        end if;
        for v_x in select x #>> '{}' from jsonb_array_elements(p_def -> 'records' -> 'columns') x loop
          if not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'detail' -> 'columns', '[]')) y where y #>> '{}' = v_x)
             and not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) y where y ->> 'from' = v_x)
             and not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) y where y ->> 'of' = v_x) then
            p := p || format('The record column "%s" is not one this invoker definition reads (a detail column, a dimension''s or a measure''s).', v_x);
          end if;
        end loop;
      end if;
      select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.is_active
        into v_rec from platform.entity_types e where e.token = p_def -> 'records' ->> 'fact';
      if v_rec.token is null or not v_rec.is_active then
        p := p || format('The records relation "%s" is not an active table in the registry.', coalesce(p_def -> 'records' ->> 'fact', ''));
      elsif v_rec.type in ('restricted', 'deprecated') or v_rec.data_class = 'confidential' then
        p := p || format('The records relation "%s" is a %s table; it is never offered.', v_rec.token, coalesce(v_rec.data_class, v_rec.type));
      else
        for v_from in
          select x ->> 'from' from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) x
          union select x ->> 'of' from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) x where x ? 'of'
          union select x ->> 'at_grain' from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) x where x ? 'at_grain'
          union select e.x ->> 'column' from jsonb_each(coalesce(p_def -> 'lane_rules', '{}')) e(k, x) where e.x ? 'column'
          union select x ->> 'from' from jsonb_array_elements(coalesce(p_def -> 'joins', '[]')) x
        loop
          continue when v_from is null or position('.' in v_from) > 0;   -- a joined column is read from its join
          v_col := platform._drill_column(v_fact.schema_name, v_fact.table_name, v_from);
          v_rcol := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_from);
          if v_rcol is null then
            p := p || format('The records relation "%s" has no column "%s", which this definition reads; one filter must serve the number and its records.', v_rec.token, v_from);
          elsif v_col is not null and v_col ->> 'cat' is distinct from v_rcol ->> 'cat' then
            p := p || format('"%s" is %s on the fact but %s on the records relation "%s".', v_from, v_col ->> 'type', v_rcol ->> 'type', v_rec.token);
          end if;
        end loop;
        v_keys := '{}';
        for v_x in select x #>> '{}' from jsonb_array_elements(p_def -> 'records' -> 'columns') x loop
          v_rcol := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_x);
          if v_x !~ c_ident or v_rcol is null then
            p := p || format('The records relation "%s" has no column "%s".', v_rec.token, v_x);
          elsif (v_rcol ->> 'excluded')::boolean then
            p := p || format('The record column "%s" is never offered (kept from clients, governed, or a row-access column).', v_x);
          end if;
          if v_x = any (v_keys) then
            p := p || format('The record column "%s" is listed twice.', v_x);
          end if;
          v_keys := v_keys || v_x;
        end loop;
        if p_def -> 'records' ? 'labels' and (jsonb_typeof(p_def -> 'records' -> 'labels') <> 'object'
             or exists (select 1 from jsonb_each(p_def -> 'records' -> 'labels') l
                         where not (l.key = any (v_keys)) or jsonb_typeof(l.value) <> 'string' or btrim(l.value #>> '{}') = '')) then
          p := p || 'records.labels names, for columns it lists, the words a person reads ({"model": "Request''s top model"}).'::text;
        end if;
        v_wm := to_regclass(format('%I.%I', v_fact.schema_name, v_fact.table_name || '_watermark'));
        if v_wm is not null and platform._drill_column(v_rec.schema_name, v_rec.table_name, 'created_at') ->> 'cat' is distinct from 'time' then
          p := p || format('The fact "%s" says how far it has counted, so its records relation "%s" needs a created_at moment to be cut at the same instant.', v_fact.token, v_rec.token);
        end if;
      end if;
    end if;
  end if;

  -- THE STALE LINE (decision 25): the setting that says when the fact's "as of" is old.
  if p_def ? 'stale_after_knob' and jsonb_typeof(p_def -> 'stale_after_knob') <> 'null' then
    if jsonb_typeof(p_def -> 'stale_after_knob') <> 'string' or (p_def ->> 'stale_after_knob') !~ '^drill(\.[a-z0-9_]+){2,}$' then
      p := p || 'stale_after_knob is the address of a drill setting, such as drill.usage.stale_after_minutes.'::text;
    end if;
    if to_regclass(format('%I.%I', v_fact.schema_name, v_fact.table_name || '_watermark')) is null then
      p := p || format('The fact "%s" keeps no record of how far it has counted (%s.%s_watermark), so a stale line has nothing to measure.', v_fact.token, v_fact.schema_name, v_fact.table_name);
    end if;
  end if;

  -- LEVELS (lane DRILL-LEVELS): a Dimension may declare what a drilled value of it offers and says —
  -- breakouts (Dimension references), show (Measure keys), attributes (Dimension keys each value holds
  -- one of) and records (record columns). Every key is a reference this definition can answer.
  for f in select x from jsonb_array_elements(case when jsonb_typeof(p_def -> 'dimensions') = 'array' then p_def -> 'dimensions' else '[]'::jsonb end) x
            where jsonb_typeof(x) = 'object' and x ? 'level' loop
    if jsonb_typeof(f -> 'level') <> 'object' then
      p := p || format('The level of "%s" is {breakouts, show, attributes, records}.', f ->> 'key');
      continue;
    end if;
    for v_x in select jsonb_object_keys(f -> 'level') loop
      if v_x not in ('breakouts', 'show', 'attributes', 'records') then
        p := p || format('The level of "%s" has "%s"; a level is {breakouts, show, attributes, records}.', f ->> 'key', v_x);
      elsif jsonb_typeof(f -> 'level' -> v_x) <> 'array' then
        p := p || format('The level of "%s": %s is a list.', f ->> 'key', v_x);
      end if;
    end loop;
    for v_x in select y #>> '{}' from jsonb_array_elements(case when jsonb_typeof(f -> 'level' -> 'breakouts') = 'array' then f -> 'level' -> 'breakouts' else '[]'::jsonb end) y loop
      if split_part(v_x, ':', 1) = f ->> 'key' then
        p := p || format('The level of "%s" offers itself as a breakout.', f ->> 'key');
      elsif not exists (select 1 from jsonb_array_elements(p_def -> 'dimensions') ld
                         where ld ->> 'key' = split_part(v_x, ':', 1)
                           and (position(':' in v_x) = 0
                                or (ld ->> 'kind' = 'time' and split_part(v_x, ':', 2) in ('hour', 'day', 'week', 'month', 'quarter', 'year')
                                    and (jsonb_typeof(ld -> 'grains') is distinct from 'array' or ld -> 'grains' ? split_part(v_x, ':', 2))))) then
        p := p || format('The level of "%s" offers the breakout "%s", which is not one of its Dimensions.', f ->> 'key', v_x);
      end if;
    end loop;
    for v_x in select y #>> '{}' from jsonb_array_elements(case when jsonb_typeof(f -> 'level' -> 'show') = 'array' then f -> 'level' -> 'show' else '[]'::jsonb end) y loop
      if not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) lm where lm ->> 'key' = v_x) then
        p := p || format('The level of "%s" shows "%s", which is not one of its Measures.', f ->> 'key', v_x);
      end if;
    end loop;
    for v_x in select y #>> '{}' from jsonb_array_elements(case when jsonb_typeof(f -> 'level' -> 'attributes') = 'array' then f -> 'level' -> 'attributes' else '[]'::jsonb end) y loop
      if v_x = f ->> 'key' or not exists (select 1 from jsonb_array_elements(p_def -> 'dimensions') ld where ld ->> 'key' = v_x and ld ->> 'kind' <> 'time') then
        p := p || format('The level of "%s" names the attribute "%s", which is not one it can read (a Dimension other than itself, not a time).', f ->> 'key', v_x);
      end if;
    end loop;
    for v_x in select y #>> '{}' from jsonb_array_elements(case when jsonb_typeof(f -> 'level' -> 'records') = 'array' then f -> 'level' -> 'records' else '[]'::jsonb end) y loop
      if not (coalesce(p_def -> 'records' -> 'columns', p_def -> 'detail' -> 'columns', '[]'::jsonb) ? v_x) then
        p := p || format('The level of "%s" lists the record column "%s", which the records do not have.', f ->> 'key', v_x);
      end if;
    end loop;
  end loop;

  -- BUILT-IN SAVED VIEWS (decision 6): every question inside must be valid against the definition.
  if p_def ? 'views' then
    if jsonb_typeof(p_def -> 'views') <> 'array' then
      p := p || 'views is a list of {key, label, question}.'::text;
    else
      v_keys := '{}';
      for f in select x from jsonb_array_elements(p_def -> 'views') x loop
        if coalesce(f ->> 'key', '') !~ c_ident or (f ->> 'key') = any (v_keys) then
          p := p || format('The Saved view "%s" needs a key of its own.', coalesce(f ->> 'key', ''));
          continue;
        end if;
        v_keys := v_keys || (f ->> 'key');
        if coalesce(btrim(f ->> 'label'), '') = '' then
          p := p || format('The Saved view "%s" needs a label a person reads.', f ->> 'key');
        end if;
        p := p || platform._drill_question_problems(p_def, f -> 'question', format('The Saved view "%s"', f ->> 'key'));
      end loop;
    end if;
  end if;

  -- FINDINGS (decisions 7, 13, 25, 28): a question with thresholds whose lines are settings at
  -- drill.finding.<definition>.<finding>.<knob>; each threshold that names a knob uses its default.
  if p_def ? 'findings' then
    if jsonb_typeof(p_def -> 'findings') <> 'array' then
      p := p || 'findings is a list of {key, label, question, knobs}.'::text;
    else
      v_keys := '{}';
      for f in select x from jsonb_array_elements(p_def -> 'findings') x loop
        if coalesce(f ->> 'key', '') !~ c_ident or (f ->> 'key') = any (v_keys) then
          p := p || format('The finding "%s" needs a key of its own.', coalesce(f ->> 'key', ''));
          continue;
        end if;
        v_keys := v_keys || (f ->> 'key');
        v_fkey := format('drill.finding.%s.%s.', v_key, f ->> 'key');
        if coalesce(btrim(f ->> 'label'), '') = '' then
          p := p || format('The finding "%s" needs a label a person reads.', f ->> 'key');
        end if;
        if f ? 'rule' then
          p := p || format('The finding "%s": its rule is its question''s having thresholds, not a separate rule.', f ->> 'key');
        end if;
        p := p || platform._drill_question_problems(p_def, f -> 'question', format('The finding "%s"', f ->> 'key'));
        if not (f -> 'question' ? 'having') or jsonb_typeof(f -> 'question' -> 'having') <> 'array' or jsonb_array_length(f -> 'question' -> 'having') = 0 then
          p := p || format('The finding "%s" names no threshold (having), so it would list every group.', f ->> 'key');
        end if;
        if jsonb_typeof(coalesce(f -> 'knobs', '{}'::jsonb)) <> 'object' then
          p := p || format('The finding "%s": knobs is an object of name -> {default, label, unit}.', f ->> 'key');
          continue;
        end if;
        for v_x, h in select key, value from jsonb_each(coalesce(f -> 'knobs', '{}'::jsonb)) loop
          if v_x !~ c_ident or jsonb_typeof(h) <> 'object' or jsonb_typeof(h -> 'default') <> 'number'
             or coalesce(btrim(h ->> 'label'), '') = '' or jsonb_typeof(h -> 'unit') <> 'string' then
            p := p || format('The finding "%s": its setting "%s" needs a name, a number default, a label and a unit.', f ->> 'key', v_x);
          end if;
          if not exists (select 1 from jsonb_array_elements(coalesce(f -> 'question' -> 'having', '[]'::jsonb)) y where y ->> 'knob' = v_fkey || v_x) then
            p := p || format('The finding "%s" declares the setting "%s" but no threshold reads it (%s).', f ->> 'key', v_x, v_fkey || v_x);
          end if;
        end loop;
        for h in select y from jsonb_array_elements(case when jsonb_typeof(f -> 'question' -> 'having') = 'array' then f -> 'question' -> 'having' else '[]'::jsonb end) y where y ? 'knob' loop
          v_x := h ->> 'knob';
          if left(v_x, length(v_fkey)) <> v_fkey or not (coalesce(f -> 'knobs', '{}'::jsonb) ? substr(v_x, length(v_fkey) + 1)) then
            p := p || format('The finding "%s" reads the setting "%s", which is not one of its own (%s<name> for a name under knobs).', f ->> 'key', v_x, v_fkey);
          elsif coalesce(h -> 'value', h -> 'share_of_total', h -> 'times_median') is distinct from (f -> 'knobs' -> substr(v_x, length(v_fkey) + 1) -> 'default') then
            p := p || format('The finding "%s": the threshold reading "%s" writes %s, but the setting''s default is %s.', f ->> 'key', v_x,
                             coalesce(h -> 'value', h -> 'share_of_total', h -> 'times_median', 'null'::jsonb), f -> 'knobs' -> substr(v_x, length(v_fkey) + 1) -> 'default');
          end if;
        end loop;
      end loop;
    end if;
  end if;
  return p;
end
$function$;

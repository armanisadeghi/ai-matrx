-- chair-step: this puts the four bodies visionreach_w5_every_common_formula_is_planned_once.sql replaced — custom.formula_compile_sql, custom.agg_field_value_sql, custom.agg_sql and custom.record_aggregate_as_of — back to the bodies production held when that file was applied (2026-10-03, custom.formula_compile_sql = CHAIR-MATH (a)'s body 7daf5d8d…, re-based after the chair applied it to production at ~14:30Z: formula columns beyond arithmetic worked out per record again, min/max of a date column raising `invalid input syntax for type numeric` again, the as-of door probing every history partition again) and DROPs the eight helpers that file added; nothing else calls them. No table, column, index, trigger, policy, grant or row of anybody's data is touched.
-- lane: VISION-REACH
-- guard: custom/system_enabled
-- lock: custom
-- ground-standing-ok: b — this inverse restores the bodies production holds TODAY (2026-10-03), which call custom.agg_value_text and custom.listed_predicate_sql, both live; the sibling inverse visionreach_w2_formula_columns_are_measured_as_they_are_read_down.sql (which drops them) is older history and is never run on top of this one — this file alone is what undoes W5.
-- based-on: custom.formula_compile_sql(uuid, jsonb, text) 53c26d9de9d8a53b8451cdceb6019a69cc71d881048fc9359c73ef3517c35a76
-- based-on: custom.agg_field_value_sql(uuid, uuid, text) 9b6ef68187332d5c9ed3df90412e391c8cfc3ae670d9483d1c0f6b2aa3d1be5d
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb, text, text) c5aec23866f3273ec79e68ae8b0031f844d771d8baea2f098ec38ffb61f2aac5
-- based-on: custom.record_aggregate_as_of(uuid, uuid, timestamp with time zone, text, text, text, jsonb) b078e4d616100e0cc840e461222742b2218a99c125bbaa6dbccd8d66177e7ed8
--   (the four W5 bodies — the same bytes on the clone and on production once W5 is applied, so these hold on both)

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
$function$

;

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
$function$

;

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_window jsonb DEFAULT NULL::jsonb, p_search text DEFAULT NULL::text, p_time_zone text DEFAULT NULL::text)
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
      if v_op = 'median' then
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
    custom.listed_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    -- S2-PRIME FILTER-GROUPS: the one fragment, in either shape (flat map or Rule expression).
    custom.record_filter_sql(p_organization_id, p_table_id, p_filter),
    v_window_sql,
    -- CHAIR-GRID (grids review 3, lane H item 5f): THE GRID'S SEARCH — the page door's own predicate
    -- (custom.record_search_sql), so a summary counts exactly the rows the search shows. 'true' when blank.
    custom.record_search_sql(p_organization_id, p_table_id, p_search, 'r', p_time_zone),
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

  return query
  with doc as (
    select distinct on (rv.row_id) rv.row_id,
           coalesce(rv.row_data -> 'data', rv.row_data) as d
      from history.row_versions rv
     where rv.entity_type = 'custom.record'
       and rv.organization_id = p_organization_id
       and rv.row_id = any (v_ids)
       and rv.occurred_at <= p_recorded_at
     order by rv.row_id, rv.occurred_at desc, rv.id desc
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

drop function custom._fxc_apply(text, jsonb[]);
drop function custom._fxc_eval(uuid, jsonb, jsonb);
drop function custom._fxc_rule_eval(uuid, jsonb, jsonb);
drop function custom._fxc_rule_sql(uuid, jsonb, text);
drop function custom._fxc_context_free(jsonb);
drop function custom.agg_field_kind(uuid, uuid, text);
drop function custom.field_value_kind(uuid, jsonb);
drop function custom.formula_result_kind(uuid, jsonb);

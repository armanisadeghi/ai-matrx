-- target: branch,production
-- additive: yes
--   It ADDS two helpers, `custom.agg_value_text(jsonb)` and `custom.agg_field_value_sql(uuid, uuid, text)`
--   (EXECUTE to postgres only, as the store's event trigger leaves every new custom function), and REPLACES two bodies, each declared
--   below with the body it was written against. No table, column, trigger, policy, grant on an existing
--   object or row of anybody's data is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w2_formula_columns_are_measured_as_they_are_read_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 7ac927d60626834cf65c6ab5825fd1ca69156d252915053d9e92d649cc1e0f82
-- based-on: custom.query_rollup_sum(uuid, uuid[], text, text, text, integer, text) 6d88ac2fbadd72dcd5acddf1dc934aa1da8c0ec79ad147e08da85d528c645043
--
-- LANE 5 VISION-REACH, WAVE 2 — A FORMULA IS MEASURED AS IT IS READ, AND THE TOP FIVE ARE THE TOP FIVE.
--
-- THE DEFECT (production, 2026-10-01): "the sum of Expected copay total across all records" answered
-- $640 when the truth was $1,440. Part of the chain: `custom.record_aggregate` summed a FORMULA column
-- and got NULL in every bucket, under a success. A formula (and a lookup, a roll-up, a Rule-filled
-- column) has no value in the stored `r.data` — it is worked out when the record is read — and
-- `custom.agg_sql` read only `r.data` (`custom.agg_value_sql`). Every surface built on the door went
-- blank the same way: the grid's summary bar, grouping by a formula, dashboards, charts, drill-down,
-- pipeline totals, and `custom.query_rollup_sum`.
--
-- THE FIX (the class, not the instance): ONE question — "is this key a worked-out column of this
-- table?" — asked once per call (`custom.agg_field_value_sql`). When it is, the value is read through
-- `custom.record_value_one`, the read path's own one-column answer (-> custom.derived_value ->
-- custom.formula_value -> custom.formula_eval): no second evaluator, and every formula function lane
-- VIEWS-AND-FIELDS adds to custom.formula_eval is measured the moment it ships. A plain stored column
-- is read straight out of the row exactly as before, so no other question gets slower.
--
-- AND: a measure may carry `"order": "desc" | "asc"`, which orders the groups by that measure's own
-- value — "the five patients with the highest total copay" is the five highest, not the five with the
-- most visits. Absent, groups come back largest-first by row count exactly as before.
--
-- Not changed here (named, not hidden): a date BUCKET or WINDOW on a formula date column, and a FILTER
-- on a formula column, still read `r.data` (custom.agg_moment_sql / custom.record_filter_sql).

create function custom.agg_value_text(p_value jsonb)
 returns text
 language sql
 immutable parallel safe
 set search_path to 'pg_catalog'
as $function$
  -- One worked-out Value as the text the aggregate casts: the ENVELOPE's value when there is one
  -- (`{"value": …}`), the scalar itself otherwise, NULL for no answer.
  select case when jsonb_typeof(p_value) = 'object' and p_value ? 'value' then p_value ->> 'value'
              when p_value is null or jsonb_typeof(p_value) = 'null' then null
              else p_value #>> '{}' end;
$function$;

create function custom.agg_field_value_sql(p_organization_id uuid, p_table_id uuid, p_key text)
 returns text
 language plpgsql
 stable
 set search_path to 'pg_catalog'
as $function$
declare
  v_field jsonb;
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
    v_group_sel := array_append(v_group_sel,
      format('custom.agg_local_label(custom.agg_period_start((%s) at time zone %L, %L, %L), %L)',
             custom.agg_moment_sql(v_key, v_tz), v_tz, v_by, v_ws, v_tz));
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- S3: ONE HALF-OPEN WINDOW on one date, read in the SAME calendar as the bucket, so the
  -- window's first bucket and its first day are the same day. `from` and `to` arrive as
  -- moments custom.agg_compare_windows already judged; they are re-cast here, never spliced.
  if p_window is not null and jsonb_typeof(p_window) = 'object' then
    v_key := custom.agg_assert_key(p_window ->> 'key');
    v_read_keys := array_append(v_read_keys, v_key);
    v_window_sql := format('(%1$s >= %2$L::timestamptz and %1$s < %3$L::timestamptz)',
                           custom.agg_moment_sql(v_key, v_tz),
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
    coalesce(v_order || ', count(*) desc', 'count(*) desc'),
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

CREATE OR REPLACE FUNCTION custom.query_rollup_sum(p_organization_id uuid, p_roots uuid[], p_field_key text, p_flavor text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_max_depth integer DEFAULT 33, p_required text DEFAULT 'viewer'::text)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
#variable_conflict use_column
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_rollup_sum');
  return (
-- The value is read out of the Value ENVELOPE when there is one (`{"value": …}`) and out of
  -- the plain key when there is not, which is the same reading every other surface does.
  -- VISION-REACH W2: a key the record does not STORE (a formula, lookup or roll-up column, worked
  -- out when the record is read) is read through the read path's own one-column answer, so a
  -- roll-up of a formula is its real total and never a silent 0.
  select coalesce(sum(nullif(
           case when not (r.data ? p_field_key)
                  then custom.agg_value_text(custom.record_value_one(p_organization_id, r.id, p_field_key))
                when jsonb_typeof(r.data -> p_field_key) = 'object'
                      and (r.data -> p_field_key) ? 'value'
                then r.data -> p_field_key ->> 'value'
                else r.data ->> p_field_key end, '')::numeric), 0)
    from custom.query_rollup(p_organization_id, p_roots, p_flavor, p_role, p_max_depth, p_required) k
    join custom.record r on r.organization_id = p_organization_id and r.id = k.record_id
  );
end;
$function$;

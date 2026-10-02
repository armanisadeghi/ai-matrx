-- target: branch,production
-- additive: yes
--   It REPLACES two bodies, each declared below with the body it was written against. No table,
--   column, trigger, policy, grant or row of anybody's data is touched. Locks: pg_proc row locks only.
--   Inverse: migrations/inverse/visionreach_w3_formula_columns_filter_bucket_window_down.sql
-- guard: custom/system_enabled
-- lock: custom
-- lane: VISION-REACH
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) 87e2c6a919c1cc03c4eddc5e74c823761933e06a8869d00303930aa5e208129e
-- based-on: custom.record_filter_sql(uuid, uuid, jsonb) 40ca156112d4b239e1f42165f90d942f98c62940cdb2f632ff59f445e84c2a74
--
-- LANE 5 VISION-REACH, WAVE 3 — A FILTER, A DATE PERIOD AND A WINDOW ON A FORMULA COLUMN READ THE FORMULA.
--
-- THE DEFECT (measured on the clone 2026-10-02, scripts/campaign-tests/visionreach_w3_formula_filter_bucket_window.sql):
-- wave 2 taught custom.record_aggregate to measure and group by a formula column, and named what it
-- left: a flat filter (custom.record_filter_sql), a date period and a window (custom.agg_sql via
-- custom.agg_moment_sql / custom.dashboard_window_sql) still read the stored `r.data`, where a
-- formula, lookup or roll-up column has no value. Measured: `{"copay_tier": "High copay"}` counted
-- 0 of 3; custom.read_records_matching handed back nothing; follow-ups by month answered one empty
-- period holding all six visits; a window and a this-week-against-last comparison counted 0.
--
-- THE FIX: the ONE question wave 2 added — custom.agg_field_value_sql, "is this key a worked-out
-- column, and if so what is the read path's expression for it" — is now asked by the filter, the
-- period and the window too. Each reading of the stored value in the fragment that helper family
-- writes (custom.agg_value_sql(key), a fixed string) is swapped for that expression; in the
-- aggregate it is the same one lateral value a row the measures already share. A plain stored
-- column's fragment is untouched, byte for byte. (A Rule-shaped filter already read worked-out
-- columns through custom.record_values_of and is unchanged.)

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

CREATE OR REPLACE FUNCTION custom.record_filter_sql(p_organization_id uuid, p_table_id uuid, p_filter jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_who     uuid;
  v_level   public.permission_level;
  v_visible text[];
  v_mask    jsonb;
  v_sql     text;
  v_key     text;
  v_val     text;
begin
  if not custom.filter_is_rule(p_filter) then
    -- S2-PRIME AGG-FIELD-READ: a flat question may not narrow by a column its reader may not read
    -- — "the jobs whose cost is 2,600" answers the cost. Refused by the column's name, as the
    -- aggregate refuses measuring it. (A Rule expression treats such a column as undecided.)
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
      perform custom.agg_fields_readable_assert(p_organization_id, p_table_id,
                array(select jsonb_object_keys(p_filter)), 'viewer');
    end if;
    v_sql := custom.record_filter_sql(p_filter);
    -- VISION-REACH W3 (2026-10-02): A FILTER ON A WORKED-OUT COLUMN reads it as the record read
    -- reads it. A formula, lookup or roll-up column has no stored value, so `{"copay_tier":
    -- "High copay"}` matched no row (the stored `r.data` holds nothing under that key). Each such
    -- key's stored-value reading in the one fragment is swapped for the read path's own answer
    -- (custom.agg_field_value_sql — the same expression the aggregate measures with); a plain
    -- stored column is untouched, so no other filter gets slower.
    if p_filter is not null and jsonb_typeof(p_filter) = 'object' and v_sql <> 'true' then
      for v_key in select k from jsonb_object_keys(p_filter) k loop
        v_val := custom.agg_field_value_sql(p_organization_id, p_table_id, v_key);
        if v_val <> custom.agg_value_sql(v_key) then
          v_sql := replace(v_sql, custom.agg_value_sql(v_key), '(' || v_val || ')');
        end if;
      end loop;
    end if;
    return v_sql;
  end if;

  -- WHICH COLUMNS THIS READER MAY SEE, asked the way the read door asks it: the reader's level
  -- on the TABLE, then the fields at that level. The server lane (no principal) sees every column.
  v_who := custom.query_principal();
  if v_who is not null then
    v_level := custom.effective_level(v_who, p_organization_id, p_table_id);
    -- READ-MASK-ONCE: the one mask's answer, memoised for the statement.
    v_mask := custom.read_mask_for(v_who, p_organization_id, p_table_id, v_level, 'read');
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(v_mask -> 'visible') x;
  end if;

  return format('(custom.rule_truth(%s) is true)',
                custom.rule_filter_node_sql(p_organization_id, p_table_id, p_filter,
                                            custom.choice_field_map(p_organization_id, p_table_id),
                                            v_visible));
end;
$function$;

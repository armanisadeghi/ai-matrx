-- draft: DRILL-CUSTOM-PARITY not yet rehearsed on the clone
-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- lock: custom,platform
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) b16f49d6d250b6c5154494ceea4706b0b3aa4a1de7557e0c33c4af09c8ae9221
-- based-on: custom.record_aggregate(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) c99d610f2934a8afbf10c288f6ed4c5a31e809c31acaeeb92f4cbb43d3208562
--
-- LANE DRILL-CUSTOM-PARITY (DRILL-DOWN-DESIGN.md, lane D2) — A CUSTOM TABLE SAYS ITS OWN
-- DIMENSIONS AND MEASURES, AND THE AGGREGATE DOOR TAKES THEIR NAMES.
--
-- Arman, 2026-09-29: "Dimension" and "Measure" are platform vocabulary.
--
-- WHAT IT ADDS (new functions; no table, column, trigger or policy is touched, and no row of
-- anybody's data is rewritten):
--   custom.table_dimensions(org, table)             the read door: a Table's Dimensions (choice,
--       relation to one record, tick box, date with drill paths year > quarter > month > week >
--       day, Added, Last changed) and Measures (count of records; sum/avg/min/max/filled of each
--       number, currency and percent column — a percent never summed), inferred from its Fields
--       on every read, for the reader asking: only columns her read mask shows.
--   custom.table_dimensions_set(org, table, doc)    a table editor's overrides — rename or hide a
--       Dimension or a Measure, add a Measure, add a drill path, set the first screen — kept on
--       the Table record under one key, `drill` (working label; the key the design's D0 names).
--   custom._table_dimensions_infer / _build / _check, custom.drill_resolve   invoker helpers.
--
-- WHAT IT REPLACES (same signatures, so no grant moves):
--   custom.agg_sql            a measure may carry `as`, the name its answer is keyed by (absent,
--                             every label is what it was); and it GROUPS BY THE EXPRESSIONS, not
--                             by position — `group by 1, 2` named the aggregate `measures` column,
--                             so two groups, or a group and a date period, always failed
--                             ("aggregate functions are not allowed in GROUP BY", measured live).
--   custom.record_aggregate   resolves the contract's names (a Dimension key, `<date>:<grain>`,
--                             a Measure key) through custom.drill_resolve for the reader asking,
--                             right after its own two access questions. Field keys and
--                             {op, key} measures pass through without reading anything.
--
-- The inverse is migrations/inverse/drillcustom_a_table_says_its_own_dimensions_and_measures_down.sql.


-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 0. custom.agg_sql — a measure may name its answer.
-- ─────────────────────────────────────────────────────────────────────────────────────────

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
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
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
      v_meas_sel := array_append(v_meas_sel, quote_literal(coalesce(v_as, 'count')) || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_read_keys := array_append(v_read_keys, v_key);
      v_val := custom.agg_value_sql(v_key);
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' ||
          format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val));
      elsif v_op = 'filled' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val));
      elsif v_op = 'empty' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val));
      elsif v_op = 'unique' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' ||
          format('(count(distinct nullif(%s, '''')))::numeric', v_val));
      else
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(coalesce(v_as, v_op || '_' || v_key)) || ', ' ||
          format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val));
      end if;
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
      from custom.record r
     where r.organization_id = %L::uuid
       and r.table_id = %L::uuid
       and r.deleted_at is null
       and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
       and %s
       and %s
       and %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
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
    custom.page_size(p_organization_id, 'custom.record_aggregate', p_limit, 200));

  return v_sql;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 0b. custom.record_aggregate — takes the contract's names.
-- ─────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION custom.record_aggregate(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text, p_compare jsonb DEFAULT NULL::jsonb)
 RETURNS TABLE(groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_map    jsonb;
  v_row    record;
  v_filter jsonb;
  v_cmp    jsonb;
  v_bkey   text;
  v_by     text;
  v_ws     text;
  v_tz     text;
  v_cur    jsonb := '[]'::jsonb;
  v_pri    jsonb := '[]'::jsonb;
  v_match  jsonb;
  v_side   text;
  v_from   timestamp;
  v_res    jsonb;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.record_aggregate');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.record_aggregate');

  -- DRILL-CUSTOM-PARITY: THE CONTRACT'S NAMES. A group may be a dimension (`status`, or a time
  -- dimension at a grain, `appointment_date:month`) and a measure may be its name
  -- (`sum_duration_minutes`, `count`, or one a table admin added) — the answer of
  -- custom.table_dimensions. They are turned into this door's own arguments HERE, once, for
  -- the reader asking, before anything is built; Field keys and {op, key} measures pass through
  -- untouched, so every older caller answers exactly as before.
  v_res := custom.drill_resolve(p_organization_id, p_table_id, p_group_by, p_measures, p_bucket);
  p_group_by := v_res -> 'group_by';
  p_measures := v_res -> 'measures';
  p_bucket   := v_res -> 'bucket';
  if p_bucket = 'null'::jsonb then p_bucket := null; end if;

  -- CHOICE-VALUE. One map per call: the filter is normalised to what is STORED before the
  -- statement is built, and the groups are named on the way out.
  v_map := custom.choice_field_map(p_organization_id, p_table_id);
  -- S2-PRIME FILTER-GROUPS: a Rule expression passes through to the one fragment; a flat map is
  -- normalised to what is stored, as before.
  v_filter := case when custom.filter_is_rule(p_filter) then p_filter
                   else custom.choice_filter_normalize(v_map, p_filter) end;

  if p_compare is null or jsonb_typeof(p_compare) = 'null' then
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required) loop
      groups          := custom.choice_render_groups(v_map, v_row.groups);
      measures        := v_row.measures;
      row_count       := v_row.row_count;
      prior_groups    := null;
      prior_measures  := null;
      prior_row_count := null;
      delta           := null;
      compare         := null;
      return next;
    end loop;
    return;
  end if;

  -- ── S3: THE SAME QUESTION, TWICE, UNDER THE SAME PRINCIPAL ─────────────────────────────
  v_cmp := custom.agg_compare_windows(p_organization_id, p_compare, p_bucket);
  v_tz  := v_cmp ->> 'time_zone';
  v_ws  := v_cmp ->> 'week_start';
  -- The comparison names the period, so a window on the SAME date in the filter gives way to
  -- it; every other part of the filter narrows both series alike.
  v_filter := v_filter - (v_cmp ->> 'key');
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_by   := lower(coalesce(p_bucket ->> 'by', 'month'));
    v_bkey := (p_bucket ->> 'key') || '_' || v_by;
  end if;

  foreach v_side in array array['window', 'prior_window'] loop
    v_from := ((v_cmp -> v_side ->> 'from')::timestamptz) at time zone v_tz;
    for v_row in execute custom.agg_sql(p_organization_id, p_table_id, p_group_by, p_measures,
                                        p_bucket, v_filter, p_limit, p_required,
                                        jsonb_build_object('key', v_cmp ->> 'key',
                                                           'from', v_cmp -> v_side ->> 'from',
                                                           'to', v_cmp -> v_side ->> 'to')) loop
      -- A group is matched by its value; a bucket by its POSITION in its own window.
      if v_bkey is null then
        v_match := coalesce(v_row.groups, '{}'::jsonb);
      else
        v_match := (coalesce(v_row.groups, '{}'::jsonb) - v_bkey)
                   || jsonb_build_object('#', case when v_row.groups ->> v_bkey is null then null else
                        custom.agg_bucket_ordinal(v_by, v_from, left(v_row.groups ->> v_bkey, 19)::timestamp, v_ws) end);
      end if;
      if v_side = 'window' then
        v_cur := v_cur || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      else
        v_pri := v_pri || jsonb_build_array(jsonb_build_object(
          'groups', custom.choice_render_groups(v_map, v_row.groups),
          'measures', v_row.measures, 'row_count', v_row.row_count, 'match', v_match));
      end if;
    end loop;
  end loop;

  return query
    select c.e -> 'groups',
           coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
           coalesce((c.e ->> 'row_count')::bigint, 0),
           p.e -> 'groups',
           coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures')),
           coalesce((p.e ->> 'row_count')::bigint, 0),
           custom.agg_delta(coalesce(c.e -> 'measures', custom.agg_zero(p.e -> 'measures')),
                            coalesce(p.e -> 'measures', custom.agg_zero(c.e -> 'measures'))),
           -- The row's bucket POSITION rides with the windows, so a screen can name a
           -- position the current window has not reached yet ("week 6") without counting rows.
           v_cmp || jsonb_build_object('position', coalesce(c.e -> 'match' -> '#', p.e -> 'match' -> '#'))
      from (select e from jsonb_array_elements(v_cur) e) c
      full join (select e from jsonb_array_elements(v_pri) e) p
        on (c.e -> 'match') = (p.e -> 'match')
     order by coalesce(c.e -> 'match' ->> '#', p.e -> 'match' ->> '#')::integer nulls last,
              coalesce((c.e ->> 'row_count')::bigint, 0) desc,
              coalesce((p.e ->> 'row_count')::bigint, 0) desc;
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. INFERENCE — what a Table's own Fields already say, for the reader asking.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY INVOKER on purpose: it is only ever called from inside the definer doors below
-- (and custom.record_aggregate), after they have decided the caller, so it reads as they do.
-- It reads ONLY the Fields the reader's own read mask shows her (custom.read_mask_for, the
-- one mask), so a column she may not read is never offered as a dimension or a measure.

create function custom._table_dimensions_infer(p_organization_id uuid, p_table_id uuid, p_every_field boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_me       uuid := custom.query_principal();
  v_level    public.permission_level;
  v_visible  text[];
  v_all      boolean := false;
  v_map      jsonb;
  v_tbl      record;
  f          record;
  v_pt       text;
  v_dims     jsonb := '[]'::jsonb;
  v_meas     jsonb := '[]'::jsonb;
  v_paths    jsonb := '[]'::jsonb;
  v_detail   jsonb := '[]'::jsonb;
  v_unit     text;
  v_ops      text[];
  v_op       text;
  v_first_choice text;
  v_first_time   text;
  v_first_sum    text;
  v_default  jsonb;
  c_grains   constant text[] := array['year', 'quarter', 'month', 'week', 'day'];
  c_op_label constant jsonb := '{"sum": "Total", "avg": "Average", "min": "Lowest", "max": "Highest"}'::jsonb;
begin
  select t.name, t.label_singular, t.label_plural into v_tbl
    from custom.table t
   where t.organization_id = p_organization_id and t.id = p_table_id;
  if not found then
    raise exception 'That table is not in this organization, so it has no dimensions to show.'
      using errcode = '42501', hint = 'Open the table you meant. Nothing was read.';
  end if;

  if p_every_field or v_me is null then
    -- Every declared Field: the override check (which judges what a table admin may NAME), or a
    -- definer caller with no signed-in person (a server job).
    v_all := true;
  else
    v_level := coalesce(custom.effective_level(v_me, p_organization_id, p_table_id), 'viewer'::public.permission_level);
    select coalesce(array_agg(x #>> '{}'), '{}'::text[]) into v_visible
      from jsonb_array_elements(custom.read_mask_for(v_me, p_organization_id, p_table_id, v_level, 'read') -> 'visible') x;
  end if;

  v_map := custom.choice_field_map(p_organization_id, p_table_id);

  for f in
    select fd.key, coalesce(nullif(fd.label, ''), fd.key) as label, fd.type, fd.multi, fd.format,
           fd.unit, fd.config, fd.relation_target, fd.table_token, fd.relation_max,
           custom.parity_type(to_jsonb(fd)) as pt
      from custom.field fd
     where fd.organization_id = p_organization_id
       and fd.entity_definition_id = p_table_id
       and (v_all or fd.key = any (v_visible))
     order by fd.sort nulls last, fd.created_at
  loop
    v_detail := v_detail || to_jsonb(f.key);
    v_pt := f.pt;

    if f.type = 'list' and not coalesce(f.multi, false) then
      -- A CHOICE: its options, in the order a person set them, retired ones left out.
      v_dims := v_dims || jsonb_build_array(jsonb_build_object(
        'key', f.key, 'label', f.label, 'from', f.key, 'kind', 'choice', 'cardinality', 'low',
        'choices', coalesce((select jsonb_agg(jsonb_build_object('value', o.key, 'label', o.value ->> 'label')
                                               order by (o.value ->> 'position')::numeric nulls last, o.key)
                               from jsonb_each(coalesce(v_map -> f.key -> 'options', '{}'::jsonb)) o
                              where not coalesce((o.value ->> 'retired')::boolean, false)), '[]'::jsonb)));
      v_first_choice := coalesce(v_first_choice, f.key);

    elsif f.type = 'relation' and coalesce(v_pt, '') <> 'attachment'
          and not coalesce(f.multi, false) and coalesce(f.relation_max, 1) = 1 then
      -- A RELATION to one record: the group is the record it points at.
      v_dims := v_dims || jsonb_build_array(jsonb_build_object(
        'key', f.key, 'label', f.label, 'from', f.key, 'kind', 'relation',
        'relation', jsonb_strip_nulls(jsonb_build_object('table_id', f.relation_target, 'token', f.table_token,
                                                         'person', case when v_pt = 'member' then true end))));

    elsif f.type = 'boolean' then
      -- A TICK BOX: three states — ticked, unticked, and never answered.
      v_dims := v_dims || jsonb_build_array(jsonb_build_object(
        'key', f.key, 'label', f.label, 'from', f.key, 'kind', 'boolean', 'cardinality', 'low'));
      v_first_choice := coalesce(v_first_choice, f.key);

    elsif f.type = 'range' and (f.config ->> 'kind') in ('date', 'datetime') then
      -- A DATE: a time dimension, cut in the organization's own calendar, year down to day.
      v_dims := v_dims || jsonb_build_array(jsonb_build_object(
        'key', f.key, 'label', f.label, 'from', f.key, 'kind', 'time', 'grains', to_jsonb(c_grains)));
      v_paths := v_paths || jsonb_build_array(jsonb_build_object(
        'key', f.key, 'label', f.label || ' by period',
        'levels', (select jsonb_agg(f.key || ':' || g order by o) from unnest(c_grains) with ordinality u(g, o))));
      v_first_time := coalesce(v_first_time, f.key);

    elsif f.type = 'range' then
      -- A NUMBER (plain, currency or percent): measures. A percent is never summed — adding
      -- up 40% and 60% answers 100%, which is a number that means nothing.
      v_unit := case when v_pt = 'percent' or f.format = 'percent' then '%'
                     else nullif(f.unit, '') end;
      v_ops := case when v_pt = 'percent' or f.format = 'percent'
                    then array['avg', 'min', 'max'] else array['sum', 'avg', 'min', 'max'] end;
      foreach v_op in array v_ops loop
        v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
          'key', v_op || '_' || f.key, 'label', (c_op_label ->> v_op) || ' ' || f.label,
          'op', v_op, 'of', f.key, 'unit', v_unit, 'additive', v_op = 'sum')));
      end loop;
      v_meas := v_meas || jsonb_build_array(jsonb_build_object(
        'key', 'filled_' || f.key, 'label', f.label || ' filled in', 'op', 'filled', 'of', f.key,
        'unit', 'count', 'additive', true));
      if v_op is not null and 'sum' = any (v_ops) then
        v_first_sum := coalesce(v_first_sum, 'sum_' || f.key);
      end if;
    end if;
  end loop;

  -- ALWAYS: when a record was added and last changed, and how many records there are.
  v_dims := v_dims || jsonb_build_array(
    jsonb_build_object('key', 'created_at', 'label', 'Added', 'from', 'created_at', 'kind', 'time', 'grains', to_jsonb(c_grains)),
    jsonb_build_object('key', 'updated_at', 'label', 'Last changed', 'from', 'updated_at', 'kind', 'time', 'grains', to_jsonb(c_grains)));
  v_paths := v_paths || jsonb_build_array(jsonb_build_object(
    'key', 'created_at', 'label', 'Added by period',
    'levels', (select jsonb_agg('created_at:' || g order by o) from unnest(c_grains) with ordinality u(g, o))));
  v_meas := jsonb_build_array(jsonb_build_object(
    'key', 'count', 'label', 'Number of ' || lower(coalesce(v_tbl.label_plural, v_tbl.name)),
    'op', 'count', 'unit', 'count', 'additive', true)) || v_meas;

  -- THE FIRST SCREEN: the first choice (or tick box) by count; else the first date by month;
  -- else how many records were added each month.
  v_default := jsonb_build_object(
    'by', case when v_first_choice is not null then jsonb_build_array(v_first_choice)
               else jsonb_build_array(coalesce(v_first_time, 'created_at') || ':month') end,
    'show', case when v_first_sum is not null then jsonb_build_array('count', v_first_sum)
                 else jsonb_build_array('count') end,
    'sort', jsonb_build_object('key', 'count', 'direction', 'desc'));
  if v_first_choice is null then
    v_default := v_default || jsonb_build_object('path', coalesce(v_first_time, 'created_at'));
  end if;

  return jsonb_build_object(
    'key', p_table_id::text,
    'label', coalesce(v_tbl.label_plural, v_tbl.name),
    'source', jsonb_build_object('table_id', p_table_id),
    'grain', 'one row per ' || lower(coalesce(v_tbl.label_singular, v_tbl.name)),
    'lanes', jsonb_build_array('organization'),
    'dimensions', v_dims,
    'measures', v_meas,
    'paths', v_paths,
    'detail', jsonb_build_object('columns', v_detail),
    'default', v_default);
end;
$fn$;


comment on function custom._table_dimensions_infer(uuid, uuid, boolean) is
  'DRILL-CUSTOM-PARITY: a custom Table''s dimensions and measures inferred from its Fields, for the reader asking — only Fields her read mask shows. choice / relation to one record / tick box / date = dimensions (dates with grains year..day); number, currency, percent = measures (sum, avg, min, max, filled; a percent is never summed); count of records, Added and Last changed always. Invoker; called only from inside deciding doors.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. OVERRIDES — the Table's own property `drill`, in the definition's own shape.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- {"version": 1,
--  "dimensions": [{"key": "<a dimension's key>", "label": "…", "hidden": true}],
--  "measures":   [{"key": "<an inferred measure's key>", "label": "…", "hidden": true},
--                 {"key": "<a new key>", "label": "…", "op": "sum", "of": "<a number Field>"}],
--  "paths":      [{"key": "…", "label": "…", "levels": ["<dimension>" | "<time dimension>:<grain>", …]}],
--  "default":    {"by": [...], "show": [...], "sort": {"key": "…", "direction": "asc|desc"}, "path": "…"}}
--
-- The check judges the document against the Table's DECLARED Fields (not a reader's mask), so a
-- table admin can name any column; every reader then sees only the parts her own mask admits.

create function custom._table_dimensions_check(p_organization_id uuid, p_table_id uuid, p_doc jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_fields  jsonb;
  v_inf     jsonb;
  v_dimkeys text[];
  v_meskeys text[];
  v_newmeas text[] := '{}';
  v_pathkeys text[] := '{}';
  v_dimlabels text;
  e         jsonb;
  l         text;
  v_part    text;
  c_key     constant text := '^[a-zA-Z_][a-zA-Z0-9_]{0,62}$';
begin
  if p_doc is null or jsonb_typeof(p_doc) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_doc) <> 'object' then
    raise exception 'The dimensions and measures of a table are one document (an object), so this was not saved.'
      using errcode = '22023', hint = 'Send {"dimensions": [...], "measures": [...], "paths": [...], "default": {...}}. Nothing was written.';
  end if;
  foreach v_part in array array(select jsonb_object_keys(p_doc)) loop
    if v_part not in ('version', 'dimensions', 'measures', 'paths', 'default') then
      raise exception '"%" is not part of a table''s dimensions and measures, so this was not saved.', v_part
        using errcode = '22023', hint = 'The parts are dimensions, measures, paths and default. Nothing was written.';
    end if;
  end loop;
  if octet_length(p_doc::text) > 65536 then
    raise exception 'These dimensions and measures are larger than 64 KB, so they were not saved.'
      using errcode = '54000', hint = 'Keep only the changes people use. Nothing was written.';
  end if;

  -- What the Table declares, whoever the editor is: every live Field, as inference would see it.
  select coalesce(jsonb_object_agg(fd.key, jsonb_build_object('type', fd.type, 'kind', fd.config ->> 'kind',
                                                              'label', coalesce(nullif(fd.label, ''), fd.key))), '{}'::jsonb)
    into v_fields
    from custom.field fd
   where fd.organization_id = p_organization_id and fd.entity_definition_id = p_table_id;
  -- Inference over EVERY declared Field, so every inferable key is nameable by a table admin.
  v_inf := custom._table_dimensions_infer(p_organization_id, p_table_id, true);
  select coalesce(array_agg(d ->> 'key'), '{}') into v_dimkeys from jsonb_array_elements(v_inf -> 'dimensions') d;
  select coalesce(array_agg(d ->> 'key'), '{}') into v_meskeys from jsonb_array_elements(v_inf -> 'measures') d;
  select string_agg(d ->> 'label', ', ') into v_dimlabels from jsonb_array_elements(v_inf -> 'dimensions') d;

  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_doc -> 'dimensions') = 'array' then p_doc -> 'dimensions' else '[]'::jsonb end) x loop
    if not ((e ->> 'key') = any (v_dimkeys)) then
      raise exception '"%" is not a dimension of this table, so it cannot be renamed or hidden.', coalesce(e ->> 'key', '(no key)')
        using errcode = '22023', hint = format('Its dimensions are: %s. Nothing was written.', v_dimlabels);
    end if;
    if e ? 'label' and (jsonb_typeof(e -> 'label') <> 'string' or length(btrim(e ->> 'label')) not between 1 and 80) then
      raise exception 'A dimension''s name is 1 to 80 characters, so "%" was not renamed.', e ->> 'key'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if e ? 'hidden' and jsonb_typeof(e -> 'hidden') <> 'boolean' then
      raise exception 'Hiding "%" is true or false.', e ->> 'key' using errcode = '22023', hint = 'Nothing was written.';
    end if;
  end loop;

  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_doc -> 'measures') = 'array' then p_doc -> 'measures' else '[]'::jsonb end) x loop
    if coalesce(e ->> 'key', '') !~ c_key then
      raise exception 'A measure''s key is a letter or underscore followed by letters, digits or underscores, so "%" was not saved.', coalesce(e ->> 'key', '(no key)')
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if e ? 'label' and (jsonb_typeof(e -> 'label') <> 'string' or length(btrim(e ->> 'label')) not between 1 and 80) then
      raise exception 'A measure''s name is 1 to 80 characters, so "%" was not renamed.', e ->> 'key'
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if e ? 'hidden' and jsonb_typeof(e -> 'hidden') <> 'boolean' then
      raise exception 'Hiding "%" is true or false.', e ->> 'key' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    if (e ->> 'key') = any (v_meskeys) then
      if e ? 'op' or e ? 'of' then
        raise exception '"%" is worked out from the table''s own column, so only its name can change, or it can be hidden.', e ->> 'key'
          using errcode = '22023', hint = 'To count something else, add a measure with a new key. Nothing was written.';
      end if;
    else
      -- A NEW measure: one operation over one number column (or `filled` / `unique` of any column).
      if not (coalesce(e ->> 'op', '') = any (custom.agg_operations())) or e ->> 'op' = 'count' then
        raise exception 'The measure "%" needs one of: %.', e ->> 'key', array_to_string(array_remove(custom.agg_operations(), 'count'), ', ')
          using errcode = '22023', hint = 'The number of records is already the measure "count". Nothing was written.';
      end if;
      if not (v_fields ? coalesce(e ->> 'of', '')) then
        raise exception 'The measure "%" reads "%", which is not a column of this table.', e ->> 'key', coalesce(e ->> 'of', '(nothing)')
          using errcode = '22023', hint = 'Name one of this table''s own columns. Nothing was written.';
      end if;
      if e ->> 'op' in ('sum', 'avg', 'min', 'max', 'median')
         and not (v_fields -> (e ->> 'of') ->> 'type' = 'range'
                  and coalesce(v_fields -> (e ->> 'of') ->> 'kind', '') not in ('date', 'datetime')) then
        raise exception 'The column % is not a number, so it cannot be added up or averaged for "%".', v_fields -> (e ->> 'of') ->> 'label', e ->> 'key'
          using errcode = '22023', hint = 'Use filled or unique to count it instead. Nothing was written.';
      end if;
      if (e ->> 'key') = any (v_newmeas) then
        raise exception 'Two measures are both called "%".', e ->> 'key' using errcode = '22023', hint = 'Nothing was written.';
      end if;
      v_newmeas := array_append(v_newmeas, e ->> 'key');
    end if;
  end loop;

  for e in select x from jsonb_array_elements(case when jsonb_typeof(p_doc -> 'paths') = 'array' then p_doc -> 'paths' else '[]'::jsonb end) x loop
    if coalesce(e ->> 'key', '') !~ c_key or jsonb_typeof(e -> 'levels') <> 'array' or jsonb_array_length(e -> 'levels') = 0 then
      raise exception 'A drill path has a key and at least one level, so "%" was not saved.', coalesce(e ->> 'key', '(no key)')
        using errcode = '22023', hint = 'Nothing was written.';
    end if;
    for l in select x #>> '{}' from jsonb_array_elements(e -> 'levels') x loop
      if not (split_part(l, ':', 1) = any (v_dimkeys))
         or (position(':' in l) > 0 and not (split_part(l, ':', 2) = any (custom.agg_buckets()))) then
        raise exception 'The drill path "%" names "%", which is not a dimension of this table.', e ->> 'key', l
          using errcode = '22023', hint = format('Its dimensions are: %s; a date takes :year, :quarter, :month, :week or :day. Nothing was written.', v_dimlabels);
      end if;
    end loop;
    v_pathkeys := array_append(v_pathkeys, e ->> 'key');
  end loop;

  if p_doc ? 'default' then
    if jsonb_typeof(p_doc -> 'default') <> 'object' then
      raise exception 'A table''s first screen is one question (an object), so it was not saved.' using errcode = '22023', hint = 'Nothing was written.';
    end if;
    for l in select x #>> '{}' from jsonb_array_elements(coalesce(p_doc -> 'default' -> 'by', '[]'::jsonb)) x loop
      if not (split_part(l, ':', 1) = any (v_dimkeys)) then
        raise exception 'The first screen groups by "%", which is not a dimension of this table.', l using errcode = '22023', hint = 'Nothing was written.';
      end if;
    end loop;
    for l in select x #>> '{}' from jsonb_array_elements(coalesce(p_doc -> 'default' -> 'show', '[]'::jsonb)) x loop
      if not (l = any (v_meskeys || v_newmeas)) then
        raise exception 'The first screen shows "%", which is not a measure of this table.', l using errcode = '22023', hint = 'Nothing was written.';
      end if;
    end loop;
  end if;

  return jsonb_strip_nulls(jsonb_build_object('version', 1,
    'dimensions', p_doc -> 'dimensions', 'measures', p_doc -> 'measures',
    'paths', p_doc -> 'paths', 'default', p_doc -> 'default'));
end;
$fn$;


comment on function custom._table_dimensions_check(uuid, uuid, jsonb) is
  'DRILL-CUSTOM-PARITY: judges a Table''s `drill` override document against the Table''s declared Fields and returns it normalised (null clears). Dimensions may be renamed or hidden; inferred measures may be renamed or hidden; new measures are one operation over one column; paths and the first screen name only real dimensions and measures. Refuses by name, writes nothing.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE DEFINITION — inference, then the Table's overrides, for the reader asking.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- An override that names a Field that is gone (or one this reader may not read) does not
-- apply; a gone one is SAID, once per answer, under `notes` — never a path that silently
-- lost a level. `p_with_hidden` keeps hidden entries (marked `hidden: true`) for the resolver,
-- so a question asked by name still answers even when the menu does not offer it.

create function custom._table_dimensions_build(p_organization_id uuid, p_table_id uuid, p_with_hidden boolean default false)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_def     jsonb := custom._table_dimensions_infer(p_organization_id, p_table_id);
  v_doc     jsonb;
  v_fields  text[];
  v_dims    jsonb := '[]'::jsonb;
  v_meas    jsonb := '[]'::jsonb;
  v_paths   jsonb := '[]'::jsonb;
  v_notes   jsonb := '[]'::jsonb;
  v_inferred jsonb := '[]'::jsonb;
  v_dimkeys text[];
  v_meskeys text[];
  v_levels  jsonb;
  v_ov      jsonb;
  d         jsonb;
  l         text;
  v_default jsonb;
  v_ok      boolean;
begin
  select t.data -> 'drill' into v_doc
    from custom.record t
   where t.organization_id = p_organization_id and t.id = p_table_id
     and t.table_id = custom.table_kernel_id() and t.deleted_at is null;
  if v_doc is null or jsonb_typeof(v_doc) <> 'object' then
    v_doc := '{}'::jsonb;
  end if;
  select coalesce(array_agg(fd.key), '{}') into v_fields
    from custom.field fd where fd.organization_id = p_organization_id and fd.entity_definition_id = p_table_id;

  -- DIMENSIONS: inferred ones, renamed or hidden by the override matching their key.
  for d in select x from jsonb_array_elements(v_def -> 'dimensions') x loop
    select x into v_ov from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'dimensions') = 'array' then v_doc -> 'dimensions' else '[]'::jsonb end) x
     where x ->> 'key' = d ->> 'key' limit 1;
    if v_ov is null then
      v_inferred := v_inferred || to_jsonb(d ->> 'key');
    else
      if v_ov ? 'label' then d := d || jsonb_build_object('label', v_ov ->> 'label'); end if;
      if coalesce((v_ov ->> 'hidden')::boolean, false) then d := d || '{"hidden": true}'::jsonb; end if;
    end if;
    if p_with_hidden or not coalesce((d ->> 'hidden')::boolean, false) then
      v_dims := v_dims || jsonb_build_array(d);
    end if;
  end loop;
  for v_ov in select x from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'dimensions') = 'array' then v_doc -> 'dimensions' else '[]'::jsonb end) x loop
    if not (v_ov ->> 'key' = any (v_fields || array['created_at', 'updated_at'])) then
      v_notes := v_notes || to_jsonb(format('%s was removed from this table, so the change made to it no longer applies.',
                                            coalesce(v_ov ->> 'label', v_ov ->> 'key')));
    end if;
  end loop;
  select coalesce(array_agg(x ->> 'key'), '{}') into v_dimkeys from jsonb_array_elements(v_dims) x;

  -- MEASURES: inferred ones (renamed / hidden), then the ones a table admin added.
  for d in select x from jsonb_array_elements(v_def -> 'measures') x loop
    select x into v_ov from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'measures') = 'array' then v_doc -> 'measures' else '[]'::jsonb end) x
     where x ->> 'key' = d ->> 'key' limit 1;
    if v_ov is null then
      v_inferred := v_inferred || to_jsonb(d ->> 'key');
    else
      if v_ov ? 'label' then d := d || jsonb_build_object('label', v_ov ->> 'label'); end if;
      if coalesce((v_ov ->> 'hidden')::boolean, false) then d := d || '{"hidden": true}'::jsonb; end if;
    end if;
    if p_with_hidden or not coalesce((d ->> 'hidden')::boolean, false) then
      v_meas := v_meas || jsonb_build_array(d);
    end if;
  end loop;
  select coalesce(array_agg(x ->> 'key'), '{}') into v_meskeys from jsonb_array_elements(v_def -> 'measures') x;
  for v_ov in select x from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'measures') = 'array' then v_doc -> 'measures' else '[]'::jsonb end) x loop
    continue when v_ov ->> 'key' = any (v_meskeys);
    if not (v_ov ->> 'of' = any (v_fields)) then
      v_notes := v_notes || to_jsonb(format('The column behind %s was removed from this table, so it is no longer counted.',
                                            coalesce(v_ov ->> 'label', v_ov ->> 'key')));
      continue;
    end if;
    -- A column this reader may not read gives her no measure over it (no note: it is access,
    -- not a change), exactly as inference never offers one.
    continue when not (v_ov ->> 'of' = any (select x #>> '{}' from jsonb_array_elements(v_def -> 'detail' -> 'columns') x));
    continue when coalesce((v_ov ->> 'hidden')::boolean, false) and not p_with_hidden;
    v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', v_ov ->> 'key', 'label', coalesce(v_ov ->> 'label', v_ov ->> 'key'), 'op', v_ov ->> 'op', 'of', v_ov ->> 'of',
      'unit', v_ov ->> 'unit', 'additive', (v_ov ->> 'op') in ('sum', 'filled'),
      'hidden', case when coalesce((v_ov ->> 'hidden')::boolean, false) then true end)));
  end loop;
  select coalesce(array_agg(x ->> 'key'), '{}') into v_meskeys from jsonb_array_elements(v_meas) x;

  -- PATHS: the inferred time paths, then the table's own. A level whose dimension is gone is
  -- dropped and said; a path left with no level is dropped.
  v_paths := coalesce(v_def -> 'paths', '[]'::jsonb);
  for v_ov in select x from jsonb_array_elements(case when jsonb_typeof(v_doc -> 'paths') = 'array' then v_doc -> 'paths' else '[]'::jsonb end) x loop
    v_levels := '[]'::jsonb;
    for l in select x #>> '{}' from jsonb_array_elements(case when jsonb_typeof(v_ov -> 'levels') = 'array' then v_ov -> 'levels' else '[]'::jsonb end) x loop
      if split_part(l, ':', 1) = any (v_dimkeys) then
        v_levels := v_levels || to_jsonb(l);
      elsif not (split_part(l, ':', 1) = any (v_fields || array['created_at', 'updated_at'])) then
        v_notes := v_notes || to_jsonb(format('A column in the drill path %s was removed from this table, so the path skips it.',
                                              coalesce(v_ov ->> 'label', v_ov ->> 'key')));
      end if;
    end loop;
    if jsonb_array_length(v_levels) > 0 then
      v_paths := (select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements(v_paths) x where x ->> 'key' <> v_ov ->> 'key')
                 || jsonb_build_array(jsonb_build_object('key', v_ov ->> 'key', 'label', coalesce(v_ov ->> 'label', v_ov ->> 'key'), 'levels', v_levels));
    end if;
  end loop;

  -- THE FIRST SCREEN: the table's own when every part of it still answers for this reader.
  v_default := v_def -> 'default';
  if jsonb_typeof(v_doc -> 'default') = 'object' then
    select coalesce(bool_and(split_part(x #>> '{}', ':', 1) = any (v_dimkeys)), true) into v_ok
      from jsonb_array_elements(coalesce(v_doc -> 'default' -> 'by', '[]'::jsonb)) x;
    if v_ok then
      select coalesce(bool_and((x #>> '{}') = any (v_meskeys)), true) into v_ok
        from jsonb_array_elements(coalesce(v_doc -> 'default' -> 'show', '[]'::jsonb)) x;
    end if;
    if v_ok then
      v_default := v_doc -> 'default';
    else
      v_notes := v_notes || to_jsonb('This table''s first screen names a column that is gone or that you cannot read, so it opens on the usual first screen.'::text);
    end if;
  end if;

  return v_def || jsonb_build_object('dimensions', v_dims, 'measures', v_meas, 'paths', v_paths,
                                     'default', v_default, 'inferred', v_inferred, 'notes', v_notes,
                                     'overridden', v_doc <> '{}'::jsonb);
end;
$fn$;


comment on function custom._table_dimensions_build(uuid, uuid, boolean) is
  'DRILL-CUSTOM-PARITY: a custom Table''s definition for the reader asking — inference (custom._table_dimensions_infer) with the Table''s `drill` overrides applied. Overrides that name a removed column do not apply and are named under `notes`; parts over columns this reader may not read are absent. Invoker; called only from inside deciding doors.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE DOORS.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.table_dimensions(p_organization_id uuid, p_table_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $fn$
begin
  -- The decision first, in this body: the organization wall, then the Table's own ladder —
  -- the same two questions custom.record_aggregate asks, so the menu and the numbers it
  -- leads to are judged alike. What is offered is then cut by this reader's own read mask.
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_dimensions');
  perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.table_dimensions');
  return custom._table_dimensions_build(p_organization_id, p_table_id, false);
end;
$fn$;

comment on function custom.table_dimensions(uuid, uuid) is
  'DRILL-CUSTOM-PARITY (DRILL-DOWN-DESIGN D2): what a custom Table can be grouped by (Dimensions, with drill paths down a date: year, quarter, month, week, day) and what it can total (Measures), inferred from its Fields and the Table''s own `drill` overrides, for the reader asking — only columns her read mask shows. Every key it answers is a name custom.record_aggregate accepts.';

create function custom.table_dimensions_set(p_organization_id uuid, p_table_id uuid, p_overrides jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $fn$
declare
  v_doc jsonb;
begin
  -- The decision first: the store's switch, the organization wall, then EDITOR on the Table —
  -- the rung that changes a Table's own settings (custom.table_decorate's rung).
  perform custom.assert_store_door(p_organization_id, 'custom.table_dimensions_set');
  perform custom.assert_client_may_reach(p_organization_id, 'custom.table_dimensions_set');
  perform custom.assert_client_may_change(p_organization_id, p_table_id, 'custom.table_dimensions_set',
                                          'editor'::public.permission_level, 'table');

  v_doc := custom._table_dimensions_check(p_organization_id, p_table_id, p_overrides);

  update custom.record
     set data = case when v_doc is null then data - 'drill' else jsonb_set(data, '{drill}', v_doc, true) end
   where organization_id = p_organization_id
     and id = p_table_id
     and table_id = custom.table_kernel_id()
     and deleted_at is null;
  if not found then
    raise exception 'That table is not in this organization, so its dimensions were not changed.'
      using errcode = '23503', hint = 'Open the table you meant. Nothing was written.';
  end if;

  return custom._table_dimensions_build(p_organization_id, p_table_id, false);
end;
$fn$;

comment on function custom.table_dimensions_set(uuid, uuid, jsonb) is
  'DRILL-CUSTOM-PARITY: a table editor renames or hides a Dimension or a Measure, adds a Measure (one operation over one column), adds a drill path, or sets the first screen — one document on the Table record under `drill`, judged by custom._table_dimensions_check. Null clears it. Returns the definition as custom.table_dimensions answers it.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. THE RESOLVER — the contract's names into custom.record_aggregate's own arguments.
-- ─────────────────────────────────────────────────────────────────────────────────────────

create function custom.drill_resolve(p_organization_id uuid, p_table_id uuid, p_group_by jsonb,
                                     p_measures jsonb, p_bucket jsonb)
returns jsonb
language plpgsql
stable
set search_path to 'pg_catalog'
as $fn$
declare
  v_def    jsonb;
  v_groups jsonb := '[]'::jsonb;
  v_meas   jsonb := '[]'::jsonb;
  v_bucket jsonb := case when p_bucket is null or jsonb_typeof(p_bucket) = 'null' then null else p_bucket end;
  g        jsonb;
  m        jsonb;
  v_name   text;
  v_dim    jsonb;
  v_grain  text;
  v_mes    jsonb;
begin
  -- Nothing to name: every older caller's arguments go through untouched, and nothing is read.
  if not exists (select 1 from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) x
                  where jsonb_typeof(x) = 'string' and ((x #>> '{}') like '%:%' or (x #>> '{}') in ('created_at', 'updated_at')))
     and not exists (select 1 from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) x where jsonb_typeof(x) = 'string') then
    return jsonb_build_object('group_by', coalesce(p_group_by, '[]'::jsonb), 'measures', coalesce(p_measures, '[]'::jsonb),
                              'bucket', coalesce(v_bucket, 'null'::jsonb));
  end if;

  v_def := custom._table_dimensions_build(p_organization_id, p_table_id, true);

  for g in select x from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) x loop
    if jsonb_typeof(g) <> 'string' then
      v_groups := v_groups || jsonb_build_array(g);
      continue;
    end if;
    v_name := g #>> '{}';
    select x into v_dim from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'key' = split_part(v_name, ':', 1) limit 1;
    if position(':' in v_name) > 0 or (v_dim ->> 'kind' = 'time' and v_dim ->> 'from' in ('created_at', 'updated_at')) then
      -- A TIME DIMENSION AT A GRAIN is the bucket.
      v_grain := nullif(split_part(v_name, ':', 2), '');
      if v_dim is null or v_dim ->> 'kind' <> 'time' then
        raise exception '"%" is not a date you can read in this table, so it cannot be cut by period.', split_part(v_name, ':', 1)
          using errcode = '22023',
                hint = format('Its dates are: %s.', coalesce((select string_agg(x ->> 'label', ', ') from jsonb_array_elements(v_def -> 'dimensions') x where x ->> 'kind' = 'time'), 'none'));
      end if;
      if v_grain is null or not (v_dim -> 'grains' ? v_grain) then
        raise exception '"%" needs a period: %.', v_dim ->> 'label',
          (select string_agg(split_part(v_name, ':', 1) || ':' || (x #>> '{}'), ', ') from jsonb_array_elements(v_dim -> 'grains') x)
          using errcode = '22023', hint = 'A date is grouped by one period at a time.';
      end if;
      if v_bucket is not null then
        raise exception 'This question already cuts one date by period, so "%" cannot be a second.', v_name
          using errcode = '22023', hint = 'Group by one date period per question; add the other as a filter.';
      end if;
      v_bucket := jsonb_build_object('key', v_dim ->> 'from', 'by', v_grain);
    elsif v_dim is not null then
      v_groups := v_groups || to_jsonb(v_dim ->> 'from');
    else
      -- Not a dimension name: a Field key, judged exactly as before by custom.agg_sql.
      v_groups := v_groups || jsonb_build_array(g);
    end if;
  end loop;

  for m in select x from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) x loop
    if jsonb_typeof(m) <> 'string' then
      v_meas := v_meas || jsonb_build_array(m);
      continue;
    end if;
    select x into v_mes from jsonb_array_elements(v_def -> 'measures') x where x ->> 'key' = m #>> '{}' limit 1;
    if v_mes is null then
      raise exception '"%" is not a measure of this table you can read.', m #>> '{}'
        using errcode = '22023',
              hint = format('Its measures are: %s.', (select string_agg(x ->> 'label', ', ') from jsonb_array_elements(v_def -> 'measures') x where not coalesce((x ->> 'hidden')::boolean, false)));
    end if;
    v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'op', v_mes ->> 'op', 'key', v_mes ->> 'of', 'as', v_mes ->> 'key')));
  end loop;

  return jsonb_build_object('group_by', v_groups, 'measures', v_meas, 'bucket', coalesce(v_bucket, 'null'::jsonb));
end;
$fn$;


comment on function custom.drill_resolve(uuid, uuid, jsonb, jsonb, jsonb) is
  'DRILL-CUSTOM-PARITY: turns the contract''s names — a Dimension key, a time Dimension at a grain (`<key>:<grain>`), a Measure key — into custom.record_aggregate''s own group, bucket and measure arguments, for the reader asking. Field keys and {op, key} measures pass through untouched and read nothing. Invoker; called only from inside custom.record_aggregate after it has decided the caller.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. THE TWO NEW DOORS ARE DECLARED, AND OPEN TO SIGNED-IN PEOPLE.
-- ─────────────────────────────────────────────────────────────────────────────────────────

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_dimensions',
        'p_organization_id uuid, p_table_id uuid',
        array['uuid'::regtype, 'uuid'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_client_may_reach and p_table_id by custom.assert_may_know_table before anything is read, so a Table this caller may not know answers exactly as an invented one. It returns the Table''s Dimensions and Measures built only from the columns this reader''s own read mask shows, and writes nothing.',
        'drillcustom_a_table_says_its_own_dimensions_and_measures.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'drillcustom_a_table_says_its_own_dimensions_and_measures.sql',
          'declared_at', '2026-09-29 lane DRILL-CUSTOM-PARITY',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_client_may_reach(arg1), custom.assert_may_know_table(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-29 lane DRILL-CUSTOM-PARITY — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_may_know_table(arg2) — the Table''s own ladder (custom.assert_may_know_table): you know a Table if you may open it or if anything in it has been shared with you, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-29 lane DRILL-CUSTOM-PARITY — written with this body'))))
on conflict do nothing;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers, argument_rules)
values ('custom', 'table_dimensions_set',
        'p_organization_id uuid, p_table_id uuid, p_overrides jsonb',
        array['uuid'::regtype, 'uuid'::regtype, 'jsonb'::regtype]::oid[],
        'p_organization_id is checked by custom.assert_store_door and custom.assert_client_may_reach before anything is read; p_table_id by custom.assert_client_may_change at editor on the Table, before the Table row is read. Every key in p_overrides is judged by custom._table_dimensions_check to be a Dimension, a Measure or a live Field OF THIS TABLE. It writes one key (`drill`) of the Table record''s own document and nothing else.',
        'drillcustom_a_table_says_its_own_dimensions_and_measures.sql',
        null, true, false,
        jsonb_build_object('version', 1,
          'declared_by', 'drillcustom_a_table_says_its_own_dimensions_and_measures.sql',
          'declared_at', '2026-09-29 lane DRILL-CUSTOM-PARITY',
          'arguments', jsonb_build_object(
            'p_organization_id', jsonb_build_object('type', 'uuid', 'position', 1, 'entity', 'organization',
              'check', 'this body decides it with custom.assert_store_door(arg1), custom.assert_client_may_reach(arg1), custom.assert_client_may_change(arg1) — the organization wall — a non-member is refused before anything is read, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-29 lane DRILL-CUSTOM-PARITY — written with this body'),
            'p_table_id', jsonb_build_object('type', 'uuid', 'position', 2, 'entity', 'custom_record',
              'check', 'this body decides it with custom.assert_client_may_change(arg2) at editor on the Table — the record ladder at the level this call names, decided before the record is admitted to exist, and that call stands before every other use of this argument in the body.',
              'foreign', jsonb_build_object('sqlstate', '42501', 'same_as_invented', true),
              'verified', '2026-09-29 lane DRILL-CUSTOM-PARITY — written with this body'))))
on conflict do nothing;


-- The grant is a consequence of the two rows above, never a decision of its own.
select custom.reopen_declared_doors();

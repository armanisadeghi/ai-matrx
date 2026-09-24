-- lock: custom
-- lane: S2-PRIME
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text, jsonb) b16f49d6d250b6c5154494ceea4706b0b3aa4a1de7557e0c33c4af09c8ae9221
-- based-on: custom.record_filter_sql(uuid, uuid, jsonb) d7194cb8598408aa49065dc8c3a9e79b595996bfe64afc2307b1fcecce0fde69
-- chair-step: the inverse of filtergroups_a_sum_never_reads_a_column_its_reader_may_not.sql. It puts
-- back, byte for byte, the bodies of custom.agg_sql and custom.record_filter_sql(uuid, uuid, jsonb)
-- that file replaced, then drops custom.agg_fields_readable_assert. What it undoes: a sum, group or
-- flat filter over a column its reader may not read is answered again (the leak S3 found).

set local lock_timeout = '5s';
set local statement_timeout = '60s';

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
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
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
    v_window_sql := format('(%1$s >= %2$L::timestamptz and %1$s < %3$L::timestamptz)',
                           custom.agg_moment_sql(v_key, v_tz),
                           (p_window ->> 'from')::timestamptz, (p_window ->> 'to')::timestamptz);
  end if;

  for m in select e from jsonb_array_elements(coalesce(p_measures, '[]'::jsonb)) e loop
    v_op := lower(coalesce(m ->> 'op', 'count'));
    if not (v_op = any (custom.agg_operations())) then
      raise exception 'custom.record_aggregate: "%" is not a measure', v_op
        using errcode = '22023',
              hint = format('Legal measures: %s.', array_to_string(custom.agg_operations(), ', '));
    end if;
    if v_op = 'count' then
      v_meas_sel := array_append(v_meas_sel, quote_literal('count') || ', count(*)::numeric');
    else
      v_key := custom.agg_assert_key(m ->> 'key');
      v_val := custom.agg_value_sql(v_key);
      -- ── GRID-PRIMITIVES G1: THE SUMMARY BAR'S OTHER FOUR. ────────────────────────────
      -- BLANK is what the older grid's summary bar means by it (column-summaries.ts
      -- isBlank): no value, JSON null, or the empty string. An empty list is a value.
      if v_op = 'median' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(percentile_cont(0.5) within group (order by nullif(%s, '''')::numeric))::numeric', v_val));
      elsif v_op = 'filled' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is not null))::numeric', v_val));
      elsif v_op = 'empty' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(*) filter (where nullif(%s, '''') is null))::numeric', v_val));
      elsif v_op = 'unique' then
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('(count(distinct nullif(%s, '''')))::numeric', v_val));
      else
        v_meas_sel := array_append(v_meas_sel,
          quote_literal(v_op || '_' || v_key) || ', ' ||
          format('%s(nullif(%s, '''')::numeric)::numeric', v_op, v_val));
      end if;
    end if;
  end loop;
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
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
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
begin
  if not custom.filter_is_rule(p_filter) then
    return custom.record_filter_sql(p_filter);
  end if;

  -- WHICH COLUMNS THIS READER MAY SEE, asked the way the read door asks it: the reader's level
  -- on the TABLE, then the fields at that level. The server lane (no principal) sees every column.
  v_who := custom.query_principal();
  if v_who is not null then
    v_level := custom.effective_level(v_who, p_organization_id, p_table_id);
    select coalesce(array_agg(f.field_key), '{}'::text[])
      into v_visible
      from iam.visible_field_ids(v_who, p_organization_id, p_table_id, v_level, 'read') f;
  end if;

  return format('(custom.rule_truth(%s) is true)',
                custom.rule_filter_node_sql(p_organization_id, p_table_id, p_filter,
                                            custom.choice_field_map(p_organization_id, p_table_id),
                                            v_visible));
end;
$function$;

drop function custom.agg_fields_readable_assert(uuid, uuid, text[], text);

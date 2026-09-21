-- 🚨 `custom.visible_predicate_sql` IS LEFT STANDING, ON PURPOSE (lane INVERSE-GUARD, 2026-09-21).
-- It was ADOPTED after this inverse was written: `custom.work_whose_turn`
-- (choiceval_a_state_is_a_word_too.sql) calls it, and that body is on the live path. Dropping it
-- would have broken a door outside this lane to restore a defect inside it.
--   THE DEFECT IS STILL RESTORED IN FULL: the list doors below are put back to their pre-READ-PERF
-- bodies, which walk the per-row ladder and never ask for a predicate, and the READ-PERF
-- `platform.client_callable_door` rows are deleted. The helper stands unused, which is exactly
-- what "the list doors do not filter inside their own query" means.
--
-- READ-PERF file 2, the inverse: the predicate helper dropped and the three list doors put
-- back to the id-list join they carried before this lane.

delete from platform.client_callable_door where schema_name='custom' and declared_by like '%readperf_the_list_doors_filter_inside_their_own_query%';
-- LEFT STANDING (lane INVERSE-GUARD, 2026-09-21): drop function if exists custom.visible_predicate_sql(uuid, uuid, uuid, public.permission_level, text);

CREATE OR REPLACE FUNCTION custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_group_sel  text[] := '{}';
  v_group_lbl  text[] := '{}';
  v_meas_sel   text[] := '{}';
  v_where      text[] := '{}';
  v_key        text;
  v_op         text;
  v_by         text;
  m            jsonb;
  v_sql        text;
  v_i          integer := 0;
begin
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.record_aggregate: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  -- ── the groups ──────────────────────────────────────────────────────────────
  for v_key in select (e #>> '{}') from jsonb_array_elements(coalesce(p_group_by, '[]'::jsonb)) e loop
    -- `array_append`, never `||`: `anyarray || anycompatible` and `anyarray || anyarray` are
    -- both candidates for `text[] || text`, and PostgreSQL resolves it to the SECOND, casting
    -- the string to text[] and raising `malformed array literal` on the first expression that
    -- contains a comma. Named here because the failure is at run time and reads like a bug in
    -- the caller's data.
    v_group_sel := array_append(v_group_sel, custom.agg_value_sql(v_key));
    v_group_lbl := array_append(v_group_lbl, quote_literal(custom.agg_assert_key(v_key)));
  end loop;

  -- ── the bucket, which is a group whose expression is a date_trunc ───────────
  if p_bucket is not null and jsonb_typeof(p_bucket) = 'object' then
    v_key := custom.agg_assert_key(p_bucket ->> 'key');
    v_by  := lower(coalesce(p_bucket ->> 'by', 'month'));
    if not (v_by = any (custom.agg_buckets())) then
      raise exception 'custom.record_aggregate: "%" is not a bucket', v_by
        using errcode = '22023',
              hint = format('Legal buckets: %s.', array_to_string(custom.agg_buckets(), ', '));
    end if;
    -- `created_at` is a real column; anything else is a Field read out of the document. Both
    -- are cast to timestamptz, and a value that is not a date makes the ROW absent from the
    -- bucket rather than making the whole answer fail.
    if v_key = 'created_at' then
      v_group_sel := array_append(v_group_sel, format('date_trunc(%L, r.created_at)::text', v_by));
    else
      v_group_sel := array_append(v_group_sel,
        format('date_trunc(%L, (nullif(%s, '''')::timestamptz))::text', v_by, custom.agg_value_sql(v_key)));
    end if;
    v_group_lbl := array_append(v_group_lbl, quote_literal(v_key || '_' || v_by));
  end if;

  -- ── the measures ────────────────────────────────────────────────────────────
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
      v_meas_sel := array_append(v_meas_sel,
        quote_literal(v_op || '_' || v_key) || ', ' ||
        format('%s(nullif(%s, '''')::numeric)::numeric', v_op, custom.agg_value_sql(v_key)));
    end if;
  end loop;
  if cardinality(v_meas_sel) = 0 then
    v_meas_sel := array[quote_literal('count') || ', count(*)::numeric'];
  end if;

  -- ── the filter, in the same WHERE as Visibility ─────────────────────────────
  if p_filter is not null and jsonb_typeof(p_filter) = 'object' then
    for v_key in select k from jsonb_object_keys(p_filter) k loop
      v_where := array_append(v_where,
        format('%s = %L', custom.agg_value_sql(v_key), p_filter ->> v_key));
    end loop;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- ONE STATEMENT. The JOIN to `custom.query_visible_ids` is inside it, BELOW the
  -- aggregate node, which is exactly what AGT-N-8's "inside the read door's own query"
  -- means and exactly what V4 reads off `EXPLAIN`: the aggregate is computed over the
  -- rows this principal may see, and the rows they may not see are never fetched at all.
  -- ══════════════════════════════════════════════════════════════════════════
  v_sql := format($q$
    select %s as groups,
           jsonb_build_object(%s) as measures,
           count(*)::bigint as row_count
      from custom.query_visible_ids(%L::uuid, %L::uuid, %L) v
      join custom.record r on r.organization_id = %L::uuid and r.id = v
     %s
     %s
     order by count(*) desc
     limit %s
  $q$,
    case when cardinality(v_group_sel) = 0 then '''{}''::jsonb'
         else 'jsonb_build_object(' ||
              (select string_agg(v_group_lbl[i] || ', ' || v_group_sel[i], ', ')
                 from generate_subscripts(v_group_sel, 1) i) || ')' end,
    array_to_string(v_meas_sel, ', '),
    p_organization_id, p_table_id, p_required, p_organization_id,
    case when cardinality(v_where) = 0 then '' else 'where ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    greatest(coalesce(p_limit, 200), 1));

  return v_sql;
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.query_by_coordinates(p_organization_id uuid, p_table_id uuid DEFAULT NULL::uuid, p_coordinates jsonb DEFAULT '[]'::jsonb, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_n integer;
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_by_coordinates');
  if p_table_id is not null then
    perform custom.assert_may_know_table(p_organization_id, p_table_id, 'custom.query_by_coordinates');
  end if;
  if p_organization_id is null then
    raise exception 'custom.query_by_coordinates: organization_id is required - the store is keyed (organization_id, id)'
      using errcode = '22004';
  end if;
  if jsonb_typeof(coalesce(p_coordinates, '[]'::jsonb)) <> 'array' then
    raise exception 'custom.query_by_coordinates: p_coordinates is a JSON ARRAY of coordinates, one object per relation end; got %',
                    jsonb_typeof(p_coordinates)
      using errcode = '22023',
            hint = 'e.g. [{"role":"client","target_id":"…"},{"role":"project","target_id":"…","direction":"to"}]. An empty array means no coordinate constraint, which is the whole Table.';
  end if;

  select count(*) into v_n from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb));

  return query
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce(p_coordinates, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = p_organization_id
       and a.deleted_at is null
       and a.relation_field_id is not null
       and (co.role is null or a.role = co.role)
       and ((co.direction = 'from' and a.source_type = 'record'
             and a.target_id = co.target_id)
         or (co.direction = 'to'
             and a.source_id = co.target_id))
  ),
  satisfied as (
    select rec_id, count(distinct n)::integer as matched
      from hit
     group by rec_id
    having count(distinct n) = v_n
  )
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
    left join satisfied s on s.rec_id = v
   where v_n = 0 or s.rec_id is not null
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.query_across_homes(p_organization_id uuid, p_table_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_required text DEFAULT 'viewer'::text)
 RETURNS TABLE(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query
  with homes as (select h from custom.query_table_homes(p_organization_id, p_table_id) h)
  select r.id,
         (select c.ancestor_id
            from custom.containment_chain(p_organization_id, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         r.data,
         r.created_at
    from custom.query_visible_ids(p_organization_id, p_table_id, p_required) v
    join custom.record r
      on r.organization_id = p_organization_id and r.id = v
   order by r.created_at desc, r.id
   limit greatest(coalesce(p_limit, 50), 0)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- target: branch,production
-- additive: yes
-- guard: custom/system_enabled
-- based-on: custom.agg_sql(uuid, uuid, jsonb, jsonb, jsonb, jsonb, integer, text) 3142a6c403188f3fdf8c391452edf2710e411c6ca1ae9005dea0103ddce3feb0
-- based-on: custom.query_by_coordinates(uuid, uuid, jsonb, integer, integer, text) c9b5728aa007c9e25c3ac8ce79be26cce18e9ddc5867149613bbe447242c4864
-- based-on: custom.query_across_homes(uuid, uuid, integer, integer, text) e4956a91f460156900d81af1c4342575e09e609ed3186f3af678d9800999e393
--
-- READ-PERF — THE LIST DOORS FILTER INSIDE THEIR OWN QUERY, ON THEIR OWN SCAN.
--
-- `readperf_the_read_door_asks_visibility_once.sql` made `custom.query_visible_ids` answer in
-- one question instead of one per row. It is still a SETOF function, and a door that writes
--
--     from custom.query_visible_ids(org, table, 'viewer') v
--     join custom.record r on r.organization_id = org and r.id = v
--
-- materialises every visible id and then probes the primary key once per id, whatever it is
-- about to do with them. Measured on the main database against a 68,000-row Table where the
-- caller sees everything: 350 ms for a 50-row page through `custom.query_by_coordinates` and
-- 450 ms for one grouped aggregate — the ladder was no longer the cost, the id list was.
--
-- DOOR-10 says every query is filtered by Visibility INSIDE the query. A list of ids joined
-- back is the letter of that and not the spirit: the filter belongs in the WHERE of the door's
-- own scan, where the planner can prune the partition, drive the index and stop at the LIMIT.
-- So `custom.visible_predicate_sql` hands the SAME answer over as a SQL predicate, and the three
-- doors that build their own statement put it in their own WHERE.
--
-- THE ANSWERS DO NOT CHANGE. The predicate is built from `custom.visible_set` — the same arms in
-- the same order as `custom.read_records` and `custom.query_visible_ids` use — and when
-- `custom.visible_set` cannot answer, the predicate IS the per-row ladder, exactly as the
-- fallback branch of those two doors is. Every value in it is a uuid, an enum label or a
-- permission level, each written through `format`'s `%L`, so nothing a caller supplies reaches
-- the statement as text.

create function custom.visible_predicate_sql(
  p_user            uuid,
  p_organization_id uuid,
  p_table_id        uuid,
  p_required        public.permission_level default 'viewer'::public.permission_level,
  p_alias           text default 'r')
returns text
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_set   record;
  v_alias text;
begin
  -- The alias is an IDENTIFIER and is quoted as one. It is the door's own word — never a
  -- caller's — and quoting it is what keeps that true of every future caller too.
  v_alias := quote_ident(coalesce(nullif(btrim(p_alias), ''), 'r'));

  if p_user is null then
    -- No principal: the same answer `custom.query_visible_ids` gives, which is the campaign's
    -- own maintenance connection judged by its ROLE.
    return format('(custom.query_is_store_owner())');
  end if;

  v_set := custom.visible_set(p_user, p_organization_id, p_table_id, p_required);

  if v_set.o_fallback then
    -- THE PER-ROW LADDER, verbatim — the same sentence the two doors fall back to.
    return format('custom.has_visibility(%L::uuid, ''record'', %s.id, %L::public.permission_level)',
                  p_user, v_alias, p_required);
  end if;

  if v_set.o_all_visible then
    return 'true';
  end if;

  return format(
    '(%s.created_by = %L::uuid'
    ' or (%s.visibility = any (%L::platform.visibility[]) and not (%s.id = any (%L::uuid[])))'
    ' or %s.id = any (%L::uuid[])'
    ' or %s.id = any (%L::uuid[]))',
    v_alias, p_user,
    v_alias, v_set.o_true_visibility, v_alias, v_set.o_granted_all,
    v_alias, v_set.o_granted_visible,
    v_alias, v_set.o_carried_visible);
end;
$function$;

comment on function custom.visible_predicate_sql(uuid, uuid, uuid, public.permission_level, text) is
  'READ-PERF / DOOR-10: custom.visible_set''s answer as a SQL predicate over one alias of custom.record, so a door that builds its own statement filters inside its own scan instead of joining a materialised list of ids. Same arms, same order, same fallback to the one ladder.';

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes,
   signed_in_callers, anonymous_callers, declared_by, non_client_lane, reason)
select 'custom', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid),
       platform.door_argtypes(p.proargtypes), false, false,
       'migrations/campaign/readperf_the_list_doors_filter_inside_their_own_query.sql (lane READ-PERF)',
       'server_only: called only from inside the list doors of schema custom, which build their own statement. It takes the principal as an argument and returns SQL TEXT; a client reaching it directly could ask about somebody else, and the doors a person calls take no principal and resolve the reader from the session.',
       'p_user is the principal the predicate is FOR and is never taken from a client; p_organization_id and p_table_id are checked by the calling door through custom.assert_client_may_reach and custom.assert_may_know_table before this is asked. A NULL p_user returns the store-owner predicate, which admits nothing to a signed-in caller. p_alias is the calling door''s own table alias and is passed through quote_ident, so it cannot carry SQL; every other value in the returned text is a uuid, an enum label or a permission level written through format %L.'
  from pg_catalog.pg_proc p
 where p.pronamespace = 'custom'::regnamespace
   and p.proname = 'visible_predicate_sql'
on conflict (schema_name, function_name, identity_argtypes) do nothing;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- THE AGGREGATE. Its FROM was a join to the id list; it is now a scan of custom.record with
-- the visibility predicate in the same WHERE as the caller's own filter. Everything else in
-- this body — the groups, the bucket, the measures, the filter, the limit — is unchanged.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.agg_sql(p_organization_id uuid, p_table_id uuid, p_group_by jsonb DEFAULT '[]'::jsonb, p_measures jsonb DEFAULT '[]'::jsonb, p_bucket jsonb DEFAULT NULL::jsonb, p_filter jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 200, p_required text DEFAULT 'viewer'::text)
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
  -- ONE STATEMENT, and Visibility is a PREDICATE in its own WHERE rather than a list of
  -- ids joined back — which is what AGT-N-8's "inside the read door's own query" and
  -- DOOR-10's "never post-filtered" actually ask for, and what lets the planner prune the
  -- partition and drive the index instead of probing the primary key once per visible id.
  -- The aggregate is still computed over exactly the rows this principal may see, and the
  -- rows they may not see are still never fetched at all (READ-PERF).
  -- ══════════════════════════════════════════════════════════════════════════
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
    p_organization_id, p_table_id,
    custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                 p_required::public.permission_level, 'r'),
    case when cardinality(v_where) = 0 then '' else 'and ' || array_to_string(v_where, ' and ') end,
    case when cardinality(v_group_sel) = 0 then ''
         else 'group by ' || (select string_agg(i::text, ', ')
                                from generate_subscripts(v_group_sel, 1) i) end,
    greatest(coalesce(p_limit, 200), 1));

  return v_sql;
end;
$function$

;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- THE COORDINATE QUERY. Its coordinate maths is untouched; what changes is that the rows it
-- pages over come from `custom.record` with the visibility predicate in the WHERE, so the
-- ORDER BY / LIMIT runs on a scan the index can drive rather than on a materialised id list.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.query_by_coordinates(
  p_organization_id uuid,
  p_table_id        uuid default null::uuid,
  p_coordinates     jsonb default '[]'::jsonb,
  p_limit           integer default 50,
  p_offset          integer default 0,
  p_required        text default 'viewer'::text)
returns table(record_id uuid, table_id uuid, data jsonb, coordinates_matched integer)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
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

  return query execute format($q$
  with coord as (
    select ord                                        as n,
           c ->> 'role'                               as role,
           (c ->> 'target_id')::uuid                  as target_id,
           coalesce(c ->> 'direction', 'from')        as direction
      from jsonb_array_elements(coalesce($1, '[]'::jsonb))
           with ordinality as t(c, ord)
  ),
  -- ONE pass over the edges: every record that satisfies at least one coordinate, with the
  -- count of DISTINCT coordinates it satisfies. Two edges answering the same coordinate count
  -- once, which is why `distinct co.n` and not `count(*)`.
  hit as (
    select case when co.direction = 'to' then a.source_id else a.target_id end as other_id,
           case when co.direction = 'to' then a.target_id else a.source_id end as rec_id,
           co.n
      from coord co
      join platform.associations a
        on a.organization_id = $2
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
    having count(distinct n) = $3
  )
  select r.id, r.table_id, r.data, coalesce(s.matched, 0)
    from custom.record r
    left join satisfied s on s.rec_id = r.id
   where r.organization_id = $2
     and ($4::uuid is null or r.table_id = $4::uuid)
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
     and ($3 = 0 or s.rec_id is not null)
   order by r.created_at desc, r.id
   limit $5 offset $6
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using coalesce(p_coordinates, '[]'::jsonb), p_organization_id, v_n, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

-- ────────────────────────────────────────────────────────────────────────────────────────
-- THE ACROSS-HOMES QUERY (DOOR-9). Same change, same reason.
-- ────────────────────────────────────────────────────────────────────────────────────────
create or replace function custom.query_across_homes(
  p_organization_id uuid,
  p_table_id        uuid,
  p_limit           integer default 50,
  p_offset          integer default 0,
  p_required        text default 'viewer'::text)
returns table(record_id uuid, home_record_id uuid, data jsonb, created_at timestamp with time zone)
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $function$
begin
  perform custom.assert_client_may_reach(p_organization_id, 'custom.query_across_homes');
  if p_organization_id is null or p_table_id is null then
    raise exception 'custom.query_across_homes: the organization and the Table are both required'
      using errcode = '22004';
  end if;

  return query execute format($q$
  with homes as (select h from custom.query_table_homes($1, $2) h)
  select r.id,
         -- The record's own Home: the nearest ancestor in its containment chain that is one
         -- of this Table's Homes. A record directly under a Home has depth 1; a record three
         -- containers down still reports the Home it ultimately sits in.
         (select c.ancestor_id
            from custom.containment_chain($1, r.id) c
            join homes on homes.h = c.ancestor_id
           order by c.depth
           limit 1),
         r.data,
         r.created_at
    from custom.record r
   where r.organization_id = $1
     and r.table_id = $2
     and r.deleted_at is null
     and coalesce(r.metadata ->> 'quarantine', 'false') <> 'true'
     and %s
   order by r.created_at desc, r.id
   limit $3 offset $4
  $q$, custom.visible_predicate_sql(custom.query_principal(), p_organization_id, p_table_id,
                                    p_required::public.permission_level, 'r'))
  using p_organization_id, p_table_id,
        greatest(coalesce(p_limit, 50), 0), greatest(coalesce(p_offset, 0), 0);
end;
$function$;

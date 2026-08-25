-- Keep the traffic-class lookup proportional to the selected GSC window.
--
-- Previously gsc_perf_class_summary called gsc_keyword_class_map(site) with no
-- keyword scope. That expands the entire live seo.keyword corpus before joining
-- it back to the window's facts. The portfolio RPC invokes this function once
-- per site, so the repeated corpus scan crossed PostgREST's statement timeout
-- for multi-site accounts. Passing the exact distinct keyword ids already
-- present in `latest` preserves the classification contract while bounding the
-- expensive facet lookup to rows the aggregation can actually consume.

create or replace function seo.gsc_perf_class_summary(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date default null,
  p_compare_end date default null
)
returns table (
  traffic_class text,
  clicks bigint,
  impressions bigint,
  queries bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_queries bigint
)
language plpgsql
stable
security definer
set search_path to 'seo', 'pg_temp'
as $function$
begin
  perform seo.gsc_assert_site_access(p_site_id);
  if (p_compare_start is null) <> (p_compare_end is null) then
    raise exception 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  end if;

  return query
  with winner as (
    select distinct on (spd.date) spd.date as d, spd.run_id as rid
    from seo.search_performance_daily spd
    where spd.provider = 'gsc'
      and spd.site_id = p_site_id
      and spd.dimension_profile = 'query'
      and spd.date between least(coalesce(p_compare_start, p_start), p_start)
                       and greatest(coalesce(p_compare_end, p_end), p_end)
    order by spd.date, spd.created_at desc, spd.run_id desc
  ),
  latest as materialized (
    select spd.date as d, spd.clicks as c, spd.impressions as i,
           spd.keyword_id as kid, spd.query as q
    from seo.search_performance_daily spd
    join winner w on w.d = spd.date and w.rid = spd.run_id
    where spd.provider = 'gsc'
      and spd.site_id = p_site_id
      and spd.dimension_profile = 'query'
  ),
  keyword_scope as (
    select array_agg(distinct l.kid) filter (where l.kid is not null) as ids
    from latest l
  ),
  classed as (
    select l.*, coalesce(cm.traffic_class, 'unclassified') as cls
    from latest l
    cross join keyword_scope ks
    left join lateral seo.gsc_keyword_class_map(p_site_id, ks.ids) cm
      on cm.keyword_id = l.kid
  )
  select c.cls,
         coalesce(sum(c.c) filter (where c.d between p_start and p_end), 0)::bigint,
         coalesce(sum(c.i) filter (where c.d between p_start and p_end), 0)::bigint,
         count(distinct c.q) filter (where c.d between p_start and p_end)::bigint,
         case when p_compare_start is not null
              then coalesce(sum(c.c) filter (where c.d between p_compare_start and p_compare_end), 0)::bigint end,
         case when p_compare_start is not null
              then coalesce(sum(c.i) filter (where c.d between p_compare_start and p_compare_end), 0)::bigint end,
         case when p_compare_start is not null
              then count(distinct c.q) filter (where c.d between p_compare_start and p_compare_end)::bigint end
  from classed c
  group by c.cls
  order by 2 desc;
end;
$function$;

revoke all on function seo.gsc_perf_class_summary(uuid, date, date, date, date) from public, anon;
grant execute on function seo.gsc_perf_class_summary(uuid, date, date, date, date) to authenticated;

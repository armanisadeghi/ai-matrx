-- seo.gsc_perf_class_summary_multi — portfolio/brand-level traffic-class rollup.
--
-- WHY: the traffic-class decomposition existed only per site, so brand pages and
-- the /marketing hub had no way to answer "is our money traffic up or down
-- across these sites?" without N round trips. Canvas doctrine rung 6 wants that
-- data embedded wherever it helps; rung 2 says the raw total is never the
-- headline.
--
-- HOW: this DELEGATES to seo.gsc_perf_class_summary per site rather than
-- re-implementing the winning-run dedup + class-resolver join. The accuracy
-- contract therefore lives in exactly one place, and each site keeps its own
-- SECURITY DEFINER access assert.
--
-- Sites the caller cannot read are SKIPPED, not raised: a portfolio spans many
-- sites and one inaccessible row must not blank the whole rollup. The returned
-- `sites` count tells the UI how many actually contributed, so the surface can
-- say so instead of silently under-reporting.
--
-- NOT RETURNED: a distinct query count. Summing per-site DISTINCT counts
-- double-counts a phrase that ranks on two sites, and a subtly wrong number is
-- worse than an absent one. Clicks and impressions are exactly additive.

create or replace function seo.gsc_perf_class_summary_multi(
  p_site_ids uuid[],
  p_start date,
  p_end date,
  p_compare_start date default null,
  p_compare_end date default null
)
returns table (
  traffic_class text,
  clicks bigint,
  impressions bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  sites integer
)
language plpgsql
stable
security definer
set search_path to 'seo', 'pg_temp'
as $function$
declare
  v_site uuid;
  v_ok uuid[] := '{}';
begin
  if p_site_ids is null or cardinality(p_site_ids) = 0 then
    return;
  end if;
  if (p_compare_start is null) <> (p_compare_end is null) then
    raise exception 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  end if;

  -- Access-filter first so the aggregate below never touches a denied site.
  foreach v_site in array p_site_ids loop
    begin
      perform seo.gsc_assert_site_access(v_site);
      v_ok := v_ok || v_site;
    exception
      when others then
        continue;
    end;
  end loop;

  if cardinality(v_ok) = 0 then
    return;
  end if;

  return query
  with per_site as (
    select s.site_id, r.*
    from unnest(v_ok) as s(site_id)
    cross join lateral seo.gsc_perf_class_summary(
      s.site_id, p_start, p_end, p_compare_start, p_compare_end
    ) r
  )
  select
    ps.traffic_class,
    coalesce(sum(ps.clicks), 0)::bigint,
    coalesce(sum(ps.impressions), 0)::bigint,
    case when p_compare_start is not null
         then coalesce(sum(ps.cmp_clicks), 0)::bigint end,
    case when p_compare_start is not null
         then coalesce(sum(ps.cmp_impressions), 0)::bigint end,
    count(distinct ps.site_id)::integer
  from per_site ps
  group by ps.traffic_class
  order by 2 desc;
end;
$function$;

grant execute on function seo.gsc_perf_class_summary_multi(uuid[], date, date, date, date)
  to authenticated;

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
-- sites and one inaccessible row must not blank the whole rollup. ONLY an access
-- denial skips — a timeout or schema fault must propagate, or the UI blames the
-- user's integration for a server problem. The returned `sites` count is
-- computed across all contributing sites (NOT per traffic class, which
-- under-reported whenever two sites had disjoint classes).
--
-- Ships with seo.gsc_perf_freshness_multi(uuid[]) — the freshest QUERY-profile
-- day across the set, so a portfolio window clamps to real data instead of
-- including empty trailing days and biasing every delta negative.
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
  v_site_count integer;
begin
  if p_site_ids is null or cardinality(p_site_ids) = 0 then
    return;
  end if;
  if (p_compare_start is null) <> (p_compare_end is null) then
    raise exception 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  end if;

  -- Dedupe: unnest of [A,A] would double every additive metric while the
  -- distinct site count stayed 1.
  for v_site in select distinct u from unnest(p_site_ids) as u loop
    begin
      perform seo.gsc_assert_site_access(v_site);
      v_ok := v_ok || v_site;
    exception
      -- ONLY an access denial is a skip. Anything else (statement_timeout,
      -- deadlock, a broken assert after a schema change) must propagate.
      when insufficient_privilege or raise_exception then
        continue;
    end;
  end loop;

  v_site_count := cardinality(v_ok);
  if v_site_count = 0 then
    return;
  end if;

  return query
  with per_site as (
    select s.site_id, r.*
    from unnest(v_ok) as s(site_id)
    cross join lateral seo.gsc_perf_class_summary(
      s.site_id, p_start, p_end, p_compare_start, p_compare_end
    ) r
  ),
  contributing as (
    select count(distinct ps.site_id)::integer as n from per_site ps
  )
  select
    ps.traffic_class,
    coalesce(sum(ps.clicks), 0)::bigint,
    coalesce(sum(ps.impressions), 0)::bigint,
    case when p_compare_start is not null
         then coalesce(sum(ps.cmp_clicks), 0)::bigint end,
    case when p_compare_start is not null
         then coalesce(sum(ps.cmp_impressions), 0)::bigint end,
    (select n from contributing)
  from per_site ps
  group by ps.traffic_class
  order by 2 desc;
end;
$function$;

revoke all on function seo.gsc_perf_class_summary_multi(uuid[], date, date, date, date) from public, anon;
grant execute on function seo.gsc_perf_class_summary_multi(uuid[], date, date, date, date) to authenticated;

create or replace function seo.gsc_perf_freshness_multi(p_site_ids uuid[])
returns date
language plpgsql
stable
security definer
set search_path to 'seo', 'pg_temp'
as $function$
declare
  v_site uuid;
  v_max date := null;
  v_row record;
begin
  if p_site_ids is null or cardinality(p_site_ids) = 0 then
    return null;
  end if;
  for v_site in select distinct u from unnest(p_site_ids) as u loop
    begin
      perform seo.gsc_assert_site_access(v_site);
    exception
      when insufficient_privilege or raise_exception then
        continue;
    end;
    for v_row in
      select f.max_date from seo.gsc_perf_freshness(v_site) f
      where f.dimension_profile = 'query'
    loop
      if v_max is null or v_row.max_date > v_max then
        v_max := v_row.max_date;
      end if;
    end loop;
  end loop;
  return v_max;
end;
$function$;

revoke all on function seo.gsc_perf_freshness_multi(uuid[]) from public, anon;
grant execute on function seo.gsc_perf_freshness_multi(uuid[]) to authenticated;

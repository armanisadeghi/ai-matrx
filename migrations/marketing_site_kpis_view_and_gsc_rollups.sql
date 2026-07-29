-- Marketing sites portfolio KPIs.
--
-- 1. web.v_site_kpis — one row per live site with the portfolio-table numbers:
--    canonical page count, pages Google reports (GSC), 28-day clicks /
--    impressions / weighted position, and the previous-28-day clicks and
--    impressions so the UI can show a trend delta (previous window values are
--    NULL when Google has no data there yet — never laundered into 0).
-- 2. web.site_gsc_daily(site, days) — the site-level daily GSC rollup that
--    powers the hover-peek traffic chart.
-- 3. web.site_gsc_top_pages(site, days, limit) — top canonical pages by
--    clicks for the same peek.
--
-- All three are SECURITY INVOKER (matching web.v_page_list / v_site_score),
-- so RLS on web.site / web.page / web.gsc_page_stat remains the ceiling.

create or replace view web.v_site_kpis with (security_invoker = true) as
with page_rollup as (
  select p.site_id, count(*) as page_count
  from web.page p
  where p.deleted_at is null
  group by p.site_id
),
gsc_rollup as (
  select
    s.site_id,
    count(distinct s.page_id) as pages_in_gsc,
    count(*) filter (where s.date >= current_date - 28) as cur_rows,
    sum(s.clicks) filter (where s.date >= current_date - 28) as clicks_28d,
    sum(s.impressions) filter (where s.date >= current_date - 28) as impressions_28d,
    sum(s."position" * greatest(s.impressions, 1)::numeric)
      filter (where s.date >= current_date - 28 and s."position" is not null)
      / nullif(
          sum(greatest(s.impressions, 1))
            filter (where s.date >= current_date - 28 and s."position" is not null),
          0
        )::numeric as position_28d,
    count(*) filter (where s.date >= current_date - 56 and s.date < current_date - 28) as prev_rows,
    count(distinct s.date) filter (where s.date >= current_date - 28) as cur_days,
    count(distinct s.date) filter (where s.date >= current_date - 56 and s.date < current_date - 28) as prev_days,
    sum(s.clicks) filter (where s.date >= current_date - 56 and s.date < current_date - 28) as clicks_prev_28d,
    sum(s.impressions) filter (where s.date >= current_date - 56 and s.date < current_date - 28) as impressions_prev_28d,
    max(s.date) as gsc_latest_date
  from web.gsc_page_stat s
  where s.deleted_at is null
  group by s.site_id
)
select
  site.id as site_id,
  coalesce(pr.page_count, 0) as page_count,
  coalesce(g.pages_in_gsc, 0) as pages_in_gsc,
  case when g.cur_rows > 0 then g.clicks_28d end as gsc_clicks_28d,
  case when g.cur_rows > 0 then g.impressions_28d end as gsc_impressions_28d,
  case when g.cur_rows > 0 then g.position_28d end as gsc_position_28d,
  case when g.prev_rows > 0 then g.clicks_prev_28d end as gsc_clicks_prev_28d,
  case when g.prev_rows > 0 then g.impressions_prev_28d end as gsc_impressions_prev_28d,
  coalesce(g.cur_days, 0) as gsc_cur_days,
  coalesce(g.prev_days, 0) as gsc_prev_days,
  g.gsc_latest_date
from web.site site
left join page_rollup pr on pr.site_id = site.id
left join gsc_rollup g on g.site_id = site.id
where site.deleted_at is null;

grant select on web.v_site_kpis to authenticated, service_role;

create or replace function web.site_gsc_daily(
  p_site_id uuid,
  p_days integer default 90
)
returns table (
  stat_date date,
  clicks bigint,
  impressions bigint,
  avg_position numeric
)
language sql
stable
set search_path = ''
as $$
  select
    s.date as stat_date,
    sum(s.clicks) as clicks,
    sum(s.impressions) as impressions,
    sum(s."position" * greatest(s.impressions, 1)::numeric)
      filter (where s."position" is not null)
      / nullif(
          sum(greatest(s.impressions, 1)) filter (where s."position" is not null),
          0
        )::numeric as avg_position
  from web.gsc_page_stat s
  where s.site_id = p_site_id
    and s.deleted_at is null
    and s.date >= current_date - greatest(p_days, 1)
  group by s.date
  order by s.date
$$;

create or replace function web.site_gsc_top_pages(
  p_site_id uuid,
  p_days integer default 90,
  p_limit integer default 10
)
returns table (
  page_id uuid,
  url text,
  path text,
  clicks bigint,
  impressions bigint,
  avg_position numeric
)
language sql
stable
set search_path = ''
as $$
  select
    s.page_id,
    p.url,
    p.path,
    sum(s.clicks) as clicks,
    sum(s.impressions) as impressions,
    sum(s."position" * greatest(s.impressions, 1)::numeric)
      filter (where s."position" is not null)
      / nullif(
          sum(greatest(s.impressions, 1)) filter (where s."position" is not null),
          0
        )::numeric as avg_position
  from web.gsc_page_stat s
  join web.page p on p.id = s.page_id and p.deleted_at is null
  where s.site_id = p_site_id
    and s.deleted_at is null
    and s.date >= current_date - greatest(p_days, 1)
  group by s.page_id, p.url, p.path
  order by sum(s.clicks) desc, sum(s.impressions) desc
  limit greatest(p_limit, 1)
$$;

grant execute on function web.site_gsc_daily(uuid, integer) to authenticated, service_role;
grant execute on function web.site_gsc_top_pages(uuid, integer, integer) to authenticated, service_role;

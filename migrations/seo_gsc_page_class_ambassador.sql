-- Page-level GSC ambassador support.
--
-- One text resolver reuses seo.fn_normalize_phrase +
-- seo.gsc_keyword_class_map; page rollups reuse the surviving
-- seo.search_performance_daily query_page profile. No class mapping or
-- normalization is reimplemented by a client surface.

create or replace function seo.gsc_keyword_class_by_text(
  p_site_id uuid,
  p_queries text[]
)
returns table(
  query text,
  keyword_id uuid,
  traffic_class text,
  class_source text
)
language plpgsql
stable
security definer
set search_path = seo, pg_temp
as $$
begin
  perform seo.gsc_assert_site_access(p_site_id);

  if coalesce(array_length(p_queries, 1), 0) > 1000 then
    raise exception 'gsc_keyword_class_by_text_too_many: max 1000 queries';
  end if;

  return query
  with inputs as materialized (
    select min(q.query) as original_query,
           seo.fn_normalize_phrase(q.query) as normalized_query
    from unnest(coalesce(p_queries, '{}'::text[])) as q(query)
    where nullif(btrim(q.query), '') is not null
    group by seo.fn_normalize_phrase(q.query)
  ), matched as materialized (
    select i.original_query,
           kw.id as kid
    from inputs i
    left join lateral (
      select k.id
      from seo.keyword k
      where k.normalized_phrase = i.normalized_query
        and k.deleted_at is null
      order by (k.language = 'en') desc, (k.language = 'und') desc, k.created_at, k.id
      limit 1
    ) kw on true
  )
  select m.original_query,
         m.kid,
         coalesce(cm.traffic_class, 'unclassified'),
         coalesce(cm.class_source, 'none')
  from matched m
  left join seo.gsc_keyword_class_map(p_site_id) cm on cm.keyword_id = m.kid
  order by m.original_query;
end;
$$;

comment on function seo.gsc_keyword_class_by_text(uuid, text[]) is
  'Resolves GSC query text through the canonical keyword normalizer and site class map.';

revoke all on function seo.gsc_keyword_class_by_text(uuid, text[]) from public, anon;
grant execute on function seo.gsc_keyword_class_by_text(uuid, text[]) to authenticated, service_role;

create or replace function seo.gsc_perf_page_class_summary(
  p_site_id uuid,
  p_page_id uuid,
  p_start date,
  p_end date,
  p_compare_start date default null,
  p_compare_end date default null
)
returns table(
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
set search_path = seo, pg_temp
as $$
begin
  perform seo.gsc_assert_site_access(p_site_id);

  if (p_compare_start is null) <> (p_compare_end is null) then
    raise exception 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  end if;

  return query
  with winner as materialized (
    select distinct on (spd.date) spd.date as d, spd.run_id as rid
    from seo.search_performance_daily spd
    where spd.provider = 'gsc'
      and spd.site_id = p_site_id
      and spd.dimension_profile = 'query_page'
      and spd.date between least(coalesce(p_compare_start, p_start), p_start)
                       and greatest(coalesce(p_compare_end, p_end), p_end)
    order by spd.date, spd.created_at desc, spd.run_id desc
  ), latest as materialized (
    select spd.date as d,
           spd.clicks as c,
           spd.impressions as i,
           spd.keyword_id as kid,
           spd.query as q,
           seo.fn_normalize_phrase(spd.query) as normalized_query
    from seo.search_performance_daily spd
    join winner w on w.d = spd.date and w.rid = spd.run_id
    where spd.provider = 'gsc'
      and spd.site_id = p_site_id
      and spd.dimension_profile = 'query_page'
      and spd.page_id = p_page_id
      and spd.query is not null
  ), resolved as materialized (
    select l.*,
           coalesce(l.kid, kw.id) as resolved_keyword_id
    from latest l
    left join lateral (
      select k.id
      from seo.keyword k
      where l.kid is null
        and k.normalized_phrase = l.normalized_query
        and k.deleted_at is null
      order by (k.language = 'en') desc, (k.language = 'und') desc, k.created_at, k.id
      limit 1
    ) kw on true
  ), classed as (
    select r.*,
           coalesce(cm.traffic_class, 'unclassified') as cls
    from resolved r
    left join seo.gsc_keyword_class_map(p_site_id) cm
      on cm.keyword_id = r.resolved_keyword_id
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
$$;

comment on function seo.gsc_perf_page_class_summary(uuid, uuid, date, date, date, date) is
  'Traffic-class GSC summary for one canonical page from the query_page profile.';

revoke all on function seo.gsc_perf_page_class_summary(uuid, uuid, date, date, date, date) from public, anon;
grant execute on function seo.gsc_perf_page_class_summary(uuid, uuid, date, date, date, date) to authenticated, service_role;

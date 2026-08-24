-- KI-032 — the human-vs-AI verification loop's ONE read: this site's HUMAN
-- rulings on one dimension, demand-ordered, with the reason each ruling
-- carried (P24 — the reason is the training material the blind check argues
-- against). SECURITY DEFINER behind the same site-access assert as every
-- gsc_* read. Idempotent.

create or replace function seo.gsc_human_rulings(
  p_site_id uuid,
  p_dimension_slug text,
  p_start date,
  p_end date,
  p_limit integer default 20
)
returns table(
  keyword_id uuid,
  keyword text,
  clicks bigint,
  impressions bigint,
  value_id uuid,
  value_slug text,
  value_label text,
  reason text,
  pinned boolean,
  ruled_at timestamptz,
  ruled_total bigint
)
language plpgsql
stable security definer
set search_path to 'seo', 'platform', 'public', 'pg_temp'
as $function$
begin
  perform seo.gsc_assert_site_access(p_site_id);

  return query
  with dim as (
    select c.id
    from platform.categories c
    where c.dimension = 'seo_facet' and c.slug = p_dimension_slug
      and c.parent_id is null and c.deleted_at is null
  ),
  vals as (
    select c.id, c.slug, c.name
    from platform.categories c
    join dim on c.parent_id = dim.id
    where c.deleted_at is null
  ),
  winner as (
    select distinct on (spd.date) spd.date as d, spd.run_id as rid
    from seo.search_performance_daily spd
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query'
      and spd.date between p_start and p_end
    order by spd.date, spd.created_at desc, spd.run_id desc
  ),
  vol as (
    select spd.keyword_id as kid,
           sum(spd.clicks)::bigint as c,
           sum(spd.impressions)::bigint as i
    from seo.search_performance_daily spd
    join winner w on w.d = spd.date and w.rid = spd.run_id
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.keyword_id is not null
    group by spd.keyword_id
  ),
  ruled as (
    select kf.keyword_id as kid, kf.category_id, kf.notes, kf.pinned,
           kf.updated_at
    from seo.keyword_facet kf
    join vals v on v.id = kf.category_id
    where kf.deleted_at is null and kf.source = 'human'
      and (kf.site_id = p_site_id or kf.site_id is null)
  ),
  counted as (select count(*)::bigint as n from ruled)
  select r.kid, k.normalized_phrase,
         coalesce(vol.c, 0), coalesce(vol.i, 0),
         v.id, v.slug, v.name, r.notes, r.pinned, r.updated_at, ct.n
  from ruled r
  cross join counted ct
  join seo.keyword k on k.id = r.kid and k.deleted_at is null
  join vals v on v.id = r.category_id
  left join vol on vol.kid = r.kid
  order by coalesce(vol.c, 0) desc, coalesce(vol.i, 0) desc, r.kid
  limit greatest(least(p_limit, 100), 1);
end;
$function$;

grant execute on function seo.gsc_human_rulings(uuid, text, date, date, integer) to authenticated;

notify pgrst, 'reload schema';

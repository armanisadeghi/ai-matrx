-- seo.starter_pack_corpus — the evidence bundle a pack is PROPOSED FROM.
--
-- Multi-tenant by construction: any SEO company points it at their own sample
-- clients in one industry and gets back the real GSC demand plus the controlled
-- vocabularies the proposal must speak in (D30 — an agent that free-types a
-- facet value or a band name is producing a defect). Access is asserted per
-- site, so a caller can only bundle sites they can already read.
--
-- v2 fixed two live defects found the first time it ran:
--   * GSC stores the same demand twice (dimension_profile 'query' AND
--     'query_page'), so an unfiltered SUM double-counted every click.
--   * Joining seo.keyword before ranking made the aggregate scan the whole
--     196k-row global corpus and time out. Aggregate keyword_ids first, rank,
--     then join phrases for the survivors only.
--
-- Applied live 2026-08-21.

create or replace function seo.starter_pack_corpus(
  p_site_ids uuid[],
  p_days integer default 365,
  p_top_n integer default 120
) returns jsonb
language plpgsql stable security definer set search_path to 'seo','platform','web','pg_temp'
as $$
declare
  v_site uuid;
  v_end date;
  v_start date;
  v_sites jsonb := '[]'::jsonb;
begin
  if p_site_ids is null or array_length(p_site_ids, 1) is null then
    raise exception 'seo_pack_corpus_no_sites';
  end if;
  foreach v_site in array p_site_ids loop
    perform seo.gsc_assert_site_access(v_site);
  end loop;

  select max(d.date) into v_end from seo.search_performance_daily d
   where d.site_id = any(p_site_ids) and d.provider = 'gsc'
     and d.dimension_profile = 'query';
  if v_end is null then
    raise exception 'seo_pack_corpus_no_performance_data';
  end if;
  v_start := v_end - make_interval(days => greatest(p_days, 28));

  with per_kw as (
    select d.site_id, d.keyword_id,
           sum(d.clicks)::bigint clicks,
           sum(d.impressions)::bigint impressions,
           round((sum(d.average_position * d.impressions)
                  / nullif(sum(d.impressions), 0))::numeric, 1) position
    from seo.search_performance_daily d
    where d.site_id = any(p_site_ids)
      and d.provider = 'gsc'
      and d.dimension_profile = 'query'
      and d.query is not null
      and d.date between v_start and v_end
    group by d.site_id, d.keyword_id
  ),
  totals as (
    select site_id, count(*)::int distinct_keywords,
           sum(clicks)::bigint clicks, sum(impressions)::bigint impressions
    from per_kw group by site_id
  ),
  ranked as (
    select *,
      row_number() over (partition by site_id order by clicks desc, impressions desc) rk_clicks,
      row_number() over (partition by site_id order by impressions desc, clicks desc) rk_impr
    from per_kw
  ),
  picked as (
    select r.*, k.phrase, k.intent_class, k.audience_type, k.funnel_stage,
           k.price_sensitivity, k.local_intent, k.compliance_framing
    from ranked r
    join seo.keyword k on k.id = r.keyword_id and k.deleted_at is null
    where r.rk_clicks <= p_top_n or r.rk_impr <= p_top_n
  ),
  kw_json as (
    select site_id,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'q', phrase, 'clicks', clicks, 'impressions', impressions, 'position', position,
        'intent', intent_class, 'audience', audience_type, 'funnel', funnel_stage,
        'price', price_sensitivity, 'local', local_intent, 'compliance', compliance_framing))
        order by clicks desc, impressions desc)
        filter (where rk_clicks <= p_top_n) as top_by_clicks,
      jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'q', phrase, 'clicks', clicks, 'impressions', impressions, 'position', position,
        'intent', intent_class, 'audience', audience_type))
        order by impressions desc)
        filter (where rk_impr <= p_top_n and rk_clicks > p_top_n) as top_by_impressions
    from picked group by site_id
  )
  select jsonb_agg(jsonb_build_object(
    'domain', s.domain, 'name', s.name,
    'distinct_keywords', t.distinct_keywords,
    'clicks', t.clicks, 'impressions', t.impressions,
    'top_by_clicks', coalesce(j.top_by_clicks, '[]'::jsonb),
    'top_by_impressions', coalesce(j.top_by_impressions, '[]'::jsonb),
    'kw_guidelines', (select g.guidelines from seo.gsc_site_kw_guidelines(s.id) g))
    order by t.clicks desc)
  into v_sites
  from totals t
  join web.site s on s.id = t.site_id
  left join kw_json j on j.site_id = t.site_id;

  return jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end),
    'sites', coalesce(v_sites, '[]'::jsonb),
    -- The controlled vocabularies the proposal MUST use.
    'facet_vocabulary', (
      select jsonb_object_agg(facet, vals) from (
        select split_part(c.slug, ':', 1) facet,
               jsonb_agg(split_part(c.slug, ':', 2) order by c.slug) vals
        from platform.categories c
        where c.dimension = 'seo_facet' and c.deleted_at is null and c.slug like '%:%'
        group by 1) f),
    'value_band_defaults', (
      select jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name,
             'min_score', c.metadata->>'min_score') order by c.position)
      from platform.categories c
      where c.dimension = 'seo_value_band' and c.deleted_at is null),
    'geo_band_defaults', (
      select jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name,
             'multiplier', c.metadata->>'multiplier') order by c.position)
      from platform.categories c
      where c.dimension = 'seo_geo_band' and c.deleted_at is null),
    'node_types', to_jsonb(array['service','product','problem','audience','brand',
                                 'authority','existing_customer','recruiting',
                                 'reputation','partner']),
    'existing_topics', coalesce((
      select jsonb_agg(jsonb_build_object('slug', t.slug, 'name', t.name,
             'node_type', t.node_type,
             'parent_slug', (select p.slug from seo.topic p where p.id = t.parent_id))
             order by t.slug)
      from seo.topic t where t.deleted_at is null), '[]'::jsonb),
    'universal_rule_templates', coalesce((
      select jsonb_agg(jsonb_build_object('name', r.name, 'pattern', r.pattern,
             'match_kind', r.match_kind, 'target_class', r.target_class) order by r.name)
      from seo.keyword_class_rule r
      where r.is_template and r.pack_id is null and r.deleted_at is null), '[]'::jsonb)
  );
end;
$$;

revoke all on function seo.starter_pack_corpus(uuid[], integer, integer) from public;
grant execute on function seo.starter_pack_corpus(uuid[], integer, integer) to authenticated, service_role;
notify pgrst, 'reload schema';

-- KI-030 — the review screen bands its projection against the ladder that will
-- exist AFTER adoption, because adoption installs the pack's levels too.
-- Measured defect: prpinjectionmd.com was shown 797 Gold / 192 Platinum and
-- landed 5 Gold / 1,325 Platinum, because the site had no vocabulary of its own
-- and the projection fell back to the platform template while adoption wrote
-- the pack's. Idempotent.

CREATE OR REPLACE FUNCTION seo.starter_pack_preview(p_site_id uuid, p_pack_id uuid, p_start date, p_end date, p_item_ids uuid[] DEFAULT NULL::uuid[], p_sample integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_sample int := greatest(1, least(coalesce(p_sample, 3), 10));
begin
  perform seo.gsc_assert_site_access(p_site_id);

  with recursive
  winner as (
    select distinct on (spd.date) spd.date as d, spd.run_id as rid
    from seo.search_performance_daily spd
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.date between p_start and p_end
    order by spd.date, spd.created_at desc, spd.run_id desc
  ),
  vol as (
    select spd.keyword_id as kid, sum(spd.clicks)::bigint as c, sum(spd.impressions)::bigint as i
    from seo.search_performance_daily spd
    join winner w on w.d = spd.date and w.rid = spd.run_id
    where spd.provider = 'gsc' and spd.site_id = p_site_id
      and spd.dimension_profile = 'query' and spd.keyword_id is not null
    group by spd.keyword_id
  ),
  ids as (select array_agg(kid) as a from vol),
  vm as (select * from seo.keyword_value_map(p_site_id, (select a from ids))),
  -- THE LADDER THE SCORE WILL BE READ AGAINST (KI-030). Adoption also installs
  -- the pack's LEVELS, so banding the projection against the ladder that is
  -- live TODAY answers a question nobody asked. This is the ladder that will
  -- exist after adoption: the site's own rows, plus the selected pack bands for
  -- values the site does not already carry (exactly what adoption inserts), and
  -- the platform template only when neither has anything to say.
  site_bands as (
    select sv.value, (sv.config->>'min_score')::numeric as min_score
    from seo.site_vocabulary sv
    where sv.site_id = p_site_id and sv.vocab_kind = 'value_band' and sv.active
      and sv.deleted_at is null and sv.config ? 'min_score'
  ),
  pack_bands as (
    select i.value, (i.config->>'min_score')::numeric as min_score
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'value_band' and i.deleted_at is null
      and i.config ? 'min_score'
      and (p_item_ids is null or i.id = any(p_item_ids))
      and not exists (select 1 from seo.site_vocabulary sv
                       where sv.site_id = p_site_id and sv.vocab_kind = 'value_band'
                         and sv.value = i.value)
  ),
  bands as (
    select value, min_score from site_bands
    union all
    select value, min_score from pack_bands
    union all
    select c.slug, (c.metadata->>'min_score')::numeric
    from platform.categories c
    where c.dimension = 'seo_value_band' and c.deleted_at is null and c.metadata ? 'min_score'
      and not exists (select 1 from site_bands)
      and not exists (select 1 from pack_bands)
  ),
  base as (
    select v.kid, k.normalized_phrase, v.c, v.i,
           coalesce(m.value_band, 'unvalued') as band,
           coalesce(m.value_source, 'unvalued') as source,
           m.value_score as score,
           coalesce(m.reasons, '[]'::jsonb) as reasons
    from vol v
    join seo.keyword k on k.id = v.kid and k.deleted_at is null
    left join vm m on m.keyword_id = v.kid
  ),
  -- ── the pack's meaning, resolved against what this site already has ──
  pmeaning as (
    select i.id as item_id, i.dimension_scope, i.dimension_slug, i.value, i.label,
           i.worth_effect, i.worth_amount, i.matchers, i.sort,
           seo._pack_site_value_id(p_site_id, i.dimension_scope, i.dimension_slug, i.value) as value_id
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'meaning' and i.deleted_at is null
      and (p_item_ids is null or i.id = any(p_item_ids))
  ),
  pstate as (
    select m.*,
           coalesce((select true from seo.site_value_worth w
                      where w.site_id = p_site_id and w.value_id = m.value_id
                        and w.deleted_at is null limit 1), false) as already_adopted
    from pmeaning m
  ),
  raw_hits as (
    -- a phrase the pack would stamp
    select b.kid, m.item_id, m.dimension_slug, m.sort
    from base b
    join pstate m on jsonb_array_length(coalesce(m.matchers, '[]'::jsonb)) > 0
    join lateral jsonb_array_elements(m.matchers) e on true
    where coalesce((e->>'enabled')::boolean, true)
      and ((e->>'kind' = 'contains'    and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(e->>'pattern')) || '%')
        or (e->>'kind' = 'exact'       and b.normalized_phrase = lower(e->>'pattern'))
        or (e->>'kind' = 'starts_with' and b.normalized_phrase like seo.gsc_perf_like_escape(lower(e->>'pattern')) || '%')
        or (e->>'kind' = 'ends_with'   and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(e->>'pattern')))
        or (e->>'kind' = 'word'        and b.normalized_phrase ~ ('\m' || lower(e->>'pattern') || '\M')))
    union
    -- a fact the keyword already carries: the pack only says what it is WORTH
    select b.kid, m.item_id, m.dimension_slug, m.sort
    from base b
    join pstate m on m.value_id is not null
      and jsonb_array_length(coalesce(m.matchers, '[]'::jsonb)) = 0
    where exists (select 1 from seo.keyword_facet kf
                   where kf.keyword_id = b.kid and kf.category_id = m.value_id
                     and kf.deleted_at is null)
  ),
  hits as (
    -- one value per dimension, exactly as the engine will collapse it
    select distinct on (h.kid, h.dimension_slug) h.kid, h.item_id
    from raw_hits h
    order by h.kid, h.dimension_slug, h.sort, h.item_id
  ),
  newworth as (
    select h.kid,
           coalesce(sum(m.worth_amount) filter (where m.worth_effect = 'add' and not m.already_adopted), 0) as adds,
           coalesce(exp(sum(ln(greatest(m.worth_amount, 0.0001)))
                     filter (where m.worth_effect = 'scale' and not m.already_adopted)), 1) as factor,
           bool_or(m.worth_effect = 'never' and not m.already_adopted) as any_never
    from hits h join pstate m on m.item_id = h.item_id
    group by h.kid
  ),
  -- ── the pack's topic worth, joined to what the site already rules ──
  ptopics as (
    select i.id as item_id, i.topic_id, i.weight, i.lead_quality, i.offering_match,
           exists (select 1 from seo.site_topic_value stv
                    where stv.site_id = p_site_id and stv.topic_id = i.topic_id
                      and stv.deleted_at is null) as already_valued
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
      and i.topic_id is not null
  ),
  candidates as (
    select stv.topic_id, stv.weight,
           (stv.lead_quality = 'negative_value'
              or stv.offering_match in ('not_offered','actively_avoided')) as negative_guard,
           false as from_pack
    from seo.site_topic_value stv
    where stv.site_id = p_site_id and stv.deleted_at is null
    union all
    select t.topic_id, t.weight,
           (t.lead_quality = 'negative_value'
              or t.offering_match in ('not_offered','actively_avoided')),
           true
    from ptopics t
    where not t.already_valued
      and (p_item_ids is null or t.item_id = any(p_item_ids))
  ),
  lineage as (
    select kt.keyword_id as kw_id, kt.topic_id, 0 as depth
    from seo.keyword_topic kt
    join base b on b.kid = kt.keyword_id
    where kt.is_primary and kt.deleted_at is null
    union all
    select l.kw_id, t.parent_id, l.depth + 1
    from lineage l
    join seo.topic t on t.id = l.topic_id and t.deleted_at is null
    where t.parent_id is not null and l.depth < 12
  ),
  lineage_d as (select distinct kw_id, topic_id, depth from lineage),
  new_base as (
    select distinct on (l.kw_id) l.kw_id, c.weight as base_weight, c.negative_guard, c.from_pack, c.topic_id
    from lineage_d l
    join candidates c on c.topic_id = l.topic_id
    order by l.kw_id, l.depth
  ),
  parts as (
    select b.*,
      nb.base_weight as new_base_weight,
      coalesce(nb.negative_guard, false) as new_negative_guard,
      coalesce(nb.from_pack, false) as base_from_pack,
      (select (r->>'weight')::numeric from jsonb_array_elements(b.reasons) r
        where r->>'kind' = 'topic' limit 1) as old_base_weight,
      coalesce(nw.adds, 0) as new_adds,
      coalesce(nw.factor, 1) as new_factor,
      coalesce(nw.any_never, false) as new_never,
      (nw.kid is not null) as meaning_touched,
      coalesce((select (r->>'total_before_factor')::numeric from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), seo.fn_value_baseline(p_site_id)) as total_before,
      coalesce((select (r->>'factor')::numeric from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), 1) as cur_factor,
      coalesce((select (r->>'has_meaning')::boolean from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), false) as had_meaning,
      coalesce((select (r->>'never')::boolean from jsonb_array_elements(b.reasons) r
                 where r->>'kind' = 'summary' limit 1), false) as cur_never
    from base b
    left join new_base nb on nb.kw_id = b.kid
    left join newworth nw on nw.kid = b.kid
  ),
  touched as (
    select p.* from parts p
    where p.meaning_touched or p.base_from_pack
  ),
  scored as (
    -- baseline + adds -> factors (clamped 0.05-5) -> floor at 0 -> never wins
    select t.*,
      case
        when t.source = 'override' then null
        when t.cur_never or t.new_negative_guard or t.new_never then 0
        else greatest(0, round(
               (t.total_before
                  - coalesce(t.old_base_weight, 0)
                  + coalesce(t.new_base_weight, coalesce(t.old_base_weight, 0))
                  + t.new_adds)
               * least(5, greatest(0.05, t.cur_factor * t.new_factor)), 1))
      end as next_raw,
      (t.meaning_touched and t.new_adds = 0 and t.new_factor = 1 and not t.new_never
         and t.new_base_weight is null and t.source <> 'override') as stamped_only
    from touched t
  ),
  banded as (
    select s.*,
      case
        when s.next_raw is null then s.band
        when round(s.next_raw, 1) = 0 then 'negative'
        else coalesce(
          (select b.value from bands b where b.min_score <= round(s.next_raw, 1)
            order by b.min_score desc limit 1),
          (select b.value from bands b order by b.min_score asc limit 1),
          s.band)
      end as next_band
    from scored s
  ),
  rows_json as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'kw_id', kid, 'keyword', normalized_phrase, 'clicks', c, 'impressions', i,
      'band', band, 'source', source, 'score', score, 'matched', true,
      'stamped_only', stamped_only, 'next_raw', next_raw)), '[]'::jsonb) as j
    from banded
  ),
  per_meaning as (
    select m.item_id, m.already_adopted,
           count(h.kid)::bigint as keywords,
           coalesce(sum(b.c), 0)::bigint as clicks,
           coalesce(sum(b.i), 0)::bigint as impressions,
           count(h.kid) filter (where bd.next_band is distinct from b.band)::bigint as moved,
           coalesce((
             select jsonb_agg(q.s) from (
               select jsonb_build_object(
                 'keyword_id', b2.kid, 'keyword', b2.normalized_phrase,
                 'clicks', b2.c, 'impressions', b2.i,
                 'from_band', b2.band, 'to_band', coalesce(bd2.next_band, b2.band)) as s
               from hits h2
               join base b2 on b2.kid = h2.kid
               left join banded bd2 on bd2.kid = h2.kid
               where h2.item_id = m.item_id
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from pstate m
    left join hits h on h.item_id = m.item_id
    left join base b on b.kid = h.kid
    left join banded bd on bd.kid = h.kid
    group by m.item_id, m.already_adopted
  ),
  per_topic as (
    select t.item_id, t.topic_id, t.already_valued,
           count(distinct l.kw_id)::bigint as keywords,
           coalesce(sum(b.c), 0)::bigint as clicks,
           coalesce(sum(b.i), 0)::bigint as impressions,
           count(distinct nb.kw_id) filter (where nb.from_pack and nb.topic_id = t.topic_id)::bigint as would_base,
           coalesce((
             select jsonb_agg(q.s) from (
               select jsonb_build_object(
                 'keyword_id', b2.kid, 'keyword', b2.normalized_phrase,
                 'clicks', b2.c, 'impressions', b2.i,
                 'from_band', b2.band, 'to_band', coalesce(bd2.next_band, b2.band)) as s
               from new_base nb2
               join base b2 on b2.kid = nb2.kw_id
               left join banded bd2 on bd2.kid = nb2.kw_id
               where nb2.topic_id = t.topic_id and nb2.from_pack
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from ptopics t
    left join lineage_d l on l.topic_id = t.topic_id
    left join base b on b.kid = l.kw_id
    left join new_base nb on nb.kw_id = l.kw_id
    group by t.item_id, t.topic_id, t.already_valued
  )
  select jsonb_build_object(
    'window_keywords', (select count(*) from vol),
    'summary', seo.gsc_value_preview_summarize(
        p_site_id, (select count(*) from vol), (select j from rows_json), 10),
    'unvalued_before', (select count(*) from base where band = 'unvalued'),
    'unvalued_after',
      (select count(*) from base where band = 'unvalued')
      - (select count(*) from banded where band = 'unvalued' and next_band <> 'unvalued'),
    'band_counts_before', coalesce((
      select jsonb_object_agg(x.band, x.n)
      from (select band, count(*) as n from base group by band) x), '{}'::jsonb),
    'band_counts_after', coalesce((
      select jsonb_object_agg(x.nb, x.n)
      from (select coalesce(bd.next_band, b.band) as nb, count(*) as n
            from base b left join banded bd on bd.kid = b.kid
            group by 1) x), '{}'::jsonb),
    'meaning', coalesce((select jsonb_agg(to_jsonb(pm)) from per_meaning pm), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(pt)) from per_topic pt), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$function$;

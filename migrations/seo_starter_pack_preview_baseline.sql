-- KI-003 defect fix — the pack-adoption preview was speaking a dead vocabulary.
--
-- `seo.starter_pack_preview` is what the "Industry packs -> Review" screen shows
-- a person before they accept a pack: how many of THEIR keywords move, and to
-- where. Since the 2026-08-23 resolver rebuild it read reason kinds `rule` and
-- `geo` that are no longer emitted (so every existing multiplier and geo band
-- silently became 1), ignored the 100 baseline, and clamped projections to 100.
-- It has been answering the adoption question with wrong numbers ever since.
--
-- Now it reads the resolver's published summary (`total_before_factor`,
-- `factor`, `has_meaning`, `never`) and swaps the pack's parts in — the same
-- shape the rule, geo and combo previews use. Body is the LIVE definition with
-- only the `parts` and `scored` CTEs replaced.

CREATE OR REPLACE FUNCTION seo.starter_pack_preview(p_site_id uuid, p_pack_id uuid, p_start date, p_end date, p_rule_ids uuid[] DEFAULT NULL::uuid[], p_sample integer DEFAULT 3, p_item_ids uuid[] DEFAULT NULL::uuid[])
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
  bands as (
    select sv.value, (sv.config->>'min_score')::numeric as min_score
    from seo.site_vocabulary sv
    where sv.site_id = p_site_id and sv.vocab_kind = 'value_band' and sv.active
      and sv.deleted_at is null and sv.config ? 'min_score'
    union all
    select c.slug, (c.metadata->>'min_score')::numeric
    from platform.categories c
    where c.dimension = 'seo_value_band' and c.deleted_at is null and c.metadata ? 'min_score'
      and not exists (
        select 1 from seo.site_vocabulary sv2
        where sv2.site_id = p_site_id and sv2.vocab_kind = 'value_band' and sv2.active
          and sv2.deleted_at is null and sv2.config ? 'min_score')
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
  -- ── the pack's rules that would be NEW on this site ──
  prules as (
    select r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value,
           r.value_multiplier,
           exists (select 1 from seo.keyword_class_rule x
                    where x.site_id = p_site_id and x.deleted_at is null
                      and x.metadata->>'template_rule_id' = r.id::text) as already_adopted,
           (select c.id from platform.categories c
             where c.dimension = 'seo_facet' and c.parent_id is null
               and c.slug = r.match_facet and c.deleted_at is null) as dim_id
    from seo.keyword_class_rule r
    where r.pack_id = p_pack_id and r.is_template and r.deleted_at is null
      and r.value_multiplier is not null
      and (p_rule_ids is null or r.id = any(p_rule_ids))
  ),
  hits as (
    select b.kid, r.id as rule_id, r.value_multiplier, r.already_adopted
    from base b
    join prules r on (
      (r.pattern is not null and (
           (r.match_kind = 'contains'    and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
        or (r.match_kind = 'exact'       and b.normalized_phrase = lower(r.pattern))
        or (r.match_kind = 'starts_with' and b.normalized_phrase like seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
        or (r.match_kind = 'ends_with'   and b.normalized_phrase like '%' || seo.gsc_perf_like_escape(lower(r.pattern)))
        or (r.match_kind = 'word'        and b.normalized_phrase ~ ('\m' || lower(r.pattern) || '\M'))))
      or (r.match_facet is not null and r.dim_id is not null and exists (
          select 1 from seo.keyword_facet kf
          join platform.categories cv on cv.id = kf.category_id and cv.deleted_at is null
          where kf.keyword_id = b.kid and kf.deleted_at is null
            and cv.parent_id = r.dim_id
            and coalesce(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = r.match_facet_value)))
  ),
  newmult as (
    select kid, exp(sum(ln(value_multiplier))) as mult
    from hits where not already_adopted
    group by kid
  ),
  -- ── the pack's topic worth, joined to what the site already rules ──
  ptopics as (
    select i.id as item_id, i.topic_id, i.weight, i.lead_quality, i.service_match,
           exists (select 1 from seo.site_topic_value stv
                    where stv.site_id = p_site_id and stv.topic_id = i.topic_id
                      and stv.deleted_at is null) as already_valued
    from seo.starter_pack_item i
    where i.pack_id = p_pack_id and i.item_kind = 'topic' and i.deleted_at is null
      and i.topic_id is not null
  ),
  candidates as (
    -- every topic worth that WOULD exist after adoption: the site's own rows,
    -- plus the selected pack topics the site has no row for (on conflict do nothing)
    select stv.topic_id, stv.weight,
           (stv.lead_quality = 'negative_value'
              or stv.service_match in ('not_offered','actively_avoided')) as negative_guard,
           false as from_pack
    from seo.site_topic_value stv
    where stv.site_id = p_site_id and stv.deleted_at is null
    union all
    select t.topic_id, t.weight,
           (t.lead_quality = 'negative_value'
              or t.service_match in ('not_offered','actively_avoided')),
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
    -- KI-048: read the resolver's OWN numbers out of the receipt it publishes
    -- (`summary`), then swap the pack's parts in. The three fields below are the
    -- current model's vocabulary; the reason kinds this CTE used to read
    -- (`rule`, `geo`) stopped being emitted on 2026-08-23, so every projection
    -- since then silently multiplied by 1 and clamped at 100.
    select b.*,
      nb.base_weight as new_base_weight,
      coalesce(nb.negative_guard, false) as new_negative_guard,
      coalesce(nb.from_pack, false) as base_from_pack,
      (select (r->>'weight')::numeric from jsonb_array_elements(b.reasons) r
        where r->>'kind' = 'topic' limit 1) as old_base_weight,
      coalesce(nm.mult, 1) as new_mult,
      (nm.kid is not null) as rule_touched,
      -- everything the keyword already carries, straight from the receipt
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
    left join newmult nm on nm.kid = b.kid
  ),
  touched as (
    -- a keyword the pack would change in any way: a new rule fires on it, or
    -- its base would come from a pack topic
    select p.* from parts p
    where p.rule_touched or p.base_from_pack
  ),
  scored as (
    -- The pack swaps in a topic worth (replacing whatever the keyword's own
    -- lineage gave it) and multiplies by its new rules. Order is the law's:
    -- baseline + adds -> factors (clamped 0.05-5) -> floor at 0 -> never wins.
    select t.*,
      case
        when t.source = 'override' then null
        when t.cur_never or t.new_negative_guard then 0
        else greatest(0, round(
               (t.total_before
                  - coalesce(t.old_base_weight, 0)
                  + coalesce(t.new_base_weight, coalesce(t.old_base_weight, 0)))
               * least(5, greatest(0.05, t.cur_factor * t.new_mult)), 1))
      end as next_raw,
      -- With a baseline, a matched keyword always lands somewhere; "stamped
      -- only" now means the pack labels it without changing what it is worth.
      (t.rule_touched and t.new_mult = 1 and t.new_base_weight is null
         and t.source <> 'override') as stamped_only
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
  per_rule as (
    select r.id as rule_id, r.already_adopted,
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
               where h2.rule_id = r.id
               order by b2.c desc, b2.i desc
               limit v_sample) q), '[]'::jsonb) as samples
    from prules r
    left join hits h on h.rule_id = r.id
    left join base b on b.kid = h.kid
    left join banded bd on bd.kid = h.kid
    group by r.id, r.already_adopted
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
    'rules', coalesce((select jsonb_agg(to_jsonb(pr)) from per_rule pr), '[]'::jsonb),
    'topics', coalesce((select jsonb_agg(to_jsonb(pt)) from per_topic pt), '[]'::jsonb))
  into v_result;

  return v_result;
end;
$function$;

-- Keyword Value System — THE value resolver + the GSC band decomposition read.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md (D31).
--
-- seo.keyword_value_map(site) is the ONE mapping from keyword to per-site value
-- (the value twin of seo.gsc_keyword_class_map — extend HERE only, never fork):
--   1. explicit override  (site_keyword_value.value_tier)         → source 'override'
--   2. computed           base(topic lineage, default 50 when rules/geo fire
--      without a tree) × Π rule multipliers × geo-band multiplier  → source 'computed'
--      negative guards (lead_quality='negative_value', service_match not_offered/
--      actively_avoided, geo multiplier 0) force band 'negative'.
--   3. otherwise 'unvalued' — the honest bucket and the work queue.
-- Bands resolve from seo.site_vocabulary (vocab_kind='value_band'); a site with
-- no rows falls back to the platform template (platform.categories
-- dimension='seo_value_band'). 'negative' and 'unvalued' are RESERVED band
-- slugs the resolver emits directly. Every row carries `reasons` — a tier
-- without its why never renders.
--
-- INVOKER on purpose: only ever called inside SECURITY DEFINER wrappers that
-- already ran seo.gsc_assert_site_access (the 2026-08-07 timeout law —
-- migrations/seo_gsc_rpc_security_definer.sql).

CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid)
RETURNS TABLE (keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
WITH RECURSIVE
bands AS (
  SELECT sv.value, (sv.config->>'min_score')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL AND sv.config ? 'min_score'
  UNION ALL
  SELECT c.slug, (c.metadata->>'min_score')::numeric
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band' AND sv2.active
        AND sv2.deleted_at IS NULL AND sv2.config ? 'min_score')
),
geo_band_mult AS (
  SELECT sv.value, COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL
  UNION ALL
  SELECT c.slug, COALESCE((c.metadata->>'multiplier')::numeric, 1)
  FROM platform.categories c
  WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active AND sv2.deleted_at IS NULL)
),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.name AS topic_name,
    COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value'
      OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv
    ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL
  ORDER BY l.kw_id, l.depth DESC
),
vrules AS (
  SELECT r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value, r.value_multiplier
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL AND r.site_id = p_site_id
),
rule_hits AS (
  SELECT k.id AS kw_id, r.id AS rule_id, r.name, r.value_multiplier
  FROM seo.keyword k
  JOIN vrules r ON (
    (r.pattern IS NOT NULL AND (
         (r.match_kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'exact'       AND k.normalized_phrase = lower(r.pattern))
      OR (r.match_kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)))
      OR (r.match_kind = 'word'        AND k.normalized_phrase ~ ('\m' || lower(r.pattern) || '\M'))
    ))
    OR
    (r.match_facet IS NOT NULL AND r.match_facet_value IS NOT DISTINCT FROM CASE r.match_facet
        WHEN 'intent_class' THEN k.intent_class
        WHEN 'fulfillment_mode' THEN k.fulfillment_mode
        WHEN 'audience_type' THEN k.audience_type
        WHEN 'funnel_stage' THEN k.funnel_stage
        WHEN 'transaction_direction' THEN k.transaction_direction
        WHEN 'local_intent' THEN k.local_intent
        WHEN 'urgency' THEN k.urgency
        WHEN 'comparison_intent' THEN k.comparison_intent
        WHEN 'price_sensitivity' THEN k.price_sensitivity
        WHEN 'query_form' THEN k.query_form
        WHEN 'specificity' THEN k.specificity
        WHEN 'brand_presence' THEN k.brand_presence
        WHEN 'compliance_framing' THEN k.compliance_framing
      END)
  )
  WHERE k.deleted_at IS NULL
),
rule_agg AS (
  SELECT kw_id,
         exp(sum(ln(value_multiplier))) AS mult,
         jsonb_agg(jsonb_build_object('kind','rule','rule_id',rule_id,'name',name,'multiplier',value_multiplier)) AS rule_reasons
  FROM rule_hits GROUP BY kw_id
),
geo_hits AS (
  SELECT DISTINCT ON (k.id) k.id AS kw_id, g.geo_band, g.label AS geo_label,
         COALESCE(gb.mult, 1) AS mult
  FROM seo.keyword k
  JOIN seo.site_geo_area g ON g.site_id = p_site_id AND g.deleted_at IS NULL
  JOIN LATERAL (
    SELECT 1 FROM jsonb_array_elements_text(g.match_tokens) tok(v)
    WHERE k.normalized_phrase ~ ('\m' || lower(tok.v) || '\M')
    LIMIT 1
  ) m ON true
  LEFT JOIN geo_band_mult gb ON gb.value = g.geo_band
  WHERE k.deleted_at IS NULL
  ORDER BY k.id, COALESCE(gb.mult, 1) ASC
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
scored AS (
  SELECT k.id AS kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    (ra.kw_id IS NOT NULL) AS has_rules,
    (gh.kw_id IS NOT NULL) AS has_geo,
    COALESCE(tb.negative_guard, false) AS negative_guard,
    LEAST(100, GREATEST(0,
      COALESCE(tb.base_weight, 50) * COALESCE(ra.mult, 1) * COALESCE(gh.mult, 1))) AS raw_score,
    tb.topic_name, tb.base_weight, ra.rule_reasons,
    gh.geo_band, gh.geo_label, gh.mult AS geo_mult, rk.root_type
  FROM seo.keyword k
  LEFT JOIN topic_base tb ON tb.kw_id = k.id
  LEFT JOIN rule_agg  ra ON ra.kw_id = k.id
  LEFT JOIN geo_hits  gh ON gh.kw_id = k.id
  LEFT JOIN root_kind rk ON rk.kw_id = k.id
  WHERE k.deleted_at IS NULL
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN NULL
       WHEN s.negative_guard OR s.raw_score = 0 THEN 0
       ELSE round(s.raw_score, 1) END,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       WHEN s.negative_guard OR s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.raw_score, 1)
          ORDER BY b.min_score DESC LIMIT 1), 'minimal') END,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       ELSE 'computed' END,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override'))
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN '[]'::jsonb
       ELSE
         CASE WHEN s.has_topic
           THEN jsonb_build_array(jsonb_build_object(
             'kind','topic','topic',s.topic_name,'weight',s.base_weight,
             'root',s.root_type,'negative_guard',s.negative_guard))
           ELSE jsonb_build_array(jsonb_build_object('kind','default_base','weight',50)) END
         || COALESCE(s.rule_reasons, '[]'::jsonb)
         || CASE WHEN s.has_geo
           THEN jsonb_build_array(jsonb_build_object(
             'kind','geo','band',s.geo_band,'area',s.geo_label,'multiplier',s.geo_mult))
           ELSE '[]'::jsonb END
  END
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$$;

-- The headline decomposition by VALUE BAND — the value twin of
-- gsc_perf_class_summary; composes THE ACCURACY CONTRACT (winning-run dedup).
CREATE OR REPLACE FUNCTION seo.gsc_perf_value_summary(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL
) RETURNS TABLE (
  value_band text,
  value_source text,
  clicks bigint,
  impressions bigint,
  queries bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_queries bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.keyword_id AS kid
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
  ),
  valued AS (
    SELECT l.*, COALESCE(vm.value_band, 'unvalued') AS band,
           COALESCE(vm.value_source, 'unvalued') AS src
    FROM latest l
    LEFT JOIN seo.keyword_value_map(p_site_id) vm ON vm.keyword_id = l.kid
  )
  SELECT v.band, v.src,
    COALESCE(SUM(v.c) FILTER (WHERE v.d BETWEEN p_start AND p_end), 0)::bigint,
    COALESCE(SUM(v.i) FILTER (WHERE v.d BETWEEN p_start AND p_end), 0)::bigint,
    COALESCE(COUNT(DISTINCT v.kid) FILTER (WHERE v.d BETWEEN p_start AND p_end), 0)::bigint,
    COALESCE(SUM(v.c) FILTER (WHERE p_compare_start IS NOT NULL AND v.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
    COALESCE(SUM(v.i) FILTER (WHERE p_compare_start IS NOT NULL AND v.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
    COALESCE(COUNT(DISTINCT v.kid) FILTER (WHERE p_compare_start IS NOT NULL AND v.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint
  FROM valued v
  GROUP BY v.band, v.src
  ORDER BY 3 DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_perf_value_summary(uuid, date, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_value_summary(uuid, date, date, date, date) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.keyword_value_map(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.keyword_value_map(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

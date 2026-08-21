-- Keyword Value System — the resolver resolves ONLY what is about to be read.
--
-- WHY (measured on datadestruction.com, 2026-08-21): seo.keyword is a GLOBAL
-- corpus (196k rows) and seo.keyword_value_map matched a site's every pattern
-- rule and geo area against all of it, then its callers threw away everything
-- outside the site's window. With an empty site that cost nothing. The moment a
-- site actually expressed meaning — 22 value rules, 4 geo areas — the map took
-- 23s and the authenticated role's 8s statement timeout killed every read. The
-- workbench showed skeletons forever for exactly the sites using the feature,
-- the worst possible failure shape for a feature whose whole point is that
-- expressing meaning pays off immediately.
--
-- THE FIX, in two halves:
--   1. seo.keyword_value_map gains p_keyword_ids. NULL keeps whole-site
--      behaviour; a set resolves only those keywords. ONE resolver still —
--      this is a filter on the same arithmetic, never a second code path.
--   2. Every reader passes the keyword set it is about to render (its GSC
--      window) and materializes the map once instead of joining the function
--      into a per-row plan.
-- Measured after: review 1.5s, summary 1.3s, band preview 0.9s.
--
-- Also: geo areas and value rules are materialized once rather than re-scanned,
-- and the site's keyword rows are projected once into `site_kw`.

DROP FUNCTION IF EXISTS seo.keyword_value_map(uuid);

CREATE OR REPLACE FUNCTION seo.keyword_value_map(
  p_site_id uuid,
  p_keyword_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
WITH RECURSIVE
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id
    WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id
    FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL
      AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id
    FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL
      AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk
  WHERE sk.kw_id IS NOT NULL
),
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
site_kw AS MATERIALIZED (
  SELECT k.id, k.normalized_phrase, k.intent_class, k.fulfillment_mode, k.audience_type,
         k.funnel_stage, k.transaction_direction, k.local_intent, k.urgency,
         k.comparison_intent, k.price_sensitivity, k.query_form, k.specificity,
         k.brand_presence, k.compliance_framing
  FROM site_keywords sk
  JOIN seo.keyword k ON k.id = sk.kw_id
  WHERE k.deleted_at IS NULL
),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt
  JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
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
vrules AS MATERIALIZED (
  SELECT r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value, r.value_multiplier
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL AND r.site_id = p_site_id
),
rule_hits AS (
  SELECT k.id AS kw_id, r.id AS rule_id, r.name, r.value_multiplier
  FROM site_kw k
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
),
rule_agg AS (
  SELECT kw_id,
         exp(sum(ln(value_multiplier))) AS mult,
         jsonb_agg(jsonb_build_object('kind','rule','rule_id',rule_id,'name',name,'multiplier',value_multiplier)) AS rule_reasons
  FROM rule_hits GROUP BY kw_id
),
geo_areas AS MATERIALIZED (
  SELECT g.geo_band, g.label, g.match_tokens, COALESCE(gb.mult, 1) AS mult
  FROM seo.site_geo_area g
  LEFT JOIN geo_band_mult gb ON gb.value = g.geo_band
  WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
),
geo_hits AS (
  SELECT DISTINCT ON (k.id) k.id AS kw_id, g.geo_band, g.label AS geo_label, g.mult
  FROM site_kw k
  JOIN geo_areas g ON true
  JOIN LATERAL (
    SELECT 1 FROM jsonb_array_elements_text(g.match_tokens) tok(v)
    WHERE k.normalized_phrase ~ ('\m' || lower(tok.v) || '\M')
    LIMIT 1
  ) m ON true
  ORDER BY k.id, g.mult ASC
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
floor_band AS (
  SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1
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
  FROM site_kw k
  LEFT JOIN topic_base tb ON tb.kw_id = k.id
  LEFT JOIN rule_agg  ra ON ra.kw_id = k.id
  LEFT JOIN geo_hits  gh ON gh.kw_id = k.id
  LEFT JOIN root_kind rk ON rk.kw_id = k.id
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
          ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END,
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

REVOKE ALL ON FUNCTION seo.keyword_value_map(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.keyword_value_map(uuid, uuid[]) TO authenticated, service_role;

-- The three readers now pass the keyword set they are about to render and
-- materialize the map once. Their bodies are otherwise unchanged; read them
-- live (`\sf seo.gsc_keyword_value_review`) — the DB is the source of truth.
-- Applied 2026-08-21 via Supabase MCP as:
--   seo_value_readers_pass_window_keywords
--   seo_keyword_value_review_no_temp_table   (a STABLE fn may not CREATE TEMP TABLE)

NOTIFY pgrst, 'reload schema';

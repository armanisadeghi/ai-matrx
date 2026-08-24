-- KI-048 — THE 100-BASELINE SCALE (LAW), and KI-042 with it.
--
-- The law: every score starts at 100 (a platform default each site may change);
-- 0 is absolute zero; there are no negative scores — below 100 means worse than
-- neutral. Order, printed on every receipt:
--     start at the baseline -> sum +/-adds (the Offering's worth is one add
--     among equals) -> apply xfactors (clamped 0.05-5) -> floor at 0 ->
--     a never-flag forces 0.
-- A keyword with NO meaning at all reports `unvalued`; it never "scores 100".
--
-- What this fixes: before this migration the additive total WAS the score, so a
-- keyword whose only meaning was a factor or a negative add had nothing to
-- multiply and was reported `unvalued` — a lie about expressed meaning (KI-042),
-- and the reason only 388 of ~19,800 keywords on the sample site scored at all.
--
-- ONE definition of the baseline ladder (P30): site override -> platform knob ->
-- 100. Every consumer calls seo.fn_value_baseline(site); nothing re-implements it.
--
-- The resolver body below is the LIVE definition with ONLY the `scored` CTE and
-- the final SELECT replaced (the carry-forward lesson in this family: read the
-- live pg_get_functiondef and patch it — a rewrite from a stale file once
-- deleted 19 brand stamps).

INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description, set_by, basis, review_due)
VALUES ('seo.keyword_value', 'baseline_score', '100'::jsonb, '100'::jsonb, 'number', 'points', 0, 100000,
        'Keyword score baseline',
        'Every keyword score starts here before adds and factors. A site may override it in its own settings; this is the platform default (KI-048).',
        'agent', 'The 100-baseline law: a round, legible neutral point so "below 100" reads as worse than neutral and "above" as better.',
        (now() + interval '90 days')::date)
ON CONFLICT (feature, key) DO NOTHING;

CREATE OR REPLACE FUNCTION seo.fn_value_baseline(p_site_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT NULLIF(s.settings->'keyword_value'->>'baseline','')::numeric
       FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL),
    (SELECT NULLIF(k.value #>> '{}','')::numeric
       FROM platform.feature_knob k
      WHERE k.feature = 'seo.keyword_value' AND k.key = 'baseline_score'),
    100);
$fn$;

REVOKE ALL ON FUNCTION seo.fn_value_baseline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_value_baseline(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH RECURSIVE
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk WHERE sk.kw_id IS NOT NULL
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
floor_band AS (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.id AS topic_id, tp.name AS topic_name, COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value' OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL ORDER BY l.kw_id, l.depth DESC
),
worth AS MATERIALIZED (
  SELECT w.value_id, w.effect, w.amount, w.notes
  FROM seo.site_value_worth w WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
),
effective_stamps AS MATERIALIZED (
  SELECT es.* FROM seo.fn_effective_stamps(
    p_site_id, (SELECT array_agg(sk.kw_id) FROM site_keywords sk)) es
),
combos AS MATERIALIZED (
  SELECT c.id, c.value_ids, c.effect, c.amount, c.label, c.notes,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'value_id', cv.id, 'dimension', cd.slug, 'dimension_label', cd.name,
                    'value', COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
                    'value_label', cv.name)
                  ORDER BY cd.slug, cv.slug)
           FROM platform.categories cv
           JOIN platform.categories cd ON cd.id = cv.parent_id
           WHERE cv.id = ANY (c.value_ids)), '[]'::jsonb) AS values_json
  FROM seo.site_value_combo c
  WHERE c.site_id = p_site_id AND c.deleted_at IS NULL AND c.enabled
),
combo_hits AS (
  SELECT es.kw_id, cb.id AS combo_id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json
  FROM combos cb
  JOIN effective_stamps es ON es.value_id = ANY (cb.value_ids)
  GROUP BY es.kw_id, cb.id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json, cb.value_ids
  HAVING count(DISTINCT es.value_id) = cardinality(cb.value_ids)
),
contrib AS (
  SELECT es.kw_id, w.effect, w.amount, 0 AS kind_rank,
         es.dim_slug AS sort_a, es.value_key AS sort_b,
         jsonb_build_object(
           'kind','stamp','dimension',es.dim_slug,'dimension_label',es.dim_label,
           'value',es.value_key,'value_label',es.value_label,'value_id',es.value_id,
           'effect',w.effect,'amount',w.amount,'source',es.source,'matcher_id',es.matcher_id,
           'nature',es.nature,'as_of',es.as_of,'notes',w.notes) AS reason
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
  UNION ALL
  SELECT ch.kw_id, ch.effect, ch.amount, 1 AS kind_rank,
         COALESCE(ch.label,'') AS sort_a, ch.combo_id::text AS sort_b,
         jsonb_build_object(
           'kind','combo','combo_id',ch.combo_id,'label',ch.label,'values',ch.values_json,
           'effect',ch.effect,'amount',ch.amount,'notes',ch.notes) AS reason
  FROM combo_hits ch
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(c.reason ORDER BY
           CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END,
           c.kind_rank, c.sort_a, c.sort_b) AS stamp_reasons
  FROM contrib c GROUP BY c.kw_id
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
baseline AS (SELECT seo.fn_value_baseline(p_site_id) AS v),
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    -- KI-048: meaning exists when the Offering carries worth, or ANY stamp/combo
    -- contributed. Only a keyword with NO meaning at all is unvalued; a keyword
    -- whose only meaning is a factor or a negative is VALUED (KI-042).
    (tb.kw_id IS NOT NULL OR pk.kw_id IS NOT NULL) AS has_meaning,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    (SELECT v FROM baseline) AS baseline,
    COALESCE(tb.base_weight, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(5, GREATEST(0.05, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.topic_id, tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN topic_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN root_kind rk ON rk.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
),
final AS (
  SELECT s.*, GREATEST(0, round((s.baseline + s.adds_total) * s.factor_total, 1)) AS raw_score
  FROM scored s
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.is_never THEN 0
       WHEN NOT s.has_meaning THEN NULL
       ELSE s.raw_score END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.is_never THEN 'negative'
       WHEN NOT s.has_meaning THEN 'unvalued'
       WHEN s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= s.raw_score ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT s.has_meaning AND NOT s.is_never THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override','level',o.value_tier))
       ELSE
         jsonb_build_array(jsonb_build_object(
           'kind','summary',
           'baseline', s.baseline,
           'adds', round(s.adds_total, 1),
           'total_before_factor', round(s.baseline + s.adds_total, 1),
           'factor', round(s.factor_total, 4),
           'n_factors', s.n_factors,
           'never', s.is_never,
           'has_meaning', s.has_meaning,
           'score', CASE WHEN s.is_never THEN 0 WHEN NOT s.has_meaning THEN NULL ELSE s.raw_score END))
         || CASE WHEN s.has_meaning
              THEN jsonb_build_array(jsonb_build_object('kind','baseline','amount',s.baseline))
              ELSE '[]'::jsonb END
         || CASE WHEN s.has_topic THEN jsonb_build_array(jsonb_build_object(
              'kind','topic','topic',s.topic_name,'topic_id',s.topic_id,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM final s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

-- seo_value_level_movers_and_topic_receipt.sql
--
-- C6 completion — "Insights → by LEVEL", and the receipt that can be acted on.
--
-- 1. seo.keyword_value_map: the `topic` reason now carries `topic_id`.
--    A receipt step that names a topic but cannot open it is a dead end
--    (no-dead-ends): the Why-this-score panel links every step to the screen
--    where that step can be CHANGED, and the topic tree addresses nodes by id.
--    Purely additive to the `reasons` jsonb — no reader breaks.
--
-- 2. seo.gsc_perf_class_movers: gains `p_filters jsonb` (today: `{"levels":
--    ["platinum", ...]}`) and a `value_band` output column, so the Traffic
--    quality view can decompose by value LEVEL beside traffic CLASS and then
--    filter the movers to one level — the "site flat while Platinum fell"
--    headline. Levels resolve through seo.keyword_value_map, the ONE resolver;
--    a band is never re-derived. Signature changes, so DROP + CREATE.
--
-- Idempotent. Applied 2026-08-23.

-- ── 1. topic_id on the topic receipt ────────────────────────────────────────

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
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    COALESCE(tb.base_weight, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(10, GREATEST(0.01, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.topic_id, tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN topic_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN root_kind rk ON rk.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.is_never THEN 0
       WHEN s.adds_total <= 0 THEN NULL
       ELSE round(s.adds_total * s.factor_total, 1) END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.is_never THEN 'negative'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.adds_total * s.factor_total, 1) ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN s.is_never THEN 'computed'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override','level',o.value_tier))
       ELSE
         jsonb_build_array(jsonb_build_object('kind','summary','adds',round(s.adds_total,1),'factor',round(s.factor_total,4),
                                              'n_factors',s.n_factors,'never',s.is_never,
                                              'score', CASE WHEN s.is_never THEN 0 WHEN s.adds_total <= 0 THEN NULL ELSE round(s.adds_total * s.factor_total,1) END))
         || CASE WHEN s.has_topic THEN jsonb_build_array(jsonb_build_object(
              'kind','topic','topic',s.topic_name,'topic_id',s.topic_id,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || CASE WHEN NOT s.has_topic AND s.adds_total <= 0 AND NOT s.is_never AND jsonb_array_length(s.stamp_reasons) > 0
              THEN jsonb_build_array(jsonb_build_object('kind','no_base','pending_base',true)) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

-- ── 2. movers filtered and decomposed by value LEVEL ────────────────────────

DROP FUNCTION IF EXISTS seo.gsc_perf_class_movers(uuid, text, date, date, date, date, text, text, integer, integer);

CREATE FUNCTION seo.gsc_perf_class_movers(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date,
  p_compare_end date,
  p_class text DEFAULT NULL::text,
  p_direction text DEFAULT 'loss'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_filters jsonb DEFAULT '{}'::jsonb
)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, traffic_class text, value_band text,
               clicks bigint, impressions bigint, cmp_clicks bigint, cmp_impressions bigint,
               delta_clicks bigint, delta_impressions bigint, class_mix jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_profile text;
  v_levels text[];
  v_ids uuid[];
  v_lo date := LEAST(p_compare_start, p_start);
  v_hi date := GREATEST(p_compare_end, p_end);
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
  END IF;
  IF p_direction NOT IN ('gain', 'loss') THEN
    RAISE EXCEPTION 'gsc_direction_unknown: %', p_direction;
  END IF;
  IF p_class IS NOT NULL AND p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  -- `{"levels": ["platinum", "gold"]}` — a site's own band vocabulary plus the
  -- two reserved slugs. Vocabulary is per site, so this is deliberately not a
  -- fixed enum check; an unknown level simply matches nothing.
  IF jsonb_typeof(COALESCE(p_filters, '{}'::jsonb) -> 'levels') = 'array' THEN
    SELECT array_agg(value) INTO v_levels
    FROM jsonb_array_elements_text(p_filters -> 'levels') AS t(value)
    WHERE value IS NOT NULL AND btrim(value) <> '';
  END IF;

  v_profile := CASE p_dimension WHEN 'query' THEN 'query' ELSE 'query_page' END;

  SELECT array_agg(DISTINCT spd.keyword_id) INTO v_ids
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
    AND spd.dimension_profile = v_profile AND spd.keyword_id IS NOT NULL
    AND spd.date BETWEEN v_lo AND v_hi;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN v_lo AND v_hi
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.page_id AS pid,
           CASE p_dimension
             WHEN 'query' THEN spd.query
             ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
           END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
  ),
  resolved AS MATERIALIZED (
    SELECT * FROM seo.keyword_value_map(p_site_id, v_ids)
  ),
  classed AS (
    SELECT l.*,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(vm.value_band, 'unvalued') AS bnd
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
    LEFT JOIN resolved vm ON vm.keyword_id = l.kid
    WHERE l.k IS NOT NULL
      AND (p_class IS NULL OR COALESCE(cm.traffic_class, 'unclassified') = p_class)
      AND (v_levels IS NULL OR COALESCE(vm.value_band, 'unvalued') = ANY (v_levels))
  ),
  bucketed AS (
    SELECT c.k, c.cls, c.bnd,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           (array_agg(c.kid ORDER BY c.kid) FILTER (WHERE c.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i
    FROM classed c
    GROUP BY c.k, c.cls, c.bnd
  ),
  by_class AS (
    SELECT b.k, b.cls,
           SUM(b.cur_c)::bigint AS cur_c,
           SUM(b.cmp_c)::bigint AS cmp_c
    FROM bucketed b
    GROUP BY b.k, b.cls
  ),
  dom_band AS (
    -- The row's LEVEL is the one carrying most of its current clicks (compare
    -- clicks break ties) — the same rule the dominant class already uses, so
    -- Class and Level on one row are read the same way.
    SELECT DISTINCT ON (b.k) b.k, b.bnd
    FROM (
      SELECT b2.k, b2.bnd, SUM(b2.cur_c) AS cur_c, SUM(b2.cmp_c) AS cmp_c
      FROM bucketed b2 GROUP BY b2.k, b2.bnd
    ) b
    ORDER BY b.k, b.cur_c DESC, b.cmp_c DESC, b.bnd ASC
  ),
  rolled AS (
    SELECT b.k,
           (array_agg(b.pid ORDER BY b.pid) FILTER (WHERE b.pid IS NOT NULL))[1] AS pid,
           (array_agg(b.kid ORDER BY b.kid) FILTER (WHERE b.kid IS NOT NULL))[1] AS kid,
           (array_agg(b.cls ORDER BY b.cur_c DESC, b.cmp_c DESC, b.cls ASC))[1] AS dom_cls,
           SUM(b.cur_c)::bigint AS cur_c,
           SUM(b.cur_i)::bigint AS cur_i,
           SUM(b.cmp_c)::bigint AS cmp_c,
           SUM(b.cmp_i)::bigint AS cmp_i
    FROM bucketed b
    GROUP BY b.k
  ),
  mixed AS (
    SELECT bc.k,
           jsonb_object_agg(bc.cls, jsonb_build_object('clicks', bc.cur_c, 'cmp_clicks', bc.cmp_c))
             FILTER (WHERE bc.cur_c > 0 OR bc.cmp_c > 0) AS mix
    FROM by_class bc
    GROUP BY bc.k
  ),
  moved AS (
    SELECT r.*, db.bnd AS dom_bnd, m.mix, (r.cur_c - r.cmp_c) AS d_c, (r.cur_i - r.cmp_i) AS d_i
    FROM rolled r
    LEFT JOIN dom_band db ON db.k = r.k
    LEFT JOIN mixed m ON m.k = r.k
    WHERE r.cur_c > 0 OR r.cmp_c > 0 OR r.cur_i > 0 OR r.cmp_i > 0
  )
  SELECT m.k,
         m.pid,
         m.kid,
         m.dom_cls,
         COALESCE(m.dom_bnd, 'unvalued'),
         m.cur_c,
         m.cur_i,
         m.cmp_c,
         m.cmp_i,
         m.d_c::bigint,
         m.d_i::bigint,
         COALESCE(m.mix, '{}'::jsonb),
         COUNT(*) OVER ()::bigint
  FROM moved m
  WHERE CASE WHEN p_direction = 'gain'
             THEN m.d_c > 0 OR (m.d_c = 0 AND m.d_i > 0)
             ELSE m.d_c < 0 OR (m.d_c = 0 AND m.d_i < 0) END
  ORDER BY
    (CASE WHEN p_direction = 'gain' THEN m.d_c END) DESC NULLS LAST,
    (CASE WHEN p_direction = 'loss' THEN m.d_c END) ASC NULLS LAST,
    ABS(m.d_i) DESC,
    m.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_perf_class_movers(uuid, text, date, date, date, date, text, text, integer, integer, jsonb)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_class_movers(uuid, text, date, date, date, date, text, text, integer, integer, jsonb)
  TO authenticated;

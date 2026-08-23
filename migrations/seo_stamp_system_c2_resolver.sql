-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C2 (2026-08-23)
-- THE RESOLVER, rebuilt on stamps + worth (P17–P19), additive open scale (P18).
--
--   score  = Σ adds  →  × Π factors (capped)  →  never ⇒ 0
--   adds   = topic worth (the hierarchical exception, inherited down the tree)
--            + every `add` worth on a stamped value
--   factor = Π every `scale` worth on a stamped value, clamped to [0.01, 10]
--   never  = topic negative guard, or any `never` worth on a stamped value
--   no adds at all  ⇒ UNVALUED (stamps are listed; a factor with nothing to
--                    scale invents nothing — no phantom base, ever)
--   override (site_keyword_value.value_tier) ⇒ that level, score NULL
--
-- Stamps considered: universal (site_id NULL) + this site's (site_id = site);
-- for single-cardinality dimensions ONE stamp counts per dimension — human
-- first, then site-scoped over universal, then matcher/pack/rule, then the AI.
-- Every step is printed in `reasons`, in evaluation order, with a leading
-- summary row. Output columns unchanged so every reader keeps working.
-- Previews follow the same arithmetic. Bands are LEVELS (thresholds) — the
-- words are the site's; the score names nothing (P18).
-- ============================================================================

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
-- ── topic: the hierarchical exception ───────────────────────────────────────
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
    l.kw_id, tp.name AS topic_name, COALESCE(stv.weight, 50) AS base_weight,
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
-- ── stamps + worth: the ONE system ──────────────────────────────────────────
worth AS MATERIALIZED (
  SELECT w.value_id, w.effect, w.amount, w.notes
  FROM seo.site_value_worth w WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
),
stamps AS MATERIALIZED (
  SELECT kf.keyword_id AS kw_id, kf.category_id AS value_id, cv.parent_id AS dim_id,
         cd.slug AS dim_slug, cd.name AS dim_label,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key, cv.name AS value_label,
         kf.source, kf.matcher_id, kf.site_id, kf.pinned,
         COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card,
         -- pinned = human-grade (set or confirmed by a person) > human > site matcher/pack/rule/import > universal AI
         CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'matcher' THEN 3 WHEN 'pack' THEN 3 WHEN 'rule' THEN 3 WHEN 'import' THEN 3 WHEN 'classifier' THEN 5 ELSE 6 END END
           + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
  FROM seo.keyword_facet kf
  JOIN site_keywords sk ON sk.kw_id = kf.keyword_id
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
),
effective_stamps AS (
  -- single-cardinality dimensions: one stamp counts (human > pinned/site > matcher > AI)
  SELECT s.* FROM (
    SELECT s.*, row_number() OVER (PARTITION BY s.kw_id, s.dim_id ORDER BY s.prio, s.value_id) AS rn
    FROM stamps s
  ) s WHERE (NOT s.single_card) OR s.rn = 1
),
contrib AS (
  SELECT es.kw_id, es.value_id, es.dim_slug, es.dim_label, es.value_key, es.value_label,
         es.source, es.matcher_id, w.effect, w.amount, w.notes
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(jsonb_build_object(
           'kind','stamp','dimension',c.dim_slug,'dimension_label',c.dim_label,
           'value',c.value_key,'value_label',c.value_label,'value_id',c.value_id,
           'effect',c.effect,'amount',c.amount,'source',c.source,'matcher_id',c.matcher_id,'notes',c.notes)
           ORDER BY CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END, c.dim_slug, c.value_key) AS stamp_reasons
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
    tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
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
              'kind','topic','topic',s.topic_name,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || CASE WHEN NOT s.has_topic AND s.adds_total <= 0 AND NOT s.is_never AND jsonb_array_length(s.stamp_reasons) > 0
              THEN jsonb_build_array(jsonb_build_object('kind','no_base','pending_base',true)) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

-- ── Previews on the same arithmetic ────────────────────────────────────────
-- A "rule" preview = a hypothetical SCALE worth on a hypothetical text or fact
-- matcher. Editing (p_rule_id) excludes the value the old rule migrated into.
CREATE OR REPLACE FUNCTION seo.gsc_value_rule_preview(p_site_id uuid, p_start date, p_end date, p_multiplier numeric, p_pattern text DEFAULT NULL::text, p_match_kind text DEFAULT NULL::text, p_match_facet text DEFAULT NULL::text, p_match_facet_value text DEFAULT NULL::text, p_rule_id uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb; v_window bigint; v_dim uuid; v_excl uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_multiplier IS NULL OR p_multiplier < 0.05 OR p_multiplier > 5 THEN
    RAISE EXCEPTION 'seo_rule_bad_multiplier: a scale factor is between 0.05 and 5. It multiplies whatever the keyword already earned — it never invents value. For "never" use a never-flag instead.';
  END IF;
  IF p_pattern IS NULL AND p_match_facet IS NULL THEN
    RAISE EXCEPTION 'seo_rule_no_matcher: a rule needs something to match — either a phrase or a fact.';
  END IF;
  IF p_pattern IS NOT NULL THEN
    PERFORM seo.assert_safe_match_token(p_pattern, 'rule pattern');
    IF p_match_kind IS NULL OR p_match_kind NOT IN ('contains','exact','starts_with','ends_with','word') THEN
      RAISE EXCEPTION 'seo_rule_bad_match_kind: choose how the phrase should match (contains, whole word, exact, starts with, ends with).';
    END IF;
  END IF;
  IF p_match_facet IS NOT NULL THEN
    SELECT c.id INTO v_dim FROM platform.categories c
     WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.slug = p_match_facet AND c.deleted_at IS NULL;
    IF v_dim IS NULL THEN RAISE EXCEPTION 'seo_rule_unknown_facet: there is no dimension named "%".', p_match_facet; END IF;
    IF p_match_facet_value IS NULL OR NOT EXISTS (
         SELECT 1 FROM platform.categories v WHERE v.parent_id = v_dim AND v.deleted_at IS NULL AND v.slug = p_match_facet || ':' || p_match_facet_value) THEN
      RAISE EXCEPTION 'seo_rule_unknown_facet_value: "%" is not a value of "%". Allowed: %',
        COALESCE(p_match_facet_value, '(none)'), p_match_facet, array_to_string(seo.facet_check_values(p_match_facet), ', ');
    END IF;
  END IF;
  IF p_rule_id IS NOT NULL THEN
    SELECT c.id INTO v_excl FROM platform.categories c WHERE c.dimension='seo_facet' AND c.deleted_at IS NULL AND c.metadata->>'rule_id' = p_rule_id::text LIMIT 1;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band,'unvalued') AS band, COALESCE(m.value_source,'unvalued') AS source, m.value_score AS score,
           COALESCE(m.reasons,'[]'::jsonb) AS reasons
    FROM vol v JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  scoped AS (
    SELECT b.*,
      (CASE WHEN p_pattern IS NOT NULL THEN
             (p_match_kind = 'contains'    AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'exact'       AND b.normalized_phrase = lower(p_pattern))
          OR (p_match_kind = 'starts_with' AND b.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'ends_with'   AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)))
          OR (p_match_kind = 'word'        AND b.normalized_phrase ~ ('\m' || lower(p_pattern) || '\M'))
        ELSE EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='stamp' AND r->>'dimension' = p_match_facet AND r->>'value' = p_match_facet_value)
             OR EXISTS (SELECT 1 FROM seo.keyword_facet kf JOIN platform.categories cv ON cv.id = kf.category_id
                        WHERE kf.keyword_id = b.kid AND kf.deleted_at IS NULL AND cv.parent_id = v_dim
                          AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
                          AND COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = p_match_facet_value)
      END) AS matched,
      (v_excl IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='stamp' AND (r->>'value_id')::uuid = v_excl)) AS fired_before
    FROM base b
  ),
  parts AS (
    SELECT s.*,
      COALESCE((SELECT (r->>'adds')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 0) AS adds,
      COALESCE((SELECT (r->>'factor')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='stamp' AND r->>'effect'='scale' AND v_excl IS NOT NULL AND (r->>'value_id')::uuid = v_excl LIMIT 1), 1) AS factor_other,
      COALESCE((SELECT (r->>'never')::boolean FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), false) AS is_never
    FROM scoped s WHERE s.matched OR s.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c, 'impressions', p.i,
           'band', p.band, 'source', p.source, 'score', p.score, 'matched', p.matched,
           'stamped_only', (p.matched AND p.adds <= 0 AND p.source <> 'override' AND NOT p.is_never),
           'next_raw', CASE
             WHEN p.source = 'override' OR p.is_never THEN NULL
             WHEN p.adds <= 0 THEN NULL
             ELSE round(p.adds * LEAST(10, GREATEST(0.01, p.factor_other * CASE WHEN p.matched THEN p_multiplier ELSE 1 END)), 1)
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

-- A geo-area preview = a hypothetical place/word matcher on a geo value whose
-- worth comes from the band (×0 → never, <1 → scale, 1 → nothing).
CREATE OR REPLACE FUNCTION seo.gsc_geo_area_preview(p_site_id uuid, p_start date, p_end date, p_tokens jsonb, p_geo_band text, p_area_id uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 10, p_place_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_rows jsonb; v_window bigint; v_mult numeric; v_excl uuid; tok text;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF jsonb_typeof(COALESCE(p_tokens, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'seo_geo_bad_tokens: the places this area matches must be a list of words.';
  END IF;
  FOR tok IN SELECT jsonb_array_elements_text(p_tokens) LOOP PERFORM seo.assert_safe_match_token(tok, 'place name'); END LOOP;
  SELECT m.mult INTO v_mult FROM (
    SELECT COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL AND sv.value = p_geo_band
    UNION ALL
    SELECT COALESCE((c.metadata->>'multiplier')::numeric, 1) FROM platform.categories c
    WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL AND c.slug = p_geo_band
      AND NOT EXISTS (SELECT 1 FROM seo.site_vocabulary sv2 WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active AND sv2.deleted_at IS NULL)
  ) m LIMIT 1;
  IF v_mult IS NULL THEN RAISE EXCEPTION 'seo_geo_unknown_band: "%" is not one of this site''s geo bands.', p_geo_band; END IF;
  IF p_area_id IS NOT NULL THEN
    SELECT c.id INTO v_excl FROM platform.categories c WHERE c.dimension='seo_facet' AND c.deleted_at IS NULL AND c.metadata->>'area_id' = p_area_id::text LIMIT 1;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band,'unvalued') AS band, COALESCE(m.value_source,'unvalued') AS source, m.value_score AS score,
           COALESCE(m.reasons,'[]'::jsonb) AS reasons
    FROM vol v JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  scoped AS (
    SELECT b.*,
      (EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_tokens) t(v) WHERE b.normalized_phrase ~ ('\m' || lower(t.v) || '\M'))
       OR EXISTS (SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = b.kid AND kp.deleted_at IS NULL AND kp.place_id = ANY(COALESCE(p_place_ids,'{}'::uuid[])))) AS matched,
      (v_excl IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='stamp' AND (r->>'value_id')::uuid = v_excl)) AS geo_before
    FROM base b
  ),
  parts AS (
    SELECT s.*,
      COALESCE((SELECT (r->>'adds')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 0) AS adds,
      COALESCE((SELECT (r->>'factor')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='stamp' AND r->>'effect'='scale' AND v_excl IS NOT NULL AND (r->>'value_id')::uuid = v_excl LIMIT 1), 1) AS factor_other,
      COALESCE((SELECT (r->>'never')::boolean FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), false)
        AND NOT (v_excl IS NOT NULL AND EXISTS (SELECT 1 FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='stamp' AND r->>'effect'='never' AND (r->>'value_id')::uuid = v_excl)) AS never_other
    FROM scoped s WHERE s.matched OR s.geo_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c, 'impressions', p.i,
           'band', p.band, 'source', p.source, 'score', p.score, 'matched', p.matched,
           'stamped_only', (p.matched AND p.adds <= 0 AND p.source <> 'override' AND NOT p.never_other AND v_mult <> 0),
           'next_raw', CASE
             WHEN p.source = 'override' THEN NULL
             WHEN p.never_other OR (p.matched AND v_mult = 0) THEN 0
             WHEN p.adds <= 0 THEN NULL
             ELSE round(p.adds * LEAST(10, GREATEST(0.01, p.factor_other * CASE WHEN p.matched AND v_mult <> 1 THEN v_mult ELSE 1 END)), 1)
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

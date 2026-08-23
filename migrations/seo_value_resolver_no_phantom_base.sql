-- NO PHANTOM BASE (Arman, 2026-08-22): the resolver invented a default base of 50
-- for any keyword with no topic worth the moment a rule or geo area touched it,
-- then multiplied it by the geo band and dropped the keyword into the lowest
-- band. "The location dimension is trying to be opinionated and change something
-- else, which just doesn't make sense." Exactly — it violated P14: where nothing
-- is expressed, nothing is claimed.
--
-- New semantics:
--   * override                                  -> override (unchanged)
--   * explicit NEVER (negative guard on the topic, or a geo band with
--     multiplier 0 such as "Out of market")      -> negative, score 0 — an
--     explicit "never" stands alone; it needs no base
--   * topic worth exists                        -> base x rules x geo (unchanged)
--   * NO topic worth                            -> UNVALUED — but the rule and
--     geo STAMPS are kept in `reasons` (pending_base=true) so the dimension is
--     visible and filterable without inventing value
-- Rules and geo are RELATIVE; they modify value, they never create it.
-- Previews re-arithmetic from the reason chain and follow the same law.

CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  SELECT k.id, k.normalized_phrase
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
kw_facts AS MATERIALIZED (
  SELECT kf.keyword_id AS kw_id,
         cd.slug AS facet,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS facet_value
  FROM seo.keyword_facet kf
  JOIN site_keywords sk ON sk.kw_id = kf.keyword_id
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL
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
    (r.match_facet IS NOT NULL AND EXISTS (
       SELECT 1 FROM kw_facts kfa
       WHERE kfa.kw_id = k.id
         AND kfa.facet = r.match_facet
         AND kfa.facet_value IS NOT DISTINCT FROM r.match_facet_value))
  )
),
rule_agg AS (
  SELECT kw_id,
         exp(sum(ln(value_multiplier))) AS mult,
         jsonb_agg(jsonb_build_object('kind','rule','rule_id',rule_id,'name',name,'multiplier',value_multiplier)) AS rule_reasons
  FROM rule_hits GROUP BY kw_id
),
geo_areas AS MATERIALIZED (
  SELECT g.geo_band, g.label, g.match_tokens, g.place_ids, COALESCE(gb.mult, 1) AS mult
  FROM seo.site_geo_area g
  LEFT JOIN geo_band_mult gb ON gb.value = g.geo_band
  WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
),
geo_token_hits AS (
  SELECT k.id AS kw_id, g.geo_band, g.label, g.mult
  FROM site_kw k
  JOIN geo_areas g ON jsonb_array_length(g.match_tokens) > 0
  JOIN LATERAL (
    SELECT 1 FROM jsonb_array_elements_text(g.match_tokens) tok(v)
    WHERE k.normalized_phrase ~ ('\m' || lower(tok.v) || '\M')
    LIMIT 1
  ) m ON true
),
geo_place_hits AS (
  SELECT kp.keyword_id AS kw_id, g.geo_band, g.label, g.mult
  FROM seo.keyword_place kp
  JOIN site_keywords sk ON sk.kw_id = kp.keyword_id
  JOIN geo_areas g ON COALESCE(array_length(g.place_ids, 1), 0) > 0
                  AND kp.place_id = ANY(g.place_ids)
  WHERE kp.deleted_at IS NULL
),
geo_hits AS (
  SELECT DISTINCT ON (u.kw_id) u.kw_id, u.geo_band, u.label AS geo_label, u.mult
  FROM (SELECT * FROM geo_token_hits UNION ALL SELECT * FROM geo_place_hits) u
  ORDER BY u.kw_id, u.mult ASC
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
floor_band AS (
  SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1
),
scored AS MATERIALIZED (
  SELECT k.id AS kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    (ra.kw_id IS NOT NULL) AS has_rules,
    (gh.kw_id IS NOT NULL) AS has_geo,
    -- an explicit NEVER: topic guard, or a geo band whose multiplier is 0
    (COALESCE(tb.negative_guard, false) OR COALESCE(gh.mult, 1) = 0) AS hard_negative,
    LEAST(100, GREATEST(0,
      COALESCE(tb.base_weight, 0) * COALESCE(ra.mult, 1) * COALESCE(gh.mult, 1))) AS raw_score,
    tb.topic_name, tb.base_weight, tb.negative_guard, ra.rule_reasons,
    gh.geo_band, gh.geo_label, gh.mult AS geo_mult, rk.root_type,
    -- The dimension stamps, always recorded whether or not they can move value.
    COALESCE(ra.rule_reasons, '[]'::jsonb)
    || CASE WHEN gh.kw_id IS NOT NULL
         THEN jsonb_build_array(jsonb_build_object(
           'kind','geo','band',gh.geo_band,'area',gh.geo_label,'multiplier',gh.mult))
         ELSE '[]'::jsonb END AS stamp_reasons
  FROM site_kw k
  LEFT JOIN topic_base tb ON tb.kw_id = k.id
  LEFT JOIN rule_agg  ra ON ra.kw_id = k.id
  LEFT JOIN geo_hits  gh ON gh.kw_id = k.id
  LEFT JOIN root_kind rk ON rk.kw_id = k.id
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.hard_negative THEN 0
       WHEN NOT s.has_topic THEN NULL
       WHEN s.raw_score = 0 THEN 0
       ELSE round(s.raw_score, 1) END,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.hard_negative THEN 'negative'
       WHEN NOT s.has_topic THEN 'unvalued'
       WHEN s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.raw_score, 1)
          ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN s.hard_negative THEN 'computed'
       WHEN NOT s.has_topic THEN 'unvalued'
       ELSE 'computed' END,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override'))
       WHEN s.has_topic
         THEN jsonb_build_array(jsonb_build_object(
             'kind','topic','topic',s.topic_name,'weight',s.base_weight,
             'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false)))
              || s.stamp_reasons
       WHEN s.hard_negative
         -- a geo "never" with no topic: the stamp IS the reason
         THEN s.stamp_reasons
       ELSE
         -- unvalued but stamped: say so explicitly, keep every stamp
         CASE WHEN jsonb_array_length(s.stamp_reasons) > 0
              THEN jsonb_build_array(jsonb_build_object('kind','no_base','pending_base',true)) || s.stamp_reasons
              ELSE '[]'::jsonb END
  END
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;


-- PREVIEWS follow the same law: re-arithmetic from the reason chain, but a
-- keyword with no topic worth has no base to multiply — it is stamped, its
-- band does not move (unless the proposal is an explicit NEVER: geo band x0).

CREATE OR REPLACE FUNCTION seo.gsc_value_rule_preview(p_site_id uuid, p_start date, p_end date, p_multiplier numeric, p_pattern text DEFAULT NULL::text, p_match_kind text DEFAULT NULL::text, p_match_facet text DEFAULT NULL::text, p_match_facet_value text DEFAULT NULL::text, p_rule_id uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb;
  v_window bigint;
  v_dim uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_multiplier IS NULL OR p_multiplier <= 0 OR p_multiplier > 100 THEN
    RAISE EXCEPTION 'seo_rule_bad_multiplier: a multiplier must be greater than 0 and at most 100. Zero is impossible on purpose — the score is a product, so ×0 would erase every other reason instead of saying "worth far less". Use a small fraction like 0.05 for "almost worthless".';
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
     WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
       AND c.slug = p_match_facet AND c.deleted_at IS NULL;
    IF v_dim IS NULL THEN
      RAISE EXCEPTION 'seo_rule_unknown_facet: there is no dimension named "%".', p_match_facet;
    END IF;
    IF p_match_facet_value IS NULL OR NOT EXISTS (
         SELECT 1 FROM platform.categories v
          WHERE v.parent_id = v_dim AND v.deleted_at IS NULL
            AND v.slug = p_match_facet || ':' || p_match_facet_value) THEN
      RAISE EXCEPTION 'seo_rule_unknown_facet_value: "%" is not a value of "%". Allowed: %',
        COALESCE(p_match_facet_value, '(none)'), p_match_facet,
        array_to_string(seo.facet_check_values(p_match_facet), ', ');
    END IF;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band, 'unvalued') AS band,
           COALESCE(m.value_source, 'unvalued') AS source,
           m.value_score AS score,
           COALESCE(m.reasons, '[]'::jsonb) AS reasons
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  scoped AS (
    SELECT b.*,
      (CASE
        WHEN p_pattern IS NOT NULL THEN
             (p_match_kind = 'contains'    AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'exact'       AND b.normalized_phrase = lower(p_pattern))
          OR (p_match_kind = 'starts_with' AND b.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'ends_with'   AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)))
          OR (p_match_kind = 'word'        AND b.normalized_phrase ~ ('\m' || lower(p_pattern) || '\M'))
        ELSE EXISTS (
          SELECT 1 FROM seo.keyword_facet kf
          JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
          WHERE kf.keyword_id = b.kid AND kf.deleted_at IS NULL
            AND cv.parent_id = v_dim
            AND COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = p_match_facet_value)
      END) AS matched,
      (p_rule_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(b.reasons) r
        WHERE r->>'kind' = 'rule' AND (r->>'rule_id')::uuid = p_rule_id)) AS fired_before
    FROM base b
  ),
  parts AS (
    SELECT s.*,
      -- NO PHANTOM BASE: only a topic worth is a base. NULL = nothing to multiply.
      (SELECT (r->>'weight')::numeric FROM jsonb_array_elements(s.reasons) r
        WHERE r->>'kind' = 'topic' LIMIT 1) AS base_weight,
      COALESCE((SELECT exp(sum(ln((r->>'multiplier')::numeric)))
                  FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'rule'
                   AND (p_rule_id IS NULL OR (r->>'rule_id')::uuid <> p_rule_id)), 1) AS other_rules,
      COALESCE((SELECT (r->>'multiplier')::numeric FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'geo' LIMIT 1), 1) AS geo_mult
    FROM scoped s
    WHERE s.matched OR s.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c,
           'impressions', p.i, 'band', p.band, 'source', p.source, 'score', p.score,
           'matched', p.matched,
           'stamped_only', (p.matched AND p.base_weight IS NULL AND p.source <> 'override' AND p.band <> 'negative'),
           'next_raw', CASE
             WHEN p.source = 'override' OR p.band = 'negative' THEN NULL
             WHEN p.base_weight IS NULL THEN NULL
             ELSE LEAST(100, GREATEST(0,
                    p.base_weight * p.other_rules * p.geo_mult
                    * CASE WHEN p.matched THEN p_multiplier ELSE 1 END))
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_geo_area_preview(p_site_id uuid, p_start date, p_end date, p_tokens jsonb, p_geo_band text, p_area_id uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 10, p_place_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_window bigint;
  v_mult numeric;
  tok text;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF jsonb_typeof(COALESCE(p_tokens, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'seo_geo_bad_tokens: the places this area matches must be a list of words.';
  END IF;
  FOR tok IN SELECT jsonb_array_elements_text(p_tokens) LOOP
    PERFORM seo.assert_safe_match_token(tok, 'place name');
  END LOOP;

  SELECT m.mult INTO v_mult FROM (
    SELECT COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
    FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active
      AND sv.deleted_at IS NULL AND sv.value = p_geo_band
    UNION ALL
    SELECT COALESCE((c.metadata->>'multiplier')::numeric, 1)
    FROM platform.categories c
    WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL AND c.slug = p_geo_band
      AND NOT EXISTS (
        SELECT 1 FROM seo.site_vocabulary sv2
        WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active
          AND sv2.deleted_at IS NULL)
  ) m LIMIT 1;
  IF v_mult IS NULL THEN
    RAISE EXCEPTION 'seo_geo_unknown_band: "%" is not one of this site''s geo bands.', p_geo_band;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band, 'unvalued') AS band,
           COALESCE(m.value_source, 'unvalued') AS source,
           m.value_score AS score,
           COALESCE(m.reasons, '[]'::jsonb) AS reasons
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  band_mult AS (
    SELECT sv.value, COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
    FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL
    UNION ALL
    SELECT c.slug, COALESCE((c.metadata->>'multiplier')::numeric, 1)
    FROM platform.categories c
    WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM seo.site_vocabulary sv2
        WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active
          AND sv2.deleted_at IS NULL)
  ),
  others AS (
    SELECT g.match_tokens, g.place_ids, COALESCE(bm.mult, 1) AS mult
    FROM seo.site_geo_area g
    LEFT JOIN band_mult bm ON bm.value = g.geo_band
    WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
      AND (p_area_id IS NULL OR g.id <> p_area_id)
      AND (jsonb_array_length(g.match_tokens) > 0
           OR COALESCE(array_length(g.place_ids, 1), 0) > 0)
  ),
  scoped AS (
    SELECT b.*,
      (EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_tokens) t(v)
                WHERE b.normalized_phrase ~ ('\m' || lower(t.v) || '\M'))
       OR EXISTS (SELECT 1 FROM seo.keyword_place kp
                   WHERE kp.keyword_id = b.kid AND kp.deleted_at IS NULL
                     AND kp.place_id = ANY(COALESCE(p_place_ids, '{}'::uuid[])))
      ) AS matched,
      (p_area_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind' = 'geo')) AS geo_before
    FROM base b
  ),
  parts AS (
    SELECT s.*,
      (SELECT (r->>'weight')::numeric FROM jsonb_array_elements(s.reasons) r
        WHERE r->>'kind' = 'topic' LIMIT 1) AS base_weight,
      COALESCE((SELECT exp(sum(ln((r->>'multiplier')::numeric)))
                  FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'rule'), 1) AS rules_mult,
      (SELECT min(o.mult) FROM others o
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.match_tokens) t(v)
                       WHERE s.normalized_phrase ~ ('\m' || lower(t.v) || '\M'))
           OR EXISTS (SELECT 1 FROM seo.keyword_place kp
                       WHERE kp.keyword_id = s.kid AND kp.deleted_at IS NULL
                         AND kp.place_id = ANY(o.place_ids))) AS other_mult
    FROM scoped s
    WHERE s.matched OR s.geo_before
  ),
  arith AS (
    SELECT p.*,
      COALESCE(
        LEAST(p.other_mult, CASE WHEN p.matched THEN v_mult END),
        CASE WHEN p.matched THEN v_mult END,
        p.other_mult, 1) AS eff_geo_mult
    FROM parts p
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', a.kid, 'keyword', a.normalized_phrase, 'clicks', a.c,
           'impressions', a.i, 'band', a.band, 'source', a.source, 'score', a.score,
           'matched', a.matched,
           'stamped_only', (a.matched AND a.base_weight IS NULL AND a.source <> 'override' AND a.eff_geo_mult <> 0),
           'next_raw', CASE
             WHEN a.source = 'override' THEN NULL
             -- an explicit NEVER stands alone: geo x0 -> negative even without a base
             WHEN a.eff_geo_mult = 0 THEN 0
             -- NO PHANTOM BASE: no topic worth -> the stamp lands, the band stays
             WHEN a.base_weight IS NULL THEN NULL
             ELSE LEAST(100, GREATEST(0, a.base_weight * a.rules_mult * a.eff_geo_mult))
           END))
    INTO v_window, v_rows
  FROM arith a;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

-- The summariser reports how many matched keywords were only STAMPED (no
-- topic worth yet) so the UI can say it instead of implying a band change.
CREATE OR REPLACE FUNCTION seo.gsc_value_preview_summarize(p_site_id uuid, p_window_keywords bigint, p_rows jsonb, p_sample integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
WITH bands AS (
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
r AS (
  SELECT (e->>'kw_id')::uuid AS kw_id, e->>'keyword' AS keyword,
         (e->>'clicks')::bigint AS clicks, (e->>'impressions')::bigint AS impressions,
         e->>'band' AS band, e->>'source' AS source,
         NULLIF(e->>'score','')::numeric AS score,
         COALESCE((e->>'matched')::boolean, false) AS matched,
         COALESCE((e->>'stamped_only')::boolean, false) AS stamped_only,
         NULLIF(e->>'next_raw','')::numeric AS next_raw
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) e
),
joined AS (
  SELECT r.*,
    CASE
      WHEN r.next_raw IS NULL THEN r.band
      WHEN round(r.next_raw, 1) = 0 THEN 'negative'
      ELSE COALESCE(
        (SELECT b.value FROM bands b WHERE b.min_score <= round(r.next_raw, 1)
          ORDER BY b.min_score DESC LIMIT 1),
        (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
        r.band)
    END AS next_band
  FROM r
)
SELECT jsonb_build_object(
  'window_keywords', COALESCE(p_window_keywords, 0),
  'matched_keywords', (SELECT count(*) FROM joined WHERE matched),
  'matched_clicks', (SELECT COALESCE(sum(clicks),0) FROM joined WHERE matched),
  'matched_impressions', (SELECT COALESCE(sum(impressions),0) FROM joined WHERE matched),
  'moved_keywords', (SELECT count(*) FROM joined WHERE next_band IS DISTINCT FROM band),
  'stamped_only_keywords', (SELECT count(*) FROM joined WHERE stamped_only),
  'protected_keywords', (SELECT count(*) FROM joined WHERE matched AND source = 'override'),
  'movements', COALESCE((
    SELECT jsonb_agg(x.m ORDER BY x.n DESC) FROM (
      SELECT count(*) AS n, jsonb_build_object(
        'from_band', band, 'to_band', next_band,
        'keywords', count(*), 'clicks', COALESCE(sum(clicks),0),
        'impressions', COALESCE(sum(impressions),0)) AS m
      FROM joined WHERE next_band IS DISTINCT FROM band
      GROUP BY band, next_band) x), '[]'::jsonb),
  'samples', COALESCE((
    SELECT jsonb_agg(y.s) FROM (
      SELECT jsonb_build_object(
        'keyword_id', kw_id, 'keyword', keyword, 'clicks', clicks,
        'impressions', impressions, 'from_band', band, 'to_band', next_band,
        'from_score', score, 'to_score', round(next_raw, 1),
        'source', source, 'stamped_only', stamped_only) AS s
      FROM joined WHERE matched
      ORDER BY clicks DESC, impressions DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_sample, 10), 50))) y), '[]'::jsonb)
);
$function$;

-- ============================================================================
-- I3 — GEO AREAS MATCH GAZETTEER PLACES, not only hand-typed words.
--
-- `seo.site_geo_area.match_tokens` stays exactly as it was: a site can always
-- name a neighbourhood, a nickname or a radius the gazetteer has never heard
-- of. What changes is that an area can now ALSO reference `seo.geo_place` rows,
-- and a keyword reaches the area through its detected `seo.keyword_place` rows.
-- That is strictly better where it applies, because a place carries what a
-- typed word cannot: its aliases, its state qualifier and its ambiguity rule.
-- "columbus" typed by hand is four cities; place `us-oh-columbus` is one.
--
-- ONE RESOLVER, still. This adds a second SOURCE of geo hits inside
-- `keyword_value_map`, not a second code path: both arms feed the same
-- lowest-multiplier-wins pick and the same `reasons` entry, so every screen
-- that reads the reason chain keeps working untouched.
--
-- THE REGEX WALL is untouched — the token arm interpolates the same validated
-- tokens; the place arm interpolates nothing at all.
-- THE SCOPE RULE is untouched — the place arm is joined to `site_keywords`.
-- ============================================================================

create or replace function seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] default null)
returns table (keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
language sql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
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
-- THE SEAM (D37).  One row per (keyword, dimension, value) from the fact
-- store, replacing the 13 hardcoded CASE arms that used to name each facet
-- COLUMN by hand.  A dimension a site invented this afternoon matches here
-- through exactly the same code as the 13 platform facts.
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
-- Arm 1: the words a human typed. Unchanged.
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
-- Arm 2: the gazetteer places the area names, reached through detection.
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

-- ── The editor previews a place-based area before it is saved ───────────────
create or replace function seo.gsc_geo_area_preview(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_tokens jsonb,
  p_geo_band text,
  p_area_id uuid default null,
  p_sample integer default 10,
  p_place_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'pg_catalog', 'public'
as $$
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
      COALESCE((SELECT (r->>'weight')::numeric FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' IN ('topic','default_base') LIMIT 1), 50) AS base_weight,
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
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c,
           'impressions', p.i, 'band', p.band, 'source', p.source, 'score', p.score,
           'matched', p.matched,
           'next_raw', CASE
             WHEN p.source = 'override' THEN NULL
             ELSE LEAST(100, GREATEST(0,
                    p.base_weight * p.rules_mult
                    * COALESCE(
                        LEAST(p.other_mult, CASE WHEN p.matched THEN v_mult END),
                        CASE WHEN p.matched THEN v_mult END,
                        p.other_mult, 1)))
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$$;

grant execute on function seo.gsc_geo_area_preview(uuid, date, date, jsonb, text, uuid, integer, uuid[]) to authenticated;

-- The 7-argument version is REPLACED, not kept beside its successor: two
-- overloads differing only by a defaulted argument make every 7-argument call
-- ambiguous (PostgREST resolves RPCs by argument NAME, and both would match).
-- No-legacy: the old one goes.
drop function if exists seo.gsc_geo_area_preview(uuid, date, date, jsonb, text, uuid, integer);

-- KI-048 follow-through: the previews obey the same arithmetic as the resolver.
--
-- Every preview here answers "what would this change do" by re-running the
-- resolver's own numbers from the receipt it publishes — it never re-implements
-- the model. The baseline made three things wrong in each of them:
--   * they multiplied the EXPRESSED adds, so the baseline vanished from the
--     projection and a proposed factor looked like it produced nothing;
--   * they treated "no positive adds" as unvalued, which is now false (a factor
--     or a negative is meaning — KI-042);
--   * they clamped factors 0.01-10 where the law says 0.05-5.
-- Fixed by reading `total_before_factor` and `has_meaning` from the summary step.
-- Bodies are the LIVE definitions with only those expressions replaced.

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
      COALESCE((SELECT (r->>'total_before_factor')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 100) AS adds,
      COALESCE((SELECT (r->>'has_meaning')::boolean FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), false) AS had_meaning,
      COALESCE((SELECT (r->>'factor')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='stamp' AND r->>'effect'='scale' AND v_excl IS NOT NULL AND (r->>'value_id')::uuid = v_excl LIMIT 1), 1) AS factor_other,
      COALESCE((SELECT (r->>'never')::boolean FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), false) AS is_never
    FROM scoped s WHERE s.matched OR s.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c, 'impressions', p.i,
           'band', p.band, 'source', p.source, 'score', p.score, 'matched', p.matched,
           'stamped_only', (p.matched AND NOT p.had_meaning AND p_multiplier = 1 AND p.source <> 'override' AND NOT p.is_never),
           'next_raw', CASE
             WHEN p.source = 'override' OR p.is_never THEN NULL
             WHEN NOT (p.had_meaning OR p.matched) THEN NULL
             ELSE GREATEST(0, round(p.adds * LEAST(5, GREATEST(0.05, p.factor_other * CASE WHEN p.matched THEN p_multiplier ELSE 1 END)), 1))
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
      COALESCE((SELECT (r->>'total_before_factor')::numeric FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 100) AS adds,
      COALESCE((SELECT (r->>'has_meaning')::boolean FROM jsonb_array_elements(s.reasons) r WHERE r->>'kind'='summary' LIMIT 1), false) AS had_meaning,
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
           'stamped_only', (p.matched AND NOT p.had_meaning AND v_mult = 1 AND p.source <> 'override' AND NOT p.never_other),
           'next_raw', CASE
             WHEN p.source = 'override' THEN NULL
             WHEN p.never_other OR (p.matched AND v_mult = 0) THEN 0
             WHEN NOT (p.had_meaning OR p.matched) THEN NULL
             ELSE GREATEST(0, round(p.adds * LEAST(5, GREATEST(0.05, p.factor_other * CASE WHEN p.matched AND v_mult <> 1 THEN v_mult ELSE 1 END)), 1))
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_value_combo_preview(p_site_id uuid, p_start date, p_end date, p_value_ids uuid[], p_effect text, p_amount numeric DEFAULT NULL::numeric, p_combo_id uuid DEFAULT NULL::uuid, p_sample integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_rows jsonb; v_window bigint; v_n int;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  PERFORM seo.assert_combo_shape(p_site_id, p_value_ids, p_effect, p_amount);
  SELECT count(DISTINCT v) INTO v_n FROM unnest(p_value_ids) v;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  hits AS (
    SELECT es.kw_id
    FROM seo.fn_effective_stamps(p_site_id, (SELECT a FROM ids)) es
    WHERE es.value_id = ANY (p_value_ids)
    GROUP BY es.kw_id
    HAVING count(DISTINCT es.value_id) = v_n
  ),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band,'unvalued') AS band, COALESCE(m.value_source,'unvalued') AS source,
           m.value_score AS score, COALESCE(m.reasons,'[]'::jsonb) AS reasons,
           (h.kw_id IS NOT NULL) AS matched
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
    LEFT JOIN hits h ON h.kw_id = v.kid
  ),
  parts AS (
    SELECT b.*,
      (p_combo_id IS NOT NULL AND EXISTS (
         SELECT 1 FROM jsonb_array_elements(b.reasons) r
         WHERE r->>'kind' = 'combo' AND r->>'combo_id' = p_combo_id::text)) AS fired_before,
      COALESCE((SELECT (r->>'total_before_factor')::numeric FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 100)
        - COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                     WHERE r->>'kind'='combo' AND r->>'effect'='add'
                       AND p_combo_id IS NOT NULL AND r->>'combo_id' = p_combo_id::text LIMIT 1), 0) AS adds_other,
      COALESCE((SELECT (r->>'factor')::numeric FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind'='summary' LIMIT 1), 1)
        / COALESCE((SELECT (r->>'amount')::numeric FROM jsonb_array_elements(b.reasons) r
                     WHERE r->>'kind'='combo' AND r->>'effect'='scale'
                       AND p_combo_id IS NOT NULL AND r->>'combo_id' = p_combo_id::text LIMIT 1), 1) AS factor_other,
      (EXISTS (SELECT 1 FROM jsonb_array_elements(b.reasons) r
                WHERE (r->>'kind'='topic' AND (r->>'negative_guard')::boolean)
                   OR (r->>'kind'='stamp' AND r->>'effect'='never')
                   OR (r->>'kind'='combo' AND r->>'effect'='never'
                       AND (p_combo_id IS NULL OR r->>'combo_id' <> p_combo_id::text)))) AS never_other
    FROM base b
  ),
  moved AS (
    SELECT p.*,
      (p.adds_other + CASE WHEN p.matched AND p_effect = 'add' THEN p_amount ELSE 0 END) AS next_adds,
      LEAST(5, GREATEST(0.05, p.factor_other * CASE WHEN p.matched AND p_effect = 'scale' THEN p_amount ELSE 1 END)) AS next_factor
    FROM parts p WHERE p.matched OR p.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', m.kid, 'keyword', m.normalized_phrase, 'clicks', m.c, 'impressions', m.i,
           'band', m.band, 'source', m.source, 'score', m.score, 'matched', m.matched,
           'stamped_only', false,
           'next_raw', CASE
             WHEN m.source = 'override' OR m.never_other THEN NULL
             WHEN m.matched AND p_effect = 'never' THEN 0
             ELSE GREATEST(0, round(m.next_adds * m.next_factor, 1))
           END))
    INTO v_window, v_rows
  FROM moved m;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$function$;

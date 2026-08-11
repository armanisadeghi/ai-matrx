-- Brand-alias matching consistency (2026-08-11).
--
-- One normalized alias + one match-strength primitive now drive:
--   * the live brand classifier (`gsc_brand_hits`),
--   * draft-alias previews (`gsc_brand_alias_preview`), and
--   * the classification table's saved-alias inspection filter
--     (`gsc_keyword_class_review.p_brand_alias`).
--
-- The preview returns only CURRENT-WINDOW keywords the site's existing
-- identity does not already cover. Re-entering an existing alias therefore
-- reports zero new matches instead of re-suggesting already-branded queries.

CREATE OR REPLACE FUNCTION seo.gsc_brand_alias_spec(p_alias text)
RETURNS TABLE (raw_name text, joined text, toks text[], probe text)
LANGUAGE sql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
  WITH normalized AS (
    SELECT btrim(lower(COALESCE(p_alias, ''))) AS raw_name
  ), tokenized AS (
    SELECT n.raw_name,
           ARRAY(
             SELECT t
             FROM unnest(
               regexp_split_to_array(
                 regexp_replace(n.raw_name, '[^a-z0-9]+', ' ', 'g'),
                 '\s+'
               )
             ) AS t
             WHERE t <> ''
               AND t NOT IN (
                 'inc','llc','ltd','co','corp','corporation','company',
                 'the','a','website','site','main','page','homepage','official'
               )
           ) AS toks
    FROM normalized n
  )
  SELECT t.raw_name,
         array_to_string(t.toks, ''),
         t.toks,
         (SELECT tok FROM unnest(t.toks) tok ORDER BY length(tok), tok LIMIT 1)
  FROM tokenized t
  WHERE length(array_to_string(t.toks, '')) >= 5;
$$;

-- 0 = no match, 1 = weak match, 2 = strong match. This is the ONE alias
-- matcher. Keep the genericity decision outside this pure primitive because
-- it depends on the site corpus count, not on one keyword.
CREATE OR REPLACE FUNCTION seo.gsc_brand_alias_match_strength(
  p_normalized_phrase text,
  p_joined text,
  p_toks text[],
  p_probe text
)
RETURNS smallint
LANGUAGE sql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
  SELECT CASE
    WHEN p_normalized_phrase IS NULL
      OR p_joined IS NULL
      OR p_probe IS NULL
      OR strpos(p_normalized_phrase, p_probe) = 0
      OR NOT (
        position(
          p_joined IN translate(
            p_normalized_phrase,
            ' .,''-&/+_:;!?()[]"',
            ''
          )
        ) > 0
        OR p_toks <@ string_to_array(p_normalized_phrase, ' ')
      )
      THEN 0
    WHEN p_normalized_phrase ~ (
      '(^|[^a-z0-9])' || p_joined || '($|[^a-z0-9])'
    )
      OR (
        p_toks <@ string_to_array(p_normalized_phrase, ' ')
        AND string_to_array(p_normalized_phrase, ' ')
          && ARRAY['inc','llc','ltd','corp','corporation','incorporated']
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(string_to_array(p_normalized_phrase, ' ')) AS qt
          WHERE qt <> ''
            AND NOT (qt = ANY(p_toks))
            AND NOT (
              qt = ANY(
                ARRAY['inc','llc','ltd','corp','corporation','incorporated']
              )
            )
        )
      )
      THEN 2
    ELSE 1
  END::smallint;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_brand_aliases(p_site_id uuid)
RETURNS TABLE (alias_source text, raw_name text, joined text, toks text[], probe text)
LANGUAGE sql STABLE
SET search_path = seo, pg_temp
AS $$
  SELECT DISTINCT ON (spec.toks)
         names.src,
         spec.raw_name,
         spec.joined,
         spec.toks,
         spec.probe
  FROM (
    SELECT 'domain'::text AS src, 1 AS pri,
           split_part(
             regexp_replace(lower(s.domain), '^(www|m)\.', ''),
             '.',
             1
           ) AS nm
    FROM web.site s
    WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'site_name', 2, lower(s.name)
    FROM web.site s
    WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'brand_name', 3, lower(b.name)
    FROM web.site s
    JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
    WHERE s.id = p_site_id AND s.deleted_at IS NULL
    UNION ALL
    SELECT 'custom', 4, lower(al.v)
    FROM web.site s
    JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(b.profile->'brand_aliases') = 'array'
          THEN b.profile->'brand_aliases'
        ELSE '[]'::jsonb
      END
    ) AS al(v)
    WHERE s.id = p_site_id AND s.deleted_at IS NULL
  ) names
  CROSS JOIN LATERAL seo.gsc_brand_alias_spec(names.nm) spec
  ORDER BY spec.toks, names.pri;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_brand_hits(p_site_id uuid)
RETURNS TABLE (keyword_id uuid, joined text, strong boolean)
LANGUAGE sql STABLE
SET search_path = seo, pg_temp
AS $$
  WITH ba AS MATERIALIZED (
    SELECT * FROM seo.gsc_brand_aliases(p_site_id)
  ), candidates AS MATERIALIZED (
    -- Cheap mandatory prefilter first. Materializing prevents Postgres from
    -- evaluating the full match-strength predicate across every
    -- keyword×alias pair while keeping match truth in ONE function.
    SELECT kw.id, kw.normalized_phrase, ba.joined, ba.toks, ba.probe
    FROM seo.keyword kw
    CROSS JOIN ba
    WHERE kw.deleted_at IS NULL
      AND strpos(kw.normalized_phrase, ba.probe) > 0
  )
  SELECT candidates.id,
         candidates.joined,
         hit.strength = 2
  FROM candidates
  CROSS JOIN LATERAL (
    SELECT seo.gsc_brand_alias_match_strength(
      candidates.normalized_phrase,
      candidates.joined,
      candidates.toks,
      candidates.probe
    ) AS strength
  ) hit
  WHERE hit.strength > 0;
$$;

DROP FUNCTION IF EXISTS seo.gsc_brand_alias_preview(uuid, text, date, date, int);

CREATE OR REPLACE FUNCTION seo.gsc_brand_alias_preview(
  p_site_id uuid,
  p_alias text,
  p_start date,
  p_end date,
  p_limit int DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION 'gsc_brand_alias_preview_limit: %', p_limit;
  END IF;

  WITH input AS (
    SELECT btrim(lower(COALESCE(p_alias, ''))) AS raw_name
  ), spec AS MATERIALIZED (
    SELECT s.*
    FROM input i
    CROSS JOIN LATERAL seo.gsc_brand_alias_spec(i.raw_name) s
  ), candidate_prefilter AS MATERIALIZED (
    SELECT kw.id AS kid, kw.normalized_phrase, s.joined, s.toks, s.probe
    FROM seo.keyword kw
    CROSS JOIN spec s
    WHERE kw.deleted_at IS NULL
      AND strpos(kw.normalized_phrase, s.probe) > 0
  ), candidate_all AS MATERIALIZED (
    SELECT candidate_prefilter.kid, hit.strength = 2 AS strong
    FROM candidate_prefilter
    CROSS JOIN LATERAL (
      SELECT seo.gsc_brand_alias_match_strength(
        candidate_prefilter.normalized_phrase,
        candidate_prefilter.joined,
        candidate_prefilter.toks,
        candidate_prefilter.probe
      ) AS strength
    ) hit
    WHERE hit.strength > 0
  ), candidate_stats AS (
    SELECT count(*)::bigint AS corpus_count,
           count(*) FILTER (WHERE strong)::bigint AS strong_count
    FROM candidate_all
  ), candidate_effective AS MATERIALIZED (
    SELECT ca.kid
    FROM candidate_all ca
    CROSS JOIN candidate_stats cs
    WHERE ca.strong
       OR cs.corpus_count <= seo.gsc_brand_generic_threshold()
  ), existing_hits AS MATERIALIZED (
    SELECT * FROM seo.gsc_brand_hits(p_site_id)
  ), existing_counts AS MATERIALIZED (
    SELECT eh.joined, count(*)::bigint AS hit_count
    FROM existing_hits eh
    GROUP BY eh.joined
  ), existing_effective AS MATERIALIZED (
    SELECT DISTINCT eh.keyword_id AS kid
    FROM existing_hits eh
    JOIN existing_counts ec ON ec.joined = eh.joined
    WHERE eh.strong
       OR ec.hit_count <= seo.gsc_brand_generic_threshold()
  ), winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ), agg AS MATERIALIZED (
    SELECT spd.keyword_id AS kid,
           min(spd.query) AS q,
           sum(spd.clicks)::bigint AS s_clicks,
           sum(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
      AND spd.query IS NOT NULL
    GROUP BY spd.keyword_id
  ), active_candidates AS MATERIALIZED (
    SELECT ce.kid, a.q, a.s_clicks, a.s_imps
    FROM candidate_effective ce
    JOIN agg a ON a.kid = ce.kid
  ), new_candidates AS MATERIALIZED (
    SELECT ac.*
    FROM active_candidates ac
    LEFT JOIN existing_effective ee ON ee.kid = ac.kid
    WHERE ee.kid IS NULL
  ), stats AS (
    SELECT
      COALESCE((SELECT corpus_count FROM candidate_stats), 0)::bigint AS corpus_count,
      (SELECT count(*)::bigint FROM candidate_effective) AS effective_count,
      (SELECT count(*)::bigint FROM active_candidates) AS active_count,
      (SELECT count(*)::bigint FROM new_candidates) AS new_count
  ), ranked_new AS (
    SELECT nc.*
    FROM new_candidates nc
    ORDER BY nc.s_imps DESC, nc.q, nc.kid
    LIMIT p_limit
  )
  SELECT jsonb_build_object(
           'alias', i.raw_name,
           'eligible', s.joined IS NOT NULL,
           'alias_exists', EXISTS (
             SELECT 1
             FROM seo.gsc_brand_aliases(p_site_id) existing
             WHERE existing.toks = s.toks
           ),
           'demoted', st.corpus_count > seo.gsc_brand_generic_threshold(),
           'corpus_matches', st.corpus_count,
           'effective_matches', st.effective_count,
           'active_matches', st.active_count,
           'new_matches', st.new_count,
           'matches', (
             SELECT COALESCE(
               jsonb_agg(
                 jsonb_build_object(
                   'keyword_id', rn.kid,
                   'query', rn.q,
                   'clicks', rn.s_clicks,
                   'impressions', rn.s_imps
                 )
                 ORDER BY rn.s_imps DESC, rn.q, rn.kid
               ),
               '[]'::jsonb
             )
             FROM ranked_new rn
           )
         )
    INTO v_result
  FROM input i
  LEFT JOIN spec s ON true
  CROSS JOIN stats st;

  RETURN v_result;
END;
$function$;

-- Add an exact saved-brand-alias filter to the classification review RPC.
-- Existing callers remain valid because the parameter is appended with a
-- default. There is one PostgREST signature at every point in the migration.
DROP FUNCTION IF EXISTS seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean
);

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_review(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_classes text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'impressions',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_pattern text DEFAULT NULL,
  p_match text DEFAULT NULL,
  p_confirmed boolean DEFAULT NULL,
  p_brand_alias text DEFAULT NULL
)
RETURNS TABLE (
  keyword_id uuid,
  query text,
  traffic_class text,
  class_source text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  intent_class text,
  override_class text,
  content_role text,
  service_match text,
  suppression_reason text,
  lead_quality text,
  notes text,
  ruling_origin text,
  ruling_confirmed boolean,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $function$
DECLARE
  v_search text := NULLIF(btrim(p_search), '');
  v_pattern text := NULLIF(btrim(lower(p_pattern)), '');
  v_brand_alias text := NULLIF(btrim(lower(p_brand_alias)), '');
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_classes IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_classes) c
    WHERE c NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified')
  ) THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', array_to_string(p_classes, ',');
  END IF;
  IF p_sources IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(p_sources) s
    WHERE s NOT IN ('site_value', 'brand_match', 'intent_class', 'none')
  ) THEN
    RAISE EXCEPTION 'gsc_class_source_unknown: %', array_to_string(p_sources, ',');
  END IF;
  IF v_pattern IS NOT NULL AND (
    p_match IS NULL
    OR p_match NOT IN ('contains', 'exact', 'starts_with', 'ends_with', 'word')
  ) THEN
    RAISE EXCEPTION 'gsc_match_kind_unknown: %', COALESCE(p_match, '(missing)');
  END IF;
  IF p_sort NOT IN ('impressions', 'clicks', 'ctr', 'query') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH requested_alias AS MATERIALIZED (
    SELECT ba.joined
    FROM seo.gsc_brand_aliases(p_site_id) ba
    WHERE v_brand_alias IS NOT NULL
      AND ba.raw_name = v_brand_alias
    LIMIT 1
  ), requested_hits AS MATERIALIZED (
    SELECT h.keyword_id, h.strong
    FROM seo.gsc_brand_hits(p_site_id) h
    JOIN requested_alias ra ON ra.joined = h.joined
  ), requested_hit_count AS (
    SELECT count(*)::bigint AS n FROM requested_hits
  ), effective_requested_hits AS MATERIALIZED (
    SELECT rh.keyword_id
    FROM requested_hits rh
    CROSS JOIN requested_hit_count hc
    WHERE rh.strong OR hc.n <= seo.gsc_brand_generic_threshold()
  ), winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ), agg AS (
    SELECT spd.keyword_id AS kid,
           min(spd.query) AS q,
           sum(spd.clicks)::bigint AS s_clicks,
           sum(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
      AND spd.query IS NOT NULL
    GROUP BY spd.keyword_id
  ), classed AS (
    SELECT a.kid, a.q, a.s_clicks, a.s_imps,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(cm.class_source, 'none') AS src,
           kw.intent_class AS kw_intent,
           skv.traffic_class AS skv_class,
           skv.content_role AS skv_role,
           skv.service_match AS skv_service,
           skv.suppression_reason AS skv_suppression,
           skv.lead_quality AS skv_lead,
           skv.notes AS skv_notes,
           skv.metadata->'classification'->>'origin' AS skv_origin,
           COALESCE(
             (skv.metadata->'classification'->>'confirmed')::boolean,
             true
           ) AS skv_confirmed
    FROM agg a
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = a.kid
    LEFT JOIN seo.keyword kw ON kw.id = a.kid
    LEFT JOIN seo.site_keyword_value skv
      ON skv.keyword_id = a.kid
     AND skv.site_id = p_site_id
     AND skv.deleted_at IS NULL
    WHERE (
        p_classes IS NULL
        OR COALESCE(cm.traffic_class, 'unclassified') = ANY (p_classes)
      )
      AND (
        p_sources IS NULL
        OR COALESCE(cm.class_source, 'none') = ANY (p_sources)
      )
      AND (
        v_search IS NULL
        OR a.q ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
      )
      AND (
        v_pattern IS NULL
        OR CASE p_match
          WHEN 'contains' THEN
            a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern) || '%'
          WHEN 'exact' THEN lower(a.q) = v_pattern
          WHEN 'starts_with' THEN
            a.q ILIKE seo.gsc_perf_like_escape(v_pattern) || '%'
          WHEN 'ends_with' THEN
            a.q ILIKE '%' || seo.gsc_perf_like_escape(v_pattern)
          WHEN 'word' THEN v_pattern = ANY (string_to_array(lower(a.q), ' '))
        END
      )
      AND (
        p_confirmed IS NULL
        OR (
          skv.traffic_class IS NOT NULL
          AND COALESCE(
            (skv.metadata->'classification'->>'confirmed')::boolean,
            true
          ) = p_confirmed
        )
      )
      AND (
        v_brand_alias IS NULL
        OR EXISTS (
          SELECT 1
          FROM effective_requested_hits erh
          WHERE erh.keyword_id = a.kid
        )
      )
  )
  SELECT c.kid,
         c.q,
         c.cls,
         c.src,
         c.s_clicks,
         c.s_imps,
         CASE
           WHEN c.s_imps > 0
             THEN round(c.s_clicks::numeric / c.s_imps, 6)
         END,
         c.kw_intent,
         c.skv_class,
         c.skv_role,
         c.skv_service,
         c.skv_suppression,
         c.skv_lead,
         c.skv_notes,
         c.skv_origin,
         c.skv_confirmed,
         count(*) OVER ()::bigint
  FROM classed c
  ORDER BY
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN c.s_clicks END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN c.s_clicks END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN c.q END) DESC,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN c.q END) ASC,
    c.s_imps DESC,
    c.kid ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_brand_alias_spec(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_brand_alias_spec(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_brand_alias_match_strength(text, text, text[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_brand_alias_match_strength(text, text, text[], text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_brand_alias_preview(uuid, text, date, date, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_brand_alias_preview(uuid, text, date, date, int) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text
) TO authenticated, service_role;

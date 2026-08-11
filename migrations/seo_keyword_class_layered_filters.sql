-- Ordered, AND-combined filters for the keyword classification review.
-- The same RPC serves the visible table, export, selection, and rule preview,
-- so every range/text condition applies to the complete result set.

DROP FUNCTION IF EXISTS seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text
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
  p_brand_alias text DEFAULT NULL,
  p_filters jsonb DEFAULT '[]'::jsonb
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
  v_filters jsonb := COALESCE(p_filters, '[]'::jsonb);
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
  IF p_sort NOT IN (
    'impressions', 'clicks', 'ctr', 'query',
    'traffic_class', 'class_source', 'intent_class'
  ) THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  IF jsonb_typeof(v_filters) <> 'array' THEN
    RAISE EXCEPTION 'gsc_filters_invalid: expected an array';
  END IF;
  IF jsonb_array_length(v_filters) > 20 THEN
    RAISE EXCEPTION 'gsc_filters_invalid: at most 20 layers are allowed';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE jsonb_typeof(f.rule) <> 'object'
      OR COALESCE(f.rule->>'field', '') NOT IN (
        'query', 'traffic_class', 'class_source', 'impressions', 'clicks',
        'ctr', 'intent_class', 'notes', 'ruling_origin', 'ruling_confirmed'
      )
      OR COALESCE(f.rule->>'operator', '') NOT IN (
        'contains', 'not_contains', 'equals', 'not_equals', 'starts_with',
        'ends_with', 'word', 'not_word', 'is_empty', 'is_not_empty',
        'greater_than', 'greater_or_equal', 'less_than', 'less_or_equal',
        'between'
      )
      OR jsonb_typeof(f.rule->'value') <> 'string'
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: malformed field, operator, or value';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE (
      f.rule->>'field' IN ('impressions', 'clicks', 'ctr')
      AND f.rule->>'operator' NOT IN (
        'equals', 'not_equals', 'greater_than', 'greater_or_equal',
        'less_than', 'less_or_equal', 'between', 'is_empty', 'is_not_empty'
      )
    ) OR (
      f.rule->>'field' IN (
        'traffic_class', 'class_source', 'ruling_origin', 'ruling_confirmed'
      )
      AND f.rule->>'operator' NOT IN (
        'equals', 'not_equals', 'is_empty', 'is_not_empty'
      )
    ) OR (
      f.rule->>'field' IN ('query', 'intent_class', 'notes')
      AND f.rule->>'operator' NOT IN (
        'contains', 'not_contains', 'equals', 'not_equals', 'starts_with',
        'ends_with', 'word', 'not_word', 'is_empty', 'is_not_empty'
      )
    )
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: operator is not valid for its field';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND btrim(f.rule->>'value') = ''
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: a filter value is required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE f.rule->>'field' IN ('impressions', 'clicks', 'ctr')
      AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND (
        btrim(f.rule->>'value') !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        OR (
          f.rule->>'operator' = 'between'
          AND COALESCE(btrim(f.rule->>'valueTo'), '')
            !~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
        )
      )
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: numeric filters require valid numbers';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_filters) f(rule)
    WHERE (f.rule->>'field' = 'traffic_class' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
      AND f.rule->>'value' NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified'))
      OR (f.rule->>'field' = 'class_source' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('site_value', 'brand_match', 'intent_class', 'none'))
      OR (f.rule->>'field' = 'ruling_origin' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('manual', 'rule', 'import', 'ai'))
      OR (f.rule->>'field' = 'ruling_confirmed' AND f.rule->>'operator' NOT IN ('is_empty', 'is_not_empty')
        AND f.rule->>'value' NOT IN ('true', 'false'))
  ) THEN
    RAISE EXCEPTION 'gsc_filters_invalid: unknown select value';
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
  ), layered AS (
    SELECT c.*
    FROM classed c
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(v_filters) f(rule)
      CROSS JOIN LATERAL (
        SELECT
          CASE f.rule->>'field'
            WHEN 'query' THEN c.q
            WHEN 'traffic_class' THEN c.cls
            WHEN 'class_source' THEN c.src
            WHEN 'intent_class' THEN c.kw_intent
            WHEN 'notes' THEN c.skv_notes
            WHEN 'ruling_origin' THEN c.skv_origin
            WHEN 'ruling_confirmed' THEN
              CASE WHEN c.skv_class IS NULL THEN NULL ELSE c.skv_confirmed::text END
          END AS text_value,
          CASE f.rule->>'field'
            WHEN 'impressions' THEN c.s_imps::numeric
            WHEN 'clicks' THEN c.s_clicks::numeric
            WHEN 'ctr' THEN
              CASE WHEN c.s_imps > 0 THEN c.s_clicks::numeric * 100 / c.s_imps END
          END AS number_value
      ) actual
      WHERE NOT CASE
        WHEN f.rule->>'field' IN ('impressions', 'clicks', 'ctr') THEN
          CASE f.rule->>'operator'
            WHEN 'equals' THEN COALESCE(actual.number_value = (f.rule->>'value')::numeric, false)
            WHEN 'not_equals' THEN COALESCE(actual.number_value <> (f.rule->>'value')::numeric, false)
            WHEN 'greater_than' THEN COALESCE(actual.number_value > (f.rule->>'value')::numeric, false)
            WHEN 'greater_or_equal' THEN COALESCE(actual.number_value >= (f.rule->>'value')::numeric, false)
            WHEN 'less_than' THEN COALESCE(actual.number_value < (f.rule->>'value')::numeric, false)
            WHEN 'less_or_equal' THEN COALESCE(actual.number_value <= (f.rule->>'value')::numeric, false)
            WHEN 'between' THEN COALESCE(
              actual.number_value BETWEEN (f.rule->>'value')::numeric AND (f.rule->>'valueTo')::numeric,
              false
            )
            WHEN 'is_empty' THEN actual.number_value IS NULL
            WHEN 'is_not_empty' THEN actual.number_value IS NOT NULL
          END
        ELSE
          CASE f.rule->>'operator'
            WHEN 'contains' THEN COALESCE(actual.text_value, '') ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'not_contains' THEN COALESCE(actual.text_value, '') NOT ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'equals' THEN lower(COALESCE(actual.text_value, '')) = lower(btrim(f.rule->>'value'))
            WHEN 'not_equals' THEN lower(COALESCE(actual.text_value, '')) <> lower(btrim(f.rule->>'value'))
            WHEN 'starts_with' THEN COALESCE(actual.text_value, '') ILIKE
              seo.gsc_perf_like_escape(btrim(f.rule->>'value')) || '%'
            WHEN 'ends_with' THEN COALESCE(actual.text_value, '') ILIKE
              '%' || seo.gsc_perf_like_escape(btrim(f.rule->>'value'))
            WHEN 'word' THEN lower(btrim(f.rule->>'value')) = ANY (
              regexp_split_to_array(lower(COALESCE(actual.text_value, '')), '[^[:alnum:]]+')
            )
            WHEN 'not_word' THEN NOT (
              lower(btrim(f.rule->>'value')) = ANY (
                regexp_split_to_array(lower(COALESCE(actual.text_value, '')), '[^[:alnum:]]+')
              )
            )
            WHEN 'is_empty' THEN COALESCE(btrim(actual.text_value), '') = ''
            WHEN 'is_not_empty' THEN COALESCE(btrim(actual.text_value), '') <> ''
          END
      END
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
  FROM layered c
  ORDER BY
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'desc' THEN c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'impressions' AND p_sort_dir = 'asc' THEN c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'desc' THEN c.s_clicks END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'clicks' AND p_sort_dir = 'asc' THEN c.s_clicks END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'desc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'ctr' AND p_sort_dir = 'asc' AND c.s_imps > 0 THEN c.s_clicks::numeric / c.s_imps END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'desc' THEN c.q END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'query' AND p_sort_dir = 'asc' THEN c.q END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'traffic_class' AND p_sort_dir = 'desc' THEN c.cls END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'traffic_class' AND p_sort_dir = 'asc' THEN c.cls END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'class_source' AND p_sort_dir = 'desc' THEN c.src END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'class_source' AND p_sort_dir = 'asc' THEN c.src END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'intent_class' AND p_sort_dir = 'desc' THEN c.kw_intent END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'intent_class' AND p_sort_dir = 'asc' THEN c.kw_intent END) ASC NULLS LAST,
    c.s_imps DESC,
    c.kid ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION seo.gsc_keyword_class_review(
  uuid, date, date, text[], text[], text, text, text, int, int,
  text, text, boolean, text, jsonb
) IS 'GSC-active keyword classification review with validated ordered AND filters; CTR filter values are percentage points.';

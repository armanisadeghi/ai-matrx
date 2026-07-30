-- Search Console dashboard read layer — SECURITY INVOKER RPCs over
-- seo.search_performance_daily (provider='gsc'), the canonical multi-dimension
-- GSC fact table fed by aidream's ingestion spine.
--
-- THE ACCURACY CONTRACT (do not weaken):
--   * Profile resolution: every read maps (dimension, filters) onto the
--     NARROWEST dimension_profile covering the active filters. Unfiltered
--     totals read the 'property' profile (Google's own truth for totals);
--     query-dimension reads use 'query' unless a page filter forces
--     'query_page' (which suffers Google's anonymized-query loss). This is
--     how GSC's own UI behaves.
--   * Aggregates: CTR = SUM(clicks)/SUM(impressions); position =
--     impressions-weighted average — NEVER an average of averages.
--   * Latest-fact dedup: dedup_key is run-scoped, so two different
--     collection runs overlapping the same dates append same-grain facts.
--     Every aggregate takes DISTINCT ON (grain) ... ORDER BY created_at DESC.
--   * Filter groups may not cross profiles: (query/page) | (country/device) |
--     (search_appearance). An unsupported combination raises loudly.
--
-- Filter contract (p_filters jsonb, blank/missing keys ignored):
--   query_contains, query_eq, query_neq, page_contains, page_eq
--   country, device, search_appearance
-- page_eq accepts a canonical web.page uuid OR a page URL.

CREATE INDEX IF NOT EXISTS idx_seo_sperf_gsc_read
  ON seo.search_performance_daily (site_id, dimension_profile, date)
  WHERE provider = 'gsc';

CREATE OR REPLACE FUNCTION seo.gsc_perf_resolve_profile(
  p_dimension text,
  p_filters jsonb
) RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  has_q boolean := COALESCE(NULLIF(btrim(p_filters->>'query_contains'), ''), NULLIF(btrim(p_filters->>'query_eq'), ''), NULLIF(btrim(p_filters->>'query_neq'), '')) IS NOT NULL;
  has_p boolean := COALESCE(NULLIF(btrim(p_filters->>'page_contains'), ''), NULLIF(btrim(p_filters->>'page_eq'), '')) IS NOT NULL;
  has_cd boolean := COALESCE(NULLIF(btrim(p_filters->>'country'), ''), NULLIF(btrim(p_filters->>'device'), '')) IS NOT NULL;
  has_sa boolean := NULLIF(btrim(p_filters->>'search_appearance'), '') IS NOT NULL;
BEGIN
  IF p_dimension IS NULL THEN
    IF has_sa AND NOT (has_q OR has_p OR has_cd) THEN RETURN 'search_appearance'; END IF;
    IF has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: search_appearance cannot combine with other filters'; END IF;
    IF has_cd AND NOT (has_q OR has_p) THEN RETURN 'country_device'; END IF;
    IF has_cd THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: country/device cannot combine with query/page filters'; END IF;
    IF has_q AND has_p THEN RETURN 'query_page'; END IF;
    IF has_q THEN RETURN 'query'; END IF;
    IF has_p THEN RETURN 'page'; END IF;
    RETURN 'property';
  ELSIF p_dimension = 'query' THEN
    IF has_cd OR has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: query breakdown supports only query/page filters'; END IF;
    RETURN CASE WHEN has_p THEN 'query_page' ELSE 'query' END;
  ELSIF p_dimension = 'page' THEN
    IF has_cd OR has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: page breakdown supports only query/page filters'; END IF;
    RETURN CASE WHEN has_q THEN 'query_page' ELSE 'page' END;
  ELSIF p_dimension IN ('country', 'device') THEN
    IF has_q OR has_p OR has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: %/device breakdowns support only country/device filters', p_dimension; END IF;
    RETURN 'country_device';
  ELSIF p_dimension = 'search_appearance' THEN
    IF has_q OR has_p OR has_cd THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: search_appearance breakdown supports no other filters'; END IF;
    RETURN 'search_appearance';
  END IF;
  RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
END;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_summary(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  clicks bigint,
  impressions bigint,
  ctr numeric,
  avg_position numeric,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_ctr numeric,
  cmp_avg_position numeric
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(NULL, p_filters);
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance)
      spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
      AND (f_qc IS NULL OR spd.query ILIKE '%' || f_qc || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || f_pc || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
    ORDER BY spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance, spd.created_at DESC
  ),
  cur AS (
    SELECT COALESCE(SUM(l.c), 0)::bigint AS s_clicks,
           COALESCE(SUM(l.i), 0)::bigint AS s_imps,
           SUM(l.pos * l.i) AS s_wpos
    FROM latest l WHERE l.d BETWEEN p_start AND p_end
  ),
  cmp AS (
    SELECT COALESCE(SUM(l.c), 0)::bigint AS s_clicks,
           COALESCE(SUM(l.i), 0)::bigint AS s_imps,
           SUM(l.pos * l.i) AS s_wpos
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end
  )
  SELECT cur.s_clicks,
         cur.s_imps,
         CASE WHEN cur.s_imps > 0 THEN round(cur.s_clicks::numeric / cur.s_imps, 6) END,
         CASE WHEN cur.s_imps > 0 THEN round(cur.s_wpos / cur.s_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN cmp.s_clicks END,
         CASE WHEN p_compare_start IS NOT NULL THEN cmp.s_imps END,
         CASE WHEN p_compare_start IS NOT NULL AND cmp.s_imps > 0 THEN round(cmp.s_clicks::numeric / cmp.s_imps, 6) END,
         CASE WHEN p_compare_start IS NOT NULL AND cmp.s_imps > 0 THEN round(cmp.s_wpos / cmp.s_imps, 2) END
  FROM cur, cmp;
END;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_timeseries(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
) RETURNS TABLE (
  day date,
  period text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  avg_position numeric
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(NULL, p_filters);
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
BEGIN
  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance)
      spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
      AND (f_qc IS NULL OR spd.query ILIKE '%' || f_qc || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || f_pc || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
    ORDER BY spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance, spd.created_at DESC
  )
  SELECT l.d,
         'current'::text,
         COALESCE(SUM(l.c), 0)::bigint,
         COALESCE(SUM(l.i), 0)::bigint,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.c)::numeric / SUM(l.i), 6) END,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.pos * l.i) / SUM(l.i), 2) END
  FROM latest l
  WHERE l.d BETWEEN p_start AND p_end
  GROUP BY l.d
  UNION ALL
  SELECT l.d,
         'compare'::text,
         COALESCE(SUM(l.c), 0)::bigint,
         COALESCE(SUM(l.i), 0)::bigint,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.c)::numeric / SUM(l.i), 6) END,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.pos * l.i) / SUM(l.i), 2) END
  FROM latest l
  WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
    AND l.d BETWEEN p_compare_start AND p_compare_end
  GROUP BY l.d
  ORDER BY 2, 1;
END;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_breakdown(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'clicks',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  key text,
  page_id uuid,
  keyword_id uuid,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  avg_position numeric,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_ctr numeric,
  cmp_avg_position numeric,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
BEGIN
  IF p_sort NOT IN ('clicks', 'impressions', 'ctr', 'position', 'key', 'delta_clicks') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH latest AS (
    SELECT DISTINCT ON (spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance)
      spd.date AS d,
      spd.clicks AS c,
      spd.impressions AS i,
      spd.average_position AS pos,
      spd.page_id AS pid,
      spd.keyword_id AS kid,
      CASE p_dimension
        WHEN 'query' THEN spd.query
        WHEN 'page' THEN COALESCE(spd.extras->>'page_url', spd.page_id::text)
        WHEN 'country' THEN spd.country
        WHEN 'device' THEN spd.device
        ELSE spd.search_appearance
      END AS k
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
      AND (f_qc IS NULL OR spd.query ILIKE '%' || f_qc || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || f_pc || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
    ORDER BY spd.date, spd.query, spd.page_id, spd.country, spd.device, spd.search_appearance, spd.created_at DESC
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) AS s_wpos
    FROM latest l
    WHERE l.d BETWEEN p_start AND p_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  cmp AS (
    SELECT l.k,
           (array_agg(l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) AS s_wpos
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  joined AS (
    SELECT COALESCE(cur.k, cmp.k) AS k,
           COALESCE(cur.pid, cmp.pid) AS pid,
           COALESCE(cur.kid, cmp.kid) AS kid,
           COALESCE(cur.s_clicks, 0) AS c_clicks,
           COALESCE(cur.s_imps, 0) AS c_imps,
           cur.s_wpos AS c_wpos,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_clicks, 0) END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_imps, 0) END AS m_imps,
           cmp.s_wpos AS m_wpos
    FROM cur FULL OUTER JOIN cmp ON cur.k = cmp.k
  ),
  filtered AS (
    SELECT j.*,
           CASE p_sort
             WHEN 'clicks' THEN j.c_clicks::numeric
             WHEN 'impressions' THEN j.c_imps::numeric
             WHEN 'ctr' THEN CASE WHEN j.c_imps > 0 THEN j.c_clicks::numeric / j.c_imps END
             WHEN 'position' THEN CASE WHEN j.c_imps > 0 THEN j.c_wpos / j.c_imps END
             WHEN 'delta_clicks' THEN (j.c_clicks - COALESCE(j.m_clicks, 0))::numeric
           END AS s_val
    FROM joined j
    WHERE v_search IS NULL OR j.k ILIKE '%' || v_search || '%'
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         CASE WHEN f.c_imps > 0 THEN round(f.c_clicks::numeric / f.c_imps, 6) END,
         CASE WHEN f.c_imps > 0 THEN round(f.c_wpos / f.c_imps, 2) END,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         CASE WHEN f.m_imps > 0 THEN round(f.m_clicks::numeric / f.m_imps, 6) END,
         CASE WHEN f.m_imps > 0 THEN round(f.m_wpos / f.m_imps, 2) END,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    (CASE WHEN p_sort_dir = 'desc' THEN f.s_val END) DESC NULLS LAST,
    (CASE WHEN p_sort_dir = 'asc' THEN f.s_val END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_freshness(
  p_site_id uuid
) RETURNS TABLE (
  dimension_profile text,
  min_date date,
  max_date date,
  row_count bigint
)
LANGUAGE sql STABLE
SET search_path = seo, pg_temp
AS $$
  SELECT spd.dimension_profile, MIN(spd.date), MAX(spd.date), COUNT(*)::bigint
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
  GROUP BY spd.dimension_profile
  ORDER BY spd.dimension_profile;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_perf_resolve_profile(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_summary(uuid, date, date, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_timeseries(uuid, date, date, date, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_breakdown(uuid, text, date, date, date, date, jsonb, text, text, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_freshness(uuid) TO authenticated;

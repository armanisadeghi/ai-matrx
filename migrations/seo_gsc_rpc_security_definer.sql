-- GSC read RPCs -> SECURITY DEFINER with ONE upfront site-access check.
--
-- WHY (2026-08-07): these functions were SECURITY INVOKER, so the RLS policy
-- on seo.search_performance_daily -- (created_by = auth.uid() OR
-- iam.has_org_access(organization_id)) -- executed iam.has_org_access() PER
-- ROW. On a 28d class summary for one site that is ~500k calls: 12.8s
-- measured vs 310ms without RLS (40x). PostgREST's authenticated
-- statement_timeout killed the calls -> HTTP 500 -> the Insights tab
-- rendered "No data in this period" over data that exists.
--
-- FIX: SECURITY DEFINER + seo.gsc_assert_site_access(p_site_id) as the FIRST
-- statement of every top-level GSC read RPC. The gate is the SAME primitive
-- the row policy used (iam.has_org_access + created_by), evaluated ONCE
-- against the site instead of once per fact row. Fact rows carry the site's
-- organization_id, so site-level check == row-level check for this table.
-- No new security layer; same tiers, same resolver.
--
-- Function bodies are otherwise byte-identical to their source migrations
-- (seo_gsc_perf_rpcs.sql, seo_gsc_class_rpcs.sql, seo_gsc_insight_rpcs.sql,
-- seo_gsc_dig_watch_launch.sql) -- THE ACCURACY CONTRACT is unchanged.
-- gsc_perf_freshness (was LANGUAGE sql) is converted to plpgsql to host the
-- guard. Helper functions called from inside these (gsc_keyword_class_map,
-- gsc_perf_resolve_profile, gsc_perf_like_escape, gsc_dig_*) stay INVOKER --
-- inside a DEFINER call they already run as the definer.

CREATE OR REPLACE FUNCTION seo.gsc_assert_site_access(p_site_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, web, iam, pg_temp
AS $fn$
DECLARE
  v_org uuid;
  v_created_by uuid;
BEGIN
  SELECT s.organization_id, s.created_by INTO v_org, v_created_by
  FROM web.site s WHERE s.id = p_site_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF v_created_by = (SELECT auth.uid()) OR iam.has_org_access(v_org) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'gsc_site_access_denied: no access to site %', p_site_id
    USING ERRCODE = '42501';
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_assert_site_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_assert_site_access(uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION seo.gsc_perf_breakdown(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_filters jsonb DEFAULT '{}'::jsonb, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'clicks'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
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
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
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
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d,
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
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.d BETWEEN p_start AND p_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  cmp AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
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
           COALESCE(cur.s_pos_imps, 0) AS c_pos_imps,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_clicks, 0) END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_imps, 0) END AS m_imps,
           cmp.s_wpos AS m_wpos,
           COALESCE(cmp.s_pos_imps, 0) AS m_pos_imps
    FROM cur FULL OUTER JOIN cmp ON cur.k = cmp.k
  ),
  filtered AS (
    SELECT j.*,
           CASE p_sort
             WHEN 'clicks' THEN j.c_clicks::numeric
             WHEN 'impressions' THEN j.c_imps::numeric
             WHEN 'ctr' THEN CASE WHEN j.c_imps > 0 THEN j.c_clicks::numeric / j.c_imps END
             WHEN 'position' THEN CASE WHEN j.c_pos_imps > 0 THEN j.c_wpos / j.c_pos_imps END
             WHEN 'delta_clicks' THEN (j.c_clicks - COALESCE(j.m_clicks, 0))::numeric
           END AS s_val
    FROM joined j
    WHERE v_search IS NULL OR j.k ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%'
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         CASE WHEN f.c_imps > 0 THEN round(f.c_clicks::numeric / f.c_imps, 6) END,
         CASE WHEN f.c_pos_imps > 0 THEN round(f.c_wpos / f.c_pos_imps, 2) END,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         CASE WHEN f.m_imps > 0 THEN round(f.m_clicks::numeric / f.m_imps, 6) END,
         CASE WHEN f.m_pos_imps > 0 THEN round(f.m_wpos / f.m_pos_imps, 2) END,
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
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_cannibalization(p_site_id uuid, p_start date, p_end date, p_min_impressions integer DEFAULT 100, p_min_share numeric DEFAULT 0.2, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(query text, keyword_id uuid, clicks bigint, impressions bigint, avg_position numeric, competing_pages integer, top_share numeric, pages jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF p_min_share <= 0 OR p_min_share > 0.5 THEN
    RAISE EXCEPTION 'gsc_min_share_out_of_range: %', p_min_share;
  END IF;
  IF p_min_impressions < 1 THEN
    RAISE EXCEPTION 'gsc_min_impressions_out_of_range: %', p_min_impressions;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.query AS q, spd.keyword_id AS kid, spd.page_id AS pid,
           COALESCE(spd.extras->>'page_url', spd.page_id::text) AS purl,
           spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.query IS NOT NULL
  ),
  per_page AS (
    SELECT l.q, l.purl,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS pos_wsum,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS pos_imps,
           CASE WHEN COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) > 0
                THEN (SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL))
                     / (SUM(l.i) FILTER (WHERE l.pos IS NOT NULL)) END AS w_pos
    FROM latest l
    WHERE l.purl IS NOT NULL
    GROUP BY l.q, l.purl
  ),
  q_tot AS (
    SELECT pp.q,
           SUM(pp.s_clicks)::bigint AS q_clicks,
           SUM(pp.s_imps)::bigint AS q_imps,
           CASE WHEN SUM(pp.pos_imps) > 0
                THEN SUM(pp.pos_wsum) / SUM(pp.pos_imps) END AS q_pos
    FROM per_page pp
    GROUP BY pp.q
  ),
  shared AS (
    SELECT pp.q, pp.purl, pp.kid, pp.pid, pp.s_clicks, pp.s_imps, pp.w_pos,
           qt.q_clicks, qt.q_imps, qt.q_pos,
           pp.s_imps::numeric / NULLIF(qt.q_imps, 0) AS imp_share,
           CASE WHEN qt.q_clicks > 0 THEN pp.s_clicks::numeric / qt.q_clicks
                ELSE pp.s_imps::numeric / NULLIF(qt.q_imps, 0) END AS traffic_share,
           row_number() OVER (PARTITION BY pp.q ORDER BY pp.s_imps DESC, pp.purl ASC) AS rn
    FROM per_page pp
    JOIN q_tot qt ON qt.q = pp.q
  ),
  flagged AS (
    SELECT s.q,
           (array_agg(s.kid ORDER BY s.kid) FILTER (WHERE s.kid IS NOT NULL))[1] AS kid,
           MAX(s.q_clicks) AS q_clicks,
           MAX(s.q_imps) AS q_imps,
           MAX(s.q_pos) AS q_pos,
           COUNT(*) FILTER (WHERE s.imp_share >= p_min_share)::int AS competing,
           MAX(s.traffic_share) AS top_share,
           jsonb_agg(
             jsonb_build_object(
               'url', s.purl,
               'page_id', s.pid,
               'clicks', s.s_clicks,
               'impressions', s.s_imps,
               'position', round(s.w_pos, 2),
               'impression_share', round(s.imp_share, 4)
             ) ORDER BY s.s_imps DESC
           ) FILTER (WHERE s.rn <= 5) AS top_pages
    FROM shared s
    GROUP BY s.q
    HAVING COUNT(*) FILTER (WHERE s.imp_share >= p_min_share) >= 2
       AND MAX(s.q_imps) >= p_min_impressions
  )
  SELECT f.q,
         f.kid,
         f.q_clicks,
         f.q_imps,
         round(f.q_pos, 2),
         f.competing,
         round(f.top_share, 4),
         f.top_pages,
         COUNT(*) OVER ()::bigint
  FROM flagged f
  ORDER BY f.q_imps DESC, f.q ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_class_movers(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date, p_compare_end date, p_class text DEFAULT NULL::text, p_direction text DEFAULT 'loss'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, traffic_class text, clicks bigint, impressions bigint, cmp_clicks bigint, cmp_impressions bigint, delta_clicks bigint, delta_impressions bigint, class_mix jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text;
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
  v_profile := CASE p_dimension WHEN 'query' THEN 'query' ELSE 'query_page' END;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(p_compare_start, p_start) AND GREATEST(p_compare_end, p_end)
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
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
    WHERE l.k IS NOT NULL
      AND (p_class IS NULL OR COALESCE(cm.traffic_class, 'unclassified') = p_class)
  ),
  by_class AS (
    SELECT c.k, c.cls,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           (array_agg(c.kid ORDER BY c.kid) FILTER (WHERE c.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i
    FROM classed c
    GROUP BY c.k, c.cls
  ),
  rolled AS (
    SELECT b.k,
           (array_agg(b.pid ORDER BY b.pid) FILTER (WHERE b.pid IS NOT NULL))[1] AS pid,
           (array_agg(b.kid ORDER BY b.kid) FILTER (WHERE b.kid IS NOT NULL))[1] AS kid,
           -- dominant class by current-period clicks (compare clicks break ties)
           (array_agg(b.cls ORDER BY b.cur_c DESC, b.cmp_c DESC, b.cls ASC))[1] AS dom_cls,
           SUM(b.cur_c)::bigint AS cur_c,
           SUM(b.cur_i)::bigint AS cur_i,
           SUM(b.cmp_c)::bigint AS cmp_c,
           SUM(b.cmp_i)::bigint AS cmp_i,
           jsonb_object_agg(
             b.cls,
             jsonb_build_object('clicks', b.cur_c, 'cmp_clicks', b.cmp_c)
           ) FILTER (WHERE b.cur_c > 0 OR b.cmp_c > 0) AS mix
    FROM by_class b
    GROUP BY b.k
  ),
  moved AS (
    SELECT r.*, (r.cur_c - r.cmp_c) AS d_c, (r.cur_i - r.cmp_i) AS d_i
    FROM rolled r
    WHERE r.cur_c > 0 OR r.cmp_c > 0 OR r.cur_i > 0 OR r.cmp_i > 0
  )
  SELECT m.k,
         m.pid,
         m.kid,
         m.dom_cls,
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

CREATE OR REPLACE FUNCTION seo.gsc_perf_class_summary(p_site_id uuid, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date)
 RETURNS TABLE(traffic_class text, clicks bigint, impressions bigint, queries bigint, cmp_clicks bigint, cmp_impressions bigint, cmp_queries bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.query AS q
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
  ),
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
  )
  SELECT c.cls,
         COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint,
         COUNT(DISTINCT c.q) FILTER (WHERE c.d BETWEEN p_start AND p_end)::bigint,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COUNT(DISTINCT c.q) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end)::bigint END
  FROM classed c
  GROUP BY c.cls
  ORDER BY 2 DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_ctr_gap(p_site_id uuid, p_start date, p_end date, p_dimension text DEFAULT 'query'::text, p_min_impressions integer DEFAULT 100, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, position_bucket integer, expected_ctr numeric, ctr_gap numeric, missed_clicks bigint, bucket_keys bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF p_min_impressions < 1 THEN
    RAISE EXCEPTION 'gsc_min_impressions_out_of_range: %', p_min_impressions;
  END IF;
  v_profile := p_dimension;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos,
           spd.page_id AS pid, spd.keyword_id AS kid,
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
  agg AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           CASE WHEN COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) > 0
                THEN (SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL))
                     / (SUM(l.i) FILTER (WHERE l.pos IS NOT NULL)) END AS w_pos
    FROM latest l
    WHERE l.k IS NOT NULL
    GROUP BY l.k
  ),
  bucketed AS (
    SELECT a.*, LEAST(20, GREATEST(1, round(a.w_pos)))::int AS bkt
    FROM agg a
    WHERE a.w_pos IS NOT NULL AND a.s_imps > 0
  ),
  curve AS (
    SELECT b.bkt,
           SUM(b.s_clicks)::numeric AS bkt_clicks,
           SUM(b.s_imps)::numeric AS bkt_imps,
           COUNT(*)::bigint AS n_keys
    FROM bucketed b
    GROUP BY b.bkt
  ),
  scored AS (
    SELECT b.k, b.pid, b.kid, b.s_clicks, b.s_imps, b.w_pos, b.bkt,
           (c.bkt_clicks - b.s_clicks) / (c.bkt_imps - b.s_imps) AS exp_ctr,
           c.n_keys - 1 AS other_keys,
           b.s_clicks::numeric / b.s_imps AS act_ctr
    FROM bucketed b
    JOIN curve c ON c.bkt = b.bkt
    WHERE b.s_imps >= p_min_impressions
      AND c.n_keys - 1 >= 5
      AND c.bkt_imps - b.s_imps > 0
  )
  SELECT s.k,
         s.pid,
         s.kid,
         s.s_clicks,
         s.s_imps,
         round(s.act_ctr, 6),
         round(s.w_pos, 2),
         s.bkt,
         round(s.exp_ctr, 6),
         round(s.exp_ctr - s.act_ctr, 6),
         round((s.exp_ctr - s.act_ctr) * s.s_imps)::bigint,
         s.other_keys,
         COUNT(*) OVER ()::bigint
  FROM scored s
  WHERE s.act_ctr < s.exp_ctr
  ORDER BY (s.exp_ctr - s.act_ctr) * s.s_imps DESC, s.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_dig(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_conditions jsonb DEFAULT '[]'::jsonb, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'clicks'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 100, p_traffic_class text DEFAULT NULL::text)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric, delta_clicks bigint, delta_impressions bigint, delta_ctr numeric, delta_position numeric, delta_clicks_pct numeric, delta_impressions_pct numeric, traffic_class text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_need_class boolean;
  v_metrics constant text[] := ARRAY[
    'clicks','impressions','ctr','position',
    'cmp_clicks','cmp_impressions','cmp_ctr','cmp_position',
    'delta_clicks','delta_impressions','delta_ctr','delta_position',
    'delta_clicks_pct','delta_impressions_pct'];
  v_cond jsonb;
  v_metric text;
  v_op text;
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension IS NULL OR p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dig_dimension_unsupported: % (dig rules run on query or page)', COALESCE(p_dimension, '(null)');
  END IF;
  IF p_traffic_class IS NOT NULL
     AND p_traffic_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_traffic_class;
  END IF;
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF jsonb_typeof(p_conditions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'gsc_dig_conditions_invalid: conditions must be a json array';
  END IF;
  IF jsonb_array_length(p_conditions) > 20 THEN
    RAISE EXCEPTION 'gsc_dig_too_many_conditions: max 20';
  END IF;
  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    v_metric := v_cond->>'metric';
    v_op := v_cond->>'op';
    IF v_metric IS NULL OR NOT (v_metric = ANY (v_metrics)) THEN
      RAISE EXCEPTION 'gsc_dig_metric_unknown: %', COALESCE(v_metric, '(missing)');
    END IF;
    IF v_op IS NULL OR v_op NOT IN ('gt', 'gte', 'lt', 'lte') THEN
      RAISE EXCEPTION 'gsc_dig_op_unknown: %', COALESCE(v_op, '(missing)');
    END IF;
    IF jsonb_typeof(v_cond->'value') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'gsc_dig_value_invalid: condition on % needs a numeric value', v_metric;
    END IF;
    IF (v_metric LIKE 'cmp\_%' OR v_metric LIKE 'delta\_%') AND p_compare_start IS NULL THEN
      RAISE EXCEPTION 'gsc_dig_compare_required: metric % needs a compare period', v_metric;
    END IF;
  END LOOP;
  IF p_sort <> 'key' AND NOT (p_sort = ANY (v_metrics)) THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF (p_sort LIKE 'cmp\_%' OR p_sort LIKE 'delta\_%') AND p_compare_start IS NULL THEN
    RAISE EXCEPTION 'gsc_dig_compare_required: sort % needs a compare period', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=%', p_limit;
  END IF;

  IF p_traffic_class IS NOT NULL AND v_profile = 'page' THEN
    v_profile := 'query_page';
  END IF;
  v_need_class := p_traffic_class IS NOT NULL OR v_profile IN ('query', 'query_page');

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d,
      spd.clicks AS c,
      spd.impressions AS i,
      spd.average_position AS pos,
      spd.page_id AS pid,
      spd.keyword_id AS kid,
      CASE WHEN v_need_class
           THEN COALESCE(cm.traffic_class, 'unclassified') END AS cls,
      CASE p_dimension
        WHEN 'query' THEN spd.query
        ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
      END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm
      ON v_need_class AND cm.keyword_id = spd.keyword_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (p_traffic_class IS NULL
           OR COALESCE(cm.traffic_class, 'unclassified') = p_traffic_class)
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           MAX(l.cls) AS cls,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.d BETWEEN p_start AND p_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  cmp AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           MAX(l.cls) AS cls,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  joined AS (
    SELECT COALESCE(cur.k, cmp.k) AS k,
           COALESCE(cur.pid, cmp.pid) AS pid,
           COALESCE(cur.kid, cmp.kid) AS kid,
           COALESCE(cur.cls, cmp.cls) AS cls,
           COALESCE(cur.s_clicks, 0) AS c_clicks,
           COALESCE(cur.s_imps, 0) AS c_imps,
           cur.s_wpos AS c_wpos,
           COALESCE(cur.s_pos_imps, 0) AS c_pos_imps,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_clicks, 0) END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_imps, 0) END AS m_imps,
           cmp.s_wpos AS m_wpos,
           COALESCE(cmp.s_pos_imps, 0) AS m_pos_imps
    FROM cur FULL OUTER JOIN cmp ON cur.k = cmp.k
  ),
  metrics AS (
    SELECT j.k, j.pid, j.kid, j.cls,
           j.c_clicks, j.c_imps,
           CASE WHEN j.c_imps > 0 THEN round(j.c_clicks::numeric / j.c_imps, 6) END AS c_ctr,
           CASE WHEN j.c_pos_imps > 0 THEN round(j.c_wpos / j.c_pos_imps, 2) END AS c_pos,
           j.m_clicks, j.m_imps,
           CASE WHEN j.m_imps > 0 THEN round(j.m_clicks::numeric / j.m_imps, 6) END AS m_ctr,
           CASE WHEN j.m_pos_imps > 0 THEN round(j.m_wpos / j.m_pos_imps, 2) END AS m_pos
    FROM joined j
  ),
  passed AS (
    SELECT m.*,
           CASE WHEN p_sort = 'key' THEN NULL
                ELSE seo.gsc_dig_metric_value(p_sort, m.c_clicks, m.c_imps, m.c_ctr, m.c_pos,
                                              m.m_clicks, m.m_imps, m.m_ctr, m.m_pos)
           END AS s_val
    FROM metrics m
    WHERE jsonb_array_length(p_conditions) = 0
       OR (SELECT bool_and(seo.gsc_dig_condition_passes(
              c->>'op',
              seo.gsc_dig_metric_value(c->>'metric', m.c_clicks, m.c_imps, m.c_ctr, m.c_pos,
                                       m.m_clicks, m.m_imps, m.m_ctr, m.m_pos),
              (c->>'value')::numeric))
           FROM jsonb_array_elements(p_conditions) c)
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         f.c_ctr,
         f.c_pos,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         f.m_ctr,
         f.m_pos,
         (f.c_clicks - f.m_clicks)::bigint,
         (f.c_imps - f.m_imps)::bigint,
         f.c_ctr - f.m_ctr,
         f.c_pos - f.m_pos,
         CASE WHEN f.m_clicks > 0 THEN round((f.c_clicks - f.m_clicks)::numeric * 100 / f.m_clicks, 2) END,
         CASE WHEN f.m_imps > 0 THEN round((f.c_imps - f.m_imps)::numeric * 100 / f.m_imps, 2) END,
         f.cls,
         COUNT(*) OVER ()::bigint
  FROM passed f
  ORDER BY
    (CASE WHEN p_sort_dir = 'desc' THEN f.s_val END) DESC NULLS LAST,
    (CASE WHEN p_sort_dir = 'asc' THEN f.s_val END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  LIMIT p_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_freshness(p_site_id uuid)
 RETURNS TABLE(dimension_profile text, min_date date, max_date date, row_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT spd.dimension_profile, MIN(spd.date), MAX(spd.date), COUNT(*)::bigint
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
  GROUP BY spd.dimension_profile
  ORDER BY spd.dimension_profile;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_juice(p_site_id uuid, p_as_of date DEFAULT NULL::date, p_month_min_clicks integer DEFAULT 10, p_min_months integer DEFAULT 3, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(key text, page_id uuid, edu_clicks bigint, edu_clicks_prior bigint, edu_months_active integer, money_clicks bigint, money_clicks_prior bigint, money_impressions bigint, other_clicks bigint, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_end date := COALESCE(p_as_of, CURRENT_DATE - 2);
  v_recent_start date;
  v_prior_start date;
  v_months_start date;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_month_min_clicks < 1 OR p_min_months < 1 OR p_min_months > 6 THEN
    RAISE EXCEPTION 'gsc_juice_params_out_of_range: month_min_clicks=% min_months=%', p_month_min_clicks, p_min_months;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  v_recent_start := v_end - 89;
  v_prior_start := v_end - 179;
  v_months_start := date_trunc('month', v_end)::date - interval '5 months';

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.date BETWEEN LEAST(v_prior_start, v_months_start::date) AND v_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.page_id AS pid,
           COALESCE(spd.extras->>'page_url', spd.page_id::text) AS purl
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
  ),
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
    WHERE l.purl IS NOT NULL
  ),
  monthly_edu AS (
    SELECT c.purl, date_trunc('month', c.d) AS mo, SUM(c.c) AS mc
    FROM classed c
    WHERE c.cls = 'educational' AND c.d >= v_months_start
    GROUP BY c.purl, date_trunc('month', c.d)
  ),
  consistency AS (
    SELECT me.purl, COUNT(*)::int AS months_active
    FROM monthly_edu me
    WHERE me.mc >= p_month_min_clicks
    GROUP BY me.purl
  ),
  per_page AS (
    SELECT c.purl,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'educational' AND c.d >= v_recent_start), 0)::bigint AS edu_cur,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'educational' AND c.d BETWEEN v_prior_start AND v_recent_start - 1), 0)::bigint AS edu_prior,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'money' AND c.d >= v_recent_start), 0)::bigint AS money_cur,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'money' AND c.d BETWEEN v_prior_start AND v_recent_start - 1), 0)::bigint AS money_prior,
           COALESCE(SUM(c.i) FILTER (WHERE c.cls = 'money' AND c.d >= v_recent_start), 0)::bigint AS money_imps,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls NOT IN ('educational', 'money') AND c.d >= v_recent_start), 0)::bigint AS other_cur
    FROM classed c
    GROUP BY c.purl
  )
  SELECT pp.purl,
         pp.pid,
         pp.edu_cur,
         pp.edu_prior,
         COALESCE(cy.months_active, 0),
         pp.money_cur,
         pp.money_prior,
         pp.money_imps,
         pp.other_cur,
         COUNT(*) OVER ()::bigint
  FROM per_page pp
  LEFT JOIN consistency cy ON cy.purl = pp.purl
  WHERE COALESCE(cy.months_active, 0) >= p_min_months
    AND pp.edu_cur > 0
  ORDER BY pp.edu_cur DESC, pp.purl ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_page_first_dates(p_site_id uuid, p_page_ids uuid[])
 RETURNS TABLE(page_id uuid, url text, first_impression_date date, last_impression_date date, lifetime_clicks bigint, lifetime_impressions bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF COALESCE(array_length(p_page_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'gsc_watch_too_many: max 200 pages';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  agg AS (
    SELECT spd.page_id AS pid,
           MIN(spd.date) FILTER (WHERE spd.impressions > 0) AS first_d,
           MAX(spd.date) FILTER (WHERE spd.impressions > 0) AS last_d,
           SUM(spd.clicks)::bigint AS s_clicks,
           SUM(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.page_id = ANY (p_page_ids)
    GROUP BY spd.page_id
  )
  SELECT u.id,
         COALESCE(wp.url, u.id::text),
         a.first_d,
         a.last_d,
         COALESCE(a.s_clicks, 0)::bigint,
         COALESCE(a.s_imps, 0)::bigint
  FROM (SELECT DISTINCT t.id FROM unnest(p_page_ids) AS t(id)) u
  LEFT JOIN agg a ON a.pid = u.id
  LEFT JOIN web.page wp ON wp.id = u.id
  ORDER BY a.first_d DESC NULLS FIRST, 2 ASC;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_shifts(p_site_id uuid, p_start date, p_end date, p_compare_start date, p_compare_end date, p_min_clicks integer DEFAULT 10, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(query text, keyword_id uuid, traffic_class text, clicks bigint, cmp_clicks bigint, delta_clicks bigint, impressions bigint, cmp_impressions bigint, cur_top_url text, cmp_top_url text, top_changed boolean, shift_share numeric, pages jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_min_clicks < 1 THEN
    RAISE EXCEPTION 'gsc_min_clicks_out_of_range: %', p_min_clicks;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.date BETWEEN LEAST(p_compare_start, p_start) AND GREATEST(p_compare_end, p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid,
           COALESCE(spd.extras->>'page_url', spd.page_id::text) AS purl,
           spd.query AS q
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.query IS NOT NULL
  ),
  per_qp AS (
    SELECT l.q, l.purl,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(l.i) FILTER (WHERE l.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(l.c) FILTER (WHERE l.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(l.i) FILTER (WHERE l.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i,
           COALESCE(SUM(l.c) FILTER (WHERE l.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c
    FROM latest l
    WHERE l.purl IS NOT NULL
    GROUP BY l.q, l.purl
  ),
  q_tot AS (
    SELECT pq.q,
           SUM(pq.cur_i)::bigint AS q_cur_i, SUM(pq.cur_c)::bigint AS q_cur_c,
           SUM(pq.cmp_i)::bigint AS q_cmp_i, SUM(pq.cmp_c)::bigint AS q_cmp_c,
           (array_agg(pq.kid ORDER BY pq.kid) FILTER (WHERE pq.kid IS NOT NULL))[1] AS kid
    FROM per_qp pq
    GROUP BY pq.q
    HAVING GREATEST(SUM(pq.cur_c), SUM(pq.cmp_c)) >= p_min_clicks
      AND SUM(pq.cur_i) > 0 AND SUM(pq.cmp_i) > 0
  ),
  shares AS (
    SELECT pq.q, pq.purl, pq.cur_c, pq.cmp_c, pq.cur_i, pq.cmp_i,
           pq.cur_i::numeric / NULLIF(qt.q_cur_i, 0) AS cur_share,
           pq.cmp_i::numeric / NULLIF(qt.q_cmp_i, 0) AS cmp_share,
           row_number() OVER (PARTITION BY pq.q ORDER BY pq.cur_i DESC, pq.purl ASC) AS cur_rn,
           row_number() OVER (PARTITION BY pq.q ORDER BY pq.cmp_i DESC, pq.purl ASC) AS cmp_rn,
           row_number() OVER (PARTITION BY pq.q ORDER BY GREATEST(pq.cur_i, pq.cmp_i) DESC, pq.purl ASC) AS any_rn
    FROM per_qp pq
    JOIN q_tot qt ON qt.q = pq.q
  ),
  agg AS (
    SELECT s.q,
           SUM(ABS(COALESCE(s.cur_share, 0) - COALESCE(s.cmp_share, 0))) / 2 AS shift,
           (array_agg(s.purl ORDER BY s.cur_rn) FILTER (WHERE s.cur_i > 0))[1] AS cur_top,
           (array_agg(s.purl ORDER BY s.cmp_rn) FILTER (WHERE s.cmp_i > 0))[1] AS cmp_top,
           jsonb_agg(
             jsonb_build_object(
               'url', s.purl,
               'clicks', s.cur_c, 'cmp_clicks', s.cmp_c,
               'share', round(COALESCE(s.cur_share, 0), 4),
               'cmp_share', round(COALESCE(s.cmp_share, 0), 4)
             ) ORDER BY GREATEST(s.cur_i, s.cmp_i) DESC
           ) FILTER (WHERE s.any_rn <= 5) AS pages_json
    FROM shares s
    GROUP BY s.q
  )
  SELECT qt.q,
         qt.kid,
         COALESCE(cm.traffic_class, 'unclassified'),
         qt.q_cur_c,
         qt.q_cmp_c,
         (qt.q_cur_c - qt.q_cmp_c)::bigint,
         qt.q_cur_i,
         qt.q_cmp_i,
         a.cur_top,
         a.cmp_top,
         (a.cur_top IS DISTINCT FROM a.cmp_top),
         round(a.shift, 4),
         COALESCE(a.pages_json, '[]'::jsonb),
         COUNT(*) OVER ()::bigint
  FROM q_tot qt
  JOIN agg a ON a.q = qt.q
  LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = qt.kid
  WHERE a.shift >= 0.15
  ORDER BY a.shift * GREATEST(qt.q_cur_c, qt.q_cmp_c) DESC, qt.q ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_summary(p_site_id uuid, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
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
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
  ),
  cur AS (
    SELECT COALESCE(SUM(l.c), 0)::bigint AS s_clicks,
           COALESCE(SUM(l.i), 0)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l WHERE l.d BETWEEN p_start AND p_end
  ),
  cmp AS (
    SELECT COALESCE(SUM(l.c), 0)::bigint AS s_clicks,
           COALESCE(SUM(l.i), 0)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end
  )
  SELECT cur.s_clicks,
         cur.s_imps,
         CASE WHEN cur.s_imps > 0 THEN round(cur.s_clicks::numeric / cur.s_imps, 6) END,
         CASE WHEN cur.s_pos_imps > 0 THEN round(cur.s_wpos / cur.s_pos_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN cmp.s_clicks END,
         CASE WHEN p_compare_start IS NOT NULL THEN cmp.s_imps END,
         CASE WHEN p_compare_start IS NOT NULL AND cmp.s_imps > 0 THEN round(cmp.s_clicks::numeric / cmp.s_imps, 6) END,
         CASE WHEN p_compare_start IS NOT NULL AND cmp.s_pos_imps > 0 THEN round(cmp.s_wpos / cmp.s_pos_imps, 2) END
  FROM cur, cmp;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_timeseries(p_site_id uuid, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(day date, period text, clicks bigint, impressions bigint, ctr numeric, avg_position numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
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
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.average_position AS pos
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
  )
  SELECT l.d,
         'current'::text,
         COALESCE(SUM(l.c), 0)::bigint,
         COALESCE(SUM(l.i), 0)::bigint,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.c)::numeric / SUM(l.i), 6) END,
         CASE WHEN COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) > 0
              THEN round((SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL)) / (SUM(l.i) FILTER (WHERE l.pos IS NOT NULL)), 2) END
  FROM latest l
  WHERE l.d BETWEEN p_start AND p_end
  GROUP BY l.d
  UNION ALL
  SELECT l.d,
         'compare'::text,
         COALESCE(SUM(l.c), 0)::bigint,
         COALESCE(SUM(l.i), 0)::bigint,
         CASE WHEN SUM(l.i) > 0 THEN round(SUM(l.c)::numeric / SUM(l.i), 6) END,
         CASE WHEN COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) > 0
              THEN round((SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL)) / (SUM(l.i) FILTER (WHERE l.pos IS NOT NULL)), 2) END
  FROM latest l
  WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
    AND l.d BETWEEN p_compare_start AND p_compare_end
  GROUP BY l.d
  ORDER BY 2, 1;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_trend(p_site_id uuid, p_start date, p_end date, p_dimension text DEFAULT 'page'::text, p_direction text DEFAULT 'decay'::text, p_min_clicks integer DEFAULT 20, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, first_half_clicks bigint, second_half_clicks bigint, change_clicks bigint, change_pct numeric, slope_per_week numeric, weeks integer, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text;
  v_half int := (p_end - p_start + 1) / 2;
  v_h1_end date := p_start + (v_half - 1);
  v_h2_start date := p_end - (v_half - 1);
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
  END IF;
  IF p_direction NOT IN ('decay', 'growth') THEN
    RAISE EXCEPTION 'gsc_trend_direction_unknown: %', p_direction;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF p_min_clicks < 1 THEN
    RAISE EXCEPTION 'gsc_min_clicks_out_of_range: %', p_min_clicks;
  END IF;
  IF p_end - p_start < 27 THEN
    RAISE EXCEPTION 'gsc_trend_range_too_short: need at least 28 days, got %', p_end - p_start + 1;
  END IF;
  v_profile := p_dimension;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos, spd.page_id AS pid, spd.keyword_id AS kid,
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
  agg AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           CASE WHEN COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) > 0
                THEN (SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL))
                     / (SUM(l.i) FILTER (WHERE l.pos IS NOT NULL)) END AS w_pos,
           SUM(l.c) FILTER (WHERE l.d <= v_h1_end)::bigint AS h1_clicks,
           SUM(l.c) FILTER (WHERE l.d >= v_h2_start)::bigint AS h2_clicks
    FROM latest l
    WHERE l.k IS NOT NULL
    GROUP BY l.k
    HAVING SUM(l.c) >= p_min_clicks
  ),
  week_span AS (
    SELECT wk::date AS wk,
           row_number() OVER (ORDER BY wk) - 1 AS wi
    FROM generate_series(
      date_trunc('week', p_start::timestamp) + CASE WHEN date_trunc('week', p_start::timestamp)::date < p_start THEN interval '7 days' ELSE interval '0' END,
      date_trunc('week', p_end::timestamp) - CASE WHEN (date_trunc('week', p_end::timestamp)::date + 6) > p_end THEN interval '7 days' ELSE interval '0' END,
      interval '7 days'
    ) AS wk
  ),
  daily AS (
    SELECT l.k, l.d, SUM(l.c)::bigint AS dc
    FROM latest l
    JOIN agg a ON a.k = l.k
    GROUP BY l.k, l.d
  ),
  weekly AS (
    SELECT a.k, ws.wi,
           COALESCE(SUM(dy.dc), 0)::bigint AS wc
    FROM agg a
    CROSS JOIN week_span ws
    LEFT JOIN daily dy ON dy.k = a.k AND dy.d >= ws.wk AND dy.d < ws.wk + 7
    GROUP BY a.k, ws.wi
  ),
  slopes AS (
    SELECT w.k,
           regr_slope(w.wc, w.wi) AS slope,
           COUNT(*)::int AS n_weeks
    FROM weekly w
    GROUP BY w.k
  ),
  scored AS (
    SELECT a.*, s.slope, s.n_weeks,
           COALESCE(a.h2_clicks, 0) - COALESCE(a.h1_clicks, 0) AS chg
    FROM agg a
    LEFT JOIN slopes s ON s.k = a.k
  )
  SELECT sc.k,
         sc.pid,
         sc.kid,
         sc.s_clicks,
         sc.s_imps,
         CASE WHEN sc.s_imps > 0 THEN round(sc.s_clicks::numeric / sc.s_imps, 6) END,
         round(sc.w_pos, 2),
         COALESCE(sc.h1_clicks, 0),
         COALESCE(sc.h2_clicks, 0),
         sc.chg,
         CASE WHEN COALESCE(sc.h1_clicks, 0) > 0
              THEN round(sc.chg::numeric / sc.h1_clicks * 100, 1) END,
         round(sc.slope::numeric, 2),
         sc.n_weeks,
         COUNT(*) OVER ()::bigint
  FROM scored sc
  WHERE CASE WHEN p_direction = 'decay' THEN sc.chg < 0 ELSE sc.chg > 0 END
  ORDER BY
    (CASE WHEN p_direction = 'decay' THEN sc.chg END) ASC NULLS LAST,
    (CASE WHEN p_direction = 'growth' THEN sc.chg END) DESC NULLS LAST,
    sc.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_watch(p_site_id uuid, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_page_ids uuid[] DEFAULT '{}'::uuid[], p_keyword_ids uuid[] DEFAULT '{}'::uuid[])
 RETURNS TABLE(kind text, entity_id uuid, key text, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF COALESCE(array_length(p_page_ids, 1), 0) > 200
     OR COALESCE(array_length(p_keyword_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'gsc_watch_too_many: max 200 pages and 200 queries';
  END IF;

  RETURN QUERY
  WITH pwinner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  plat AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos, spd.page_id AS pid
    FROM seo.search_performance_daily spd
    JOIN pwinner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.page_id = ANY (p_page_ids)
  ),
  pcur AS (
    SELECT l.pid,
           SUM(l.c)::bigint AS s_clicks, SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM plat l WHERE l.d BETWEEN p_start AND p_end GROUP BY l.pid
  ),
  pcmp AS (
    SELECT l.pid,
           SUM(l.c)::bigint AS s_clicks, SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM plat l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end
    GROUP BY l.pid
  ),
  -- DISTINCT anchors: a duplicated id in the input array must not multiply
  -- the metrics (N copies → N join matches per fact row, summed).
  kws AS (
    SELECT u.id, kw.phrase, kw.normalized_phrase
    FROM (SELECT DISTINCT t.id FROM unnest(p_keyword_ids) AS t(id)) u
    LEFT JOIN seo.keyword kw ON kw.id = u.id
  ),
  qwinner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  qlat AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos, spd.keyword_id AS kid,
           seo.fn_normalize_phrase(spd.query) AS nk
    FROM seo.search_performance_daily spd
    JOIN qwinner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.query IS NOT NULL
      AND COALESCE(array_length(p_keyword_ids, 1), 0) > 0
  ),
  qmatch AS (
    SELECT k.id AS wkid, l.d, l.c, l.i, l.pos
    FROM qlat l
    JOIN kws k ON l.kid = k.id
               OR (k.normalized_phrase IS NOT NULL AND l.nk = k.normalized_phrase)
  ),
  qcur AS (
    SELECT m.wkid,
           SUM(m.c)::bigint AS s_clicks, SUM(m.i)::bigint AS s_imps,
           SUM(m.pos * m.i) FILTER (WHERE m.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(m.i) FILTER (WHERE m.pos IS NOT NULL), 0) AS s_pos_imps
    FROM qmatch m WHERE m.d BETWEEN p_start AND p_end GROUP BY m.wkid
  ),
  qcmp AS (
    SELECT m.wkid,
           SUM(m.c)::bigint AS s_clicks, SUM(m.i)::bigint AS s_imps,
           SUM(m.pos * m.i) FILTER (WHERE m.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(m.i) FILTER (WHERE m.pos IS NOT NULL), 0) AS s_pos_imps
    FROM qmatch m
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND m.d BETWEEN p_compare_start AND p_compare_end
    GROUP BY m.wkid
  )
  SELECT 'page'::text,
         u.id,
         COALESCE(wp.url, u.id::text),
         COALESCE(pc.s_clicks, 0)::bigint,
         COALESCE(pc.s_imps, 0)::bigint,
         CASE WHEN COALESCE(pc.s_imps, 0) > 0 THEN round(pc.s_clicks::numeric / pc.s_imps, 6) END,
         CASE WHEN COALESCE(pc.s_pos_imps, 0) > 0 THEN round(pc.s_wpos / pc.s_pos_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(pm.s_clicks, 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(pm.s_imps, 0)::bigint END,
         CASE WHEN COALESCE(pm.s_imps, 0) > 0 THEN round(pm.s_clicks::numeric / pm.s_imps, 6) END,
         CASE WHEN COALESCE(pm.s_pos_imps, 0) > 0 THEN round(pm.s_wpos / pm.s_pos_imps, 2) END
  FROM (SELECT DISTINCT t.id FROM unnest(p_page_ids) AS t(id)) u
  LEFT JOIN pcur pc ON pc.pid = u.id
  LEFT JOIN pcmp pm ON pm.pid = u.id
  LEFT JOIN web.page wp ON wp.id = u.id
  UNION ALL
  SELECT 'query'::text,
         k.id,
         COALESCE(k.phrase, k.id::text),
         COALESCE(qc.s_clicks, 0)::bigint,
         COALESCE(qc.s_imps, 0)::bigint,
         CASE WHEN COALESCE(qc.s_imps, 0) > 0 THEN round(qc.s_clicks::numeric / qc.s_imps, 6) END,
         CASE WHEN COALESCE(qc.s_pos_imps, 0) > 0 THEN round(qc.s_wpos / qc.s_pos_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(qm.s_clicks, 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(qm.s_imps, 0)::bigint END,
         CASE WHEN COALESCE(qm.s_imps, 0) > 0 THEN round(qm.s_clicks::numeric / qm.s_imps, 6) END,
         CASE WHEN COALESCE(qm.s_pos_imps, 0) > 0 THEN round(qm.s_wpos / qm.s_pos_imps, 2) END
  FROM kws k
  LEFT JOIN qcur qc ON qc.wkid = k.id
  LEFT JOIN qcmp qm ON qm.wkid = k.id
  ORDER BY 1, 4 DESC, 3 ASC;
END;
$function$;


-- Lock the whole family away from anon: perf data is org-scoped.
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'seo' AND p.proname LIKE 'gsc_perf%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END;
$do$;

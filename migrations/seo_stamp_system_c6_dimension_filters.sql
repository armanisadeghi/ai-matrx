-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C6 (2026-08-23): DIMENSIONS EVERYWHERE
-- Every Search Console read (summary / timeseries / breakdown) accepts, in
-- p_filters, `stamps` = [{dimension, value}, …] (ALL-OF: the keyword must carry
-- every stamp) and `levels` = [level, …]. Stamps are keyword-level facts, so
-- they resolve to the query / query_page profiles exactly like a query filter
-- (THE ACCURACY CONTRACT holds; country/device/appearance breakdowns cannot
-- carry them and the UI prunes them there). One helper computes the EFFECTIVE
-- stamp set with the same precedence as the resolvers; one small RPC hands the
-- Queries table its Class / Score / Level columns for the rows it is showing.
-- ============================================================================

-- The effective stamp set for a site (the precedence every resolver uses):
-- pinned/confirmed > human/import > site matcher/rule/pack > universal AI.
CREATE OR REPLACE FUNCTION seo.gsc_effective_stamps(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS TABLE(keyword_id uuid, dimension text, dimension_label text, value text, value_label text, value_id uuid, source text, pinned boolean, site_scoped boolean)
LANGUAGE sql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $$
  WITH st AS (
    SELECT kf.keyword_id, cd.slug AS dim_slug, cd.name AS dim_label, cv.parent_id AS dim_id,
           COALESCE(cv.metadata->>'value', split_part(cv.slug,':',2)) AS val, cv.name AS val_label, cv.id AS val_id,
           kf.source, kf.pinned, kf.site_id IS NOT NULL AS site_scoped,
           COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card,
           CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'import' THEN 2 WHEN 'matcher' THEN 3 WHEN 'rule' THEN 3 WHEN 'pack' THEN 3 WHEN 'classifier' THEN 5 ELSE 6 END END
             + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
    FROM seo.keyword_facet kf
    JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
      AND (p_keyword_ids IS NULL OR kf.keyword_id = ANY(p_keyword_ids))
  ),
  ranked AS (SELECT s.*, row_number() OVER (PARTITION BY s.keyword_id, s.dim_id ORDER BY s.prio, s.val_id) AS rn FROM st s)
  SELECT r.keyword_id, r.dim_slug, r.dim_label, r.val, r.val_label, r.val_id, r.source, r.pinned, r.site_scoped
  FROM ranked r WHERE (NOT r.single_card) OR r.rn = 1;
$$;

-- Keywords carrying EVERY requested stamp: p_stamps = [{"dimension":"audience_type","value":"business"}, …]
CREATE OR REPLACE FUNCTION seo.gsc_stamp_keyword_set(p_site_id uuid, p_stamps jsonb)
RETURNS TABLE(kw_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $$
  WITH want AS (
    SELECT DISTINCT NULLIF(btrim(e->>'dimension'),'') AS dim, NULLIF(btrim(e->>'value'),'') AS val
    FROM jsonb_array_elements(COALESCE(p_stamps,'[]'::jsonb)) e
  ),
  want_ok AS (SELECT * FROM want WHERE dim IS NOT NULL AND val IS NOT NULL),
  n AS (SELECT count(*) AS c FROM want_ok),
  have AS (
    SELECT es.keyword_id, es.dimension, es.value
    FROM seo.gsc_effective_stamps(p_site_id, NULL) es
    JOIN want_ok w ON w.dim = es.dimension AND w.val = es.value
  )
  SELECT h.keyword_id FROM have h, n GROUP BY h.keyword_id, n.c HAVING count(DISTINCT h.dimension||':'||h.value) = n.c AND n.c > 0;
$$;

-- Class / Score / Level for exactly the rows a table is showing (SCOPE RULE).
CREATE OR REPLACE FUNCTION seo.gsc_keyword_value_for(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(keyword_id uuid, traffic_class text, class_source text, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids,1) IS NULL THEN RETURN; END IF;
  IF array_length(p_keyword_ids,1) > 2000 THEN RAISE EXCEPTION 'gsc_too_many_keywords: max 2000 per call'; END IF;
  RETURN QUERY
  SELECT vm.keyword_id, cm.traffic_class, cm.class_source, vm.value_score, vm.value_band, vm.value_source, vm.reasons
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) vm
  LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = vm.keyword_id;
END;
$$;
REVOKE ALL ON FUNCTION seo.gsc_keyword_value_for(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_value_for(uuid, uuid[]) TO authenticated, service_role;

-- Profile resolution: stamps/levels are keyword-level → behave like a query filter.
CREATE OR REPLACE FUNCTION seo.gsc_perf_resolve_profile(p_dimension text, p_filters jsonb)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  has_q boolean := COALESCE(NULLIF(btrim(p_filters->>'query_contains'), ''), NULLIF(btrim(p_filters->>'query_eq'), ''), NULLIF(btrim(p_filters->>'query_neq'), '')) IS NOT NULL
                   OR (jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0)
                   OR (jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0);
  has_p boolean := COALESCE(NULLIF(btrim(p_filters->>'page_contains'), ''), NULLIF(btrim(p_filters->>'page_eq'), '')) IS NOT NULL;
  has_cd boolean := COALESCE(NULLIF(btrim(p_filters->>'country'), ''), NULLIF(btrim(p_filters->>'device'), '')) IS NOT NULL;
  has_sa boolean := NULLIF(btrim(p_filters->>'search_appearance'), '') IS NOT NULL;
BEGIN
  IF p_dimension IS NULL THEN
    IF has_sa AND NOT (has_q OR has_p OR has_cd) THEN RETURN 'search_appearance'; END IF;
    IF has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: search_appearance cannot combine with other filters'; END IF;
    IF has_cd AND NOT (has_q OR has_p) THEN RETURN 'country_device'; END IF;
    IF has_cd THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: country/device cannot combine with query/page/dimension filters'; END IF;
    IF has_q AND has_p THEN RETURN 'query_page'; END IF;
    IF has_q THEN RETURN 'query'; END IF;
    IF has_p THEN RETURN 'page'; END IF;
    RETURN 'property';
  ELSIF p_dimension = 'query' THEN
    IF has_cd OR has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: query breakdown supports only query/page/dimension filters'; END IF;
    RETURN CASE WHEN has_p THEN 'query_page' ELSE 'query' END;
  ELSIF p_dimension = 'page' THEN
    IF has_cd OR has_sa THEN RAISE EXCEPTION 'gsc_filter_combination_unsupported: page breakdown supports only query/page/dimension filters'; END IF;
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
  -- C6: dimension stamps (all-of) and levels — THE SPREADSHEET FILTERS (P9)
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
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
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start) AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = ANY(f_lv)))
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
  -- C6: dimension stamps (all-of) and levels — THE SPREADSHEET FILTERS (P9)
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
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
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start) AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = ANY(f_lv)))
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
  -- C6: dimension stamps (all-of) and levels — THE SPREADSHEET FILTERS (P9)
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
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
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start) AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = ANY(f_lv)))
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

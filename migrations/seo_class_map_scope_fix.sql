-- ============================================================================
-- THE SCOPE RULE, again — and this time it cost the Insights page (2026-08-23).
--
-- `seo.gsc_keyword_class_map(site)` resolves EVERY keyword in the global
-- 196k-row corpus and hands the result to whoever joins it. On the `page`
-- dimension with a class pin, `gsc_perf_class_movers` joins that against the
-- `query_page` profile (955k rows for one site): measured **10,234 ms**, past
-- the `authenticated` role's 8 s statement timeout — a 500 that the Insights
-- assists producer reported as "we couldn't reach your Search Console
-- insights", and that a reader sees as an empty panel.
--
-- Same fix as `keyword_value_map` got: the resolver takes the keyword set its
-- caller is about to reason over. The parameter is OPTIONAL, so all eleven
-- existing consumers keep working unchanged; the heavy one passes its window.
--
-- A new caller that forgets does not fail loudly — it slows down. If you add
-- one, pass the ids.
-- ============================================================================

-- The single-argument function must GO, not linger: adding a defaulted second
-- parameter creates a SECOND function, and every existing one-argument call
-- then fails with "function is not unique". Found the moment this was applied.
DROP FUNCTION IF EXISTS seo.gsc_keyword_class_map(uuid);

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
 RETURNS TABLE(keyword_id uuid, traffic_class text, class_source text)
 LANGUAGE sql STABLE
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  WITH dim AS (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL),
  -- `= ANY(array)` against the 196k corpus plans as a scan per element
  -- (measured 4.1 s for 5,860 ids). Unnesting lets Postgres hash-join instead.
  scope AS MATERIALIZED (
    SELECT kw.id FROM seo.keyword kw
    WHERE p_keyword_ids IS NULL AND kw.deleted_at IS NULL
    UNION ALL
    SELECT kw.id FROM unnest(p_keyword_ids) AS want(id)
    JOIN seo.keyword kw ON kw.id = want.id AND kw.deleted_at IS NULL
    WHERE p_keyword_ids IS NOT NULL
  ),
  st AS (
    SELECT kf.keyword_id, COALESCE(cv.metadata->>'value', split_part(cv.slug,':',2)) AS cls, kf.source, kf.site_id, kf.pinned, kf.matcher_id,
           CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'import' THEN 2 WHEN 'rule' THEN 3 WHEN 'matcher' THEN 3 WHEN 'pack' THEN 3 ELSE 5 END END
             + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
    FROM seo.keyword_facet kf
    JOIN scope s ON s.id = kf.keyword_id
    JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL AND cv.parent_id = (SELECT id FROM dim)
    WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
  ),
  best AS (
    SELECT DISTINCT ON (s.keyword_id) s.* FROM st s ORDER BY s.keyword_id, s.prio, s.site_id NULLS LAST
  )
  SELECT sc.id,
         CASE WHEN b.cls IS NULL OR b.cls = 'not_clear' THEN 'unclassified' ELSE b.cls END,
         CASE
           WHEN b.cls IS NULL OR b.cls = 'not_clear' THEN 'none'
           WHEN b.site_id IS NOT NULL AND (b.pinned OR b.source IN ('human','import')) THEN 'site_value'
           WHEN b.source = 'matcher' AND EXISTS (SELECT 1 FROM seo.dimension_value_matcher dm WHERE dm.id = b.matcher_id AND (dm.kind = 'brand_identity' OR dm.notes = 'brand alias')) THEN 'brand_match'
           WHEN b.source IN ('matcher','rule','pack') THEN 'site_value'
           WHEN b.source = 'classifier' THEN 'intent_class'
           ELSE 'none'
         END
  FROM scope sc
  LEFT JOIN best b ON b.keyword_id = sc.id;
$function$;

-- The proven-slow caller now passes its window (and materializes it once).
CREATE OR REPLACE FUNCTION seo.gsc_perf_class_movers(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date, p_compare_end date, p_class text DEFAULT NULL::text, p_direction text DEFAULT 'loss'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, traffic_class text, value_band text, clicks bigint, impressions bigint, cmp_clicks bigint, cmp_impressions bigint, delta_clicks bigint, delta_impressions bigint, class_mix jsonb, total_count bigint)
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

  IF jsonb_typeof(COALESCE(p_filters, '{}'::jsonb) -> 'levels') = 'array' THEN
    SELECT array_agg(t.value) INTO v_levels
    FROM jsonb_array_elements_text(p_filters -> 'levels') AS t(value)
    WHERE t.value IS NOT NULL AND btrim(t.value) <> '';
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
  -- THE SCOPE RULE: the class map resolves this window, not the 196k corpus.
  -- (Pushing the class pin INTO this CTE and inner-joining was tried and
  --  REVERTED: it collapses the planner's estimate to ~5 rows, and the
  --  unfiltered page view went 889 ms -> over 45 s. Measured, not guessed.)
  classes AS MATERIALIZED (
    SELECT * FROM seo.gsc_keyword_class_map(p_site_id, v_ids)
  ),
  classed AS (
    SELECT l.*,
           COALESCE(cm.traffic_class, 'unclassified') AS cls,
           COALESCE(vm.value_band, 'unvalued') AS bnd
    FROM latest l
    LEFT JOIN classes cm ON cm.keyword_id = l.kid
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
    SELECT b.k, b.cls, SUM(b.cur_c)::bigint AS cur_c, SUM(b.cmp_c)::bigint AS cmp_c
    FROM bucketed b GROUP BY b.k, b.cls
  ),
  dom_band AS (
    SELECT DISTINCT ON (b.k) b.k, b.bnd
    FROM (SELECT b2.k, b2.bnd, SUM(b2.cur_c) AS cur_c, SUM(b2.cmp_c) AS cmp_c FROM bucketed b2 GROUP BY b2.k, b2.bnd) b
    ORDER BY b.k, b.cur_c DESC, b.cmp_c DESC, b.bnd ASC
  ),
  rolled AS (
    SELECT b.k,
           (array_agg(b.pid ORDER BY b.pid) FILTER (WHERE b.pid IS NOT NULL))[1] AS pid,
           (array_agg(b.kid ORDER BY b.kid) FILTER (WHERE b.kid IS NOT NULL))[1] AS kid,
           (array_agg(b.cls ORDER BY b.cur_c DESC, b.cmp_c DESC, b.cls ASC))[1] AS dom_cls,
           SUM(b.cur_c)::bigint AS cur_c, SUM(b.cur_i)::bigint AS cur_i,
           SUM(b.cmp_c)::bigint AS cmp_c, SUM(b.cmp_i)::bigint AS cmp_i
    FROM bucketed b GROUP BY b.k
  ),
  mixed AS (
    SELECT bc.k, jsonb_object_agg(bc.cls, jsonb_build_object('clicks', bc.cur_c, 'cmp_clicks', bc.cmp_c))
             FILTER (WHERE bc.cur_c > 0 OR bc.cmp_c > 0) AS mix
    FROM by_class bc GROUP BY bc.k
  ),
  moved AS (
    SELECT r.*, db.bnd AS dom_bnd, m.mix, (r.cur_c - r.cmp_c) AS d_c, (r.cur_i - r.cmp_i) AS d_i
    FROM rolled r
    LEFT JOIN dom_band db ON db.k = r.k
    LEFT JOIN mixed m ON m.k = r.k
    WHERE r.cur_c > 0 OR r.cmp_c > 0 OR r.cur_i > 0 OR r.cmp_i > 0
  )
  SELECT m.k, m.pid, m.kid, m.dom_cls, COALESCE(m.dom_bnd, 'unvalued'),
         m.cur_c, m.cur_i, m.cmp_c, m.cmp_i, m.d_c::bigint, m.d_i::bigint,
         COALESCE(m.mix, '{}'::jsonb), COUNT(*) OVER ()::bigint
  FROM moved m
  WHERE CASE WHEN p_direction = 'gain'
             THEN m.d_c > 0 OR (m.d_c = 0 AND m.d_i > 0)
             ELSE m.d_c < 0 OR (m.d_c = 0 AND m.d_i < 0) END
  ORDER BY
    (CASE WHEN p_direction = 'gain' THEN m.d_c END) DESC NULLS LAST,
    (CASE WHEN p_direction = 'loss' THEN m.d_c END) ASC NULLS LAST,
    ABS(m.d_i) DESC, m.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

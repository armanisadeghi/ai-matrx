-- Search Console INSIGHT algorithms — SECURITY INVOKER RPCs over
-- seo.search_performance_daily (provider='gsc'). These are the "custom
-- algorithm" layer beyond threshold dig rules: each computes something a
-- single-row condition cannot (a site-relative CTR curve, cross-page
-- competition, a time trend).
--
-- Every function composes THE ACCURACY CONTRACT from seo_gsc_perf_rpcs.sql:
-- winning-run dedup per (profile, date) chosen BEFORE any filtering,
-- CTR = SUM(clicks)/SUM(impressions), position weighted only over rows WITH
-- a position. Never re-implement these client-side.
--
-- 1) gsc_perf_ctr_gap — "you rank, but nobody clicks".
--    Builds the site's OWN expected-CTR-by-position curve from the period's
--    data (position bucket = round(weighted avg position), capped 1..20),
--    then reports keys whose actual CTR sits below the curve, with
--    missed_clicks = (expected - actual) * impressions. Site-relative on
--    purpose: a global CTR table lies for branded profiles; the site's
--    other keys at the same position are the honest benchmark. The
--    benchmark is LEAVE-ONE-OUT — the scored key's own clicks/impressions
--    are excluded from its expected CTR (a bucket-dominating branded key
--    would otherwise drag the benchmark toward itself and hide its own
--    gap), and a bucket needs >= 5 OTHER keys to be trusted.
--
-- 2) gsc_perf_cannibalization — queries where >= 2 pages split the traffic.
--    query_page profile. A page "competes" when it holds >= p_min_share of
--    the query's impressions. top_share is the strongest page's share of
--    clicks (impressions when the query has no clicks); lower = worse split.
--    pages carries the top 5 competing pages as jsonb for drill-down.
--
-- 3) gsc_perf_trend — sustained decay/growth per key. Splits the period into
--    two EQUAL-LENGTH halves (primary signal: half2 vs half1 clicks; an odd
--    day count excludes the middle day from BOTH halves — giving the extra
--    day to half1 made perfectly flat traffic read as a decliner) and fits a
--    linear slope over FULL zero-filled ISO weeks (secondary signal; partial
--    edge weeks are excluded, and weeks with no rows count as ZERO clicks —
--    GSC emits no row for a quiet day, and skipping empty weeks would hide
--    exactly the decay this exists to find). p_direction 'decay' returns
--    losers sorted by absolute clicks lost, 'growth' the mirror.

CREATE OR REPLACE FUNCTION seo.gsc_perf_ctr_gap(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_dimension text DEFAULT 'query',
  p_min_impressions int DEFAULT 100,
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
  position_bucket int,
  expected_ctr numeric,
  ctr_gap numeric,
  missed_clicks bigint,
  bucket_keys bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text;
BEGIN
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
  -- Leave-one-out: the key's own traffic is excluded from its benchmark,
  -- and the bucket must still hold >= 5 OTHER keys with impressions left.
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
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_cannibalization(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_min_impressions int DEFAULT 100,
  p_min_share numeric DEFAULT 0.2,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  query text,
  keyword_id uuid,
  clicks bigint,
  impressions bigint,
  avg_position numeric,
  competing_pages int,
  top_share numeric,
  pages jsonb,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
BEGIN
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
    -- pos_wsum/pos_imps carried separately so the query-level position stays
    -- a SINGLE-PASS weighted average over rows WITH a position — re-weighting
    -- each page's w_pos by its TOTAL impressions (position-less rows
    -- included) skews toward pages with sparse position data.
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
$$;

CREATE OR REPLACE FUNCTION seo.gsc_perf_trend(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_dimension text DEFAULT 'page',
  p_direction text DEFAULT 'decay',
  p_min_clicks int DEFAULT 20,
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
  first_half_clicks bigint,
  second_half_clicks bigint,
  change_clicks bigint,
  change_pct numeric,
  slope_per_week numeric,
  weeks int,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text;
  -- EQUAL halves: each spans v_half days; an odd day count leaves the middle
  -- day in NEITHER half (h1 taking the extra day made flat traffic read as
  -- a ~-7% decliner on a 29-day custom range).
  v_half int := (p_end - p_start + 1) / 2;
  v_h1_end date := p_start + (v_half - 1);
  v_h2_start date := p_end - (v_half - 1);
BEGIN
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
  -- Full ISO weeks only (Mon..Sun fully inside the range); zero-fill weeks
  -- with no facts so silence counts as zero, not as absence.
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
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_perf_ctr_gap(uuid, date, date, text, int, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_cannibalization(uuid, date, date, int, numeric, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_trend(uuid, date, date, text, text, int, int, int) TO authenticated;

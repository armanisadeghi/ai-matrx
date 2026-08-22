-- Applied 2026-08-22 via Supabase MCP.
--
-- /marketing/sites was spending ~2.5s (5.5s cold) in web.v_site_kpis, virtually
-- all of it inside seo.gsc_perf_site_portfolio (one LATERAL call per site). The
-- cost was NOT the 28-day summary (the 'property' profile is only ~4k rows) — it
-- was the unbounded all-history `pages_in_gsc` count(DISTINCT page_id) over the
-- 'page' profile: 1.31M rows, ~110k buffers and a temp-file sort per page load,
-- to produce a number that only ever ranges 110..3,800.
--
-- Fix, with IDENTICAL semantics (still all-history distinct pages, still gated by
-- the FIRST-statement seo.gsc_assert_site_access contract, still one row out):
--   1. A narrow partial index (site_id, page_id) covering exactly that predicate,
--      created CONCURRENTLY out-of-band (hot table) — the statement below is the
--      idempotent record of it.
--   2. Replace the count(DISTINCT ...) with a loose index scan (recursive
--      index-skip): one index descent per DISTINCT page instead of a full walk
--      plus sort of every row.
--
-- Measured as the real owning identity (set local role authenticated + jwt sub),
-- warm cache:
--   worst single site (926,667 rows / 3,800 distinct pages): 184ms / 50,760 buffers
--                                                         ->  25ms / 13,545 buffers
--   full view, 13 sites: see the migration-board note.

CREATE INDEX IF NOT EXISTS idx_seo_sperf_gsc_page_ids
  ON seo.search_performance_daily (site_id, page_id)
  WHERE provider = 'gsc' AND dimension_profile = 'page' AND page_id IS NOT NULL;

CREATE OR REPLACE FUNCTION seo.gsc_perf_site_portfolio(p_site_id uuid, p_days integer DEFAULT 28)
 RETURNS TABLE(pages_in_gsc bigint, clicks bigint, impressions bigint, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, current_days bigint, compare_days bigint, latest_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_latest date;
  v_current_start date;
  v_compare_start date;
  v_compare_end date;
BEGIN
  -- FIRST statement by contract: this function bypasses fact-table RLS for
  -- performance, so access is asserted once before any row is read.
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_days < 1 OR p_days > 488 THEN
    RAISE EXCEPTION 'gsc_portfolio_days_out_of_range: %', p_days;
  END IF;

  SELECT max(spd.date)
  INTO v_latest
  FROM seo.search_performance_daily AS spd
  WHERE spd.provider = 'gsc'
    AND spd.site_id = p_site_id
    AND spd.dimension_profile = 'property';

  IF v_latest IS NULL THEN
    RETURN QUERY
    SELECT
      0::bigint,
      NULL::bigint,
      NULL::bigint,
      NULL::numeric,
      NULL::bigint,
      NULL::bigint,
      0::bigint,
      0::bigint,
      NULL::date;
    RETURN;
  END IF;

  v_current_start := v_latest - (p_days - 1);
  v_compare_end := v_current_start - 1;
  v_compare_start := v_compare_end - (p_days - 1);

  RETURN QUERY
  WITH RECURSIVE summary AS (
    SELECT s.*
    FROM seo.gsc_perf_summary(
      p_site_id,
      v_current_start,
      v_latest,
      v_compare_start,
      v_compare_end,
      '{}'::jsonb
    ) AS s
  ),
  coverage AS (
    SELECT
      count(DISTINCT spd.date) FILTER (
        WHERE spd.date BETWEEN v_current_start AND v_latest
      )::bigint AS current_days,
      count(DISTINCT spd.date) FILTER (
        WHERE spd.date BETWEEN v_compare_start AND v_compare_end
      )::bigint AS compare_days
    FROM seo.search_performance_daily AS spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'property'
      AND spd.date BETWEEN v_compare_start AND v_latest
  ),
  -- Loose index scan (index skip) over idx_seo_sperf_gsc_page_ids: one descent
  -- per distinct page_id, instead of walking + sorting every 'page'-profile row.
  page_ids AS (
    (
      SELECT spd.page_id
      FROM seo.search_performance_daily AS spd
      WHERE spd.provider = 'gsc'
        AND spd.site_id = p_site_id
        AND spd.dimension_profile = 'page'
        AND spd.page_id IS NOT NULL
      ORDER BY spd.page_id
      LIMIT 1
    )
    UNION ALL
    SELECT (
      SELECT spd.page_id
      FROM seo.search_performance_daily AS spd
      WHERE spd.provider = 'gsc'
        AND spd.site_id = p_site_id
        AND spd.dimension_profile = 'page'
        AND spd.page_id > page_ids.page_id
      ORDER BY spd.page_id
      LIMIT 1
    )
    FROM page_ids
    WHERE page_ids.page_id IS NOT NULL
  ),
  pages AS (
    SELECT count(*)::bigint AS pages_in_gsc
    FROM page_ids
    WHERE page_ids.page_id IS NOT NULL
  )
  SELECT
    pages.pages_in_gsc,
    summary.clicks,
    summary.impressions,
    summary.avg_position,
    summary.cmp_clicks,
    summary.cmp_impressions,
    coverage.current_days,
    coverage.compare_days,
    v_latest
  FROM summary
  CROSS JOIN coverage
  CROSS JOIN pages;
END;
$function$;

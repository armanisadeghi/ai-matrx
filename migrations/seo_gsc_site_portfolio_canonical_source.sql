-- Search Console portfolio truth comes from the SAME canonical ingestion spine
-- as the per-site dashboard. The old web.v_site_kpis view read
-- web.gsc_page_stat, a retired scraper-fed table whose last rows stopped on
-- 2026-07-26 while seo.search_performance_daily continued updating nightly.
-- That made every portfolio card report stale data even though opening the
-- site showed current data.
--
-- Accuracy is inherited from seo.gsc_perf_summary: property-profile totals,
-- winning-run dedup, weighted position, and per-site access assertion. Each
-- site's rolling window ends on ITS freshest available GSC day, exactly like
-- the detailed dashboard, so trailing provider lag never fakes a decline.

BEGIN;

CREATE OR REPLACE FUNCTION seo.gsc_perf_site_portfolio(
  p_site_id uuid,
  p_days integer DEFAULT 28
)
RETURNS TABLE (
  pages_in_gsc bigint,
  clicks bigint,
  impressions bigint,
  avg_position numeric,
  cmp_clicks bigint,
  cmp_impressions bigint,
  current_days bigint,
  compare_days bigint,
  latest_date date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
  WITH summary AS (
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
  pages AS (
    SELECT count(DISTINCT spd.page_id)::bigint AS pages_in_gsc
    FROM seo.search_performance_daily AS spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.page_id IS NOT NULL
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

REVOKE ALL ON FUNCTION seo.gsc_perf_site_portfolio(uuid, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_site_portfolio(uuid, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION seo.gsc_perf_site_portfolio(uuid, integer) IS
  'Canonical per-site Search Console portfolio KPIs. Uses the freshest property-profile day and delegates metric accuracy to seo.gsc_perf_summary.';

CREATE OR REPLACE VIEW web.v_site_kpis
WITH (security_invoker = true)
AS
WITH page_rollup AS (
  SELECT
    p.site_id,
    count(*) FILTER (
      WHERE p.content_type_last IS NULL
         OR p.content_type_last = 'html'
    ) AS page_count,
    count(*) FILTER (
      WHERE p.content_type_last IS NOT NULL
        AND p.content_type_last <> 'html'
    ) AS resource_count
  FROM web.page AS p
  WHERE p.deleted_at IS NULL
  GROUP BY p.site_id
)
SELECT
  site.id AS site_id,
  COALESCE(pr.page_count, 0::bigint) AS page_count,
  COALESCE(gsc.pages_in_gsc, 0::bigint) AS pages_in_gsc,
  gsc.clicks AS gsc_clicks_28d,
  gsc.impressions AS gsc_impressions_28d,
  gsc.avg_position AS gsc_position_28d,
  gsc.cmp_clicks AS gsc_clicks_prev_28d,
  gsc.cmp_impressions AS gsc_impressions_prev_28d,
  COALESCE(gsc.current_days, 0::bigint) AS gsc_cur_days,
  COALESCE(gsc.compare_days, 0::bigint) AS gsc_prev_days,
  gsc.latest_date AS gsc_latest_date,
  COALESCE(pr.resource_count, 0::bigint) AS resource_count
FROM web.site AS site
LEFT JOIN page_rollup AS pr ON pr.site_id = site.id
LEFT JOIN LATERAL seo.gsc_perf_site_portfolio(site.id, 28) AS gsc ON true
WHERE site.deleted_at IS NULL;

GRANT SELECT ON web.v_site_kpis TO authenticated, service_role;

COMMIT;

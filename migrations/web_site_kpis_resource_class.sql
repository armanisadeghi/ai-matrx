-- Site-portfolio KPIs: `page_count` must count PAGES, not crawled resources.
--
-- Companion to web_page_list_live_site_and_resource_class.sql. That migration
-- fixed the per-site projection; this one fixes the portfolio rollup behind
-- `/marketing/sites`, which counted raw `web.page` rows.
--
-- The distortion is not marginal. cosmeticinjectables.com showed 685 "pages";
-- 360 of them are images the crawler recorded and 325 are real pages — the
-- headline number was more than half wrong.
--
-- Resources are not dropped from the registry (a sitemap listing non-HTML URLs
-- is a finding, and 103 of the 597 live resource rows are sitemap/GSC-declared
-- rather than crawl-discovered). They move to their own column so the count is
-- honest and still reachable, matching `.../pages?scope=resources`.
--
-- ONE classification rule, mirrored in web.v_page_list.is_resource and
-- features/marketing/lib/page-content-class.ts. NULL content_type_last means
-- "not fetched yet", so it counts as a page.
--
-- The outer `site.deleted_at IS NULL` already handled the orphan-site defect
-- here, so this view needs no live-site join.

BEGIN;

CREATE OR REPLACE VIEW web.v_site_kpis AS
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
),
gsc_rollup AS (
  SELECT
    s.site_id,
    count(DISTINCT s.page_id) AS pages_in_gsc,
    count(*) FILTER (WHERE s.date >= current_date - 28) AS cur_rows,
    sum(s.clicks) FILTER (WHERE s.date >= current_date - 28) AS clicks_28d,
    sum(s.impressions) FILTER (WHERE s.date >= current_date - 28) AS impressions_28d,
    sum(s.position * greatest(s.impressions, 1)) FILTER (
      WHERE s.date >= current_date - 28 AND s.position IS NOT NULL
    ) / NULLIF(
      sum(greatest(s.impressions, 1)) FILTER (
        WHERE s.date >= current_date - 28 AND s.position IS NOT NULL
      ),
      0
    ) AS position_28d,
    count(*) FILTER (
      WHERE s.date >= current_date - 56 AND s.date < current_date - 28
    ) AS prev_rows,
    count(DISTINCT s.date) FILTER (WHERE s.date >= current_date - 28) AS cur_days,
    count(DISTINCT s.date) FILTER (
      WHERE s.date >= current_date - 56 AND s.date < current_date - 28
    ) AS prev_days,
    sum(s.clicks) FILTER (
      WHERE s.date >= current_date - 56 AND s.date < current_date - 28
    ) AS clicks_prev_28d,
    sum(s.impressions) FILTER (
      WHERE s.date >= current_date - 56 AND s.date < current_date - 28
    ) AS impressions_prev_28d,
    max(s.date) AS gsc_latest_date
  FROM web.gsc_page_stat AS s
  WHERE s.deleted_at IS NULL
  GROUP BY s.site_id
)
SELECT
  site.id AS site_id,
  COALESCE(pr.page_count, 0::bigint) AS page_count,
  COALESCE(g.pages_in_gsc, 0::bigint) AS pages_in_gsc,
  CASE WHEN g.cur_rows > 0 THEN g.clicks_28d ELSE NULL::bigint END AS gsc_clicks_28d,
  CASE WHEN g.cur_rows > 0 THEN g.impressions_28d ELSE NULL::bigint END AS gsc_impressions_28d,
  CASE WHEN g.cur_rows > 0 THEN g.position_28d ELSE NULL::numeric END AS gsc_position_28d,
  CASE WHEN g.prev_rows > 0 THEN g.clicks_prev_28d ELSE NULL::bigint END AS gsc_clicks_prev_28d,
  CASE WHEN g.prev_rows > 0 THEN g.impressions_prev_28d ELSE NULL::bigint END AS gsc_impressions_prev_28d,
  COALESCE(g.cur_days, 0::bigint) AS gsc_cur_days,
  COALESCE(g.prev_days, 0::bigint) AS gsc_prev_days,
  g.gsc_latest_date,
  -- Appended, not inserted: CREATE OR REPLACE VIEW cannot renumber existing
  -- columns, and dropping this view would drop its dependents.
  COALESCE(pr.resource_count, 0::bigint) AS resource_count
FROM web.site AS site
LEFT JOIN page_rollup AS pr ON pr.site_id = site.id
LEFT JOIN gsc_rollup AS g ON g.site_id = site.id
WHERE site.deleted_at IS NULL;

COMMIT;

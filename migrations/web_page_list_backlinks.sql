-- Extend the Marketing pages-list projection with per-page backlink counts
-- from the latest stored DataForSEO domain_pages_summary snapshot.

BEGIN;

DROP VIEW IF EXISTS web.v_page_list;

CREATE VIEW web.v_page_list
WITH (security_invoker = true)
AS
WITH sitemap_rollup AS (
  SELECT
    membership.site_id,
    membership.page_id,
    count(*) AS sitemap_count
  FROM web.page_sitemap AS membership
  WHERE membership.deleted_at IS NULL
  GROUP BY membership.site_id, membership.page_id
),
gsc_rollup AS (
  SELECT
    stat.site_id,
    stat.page_id,
    true AS in_gsc,
    count(*) FILTER (
      WHERE stat.date >= current_date - 28
    ) AS recent_stat_count,
    sum(stat.clicks) FILTER (
      WHERE stat.date >= current_date - 28
    ) AS gsc_clicks_28d,
    sum(stat.impressions) FILTER (
      WHERE stat.date >= current_date - 28
    ) AS gsc_impressions_28d,
    sum(stat.position * greatest(stat.impressions, 1)) FILTER (
      WHERE stat.date >= current_date - 28
        AND stat.position IS NOT NULL
    ) / NULLIF(
      sum(greatest(stat.impressions, 1)) FILTER (
        WHERE stat.date >= current_date - 28
          AND stat.position IS NOT NULL
      ),
      0
    ) AS gsc_position_28d
  FROM web.gsc_page_stat AS stat
  WHERE stat.deleted_at IS NULL
  GROUP BY stat.site_id, stat.page_id
),
latest_backlink_pages AS (
  SELECT DISTINCT ON (snap.site_id)
    snap.site_id,
    snap.id AS snapshot_id
  FROM seo.backlink_snapshot AS snap
  WHERE snap.dataset = 'domain_pages_summary'
  ORDER BY snap.site_id, snap.created_at DESC
),
backlink_page_rollup AS (
  SELECT
    dim.site_id,
    lower(
      rtrim(coalesce(dim.url, dim.dimension_key), '/')
    ) AS target_url_norm,
    max(dim.backlinks) AS backlink_count,
    max(dim.referring_domains) AS backlink_referring_domains
  FROM seo.backlink_dimension_snapshot AS dim
  INNER JOIN latest_backlink_pages AS latest
    ON latest.site_id = dim.site_id
   AND latest.snapshot_id = dim.snapshot_id
  WHERE dim.dimension_kind = 'target_page'
  GROUP BY dim.site_id, lower(rtrim(coalesce(dim.url, dim.dimension_key), '/'))
),
page_projection AS (
  SELECT
    page.id AS page_id,
    page.site_id,
    page.url,
    page.path,
    page.status,
    page.provenance,
    page.http_status_last,
    page.target_keyword,
    page.first_seen,
    page.last_seen,
    page.latest_snapshot_id,
    COALESCE(sitemap.sitemap_count, 0::bigint) AS sitemap_count,
    COALESCE(gsc.in_gsc, false) AS in_gsc,
    NULLIF(btrim(snapshot.head_tags ->> 'title'), '') AS observed_title,
    snapshot.word_count,
    CASE
      WHEN snapshot.seo_metrics ->> 'v' = '1'
        THEN (snapshot.seo_metrics ->> 'overall_ok')::boolean
      ELSE NULL
    END AS serp_ok,
    CASE
      WHEN snapshot.audit_metrics ->> 'v' = '1'
        THEN (snapshot.audit_metrics #>> '{social,ok}')::boolean
      ELSE NULL
    END AS social_ok,
    CASE
      WHEN snapshot.audit_metrics ->> 'v' = '1'
        THEN snapshot.audit_metrics #>> '{indexability,verdict}'
      ELSE NULL
    END AS indexability_verdict,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_clicks_28d
      ELSE NULL
    END AS gsc_clicks_28d,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_impressions_28d
      ELSE NULL
    END AS gsc_impressions_28d,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_position_28d
      ELSE NULL
    END AS gsc_position_28d,
    backlink.backlink_count,
    backlink.backlink_referring_domains
  FROM web.page AS page
  LEFT JOIN sitemap_rollup AS sitemap
    ON sitemap.site_id = page.site_id
   AND sitemap.page_id = page.id
  LEFT JOIN gsc_rollup AS gsc
    ON gsc.site_id = page.site_id
   AND gsc.page_id = page.id
  LEFT JOIN web.snapshot AS snapshot
    ON snapshot.site_id = page.site_id
   AND snapshot.id = page.latest_snapshot_id
   AND snapshot.deleted_at IS NULL
  LEFT JOIN backlink_page_rollup AS backlink
    ON backlink.site_id = page.site_id
   AND backlink.target_url_norm = lower(rtrim(page.url, '/'))
  WHERE page.deleted_at IS NULL
)
SELECT
  projection.*,
  CASE
    WHEN projection.serp_ok IS NULL
      AND projection.social_ok IS NULL
      AND projection.indexability_verdict IS NULL
      THEN NULL
    ELSE
      (projection.serp_ok IS TRUE)::integer
      + (projection.social_ok IS TRUE)::integer
      + (projection.indexability_verdict = 'indexable')::integer
  END AS health_score
FROM page_projection AS projection;

COMMENT ON VIEW web.v_page_list IS
  'RLS-preserving page-list projection: canonical page identity plus latest snapshot, sitemap membership, rolling 28-day GSC metrics, and per-page backlink counts from the latest domain_pages_summary snapshot for global table filtering, sorting, and pagination.';

REVOKE ALL PRIVILEGES ON TABLE web.v_page_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE web.v_page_list TO authenticated, service_role;

COMMIT;

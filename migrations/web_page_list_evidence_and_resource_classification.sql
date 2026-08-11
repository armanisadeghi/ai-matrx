-- APPLIED to Matrx Main (txzxabzwovsujtloxrus) 2026-08-11. Record, not mechanism.\n-- Evidence-backed page accounting plus the canonical URL-shape resource classifier.\n-- Supersedes both earlier v_page_list definitions so release ordering cannot drop either rule.
--
-- web.page is a durable observed-URL registry, not a claim that every row is a
-- current HTML page. Keep that audit trail while exposing the two missing
-- classifications needed by every user-facing page count:
--
--   is_canonical      — aliases never count as additional pages.
--   has_page_evidence — a retained snapshot, sitemap membership, GSC row, or
--                       a person's manual assertion backs the URL as a page.
--
-- These columns are intentionally independent of is_resource. Unknown response
-- type is not a resource; an unconfirmed crawl candidate is reported separately.

BEGIN;

CREATE OR REPLACE VIEW web.v_page_list
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
    lower(rtrim(COALESCE(dim.url, dim.dimension_key), '/')) AS target_url_norm,
    max(dim.backlinks) AS backlink_count,
    max(dim.referring_domains) AS backlink_referring_domains
  FROM seo.backlink_dimension_snapshot AS dim
  JOIN latest_backlink_pages AS latest
    ON latest.site_id = dim.site_id
   AND latest.snapshot_id = dim.snapshot_id
  WHERE dim.dimension_kind = 'target_page'
  GROUP BY dim.site_id, lower(rtrim(COALESCE(dim.url, dim.dimension_key), '/'))
),
page_projection AS (
  SELECT
    page.id AS page_id,
    page.canonical_page_id,
    page.site_id,
    page.url,
    page.path,
    page.status,
    page.provenance,
    page.http_status_last,
    page.content_type_last,
    (
      (page.content_type_last IS NOT NULL
        AND page.content_type_last <> 'html')
      OR web.is_machine_resource_url(page.url)
    ) AS is_resource,
    page.target_keyword,
    page.first_seen,
    page.last_seen,
    page.latest_snapshot_id,
    COALESCE(sitemap.sitemap_count, 0::bigint) AS sitemap_count,
    COALESCE(gsc.in_gsc, false) AS in_gsc,
    NULLIF(btrim(snapshot.head_tags ->> 'title'), '') AS observed_title,
    snapshot.word_count,
    CASE
      WHEN (snapshot.seo_metrics ->> 'v') = '1'
        THEN (snapshot.seo_metrics ->> 'overall_ok')::boolean
      ELSE NULL::boolean
    END AS serp_ok,
    CASE
      WHEN (snapshot.audit_metrics ->> 'v') = '1'
        THEN (snapshot.audit_metrics #>> '{social,ok}')::boolean
      ELSE NULL::boolean
    END AS social_ok,
    CASE
      WHEN (snapshot.audit_metrics ->> 'v') = '1'
        THEN snapshot.audit_metrics #>> '{indexability,verdict}'
      ELSE NULL::text
    END AS indexability_verdict,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_clicks_28d
      ELSE NULL::bigint
    END AS gsc_clicks_28d,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_impressions_28d
      ELSE NULL::bigint
    END AS gsc_impressions_28d,
    CASE
      WHEN gsc.recent_stat_count > 0 THEN gsc.gsc_position_28d
      ELSE NULL::numeric
    END AS gsc_position_28d,
    backlink.backlink_count,
    backlink.backlink_referring_domains
  FROM web.page AS page
  JOIN web.site AS site
    ON site.id = page.site_id
   AND site.deleted_at IS NULL
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
  page_id,
  site_id,
  url,
  path,
  status,
  provenance,
  http_status_last,
  content_type_last,
  is_resource,
  target_keyword,
  first_seen,
  last_seen,
  latest_snapshot_id,
  sitemap_count,
  in_gsc,
  observed_title,
  word_count,
  serp_ok,
  social_ok,
  indexability_verdict,
  gsc_clicks_28d,
  gsc_impressions_28d,
  gsc_position_28d,
  backlink_count,
  backlink_referring_domains,
  CASE
    WHEN serp_ok IS NULL AND social_ok IS NULL AND indexability_verdict IS NULL
      THEN NULL::integer
    ELSE (serp_ok IS TRUE)::integer
       + (social_ok IS TRUE)::integer
       + (indexability_verdict = 'indexable')::integer
  END AS health_score,
  canonical_page_id = page_id AS is_canonical,
  (
    latest_snapshot_id IS NOT NULL
    OR sitemap_count > 0
    OR in_gsc
    OR provenance = 'manual'
  ) AS has_page_evidence
FROM page_projection AS projection;

COMMENT ON VIEW web.v_page_list IS
  'RLS-invoker page-registry projection. User-facing pages require is_canonical AND NOT is_resource AND has_page_evidence; other rows remain auditable candidates/resources.';

REVOKE ALL PRIVILEGES ON TABLE web.v_page_list FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE web.v_page_list TO authenticated, service_role;

COMMIT;

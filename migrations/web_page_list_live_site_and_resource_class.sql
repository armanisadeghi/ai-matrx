-- Marketing pages-list projection: scope to LIVE sites, and expose the
-- crawler's page-vs-resource verdict.
--
-- TWO data-integrity defects, both fixed here at the read layer.
--
-- 1. ORPHAN PAGES OF SOFT-DELETED SITES.
--    Soft-deleting a `web.site` cascades to its `web.property(kind='website')`
--    row (`web.site_cascade_website_property`) but NOT to its pages, so 817 live
--    `web.page` rows belonged to deleted sites. Every one of the 810 "duplicate
--    URL" groups in the registry was exactly this: one live page on a live site,
--    one orphan on a deleted one. There are ZERO same-site duplicates —
--    `page_site_id_url_hash_key` (UNIQUE (site_id, url_hash)) has always held,
--    and the scraper upserts through it. Nothing about the write path is broken.
--
--    Fixed by JOINing live sites here rather than by cascading `deleted_at` onto
--    the pages. That is deliberate: `web.page` carries `_gc_assoc_softdelete`,
--    which HARD-deletes every `platform.associations` edge on soft-delete. A
--    cascade would irreversibly destroy page↔keyword / page↔task / page↔note
--    edges, and restoring the site could not bring them back. This join costs
--    nothing, touches no rows, and makes a site restore instantly correct.
--
-- 2. RESOURCES COUNTED AS PAGES.
--    Crawls record every fetched URL in the anchor registry, including 365
--    images, 69 json, 48 xml, 110 other, plus pdf/txt/md — 597 of 10,608 live
--    pages (5.6%), inflating every page count and page list.
--
--    They are NOT deleted and NOT moved to a second table: `web.page` is the
--    anchor registry and source-coverage disagreement is the intelligence layer
--    ("your sitemap lists 99 non-HTML URLs" is a finding, not noise), and 103 of
--    them are sitemap/GSC-declared rather than crawl-discovered. A resources
--    table would also fork the registry that snapshot / crawl_url / link_edge
--    already point at. So: FLAG here, segment in the UI — the same call already
--    ratified for the site audit rollup on 2026-07-27.
--
--    Verified safe to segment: ZERO non-HTML rows carry any authored intent
--    (target_keyword / meta_*_desired / non-empty desired_values).
--
--    `is_resource` is false for NULL `content_type_last` — that means "not yet
--    fetched" (8,515 live rows), not "not a page".
--
-- TS mirror of the same rule: features/marketing/lib/page-content-class.ts.

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
    page.site_id,
    page.url,
    page.path,
    page.status,
    page.provenance,
    page.http_status_last,
    page.content_type_last,
    -- The crawler's own response verdict. NULL = not yet fetched, never a resource.
    (page.content_type_last IS NOT NULL
      AND page.content_type_last <> 'html') AS is_resource,
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
  -- Defect 1: a page whose SITE is soft-deleted is not part of any workspace.
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
  END AS health_score
FROM page_projection AS projection;

GRANT SELECT ON web.v_page_list TO authenticated;

COMMIT;

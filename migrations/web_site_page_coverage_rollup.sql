-- APPLIED to Matrx Main (txzxabzwovsujtloxrus) 2026-08-14. Record, not mechanism.
--
-- Coverage used to issue sixteen concurrent exact-count HEAD requests against
-- web.v_page_list. On a 4,540-row site the authenticated 8-second statement
-- timeout cancelled 15 requests, then React Query retried the whole fan-out
-- and cancelled 14 more. This function computes the same matrix in one
-- materialized, RLS-preserving view scan.

CREATE OR REPLACE FUNCTION web.site_page_coverage(p_site_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  WITH page_rows AS MATERIALIZED (
    SELECT
      latest_snapshot_id,
      sitemap_count,
      in_gsc,
      provenance,
      is_resource,
      has_page_evidence
    FROM web.v_page_list
    WHERE site_id = p_site_id
      AND is_canonical = true
  ),
  counts AS (
    SELECT
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true) AS total_pages,
      count(*) FILTER (WHERE is_resource = false) AS known_page_urls,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = false) AS unconfirmed_candidates,
      count(*) FILTER (WHERE is_resource = true) AS resource_urls,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND sitemap_count > 0) AS in_sitemaps,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND latest_snapshot_id IS NOT NULL) AS crawled,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND latest_snapshot_id IS NULL) AS never_crawled,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND sitemap_count > 0 AND latest_snapshot_id IS NULL) AS sitemap_not_crawled,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND sitemap_count = 0 AND latest_snapshot_id IS NOT NULL) AS crawled_no_sitemap,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND in_gsc = true) AS in_gsc,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND in_gsc = true AND sitemap_count = 0) AS gsc_no_sitemap,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND sitemap_count > 0 AND in_gsc = false) AS sitemap_no_gsc,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND provenance = 'sitemap') AS provenance_sitemap,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND provenance = 'crawl') AS provenance_crawl,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND provenance = 'gsc') AS provenance_gsc,
      count(*) FILTER (WHERE is_resource = false AND has_page_evidence = true AND provenance = 'manual') AS provenance_manual
    FROM page_rows
  )
  SELECT jsonb_build_object(
    'totalPages', total_pages,
    'knownPageUrls', known_page_urls,
    'unconfirmedCandidates', unconfirmed_candidates,
    'resourceUrls', resource_urls,
    'inSitemaps', in_sitemaps,
    'crawled', crawled,
    'neverCrawled', never_crawled,
    'sitemapNotCrawled', sitemap_not_crawled,
    'crawledNoSitemap', crawled_no_sitemap,
    'inGsc', in_gsc,
    'gscNoSitemap', gsc_no_sitemap,
    'sitemapNoGsc', sitemap_no_gsc,
    'byProvenance', jsonb_build_object(
      'sitemap', provenance_sitemap,
      'crawl', provenance_crawl,
      'gsc', provenance_gsc,
      'manual', provenance_manual
    )
  )
  FROM counts
$function$;

REVOKE ALL ON FUNCTION web.site_page_coverage(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION web.site_page_coverage(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION web.site_page_coverage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION web.site_page_coverage(uuid) TO service_role;

COMMENT ON FUNCTION web.site_page_coverage(uuid) IS
  'Returns the complete page-source coverage matrix for one site in a single RLS-preserving v_page_list scan.';

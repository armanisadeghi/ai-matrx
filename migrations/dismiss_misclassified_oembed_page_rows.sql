-- One-time repair for the pre-2026-08-08 crawler bug that promoted
-- WordPress oEmbed resource alternates into web.page identities.
--
-- Preserve the immutable crawl/snapshot ledger; dismiss only page-registry
-- rows that have no sitemap, GSC, or authored intent evidence. A later real
-- observation can still revive a dismissed row through the canonical path.

WITH repair_candidates AS (
  SELECT page.id
  FROM web.page AS page
  JOIN web.site AS site
    ON site.id = page.site_id
   AND site.deleted_at IS NULL
  WHERE page.deleted_at IS NULL
    AND page.provenance = 'crawl'
    AND page.url LIKE '%/wp-json/oembed/1.0/embed%'
    AND page.target_keyword IS NULL
    AND COALESCE(page.desired_values, '{}'::jsonb) = '{}'::jsonb
    AND NOT EXISTS (
      SELECT 1
      FROM web.page_sitemap AS membership
      WHERE membership.page_id = page.id
        AND membership.deleted_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM web.gsc_page_stat AS stat
      WHERE stat.page_id = page.id
        AND stat.deleted_at IS NULL
    )
)
UPDATE web.page AS page
SET
  deleted_at = now(),
  metadata = jsonb_set(
    COALESCE(page.metadata, '{}'::jsonb),
    '{registry_repair_oembed_promotion}',
    jsonb_build_object(
      'repaired_at', now(),
      'reason',
      'historical crawler promoted WordPress oEmbed resource alternates into page identities'
    ),
    true
  )
FROM repair_candidates AS candidate
WHERE page.id = candidate.id;


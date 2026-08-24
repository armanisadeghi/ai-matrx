-- ============================================================================
-- KI-050 — keyword_topic.organization_id ENCODES THE LADDER TIER (2026-08-24)
--
-- P30 (Arman): every opinion resolves site → brand → organization → system,
-- nearest wins. On seo.keyword_topic the org column says WHICH tier a
-- placement is: system-tier rows (agent/backfill) carry the Matrx System org;
-- a site's own human ruling carries the site's org.
--
-- Found while fixing the run-console org block: an aidream write path stamped
-- 942 human rulings with the request-envelope org (the operator's CRM org)
-- instead of the ruled site's org. Agent rows were already correct.
--
-- Repair: a human row whose keyword has GSC demand on exactly ONE site gets
-- that site's org. Keywords with demand on several sites are AMBIGUOUS and are
-- left untouched — a repair that guesses is worse than the defect.
-- ============================================================================
WITH demand AS (
  SELECT spd.keyword_id, s.id AS site_id, s.organization_id
  FROM seo.search_performance_daily spd
  JOIN web.site s ON s.id = spd.site_id
  WHERE spd.keyword_id IS NOT NULL
  GROUP BY spd.keyword_id, s.id, s.organization_id
),
single_site AS (
  SELECT keyword_id, min(organization_id::text)::uuid AS organization_id
  FROM demand GROUP BY keyword_id HAVING count(*) = 1
)
UPDATE seo.keyword_topic kt
SET organization_id = ss.organization_id, updated_at = now()
FROM single_site ss
WHERE kt.keyword_id = ss.keyword_id
  AND kt.deleted_at IS NULL
  AND kt.assigned_by = 'human'
  AND kt.organization_id = '5dc930e9-bd65-44a1-8369-af773f6e1a5b'  -- the envelope-stamped CRM org only
  AND kt.organization_id IS DISTINCT FROM ss.organization_id;

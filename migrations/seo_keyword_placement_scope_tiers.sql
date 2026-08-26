-- KI-050 / P30: nearest-wins keyword placement resolution.
-- seo.keyword_topic.organization_id today encodes only two effective tiers
-- (Matrx System org = platform default, a site's own org = a human ruling).
-- This adds the missing brand/organization rungs and a resolver that walks
-- site -> brand -> organization -> system, nearest wins, per Arman:
-- "What datadestruction.com thinks shredding is depends on if they have a
-- setting for it. If they don't, it goes up to the brand... the
-- organization... and if it's not there, then it's the one we've decided
-- as a system."
--
-- No new table: brand/org are derived from web.site (brand_id,
-- organization_id) lineage; scope_site_id/scope_brand_id are added directly
-- to seo.keyword_topic (mirrors how seo.engine_schedule already carries its
-- own site_id/scope_organization_id columns for its 3-tier resolver).
-- Idempotent: safe to run twice.

-- 1. Add the scope columns.
ALTER TABLE seo.keyword_topic
  ADD COLUMN IF NOT EXISTS scope_tier text,
  ADD COLUMN IF NOT EXISTS scope_site_id uuid REFERENCES web.site(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS scope_brand_id uuid REFERENCES web.brand(id) ON DELETE CASCADE;

-- 2. Backfill existing rows. Today organization_id alone already
-- discriminates the two tiers that exist: the Matrx System org is the
-- platform default (system tier); any other org is an org-wide human
-- ruling (organization tier) -- it is never safe to guess a specific site
-- for legacy rows, since several orgs already own more than one site.
UPDATE seo.keyword_topic
   SET scope_tier = CASE
                       WHEN organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
                         THEN 'system'
                       ELSE 'organization'
                     END
 WHERE scope_tier IS NULL;

-- 3. Lock the column down.
ALTER TABLE seo.keyword_topic
  ALTER COLUMN scope_tier SET NOT NULL;

ALTER TABLE seo.keyword_topic
  DROP CONSTRAINT IF EXISTS keyword_topic_scope_tier_check;
ALTER TABLE seo.keyword_topic
  ADD CONSTRAINT keyword_topic_scope_tier_check
  CHECK (scope_tier IN ('site', 'brand', 'organization', 'system'));

ALTER TABLE seo.keyword_topic
  DROP CONSTRAINT IF EXISTS keyword_topic_scope_consistency_check;
ALTER TABLE seo.keyword_topic
  ADD CONSTRAINT keyword_topic_scope_consistency_check
  CHECK (
    (scope_tier = 'site' AND scope_site_id IS NOT NULL AND scope_brand_id IS NULL)
    OR (scope_tier = 'brand' AND scope_brand_id IS NOT NULL AND scope_site_id IS NULL)
    OR (scope_tier IN ('organization', 'system') AND scope_site_id IS NULL AND scope_brand_id IS NULL)
  );

-- 4. Support indexes -- keyword_id = ANY(...) is already covered by the
-- existing (keyword_id, topic_id) unique index and the is_primary partial
-- index; these cover the tier-specific equality checks the resolver adds.
CREATE INDEX IF NOT EXISTS idx_keyword_topic_scope_site
  ON seo.keyword_topic (scope_site_id)
  WHERE scope_site_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_keyword_topic_scope_brand
  ON seo.keyword_topic (scope_brand_id)
  WHERE scope_brand_id IS NOT NULL;

-- 5. The resolver. Mirrors seo.engine_schedule_resolve's shape: candidates
-- bounded to the requested keyword ids (THE SCOPE RULE -- never scans the
-- 196k-row corpus), nearest scope tier wins, deterministic tie-break inside
-- a tier (is_primary, then newest, then id).
CREATE OR REPLACE FUNCTION seo.keyword_placement_resolve(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(
  keyword_id uuid,
  topic_id uuid,
  scope_tier text,
  organization_id uuid,
  confidence smallint,
  assigned_by text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $function$
DECLARE
  v_site_id uuid;
  v_brand_id uuid;
  v_org_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  -- THE SCOPE RULE. Ask for the rows you are rendering, never the corpus.
  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'seo_too_many_keywords: up to 2,000 keywords per read — ask for the page you are showing.';
  END IF;

  SELECT s.id, s.brand_id, s.organization_id
    INTO v_site_id, v_brand_id, v_org_id
    FROM web.site s
   WHERE s.id = p_site_id
     AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT kt.keyword_id, kt.topic_id, kt.scope_tier, kt.organization_id,
           kt.confidence, kt.assigned_by, kt.is_primary, kt.updated_at, kt.id
      FROM seo.keyword_topic kt
     WHERE kt.keyword_id = ANY (p_keyword_ids)
       AND kt.deleted_at IS NULL
       AND (
            (kt.scope_tier = 'site' AND kt.scope_site_id = v_site_id)
         OR (kt.scope_tier = 'brand' AND v_brand_id IS NOT NULL AND kt.scope_brand_id = v_brand_id)
         OR (kt.scope_tier = 'organization' AND kt.organization_id = v_org_id)
         OR (kt.scope_tier = 'system')
       )
  )
  SELECT k.kid,
         w.topic_id,
         w.scope_tier,
         w.organization_id,
         w.confidence,
         w.assigned_by
    FROM unnest(p_keyword_ids) AS k(kid)
    LEFT JOIN LATERAL (
      SELECT c.*
        FROM candidates c
       WHERE c.keyword_id = k.kid
       -- Nearest wins: site < brand < organization < system. A lower tier
       -- is never overwritten from above -- a site row always beats an
       -- organization/system row for that same keyword.
       ORDER BY CASE c.scope_tier
                  WHEN 'site' THEN 0
                  WHEN 'brand' THEN 1
                  WHEN 'organization' THEN 2
                  ELSE 3
                END,
                c.is_primary DESC,
                c.updated_at DESC,
                c.id
       LIMIT 1
    ) w ON true;
END;
$function$;

REVOKE ALL ON FUNCTION seo.keyword_placement_resolve(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.keyword_placement_resolve(uuid, uuid[]) TO authenticated;

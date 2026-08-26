-- ============================================================================
-- THE LADDER NEEDS ONE PRIMARY *PER TIER*, NOT ONE PER KEYWORD (2026-08-25)
--
-- KI-050 added `scope_tier` / `scope_site_id` / `scope_brand_id` so a placement
-- opinion could resolve site → brand → organization → system (P30, Arman:
-- "What datadestruction.com thinks shredding is depends on if they have a
-- setting for it. If they don't, it goes up to the brand… the organization…").
--
-- But `uq_keyword_primary_topic` is UNIQUE (keyword_id) WHERE is_primary — ONE
-- primary placement per keyword for the whole platform. That forbids the exact
-- thing the tiers exist for: a site cannot hold its own answer while the system
-- still holds the default it is overriding. Inserting a site opinion over a
-- system one raised `duplicate key value violates unique constraint`, so the
-- four rungs could only ever be demonstrated by MOVING one row between tiers —
-- which is not an override, it is an edit.
--
-- Uniqueness therefore becomes per tier-scope: one primary answer per keyword
-- per SITE, per BRAND, per ORGANIZATION, and one platform default. Higher tiers
-- keep their answer while a lower tier overrides it, which is what makes the
-- P30a diff ("the source changed — take it or keep yours") possible at all:
-- both versions have to exist to be diffed.
--
-- Safe by construction: today at most one primary row exists per keyword, so
-- every new index is satisfied by current data. New indexes are created and
-- verified BEFORE the old one is dropped.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_primary_system
  ON seo.keyword_topic (keyword_id)
  WHERE is_primary AND scope_tier = 'system' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_primary_org
  ON seo.keyword_topic (keyword_id, organization_id)
  WHERE is_primary AND scope_tier = 'organization' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_primary_brand
  ON seo.keyword_topic (keyword_id, scope_brand_id)
  WHERE is_primary AND scope_tier = 'brand' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_keyword_primary_site
  ON seo.keyword_topic (keyword_id, scope_site_id)
  WHERE is_primary AND scope_tier = 'site' AND deleted_at IS NULL;

DROP INDEX IF EXISTS seo.uq_keyword_primary_topic;

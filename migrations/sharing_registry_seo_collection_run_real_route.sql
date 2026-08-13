-- sharing_registry_seo_collection_run_real_route.sql
--
-- `seo_collection_run.url_path_template` pointed at `/marketing/seo/collections/{id}`
-- — a route that has never existed, so every signed-in grantee of a shared AI
-- visibility report ("Open in AI Matrx" from /s/[token], share modal links,
-- org-share review cards) landed on a 404.
--
-- The real in-app destination is the new standalone resolver route
-- `/marketing/ai-visibility/runs/{id}` (single RLS read of seo.collection_run,
-- renders the AI visibility report for any permitted grantee — no brand/site
-- access required). TS mirror updated in the same change
-- (utils/permissions/registry.ts + registry.db-snapshot.json).
--
-- Idempotent: re-running matches the same row and sets the same value.

UPDATE platform.shareable_resource_registry
SET
    url_path_template = '/marketing/ai-visibility/runs/{id}',
    updated_at        = now()
WHERE resource_type = 'seo_collection_run';

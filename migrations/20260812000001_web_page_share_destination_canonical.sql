-- Applied live to Matrx Main on 2026-08-12.
-- The canonical page short-link already exists and should be the registry door.

UPDATE platform.shareable_resource_registry
SET url_path_template = '/marketing/pages/{id}',
    updated_at = now()
WHERE resource_type = 'web_page'
  AND url_path_template = '';

COMMENT ON COLUMN platform.shareable_resource_registry.url_path_template IS
  'Optional in-app destination template. Empty means no dedicated signed-in route; no-login share links always use /s/[token].';

-- Applied live to Matrx Main on 2026-08-12.
-- Empty is the honest value when an entity has no signed-in destination.

UPDATE platform.shareable_resource_registry
SET url_path_template = '',
    updated_at = now()
WHERE url_path_template ILIKE '%fake%';

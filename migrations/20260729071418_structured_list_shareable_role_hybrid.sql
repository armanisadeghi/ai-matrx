-- structured_list_shareable_role_hybrid.sql
-- Keep the legacy sharing registry semantically correct until it is folded
-- into platform.entity_types and retired.

UPDATE platform.shareable_resource_registry
SET content_role = 'hybrid'
WHERE resource_type = 'structured_list'
  AND content_role IS DISTINCT FROM 'hybrid';

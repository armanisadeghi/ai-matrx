-- register_data_store_shareable.sql
--
-- Clears the Relationship Manager drift "conveying_container_not_shareable"
-- for file→data_store (library_member). The reachability cascade needs the
-- container type registered so the diagnostic knows the cascade can start;
-- without this row, Relationship Manager screams even though library grants
-- (rag.data_store_grants) already convey via iam.has_access.
--
-- Grant model stays ownership-asymmetric:
--   READ  → rag.data_store_grants (DataStorePublishPanel), NOT iam.permissions
--   WRITE → data-store ownership / org membership
-- So: rls_uses_has_permission=false, is_link_shareable=false.
-- Do NOT wire ShareButton / useSharing for data_store — publish UI is separate.
--
-- Idempotent.

INSERT INTO platform.shareable_resource_registry (
  resource_type,
  schema_name,
  table_name,
  id_column,
  owner_column,
  is_public_column,
  display_label,
  url_path_template,
  rls_uses_has_permission,
  is_active,
  notes,
  content_role,
  is_scopeable,
  is_link_shareable
)
VALUES (
  'data_store',
  'rag',
  'data_stores',
  'id',
  'created_by',
  'visibility',
  'Data Store',
  '/rag/data-stores/{id}',
  false,
  true,
  'Reachability cascade container for Shared Knowledge (file→data_store). Registered so Relationship Manager knows the container is grantable. READ grants live in rag.data_store_grants (DataStorePublishPanel) — do NOT route through ShareModal / iam.permissions. 2026-07-11',
  'container',
  false,
  false
)
ON CONFLICT (resource_type) DO UPDATE
SET schema_name = EXCLUDED.schema_name,
    table_name = EXCLUDED.table_name,
    id_column = EXCLUDED.id_column,
    owner_column = EXCLUDED.owner_column,
    is_public_column = EXCLUDED.is_public_column,
    display_label = EXCLUDED.display_label,
    url_path_template = EXCLUDED.url_path_template,
    rls_uses_has_permission = EXCLUDED.rls_uses_has_permission,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes,
    content_role = EXCLUDED.content_role,
    is_scopeable = EXCLUDED.is_scopeable,
    is_link_shareable = EXCLUDED.is_link_shareable,
    updated_at = now();

-- permissions_legacy_resource_type_backfill.sql
-- ============================================================================
-- Pre-2026-reorg grants stored `iam.permissions.resource_type` as the physical
-- table name (`notes`); canonical grants store the entity TOKEN (`note`). The
-- token/table split fix (registry reconciliation) made `iam.permissions`
-- filters key on the token, so these legacy rows would silently vanish from
-- "shared with me" / org-shared lists. Backfill them to the canonical token.
-- Idempotent (a re-run matches nothing).
-- ============================================================================

UPDATE iam.permissions p
SET resource_type = r.resource_type
FROM platform.shareable_resource_registry r
WHERE r.is_active
  AND r.table_name = p.resource_type
  AND r.resource_type <> p.resource_type
  AND NOT EXISTS (
    SELECT 1 FROM platform.shareable_resource_registry r2
    WHERE r2.resource_type = p.resource_type
  );

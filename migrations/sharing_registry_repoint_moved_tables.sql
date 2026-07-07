-- sharing_registry_repoint_moved_tables.sql
-- ============================================================================
-- Follow-up to sharing_registry_canonical_owner_column_fix.sql.
--
-- That migration's rule C deactivated any registry row whose physical table no
-- longer existed at its declared `schema_name`. Adversarial review found 5 of
-- those rows point at tables that were MOVED to a new schema, not dropped — so
-- deactivating them (rather than re-pointing) left the registry out of line
-- with the live tables AND with the FE mirror (`utils/permissions/registry.ts`),
-- which already knows the new schemas.
--
-- Re-point `schema_name` to the live schema, set `owner_column`/`is_public_column`
-- to columns that physically exist (owner matches the FE mirror; none of these
-- tables carries a boolean is_public), and reactivate. All 5 are legacy
-- `rls_uses_has_permission=false` rows, so a permission grant is inert for
-- access — this is registry-hygiene alignment, not a new sharing capability.
--
-- (prompt/prompt_actions → graveyard, wf_definition → gone were correctly
-- deactivated and are intentionally left inactive.)
--
-- Idempotent; safe to re-apply.
-- ============================================================================

UPDATE platform.shareable_resource_registry
SET schema_name='pdf', owner_column='user_id', is_public_column=NULL, is_active=true
WHERE resource_type='pdf_redaction_audits';

UPDATE platform.shareable_resource_registry
SET schema_name='pdf', owner_column='owner_id', is_public_column=NULL, is_active=true
WHERE resource_type='redaction_mapping';

UPDATE platform.shareable_resource_registry
SET schema_name='rag', owner_column='user_id', is_public_column=NULL, is_active=true
WHERE resource_type='scope_association_suggestion';

UPDATE platform.shareable_resource_registry
SET schema_name='rag', owner_column='user_id', is_public_column=NULL, is_active=true
WHERE resource_type='scope_item_value_suggestion';

UPDATE platform.shareable_resource_registry
SET schema_name='users', owner_column='user_id', is_public_column=NULL, is_active=true
WHERE resource_type='user_analysis_preferences';

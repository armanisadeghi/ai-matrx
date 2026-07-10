-- migrations/p7_fix_learn_doc_registry_is_public_column.sql
--
-- D38 fix (KNOWN_DEFECTS.md): the `learn_doc` row in
-- platform.shareable_resource_registry declares `is_public_column='visibility'`,
-- but education.learn_doc's `visibility` is the canonical platform.visibility
-- ENUM, not a legacy boolean flag column. Same defect class as the shipped
-- `assessment` bug (see p7_fix_assessment_registry_is_public_column.sql):
-- `usesVisibilityEnum()` derives enum handling from `isPublicColumn == null`,
-- so with 'visibility' set, learn_doc is treated as a boolean-flag table —
-- getResourceVisibility reads the enum as a truthy string and
-- make_resource_public/private would write a boolean into the enum column.
-- Latent today (Study Guides don't expose the ShareModal public toggle) but
-- wrong at the source of truth.
--
-- Fix: null out is_public_column, matching every other visibility-enum table.
-- learn_doc is super-admin authored; no entity_types registration is needed
-- for its read path (public pages query it directly), but registering it
-- would be harmless — deliberately NOT done here to keep this the minimal
-- recorded D38 fix.
--
-- Idempotent: safe to re-run.

update platform.shareable_resource_registry
set is_public_column = null
where resource_type = 'learn_doc'
  and is_public_column = 'visibility';

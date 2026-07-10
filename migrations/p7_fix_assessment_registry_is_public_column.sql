-- migrations/p7_fix_assessment_registry_is_public_column.sql
--
-- P7 adversarial-review fix: the `assessment` row in
-- platform.shareable_resource_registry was registered (2026-07-07, P1's
-- assessment-engine commit) with `is_public_column = 'visibility'`. That
-- column is a `platform.visibility` ENUM, not a boolean — but
-- `get_resource_access()` treats a non-null `is_public_column` as a boolean
-- flag column and runs `COALESCE(%I, false)` on it, which is a Postgres type
-- error (`COALESCE types platform.visibility and boolean cannot be matched`).
-- The exception handler in get_resource_access() swallows this and returns
-- `{level:'none', is_owner:false, exists:false}` for EVERY caller, including
-- the resource's own owner — so `useAccess('assessment', id)` in
-- AssessmentDetail/AssessmentEdit always reports "no access", locking every
-- quiz/practice-test owner out of editing their own assessment (shown a
-- "view-only, make a copy" notice on a resource they created).
--
-- Fix: null out is_public_column (matching the `fc_set`/`note` entity
-- pattern — visibility-enum tables are NOT boolean-column tables) and
-- register `assessment` in platform.entity_types so get_resource_access's
-- entity branch (iam.has_access + visibility-enum public check) applies,
-- exactly like fc_set. RLS on education.assessment already uses
-- iam.has_access() (see std_select/std_update policies), so this also makes
-- the UX-layer primitive agree with the actual RLS boundary it mirrors.
--
-- Idempotent: safe to re-run.

update platform.shareable_resource_registry
set is_public_column = null
where resource_type = 'assessment'
  and is_public_column = 'visibility';

insert into platform.entity_types (token, schema_name, table_name, label, is_component)
select 'assessment', 'education', 'assessment', 'Assessment', false
where not exists (
  select 1 from platform.entity_types where token = 'assessment'
);

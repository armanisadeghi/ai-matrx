-- A kind definition is org platform data, never one person's private row.
-- visibility='personal' locks the kind to the single account that created it:
-- every other member, including org admins and super admins, resolves to
-- viewer through iam.has_access_for and is refused every edit. That stranded
-- 5 agent-created kinds on 2026-07-25 (seo_meta_tags et al.), which were
-- backfilled to 'internal' alongside this constraint.
alter table content_ir.kind_definition
  drop constraint if exists kind_definition_no_personal_visibility;
alter table content_ir.kind_definition
  add constraint kind_definition_no_personal_visibility
  check (visibility <> 'personal'::platform.visibility);

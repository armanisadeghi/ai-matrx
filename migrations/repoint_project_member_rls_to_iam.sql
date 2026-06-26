-- repoint_project_member_rls_to_iam.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- After the cutover, project-membership edits flow ONLY to iam.memberships
-- (inv_accept / mbr_add / mbr_set_role / mbr_remove); the legacy
-- ctx_project_members table no longer receives non-owner adds, role changes, or
-- removals. Every RLS policy that still subqueries ctx_project_members would
-- therefore authorize off STALE data (a new project member would be denied
-- access; a removed member would keep it). This repoints all 13 such policies on
-- LIVE tables onto iam.memberships.
--
-- RLS expressions evaluate as the INVOKING user, who has no grant on
-- iam.memberships (canonical design — clients reach it only via mbr_* RPCs). So
-- the policies go through a SECURITY DEFINER helper that can read it.
-- Idempotent. (Policies ON the legacy tables themselves — ctx_task_comments,
-- ctx_task_assignments — are intentionally left; they drop with their table.)

create or replace function iam.user_container_ids(p_container_type text, p_role_filter text[] default null)
returns setof uuid
language sql stable security definer set search_path to 'public' as $fn$
  select m.container_id from iam.memberships m
   where m.container_type = p_container_type and m.user_id = auth.uid() and m.deleted_at is null
     and (p_role_filter is null or m.role = any(p_role_filter));
$fn$;
revoke all on function iam.user_container_ids(text, text[]) from public;
grant execute on function iam.user_container_ids(text, text[]) to authenticated;

-- ctx_tasks
alter policy tasks_delete on public.ctx_tasks using (
  (user_id = auth.uid())
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid ))
  OR has_permission('ctx_tasks'::text, id, 'admin'::permission_level));

alter policy tasks_select on public.ctx_tasks using (
  (user_id = auth.uid()) OR (assignee_id = auth.uid())
  OR (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid ))
  OR (project_id IN ( SELECT p.id FROM (ctx_projects p JOIN organization_members om ON ((om.organization_id = p.organization_id))) WHERE (om.user_id = auth.uid())))
  OR has_permission('ctx_tasks'::text, id, 'viewer'::permission_level));

alter policy tasks_update on public.ctx_tasks using (
  (user_id = auth.uid()) OR (assignee_id = auth.uid())
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid ))
  OR has_permission('ctx_tasks'::text, id, 'editor'::permission_level));

-- cx_conversation
alter policy cx_conv_select on public.cx_conversation using (
  (user_id = auth.uid())
  OR (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )));

-- skl_categories
alter policy skl_cat_select on public.skl_categories using (
  (((user_id IS NULL) AND (organization_id IS NULL) AND (project_id IS NULL) AND (task_id IS NULL)))
  OR (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )))
  OR ((task_id IS NOT NULL) AND (task_id IN ( SELECT ctx_tasks.id FROM ctx_tasks WHERE ((ctx_tasks.user_id = auth.uid()) OR (ctx_tasks.assignee_id = auth.uid()))))));

-- skl_definitions
alter policy skl_defs_insert on public.skl_definitions with check (
  (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid ))));

alter policy skl_defs_select on public.skl_definitions using (
  (is_public = true) OR (is_system = true)
  OR ((user_id IS NULL) AND (organization_id IS NULL) AND (project_id IS NULL) AND (task_id IS NULL))
  OR (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )))
  OR ((task_id IS NOT NULL) AND (task_id IN ( SELECT ctx_tasks.id FROM ctx_tasks WHERE ((ctx_tasks.user_id = auth.uid()) OR (ctx_tasks.assignee_id = auth.uid()))))));

alter policy skl_defs_update on public.skl_definitions
using (
  (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid ))))
with check (
  (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE ((organization_members.user_id = auth.uid()) AND (organization_members.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid ))));

-- skl_render_definitions
alter policy skl_rdefs_select on public.skl_render_definitions using (
  (is_public = true)
  OR ((user_id IS NULL) AND (organization_id IS NULL) AND (project_id IS NULL) AND (task_id IS NULL))
  OR (user_id = auth.uid())
  OR ((organization_id IS NOT NULL) AND (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid()))))
  OR ((project_id IS NOT NULL) AND (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )))
  OR ((task_id IS NOT NULL) AND (task_id IN ( SELECT ctx_tasks.id FROM ctx_tasks WHERE ((ctx_tasks.user_id = auth.uid()) OR (ctx_tasks.assignee_id = auth.uid()))))));

-- skl_skill_projects
alter policy skl_skill_projects_select on public.skl_skill_projects using (
  (EXISTS ( SELECT 1 FROM skl_definitions d WHERE ((d.id = skl_skill_projects.skill_id) AND ((d.is_public = true) OR (d.is_system = true) OR (d.user_id = auth.uid()) OR ((d.organization_id IS NOT NULL) AND (d.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE (om.user_id = auth.uid()))))))))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )));

alter policy skl_skill_projects_insert on public.skl_skill_projects with check (
  (EXISTS ( SELECT 1 FROM skl_definitions d WHERE ((d.id = skl_skill_projects.skill_id) AND ((d.user_id = auth.uid()) OR ((d.organization_id IS NOT NULL) AND (d.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE ((om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))))))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid )));

alter policy skl_skill_projects_delete on public.skl_skill_projects using (
  (EXISTS ( SELECT 1 FROM skl_definitions d WHERE ((d.id = skl_skill_projects.skill_id) AND ((d.user_id = auth.uid()) OR ((d.organization_id IS NOT NULL) AND (d.organization_id IN ( SELECT om.organization_id FROM organization_members om WHERE ((om.user_id = auth.uid()) AND (om.role = ANY (ARRAY['owner'::org_role, 'admin'::org_role]))))))))))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project', ARRAY['owner','admin']) cid )));

-- wc_claim
alter policy wc_claim_select_scope on public.wc_claim using (
  (user_id = auth.uid())
  OR (organization_id IN ( SELECT organization_members.organization_id FROM organization_members WHERE (organization_members.user_id = auth.uid())))
  OR (project_id IN ( SELECT cid FROM iam.user_container_ids('project') cid )));

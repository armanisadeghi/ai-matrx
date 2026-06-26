-- repoint_project_member_functions_to_iam.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- Companion to repoint_project_member_rls_to_iam.sql. Several SECURITY DEFINER
-- helper functions still read the legacy ctx_project_members, which now goes
-- stale (membership edits flow only to iam.memberships). These are the
-- access-control / listing helpers used across RLS and the app, so reading the
-- stale table is an ACTIVE correctness bug (an invited member is not recognized;
-- a removed member keeps access). Repointed to iam.memberships
-- (container_type='project'), which holds the complete membership picture.
--
-- Each repoint also adds `SET search_path TO 'public'` where it was missing
-- (the auth_is_project_* helpers lacked it — a SECURITY DEFINER search_path
-- hardening) and schema-qualifies iam.memberships.
--
-- DEFERRED (final coupled step, with the ctx_project_members drop): the creator
-- trigger ctx_projects_add_creator_membership and the two large context
-- builders get_user_full_context / get_user_hierarchy still read/write
-- ctx_project_members. They are coupled (repointing the trigger without the
-- readers would hide new personal projects) and get_user_full_context is
-- entangled with the personal-org-sentinel refactor + the ctx_scope_assignments
-- track. They stay correct for owners/personal projects (the trigger keeps
-- ctx_project_members populated with owners) until that coordinated wave.
-- Idempotent.

create or replace function public.auth_is_project_member(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from iam.memberships
     where container_type='project' and container_id = p_project_id
       and user_id = auth.uid() and deleted_at is null
  );
$fn$;

create or replace function public.auth_is_project_admin(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from iam.memberships
     where container_type='project' and container_id = p_project_id
       and user_id = auth.uid() and deleted_at is null and role in ('owner','admin')
  );
$fn$;

create or replace function public.auth_is_project_owner(p_project_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select exists (
    select 1 from iam.memberships
     where container_type='project' and container_id = p_project_id
       and user_id = auth.uid() and deleted_at is null and role = 'owner'
  );
$fn$;

create or replace function public.check_resource_access(
  p_resource_type text, p_resource_id uuid, p_required_level permission_level,
  p_owner_id uuid default null, p_assignee_id uuid default null,
  p_project_id uuid default null, p_organization_id uuid default null
) returns boolean
language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return false; end if;
  if p_owner_id is not null and p_owner_id = v_uid then return true; end if;
  if p_assignee_id is not null and p_assignee_id = v_uid and p_required_level in ('viewer','editor') then return true; end if;
  return exists (
    with user_orgs as (select organization_id, role from organization_members where user_id = v_uid),
    access_check as (
      select 1 from permissions p where p.resource_type = p_resource_type and p.resource_id = p_resource_id
        and coalesce(p.status, 'active') <> 'rejected'
        and (p.granted_to_user_id = v_uid or p.granted_to_organization_id in (select organization_id from user_orgs))
        and case p_required_level when 'viewer' then p.permission_level in ('viewer','editor','admin') when 'editor' then p.permission_level in ('editor','admin') when 'admin' then p.permission_level = 'admin' end
      union all
      select 1 from iam.memberships pm where p_project_id is not null and pm.container_type='project' and pm.container_id = p_project_id
        and pm.user_id = v_uid and pm.deleted_at is null
        and (p_required_level = 'viewer' or pm.role in ('owner','admin'))
      union all
      select 1 from user_orgs uo where p_organization_id is not null and uo.organization_id = p_organization_id
        and (p_required_level = 'viewer' or uo.role in ('owner','admin'))
    )
    select 1 from access_check limit 1
  );
end;
$fn$;

create or replace function public.get_project_members_with_users(p_project_id uuid)
returns table(id uuid, project_id uuid, user_id uuid, role project_role, joined_at timestamp with time zone, invited_by uuid, user_email text, user_display_name text, user_avatar_url text)
language sql stable security definer set search_path to 'public' as $fn$
  select m.id, m.container_id, m.user_id, m.role::project_role, m.created_at, m.created_by,
    u.email, coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
    u.raw_user_meta_data->>'avatar_url'
  from iam.memberships m join auth.users u on m.user_id = u.id
  where m.container_type='project' and m.container_id = p_project_id and m.deleted_at is null and (
    exists (select 1 from iam.memberships caller where caller.container_type='project' and caller.container_id = p_project_id and caller.user_id = auth.uid() and caller.deleted_at is null)
    or exists (select 1 from ctx_projects p join organization_members om on om.organization_id = p.organization_id
      where p.id = p_project_id and om.user_id = auth.uid() and om.role in ('owner', 'admin'))
  )
  order by case m.role when 'owner' then 1 when 'admin' then 2 else 3 end, m.created_at asc;
$fn$;

create or replace function public.agx_get_user_shortcuts()
returns table(id uuid, label text, description text, icon_name text, keyboard_shortcut text, sort_order integer, category_id uuid, category_label text, agent_id uuid, agent_name text, agent_version_id uuid, use_latest boolean, scope_type text, scope_name text, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, enabled_features jsonb, scope_mappings jsonb, context_mappings jsonb, display_mode text, allow_chat boolean, auto_run boolean, show_variable_panel boolean, variables_panel_style text, show_definition_messages boolean, show_definition_message_content boolean, hide_reasoning boolean, hide_tool_results boolean, show_pre_execution_gate boolean, pre_execution_message text, bypass_gate_seconds integer, default_user_input text, default_variables jsonb, context_overrides jsonb, llm_overrides jsonb, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone)
language plpgsql stable security definer set search_path to 'public' as $fn$
declare v_uid uuid := auth.uid();
begin
  return query
  select
    s.id, s.label, s.description, s.icon_name, s.keyboard_shortcut, s.sort_order,
    s.category_id, sc.label,
    s.agent_id, a.name, s.agent_version_id, s.use_latest,
    (case
      when s.task_id is not null then 'task'
      when s.project_id is not null then 'project'
      when s.organization_id is not null then 'organization'
      when s.user_id is not null then 'personal'
      else 'system'
    end)::text,
    (case
      when s.task_id is not null then (select t.name from ctx_tasks t where t.id = s.task_id)
      when s.project_id is not null then (select p.name from ctx_projects p where p.id = s.project_id)
      when s.organization_id is not null then (select o.name from organizations o where o.id = s.organization_id)
      when s.user_id is not null then 'Personal'
      else 'System'
    end)::text,
    s.user_id, s.organization_id, s.project_id, s.task_id,
    s.enabled_features, s.scope_mappings, s.context_mappings,
    s.display_mode, s.allow_chat, s.auto_run,
    s.show_variable_panel, s.variables_panel_style,
    s.show_definition_messages, s.show_definition_message_content,
    s.hide_reasoning, s.hide_tool_results,
    s.show_pre_execution_gate, s.pre_execution_message, s.bypass_gate_seconds,
    s.default_user_input, s.default_variables, s.context_overrides, s.llm_overrides,
    s.is_active, s.created_at, s.updated_at
  from agx_shortcut s
  left join agx_agent a on a.id = s.agent_id
  left join shortcut_categories sc on sc.id = s.category_id
  where s.user_id = v_uid
     or s.organization_id in (
       select om.organization_id from organization_members om
       where om.user_id = v_uid and om.role in ('owner', 'admin')
     )
     or s.project_id in (
       select m.container_id from iam.memberships m
       where m.container_type='project' and m.user_id = v_uid and m.deleted_at is null and m.role in ('owner', 'admin')
     )
  order by
    case
      when s.user_id is not null then 0
      when s.organization_id is not null then 1
      when s.project_id is not null then 2
      when s.task_id is not null then 3
      else 4
    end,
    s.sort_order, s.label;
end;
$fn$;

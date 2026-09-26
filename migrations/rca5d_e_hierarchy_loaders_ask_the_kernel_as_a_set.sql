-- RC-A5d round 2, follow-up — THE HIERARCHY LOADERS ASK THE KERNEL ONCE, AS A SET.
-- Register row RC-A5d. Follows rca5d_c_definer_doors_ask_each_record.sql (live since 2026-09-26 03:45Z).
--
-- THE DEFECT (measured on production 2026-09-26 04:3xZ): rca5d_c made get_user_full_context and
-- get_user_nav_tree ask iam.has_access_for per project, per task and per scope. For admin@admin.com
-- (142 organizations, ~1.3k tasks in them) get_user_full_context then took 75 s and every page load
-- hit the 57014 statement timeout — the sidebar hierarchy stopped loading.
--
-- THE FIX: when the caller answers for herself, the kernel's SET form (iam.accessible_entity_ids,
-- 0.13 s for all of admin's tasks) is asked once per token and each row is a membership test. Measured
-- equal to the per-row kernel for test@test.com on production (0 mismatches over 177 tasks, 13
-- projects, 13 scopes). Another person's context (service role, admin lane) keeps the per-row call.
-- Nothing else changes.
-- Inverse: migrations/inverse/rca5d_e_hierarchy_loaders_ask_the_kernel_as_a_set_down.sql.
-- based-on: public.get_user_full_context(uuid) b1a7681d7ffb5d0dd8faf03b8969b074b8036cc0037c9aaad063a2857d0f5fcd
-- based-on: public.get_user_nav_tree(uuid) ecb8b444d2bf283261dd8d13f5cf8573ea417e36eda28f49873f434e299faffc

set local lock_timeout = '2s';

CREATE OR REPLACE FUNCTION public.get_user_full_context(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_personal_org_id constant uuid := '00000000-0000-0000-0000-000000000001'::uuid;
    v_result jsonb; v_personal_row jsonb; v_real_rows jsonb;
    -- rca5d_e: the kernel's SET form, asked once per token, when the caller answers for herself
    -- (the normal case). A per-row kernel call on every task/project/scope of every organization
    -- took 75 s for a 142-organization account (rca5d_c). Another person's context (service role,
    -- admin lane) keeps the per-row kernel call for that person.
    v_self boolean;
    v_project_ids uuid[]; v_task_ids uuid[]; v_scope_ids uuid[];
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
    -- 🚨 DD-192: the same defect as get_user_nav_tree, one layer deeper — this one
    -- also hands back the target's scope types, scopes and context items.
    if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
      raise exception 'access denied: caller is not the target user' using errcode = '42501';
    end if;
    v_self := v_uid is not distinct from (select auth.uid());
    if v_self then
      v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
      v_task_ids    := iam.accessible_entity_ids('task', 'viewer'::public.permission_level);
      v_scope_ids   := iam.accessible_entity_ids('scope', 'viewer'::public.permission_level);
    end if;
    with
    user_orgs as (
        select o.id, o.name, o.slug, o.is_personal, om.role::text as role
        from iam.organizations o join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    org_scope_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object('id',st.id,'label_singular',st.label_singular,'label_plural',st.label_plural,'icon',st.icon,'color',st.color,'sort_order',st.sort_order,'parent_type_id',st.parent_type_id,'max_assignments_per_entity',st.max_assignments_per_entity) order by st.sort_order) as types
        from context.scope_types st where st.organization_id in (select id from user_orgs) and st.deleted_at is null group by st.organization_id
    ),
    org_scopes as (
        select s.organization_id,
            jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'scope_type_id',s.scope_type_id,'parent_scope_id',s.parent_scope_id,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order, s.name) as scopes
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null
          and (case when v_self then s.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', s.id, 'viewer'::public.permission_level) end) group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations_live sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null
                  and (case when v_self then sc.id = any(v_scope_ids) else iam.has_access_for(v_uid, 'scope', sc.id, 'viewer'::public.permission_level) end)), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read other members' personal project names and task titles here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    personal_projects as (
        select p.id, p.name, p.slug, true::boolean as is_personal, '[]'::jsonb as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null
        where p.organization_id is null
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                when p.id is not null and p.organization_id is null then v_personal_org_id
                else coalesce((select om.organization_id from iam.organization_member om where om.user_id = coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from user_orgs) limit 1), v_personal_org_id)
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects) or t.project_id in (select id from personal_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_is_personal desc, uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.is_personal as uo_is_personal, uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'is_personal',uo.is_personal,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'is_personal',uo.is_personal,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    with
    personal_projects_v as (
        select p.id, p.name, p.slug,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null where p.organization_id is null
    ),
    personal_tasks_v as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule
        from workspace.tasks t left join workspace.projects p on t.project_id=p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (
            (p.id is not null and p.organization_id is null and exists (select 1 from iam.memberships m where m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null))
            or (p.id is null and (t.created_by=v_uid or t.assignee_id=v_uid) and not exists (select 1 from iam.organization_member om where om.user_id=coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from iam.organization_member where user_id=v_uid)))
        )
    )
    select case when exists (select 1 from personal_projects_v) or exists (select 1 from personal_tasks_v) then
        jsonb_build_object('id',v_personal_org_id,'name','Personal','slug','personal','is_personal',true,'role','owner','scope_types','[]'::jsonb,'scopes','[]'::jsonb,
            'projects',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'slug',pp.slug,'is_personal',true,'scope_tags','[]'::jsonb,'open_task_count',pp.open_task_count,'total_task_count',pp.total_task_count) order by pp.name) from personal_projects_v pp),'[]'::jsonb),
            'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',pt.id,'title',pt.title,'status',pt.status,'priority',pt.priority,'project_id',pt.project_id,'parent_task_id',pt.parent_task_id,'due_date',pt.due_date,'assignee_id',pt.assignee_id,'created_by',pt.created_by,'origin',pt.origin,'source_type',pt.source_type,'source_url',pt.source_url,'source_label',pt.source_label,'start_date',pt.start_date,'completed_at',pt.completed_at,'updated_at',pt.updated_at,'recurrence_rule',pt.recurrence_rule) order by case pt.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, pt.due_date nulls last) from personal_tasks_v pt),'[]'::jsonb))
    end into v_personal_row;
    select jsonb_build_object('organizations', case when v_personal_row is not null then jsonb_build_array(v_personal_row)||v_real_rows else v_real_rows end) into v_result;
    return v_result;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_nav_tree(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid; v_result jsonb; v_self boolean; v_project_ids uuid[];
BEGIN
  v_uid := COALESCE(p_user_id, auth.uid());
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- 🚨 DD-192: p_user_id NAMES A PERSON, AND UNTIL 2026-09-13 NOBODY CHECKED IT WAS
  -- THE CALLER. `coalesce(p_user_id, auth.uid())` reads as a convenience default;
  -- in a SECURITY DEFINER function granted to `authenticated` it is an argument
  -- that REPLACES the caller. Any signed-in user passed a stranger's id and got
  -- that stranger's whole navigation tree back: every organization they belong
  -- to, their role in each, and every project inside. Proven live against
  -- admin@admin.com's organizations as test@test.com and as a user who is a
  -- member of nothing. The guard is the one the rest of the p_user_id family
  -- already uses, word for word.
  if not (auth.role() = 'service_role' or v_uid = ( SELECT auth.uid()) or public.is_platform_admin()) then
    raise exception 'access denied: caller is not the target user' using errcode = '42501';
  end if;
  -- rca5d_e: the kernel's set form, once, when the caller answers for herself (see get_user_full_context).
  v_self := v_uid IS NOT DISTINCT FROM (SELECT auth.uid());
  IF v_self THEN
    v_project_ids := iam.accessible_entity_ids('project', 'viewer'::public.permission_level);
  END IF;
  WITH user_orgs AS (
    SELECT o.id, o.name, o.slug, o.is_personal, om.role::text AS role
    FROM iam.organizations o JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = v_uid
  ), org_projects AS (
    SELECT p.id, p.name, p.slug, p.organization_id, COALESCE(po.is_personal, false) AS is_personal
    FROM workspace.projects p
    JOIN iam.organizations po ON po.id = p.organization_id
    WHERE p.organization_id IN (SELECT id FROM user_orgs)
      -- RC-A5d (rca5d_c): an organization's projects are listed only when the person may open them
      -- (a member read the names of other members' personal projects here).
      AND (CASE WHEN v_self THEN p.id = ANY(v_project_ids) ELSE iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) END)
  )
  SELECT jsonb_build_object('organizations', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('id', uo.id, 'name', uo.name, 'slug', uo.slug, 'is_personal', uo.is_personal, 'role', uo.role,
      'projects', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', op.id, 'name', op.name, 'slug', op.slug, 'is_personal', op.is_personal) ORDER BY op.name) FROM org_projects op WHERE op.organization_id = uo.id), '[]'::jsonb))
    ORDER BY uo.is_personal DESC, uo.name ASC) FROM user_orgs uo), '[]'::jsonb))
  INTO v_result;
  RETURN v_result;
END;
$function$;

-- Applied 2026-08-07 via Supabase MCP.
-- get_user_full_context: task payloads gain lifecycle/provenance/time fields
-- (created_by, origin, source_*, start_date, completed_at, updated_at,
-- recurrence_rule), closed tasks from the last 90 days are now included
-- (Completed smart view), soft-deleted tasks are excluded, and "open" counts
-- exclude cancelled/dismissed.
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
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;
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
        from context.scopes s join context.scope_types st on s.scope_type_id = st.id where s.organization_id in (select id from user_orgs) and s.deleted_at is null and st.deleted_at is null group by s.organization_id
    ),
    org_projects as (
        select p.id, p.name, p.slug, p.organization_id,
            coalesce((select jsonb_agg(jsonb_build_object('scope_id',sc.id,'scope_name',sc.name,'type_label',st.label_singular,'type_icon',st.icon,'type_color',st.color) order by st.sort_order)
                from platform.associations sa
                join context.scopes sc on sa.target_id = sc.id
                join context.scope_types st on sc.scope_type_id = st.id
                where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = p.id and sc.deleted_at is null and st.deleted_at is null), '[]'::jsonb) as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
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
          and (t.created_by=v_uid or t.assignee_id=v_uid or t.project_id in (select id from org_projects) or t.project_id in (select id from personal_projects))
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

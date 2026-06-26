-- repoint_project_member_trio_to_iam.sql
-- Applied during the canonical-model cutover (via Supabase MCP apply_migration).
--
-- The final coupled set of ctx_project_members readers/writers (deferred from
-- repoint_project_member_functions_to_iam.sql). After this, NOTHING in the DB
-- reads or writes ctx_project_members, so it (and the other 6 ctx_ junctions)
-- can be graveyarded.
--
-- They are coupled: the creator trigger must WRITE iam.memberships so every
-- project-creation path (incl. non-FE / direct inserts) populates the canonical
-- table, AND the two context builders must READ iam.memberships — repointing one
-- without the other would hide newly-created personal projects. Done together
-- here. Only the ctx_project_members references are swapped; the
-- ctx_scope_assignments reads + personal-org handling in get_user_full_context
-- are the scope/context track's concern and are left byte-for-byte unchanged.
-- Idempotent.

-- 1) Creator membership trigger → write iam.memberships (org NOT NULL → personal-org fallback).
create or replace function public.ctx_projects_add_creator_membership()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if NEW.created_by is not null then
    insert into iam.memberships (organization_id, container_type, container_id, user_id, role, status, created_by, updated_by)
    values (coalesce(NEW.organization_id, public.ensure_personal_organization(NEW.created_by)),
            'project', NEW.id, NEW.created_by, 'owner', 'active', NEW.created_by, NEW.created_by)
    on conflict (container_type, container_id, user_id) do nothing;
  end if;
  return NEW;
end $fn$;

-- 2) get_user_hierarchy → read iam.memberships (2 spots). Adds SET search_path (hardening).
create or replace function public.get_user_hierarchy()
returns jsonb language plpgsql security definer set search_path to 'public' as $fn$
declare result jsonb; uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select jsonb_build_object(
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'is_personal', o.is_personal, 'role', om.role::text,
        'project_count', (select count(*) from ctx_projects p where p.organization_id = o.id
          and exists (select 1 from iam.memberships pm where pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null))
      ) order by o.is_personal desc, o.name asc) from organizations o join organization_members om on om.organization_id = o.id and om.user_id = uid
    ), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'slug', p.slug, 'organization_id', p.organization_id,
        'is_personal', coalesce(po.is_personal, false), 'role', pm.role::text,
        'topic_count', (select count(*) from rs_topic rt where rt.project_id = p.id))
      order by p.name asc) from ctx_projects p join iam.memberships pm on pm.container_type='project' and pm.container_id = p.id and pm.user_id = uid and pm.deleted_at is null
        left join organizations po on po.id = p.organization_id
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$fn$;

-- 3) get_user_full_context → read iam.memberships for personal projects (3 spots).
-- Everything else (scopes / ctx_scope_assignments / personal-org sentinel) is unchanged.
create or replace function public.get_user_full_context(p_user_id uuid default null::uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $fn$
declare
    v_uid uuid;
    v_personal_org_id constant uuid := '00000000-0000-0000-0000-000000000001';
    v_result jsonb;
    v_personal_row jsonb;
    v_real_rows jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());

    if v_uid is null then
        return jsonb_build_object('organizations', '[]'::jsonb);
    end if;

    with
    user_orgs as (
        select o.id, o.name, o.slug, o.is_personal, om.role::text as role
        from organizations o
        join organization_members om on om.organization_id = o.id and om.user_id = v_uid
    ),

    org_scope_types as (
        select
            st.organization_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', st.id,
                    'label_singular', st.label_singular,
                    'label_plural', st.label_plural,
                    'icon', st.icon,
                    'color', st.color,
                    'sort_order', st.sort_order,
                    'parent_type_id', st.parent_type_id,
                    'max_assignments_per_entity', st.max_assignments_per_entity
                ) order by st.sort_order
            ) as types
        from ctx_scope_types st
        where st.organization_id in (select id from user_orgs)
        group by st.organization_id
    ),

    org_scopes as (
        select
            s.organization_id,
            jsonb_agg(
                jsonb_build_object(
                    'id', s.id,
                    'name', s.name,
                    'scope_type_id', s.scope_type_id,
                    'parent_scope_id', s.parent_scope_id,
                    'type_label', st.label_singular,
                    'type_icon', st.icon,
                    'type_color', st.color
                ) order by st.sort_order, s.name
            ) as scopes
        from ctx_scopes s
        join ctx_scope_types st on s.scope_type_id = st.id
        where s.organization_id in (select id from user_orgs)
        group by s.organization_id
    ),

    org_projects as (
        select
            p.id, p.name, p.slug, p.organization_id,
            coalesce((
                select jsonb_agg(
                    jsonb_build_object(
                        'scope_id', sc.id,
                        'scope_name', sc.name,
                        'type_label', st.label_singular,
                        'type_icon', st.icon,
                        'type_color', st.color
                    ) order by st.sort_order
                )
                from ctx_scope_assignments sa
                join ctx_scopes sc on sa.scope_id = sc.id
                join ctx_scope_types st on sc.scope_type_id = st.id
                where sa.entity_type = 'project' and sa.entity_id = p.id
            ), '[]'::jsonb) as scope_tags,
            (select count(*) from ctx_tasks t where t.project_id = p.id and t.status != 'completed') as open_task_count,
            (select count(*) from ctx_tasks t where t.project_id = p.id) as total_task_count
        from ctx_projects p
        where p.organization_id in (select id from user_orgs)
    ),

    personal_projects as (
        select
            p.id, p.name, p.slug, true::boolean as is_personal,
            '[]'::jsonb as scope_tags,
            (select count(*) from ctx_tasks t where t.project_id = p.id and t.status != 'completed') as open_task_count,
            (select count(*) from ctx_tasks t where t.project_id = p.id) as total_task_count
        from ctx_projects p
        join iam.memberships m on m.container_type = 'project' and m.container_id = p.id and m.user_id = v_uid and m.deleted_at is null
        where p.organization_id is null
    ),

    all_tasks as (
        select
            t.id, t.title, t.status, t.priority::text as priority,
            t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            case
                when p.id is not null and p.organization_id is not null
                    then p.organization_id
                when p.id is not null and p.organization_id is null
                    then v_personal_org_id
                else coalesce(
                    (select om.organization_id from organization_members om
                     where om.user_id = coalesce(t.user_id, t.assignee_id, v_uid)
                       and om.organization_id in (select id from user_orgs)
                     limit 1),
                    v_personal_org_id
                )
            end as organization_id
        from ctx_tasks t
        left join ctx_projects p on t.project_id = p.id
        where t.status != 'completed'
          and (
              t.user_id = v_uid
              or t.assignee_id = v_uid
              or t.project_id in (select id from org_projects)
              or t.project_id in (select id from personal_projects)
          )
    )

    select coalesce(jsonb_agg(real_org_obj order by uo_is_personal desc, uo_name asc), '[]'::jsonb)
    into v_real_rows
    from (
        select
            uo.is_personal as uo_is_personal,
            uo.name as uo_name,
            jsonb_build_object(
                'id', uo.id,
                'name', uo.name,
                'slug', uo.slug,
                'is_personal', uo.is_personal,
                'role', uo.role,
                'scope_types', coalesce(ost.types, '[]'::jsonb),
                'scopes', coalesce(os.scopes, '[]'::jsonb),
                'projects', coalesce((
                    select jsonb_agg(
                        jsonb_build_object(
                            'id', op.id,
                            'name', op.name,
                            'slug', op.slug,
                            'is_personal', uo.is_personal,
                            'scope_tags', op.scope_tags,
                            'open_task_count', op.open_task_count,
                            'total_task_count', op.total_task_count
                        ) order by op.name
                    )
                    from org_projects op where op.organization_id = uo.id
                ), '[]'::jsonb),
                'tasks', coalesce((
                    select jsonb_agg(
                        jsonb_build_object(
                            'id', at.id,
                            'title', at.title,
                            'status', at.status,
                            'priority', at.priority,
                            'project_id', at.project_id,
                            'parent_task_id', at.parent_task_id,
                            'due_date', at.due_date,
                            'assignee_id', at.assignee_id
                        ) order by
                            case at.priority
                                when 'high' then 0 when 'medium' then 1
                                when 'low' then 2 else 3
                            end,
                            at.due_date nulls last
                    )
                    from all_tasks at where at.organization_id = uo.id
                ), '[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo
        left join org_scope_types ost on ost.organization_id = uo.id
        left join org_scopes os on os.organization_id = uo.id
    ) sub;

    with
    personal_projects_v as (
        select
            p.id, p.name, p.slug,
            (select count(*) from ctx_tasks t where t.project_id = p.id and t.status != 'completed') as open_task_count,
            (select count(*) from ctx_tasks t where t.project_id = p.id) as total_task_count
        from ctx_projects p
        join iam.memberships m on m.container_type = 'project' and m.container_id = p.id and m.user_id = v_uid and m.deleted_at is null
        where p.organization_id is null
    ),
    personal_tasks_v as (
        select
            t.id, t.title, t.status, t.priority::text as priority,
            t.project_id, t.parent_task_id, t.due_date, t.assignee_id
        from ctx_tasks t
        left join ctx_projects p on t.project_id = p.id
        where t.status != 'completed'
          and (
              (p.id is not null and p.organization_id is null
               and exists (select 1 from iam.memberships m where m.container_type='project' and m.container_id = p.id and m.user_id = v_uid and m.deleted_at is null))
              or (p.id is null
                  and (t.user_id = v_uid or t.assignee_id = v_uid)
                  and not exists (
                      select 1 from organization_members om
                      where om.user_id = coalesce(t.user_id, t.assignee_id, v_uid)
                        and om.organization_id in (select id from organization_members where user_id = v_uid)
                  ))
          )
    )
    select
        case
            when exists (select 1 from personal_projects_v)
              or exists (select 1 from personal_tasks_v)
            then jsonb_build_object(
                'id', v_personal_org_id,
                'name', 'Personal',
                'slug', 'personal',
                'is_personal', true,
                'role', 'owner',
                'scope_types', '[]'::jsonb,
                'scopes', '[]'::jsonb,
                'projects', coalesce((
                    select jsonb_agg(
                        jsonb_build_object(
                            'id', pp.id,
                            'name', pp.name,
                            'slug', pp.slug,
                            'is_personal', true,
                            'scope_tags', '[]'::jsonb,
                            'open_task_count', pp.open_task_count,
                            'total_task_count', pp.total_task_count
                        ) order by pp.name
                    )
                    from personal_projects_v pp
                ), '[]'::jsonb),
                'tasks', coalesce((
                    select jsonb_agg(
                        jsonb_build_object(
                            'id', pt.id,
                            'title', pt.title,
                            'status', pt.status,
                            'priority', pt.priority,
                            'project_id', pt.project_id,
                            'parent_task_id', pt.parent_task_id,
                            'due_date', pt.due_date,
                            'assignee_id', pt.assignee_id
                        ) order by
                            case pt.priority
                                when 'high' then 0 when 'medium' then 1
                                when 'low' then 2 else 3
                            end,
                            pt.due_date nulls last
                    )
                    from personal_tasks_v pt
                ), '[]'::jsonb)
            )
        end
    into v_personal_row;

    select jsonb_build_object(
        'organizations',
        case
            when v_personal_row is not null
                then jsonb_build_array(v_personal_row) || v_real_rows
            else v_real_rows
        end
    ) into v_result;

    return v_result;
end;
$fn$;

-- ctx_scope_tables_versioning_soft_delete.sql
-- Tier 1 canonicalization of the scope domain (context.scopes / scope_types / context_items).
--
-- These three tables were REGISTERED in platform.entity_types with is_versioned=true and
-- has_soft_delete=true, but the machinery was never installed: no _history trigger (so
-- history.row_versions had 0 rows for any scope token) and no deleted_at column (so soft
-- delete was impossible). Meanwhile delete_scope / delete_scope_type did a HARD DELETE whose
-- ON DELETE CASCADE wiped every context_item_value (the cell data), context_value_refs, child
-- scopes, dict entries and rag suggestions — unrecoverable dataloss.
--
-- This migration makes the flags TRUE and kills the dataloss path, additively (no RLS change,
-- no consumer breakage):
--   1. Add deleted_at + version + updated_by + metadata columns.
--   2. Attach the canonical platform._version_capture _history trigger → every INSERT/UPDATE/
--      DELETE/SOFT_DELETE now lands in history.row_versions.
--   3. Convert delete_scope / delete_scope_type to SOFT delete (set deleted_at; context_items
--      keep their existing is_active soft-delete). No cascade fires; all data is preserved.
--   4. Filter deleted_at in every scope/scope_type reader so soft-deleted rows vanish from the
--      UI, pickers, and agent context.
--
-- context_item_values is intentionally untouched: it is already an append-only versioned table
-- (version / is_current / change_summary), so cell history was never at risk.
--
-- Idempotent: re-running is a no-op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Base columns (additive)
-- ─────────────────────────────────────────────────────────────────────────────
alter table context.scopes         add column if not exists deleted_at timestamptz;
alter table context.scopes         add column if not exists version    int not null default 1;
alter table context.scopes         add column if not exists updated_by  uuid;
alter table context.scopes         add column if not exists metadata    jsonb not null default '{}';

alter table context.scope_types    add column if not exists deleted_at timestamptz;
alter table context.scope_types    add column if not exists version    int not null default 1;
alter table context.scope_types    add column if not exists updated_by  uuid;
alter table context.scope_types    add column if not exists metadata    jsonb not null default '{}';

alter table context.context_items  add column if not exists deleted_at timestamptz;
alter table context.context_items  add column if not exists version    int not null default 1;
alter table context.context_items  add column if not exists updated_by  uuid;
alter table context.context_items  add column if not exists metadata    jsonb not null default '{}';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) History capture (canonical). _version_capture reads NEW.deleted_at, so the
--    columns above must exist first. Registration flags are already true.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists _history on context.scopes;
create trigger _history after insert or update or delete on context.scopes
  for each row execute function platform._version_capture('scope');

drop trigger if exists _history on context.scope_types;
create trigger _history after insert or update or delete on context.scope_types
  for each row execute function platform._version_capture('scope_type');

drop trigger if exists _history on context.context_items;
create trigger _history after insert or update or delete on context.context_items
  for each row execute function platform._version_capture('context_item');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Soft-delete the destructive RPCs
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.delete_scope(p_scope_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_child_count int; v_assignment_count int; v_org uuid;
begin
    select organization_id into v_org from context.scopes where id = p_scope_id;
    if v_org is null or not iam.has_org_access(v_org) then
      raise exception 'not authorized to delete scope %', p_scope_id using errcode = '42501';
    end if;
    -- descendants (excluding self)
    with recursive children as (
        select id from context.scopes where parent_scope_id = p_scope_id
        union all
        select s.id from context.scopes s join children c on s.parent_scope_id = c.id
    ) select count(*) into v_child_count from children;
    with recursive all_scopes as (
        select p_scope_id as id
        union all
        select s.id from context.scopes s join all_scopes a on s.parent_scope_id = a.id
    ) select count(*) into v_assignment_count
      from platform.associations
      where target_type='scope' and target_id in (select id from all_scopes);
    -- SOFT delete self + all descendants (no hard delete → no cascade wipe of values)
    with recursive all_scopes as (
        select p_scope_id as id
        union all
        select s.id from context.scopes s join all_scopes a on s.parent_scope_id = a.id
    )
    update context.scopes set deleted_at = now()
    where id in (select id from all_scopes) and deleted_at is null;
    return jsonb_build_object('deleted_children', v_child_count, 'deleted_assignments', v_assignment_count);
end;
$function$;

create or replace function public.delete_scope_type(p_type_id uuid)
 returns jsonb language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
declare v_scope_count int; v_assignment_count int; v_org uuid;
begin
    select organization_id into v_org from context.scope_types where id = p_type_id;
    if v_org is null or not iam.has_org_access(v_org) then
      raise exception 'not authorized to delete scope type %', p_type_id using errcode = '42501';
    end if;
    select count(*) into v_assignment_count
    from platform.associations a join context.scopes s on a.target_id = s.id
    where a.target_type='scope' and s.scope_type_id = p_type_id;
    select count(*) into v_scope_count from context.scopes where scope_type_id = p_type_id and deleted_at is null;
    -- SOFT delete: hide the type, its scopes (deleted_at) and its context-item definitions
    -- (their existing is_active soft-delete). No hard delete → no cascade wipe.
    update context.scopes        set deleted_at = now() where scope_type_id = p_type_id and deleted_at is null;
    update context.context_items set is_active  = false where scope_type_id = p_type_id and is_active = true;
    update context.scope_types   set deleted_at = now() where id = p_type_id and deleted_at is null;
    return jsonb_build_object('deleted_scopes', v_scope_count, 'deleted_assignments', v_assignment_count);
end;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Readers — exclude soft-deleted scopes / scope types everywhere
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.list_scopes(p_org_id uuid, p_type_id uuid default null::uuid, p_parent_scope_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
            'type_label', st.label_singular, 'type_label_plural', st.label_plural,
            'type_icon', st.icon, 'type_color', st.color,
            'child_count', (select count(*) from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null),
            'assignment_count', (select count(*) from platform.associations a where a.target_type='scope' and a.target_id = s.id)
        )
        order by s.sort_order, s.name
    ) into v_result
    from context.scopes s
    join context.scope_types st on s.scope_type_id = st.id
    where s.organization_id = p_org_id
      and s.deleted_at is null and st.deleted_at is null
      and (p_type_id is null or s.scope_type_id = p_type_id)
      and ((p_parent_scope_id is null and s.parent_scope_id is null) or s.parent_scope_id = p_parent_scope_id);
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_scope_tree(p_org_id uuid, p_type_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        to_jsonb(s) || jsonb_build_object(
            'type_label', st.label_singular, 'type_label_plural', st.label_plural,
            'type_icon', st.icon, 'type_color', st.color
        )
        order by st.sort_order, s.sort_order, s.name
    ) into v_result
    from context.scopes s
    join context.scope_types st on s.scope_type_id = st.id
    where s.organization_id = p_org_id
      and s.deleted_at is null and st.deleted_at is null
      and (p_type_id is null or s.scope_type_id = p_type_id);
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.search_scopes(p_org_id uuid, p_query text, p_type_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        jsonb_build_object(
            'id', s.id, 'name', s.name, 'description', s.description,
            'parent_scope_id', s.parent_scope_id, 'type_id', st.id,
            'type_label', st.label_singular, 'type_icon', st.icon, 'type_color', st.color
        )
        order by st.sort_order, s.sort_order, s.name
    ) into v_result
    from context.scopes s
    join context.scope_types st on s.scope_type_id = st.id
    where s.organization_id = p_org_id
      and s.deleted_at is null and st.deleted_at is null
      and s.name ilike '%' || p_query || '%'
      and (p_type_id is null or s.scope_type_id = p_type_id);
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.list_scope_types(p_org_id uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        to_jsonb(st.*) || jsonb_build_object(
            'parent_type_label', pt.label_singular,
            'scope_count', (select count(*) from context.scopes where scope_type_id = st.id and deleted_at is null)
        )
        order by st.sort_order, st.label_singular
    ) into v_result
    from context.scope_types st
    left join context.scope_types pt on st.parent_type_id = pt.id
    where st.organization_id = p_org_id and st.deleted_at is null;
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_org_structure(p_org_id uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_types jsonb; v_scopes jsonb;
begin
    select jsonb_agg(
        to_jsonb(st.*) || jsonb_build_object('parent_type_label', pt.label_singular)
        order by st.sort_order
    ) into v_types
    from context.scope_types st
    left join context.scope_types pt on st.parent_type_id = pt.id
    where st.organization_id = p_org_id and st.deleted_at is null;

    select jsonb_agg(
        jsonb_build_object(
            'id', s.id, 'name', s.name, 'description', s.description,
            'scope_type_id', s.scope_type_id, 'parent_scope_id', s.parent_scope_id,
            'type_label', st.label_singular, 'type_icon', st.icon, 'type_color', st.color
        )
        order by st.sort_order, s.name
    ) into v_scopes
    from context.scopes s
    join context.scope_types st on s.scope_type_id = st.id
    where s.organization_id = p_org_id and s.deleted_at is null and st.deleted_at is null;

    return jsonb_build_object('types', coalesce(v_types, '[]'::jsonb), 'scopes', coalesce(v_scopes, '[]'::jsonb));
end;
$function$;

create or replace function public.get_entity_scopes(p_entity_type text, p_entity_id uuid)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_result jsonb;
begin
    select jsonb_agg(
        jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_description', s.description,
            'parent_scope_id', s.parent_scope_id, 'type_id', st.id,
            'type_label', st.label_singular, 'type_label_plural', st.label_plural,
            'type_icon', st.icon, 'type_color', st.color, 'type_sort_order', st.sort_order
        )
        order by st.sort_order, s.sort_order, s.name
    ) into v_result
    from platform.associations a
    join context.scopes s on a.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where a.target_type = 'scope' and a.source_type = p_entity_type and a.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;
    return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_scope_context(p_scope_id uuid, p_item_ids uuid[] default null::uuid[], p_include_empty boolean default false)
 returns jsonb language plpgsql stable security definer
as $function$
declare v_scope_type_id uuid; v_result jsonb;
begin
  select scope_type_id into v_scope_type_id from context.scopes where id = p_scope_id and deleted_at is null;
  if v_scope_type_id is null then return '{}'::jsonb; end if;

  if p_include_empty then
    select jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'description', ci.description, 'category', ci.category, 'value_type', ci.value_type,
        'fetch_hint', ci.fetch_hint, 'sensitivity', ci.sensitivity, 'sort_order', ci.sort_order,
        'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'has_value', civ.id is not null,
        'value_text', civ.value_text, 'value_number', civ.value_number, 'value_boolean', civ.value_boolean,
        'value_json', civ.value_json, 'value_date', civ.value_date, 'value_document_url', civ.value_document_url,
        'version', civ.version, 'updated_at', civ.created_at
      )
      order by ci.sort_order, ci.display_name
    ) into v_result
    from context.context_items ci
    left join context.context_item_values civ
      on civ.context_item_id = ci.id and civ.scope_id = p_scope_id and civ.is_current = true
    where ci.scope_type_id = v_scope_type_id and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  else
    select jsonb_agg(
      jsonb_build_object(
        'item_id', ci.id, 'key', ci.key, 'slug', ci.slug, 'display_name', ci.display_name,
        'value_type', ci.value_type, 'custom_component', ci.custom_component,
        'allowed_reference_types', ci.allowed_reference_types, 'max_items', ci.max_items,
        'allowed_scope_type_ids', ci.allowed_scope_type_ids,
        'value_text', civ.value_text, 'value_number', civ.value_number,
        'value_boolean', civ.value_boolean, 'value_json', civ.value_json, 'value_date', civ.value_date,
        'value_document_url', civ.value_document_url
      )
      order by ci.sort_order, ci.display_name
    ) into v_result
    from context.context_item_values civ
    join context.context_items ci on civ.context_item_id = ci.id
    where civ.scope_id = p_scope_id and civ.is_current = true and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_user_scopes(p_user_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
declare v_uid uuid; v_result jsonb;
begin
    v_uid := coalesce(p_user_id, auth.uid());
    if v_uid is null then return jsonb_build_object('organizations', '[]'::jsonb); end if;

    with user_orgs as (
        select o.id, o.name, o.slug, o.is_personal, om.role::text as role
        from iam.organizations o
        join iam.organization_member om on om.organization_id = o.id and om.user_id = v_uid
    ),
    type_scopes as (
        select s.scope_type_id,
            jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'sort_order', s.sort_order, 'parent_scope_id', s.parent_scope_id)
                order by s.sort_order, s.name) as scopes
        from context.scopes s
        where s.organization_id in (select id from user_orgs) and s.deleted_at is null
        group by s.scope_type_id
    ),
    org_types as (
        select st.organization_id,
            jsonb_agg(jsonb_build_object(
                'id', st.id, 'label_singular', st.label_singular, 'label_plural', st.label_plural,
                'icon', st.icon, 'color', st.color, 'sort_order', st.sort_order, 'parent_type_id', st.parent_type_id,
                'max_assignments_per_entity', st.max_assignments_per_entity,
                'scopes', coalesce(ts.scopes, '[]'::jsonb)
            ) order by st.sort_order, st.label_plural) as scope_types
        from context.scope_types st
        left join type_scopes ts on ts.scope_type_id = st.id
        where st.organization_id in (select id from user_orgs) and st.deleted_at is null
        group by st.organization_id
    )
    select jsonb_build_object('organizations',
        coalesce(jsonb_agg(jsonb_build_object(
            'id', uo.id, 'name', uo.name, 'slug', uo.slug, 'is_personal', uo.is_personal, 'role', uo.role,
            'scope_types', coalesce(ot.scope_types, '[]'::jsonb)
        ) order by uo.is_personal desc, uo.name asc), '[]'::jsonb)
    ) into v_result
    from user_orgs uo left join org_types ot on ot.organization_id = uo.id;
    return v_result;
end;
$function$;

create or replace function public.get_user_full_context(p_user_id uuid default null::uuid)
 returns jsonb language plpgsql stable security definer set search_path to 'public'
as $function$
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
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.status != 'completed') as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id) as total_task_count
        from workspace.projects p where p.organization_id in (select id from user_orgs)
    ),
    personal_projects as (
        select p.id, p.name, p.slug, true::boolean as is_personal, '[]'::jsonb as scope_tags,
            (select count(*) from workspace.tasks t where t.project_id = p.id and t.status != 'completed') as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id = p.id) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null
        where p.organization_id is null
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                when p.id is not null and p.organization_id is null then v_personal_org_id
                else coalesce((select om.organization_id from iam.organization_member om where om.user_id = coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from user_orgs) limit 1), v_personal_org_id)
            end as organization_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id
        where t.status != 'completed' and (t.created_by=v_uid or t.assignee_id=v_uid or t.project_id in (select id from org_projects) or t.project_id in (select id from personal_projects))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_is_personal desc, uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.is_personal as uo_is_personal, uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'is_personal',uo.is_personal,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'is_personal',uo.is_personal,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    with
    personal_projects_v as (
        select p.id, p.name, p.slug,
            (select count(*) from workspace.tasks t where t.project_id=p.id and t.status!='completed') as open_task_count,
            (select count(*) from workspace.tasks t where t.project_id=p.id) as total_task_count
        from workspace.projects p join iam.memberships m on m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null where p.organization_id is null
    ),
    personal_tasks_v as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id
        from workspace.tasks t left join workspace.projects p on t.project_id=p.id
        where t.status!='completed' and (
            (p.id is not null and p.organization_id is null and exists (select 1 from iam.memberships m where m.container_type='project' and m.container_id=p.id and m.user_id=v_uid and m.deleted_at is null))
            or (p.id is null and (t.created_by=v_uid or t.assignee_id=v_uid) and not exists (select 1 from iam.organization_member om where om.user_id=coalesce(t.created_by,t.assignee_id,v_uid) and om.organization_id in (select id from iam.organization_member where user_id=v_uid)))
        )
    )
    select case when exists (select 1 from personal_projects_v) or exists (select 1 from personal_tasks_v) then
        jsonb_build_object('id',v_personal_org_id,'name','Personal','slug','personal','is_personal',true,'role','owner','scope_types','[]'::jsonb,'scopes','[]'::jsonb,
            'projects',coalesce((select jsonb_agg(jsonb_build_object('id',pp.id,'name',pp.name,'slug',pp.slug,'is_personal',true,'scope_tags','[]'::jsonb,'open_task_count',pp.open_task_count,'total_task_count',pp.total_task_count) order by pp.name) from personal_projects_v pp),'[]'::jsonb),
            'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',pt.id,'title',pt.title,'status',pt.status,'priority',pt.priority,'project_id',pt.project_id,'parent_task_id',pt.parent_task_id,'due_date',pt.due_date,'assignee_id',pt.assignee_id) order by case pt.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, pt.due_date nulls last) from personal_tasks_v pt),'[]'::jsonb))
    end into v_personal_row;
    select jsonb_build_object('organizations', case when v_personal_row is not null then jsonb_build_array(v_personal_row)||v_real_rows else v_real_rows end) into v_result;
    return v_result;
end;
$function$;

create or replace function public.resolve_full_context(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] default null::uuid[])
 returns jsonb language plpgsql stable security definer set search_path to 'public','pg_temp'
as $function$
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
begin
    if p_entity_type = 'task' then
        select t.project_id, p.organization_id, t.id into v_project_id, v_org_id, v_task_id
        from workspace.tasks t left join workspace.projects p on t.project_id = p.id where t.id = p_entity_id;
    elsif p_entity_type = 'project' then
        select p.organization_id, p.id into v_org_id, v_project_id
        from workspace.projects p where p.id = p_entity_id;
    elsif p_entity_type = 'conversation' then
        select c.organization_id, c.project_id, c.task_id into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select n.organization_id, n.project_id, n.task_id into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations sa join context.scopes s on sa.target_id = s.id
        join context.scope_types st on s.scope_type_id = st.id
        where sa.target_type = 'scope' and sa.source_type = 'project' and sa.source_id = v_project_id
          and s.deleted_at is null and st.deleted_at is null;
    end if;

    if p_scope_ids is not null and array_length(p_scope_ids, 1) > 0 then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_explicit_scopes
        from context.scopes s
        join context.scope_types st on s.scope_type_id = st.id
        join iam.organization_member om
          on om.organization_id = s.organization_id and om.user_id = p_user_id
        where s.id = any(p_scope_ids)
          and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null
               or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));

        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(elem->>'type_label', elem->>'scope_name'), '{}'::jsonb)
        into v_scope_labels
        from jsonb_array_elements(v_entity_scopes) elem;
    end if;

    for rec in (
        select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
               s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
               case
                   when civ.value_text is not null then to_jsonb(civ.value_text)
                   when civ.value_number is not null then to_jsonb(civ.value_number)
                   when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                   when civ.value_date is not null then to_jsonb(civ.value_date::text)
                   when civ.value_json is not null then civ.value_json
                   when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                   when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                   else null
               end as value
        from context.context_item_values civ
        join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
        join context.scopes s on s.id = civ.scope_id
        join context.scope_types st on st.id = s.scope_type_id and st.is_system = true
        where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        continue when rec.value is null;
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    end loop;

    for rec in (
        select ci.id as context_item_id, ci.key, ci.description, ci.display_name,
               ci.feed_config as feed_config,
               sc.scope_id as scope_id, ci.scope_type_id as scope_type_id
        from context.context_items ci
        join context.scope_types st on st.id = ci.scope_type_id and st.is_system = true
        left join lateral (
            select s.id as scope_id from context.scopes s
            where s.scope_type_id = ci.scope_type_id and s.deleted_at is null order by s.sort_order limit 1
        ) sc on true
        where ci.is_active = true and ci.fetch_hint != 'never'
          and ci.feed_type = 'dataset'
          and ci.feed_config ? 'data_store_id' and st.deleted_at is null
        order by st.sort_order asc, ci.sort_order asc
    ) loop
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', jsonb_build_object(
                'kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code',
                'hint', 'Knowledge resource — query it with the RAG tools, e.g. rag_search(data_store_id=<data_store_id>).'),
            'type', 'dataset', 'inject_as', 'reference',
            'source', 'system', 'description', rec.description));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
            'key', rec.key,
            'value', jsonb_build_object(
                'kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code'),
            'type', 'dataset', 'description', rec.description,
            'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'system'));
    end loop;

    if v_entity_scopes is not null then
        for rec in (
            select ci.id as context_item_id, ci.key, ci.description, ci.value_type::text as value_type,
                   s.id as scope_id, s.name as scope_name, s.scope_type_id as scope_type_id,
                   case
                       when civ.value_text is not null then to_jsonb(civ.value_text)
                       when civ.value_number is not null then to_jsonb(civ.value_number)
                       when civ.value_boolean is not null then to_jsonb(civ.value_boolean)
                       when civ.value_date is not null then to_jsonb(civ.value_date::text)
                       when civ.value_json is not null then civ.value_json
                       when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                       when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                       else null
                   end as value
            from context.context_item_values civ
            join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
            join context.scopes s on s.id = civ.scope_id
            join context.scope_types st on st.id = s.scope_type_id
            where civ.is_current = true
              and ci.fetch_hint != 'never'
              and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (
                  select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem
              )
            order by st.sort_order asc, ci.sort_order asc
        ) loop
            continue when rec.value is null;
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text, jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'scope_id', rec.scope_id, 'scope_type_id', rec.scope_type_id, 'source', 'scope:' || rec.scope_name));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$;

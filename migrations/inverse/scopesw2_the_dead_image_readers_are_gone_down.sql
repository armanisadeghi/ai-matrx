-- INVERSE of migrations/campaign/scopesw2_the_dead_image_readers_are_gone.sql (lane FINISH-THE-SWITCH): recreates the seven functions, owners and EXECUTE grants as production held them on 2026-10-05.

CREATE OR REPLACE FUNCTION context.get_scope_tree_from_the_image(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;
ALTER FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION context.get_scope_tree_from_the_image(uuid,uuid) TO svc_seo;

CREATE OR REPLACE FUNCTION context.list_scope_types_from_the_image(p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  select jsonb_agg(
    to_jsonb(st.*) || jsonb_build_object(
      'parent_type_label', pt.label_singular,
      'scope_count', (select count(*) from context.scopes s where s.scope_type_id = st.id and s.deleted_at is null)
    ) order by st.sort_order, st.label_singular
  ) into v_result
  from context.scope_types st
  left join context.scope_types pt on st.parent_type_id = pt.id
  where st.organization_id = p_org_id and st.deleted_at is null;
  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;
ALTER FUNCTION context.list_scope_types_from_the_image(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.list_scope_types_from_the_image(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.list_scope_types_from_the_image(uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.list_scope_types_from_the_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION context.list_scope_types_from_the_image(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION context.list_scope_types_from_the_image(uuid) TO svc_seo;

CREATE OR REPLACE FUNCTION context.list_scope_type_items_from_the_image(p_scope_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', v_org_id)::text;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'status', ci.status,
      'tags', ci.tags,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source
    )
    order by ci.sort_order, ci.display_name
  )
  into v_result
  from context.context_items ci
  where ci.scope_type_id = p_scope_type_id
    and ci.is_active = true;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;
ALTER FUNCTION context.list_scope_type_items_from_the_image(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.list_scope_type_items_from_the_image(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.list_scope_type_items_from_the_image(uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.list_scope_type_items_from_the_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION context.list_scope_type_items_from_the_image(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION context.list_scope_type_items_from_the_image(uuid) TO svc_seo;

CREATE OR REPLACE FUNCTION context.get_scope_context_from_the_image(p_scope_id uuid, p_item_ids uuid[] DEFAULT NULL::uuid[], p_include_empty boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope_type_id uuid;
  v_org_id uuid;
  v_result jsonb;
begin
  select s.scope_type_id, s.organization_id
  into v_scope_type_id, v_org_id
  from context.scopes s
  where s.id = p_scope_id
    and s.deleted_at is null;

  if v_scope_type_id is null then
    return '{}'::jsonb;
  end if;

  perform context._assert_scope_readable(p_scope_id, 'viewer');

  if p_include_empty then
    select jsonb_agg(jsonb_build_object(
      'item_id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'description', ci.description,
      'category', ci.category,
      'value_type', ci.value_type,
      'fetch_hint', ci.fetch_hint,
      'sensitivity', ci.sensitivity,
      'sort_order', ci.sort_order,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source,
      'has_value', civ.id is not null,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'value_date', civ.value_date,
      'value_timestamp', civ.value_timestamp,
      'value_time', civ.value_time,
      'value_document_url', civ.value_document_url,
      'version', civ.version,
      'updated_at', civ.created_at
    ) order by ci.sort_order, ci.display_name)
    into v_result
    from context.context_items ci
    left join context.context_item_values civ
      on civ.context_item_id = ci.id
     and civ.scope_id = p_scope_id
     and civ.is_current = true
    where ci.scope_type_id = v_scope_type_id
      and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  else
    select jsonb_agg(jsonb_build_object(
      'item_id', ci.id,
      'key', ci.key,
      'slug', ci.slug,
      'display_name', ci.display_name,
      'value_type', ci.value_type,
      'custom_component', ci.custom_component,
      'allowed_reference_types', ci.allowed_reference_types,
      'max_items', ci.max_items,
      'allowed_scope_type_ids', ci.allowed_scope_type_ids,
      'reference_source', ci.reference_source,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'value_date', civ.value_date,
      'value_timestamp', civ.value_timestamp,
      'value_time', civ.value_time,
      'value_document_url', civ.value_document_url
    ) order by ci.sort_order, ci.display_name)
    into v_result
    from context.context_item_values civ
    join context.context_items ci on civ.context_item_id = ci.id
    where civ.scope_id = p_scope_id
      and civ.is_current = true
      and ci.is_active = true
      and (p_item_ids is null or ci.id = any(p_item_ids));
  end if;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$
;
ALTER FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) TO service_role;
GRANT EXECUTE ON FUNCTION context.get_scope_context_from_the_image(uuid,uuid[],boolean) TO svc_seo;

CREATE OR REPLACE FUNCTION context.get_user_full_context_from_the_image(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
    v_uid uuid;
    v_result jsonb; v_real_rows jsonb;
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
        select o.id, o.name, o.slug, om.role::text as role
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
            (select count(*) from projects.tasks t where t.project_id = p.id and t.deleted_at is null and t.status not in ('completed','cancelled','dismissed')) as open_task_count,
            (select count(*) from projects.tasks t where t.project_id = p.id and t.deleted_at is null) as total_task_count
        from projects.projects p where p.organization_id in (select id from user_orgs)
          -- RC-A5d (rca5d_c): only projects (and, below, tasks and scopes) this person may open;
          -- a member read the names and task titles of projects they could not open here.
          and (case when v_self then p.id = any(v_project_ids) else iam.has_access_for(v_uid, 'project', p.id, 'viewer'::public.permission_level) end)
    ),
    all_tasks as (
        select t.id, t.title, t.status, t.priority::text as priority, t.project_id, t.parent_task_id, t.due_date, t.assignee_id,
            t.created_by, t.origin, t.source_type, t.source_url, t.source_label, t.start_date, t.completed_at, t.updated_at, t.recurrence_rule,
            case
                when p.id is not null and p.organization_id is not null then p.organization_id
                else t.organization_id
            end as organization_id
        from projects.tasks t left join projects.projects p on t.project_id = p.id
        where t.deleted_at is null
          and (t.status not in ('completed','cancelled','dismissed')
               or coalesce(t.completed_at, t.updated_at) > now() - interval '90 days')
          and (t.created_by=v_uid or t.assignee_id=v_uid
               or ((t.project_id in (select id from org_projects))
                   and (case when v_self then t.id = any(v_task_ids) else iam.has_access_for(v_uid, 'task', t.id, 'viewer'::public.permission_level) end)))
    )
    select coalesce(jsonb_agg(real_org_obj order by uo_name asc), '[]'::jsonb) into v_real_rows
    from (
        select uo.name as uo_name,
            jsonb_build_object('id',uo.id,'name',uo.name,'slug',uo.slug,'role',uo.role,
                'scope_types',coalesce(ost.types,'[]'::jsonb),'scopes',coalesce(os.scopes,'[]'::jsonb),
                'projects',coalesce((select jsonb_agg(jsonb_build_object('id',op.id,'name',op.name,'slug',op.slug,'scope_tags',op.scope_tags,'open_task_count',op.open_task_count,'total_task_count',op.total_task_count) order by op.name) from org_projects op where op.organization_id=uo.id),'[]'::jsonb),
                'tasks',coalesce((select jsonb_agg(jsonb_build_object('id',at.id,'title',at.title,'status',at.status,'priority',at.priority,'project_id',at.project_id,'parent_task_id',at.parent_task_id,'due_date',at.due_date,'assignee_id',at.assignee_id,'created_by',at.created_by,'origin',at.origin,'source_type',at.source_type,'source_url',at.source_url,'source_label',at.source_label,'start_date',at.start_date,'completed_at',at.completed_at,'updated_at',at.updated_at,'recurrence_rule',at.recurrence_rule) order by case at.priority when 'high' then 0 when 'medium' then 1 when 'low' then 2 else 3 end, at.due_date nulls last) from all_tasks at where at.organization_id=uo.id),'[]'::jsonb)
            ) as real_org_obj
        from user_orgs uo left join org_scope_types ost on ost.organization_id=uo.id left join org_scopes os on os.organization_id=uo.id
    ) sub;
    select jsonb_build_object('organizations', v_real_rows) into v_result;
    return v_result;
end;
$function$
;
ALTER FUNCTION context.get_user_full_context_from_the_image(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.get_user_full_context_from_the_image(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.get_user_full_context_from_the_image(uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.get_user_full_context_from_the_image(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION context.get_user_full_context_from_the_image(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION context.get_user_full_context_from_the_image(uuid) TO svc_seo;

CREATE OR REPLACE FUNCTION context.resolve_full_context_from_the_image(p_user_id uuid, p_entity_type text, p_entity_id uuid, p_scope_ids uuid[] DEFAULT NULL::uuid[], p_system_item_refs text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- A CONCRETE CELL IS IDENTIFIED BY (context_item_id, scope_id) — NEVER BY context_item_id ALONE.
-- Two active scopes of the SAME scope type (two Clients on one conversation, two Repositories
-- on one task) each carry their own value for the SAME context item. Keying `cell_values` by
-- context_item_id alone made the second row silently overwrite the first, and the ORDER BY did
-- not tie-break between scopes, so WHICH value survived was arbitrary. `cell_values` is now
-- LOSSLESS: {context_item_id: [cell, ...]} — one entry per contributing scope, in a
-- deterministic order. `variables` stays keyed by bare `key` (it is the name-addressed
-- awareness map) but every entry now carries the full `cells` array, so a name collision
-- across scope types or scopes can be RENDERED rather than silently dropped.
declare
    v_org_id uuid; v_project_id uuid; v_task_id uuid;
    v_scope_labels jsonb := '{}'; v_variables jsonb := '{}'; v_sources jsonb := '{}';
    v_cells jsonb := '{}';
    v_cell jsonb;
    rec record;
    v_entity_scopes jsonb;
    v_explicit_scopes jsonb;
begin
    if p_entity_type = 'task' then
        select t.project_id, p.organization_id, t.id into v_project_id, v_org_id, v_task_id
        from projects.tasks t left join projects.projects p on t.project_id = p.id where t.id = p_entity_id;
    elsif p_entity_type = 'project' then
        select p.organization_id, p.id into v_org_id, v_project_id
        from projects.projects p where p.id = p_entity_id;
    elsif p_entity_type = 'conversation' then
        select
            c.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'conversation'
                  and a.source_id = c.id
                  and a.target_type = 'project'
                  and a.organization_id = c.organization_id
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            c.task_id
        into v_org_id, v_project_id, v_task_id
        from chat.conversation c where c.id = p_entity_id;
    elsif p_entity_type = 'note' then
        select
            n.organization_id,
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'project'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            ),
            (
                select a.target_id
                from platform.associations_live a
                where a.source_type = 'note'
                  and a.source_id = n.id
                  and a.target_type = 'task'
                order by a.position nulls last, a.created_at, a.id
                limit 1
            )
        into v_org_id, v_project_id, v_task_id
        from workbench.notes n where n.id = p_entity_id;
    end if;

    select jsonb_agg(jsonb_build_object(
        'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
        'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
    )) into v_entity_scopes
    from platform.associations_live sa join context.scopes s on sa.target_id = s.id
    join context.scope_types st on s.scope_type_id = st.id
    where sa.target_type = 'scope' and sa.source_type = p_entity_type and sa.source_id = p_entity_id
      and s.deleted_at is null and st.deleted_at is null;

    if v_entity_scopes is null and v_project_id is not null and p_entity_type != 'project' then
        select jsonb_agg(jsonb_build_object(
            'scope_id', s.id, 'scope_name', s.name, 'scope_type_id', st.id,
            'type_label', lower(st.label_singular), 'type_sort_order', st.sort_order, 'parent_scope_id', s.parent_scope_id
        )) into v_entity_scopes
        from platform.associations_live sa join context.scopes s on sa.target_id = s.id
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
        join lateral (select 1 as ok) om on context._scope_readable_for(p_user_id, s.id, 'viewer')
        where s.id = any(p_scope_ids) and s.deleted_at is null and st.deleted_at is null
          and (v_entity_scopes is null or not (v_entity_scopes @> jsonb_build_array(jsonb_build_object('scope_id', s.id))));
        if v_explicit_scopes is not null then
            v_entity_scopes := coalesce(v_entity_scopes, '[]'::jsonb) || v_explicit_scopes;
        end if;
    end if;

    -- Scope LABELS are name-addressed by type_label and therefore collapse when two scopes
    -- share a type. Aggregate every name for a type into an array instead of letting the
    -- last one win — build_system_prompt_block already renders a list value.
    if v_entity_scopes is not null then
        select coalesce(jsonb_object_agg(t.type_label, t.names), '{}'::jsonb)
        into v_scope_labels
        from (
            select elem->>'type_label' as type_label,
                   case when count(*) > 1
                        then jsonb_agg(elem->>'scope_name' order by elem->>'scope_name')
                        else to_jsonb(min(elem->>'scope_name')) end as names
            from jsonb_array_elements(v_entity_scopes) elem
            group by elem->>'type_label'
        ) t;
    end if;

    -- SYSTEM lane: platform-wide truths from context.system_context_item (its own
    -- storage since 2026-08-27 — no longer is_system scope types). Three classes:
    -- ambient (computed per request by the server), curated (admin-maintained values),
    -- dataset (pointers the agent queries via RAG). Cells carry scope_id/scope_type_id
    -- NULL and scope_name 'System' — System context has no scope dimension.
    -- A SYSTEM ITEM IS READ ONLY WHEN IT IS NAMED (lane CONTEXT-VALUES-NAMED-2): the lane reads
    -- only the rows p_system_item_refs names (ids or keys, from the server's SystemContextNames);
    -- NULL or empty reads none. An unnamed row is never fetched.
    for rec in (
        select sci.id as context_item_id, sci.key, sci.description,
               sci.value_type::text as value_type, sci.value as value
        from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
        where sci.is_active = true and sci.deleted_at is null and sci.feed_type != 'dataset'
        order by sci.sort_order asc, sci.key asc
    ) loop
        continue when rec.value is null;
        v_cell := jsonb_build_object(
            'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
            'context_item_id', rec.context_item_id,
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
            'source', 'system', 'description', rec.description,
            'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
            coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
    end loop;

    for rec in (
        select sci.id as context_item_id, sci.key, sci.description, sci.display_name,
               sci.feed_config as feed_config
        from context.named_system_context_items(context.system_item_refs_or_defaults(p_system_item_refs)) sci
        where sci.is_active = true and sci.deleted_at is null and sci.feed_type = 'dataset'
          and sci.feed_config ? 'data_store_id'
        order by sci.sort_order asc, sci.key asc
    ) loop
        v_cell := jsonb_build_object(
            'key', rec.key,
            'value', jsonb_build_object('kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code'),
            'type', 'dataset', 'description', rec.description,
            'context_item_id', rec.context_item_id,
            'scope_id', null, 'scope_name', 'System', 'scope_type_id', null,
            'source', 'system');
        v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
            'value', jsonb_build_object('kind', 'dataset',
                'data_store_id', rec.feed_config->>'data_store_id',
                'name', coalesce(rec.feed_config->>'data_store_name', rec.display_name),
                'short_code', rec.feed_config->>'data_store_short_code',
                'hint', 'Knowledge resource — query it with the RAG tools, e.g. knowledge_search(data_store_id=<data_store_id>).'),
            'type', 'dataset', 'inject_as', 'reference', 'source', 'system', 'description', rec.description,
            'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
        v_sources := v_sources || jsonb_build_object(rec.key, 'system');
        v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
            coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
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
                       when civ.value_timestamp is not null then to_jsonb(civ.value_timestamp::text)
                       when civ.value_time is not null then to_jsonb(civ.value_time::text)
                       when civ.value_json is not null then civ.value_json
                       when civ.value_document_url is not null then to_jsonb(civ.value_document_url)
                       when civ.value_reference_id is not null then to_jsonb(civ.value_reference_id::text)
                       else null
                   end as value
            from context.context_item_values civ
            join context.context_items ci on ci.id = civ.context_item_id and ci.is_active = true
            join context.scopes s on s.id = civ.scope_id
            join context.scope_types st on st.id = s.scope_type_id
            where civ.is_current = true and ci.fetch_hint != 'never' and s.deleted_at is null and st.deleted_at is null
              and civ.scope_id in (select (elem->>'scope_id')::uuid from jsonb_array_elements(v_entity_scopes) elem)
            order by st.sort_order asc, ci.sort_order asc, s.name asc, s.id asc
        ) loop
            continue when rec.value is null;
            v_cell := jsonb_build_object(
                'key', rec.key, 'value', rec.value, 'type', rec.value_type, 'description', rec.description,
                'context_item_id', rec.context_item_id,
                'scope_id', rec.scope_id, 'scope_name', rec.scope_name, 'scope_type_id', rec.scope_type_id,
                'source', 'scope:' || rec.scope_name);
            v_variables := v_variables || jsonb_build_object(rec.key, jsonb_build_object(
                'value', rec.value, 'type', rec.value_type, 'inject_as', 'direct',
                'source', 'scope:' || rec.scope_name, 'description', rec.description,
                'cells', coalesce(v_variables -> rec.key -> 'cells', '[]'::jsonb) || jsonb_build_array(v_cell)));
            v_sources := v_sources || jsonb_build_object(rec.key, 'scope:' || rec.scope_name);
            v_cells := v_cells || jsonb_build_object(rec.context_item_id::text,
                coalesce(v_cells -> rec.context_item_id::text, '[]'::jsonb) || jsonb_build_array(v_cell));
        end loop;
    end if;

    return jsonb_build_object('scope_labels', v_scope_labels, 'variables', v_variables, 'sources', v_sources,
        'cell_values', v_cells,
        'context', jsonb_build_object('user_id', p_user_id, 'organization_id', v_org_id, 'project_id', v_project_id, 'task_id', v_task_id,
            'scope_ids', coalesce((select jsonb_agg(elem->'scope_id') from jsonb_array_elements(v_entity_scopes) elem), '[]'::jsonb)),
        'resolved_at', extract(epoch from now()));
end;
$function$
;
ALTER FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) TO dashboard_user;
GRANT EXECUTE ON FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) TO service_role;
GRANT EXECUTE ON FUNCTION context.resolve_full_context_from_the_image(uuid,text,uuid,uuid[],text[]) TO svc_seo;

CREATE OR REPLACE FUNCTION public.kg_simulated_scope_graph(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
WITH scope AS (
    SELECT s.id, s.name, s.scope_type_id, st.label_singular, st.icon, st.color
    FROM context.scopes s
    LEFT JOIN context.scope_types st ON st.id = s.scope_type_id
    WHERE s.id = p_scope_id
),
items AS (
    SELECT ci.id, ci.display_name, ci.key, ci.value_type::text AS value_type, ci.sort_order
    FROM context.context_items ci
    JOIN scope ON ci.scope_type_id = scope.scope_type_id
    WHERE ci.is_active IS DISTINCT FROM false
),
current_values AS (
    SELECT DISTINCT ON (v.context_item_id)
           v.context_item_id, v.source_type::text AS source_type,
           COALESCE(v.value_text, v.value_number::text, v.value_boolean::text,
                    v.value_date::text, v.value_json::text) AS display_value
    FROM context.context_item_values v
    JOIN items i ON i.id = v.context_item_id
    WHERE v.scope_id = p_scope_id AND v.is_current = true
    ORDER BY v.context_item_id, v.version DESC
),
suggestions AS (
    SELECT sug.id, sug.target_context_item_id AS context_item_id,
           sug.suggested_value, sug.confidence, sug.match_kind, sug.current_value_snapshot
    FROM rag.scope_item_value_suggestions sug
    WHERE sug.target_scope_id = p_scope_id AND sug.status = 'pending'
),
matches AS (
    SELECT m.id, m.target_context_item_id AS context_item_id,
           m.matched_value, m.mention_count, m.confidence
    FROM rag.kg_value_matches m
    WHERE m.target_scope_id = p_scope_id
)
SELECT jsonb_build_object(
    'scope', (SELECT jsonb_build_object('id', id, 'name', name, 'type_label', label_singular,
                  'icon', icon, 'color', color) FROM scope),
    'nodes',
        jsonb_build_array(jsonb_build_object(
            'id', 'scope:' || (SELECT id::text FROM scope), 'kind', 'scope',
            'label', (SELECT name FROM scope)))
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'item:' || i.id::text, 'kind', 'context_item',
              'label', i.display_name, 'key', i.key, 'value_type', i.value_type,
              'state', CASE WHEN cv.display_value IS NOT NULL THEN 'filled' ELSE 'empty' END)
              ORDER BY i.sort_order)
            FROM items i LEFT JOIN current_values cv ON cv.context_item_id = i.id), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'value:' || cv.context_item_id::text, 'kind', 'value',
              'state', 'current', 'label', cv.display_value, 'source_type', cv.source_type))
            FROM current_values cv WHERE cv.display_value IS NOT NULL), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'sugg:' || s.id::text, 'kind', 'value', 'state', 'suggested',
              'label', s.suggested_value, 'confidence', s.confidence,
              'match_kind', s.match_kind, 'suggestion_id', s.id::text,
              'replaces', s.current_value_snapshot))
            FROM suggestions s), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'match:' || m.id::text, 'kind', 'match',
              'label', m.matched_value, 'mention_count', m.mention_count,
              'confidence', m.confidence))
            FROM matches m), '[]'::jsonb),
    'edges',
        COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'e-item:' || i.id::text,
              'source', 'scope:' || (SELECT id::text FROM scope),
              'target', 'item:' || i.id::text, 'kind', 'has_item'))
            FROM items i), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'e-val:' || cv.context_item_id::text,
              'source', 'item:' || cv.context_item_id::text,
              'target', 'value:' || cv.context_item_id::text, 'kind', 'has_value'))
            FROM current_values cv WHERE cv.display_value IS NOT NULL), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'e-sugg:' || s.id::text,
              'source', 'item:' || s.context_item_id::text,
              'target', 'sugg:' || s.id::text, 'kind', 'suggested_value'))
            FROM suggestions s), '[]'::jsonb)
        || COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'id', 'e-match:' || m.id::text,
              'source', 'item:' || m.context_item_id::text,
              'target', 'match:' || m.id::text, 'kind', 'confirmed_here'))
            FROM matches m), '[]'::jsonb),
    'stats', jsonb_build_object(
        'items',     (SELECT count(*) FROM items),
        'filled',    (SELECT count(*) FROM current_values WHERE display_value IS NOT NULL),
        'suggested', (SELECT count(*) FROM suggestions),
        'matched',   (SELECT count(*) FROM matches))
);
$function$
;
ALTER FUNCTION public.kg_simulated_scope_graph(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.kg_simulated_scope_graph(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO authenticator;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO cli_login_postgres;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO dashboard_user;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO matrx_provisioner;
GRANT EXECUTE ON FUNCTION public.kg_simulated_scope_graph(uuid) TO svc_seo;

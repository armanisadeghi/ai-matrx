-- D31: validate every caller-selected owner/container before definer writes.

create or replace function public.agx_create_shortcut(
  p_agent_id uuid,
  p_label text,
  p_category_id uuid,
  p_user_id uuid default null,
  p_organization_id uuid default null,
  p_project_id uuid default null,
  p_task_id uuid default null,
  p_use_latest boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_agent record;
  v_version_id uuid;
  v_new_id uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if p_user_id is not null and p_user_id <> v_uid then
    raise exception 'cannot create a shortcut for another user' using errcode = '42501';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_task_id is not null
     and coalesce(iam.has_access('task', p_task_id, 'editor'), false) is not true then
    raise exception 'not authorized for task %', p_task_id using errcode = '42501';
  end if;

  select a.id, a.name, a.version
  into v_agent
  from agent.definition a
  where a.id = p_agent_id;
  if not found then raise exception 'Agent not found'; end if;

  if not p_use_latest then
    select av.id into v_version_id
    from agent.definition_version av
    where av.agent_id = p_agent_id and av.version_number = v_agent.version;
  end if;

  if p_user_id is null and p_organization_id is null
     and p_project_id is null and p_task_id is null then
    p_user_id := v_uid;
  end if;

  v_new_id := gen_random_uuid();
  insert into agent.shortcut (
    id, category_id, label, agent_id, agent_version_id, use_latest,
    enabled_features, display_mode, allow_chat, auto_run,
    show_variable_panel, variables_panel_style,
    show_definition_messages, show_definition_message_content,
    hide_reasoning, hide_tool_results, show_pre_execution_gate,
    bypass_gate_seconds, is_active, user_id, organization_id, project_id, task_id
  ) values (
    v_new_id, p_category_id, p_label, p_agent_id, v_version_id, p_use_latest,
    '["general"]'::jsonb, 'modal-full', true, false,
    false, 'inline', false, false, false, false, false,
    3, true, p_user_id, p_organization_id, p_project_id, p_task_id
  );
  return v_new_id;
end;
$function$;

create or replace function public.create_tasks_bulk(
  p_items jsonb,
  p_project_id uuid default null,
  p_organization_id uuid default null,
  p_scope_ids uuid[] default '{}',
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_metadata jsonb default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_task workspace.tasks;
  v_tasks jsonb := '[]'::jsonb;
  v_scope_id uuid;
  v_priority task_priority;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be a JSON array' using errcode = '22023';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'at most 100 tasks may be created at once' using errcode = '22023';
  end if;
  if p_organization_id is not null
     and coalesce(iam.has_org_access(p_organization_id), false) is not true then
    raise exception 'not authorized for organization %', p_organization_id using errcode = '42501';
  end if;
  if p_project_id is not null
     and coalesce(iam.has_access('project', p_project_id, 'editor'), false) is not true then
    raise exception 'not authorized for project %', p_project_id using errcode = '42501';
  end if;
  if p_entity_type is not null and p_entity_id is not null
     and coalesce(iam.has_access(p_entity_type, p_entity_id, 'editor'), false) is not true then
    raise exception 'not authorized for % %', p_entity_type, p_entity_id using errcode = '42501';
  end if;
  if exists (
    select 1
    from unnest(coalesce(p_scope_ids, '{}'::uuid[])) requested(scope_id)
    left join context.scopes s on s.id = requested.scope_id and s.deleted_at is null
    where s.id is null or coalesce(iam.has_org_access(s.organization_id), false) is not true
  ) then
    raise exception 'one or more requested scopes are not accessible' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_priority := case
      when v_item->>'priority' in ('low','medium','high') then (v_item->>'priority')::task_priority
      else null
    end;
    insert into workspace.tasks (
      title, description, project_id, organization_id, priority, due_date, status, created_by
    ) values (
      coalesce(nullif(trim(v_item->>'title'), ''), 'Untitled task'),
      v_item->>'description', p_project_id, p_organization_id, v_priority,
      case when v_item->>'due_date' is not null then (v_item->>'due_date')::date else null end,
      coalesce(v_item->>'status', 'incomplete'), v_uid
    ) returning * into v_task;

    if p_entity_type is not null and p_entity_id is not null then
      perform public.assoc_add(
        p_entity_type, p_entity_id, 'task', v_task.id, v_task.organization_id,
        v_item->>'title',
        coalesce(p_metadata, '{}'::jsonb)
          || jsonb_build_object('item_index', coalesce((v_item->>'index')::int, 0))
      );
    end if;
    foreach v_scope_id in array coalesce(p_scope_ids, '{}'::uuid[]) loop
      perform public.assoc_add('task', v_task.id, 'scope', v_scope_id, p_organization_id);
    end loop;
    v_tasks := v_tasks || jsonb_build_array(to_jsonb(v_task));
  end loop;
  return jsonb_build_object('tasks', v_tasks);
end;
$function$;

create or replace function public.log_client_error(
  p_source text,
  p_message text,
  p_code text default null,
  p_route text default null,
  p_request_id text default null,
  p_conversation_id uuid default null,
  p_stack text default null,
  p_payload jsonb default null,
  p_context jsonb default null,
  p_organization_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_org uuid;
  v_id uuid;
begin
  if auth.role() = 'service_role'
     or (v_user is not null and coalesce(iam.has_org_access(p_organization_id), false)) then
    v_org := p_organization_id;
  end if;
  if v_org is null and v_user is not null then
    select o.id into v_org
    from iam.organizations o
    where o.created_by = v_user and o.is_personal = true
    order by o.created_at limit 1;
  end if;
  if v_org is null then
    select s.organization_id into v_org
    from iam.system_orgs s
    join iam.organizations o on o.id = s.organization_id
    where o.slug = 'matrx-system'
    limit 1;
  end if;
  if v_org is null then return null; end if;

  insert into public.system_error (
    id, kind, source_app, error_type, error_text, route, request_id,
    conversation_id, traceback, payload, context,
    user_id, created_by, organization_id, occurred_at, created_at
  ) values (
    gen_random_uuid(), coalesce(nullif(p_source, ''), 'client-error'), 'matrx-frontend',
    p_code, coalesce(nullif(p_message, ''), '(no message)'), p_route, p_request_id,
    p_conversation_id, p_stack, p_payload, p_context,
    v_user, v_user, v_org, now(), now()
  ) returning id into v_id;
  return v_id;
exception when others then
  return null;
end;
$function$;

revoke execute on function public.agx_create_shortcut(uuid,text,uuid,uuid,uuid,uuid,uuid,boolean)
  from public, anon;
revoke execute on function public.create_tasks_bulk(jsonb,uuid,uuid,uuid[],text,uuid,jsonb)
  from public, anon;
grant execute on function public.agx_create_shortcut(uuid,text,uuid,uuid,uuid,uuid,uuid,boolean)
  to authenticated, service_role;
grant execute on function public.create_tasks_bulk(jsonb,uuid,uuid,uuid[],text,uuid,jsonb)
  to authenticated, service_role;

-- Guest diagnostics intentionally remains anon-callable, but an anonymous
-- caller can no longer choose the tenant attribution.
revoke execute on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid)
  from public;
grant execute on function public.log_client_error(text,text,text,text,text,uuid,text,jsonb,jsonb,uuid)
  to anon, authenticated, service_role;

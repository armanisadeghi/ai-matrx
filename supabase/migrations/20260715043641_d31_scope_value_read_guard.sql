-- D31: scope value/config reads are organization-private.  Resolve the owning
-- organization from the scope/type inside the definer and authorize it before
-- returning any cell data or history.

create or replace function public.get_scope_context(
  p_scope_id uuid,
  p_item_ids uuid[] default null,
  p_include_empty boolean default false
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
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

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

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
$function$;

create or replace function public.get_value_history(
  p_scope_id uuid,
  p_context_item_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  v_result jsonb;
  v_org_id uuid;
begin
  select s.organization_id
  into v_org_id
  from context.scopes s
  where s.id = p_scope_id
    and s.deleted_at is null;

  if v_org_id is null then
    return '[]'::jsonb;
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', civ.id,
      'version', civ.version,
      'is_current', civ.is_current,
      'value_text', civ.value_text,
      'value_number', civ.value_number,
      'value_boolean', civ.value_boolean,
      'value_json', civ.value_json,
      'change_summary', civ.change_summary,
      'authored_by', civ.authored_by,
      'created_at', civ.created_at
    )
    order by civ.version desc
  )
  into v_result
  from (
    select *
    from context.context_item_values
    where scope_id = p_scope_id
      and context_item_id = p_context_item_id
    order by version desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) civ;

  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.apply_template_by_key(
  p_template_key text,
  p_org_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_template_id uuid;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  select t.id
  into v_template_id
  from context.templates t
  where t.key = p_template_key
    and t.is_active = true;

  if v_template_id is null then
    raise exception 'Template with key % not found', p_template_key
      using errcode = 'P0002';
  end if;

  return public.apply_template(v_template_id, p_org_id);
end;
$function$;

revoke execute on function public.get_scope_context(uuid, uuid[], boolean)
  from public, anon;
revoke execute on function public.get_value_history(uuid, uuid, integer)
  from public, anon;
revoke execute on function public.apply_template_by_key(text, uuid)
  from public, anon;

grant execute on function public.get_scope_context(uuid, uuid[], boolean)
  to authenticated, service_role;
grant execute on function public.get_value_history(uuid, uuid, integer)
  to authenticated, service_role;
grant execute on function public.apply_template_by_key(text, uuid)
  to authenticated, service_role;

do $verification$
begin
  if has_function_privilege('anon', 'public.get_scope_context(uuid,uuid[],boolean)', 'execute')
     or has_function_privilege('anon', 'public.get_value_history(uuid,uuid,integer)', 'execute')
     or has_function_privilege('anon', 'public.apply_template_by_key(text,uuid)', 'execute') then
    raise exception 'D31 scope value read revocation failed';
  end if;
end;
$verification$;

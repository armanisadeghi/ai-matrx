-- D31: close the scope-template arbitrary-organization write path.
--
-- All three RPCs bypass RLS.  The target organization therefore has to be
-- resolved and authorized inside the function before any catalog read/write.

create or replace function public.apply_template(
  p_template_id uuid,
  p_org_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_template_type record;
  v_type_id_map jsonb := '{}'::jsonb;
  v_new_type_id uuid;
  v_field record;
  v_created_types jsonb := '[]'::jsonb;
  v_items_count integer := 0;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from context.templates t
    where t.id = p_template_id
      and t.is_active = true
  ) then
    raise exception 'active template % not found', p_template_id
      using errcode = 'P0002';
  end if;

  for v_template_type in
    select *
    from context.template_scope_types
    where template_id = p_template_id
    order by sort_order
  loop
    insert into context.scope_types (
      organization_id,
      label_singular,
      label_plural,
      icon,
      description,
      sort_order,
      max_assignments_per_entity
    ) values (
      p_org_id,
      v_template_type.label_singular,
      v_template_type.label_plural,
      v_template_type.icon,
      v_template_type.description,
      v_template_type.sort_order,
      v_template_type.max_assignments_per_entity
    )
    returning id into v_new_type_id;

    v_type_id_map := v_type_id_map
      || jsonb_build_object(v_template_type.id::text, v_new_type_id::text);
    v_created_types := v_created_types || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id,
      'label_singular', v_template_type.label_singular,
      'label_plural', v_template_type.label_plural
    ));

    for v_field in
      select *
      from context.template_context_items
      where template_scope_type_id = v_template_type.id
      order by sort_order
    loop
      insert into context.context_items (
        scope_type_id,
        key,
        display_name,
        description,
        value_type,
        status,
        fetch_hint,
        sensitivity,
        source_type,
        created_by
      ) values (
        v_new_type_id,
        v_field.key,
        v_field.display_name,
        v_field.description,
        v_field.value_type,
        'active',
        'on_demand',
        'internal',
        'manual',
        auth.uid()
      );
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  for v_template_type in
    select id, parent_template_type_id
    from context.template_scope_types
    where template_id = p_template_id
      and parent_template_type_id is not null
  loop
    update context.scope_types
    set parent_type_id = (
      v_type_id_map ->> v_template_type.parent_template_type_id::text
    )::uuid
    where id = (v_type_id_map ->> v_template_type.id::text)::uuid;
  end loop;

  return jsonb_build_object(
    'template_id', p_template_id,
    'organization_id', p_org_id,
    'scope_types_created', v_created_types,
    'context_items_count', v_items_count
  );
end;
$function$;

create or replace function public.create_context_item(
  p_scope_type_id uuid,
  p_key text,
  p_display_name text,
  p_value_type context_value_type,
  p_description text default '',
  p_category text default null,
  p_fetch_hint context_fetch_hint default 'on_demand',
  p_sensitivity context_sensitivity default 'internal',
  p_tags text[] default '{}',
  p_slug text default null,
  p_sort_order smallint default null,
  p_allowed_reference_types text[] default null,
  p_max_items integer default 1,
  p_allowed_scope_type_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_sort smallint;
  v_org_id uuid;
begin
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    raise exception 'active scope type % not found', p_scope_type_id
      using errcode = 'P0002';
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  v_sort := coalesce(
    p_sort_order,
    (
      select (coalesce(max(ci.sort_order), 0) + 1)::smallint
      from context.context_items ci
      where ci.scope_type_id = p_scope_type_id
        and ci.is_active = true
    )
  );

  insert into context.context_items (
    scope_type_id,
    key,
    display_name,
    description,
    category,
    value_type,
    fetch_hint,
    sensitivity,
    status,
    source_type,
    tags,
    slug,
    sort_order,
    created_by,
    allowed_reference_types,
    max_items,
    allowed_scope_type_ids
  ) values (
    p_scope_type_id,
    p_key,
    p_display_name,
    p_description,
    p_category,
    p_value_type,
    p_fetch_hint,
    p_sensitivity,
    'active',
    'manual',
    p_tags,
    p_slug,
    v_sort,
    auth.uid(),
    p_allowed_reference_types,
    coalesce(p_max_items, 1),
    p_allowed_scope_type_ids
  )
  returning id into v_id;

  return (
    select to_jsonb(ci.*)
    from context.context_items ci
    where ci.id = v_id
  );
end;
$function$;

create or replace function public.list_scope_type_items(p_scope_type_id uuid)
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
  select st.organization_id
  into v_org_id
  from context.scope_types st
  where st.id = p_scope_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    raise exception 'active scope type % not found', p_scope_type_id
      using errcode = 'P0002';
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
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
$function$;

alter function public.apply_template_by_key(text, uuid)
  set search_path = public, pg_temp;
alter function public.list_templates(text, boolean)
  set search_path = public, pg_temp;

revoke execute on function public.apply_template(uuid, uuid) from public, anon;
revoke execute on function public.create_context_item(
  uuid, text, text, context_value_type, text, text, context_fetch_hint,
  context_sensitivity, text[], text, smallint, text[], integer, uuid[]
) from public, anon;
revoke execute on function public.list_scope_type_items(uuid) from public, anon;
revoke execute on function public.apply_template_by_key(text, uuid) from public, anon;

grant execute on function public.apply_template(uuid, uuid) to authenticated, service_role;
grant execute on function public.create_context_item(
  uuid, text, text, context_value_type, text, text, context_fetch_hint,
  context_sensitivity, text[], text, smallint, text[], integer, uuid[]
) to authenticated, service_role;
grant execute on function public.list_scope_type_items(uuid) to authenticated, service_role;
grant execute on function public.apply_template_by_key(text, uuid) to authenticated, service_role;

do $verification$
begin
  if has_function_privilege('anon', 'public.apply_template(uuid,uuid)', 'execute')
     or has_function_privilege('anon', 'public.create_context_item(uuid,text,text,context_value_type,text,text,context_fetch_hint,context_sensitivity,text[],text,smallint,text[],integer,uuid[])', 'execute')
     or has_function_privilege('anon', 'public.list_scope_type_items(uuid)', 'execute') then
    raise exception 'D31 scope-template anon EXECUTE revocation failed';
  end if;
end;
$verification$;

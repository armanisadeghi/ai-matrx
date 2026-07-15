-- D31/D2 overlap: every organization-scoped definer read derives authority
-- from the JWT before returning private scope structure.

create or replace function public.list_scope_types(p_org_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
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
$function$;

create or replace function public.list_scopes(
  p_org_id uuid,
  p_type_id uuid default null,
  p_parent_scope_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color,
      'child_count', (select count(*) from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null),
      'assignment_count', (select count(*) from platform.associations a where a.target_type = 'scope' and a.target_id = s.id)
    ) order by s.sort_order, s.name
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

create or replace function public.get_scope_tree(
  p_org_id uuid,
  p_type_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
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
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.search_scopes(
  p_org_id uuid,
  p_query text,
  p_type_id uuid default null
)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'parent_scope_id', s.parent_scope_id,
      'type_id', st.id,
      'type_label', st.label_singular,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.name ilike '%' || coalesce(p_query, '') || '%'
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$;

create or replace function public.get_org_structure(p_org_id uuid)
returns jsonb language plpgsql stable security definer
set search_path = public, pg_temp
as $function$
declare v_types jsonb; v_scopes jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for organization %', p_org_id using errcode = '42501';
  end if;
  select jsonb_agg(
    to_jsonb(st.*) || jsonb_build_object('parent_type_label', pt.label_singular)
    order by st.sort_order
  ) into v_types
  from context.scope_types st
  left join context.scope_types pt on st.parent_type_id = pt.id
  where st.organization_id = p_org_id and st.deleted_at is null;

  select jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'description', s.description,
      'scope_type_id', s.scope_type_id,
      'parent_scope_id', s.parent_scope_id,
      'type_label', st.label_singular,
      'type_icon', st.icon,
      'type_color', st.color
    ) order by st.sort_order, s.name
  ) into v_scopes
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null;

  return jsonb_build_object(
    'types', coalesce(v_types, '[]'::jsonb),
    'scopes', coalesce(v_scopes, '[]'::jsonb)
  );
end;
$function$;

revoke execute on function public.list_scope_types(uuid) from public, anon;
revoke execute on function public.list_scopes(uuid, uuid, uuid) from public, anon;
revoke execute on function public.get_scope_tree(uuid, uuid) from public, anon;
revoke execute on function public.search_scopes(uuid, text, uuid) from public, anon;
revoke execute on function public.get_org_structure(uuid) from public, anon;

grant execute on function public.list_scope_types(uuid) to authenticated, service_role;
grant execute on function public.list_scopes(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.get_scope_tree(uuid, uuid) to authenticated, service_role;
grant execute on function public.search_scopes(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.get_org_structure(uuid) to authenticated, service_role;

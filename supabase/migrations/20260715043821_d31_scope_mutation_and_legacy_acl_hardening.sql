-- D31: protect the remaining active scope-type mutation and retire direct
-- browser access to two dormant legacy definer surfaces.

create or replace function public.update_scope_type(
  p_type_id uuid,
  p_label_singular text default null,
  p_label_plural text default null,
  p_icon text default null,
  p_description text default null,
  p_sort_order smallint default null,
  p_max_assignments smallint default null,
  p_color text default null,
  p_slug text default null
)
returns jsonb
language plpgsql
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
  where st.id = p_type_id
    and st.deleted_at is null;

  if v_org_id is null then
    raise exception 'active scope type % not found', p_type_id
      using errcode = 'P0002';
  end if;

  if (auth.role() = 'service_role' or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for organization %', v_org_id
      using errcode = '42501';
  end if;

  update context.scope_types
  set label_singular = coalesce(p_label_singular, label_singular),
      label_plural = coalesce(p_label_plural, label_plural),
      icon = coalesce(p_icon, icon),
      description = coalesce(p_description, description),
      sort_order = coalesce(p_sort_order, sort_order),
      max_assignments_per_entity = coalesce(
        p_max_assignments,
        max_assignments_per_entity
      ),
      color = coalesce(p_color, color),
      slug = coalesce(p_slug, slug),
      updated_at = now()
  where id = p_type_id
  returning to_jsonb(context.scope_types.*) into v_result;

  return v_result;
end;
$function$;

revoke execute on function public.update_scope_type(
  uuid, text, text, text, text, smallint, smallint, text, text
) from public, anon;
grant execute on function public.update_scope_type(
  uuid, text, text, text, text, smallint, smallint, text, text
) to authenticated, service_role;

-- No live repository caller remains for these legacy RPCs.  Their former
-- authenticated grants exposed arbitrary entity scope links and arbitrary-org
-- template-definition writes.  Keep them available only to trusted services.
revoke execute on function public.get_entity_scopes(text, uuid)
  from public, anon, authenticated;
revoke execute on function public.apply_template_definition(uuid, jsonb)
  from public, anon, authenticated;
revoke execute on function public.list_entities_by_scopes(uuid[], text, boolean)
  from public, anon, authenticated;
grant execute on function public.get_entity_scopes(text, uuid) to service_role;
grant execute on function public.apply_template_definition(uuid, jsonb) to service_role;
grant execute on function public.list_entities_by_scopes(uuid[], text, boolean)
  to service_role;

do $verification$
begin
  if has_function_privilege('anon', 'public.update_scope_type(uuid,text,text,text,text,smallint,smallint,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.get_entity_scopes(text,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.apply_template_definition(uuid,jsonb)', 'execute')
     or has_function_privilege('authenticated', 'public.list_entities_by_scopes(uuid[],text,boolean)', 'execute') then
    raise exception 'D31 scope legacy ACL hardening failed';
  end if;
end;
$verification$;

-- chair-step: Inverse of campaign/templates7_d_a_scope_template_is_installed_from_the_one_gallery.sql — recreates custom.context_template_apply(uuid, uuid), public.apply_template(uuid, uuid) and public.apply_template_by_key(text, uuid) with the bodies, settings and grants they had on 2026-10-05, and their three platform.client_callable_door rows (written before the grants).

set local statement_timeout = '60s';

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_def jsonb;
begin
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_apply');
  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active) then
    raise exception 'There is no such template to apply; it may have been retired.' using errcode = 'P0002',
            detail = jsonb_build_object('template_id', p_template_id)::text;
  end if;
  -- THE PLATFORM'S TEMPLATE CATALOGUE STAYS REFERENCE DATA (SCOPES-CONTEXT D10); applying one is a
  -- store operation, through the same doors as any other scope type and field.
  select jsonb_build_object('scope_types', coalesce(jsonb_agg(jsonb_build_object(
           'key', st.id::text,
           'singular', st.label_singular, 'plural', st.label_plural,
           'icon', st.icon, 'description', st.description, 'sort_order', st.sort_order,
           'max_assignments_per_entity', st.max_assignments_per_entity,
           'parent_key', st.parent_template_type_id::text,
           'slug', context.slugify(st.label_plural),
           'fields', (select coalesce(jsonb_agg(jsonb_build_object(
                               'key', ti.key, 'display_name', ti.display_name, 'description', ti.description,
                               'value_type', ti.value_type::text, 'sort_order', ti.sort_order) order by ti.sort_order, ti.key), '[]'::jsonb)
                        from context.template_context_items ti where ti.template_scope_type_id = st.id))
           order by st.sort_order, st.id), '[]'::jsonb))
    into v_def
    from context.template_scope_types st
   where st.template_id = p_template_id;
  return jsonb_build_object('template_id', p_template_id)
         || custom.context_template_define(p_organization_id, v_def);
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_res jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  -- THROUGH THE STORE'S DOORS (FTS-1e): the template is applied by custom.context_template_apply (every scope type
  -- and field through custom.context_type_write / custom.context_item_write; a reference field points at a scope of
  -- its own type, as before). The answer keeps this function's own shape.
  v_res := custom.context_template_apply(p_org_id, p_template_id);
  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', coalesce((select jsonb_agg(jsonb_build_object('id', t -> 'id', 'label_singular', t -> 'label_singular',
                                                                         'label_plural', t -> 'label_plural') order by o)
                                       from jsonb_array_elements(v_res -> 'scope_types_created') with ordinality x(t, o)), '[]'::jsonb),
    'context_items_count', coalesce((v_res ->> 'context_items_count')::int, 0));
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template_by_key(p_template_key text, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_id uuid;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;

  select t.id
  into v_template_id
  from context.templates t
  where t.key = p_template_key
    and t.is_active = true;

  if v_template_id is null then
    perform platform.refuse_not_found(format('Template with key %s not found', p_template_key));
  end if;

  return public.apply_template(v_template_id, p_org_id);
end;
$function$;

revoke all on function custom.context_template_apply(uuid, uuid) from public;
revoke all on function public.apply_template(uuid, uuid) from public;
revoke all on function public.apply_template_by_key(text, uuid) from public;

insert into platform.client_callable_door (schema_name, function_name, identity_args, declared_by, reason, signed_in_callers, anonymous_callers, non_client_lane, refusal_only)
values
  ('custom', 'context_template_apply', 'p_organization_id uuid, p_template_id uuid', 'scopeswt_the_scope_doors.sql',
   'SECURITY INVOKER scope door: applies one of the platform''s active templates (context.templates, reference data) to p_organization_id by handing its definition to custom.context_template_define, so every scope type and field it makes goes through custom.context_type_write / custom.context_item_write and their checks.',
   true, false, null, false),
  ('public', 'apply_template', 'p_template_id uuid, p_org_id uuid', 'DD-169 batch 3 / B-75',
   'Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 9 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.',
   false, false, 'server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.', false),
  ('public', 'apply_template_by_key', 'p_template_key text, p_org_id uuid', 'DD-169 batch 3 / B-75',
   'Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 1 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.',
   false, false, 'server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.', false);

grant execute on function custom.context_template_apply(uuid, uuid) to authenticated, service_role;
grant execute on function public.apply_template(uuid, uuid) to service_role;
grant execute on function public.apply_template_by_key(text, uuid) to service_role;

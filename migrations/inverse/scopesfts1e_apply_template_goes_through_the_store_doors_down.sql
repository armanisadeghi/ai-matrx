-- chair-step: INVERSE of migrations/campaign/scopesfts1e_apply_template_goes_through_the_store_doors.sql (lane FINISH-THE-SWITCH, FTS-1e): restores public.apply_template as production held it on 2026-10-05 (inserts the old scope rows directly).
-- lane: FINISH-THE-SWITCH (FTS-1e)
-- lock: custom

CREATE OR REPLACE FUNCTION public.apply_template(p_template_id uuid, p_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_template_type record;
  v_type_id_map jsonb := '{}'::jsonb;
  v_new_type_id uuid;
  v_field record;
  v_created_types jsonb := '[]'::jsonb;
  v_items_count integer := 0;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;

  if not exists (select 1 from context.templates t where t.id = p_template_id and t.is_active = true) then
    perform platform.refuse_not_found(format('active template %s not found', p_template_id));
  end if;

  for v_template_type in
    select * from context.template_scope_types where template_id = p_template_id order by sort_order
  loop
    insert into context.scope_types (
      organization_id, label_singular, label_plural, icon, description,
      sort_order, max_assignments_per_entity, slug
    ) values (
      p_org_id, v_template_type.label_singular, v_template_type.label_plural,
      v_template_type.icon, v_template_type.description, v_template_type.sort_order,
      v_template_type.max_assignments_per_entity,
      context.slugify(v_template_type.label_plural)   -- explicit; trigger also guarantees this
    )
    returning id into v_new_type_id;

    v_type_id_map := v_type_id_map || jsonb_build_object(v_template_type.id::text, v_new_type_id::text);
    v_created_types := v_created_types || jsonb_build_array(jsonb_build_object(
      'id', v_new_type_id, 'label_singular', v_template_type.label_singular, 'label_plural', v_template_type.label_plural));

    for v_field in
      select * from context.template_context_items where template_scope_type_id = v_template_type.id order by sort_order
    loop
      -- A REFERENCE FIELD POINTS AT A SCOPE OF ITS OWN TYPE (SCOPES-WRITE-THROUGH). Every business
      -- template's "Reports To" is "the team member this person reports to", and a reference item
      -- must name what it may point at (context_items_reference_types_required): without this, 26 of
      -- the 34 templates could not be applied at all.
      insert into context.context_items (
        scope_type_id, key, display_name, description, value_type,
        status, fetch_hint, sensitivity, source_type, created_by,
        allowed_reference_types, allowed_scope_type_ids
      ) values (
        v_new_type_id, v_field.key, v_field.display_name, v_field.description, v_field.value_type,
        'active', 'on_demand', 'internal', 'manual', (select auth.uid()),
        case when v_field.value_type = 'reference' then array['scope'] end,
        case when v_field.value_type = 'reference' then array[v_new_type_id] end
        -- slug auto-mirrored from key by context.ensure_slug()
      );
      v_items_count := v_items_count + 1;
    end loop;
  end loop;

  for v_template_type in
    select id, parent_template_type_id from context.template_scope_types
    where template_id = p_template_id and parent_template_type_id is not null
  loop
    update context.scope_types
    set parent_type_id = (v_type_id_map ->> v_template_type.parent_template_type_id::text)::uuid
    where id = (v_type_id_map ->> v_template_type.id::text)::uuid;
  end loop;

  return jsonb_build_object(
    'template_id', p_template_id, 'organization_id', p_org_id,
    'scope_types_created', v_created_types, 'context_items_count', v_items_count);
end;
$function$
;

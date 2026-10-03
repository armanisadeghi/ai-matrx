-- chair-step: the inverse of scopesw2w_the_scope_type_door_writes_the_store_first.sql — restores the body of custom.context_type_write as it stood on production and the clone 2026-10-03 04:20Z, in which the door decides and writes through public.create_scope_type / public.update_scope_type and the store follows.
-- lane: SCOPES-ON-THE-STORE
-- based-on: custom.context_type_write(uuid, uuid, jsonb) 956a8daf4b9f013000e301f9b2aa0b0049cb6fe5d970bdf672d66a6564f722df
-- lock: custom

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
  v_parent uuid;
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  elsif s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
    -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS): what the agents' structure tool
    -- could always do and public.update_scope_type cannot (it COALESCEs every column and has no
    -- parent). One row write, under update_scope_type's own check, in its own sentences.
    select t.organization_id into v_org from context.scope_types t where t.id = p_type_id and t.deleted_at is null;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' and v_parent is not null and (
         v_parent = p_type_id
         or not exists (select 1 from context.scope_types st
                         where st.id = v_parent and st.organization_id = v_org and st.deleted_at is null)
         or exists (with recursive under as (
                      select st.id from context.scope_types st where st.parent_type_id = p_type_id
                      union
                      select st.id from context.scope_types st join under u on st.parent_type_id = u.id)
                    select 1 from under where under.id = v_parent)) then
      raise exception 'That parent is not a scope type of this organization this type can sit under.'
        using errcode = '22023',
              hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
    end if;
    update context.scope_types t
       set parent_type_id = case when s ? 'parent_type_id' then v_parent else t.parent_type_id end,
           label_singular = coalesce(s ->> 'label_singular', t.label_singular),
           label_plural = coalesce(s ->> 'label_plural', t.label_plural),
           icon = coalesce(s ->> 'icon', t.icon),
           description = coalesce(s ->> 'description', t.description),
           sort_order = coalesce((s ->> 'sort_order')::smallint, t.sort_order),
           max_assignments_per_entity = case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                             else t.max_assignments_per_entity end,
           color = coalesce(s ->> 'color', t.color),
           slug = coalesce(nullif(s ->> 'slug', ''), t.slug),
           updated_at = now()
     where t.id = p_type_id
    returning to_jsonb(t.*) into v_row;
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
    perform custom.assert_client_may_reach(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$;


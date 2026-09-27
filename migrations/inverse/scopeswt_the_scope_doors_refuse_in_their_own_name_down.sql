-- INVERSE of migrations/campaign/scopeswt_the_scope_doors_refuse_in_their_own_name.sql (lane SCOPES-WRITE-THROUGH).
-- chair-step: puts back the three door bodies as scopeswt_the_scope_doors.sql / scopeswt_the_scope_doors_decide_who_is_asking.sql made them and drops custom.assert_scope_door with its door row.
-- ground-standing-ok: b — runs first of this lane's inverses (8 → 7 → … → 1).
-- based-on: custom.context_type_write(uuid, uuid, jsonb) 7c5dcfdb54bcc009748c7fd587261c0f6d1a1eff5b0c9b0fd149eae32c0e46fb
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) 3f393f455a253a58e6e72fef19a04e63716ef2a2799a42bda391ac96ddedd491
-- based-on: custom.context_template_apply(uuid, uuid) f1b3036e959676570bc52ec0b65b9b36d942d34da7014efdb5ebfed51ea1775a

CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  v_org uuid := p_organization_id;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    v_row := public.create_scope_type(
      v_org, s ->> 'label_singular', s ->> 'label_plural', nullif(s ->> 'parent_type_id', '')::uuid,
      coalesce(s ->> 'icon', 'folder'), coalesce(s ->> 'description', ''),
      coalesce((s ->> 'sort_order')::smallint, 0::smallint), (s ->> 'max_assignments')::smallint,
      coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]),
      s ->> 'color', nullif(s ->> 'slug', ''));
  else
    v_row := public.update_scope_type(
      p_type_id, s ->> 'label_singular', s ->> 'label_plural', s ->> 'icon', s ->> 'description',
      (s ->> 'sort_order')::smallint, (s ->> 'max_assignments')::smallint, s ->> 'color', nullif(s ->> 'slug', ''));
    v_org := (v_row ->> 'organization_id')::uuid;
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
  s jsonb := coalesce(p_spec, '{}'::jsonb);
begin
  if p_scope_id is null then
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$

;

delete from platform.client_callable_door where schema_name = 'custom' and function_name = 'assert_scope_door';
drop function if exists custom.assert_scope_door(uuid, text);

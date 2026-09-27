-- chair-step: lane SCOPES-WRITE-THROUGH, store-doors-decide census 17 ("doors whose refusal names a door the person never called"): custom.context_type_write, context_scope_write and context_template_apply decided their caller only through custom._ctx_answer, so a refused person heard a helper's name. Each now decides first, in its own name, through the new custom.assert_scope_door (custom.assert_client_may_reach under the door's name). Nothing else changes.
-- based-on: custom.context_type_write(uuid, uuid, jsonb) fdcacb886d1d7eb14ec6cf063d639bbe50505f3cb601addef84acbdec030b841
-- based-on: custom.context_scope_write(uuid, uuid, uuid, jsonb) 83033858434cf4e1fbf3d30fd610eb8d53138ba9012cd240b35205831da47f39
-- based-on: custom.context_template_apply(uuid, uuid) 87635a30af1aa761a0e7ffb095e49304684fbdbcf6b71456cdca7830d49eb128
-- lane: SCOPES-WRITE-THROUGH
-- INVERSE: migrations/inverse/scopeswt_the_scope_doors_refuse_in_their_own_name_down.sql
-- window-class: function bodies and one new function. Applied directly (owner, 2026-09-24).

create or replace function custom.assert_scope_door(p_organization_id uuid, p_door text)
 returns void
 language plpgsql
 stable
 security definer
 set search_path to 'pg_catalog'
as $function$
begin
  -- THE SCOPE DOORS DECIDE WHO IS ASKING, IN THEIR OWN NAME (store-doors-decide, census 17): a person
  -- refused by custom.context_type_write hears "custom.context_type_write", never a helper's name.
  -- The one ladder (custom.assert_client_may_reach) decides; nothing else.
  perform custom.assert_client_may_reach(p_organization_id, p_door);
end;
$function$;
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by, signed_in_callers, anonymous_callers)
values ('custom', 'assert_scope_door', 'p_organization_id uuid, p_door text', array['uuid'::regtype, 'text'::regtype]::oid[],
        'The scope doors (custom.context_*, SECURITY INVOKER) decide their caller through it: custom.assert_client_may_reach on p_organization_id under the name of the door the person called. Returns nothing; refuses 42501 a caller who may not reach the organization.',
        'scopeswt_the_scope_doors_refuse_in_their_own_name.sql', true, false)
on conflict do nothing;
grant execute on function custom.assert_scope_door(uuid, text) to authenticated, service_role;

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
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
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
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(coalesce(v_org, (v_row ->> 'organization_id')::uuid), (v_row ->> 'id')::uuid, v_row);
end;
$function$;

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
    perform custom.assert_scope_door(p_organization_id, 'custom.context_scope_write');
    v_row := public.create_scope(
      p_organization_id, p_type_id, s ->> 'name', nullif(s ->> 'parent_scope_id', '')::uuid,
      coalesce(s ->> 'description', ''), coalesce(s -> 'settings', '{}'::jsonb), nullif(s ->> 'slug', ''),
      (s ->> 'sort_order')::smallint);
  else
    v_row := public.update_scope(
      p_scope_id, s ->> 'name', s ->> 'description', case when s ? 'settings' then s -> 'settings' end,
      nullif(s ->> 'slug', ''), (s ->> 'sort_order')::smallint);
  end if;
  if p_scope_id is not null then
    perform custom.assert_scope_door((v_row ->> 'organization_id')::uuid, 'custom.context_scope_write');
  end if;
  return custom._ctx_answer((v_row ->> 'organization_id')::uuid, (v_row ->> 'id')::uuid, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_template_apply(p_organization_id uuid, p_template_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin
  perform custom.assert_scope_door(p_organization_id, 'custom.context_template_apply');
  return public.apply_template(p_template_id, p_organization_id)
         || jsonb_build_object('writer', custom._ctx_answer(p_organization_id, null, null) ->> 'writer');
end;
$function$;

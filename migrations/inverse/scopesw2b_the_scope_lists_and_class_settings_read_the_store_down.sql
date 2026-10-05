-- chair-step: INVERSE of migrations/campaign/scopesw2b_the_scope_lists_and_class_settings_read_the_store.sql (lane FINISH-THE-SWITCH, FTS-1b): restores the eight bodies exactly as production held them on 2026-10-05 (old context.* reads).
-- based-on: public.list_scopes(uuid, uuid, uuid) 454d899d175e38010c33c6a9f56c4660582dc6a3ac1d6a0777c532fce12bdc53
-- based-on: public.search_scopes(uuid, text, uuid) 14f0d9fd574bffefd141729aa4c6b7cf691a4464a348165cc2322d6e923ed778
-- based-on: context._readable_scope_ids() 05ed2a0243f302a55208eb599fd59b788048d836d5b206662188d95019971e7e
-- based-on: context._scope_denial_message(uuid, text) 7204dfb9bf23793e7f15da685542a8852f8ce9e527e5e990d946f4a65faa4be5
-- based-on: public.edu_class_join_code(uuid, text) c48a1bdde15a956aa36dec9a44ae65e9f7b020273b6dbcfe0a33f6d8aaecb1b5
-- based-on: public.edu_class_set_access(uuid, text) fa438d830f39353ed62e72a2eb1244724eb9f104a0ab9889b63754d0d1010ee1
-- based-on: custom._ctx_table_live(uuid, uuid) a6b5059cb63c8dd9a7e292f280dc0ba30b4d2d31bbb186a69827a02ef8953a34
-- based-on: workbench.guard_used_template_fields() 974ffd9f7c76d420531349e3a6c1c58e6f34898bd59b58fba885de1b19d10d97

CREATE OR REPLACE FUNCTION public.list_scopes(p_org_id uuid, p_type_id uuid DEFAULT NULL::uuid, p_parent_scope_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
  end if;
  select jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'type_label', st.label_singular,
      'type_label_plural', st.label_plural,
      'type_icon', st.icon,
      'type_color', st.color,
      'child_count', (select count(*) from context.scopes c where c.parent_scope_id = s.id and c.deleted_at is null),
      'assignment_count', (select count(*) from platform.associations_live a where a.target_type = 'scope' and a.target_id = s.id)
    ) order by s.sort_order, s.name
  ) into v_result
  from context.scopes s
  join context.scope_types st on s.scope_type_id = st.id
  where s.organization_id = p_org_id
    and s.deleted_at is null and st.deleted_at is null
    and s.id in (select context._readable_scope_ids())
    and (p_type_id is null or s.scope_type_id = p_type_id)
    and ((p_parent_scope_id is null and s.parent_scope_id is null) or s.parent_scope_id = p_parent_scope_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.search_scopes(p_org_id uuid, p_query text, p_type_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_result jsonb;
begin
  if (auth.role() = 'service_role' or iam.has_org_access(p_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
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
    and s.id in (select context._readable_scope_ids())
    and s.name ilike '%' || coalesce(p_query, '') || '%'
    and (p_type_id is null or s.scope_type_id = p_type_id);
  return coalesce(v_result, '[]'::jsonb);
end;
$function$

;

CREATE OR REPLACE FUNCTION context._readable_scope_ids()
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.role() = 'service_role' then
    return query select s.id from context.scopes s;
    return;
  end if;
  return query select iam.unnest_uuids(iam.accessible_entity_ids('scope', 'viewer'::public.permission_level));
end;
$function$

;

CREATE OR REPLACE FUNCTION context._scope_denial_message(p_scope_id uuid, p_level text DEFAULT 'viewer'::text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_name text;
begin
  select s.name into v_name
  from context.scopes s
  where s.id = p_scope_id and s.deleted_at is null;

  if v_name is null then
    return 'That record no longer exists, or it was deleted.';
  end if;

  if p_level <> 'viewer' and context._scope_readable(p_scope_id, 'viewer') then
    return format('You can view "%s" but you cannot change it. Ask for edit access on that record.', v_name);
  end if;

  return format('You do not have access to "%s". Ask someone who can already open it to share it with you.', v_name);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.edu_class_join_code(p_class uuid, p_action text DEFAULT 'get'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_scope public._edu_class_row;
  v_uid uuid := (select auth.uid());
  v_code text;
  v_settings jsonb;
begin
  if v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_action not in ('get', 'rotate', 'disable') then
    raise exception 'invalid action %', p_action using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'class owner required' using errcode = '42501';
  end if;

  v_code := v_scope.settings->>'join_code';

  if p_action = 'disable' then
    select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) - 'join_code'));
    return jsonb_build_object('code', null);
  end if;

  if p_action = 'rotate' or v_code is null then
    v_code := public._edu_generate_join_code();
    select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
    perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
      jsonb_build_object('settings', jsonb_set(coalesce(v_settings, '{}'::jsonb), '{join_code}', to_jsonb(v_code))));
  end if;

  return jsonb_build_object('code', v_code);
end;
$function$

;

CREATE OR REPLACE FUNCTION public.edu_class_set_access(p_class uuid, p_access_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_scope public._edu_class_row; v_settings jsonb;
begin
  if p_access_mode not in ('open', 'closed', 'paid') then
    raise exception 'invalid access_mode %', p_access_mode using errcode = '22023';
  end if;
  v_scope := public._edu_class_of(p_class);
  if not public._edu_is_owner(v_scope) then
    raise exception 'only the class owner can change access mode' using errcode = '42501';
  end if;
  -- The write merges into the row's own settings (SCOPES-READS-ACCESS) and goes through the scope
  -- door (SCOPES-OLD-WRITERS): the class is read from the store, and a copy of its settings is never
  -- written back over the old row.
  select coalesce(sc.settings, '{}'::jsonb) into v_settings from context.scopes sc where sc.id = v_scope.id for update;
  perform custom.context_scope_write(v_scope.organization_id, v_scope.id, null,
    jsonb_build_object('settings', coalesce(v_settings, '{}'::jsonb) || jsonb_build_object('access_mode', p_access_mode)));
  perform public._edu_ensure_owner_membership(v_scope);
  return jsonb_build_object('status', 'ok', 'access_mode', p_access_mode);
end;
$function$

;

CREATE OR REPLACE FUNCTION custom._ctx_table_live(p_org uuid, p_type uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_row jsonb;
begin
  if exists (select 1 from custom.record r where r.organization_id = p_org and r.id = p_type and r.deleted_at is null) then
    return true;
  end if;
  select to_jsonb(t) into v_row from context.scope_types t where t.id = p_type and t.deleted_at is null;
  if v_row is null then
    return false;
  end if;
  perform custom._ctx_store_type(p_org, p_type, v_row);
  return true;
end;
$function$

;

CREATE OR REPLACE FUNCTION workbench.guard_used_template_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  -- SWITCH-STEP-TWO: a template is instantiated when a scope holds a table made from it.
  if exists (select 1 from context.scope_dataset_instances i where i.template_id = coalesce(new.template_id, old.template_id)) then
    raise exception 'template % is already instantiated; create a new template version instead of changing its fields',
      coalesce(new.template_id, old.template_id) using errcode = '55000';
  end if;
  return coalesce(new, old);
end; $function$

;

-- (the three platform.client_callable_door rows the up file declared are left: the restored bodies of context._readable_scope_ids and _scope_denial_message are still SECURITY DEFINER and need them; the guard row is harmless on an invoker body.)

-- chair-step: lane SCOPE-ADMIN-2 inverse. Restores the six scope structural write doors to the bodies they had before the admin-lane arm (public.is_platform_admin()) was added: a non-member platform admin is refused again on /administration/scopes-context/organizations/<id>.

set local lock_timeout = '30s';

CREATE OR REPLACE FUNCTION public.create_scope_type(p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid DEFAULT NULL::uuid, p_icon text DEFAULT 'folder'::text, p_description text DEFAULT ''::text, p_sort_order smallint DEFAULT 0, p_max_assignments smallint DEFAULT NULL::smallint, p_default_variable_keys text[] DEFAULT '{}'::text[], p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  IF NOT iam.has_org_access(p_org_id) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id USING ERRCODE = '42501';
  END IF;
  -- THE PARENT TYPE BELONGS TO THE SAME TENANT (0850): same class as create_scope.
  IF p_parent_type_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM context.scope_types st
        WHERE st.id = p_parent_type_id AND st.organization_id = p_org_id) THEN
    RAISE EXCEPTION 'create_scope_type: parent scope type not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  INSERT INTO context.scope_types (
    organization_id, parent_type_id, label_singular, label_plural,
    icon, description, sort_order, max_assignments_per_entity, default_variable_keys,
    color, slug
  ) VALUES (
    p_org_id, p_parent_type_id, p_label_singular, p_label_plural,
    p_icon, p_description, p_sort_order, p_max_assignments, p_default_variable_keys,
    COALESCE(p_color, ''), p_slug
  )
  RETURNING to_jsonb(context.scope_types.*) INTO v_result;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_scope_type(p_type_id uuid, p_label_singular text DEFAULT NULL::text, p_label_plural text DEFAULT NULL::text, p_icon text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_max_assignments smallint DEFAULT NULL::smallint, p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
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

CREATE OR REPLACE FUNCTION public.delete_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_scope_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope_type.organization_id
  into v_org
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found('scope type not found');
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  join context.scopes as scope on association.target_id = scope.id
  where association.target_type = 'scope'
    and scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  select count(*)
  into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at is null;

  -- THE ONE WRITE. platform._cascade_soft_delete stamps every declared child
  -- (scopes, context items, sub-types) with THIS row's deleted_at, and
  -- public.restore_scope_type reverses exactly that set. The hand-written child
  -- updates that used to live here flipped context_items.is_active instead —
  -- a one-way switch that left live rows under a removed parent (F6).
  update context.scope_types
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_type_id
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_scopes', v_scope_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_scope(p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text, p_settings jsonb DEFAULT '{}'::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_scope context.scopes; v_type_label text; v_sort smallint;
BEGIN
  IF NOT iam.has_org_access(p_org_id) THEN
    RAISE EXCEPTION 'not authorized for organization %', p_org_id USING ERRCODE = '42501';
  END IF;
  -- THE TYPE AND THE PARENT BELONG TO THE SAME TENANT AS THE SCOPE (0850). Proven live:
  -- the non-member test account created a scope of another organization's scope type
  -- and read back that type's label ("Client"); an invented type id answered with a
  -- foreign-key error instead, which told a real id from a made-up one. Both now answer
  -- with this one sentence, before anything is read or written.
  IF p_type_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM context.scope_types st
        WHERE st.id = p_type_id AND st.organization_id = p_org_id) THEN
    RAISE EXCEPTION 'create_scope: scope type not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  IF p_parent_scope_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM context.scopes s
        WHERE s.id = p_parent_scope_id AND s.organization_id = p_org_id AND s.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'create_scope: parent scope not found in this organization'
      USING ERRCODE = '22023';
  END IF;
  v_sort := COALESCE(
    p_sort_order,
    (SELECT COALESCE(MAX(sort_order), 0) + 1
       FROM context.scopes
      WHERE organization_id = p_org_id AND scope_type_id = p_type_id
        AND ((p_parent_scope_id IS NULL AND parent_scope_id IS NULL)
             OR parent_scope_id = p_parent_scope_id))::smallint
  );
  INSERT INTO context.scopes (
    organization_id, scope_type_id, parent_scope_id, name, description, settings, slug, sort_order, created_by
  ) VALUES (
    p_org_id, p_type_id, p_parent_scope_id, p_name, p_description, p_settings, p_slug, v_sort, (select auth.uid())
  )
  RETURNING * INTO v_scope;
  SELECT label_singular INTO v_type_label FROM context.scope_types WHERE id = p_type_id;
  RETURN to_jsonb(v_scope) || jsonb_build_object('type_label', v_type_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_scope(p_scope_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_settings jsonb DEFAULT NULL::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb; v_type_label text; v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_scope_id;
  IF v_org IS NULL OR NOT iam.has_org_access(v_org) THEN
    RAISE EXCEPTION 'not authorized to update scope %', p_scope_id USING ERRCODE = '42501';
  END IF;
  UPDATE context.scopes SET
    name = COALESCE(p_name, name),
    description = COALESCE(p_description, description),
    settings = COALESCE(p_settings, settings),
    slug = COALESCE(p_slug, slug),
    sort_order = COALESCE(p_sort_order, sort_order),
    updated_at = now()
  WHERE id = p_scope_id
  RETURNING to_jsonb(context.scopes.*) INTO v_result;
  SELECT st.label_singular INTO v_type_label
  FROM context.scope_types st JOIN context.scopes s ON s.scope_type_id = st.id
  WHERE s.id = p_scope_id;
  RETURN v_result || jsonb_build_object('type_label', v_type_label);
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_child_count integer;
  v_assignment_count integer;
  v_org uuid;
begin
  select scope.organization_id
  into v_org
  from context.scopes as scope
  where scope.id = p_scope_id
    and scope.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found('scope not found');
  end if;

  if auth.role() <> 'service_role'
     and not exists (
       select 1
       from iam.memberships as membership
       where membership.container_type = 'organization'
         and membership.container_id = v_org
         and membership.organization_id = v_org
         and membership.user_id = (select auth.uid())
         and membership.role in ('owner', 'admin')
         and membership.status = 'active'
         and membership.deleted_at is null
     ) then
    raise exception 'organization owner or admin required'
      using errcode = '42501';
  end if;

  with recursive children as (
    select scope.id
    from context.scopes as scope
    where scope.parent_scope_id = p_scope_id
      and scope.deleted_at is null
    union all
    select scope.id
    from context.scopes as scope
    join children as child on scope.parent_scope_id = child.id
    where scope.deleted_at is null
  )
  select count(*) into v_child_count from children;

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  select count(*)
  into v_assignment_count
  from platform.associations_live as association
  where association.target_type = 'scope'
    and association.target_id in (select id from all_scopes);

  with recursive all_scopes as (
    select p_scope_id as id
    union all
    select scope.id
    from context.scopes as scope
    join all_scopes as parent on scope.parent_scope_id = parent.id
    where scope.deleted_at is null
  )
  update context.scopes
  set deleted_at = now(),
      updated_by = (select auth.uid()),
      updated_at = now()
  where id in (select id from all_scopes)
    and deleted_at is null;

  return jsonb_build_object(
    'deleted_children', v_child_count,
    'deleted_assignments', v_assignment_count
  );
end;
$function$;

-- chair-step: INVERSE of migrations/campaign/scopesfts1f_the_scope_doors_write_no_old_row.sql (lane FINISH-THE-SWITCH, FTS-1f): re-creates the 18 old write functions with their grants and door rows, restores the nine scope doors and the two trash restores as production held them on 2026-10-05, and drops custom.scope_row_of and custom.context_item_row_of. The old rows written by nothing between the two files are not back-filled.
-- lane: FINISH-THE-SWITCH (FTS-1f)
-- lock: custom,public,context
-- ground-standing-ok: b — inverses run newest first: this one restores the doors that call custom._ctx_type_subtree_follows, and the older scopesfts1f_a_scope_type_takes_its_fields_sub_types_and_scopes_in_the_store_down.sql then restores the type doors without it before dropping it.


CREATE OR REPLACE FUNCTION context.index_reference_value(p_value_id uuid, p_item_id uuid, p_scope_id uuid, p_value_text text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_envelope jsonb;
  v_type text;
  v_item jsonb;
  v_key text;
BEGIN
  DELETE FROM context.context_value_refs WHERE value_id = p_value_id;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    RETURN;
  END IF;

  v_type := v_envelope->>'type';
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_envelope->'items')
  LOOP
    v_key := context.reference_item_ref_key(v_type, v_item);
    IF v_key IS NOT NULL THEN
      INSERT INTO context.context_value_refs (value_id, context_item_id, scope_id, ref_type, ref_key)
      VALUES (p_value_id, p_item_id, p_scope_id, v_type, v_key);
    END IF;
  END LOOP;
END;
$function$
;
GRANT EXECUTE ON FUNCTION context.index_reference_value(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION context.index_reference_value(uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION context.index_reference_value(uuid,uuid,uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION context.provision_scope_dataset(p_item_id uuid, p_scope_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_item context.context_items; v_scope context.scopes;
begin
  select * into v_item from context.context_items where id=p_item_id and is_active and deleted_at is null;
  select * into v_scope from context.scopes where id=p_scope_id and deleted_at is null;
  -- ARGS-RULED (2026-09-21). THE CALLER, BEFORE ANYTHING IS MADE IN SOMEBODY ELSE'S TENANT.
  if v_scope.id is not null
     and not iam.is_trusted_backend()
     and not iam.has_org_access(v_scope.organization_id) then
    raise exception 'You are not a member of the organization that scope belongs to, so nothing was provisioned.'
      using errcode = '42501',
            hint = 'A context scope belongs to one organization, and provisioning its template-backed table writes a dataset, its fields and a context value into that organization. Switch to the organization the scope lives in, or ask an owner of it to add you.';
  end if;
  if v_item.id is null or v_scope.id is null or v_item.scope_type_id <> v_scope.scope_type_id then return null; end if;
  if v_item.reference_source->>'container_type' is distinct from 'dataset_template' then return null; end if;
  -- POST-MOVE-DOORS: the older dataset store is in the deprecated. A scope's table is a Table in the record store,
  -- made (or found: a pre-move instance answers with its moved Table) by the store's own door.
  return custom.scope_table_provision(v_scope.organization_id, p_item_id, p_scope_id);
end; $function$
;
GRANT EXECUTE ON FUNCTION context.provision_scope_dataset(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION context.provision_scope_dataset(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION context.provision_scope_dataset(uuid,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION context.validate_reference_value(p_item_id uuid, p_value_text text)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_item context.context_items;
  v_envelope jsonb;
  v_type text;
  v_items jsonb;
  v_count int;
  v_scope_type_id uuid;
  v_scope_id uuid;
BEGIN
  SELECT * INTO v_item FROM context.context_items WHERE id = p_item_id;
  IF NOT FOUND THEN
    raise exception 'context item not found' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  IF v_item.value_type <> 'reference' THEN
    RETURN;
  END IF;

  IF p_value_text IS NULL THEN
    RETURN;
  END IF;

  v_envelope := context.parse_reference_fence(p_value_text);
  IF v_envelope IS NULL THEN
    raise exception 'value is not a valid matrx reference fence for this item' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  v_type := v_envelope->>'type';
  -- POST-MOVE-DOORS: after the final switch a dataset IS a Table in the record store, and a scope's provisioned
  -- table is written with the `table` noun; an item that allows the one allows the other.
  IF v_item.allowed_reference_types IS NULL
     OR NOT (v_type = ANY (v_item.allowed_reference_types)
             OR (v_type IN ('table', 'dataset')
                 AND v_item.allowed_reference_types && ARRAY['table', 'dataset']::text[])) THEN
    raise exception 'reference type % is not allowed on item (allowed: %)', v_type, v_item.allowed_reference_types using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  v_items := v_envelope->'items';
  v_count := COALESCE(jsonb_array_length(v_items), 0);
  IF v_count = 0 THEN
    raise exception 'reference fence for item has no items' using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;
  IF v_count > v_item.max_items THEN
    raise exception 'reference fence for item carries % items, max_items is %', v_count, v_item.max_items using ERRCODE = '22023',
            detail = jsonb_build_object('item_id', p_item_id)::text;
  END IF;

  IF v_type = 'scope' AND v_item.allowed_scope_type_ids IS NOT NULL
     AND cardinality(v_item.allowed_scope_type_ids) > 0 THEN
    FOR v_scope_id IN
      SELECT (elem->>'id')::uuid FROM jsonb_array_elements(v_items) elem
    LOOP
      SELECT scope_type_id INTO v_scope_type_id FROM context.scopes WHERE id = v_scope_id;
      IF v_scope_type_id IS NULL OR NOT (v_scope_type_id = ANY (v_item.allowed_scope_type_ids)) THEN
        raise exception 'scope is not of an allowed scope type for this item' using ERRCODE = '22023',
            detail = jsonb_build_object('scope_id', v_scope_id, 'item_id', p_item_id)::text;
      END IF;
    END LOOP;
  END IF;
END;
$function$
;
GRANT EXECUTE ON FUNCTION context.validate_reference_value(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION context.validate_reference_value(uuid,text) TO service_role;
REVOKE ALL ON FUNCTION context.validate_reference_value(uuid,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION context.write_context_value(p_item_id uuid, p_scope_id uuid, p_value_text text DEFAULT NULL::text, p_value_number numeric DEFAULT NULL::numeric, p_value_boolean boolean DEFAULT NULL::boolean, p_value_json jsonb DEFAULT NULL::jsonb, p_value_date date DEFAULT NULL::date, p_value_document_url text DEFAULT NULL::text, p_value_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_value_time time without time zone DEFAULT NULL::time without time zone, p_change_summary text DEFAULT NULL::text, p_source_type text DEFAULT 'manual'::text, p_actor uuid DEFAULT NULL::uuid)
 RETURNS context.context_item_values
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  PERFORM context.validate_reference_value(p_item_id, p_value_text);
  PERFORM pg_advisory_xact_lock(hashtext('civ:' || p_item_id::text || ':' || p_scope_id::text));
  INSERT INTO context.context_item_values (
    context_item_id, scope_id,
    value_text, value_number, value_boolean, value_json, value_date, value_document_url,
    value_timestamp, value_time,
    source_type, authored_by, change_summary
  ) VALUES (
    p_item_id, p_scope_id,
    p_value_text, p_value_number, p_value_boolean, p_value_json, p_value_date, p_value_document_url,
    p_value_timestamp, p_value_time,
    p_source_type::public.context_source_type, p_actor, p_change_summary
  ) RETURNING * INTO v_row;
  PERFORM context.index_reference_value(v_row.id, p_item_id, p_scope_id, p_value_text);
  RETURN v_row;
END;
$function$
;
GRANT EXECUTE ON FUNCTION context.write_context_value(uuid,uuid,text,numeric,boolean,jsonb,date,text,timestamp with time zone,time without time zone,text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION context.write_context_value(uuid,uuid,text,numeric,boolean,jsonb,date,text,timestamp with time zone,time without time zone,text,text,uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_context_item(p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text DEFAULT ''::text, p_category text DEFAULT NULL::text, p_fetch_hint context_fetch_hint DEFAULT 'on_demand'::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT 'internal'::context_sensitivity, p_tags text[] DEFAULT '{}'::text[], p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint, p_allowed_reference_types text[] DEFAULT NULL::text[], p_max_items integer DEFAULT 1, p_allowed_scope_type_ids uuid[] DEFAULT NULL::uuid[], p_reference_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_sort smallint; v_org_id uuid;
begin
  select organization_id into v_org_id from context.scope_types where id=p_scope_type_id and deleted_at is null;
  if v_org_id is null then perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id)); end if;
  if (auth.role()='service_role' or iam.has_org_admin(v_org_id)) is not true then raise exception 'organization admin required for this organization' using errcode='42501',
            detail = jsonb_build_object('org_id', v_org_id)::text; end if;
  perform context.validate_dataset_template_source(p_reference_source,v_org_id);
  v_sort:=coalesce(p_sort_order,(select (coalesce(max(sort_order),0)+1)::smallint from context.context_items where scope_type_id=p_scope_type_id and is_active));
  insert into context.context_items (scope_type_id,key,display_name,description,category,value_type,fetch_hint,sensitivity,status,source_type,tags,slug,sort_order,created_by,allowed_reference_types,max_items,allowed_scope_type_ids,reference_source)
  values (p_scope_type_id,p_key,p_display_name,p_description,p_category,p_value_type,p_fetch_hint,p_sensitivity,'active','manual',p_tags,p_slug,v_sort,(select auth.uid()),p_allowed_reference_types,coalesce(p_max_items,1),p_allowed_scope_type_ids,p_reference_source) returning id into v_id;
  return (select to_jsonb(ci) from context.context_items ci where ci.id=v_id);
end; $function$
;
GRANT EXECUTE ON FUNCTION create_context_item(uuid,text,text,context_value_type,text,text,context_fetch_hint,context_sensitivity,text[],text,smallint,text[],integer,uuid[],jsonb) TO service_role;
REVOKE ALL ON FUNCTION create_context_item(uuid,text,text,context_value_type,text,text,context_fetch_hint,context_sensitivity,text[],text,smallint,text[],integer,uuid[],jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_scope_type(p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid DEFAULT NULL::uuid, p_icon text DEFAULT 'folder'::text, p_description text DEFAULT ''::text, p_sort_order smallint DEFAULT 0, p_max_assignments smallint DEFAULT NULL::smallint, p_default_variable_keys text[] DEFAULT '{}'::text[], p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb;
BEGIN
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scope types.
  IF NOT (public.is_platform_admin() OR iam.has_org_access(p_org_id)) THEN
    raise exception 'not authorized for this organization' using ERRCODE = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
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
$function$
;
GRANT EXECUTE ON FUNCTION create_scope_type(uuid,text,text,uuid,text,text,smallint,smallint,text[],text,text) TO service_role;
REVOKE ALL ON FUNCTION create_scope_type(uuid,text,text,uuid,text,text,smallint,smallint,text[],text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.create_scope(p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid DEFAULT NULL::uuid, p_description text DEFAULT ''::text, p_settings jsonb DEFAULT '{}'::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_scope context.scopes; v_type_label text; v_sort smallint;
BEGIN
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scopes.
  IF NOT (public.is_platform_admin() OR iam.has_org_access(p_org_id)) THEN
    raise exception 'not authorized for this organization' using ERRCODE = '42501',
            detail = jsonb_build_object('org_id', p_org_id)::text;
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
$function$
;
GRANT EXECUTE ON FUNCTION create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint) TO service_role;
REVOKE ALL ON FUNCTION create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.delete_context_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;

  update context.context_items
     set deleted_at = now(),
         is_active = false,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'deleted_at', deleted_at) into v_result;

  return v_result;
end;
$function$
;
GRANT EXECUTE ON FUNCTION delete_context_item(uuid) TO service_role;
REVOKE ALL ON FUNCTION delete_context_item(uuid) FROM PUBLIC;

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

  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scope types.
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
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
$function$
;
GRANT EXECUTE ON FUNCTION delete_scope_type(uuid) TO service_role;
REVOKE ALL ON FUNCTION delete_scope_type(uuid) FROM PUBLIC;

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

  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scopes.
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
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
$function$
;
GRANT EXECUTE ON FUNCTION delete_scope(uuid) TO service_role;
REVOKE ALL ON FUNCTION delete_scope(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_context_item(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-COVERAGE-2. The twin of public.delete_context_item, at its rung (an admin of the scope
-- type's organization). delete_context_item sets deleted_at AND is_active = false, so the restore
-- clears both: the Field comes back in use. It also finishes a Field that already came back with its
-- scope type (deleted_at clear, is_active still false from the old one-way archive).
declare
  v_org uuid;
  v_live boolean;
  v_result jsonb;
begin
  select st.organization_id, (ci.deleted_at is null and ci.is_active)
    into v_org, v_live
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id;

  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_live then
    return jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.');
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;

  update context.context_items
     set deleted_at = null,
         is_active = true,
         updated_at = now()
   where id = p_item_id
  returning jsonb_build_object('id', id, 'restored', true) into v_result;

  return v_result;
end;
$function$
;
GRANT EXECUTE ON FUNCTION restore_context_item(uuid) TO service_role;
REVOKE ALL ON FUNCTION restore_context_item(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_org uuid;
  v_removed_at timestamptz;
  v_scope_count integer;
  v_item_count integer;
begin
  select scope_type.organization_id, scope_type.deleted_at
  into v_org, v_removed_at
  from context.scope_types as scope_type
  where scope_type.id = p_type_id
    and scope_type.deleted_at is not null;

  if v_org is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;

  -- The same membership test the removal made. Restoring is as consequential as
  -- removing: it puts rows back in front of everyone in the organization.
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

  select count(*) into v_scope_count
  from context.scopes as scope
  where scope.scope_type_id = p_type_id
    and scope.deleted_at = v_removed_at;

  select count(*) into v_item_count
  from context.context_items as item
  where item.scope_type_id = p_type_id
    and item.deleted_at = v_removed_at;

  -- Clearing the parent is the whole restore: platform._cascade_soft_delete
  -- brings back every child stamped with THIS removal's timestamp, and leaves
  -- anything removed separately beforehand removed.
  update context.scope_types
  set deleted_at = null,
      updated_by = (select auth.uid()),
      updated_at = now()
  where id = p_type_id;

  return jsonb_build_object(
    'restored_scopes', v_scope_count,
    'restored_context_items', v_item_count
  );
end;
$function$
;
GRANT EXECUTE ON FUNCTION restore_scope_type(uuid) TO service_role;
REVOKE ALL ON FUNCTION restore_scope_type(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.restore_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
-- lane TRASH-COVERAGE-2. The twin of public.delete_scope. Clearing the scope's deleted_at is the whole
-- restore: platform._cascade_soft_delete brings back every child scope stamped with THIS removal's
-- timestamp and leaves anything removed separately removed. A scope whose scope type is archived is
-- refused by platform._guard_soft_delete_parent (restore the scope type first; Trash does that).
declare
  v_org uuid;
  v_removed_at timestamptz;
  v_child_count integer;
begin
  select scope.organization_id, scope.deleted_at
    into v_org, v_removed_at
    from context.scopes as scope
   where scope.id = p_scope_id
     and scope.deleted_at is not null;

  if v_org is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
  end if;

  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
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

  select count(*) into v_child_count
    from context.scopes as scope
   where scope.parent_scope_id = p_scope_id
     and scope.deleted_at = v_removed_at;

  update context.scopes
     set deleted_at = null,
         updated_by = (select auth.uid()),
         updated_at = now()
   where id = p_scope_id;

  return jsonb_build_object('restored_children', v_child_count);
end;
$function$
;
GRANT EXECUTE ON FUNCTION restore_scope(uuid) TO service_role;
REVOKE ALL ON FUNCTION restore_scope(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_context_value(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_item_id UUID := (p_payload->>'context_item_id')::uuid;
  v_scope_id UUID := (p_payload->>'scope_id')::uuid;
  v_source_type TEXT := COALESCE(p_payload->>'source_type', 'ai_enriched');
  v_change_summary TEXT := p_payload->>'change_summary';
  v_scope_org UUID; v_scope_owner UUID; v_can_write BOOLEAN;
  v_row context.context_item_values;
BEGIN
  IF v_uid IS NULL AND NULLIF(current_setting('request.jwt.claims', true), '') IS NULL THEN
    v_uid := (p_payload->>'acting_user_id')::uuid;
  END IF;
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','unauthorized','message','no acting user'));
  END IF;
  IF v_item_id IS NULL OR v_scope_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','invalid_argument','message','context_item_id and scope_id are required'));
  END IF;
  SELECT s.organization_id, s.created_by INTO v_scope_org, v_scope_owner FROM context.scopes s WHERE s.id = v_scope_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','not_found','message','scope not found'));
  END IF;
  v_can_write := (v_scope_owner = v_uid) OR context._scope_readable_for(v_uid, v_scope_id, 'editor');
  IF NOT v_can_write THEN
    RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','forbidden',
      'message', context._scope_denial_message(v_scope_id, 'editor')));
  END IF;
  BEGIN
    v_row := context.write_context_value(
      p_item_id => v_item_id, p_scope_id => v_scope_id,
      p_value_text => p_payload->>'value_text',
      p_value_number => CASE WHEN p_payload ? 'value_number' THEN (p_payload->>'value_number')::numeric END,
      p_value_boolean => CASE WHEN p_payload ? 'value_boolean' THEN (p_payload->>'value_boolean')::boolean END,
      p_value_json => CASE WHEN p_payload ? 'value_json' THEN p_payload->'value_json' END,
      p_value_date => CASE WHEN p_payload ? 'value_date' THEN (p_payload->>'value_date')::date END,
      p_value_document_url => p_payload->>'value_document_url',
      p_value_timestamp => CASE WHEN p_payload ? 'value_timestamp' THEN (p_payload->>'value_timestamp')::timestamptz END,
      p_value_time => CASE WHEN p_payload ? 'value_time' THEN (p_payload->>'value_time')::time END,
      p_change_summary => v_change_summary, p_source_type => v_source_type, p_actor => v_uid
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','conflict','message','concurrent write on this cell — retry'));
    WHEN SQLSTATE '22023' THEN
      RETURN jsonb_build_object('ok', false, 'error', jsonb_build_object('code','invalid_argument', 'message', SQLERRM));
  END;
  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_date', v_row.value_date,
    'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'source_type', v_row.source_type));
END;
$function$
;
GRANT EXECUTE ON FUNCTION set_context_value(jsonb) TO service_role;
REVOKE ALL ON FUNCTION set_context_value(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.set_scope_context_value(p_scope_id uuid, p_context_item_id uuid, p_value_text text DEFAULT NULL::text, p_value_number numeric DEFAULT NULL::numeric, p_value_boolean boolean DEFAULT NULL::boolean, p_value_json jsonb DEFAULT NULL::jsonb, p_value_document_url text DEFAULT NULL::text, p_value_date date DEFAULT NULL::date, p_value_timestamp timestamp with time zone DEFAULT NULL::timestamp with time zone, p_value_time time without time zone DEFAULT NULL::time without time zone, p_change_summary text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row context.context_item_values;
BEGIN
  PERFORM context._assert_scope_readable(p_scope_id, 'editor');
  IF NOT EXISTS (
    SELECT 1 FROM context.context_items ci
    JOIN context.scopes s ON s.id = p_scope_id
    WHERE ci.id = p_context_item_id AND ci.scope_type_id = s.scope_type_id
  ) THEN
    raise exception 'context item does not belong to this scope' using ERRCODE = '22023',
            detail = jsonb_build_object('context_item_id', p_context_item_id, 'scope_id', p_scope_id)::text;
  END IF;
  v_row := context.write_context_value(
    p_item_id => p_context_item_id, p_scope_id => p_scope_id,
    p_value_text => p_value_text, p_value_number => p_value_number, p_value_boolean => p_value_boolean,
    p_value_json => p_value_json, p_value_date => p_value_date, p_value_document_url => p_value_document_url,
    p_value_timestamp => p_value_timestamp, p_value_time => p_value_time,
    p_change_summary => p_change_summary, p_source_type => 'manual', p_actor => (select auth.uid())
  );
  RETURN jsonb_build_object(
    'id', v_row.id, 'context_item_id', v_row.context_item_id, 'scope_id', v_row.scope_id,
    'version', v_row.version, 'is_current', v_row.is_current,
    'value_text', v_row.value_text, 'value_number', v_row.value_number,
    'value_boolean', v_row.value_boolean, 'value_json', v_row.value_json,
    'value_date', v_row.value_date, 'value_timestamp', v_row.value_timestamp, 'value_time', v_row.value_time,
    'value_document_url', v_row.value_document_url, 'created_at', v_row.created_at
  );
END;
$function$
;
GRANT EXECUTE ON FUNCTION set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text) TO service_role;
REVOKE ALL ON FUNCTION set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_context_item(p_item_id uuid, p_display_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_category text DEFAULT NULL::text, p_value_type context_value_type DEFAULT NULL::context_value_type, p_fetch_hint context_fetch_hint DEFAULT NULL::context_fetch_hint, p_sensitivity context_sensitivity DEFAULT NULL::context_sensitivity, p_tags text[] DEFAULT NULL::text[], p_sort_order smallint DEFAULT NULL::smallint, p_status context_item_status DEFAULT NULL::context_item_status, p_status_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_org uuid;
  v_result jsonb;
begin
  select st.organization_id
    into v_org
    from context.context_items ci
    join context.scope_types st on st.id = ci.scope_type_id
   where ci.id = p_item_id
     and ci.deleted_at is null;

  if v_org is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;

  update context.context_items
     set display_name = coalesce(p_display_name, display_name),
         description  = coalesce(p_description, description),
         category     = coalesce(p_category, category),
         value_type   = coalesce(p_value_type, value_type),
         fetch_hint   = coalesce(p_fetch_hint, fetch_hint),
         sensitivity  = coalesce(p_sensitivity, sensitivity),
         tags         = coalesce(p_tags, tags),
         sort_order   = coalesce(p_sort_order, sort_order),
         status       = coalesce(p_status, status),
         status_note  = coalesce(p_status_note, status_note),
         updated_at   = now()
   where id = p_item_id
  returning to_jsonb(context.context_items.*) into v_result;

  return v_result;
end;
$function$
;
GRANT EXECUTE ON FUNCTION update_context_item(uuid,text,text,text,context_value_type,context_fetch_hint,context_sensitivity,text[],smallint,context_item_status,text) TO service_role;
REVOKE ALL ON FUNCTION update_context_item(uuid,text,text,text,context_value_type,context_fetch_hint,context_sensitivity,text[],smallint,context_item_status,text) FROM PUBLIC;

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

  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scope types.
  if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org_id)) is not true then
    raise exception 'not authorized for this organization' using errcode = '42501',
            detail = jsonb_build_object('org_id', v_org_id)::text;
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
$function$
;
GRANT EXECUTE ON FUNCTION update_scope_type(uuid,text,text,text,text,smallint,smallint,text,text) TO service_role;
REVOKE ALL ON FUNCTION update_scope_type(uuid,text,text,text,text,smallint,smallint,text,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.update_scope(p_scope_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_settings jsonb DEFAULT NULL::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_result jsonb; v_type_label text; v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_scope_id;
  -- ADMIN LANE: a platform admin on /administration/** manages any organization's scopes.
  IF v_org IS NULL OR NOT (public.is_platform_admin() OR iam.has_org_access(v_org)) THEN
    raise exception 'not authorized to update scope' using ERRCODE = '42501',
            detail = jsonb_build_object('scope_id', p_scope_id)::text;
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
$function$
;
GRANT EXECUTE ON FUNCTION update_scope(uuid,text,text,jsonb,text,smallint) TO service_role;
REVOKE ALL ON FUNCTION update_scope(uuid,text,text,jsonb,text,smallint) FROM PUBLIC;

-- No client reaches them (as production held them), and their door rows come back.
REVOKE ALL ON FUNCTION context.provision_scope_dataset(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_scope(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_scope_type(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION context.index_reference_value(uuid,uuid,uuid,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION context.write_context_value(uuid,uuid,text,numeric,boolean,jsonb,date,text,timestamp with time zone,time without time zone,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,timestamp with time zone,time without time zone,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_scope_type(uuid,text,text,text,text,smallint,smallint,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_scope_type(uuid,text,text,uuid,text,text,smallint,smallint,text[],text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_scope(uuid,text,text,jsonb,text,smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION create_context_item(uuid,text,text,context_value_type,text,text,context_fetch_hint,context_sensitivity,text[],text,smallint,text[],integer,uuid[],jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION delete_context_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION restore_context_item(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION set_context_value(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION restore_scope(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION restore_scope_type(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION update_context_item(uuid,text,text,text,context_value_type,context_fetch_hint,context_sensitivity,text[],smallint,context_item_status,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION context.validate_reference_value(uuid,text) FROM PUBLIC, anon, authenticated;
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "8b1b5d65-d5b9-4d95-8d6f-2f36e8477c9e", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 15 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:48:49.614866+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "set_context_value", "identity_args": "p_payload jsonb", "argument_rules": null, "contract_probe": null, "gate_predicate": "auth.uid()", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["3802"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, E'{"id": "7b832fc5-5c71-4b2e-b97c-1e2562bd2b38", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.", "probe_args": null, "declared_at": "2026-09-13T07:34:35.434514+00:00", "declared_by": "DD-169 / B-63", "schema_name": "context", "refusal_only": false, "function_name": "provision_scope_dataset", "identity_args": "p_item_id uuid, p_scope_id uuid", "argument_rules": {"version": 1, "arguments": {"p_item_id": {"type": "uuid", "check": "DERIVED. It is resolved from context.context_items and then bound to the scope: the body returns null unless item.scope_type_id = scope.scope_type_id, and the template it names must belong to the SCOPE''s organization or to the platform system organization. Everything it writes is keyed to v_scope.organization_id, which is the id the caller is now asked about.", "access": "decided through p_scope_id", "entity": "context_item", "foreign": {"note": "null, identical to an invented item id", "not_a_leak": true, "same_as_invented": true}, "position": 1, "verified": "static reading 2026-09-21"}, "p_scope_id": {"type": "uuid", "check": "iam.has_org_access(v_scope.organization_id) — the scope is resolved, then the CALLER is asked about the organization it belongs to, before the dataset, its fields, the instance row and the context value are made there (ARGS-RULED 2026-09-21). Until that migration this door made all four in whatever tenant the scope named, with no access decision at all, and both arguments carried a DECLARED {\\"unchecked\\": true} rule.", "access": "member of the scope''s organization", "entity": "scope", "foreign": {"note": "a scope that does not resolve still answers null (a deleted scope legitimately does); a scope that resolves in another organization is refused 42501 by name", "sqlstate": "42501", "same_as_invented": false}, "position": 2, "verified": "static reading 2026-09-21; the ladder itself measured from test@test.com''s authenticated seat, scripts/campaign-tests/argsruled_green.sql clause 9. The door''s own arm carries the iam.is_trusted_backend escape a server lane needs and is therefore not measurable from a direct connection."}}, "declared_at": "2026-09-21 lane ARGS-RULED, per-door reading of the body", "declared_by": "argsruled_the_eighteen_doors_outside_the_store.sql"}, "contract_probe": null, "gate_predicate": null, "non_client_lane": null, "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "2950"], "signed_in_callers": true}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "caf639d0-97c7-40d0-873a-c7f31f9f4a82", "reason": "The undo half of delete_scope_type, called from the scopes page''s archive disclosure. SECURITY DEFINER for the same reason as delete_scope_type: the membership test runs inside the body (owner/admin of the type''s organization) instead of granting the client iam.memberships, and the cascade it triggers has to reach RLS-protected children.", "probe_args": null, "declared_at": "2026-09-21T18:31:17.908672+00:00", "declared_by": "matrx-frontend/migrations/scope_types_soft_delete_cascade_and_restore.sql (F6)", "schema_name": "public", "refusal_only": false, "function_name": "restore_scope_type", "identity_args": "p_type_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "6e448141-237b-4547-8b9d-303946e44a27", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": {"args": {"p_value_type": "literal:string", "p_scope_type_id": "other_row:context.scope_types"}, "note": "Creating a context item under ANOTHER organization scope type is a cross-boundary write; p_value_type is an enum and string is its plainest label."}, "declared_at": "2026-09-13T08:46:33.816567+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "create_context_item", "identity_args": "p_scope_type_id uuid, p_key text, p_display_name text, p_value_type context_value_type, p_description text, p_category text, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_slug text, p_sort_order smallint, p_allowed_reference_types text[], p_max_items integer, p_allowed_scope_type_ids uuid[], p_reference_source jsonb", "argument_rules": {"version": 1, "arguments": {"p_key": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 2, "null_rule": {}}, "p_slug": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 10, "null_rule": {}, "sql_default": "NULL::text"}, "p_tags": {"type": "text[]", "foreign": {"not_an_id": true}, "optional": true, "position": 9, "null_rule": {}, "sql_default": "''{}''::text[]"}, "p_category": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 6, "null_rule": {}, "sql_default": "NULL::text"}, "p_max_items": {"type": "integer", "foreign": {"not_an_id": true}, "optional": true, "position": 13, "null_rule": {}, "sql_default": "1"}, "p_fetch_hint": {"type": "context_fetch_hint", "foreign": {"not_an_id": true}, "optional": true, "position": 7, "null_rule": {}, "sql_default": "''on_demand''::context_fetch_hint"}, "p_sort_order": {"type": "smallint", "foreign": {"not_an_id": true}, "optional": true, "position": 11, "null_rule": {}, "sql_default": "NULL::smallint"}, "p_value_type": {"type": "context_value_type", "foreign": {"not_an_id": true}, "optional": false, "position": 4, "null_rule": {}}, "p_description": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 5, "null_rule": {}, "sql_default": "''''::text"}, "p_sensitivity": {"type": "context_sensitivity", "foreign": {"not_an_id": true}, "optional": true, "position": 8, "null_rule": {}, "sql_default": "''internal''::context_sensitivity"}, "p_display_name": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 3, "null_rule": {}}, "p_scope_type_id": {"type": "uuid", "check": "p_scope_type_id -> iam.has_org_admin(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_scope_type_id -> iam.has_org_admin(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_reference_source": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": true, "position": 15, "null_rule": {}, "sql_default": "NULL::jsonb"}, "p_allowed_scope_type_ids": {"type": "uuid[]", "check": "stored on the item as a constraint list; never read through here", "foreign": {"note": "stored on the item as a constraint list; never read through here", "stored_reference": true}, "optional": true, "position": 14, "verified": "static reading 2026-09-17", "null_rule": {}, "sql_default": "NULL::uuid[]"}, "p_allowed_reference_types": {"type": "text[]", "foreign": {"not_an_id": true}, "optional": true, "position": 12, "null_rule": {}, "sql_default": "NULL::text[]"}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "gate_predicate": "auth.uid()", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "25", "25", "1698626", "25", "25", "1698558", "1698602", "1009", "25", "21", "1009", "23", "2951", "3802"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "52c1f978-b93e-4b36-a9ea-d0c6a20d563b", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.", "probe_args": null, "declared_at": "2026-09-13T07:34:35.434514+00:00", "declared_by": "DD-169 / B-63", "schema_name": "public", "refusal_only": false, "function_name": "create_scope", "identity_args": "p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid, p_description text, p_settings jsonb, p_slug text, p_sort_order smallint", "argument_rules": {"version": 1, "arguments": {"p_name": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 3, "null_rule": {}}, "p_slug": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 7, "null_rule": {}, "sql_default": "NULL::text"}, "p_org_id": {"type": "uuid", "check": "p_org_id -> iam.has_org_access(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_org_id -> iam.has_org_access(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_type_id": {"type": "uuid", "check": "0850: must be a scope type of p_org_id", "access": "decided before existence (0850)", "entity": "scope_type", "foreign": {"note": "0850: must be a scope type of p_org_id", "sqlstate": "22023", "same_as_invented": true}, "optional": false, "position": 2, "verified": "live 2026-09-17, as the non-member test account", "null_rule": {}}, "p_settings": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": true, "position": 6, "null_rule": {}, "sql_default": "''{}''::jsonb"}, "p_sort_order": {"type": "smallint", "foreign": {"not_an_id": true}, "optional": true, "position": 8, "null_rule": {}, "sql_default": "NULL::smallint"}, "p_description": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 5, "null_rule": {}, "sql_default": "''''::text"}, "p_parent_scope_id": {"type": "uuid", "check": "0850: must be a scope of p_org_id", "access": "decided before existence (0850)", "entity": "scope", "foreign": {"note": "0850: must be a scope of p_org_id", "sqlstate": "22023", "same_as_invented": true}, "optional": true, "position": 4, "verified": "live 2026-09-17, as the non-member test account", "null_rule": {}, "sql_default": "NULL::uuid"}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "2950", "25", "2950", "25", "3802", "25", "21"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "37c2e763-b7d0-40c5-8bd0-859ec169208e", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `iam.has_org_access` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:46:33.816567+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "create_scope_type", "identity_args": "p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid, p_icon text, p_description text, p_sort_order smallint, p_max_assignments smallint, p_default_variable_keys text[], p_color text, p_slug text", "argument_rules": {"version": 1, "arguments": {"p_icon": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 5, "null_rule": {}, "sql_default": "''folder''::text"}, "p_slug": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 11, "null_rule": {}, "sql_default": "NULL::text"}, "p_color": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 10, "null_rule": {}, "sql_default": "NULL::text"}, "p_org_id": {"type": "uuid", "check": "p_org_id -> iam.has_org_access(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_org_id -> iam.has_org_access(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_sort_order": {"type": "smallint", "foreign": {"not_an_id": true}, "optional": true, "position": 7, "null_rule": {}, "sql_default": "0"}, "p_description": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 6, "null_rule": {}, "sql_default": "''''::text"}, "p_label_plural": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 3, "null_rule": {}}, "p_label_singular": {"type": "text", "foreign": {"not_an_id": true}, "optional": false, "position": 2, "null_rule": {}}, "p_parent_type_id": {"type": "uuid", "check": "0850: must be a scope type of p_org_id", "access": "decided before existence (0850)", "entity": "scope_type", "foreign": {"note": "0850: must be a scope type of p_org_id", "sqlstate": "22023", "same_as_invented": true}, "optional": true, "position": 4, "verified": "live 2026-09-17, as the non-member test account", "null_rule": {}, "sql_default": "NULL::uuid"}, "p_max_assignments": {"type": "smallint", "foreign": {"not_an_id": true}, "optional": true, "position": 8, "null_rule": {}, "sql_default": "NULL::smallint"}, "p_default_variable_keys": {"type": "text[]", "foreign": {"not_an_id": true}, "optional": true, "position": 9, "null_rule": {}, "sql_default": "''{}''::text[]"}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "gate_predicate": "iam.has_org_access", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "25", "25", "2950", "25", "25", "21", "21", "1009", "25", "25"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "ee68223d-7d26-4c45-a537-c311696af86e", "reason": "Org admins archive (is_active=false, values retained) a context item on their own org''s scope types; org resolved from the row and checked via iam.has_org_admin.", "probe_args": null, "declared_at": "2026-08-29T16:51:26.567228+00:00", "declared_by": "ctx_context_item_update_delete_rpcs", "schema_name": "public", "refusal_only": false, "function_name": "delete_context_item", "identity_args": "p_item_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "1ae3a5b9-8b68-4ad7-bb16-aa023e57ea29", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:46:33.816567+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "delete_scope", "identity_args": "p_scope_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": "auth.uid()", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "0913d994-5d69-42ea-9610-22c42aed26ee", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 5 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.uid()` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:46:33.816567+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "delete_scope_type", "identity_args": "p_type_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": "auth.uid()", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "a1e1bf02-40e6-4a8e-b22d-bbbc4e8b907a", "reason": "The undo half of delete_context_item, called from Trash through entity_undelete / org_trash_restore. SECURITY DEFINER; p_item_id must be a context item of a scope type whose organization the caller administers (iam.has_org_admin), 42501 otherwise. Clears deleted_at and sets is_active back on.", "probe_args": null, "declared_at": "2026-09-26T08:40:41.03514+00:00", "declared_by": "migrations/campaign/trashcoverage2_every_archivable_thing_a_person_sees_is_in_trash.sql (lane TRASH-COVERAGE-2)", "schema_name": "public", "refusal_only": false, "function_name": "restore_context_item", "identity_args": "p_item_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "717f9d9e-a100-4ff4-84a4-813f3eb8fef0", "reason": "The undo half of delete_scope, called from Trash through entity_undelete / org_trash_restore. SECURITY DEFINER; p_scope_id must be an archived scope of an organization the caller owns or administers (iam.memberships owner/admin, or a platform admin), 42501 otherwise. Clears deleted_at; the declared cascade brings back child scopes archived in the same act.", "probe_args": null, "declared_at": "2026-09-26T08:40:41.03514+00:00", "declared_by": "migrations/campaign/trashcoverage2_every_archivable_thing_a_person_sees_is_in_trash.sql (lane TRASH-COVERAGE-2)", "schema_name": "public", "refusal_only": false, "function_name": "restore_scope", "identity_args": "p_scope_id uuid", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "3216a73b-0038-4cf7-b5c5-36895b469292", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Written for a signed-in caller (auth.uid()); an anonymous caller can do nothing here.", "probe_args": null, "declared_at": "2026-09-13T07:34:35.434514+00:00", "declared_by": "DD-169 / B-63", "schema_name": "public", "refusal_only": false, "function_name": "set_scope_context_value", "identity_args": "p_scope_id uuid, p_context_item_id uuid, p_value_text text, p_value_number numeric, p_value_boolean boolean, p_value_json jsonb, p_value_document_url text, p_value_date date, p_value_timestamp timestamp with time zone, p_value_time time without time zone, p_change_summary text", "argument_rules": {"version": 1, "arguments": {"p_scope_id": {"type": "uuid", "check": "p_scope_id -> public.set_scope_context_value.p_scope_id: p_scope_id -> context._assert_scope_readable.p_scope_id: p_scope_id -> context._scope_readable.p_scope_id: p_scope_id -> iam.has_access(...)", "foreign": {"note": "decision found by the static reading with helper closure: p_scope_id -> public.set_scope_context_value.p_scope_id: p_scope_id -> context._assert_scope_readable.p_scope_id: p_scope_id -> context._scope_readable.p_scope_id: p_scope_id -> iam.has_access(...)", "decided_before_read": true}, "optional": false, "position": 1, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_value_date": {"type": "date", "foreign": {"not_an_id": true}, "optional": true, "position": 8, "null_rule": {}, "sql_default": "NULL::date"}, "p_value_json": {"type": "jsonb", "foreign": {"not_an_id": true}, "optional": true, "position": 6, "null_rule": {}, "sql_default": "NULL::jsonb"}, "p_value_text": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 3, "null_rule": {}, "sql_default": "NULL::text"}, "p_value_time": {"type": "time without time zone", "foreign": {"not_an_id": true}, "optional": true, "position": 10, "null_rule": {}, "sql_default": "NULL::time without time zone"}, "p_value_number": {"type": "numeric", "foreign": {"not_an_id": true}, "optional": true, "position": 4, "null_rule": {}, "sql_default": "NULL::numeric"}, "p_value_boolean": {"type": "boolean", "foreign": {"not_an_id": true}, "optional": true, "position": 5, "null_rule": {}, "sql_default": "NULL::boolean"}, "p_change_summary": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 11, "null_rule": {}, "sql_default": "NULL::text"}, "p_context_item_id": {"type": "uuid", "check": "must belong to the gated scope''s type (22023) before any write", "foreign": {"note": "must belong to the gated scope''s type (22023) before any write", "decided_before_read": true}, "optional": false, "position": 2, "verified": "static reading 2026-09-17", "null_rule": {}}, "p_value_timestamp": {"type": "timestamp with time zone", "foreign": {"not_an_id": true}, "optional": true, "position": 9, "null_rule": {}, "sql_default": "NULL::timestamp with time zone"}, "p_value_document_url": {"type": "text", "foreign": {"not_an_id": true}, "optional": true, "position": 7, "null_rule": {}, "sql_default": "NULL::text"}}, "declared_by": "0851_every_door_names_every_argument.sql"}, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "2950", "25", "1700", "16", "3802", "25", "1082", "1184", "1083", "25"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "9d8e63ca-cddb-4bfd-8fb3-e6f8341f9a36", "reason": "Org admins edit a context item definition (rename, description, type, ordering) on their own org''s scope types; the function resolves the item''s org itself and requires iam.has_org_admin on it.", "probe_args": null, "declared_at": "2026-08-29T16:51:26.567228+00:00", "declared_by": "ctx_context_item_update_delete_rpcs", "schema_name": "public", "refusal_only": false, "function_name": "update_context_item", "identity_args": "p_item_id uuid, p_display_name text, p_description text, p_category text, p_value_type context_value_type, p_fetch_hint context_fetch_hint, p_sensitivity context_sensitivity, p_tags text[], p_sort_order smallint, p_status context_item_status, p_status_note text", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "25", "25", "25", "1698626", "1698558", "1698602", "1009", "21", "1698570", "25"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "80b318b6-de88-4005-ac2b-db32fb010954", "reason": "SIGNED-IN door (authenticated only; anon revoked by this migration). Called only from signed-in surfaces (3 call sites).", "probe_args": null, "declared_at": "2026-09-13T07:34:35.434514+00:00", "declared_by": "DD-169 / B-63", "schema_name": "public", "refusal_only": false, "function_name": "update_scope", "identity_args": "p_scope_id uuid, p_name text, p_description text, p_settings jsonb, p_slug text, p_sort_order smallint", "argument_rules": null, "contract_probe": null, "gate_predicate": null, "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "25", "25", "3802", "25", "21"], "signed_in_callers": false}');
insert into platform.client_callable_door select * from jsonb_populate_record(null::platform.client_callable_door, '{"id": "6432f3c3-dff8-4756-82a6-b805a9d5cdc5", "reason": "Signed-in door (DD-169 batch 3, B-75). SECURITY DEFINER; writes; 6 client call site(s) found across matrx-frontend / aidream / matrx-extend / matrx-local. The caller is resolved inside the body by `auth.role` — that literal is what D6 checks is still there. Triaged from the 608 grandfathered signed-in definers B-64 left behind; `anon` holds no EXECUTE on it.", "probe_args": null, "declared_at": "2026-09-13T08:48:49.614866+00:00", "declared_by": "DD-169 batch 3 / B-75", "schema_name": "public", "refusal_only": false, "function_name": "update_scope_type", "identity_args": "p_type_id uuid, p_label_singular text, p_label_plural text, p_icon text, p_description text, p_sort_order smallint, p_max_assignments smallint, p_color text, p_slug text", "argument_rules": null, "contract_probe": null, "gate_predicate": "auth.role", "non_client_lane": "server_only: retired as a client door by SCOPES-OLD-WRITERS (2026-09-29). Clients write scopes, scope types, context items, values, templates and tags through the record store''s scope doors (custom.context_type_write / _archive / _restore, custom.context_scope_write / _archive / _restore, custom.context_item_write / _archive / _restore, custom.context_value_write, custom.context_template_apply, custom.context_tags_set), which reach this function in the owner''s right. The server (service_role) and the definer functions that call it keep it.", "anonymous_callers": false, "anonymous_purpose": null, "identity_argtypes": ["2950", "25", "25", "25", "25", "21", "21", "25", "25"], "signed_in_callers": false}');


CREATE OR REPLACE FUNCTION custom.context_type_write(p_organization_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid := p_organization_id;
  v_id     uuid;
  v_parent uuid;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_keys   text[];
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_type_id is null then
    if v_org is null then
      raise exception 'A new scope type needs the organization it belongs to.' using errcode = '22004';
    end if;
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
    -- public.create_scope_type's own check and sentences.
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = v_parent
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'That parent is not a scope type of this organization; pick one from the list.' using errcode = '22023', detail = 'create_scope_type: parent scope type not found in this organization';
    end if;
    v_id := pg_catalog.gen_random_uuid();
    v_keys := coalesce(array(select jsonb_array_elements_text(s -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      'label_singular', s -> 'label_singular', 'label_plural', s -> 'label_plural',
      'icon', coalesce(s ->> 'icon', 'folder'), 'description', coalesce(s ->> 'description', ''),
      'color', coalesce(s ->> 'color', ''), 'sort_order', coalesce((s ->> 'sort_order')::smallint, 0::smallint),
      'max_assignments_per_entity', (s ->> 'max_assignments')::smallint, 'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'label_plural')),
      'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE TYPE, BY ITS ID, FROM THE STORE: a live context Table (update_scope_type's "active" type).
    select t.* into v_t from custom.record t
     where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
    if (auth.role() = 'service_role' or public.is_platform_admin() or iam.has_org_access(v_org)) is not true then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    v_cur := custom.scope_type_row_of(v_t);
    v_parent := nullif(v_cur ->> 'parent_type_id', '')::uuid;
    if s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null') then
      -- A PARENT MOVED OR A LIMIT CLEARED (lane SCOPES-OLD-WRITERS), decided on the store.
      perform custom.assert_scope_door(v_org, 'custom.context_type_write');
      if s ? 'parent_type_id' then
        v_parent := nullif(s ->> 'parent_type_id', '')::uuid;
      end if;
      if s ? 'parent_type_id' and v_parent is not null and (
           v_parent = p_type_id
           or not exists (select 1 from custom.record st
                           where st.organization_id = v_org and st.id = v_parent and st.table_id = custom.table_kernel_id()
                             and st.data ->> 'kept_for' = 'context' and st.deleted_at is null)
           or exists (with recursive under as (
                        select st.id from custom.record st
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id()
                           and st.data ->> 'parent_type_id' = p_type_id::text
                        union
                        select st.id from custom.record st join under u on st.data ->> 'parent_type_id' = u.id::text
                         where st.organization_id = v_org and st.table_id = custom.table_kernel_id())
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope type of this organization this type can sit under.'
          using errcode = '22023',
                hint = 'A scope type''s parent is another live scope type of the same organization, and never the type itself or one of its own children.';
      end if;
    end if;
    v_keys := coalesce(array(select jsonb_array_elements_text(v_cur -> 'default_variable_keys')), '{}'::text[]);
    v_spec := jsonb_build_object(
      'id', p_type_id, 'organization_id', v_org, 'parent_type_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope_type's COALESCE did (never a raw 23502).
      'label_singular', coalesce(nullif(s -> 'label_singular', 'null'::jsonb), v_cur -> 'label_singular'),
      'label_plural', coalesce(nullif(s -> 'label_plural', 'null'::jsonb), v_cur -> 'label_plural'),
      'icon', coalesce(nullif(s -> 'icon', 'null'::jsonb), v_cur -> 'icon'),
      'description', coalesce(nullif(s -> 'description', 'null'::jsonb), v_cur -> 'description'),
      'color', coalesce(nullif(s -> 'color', 'null'::jsonb), v_cur -> 'color'),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, (v_cur ->> 'sort_order')::smallint),
      -- A limit named is the limit (a null one clears it — that call takes the parent/limit path above, as
      -- before); a limit not named stays.
      'max_assignments_per_entity', case when s ? 'max_assignments' then (s ->> 'max_assignments')::smallint
                                         else (v_cur ->> 'max_assignments_per_entity')::smallint end,
      'default_variable_keys', to_jsonb(v_keys),
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_cur ->> 'slug')),
      'created_by', v_t.created_by, 'deleted_at', null);
  end if;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old table's follow trigger does not copy it again.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', coalesce(v_id, p_type_id)::text, true);
  perform custom._ctx_store_type(v_org, coalesce(v_id, p_type_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  -- The scope-door mark covers the store write only; the image row stays named in custom.context_door_row
  -- through step 2, so the follow and the twin leave that one row to this door and carry every other.
  perform custom._ctx_mark(v_was);

  -- 2. THE IMAGE: the old row with the store's words.
  if p_type_id is null then
    insert into context.scope_types (id, organization_id, parent_type_id, label_singular, label_plural, icon, description,
                                     sort_order, max_assignments_per_entity, default_variable_keys, color, slug)
    values (v_id, v_org, v_parent, v_spec ->> 'label_singular', v_spec ->> 'label_plural', v_spec ->> 'icon',
            v_spec ->> 'description', (v_spec ->> 'sort_order')::smallint,
            (v_spec ->> 'max_assignments_per_entity')::smallint, v_keys, v_spec ->> 'color', v_spec ->> 'slug')
    returning * into v_img;
  else
    update context.scope_types t
       set parent_type_id = v_parent,
           label_singular = v_spec ->> 'label_singular',
           label_plural = v_spec ->> 'label_plural',
           icon = v_spec ->> 'icon',
           description = v_spec ->> 'description',
           sort_order = (v_spec ->> 'sort_order')::smallint,
           max_assignments_per_entity = (v_spec ->> 'max_assignments_per_entity')::smallint,
           color = v_spec ->> 'color',
           slug = v_spec ->> 'slug',
           updated_at = now()
     where t.id = p_type_id
    returning * into v_img;
    if v_img.id is null then
      -- A type only the store holds answers as update_scope_type always answered it (the store write above
      -- goes back with this refusal).
      perform platform.refuse_not_found(format('active scope type %s not found', p_type_id));
    end if;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', '', true);
  v_was := custom._ctx_mark('door');
  v_did := custom._ctx_store_type(v_org, v_img.id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  -- 4. THE STORE'S OWN SIDE EFFECTS, AFTER THE OLD ROW'S (the order of the days the old row was the writer):
  -- the twin was held back for this row in step 1; when step 3 changed nothing it has not run, so it runs now.
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_img.id, custom.table_kernel_id(), case when p_type_id is null then 'created' else 'updated' end)));
  end if;

  if p_type_id is not null and not (s ? 'parent_type_id' or (s ? 'max_assignments' and jsonb_typeof(s -> 'max_assignments') = 'null')) then
    perform custom.assert_scope_door(v_org, 'custom.context_type_write');
  end if;
  return custom._ctx_answer(v_org, v_img.id, to_jsonb(v_img));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_type_archive(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      custom.record;
  v_org    uuid;
  v_scopes integer;
  v_tags   integer;
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select t.* into v_t from custom.record t
   where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context';
  v_org := v_t.organization_id;
  -- public.delete_scope_type's own checks and sentences.
  if v_org is null or v_t.deleted_at is not null then
    perform platform.refuse_not_found('scope type not found');
  end if;
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  select count(*) into v_tags from platform.associations_live a
    join custom.record s on s.organization_id = v_org and s.id = a.target_id
   where a.target_type = 'scope' and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at is null;
  select count(*) into v_scopes from custom.record s
   where s.organization_id = v_org and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at is null;
  -- A TYPE'S REMOVAL IS THE ONE WRITE WHOSE STORE HALF CANNOT GO FIRST: the store halves never write a row of a
  -- removed Table (custom._ctx_table_live), so a Table archived first would leave every one of its scopes and
  -- context fields live in the store while the old cascade removed them (proven on the clone: the suite's T1).
  -- Everything is still decided from the store above; the image goes first, unmarked, the old cascade takes the
  -- type's scopes and fields and the follow carries each into the store while the Table is live, and step 3
  -- archives the Table itself from the image, in the same statement.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  -- 0. WHAT THE TYPE TAKES WITH IT, IN THE STORE (FTS-1f): its context fields, sub-types, scopes and the advice
  -- aimed at them, on this exact time, while the Table is still live.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_now, false);
  perform set_config('custom.context_door_row', p_type_id::text, true);

  -- THE IMAGE, UNMARKED: the old cascade takes the type's scopes and context fields with this timestamp, and
  -- the follow carries each into the store.
  update context.scope_types
     set deleted_at = v_now, updated_by = (select auth.uid()), updated_at = v_now
   where id = p_type_id and deleted_at is null;
  select st.* into v_img from context.scope_types st where st.id = p_type_id;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found('scope type not found');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_type(v_org, p_type_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_type_id, custom.table_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_type_archive');
  return custom._ctx_answer(v_org, p_type_id,
           jsonb_build_object('deleted_scopes', v_scopes, 'deleted_assignments', v_tags));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_type_restore(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_t      custom.record;
  v_org    uuid;
  v_spec   jsonb;
  v_scopes integer;
  v_items  integer;
  v_img    context.scope_types;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select t.* into v_t from custom.record t
   where t.id = p_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context';
  v_org := v_t.organization_id;
  -- public.restore_scope_type's own checks and sentences (it never admitted a platform admin by itself).
  if v_org is null or v_t.deleted_at is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;
  if auth.role() <> 'service_role'
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  select count(*) into v_scopes from custom.record s
   where s.organization_id = v_org and s.table_id = p_type_id and s.data_class = 'record' and s.deleted_at = v_t.deleted_at;
  -- the context fields this removal took (the Table's column and settings Fields were never context items)
  select count(*) into v_items from custom.record f
   where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
     and f.data ->> 'entity_definition_id' = p_type_id::text and f.deleted_at = v_t.deleted_at
     and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_spec := custom.scope_type_row_of(v_t) || jsonb_build_object('deleted_at', null);

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_type_id::text, true);
  perform custom._ctx_store_type(v_org, p_type_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);
  -- WHAT THAT REMOVAL TOOK COMES BACK, IN THE STORE (FTS-1f), now the Table is live again.
  perform custom._ctx_type_subtree_follows(v_org, p_type_id, v_t.deleted_at, true);
  perform set_config('custom.context_door_row', p_type_id::text, true);

  update context.scope_types
     set deleted_at = null, updated_by = (select auth.uid()), updated_at = now()
   where id = p_type_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found('scope type not found, or it was never removed');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_type(v_org, p_type_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_type_id, custom.table_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_type_restore');
  return custom._ctx_answer(v_org, p_type_id,
           jsonb_build_object('restored_scopes', v_scopes, 'restored_context_items', v_items));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_write(p_organization_id uuid, p_scope_id uuid, p_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_parent uuid;
  v_rec    custom.record;
  v_row    context.scopes;
  v_desc   text;
  v_cur    jsonb;
  v_sort   smallint;
  v_spec   jsonb;
  v_was    text;
  v_actor  text;
  v_label  text;
  v_did    text;
  v_heal   boolean := false;
  v_slug   text;
  v_place  smallint;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_scope_id is null then
    perform custom.assert_scope_door(p_organization_id, 'custom.context_scope_write');
    v_org := p_organization_id;
    -- public.create_scope's own check and sentence (ADMIN LANE: a platform admin manages any organization's scopes).
    if not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    -- THE TYPE BELONGS TO THE SAME TENANT (0850): a context Table of this organization in the store
    -- (archived ones too, as create_scope's check counted them). One sentence for foreign and invented ids.
    if p_type_id is null or not exists (
         select 1 from custom.record t
          where t.organization_id = v_org and t.id = p_type_id
            and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context') then
      raise exception 'That scope type is not one of this organization''s; pick one from the list.' using errcode = '22023', detail = 'create_scope: scope type not found in this organization';
    end if;
    v_type := p_type_id;
    v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
    if v_parent is not null and not exists (
         select 1 from custom.record p
           join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
          where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record' and p.deleted_at is null) then
      raise exception 'That parent is not a scope of this organization; pick one from the list.' using errcode = '22023', detail = 'create_scope: parent scope not found in this organization';
    end if;
    -- THE NEXT PLACE AMONG ITS SIBLINGS (same type, same parent, archived ones counted), as create_scope.
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select coalesce(max(nullif(r.data ->> 'sort_order', '')::int), 0) + 1
         from custom.record r
        where r.organization_id = v_org and r.table_id = v_type and r.data_class = 'record'
          and ((v_parent is null and nullif(r.data ->> 'parent_id', '') is null)
               or r.data ->> 'parent_id' = v_parent::text))::smallint);
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      'name', s -> 'name', 'description', coalesce(s ->> 'description', ''),
      'settings', coalesce(s -> 'settings', '{}'::jsonb),
      'slug', custom._ctx_scope_slug(coalesce(nullif(btrim(s ->> 'slug'), ''), s ->> 'name')),
      'sort_order', v_sort, 'created_by', auth.uid(), 'deleted_at', null);
  else
    -- THE SCOPE, BY ITS ID, FROM THE STORE: a Record of a context Table (archived ones too, as before).
    select r.* into v_rec
      from custom.record r
      join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where r.id = p_scope_id and r.data_class = 'record';
    v_org := v_rec.organization_id;
    v_type := v_rec.table_id;
    -- public.update_scope's own check and sentence.
    if v_org is null or not (public.is_platform_admin() or iam.has_org_access(v_org)) then
      raise exception 'not authorized to update scope' using errcode = '42501',
              detail = jsonb_build_object('scope_id', p_scope_id)::text;
    end if;
    v_parent := nullif(v_rec.data ->> 'parent_id', '')::uuid;
    if s ? 'parent_scope_id' then
      -- A SCOPE MOVED UNDER ANOTHER (lane SCOPES-OLD-WRITERS), decided on the store: a live scope of the same
      -- organization, never the scope itself or one of its own descendants.
      v_parent := nullif(s ->> 'parent_scope_id', '')::uuid;
      if v_parent is not null and (
           v_parent = p_scope_id
           or not exists (select 1 from custom.record p
                            join custom.record pt on pt.organization_id = p.organization_id and pt.id = p.table_id
                                                 and pt.table_id = custom.table_kernel_id() and pt.data ->> 'kept_for' = 'context'
                           where p.organization_id = v_org and p.id = v_parent and p.data_class = 'record'
                             and p.deleted_at is null)
           or exists (with recursive under as (
                        select c.id from custom.record c
                         where c.organization_id = v_org and c.data_class = 'record' and c.data ->> 'parent_id' = p_scope_id::text
                        union
                        select c.id from custom.record c join under u on c.data ->> 'parent_id' = u.id::text
                         where c.organization_id = v_org and c.data_class = 'record')
                      select 1 from under where under.id = v_parent)) then
        raise exception 'That parent is not a scope of this organization this scope can sit under.'
          using errcode = '22023',
                hint = 'A scope''s parent is another live scope of the same organization, and never the scope itself or one of its own children.';
      end if;
    end if;
    select f.data ->> 'key' into v_desc from custom.record f
     where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
    v_desc := coalesce(v_desc, 'description');
    v_cur := custom._ctx_scope_settings(v_org, v_type, v_rec.data);
    -- A RECORD COPIED BEFORE THE SCOPE'S SLUG AND SORT ORDER HAD A HOME IN THE STORE (lane SCOPES-STORE-HOMES)
    -- does not hold them yet; its old row still does. Such a scope is written old row first, once, and the
    -- store half takes those words from it (the write-through's order), so nothing it holds is rewritten.
    v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
    v_slug := custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug'));
    v_place := coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint);
    v_spec := jsonb_build_object(
      'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type, 'parent_scope_id', v_parent,
      -- A word sent as JSON null keeps the word, as update_scope's COALESCE did.
      'name', coalesce(nullif(s -> 'name', 'null'::jsonb), v_rec.data -> 'name'),
      'description', coalesce(s ->> 'description', v_rec.data ->> v_desc, ''),
      'settings', case when s ? 'settings' then coalesce(nullif(s -> 'settings', 'null'::jsonb), v_cur) else v_cur end,
      'slug', custom._ctx_scope_slug(coalesce(nullif(s ->> 'slug', ''), v_rec.data ->> 'slug')),
      'sort_order', coalesce((s ->> 'sort_order')::smallint, nullif(v_rec.data ->> 'sort_order', '')::smallint, 0::smallint),
      'created_by', v_rec.created_by, 'deleted_at', v_rec.deleted_at);
  end if;

  -- THE PARENT RULE, in the old trigger's own class (P0001) and words (lane manager ruling H6): the refusal
  -- contract stays what it was. The store half asks the same rule again below and finds it holds.
  begin
    perform custom._ctx_scope_parent_holds(v_org, v_type, v_parent);
  exception when check_violation then
    raise exception '%', sqlerrm using errcode = 'P0001';
  end;

  -- 1. THE STORE, FIRST. Marked as a scope door, so the old tables' follow trigger does not copy it again, and
  -- named in custom.context_door_row, so the store's side-effect twin holds this row back until step 4.
  v_was := custom._ctx_mark('door');
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    if v_actor = '' then
      perform set_config('app.actor_system', 'custom.context_write_through', true);
    end if;
    perform set_config('custom.context_door_row', coalesce(v_id, p_scope_id)::text, true);
    perform custom._ctx_store_scope(v_org, v_type, coalesce(v_id, p_scope_id), v_spec);
    perform set_config('app.actor_system', v_actor, true);
  end if;
  -- The scope-door mark covers the store write only: the old row's own triggers may write other old rows (a
  -- provisioned value) that the follow must carry as before. The door's own image row stays named in
  -- custom.context_door_row through step 2, so the follow and the twin leave that one row to this door.
  perform custom._ctx_mark(v_was);
  perform set_config('custom.context_door_row', coalesce(v_id, p_scope_id)::text, true);

  -- 2. THE IMAGE: the old row, written with today's statements, so every old trigger and reader sees it.
  if p_scope_id is null then
    insert into context.scopes (id, organization_id, scope_type_id, parent_scope_id, name, description, settings,
                                slug, sort_order, created_by)
    values (v_id, v_org, v_type, v_parent, v_spec ->> 'name', v_spec ->> 'description',
            v_spec -> 'settings', v_spec ->> 'slug', v_sort, (select auth.uid()))
    returning * into v_row;
  else
    -- The image takes the store's words for every column the door writes (the store is the truth; a
    -- word only the old row held is overwritten by the Record's), so the two cannot drift apart here.
    update context.scopes sc
       set parent_scope_id = v_parent,
           name = v_spec ->> 'name',
           description = v_spec ->> 'description',
           settings = v_spec -> 'settings',
           slug = case when v_heal then coalesce(v_slug, sc.slug) else v_spec ->> 'slug' end,
           sort_order = case when v_heal then coalesce(v_place, sc.sort_order) else (v_spec ->> 'sort_order')::smallint end,
           updated_at = now()
     where sc.id = p_scope_id
    returning * into v_row;
  end if;
  if v_row.id is null then
    -- A scope only the store holds answers as update_scope always answered it (the store write above goes back
    -- with this refusal).
    raise exception 'not authorized to update scope' using errcode = '42501',
            detail = jsonb_build_object('scope_id', p_scope_id)::text;
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK (the old triggers fill a few columns). In steady state this changes nothing.
  if v_actor = '' then
    perform set_config('app.actor_system', 'custom.context_write_through', true);
  end if;
  perform set_config('custom.context_door_row', '', true);
  v_was := custom._ctx_mark('door');
  v_did := custom._ctx_store_scope(v_org, v_type, v_row.id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  -- 4. THE STORE'S OWN SIDE EFFECTS, AFTER THE OLD ROW'S (the order of the days the old row was the writer):
  -- the twin was held back for this row in step 1; when step 3 changed nothing it has not run, so it runs now.
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_row.id, v_type, case when p_scope_id is null then 'created' else 'updated' end)));
  end if;

  if p_scope_id is not null then
    perform custom.assert_scope_door(v_org, 'custom.context_scope_write');
  end if;
  select t.data ->> 'label_singular' into v_label
    from custom.record t where t.organization_id = v_org and t.id = v_type;
  return custom._ctx_answer(v_org, v_row.id, to_jsonb(v_row) || jsonb_build_object('type_label', v_label));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_archive(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rec    custom.record;
  v_org    uuid;
  v_type   uuid;
  v_desc   text;
  v_spec   jsonb;
  v_heal   boolean;
  v_ids    uuid[];
  v_kids   integer;
  v_tags   integer;
  v_row    context.scopes;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  -- The scope, by its id, from the store: a Record of a context Table, in any state (the answer's organization).
  select r.* into v_rec
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id and r.data_class = 'record';
  v_org := v_rec.organization_id;
  v_type := v_rec.table_id;
  -- public.delete_scope's own checks and sentences.
  if v_org is null or v_rec.deleted_at is not null then
    perform platform.refuse_not_found('scope not found');
  end if;
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  -- The scope and every live scope under it, from the store's containment (data.parent_id).
  with recursive under as (
    select p_scope_id as id
    union
    select c.id from custom.record c join under u on c.data ->> 'parent_id' = u.id::text
     where c.organization_id = v_org and c.data_class = 'record' and c.deleted_at is null)
  select array_agg(id) into v_ids from under;
  v_kids := coalesce(array_length(v_ids, 1), 1) - 1;
  select count(*) into v_tags from platform.associations_live a
   where a.target_type = 'scope' and a.target_id = any (v_ids);

  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
  v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
  v_spec := jsonb_build_object(
    'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type,
    'parent_scope_id', nullif(v_rec.data ->> 'parent_id', ''), 'name', v_rec.data -> 'name',
    'description', coalesce(v_rec.data ->> coalesce(v_desc, 'description'), ''),
    'settings', custom._ctx_scope_settings(v_org, v_type, v_rec.data),
    'slug', v_rec.data ->> 'slug', 'sort_order', nullif(v_rec.data ->> 'sort_order', '')::smallint,
    'created_by', v_rec.created_by, 'deleted_at', v_now);

  -- 1. THE STORE, FIRST, for the door's own row (held back from the follow and the twin).
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    v_was := custom._ctx_mark('door');
    if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
    perform set_config('custom.context_door_row', p_scope_id::text, true);
    perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
    perform set_config('app.actor_system', v_actor, true);
    perform custom._ctx_mark(v_was);
  end if;
  -- 1b. THE SCOPES UNDER IT FOLLOW, IN THE STORE (FTS-1e), on the same time.
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_now, false);
  perform set_config('custom.context_door_row', p_scope_id::text, true);

  -- 2. THE IMAGE, UNMARKED: the old rows, so the old cascade and the follow carry every child as before.
  update context.scopes
     set deleted_at = v_now, updated_by = (select auth.uid()), updated_at = v_now
   where id = any (v_ids) and deleted_at is null;
  select sc.* into v_row from context.scopes sc where sc.id = p_scope_id;
  perform set_config('custom.context_door_row', '', true);
  if v_row.id is null then
    perform platform.refuse_not_found('scope not found');
  end if;

  -- 3. THE IMAGE'S OWN WORDS BACK, and 4. the twin after the old triggers when step 3 changed nothing.
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_scope(v_org, v_type, p_scope_id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_scope_id, v_type, 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_scope_archive');
  return custom._ctx_answer(v_org, p_scope_id,
           jsonb_build_object('deleted_children', v_kids, 'deleted_assignments', v_tags));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_scope_restore(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_rec    custom.record;
  v_org    uuid;
  v_type   uuid;
  v_desc   text;
  v_spec   jsonb;
  v_heal   boolean;
  v_kids   integer;
  v_row    context.scopes;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROWS ARE ITS IMAGE.
  select r.* into v_rec
    from custom.record r
    join custom.record t on t.organization_id = r.organization_id and t.id = r.table_id
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where r.id = p_scope_id and r.data_class = 'record';
  v_org := v_rec.organization_id;
  v_type := v_rec.table_id;
  -- public.restore_scope's own checks and sentences.
  if v_org is null or v_rec.deleted_at is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
  end if;
  if auth.role() <> 'service_role'
     and not public.is_platform_admin()
     and not exists (
       select 1 from iam.memberships as membership
        where membership.container_type = 'organization' and membership.container_id = v_org
          and membership.organization_id = v_org and membership.user_id = (select auth.uid())
          and membership.role in ('owner', 'admin') and membership.status = 'active' and membership.deleted_at is null) then
    raise exception 'organization owner or admin required' using errcode = '42501';
  end if;
  -- The children THIS removal took: archived with the scope's own timestamp.
  select count(*) into v_kids from custom.record c
   where c.organization_id = v_org and c.data_class = 'record'
     and c.data ->> 'parent_id' = p_scope_id::text and c.deleted_at = v_rec.deleted_at;

  select f.data ->> 'key' into v_desc from custom.record f
   where f.organization_id = v_org and f.id = custom._ctx_id('scope-column-field', v_type::text, 'description');
  v_heal := not (v_rec.data ? 'slug' and v_rec.data ? 'sort_order');
  v_spec := jsonb_build_object(
    'id', p_scope_id, 'organization_id', v_org, 'scope_type_id', v_type,
    'parent_scope_id', nullif(v_rec.data ->> 'parent_id', ''), 'name', v_rec.data -> 'name',
    'description', coalesce(v_rec.data ->> coalesce(v_desc, 'description'), ''),
    'settings', custom._ctx_scope_settings(v_org, v_type, v_rec.data),
    'slug', v_rec.data ->> 'slug', 'sort_order', nullif(v_rec.data ->> 'sort_order', '')::smallint,
    'created_by', v_rec.created_by, 'deleted_at', null);

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  if not v_heal then
    v_was := custom._ctx_mark('door');
    if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
    perform set_config('custom.context_door_row', p_scope_id::text, true);
    perform custom._ctx_store_scope(v_org, v_type, p_scope_id, v_spec);
    perform set_config('app.actor_system', v_actor, true);
    perform custom._ctx_mark(v_was);
  end if;
  -- THE SCOPES THIS REMOVAL TOOK COME BACK, IN THE STORE (FTS-1e).
  perform custom._ctx_scope_subtree_follows(v_org, p_scope_id, v_rec.deleted_at, true);
  perform set_config('custom.context_door_row', p_scope_id::text, true);

  -- THE IMAGE, UNMARKED: clearing the old row's deleted_at brings back, through the old cascade, every child
  -- stamped with this removal's timestamp, and the follow carries each into the store.
  update context.scopes
     set deleted_at = null, updated_by = (select auth.uid()), updated_at = now()
   where id = p_scope_id
  returning * into v_row;
  perform set_config('custom.context_door_row', '', true);
  if v_row.id is null then
    perform platform.refuse_not_found('scope not found, or it was never removed');
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_scope(v_org, v_type, p_scope_id, to_jsonb(v_row)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_scope_id, v_type, 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_scope_restore');
  return custom._ctx_answer(v_org, p_scope_id, jsonb_build_object('restored_children', v_kids));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_write(p_item_id uuid, p_scope_type_id uuid, p_spec jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  s        jsonb := coalesce(p_spec, '{}'::jsonb);
  v_row    jsonb;
  v_org    uuid;
  v_type   uuid;
  v_id     uuid;
  v_f      custom.record;
  v_t      custom.record;
  v_cur    jsonb;
  v_spec   jsonb;
  v_sort   smallint;
  v_img    context.context_items;
  v_rowupdate boolean := false;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  if p_item_id is null then
    -- public.create_context_item's own checks and sentences, on the store Table.
    select t.* into v_t from custom.record t
     where t.id = p_scope_type_id and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
       and t.deleted_at is null;
    v_org := v_t.organization_id;
    v_type := p_scope_type_id;
    if v_org is null then
      perform platform.refuse_not_found(format('active scope type %s not found', p_scope_type_id));
    end if;
    if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
      raise exception 'organization admin required for this organization' using errcode = '42501',
              detail = jsonb_build_object('org_id', v_org)::text;
    end if;
    perform context.validate_dataset_template_source(
      case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end, v_org);
    -- THE NEXT PLACE among the type's active context fields (the store keeps sort + 2).
    v_sort := coalesce((s ->> 'sort_order')::smallint,
      (select (coalesce(max(nullif(f.data ->> 'sort', '')::int - 2), 0) + 1)::smallint
         from custom.record f
        where f.organization_id = v_org and f.table_id = custom.field_kernel_id()
          and f.data ->> 'entity_definition_id' = v_type::text and f.deleted_at is null
          and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items'
          and coalesce((f.metadata #>> '{moved_from,carried,is_active}')::boolean, true)));
    v_id := pg_catalog.gen_random_uuid();
    v_spec := jsonb_build_object(
      'id', v_id, 'scope_type_id', v_type, 'key', s -> 'key', 'display_name', s -> 'display_name',
      'description', coalesce(s ->> 'description', ''), 'category', s -> 'category',
      'value_type', coalesce(s ->> 'value_type', 'string'), 'fetch_hint', coalesce(s ->> 'fetch_hint', 'on_demand'),
      'sensitivity', coalesce(s ->> 'sensitivity', 'internal'), 'status', 'active', 'source_type', 'manual',
      'tags', coalesce(s -> 'tags', '[]'::jsonb), 'slug', custom._ctx_scope_slug(s ->> 'key'), 'sort_order', v_sort,
      'created_by', auth.uid(),
      'allowed_reference_types', case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then s -> 'allowed_reference_types' end,
      'max_items', coalesce((s ->> 'max_items')::int, 1),
      'allowed_scope_type_ids', case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then s -> 'allowed_scope_type_ids' end,
      'reference_source', case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end,
      'is_active', true, 'deleted_at', null, 'depends_on', '[]'::jsonb);
  else
    -- THE FIELD, BY ITS ID, FROM THE STORE (any state), and its Table.
    select f.* into v_f from custom.record f
      join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                          and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
     where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
    v_org := v_f.organization_id;
    v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
    v_rowupdate := exists (select 1 from jsonb_each(s) e where jsonb_typeof(e.value) = 'null')
                   or s ?| array['custom_component', 'review_interval_days', 'allowed_reference_types', 'max_items',
                                 'allowed_scope_type_ids', 'reference_source'];
    if v_rowupdate then
      -- THE ROW POLICY'S OWN QUESTION, BY NAME (lane SCOPES-OLD-WRITERS): a platform admin, or an admin of the
      -- field's organization; a field the caller may not change answers exactly as a missing one.
      if v_org is null or not (public.is_platform_admin() or coalesce(iam.has_org_admin(v_org), false)) then
        raise exception 'There is no such context field you may change.' using errcode = '42501',
            detail = jsonb_build_object('item_id', p_item_id)::text;
      end if;
    else
      -- public.update_context_item's own checks and sentences: an active field.
      if v_org is null or v_f.deleted_at is not null then
        perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
      end if;
      if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
        raise exception 'organization admin required for this organization' using errcode = '42501',
                detail = jsonb_build_object('org', v_org)::text;
      end if;
    end if;
    -- The field's words in the old shape, from the store, with what the caller changed applied as the old
    -- statement applies it (named keys on the row path; non-null words on the plain path).
    v_cur := custom.scope_item_row_of(v_f) || jsonb_build_object(
      'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_f.deleted_at,
      'is_active', coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true),
      'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
      'status_note', v_f.data -> 'status_note', 'source_type', 'manual');
    if v_rowupdate then
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note', 'custom_component', 'review_interval_days',
                       'allowed_reference_types', 'max_items', 'allowed_scope_type_ids', 'reference_source');
      if s ? 'max_items' then
        v_spec := v_spec || jsonb_build_object('max_items', coalesce((s ->> 'max_items')::int, 1));
      end if;
    else
      select v_cur || coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_spec
        from jsonb_each(s) e
       where e.key in ('display_name', 'description', 'category', 'value_type', 'fetch_hint', 'sensitivity', 'tags',
                       'sort_order', 'status', 'status_note')
         and jsonb_typeof(e.value) <> 'null';
    end if;
  end if;

  -- 1. THE STORE, FIRST, held back from the follow and the twin.
  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', coalesce(v_id, p_item_id)::text, true);
  perform custom._ctx_store_item(v_org, v_type, coalesce(v_id, p_item_id), v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  -- 2. THE IMAGE, with today's own statements.
  if p_item_id is null then
    insert into context.context_items (id, scope_type_id, key, display_name, description, category, value_type, fetch_hint,
                                       sensitivity, status, source_type, tags, slug, sort_order, created_by,
                                       allowed_reference_types, max_items, allowed_scope_type_ids, reference_source)
    values (v_id, v_type, s ->> 'key', s ->> 'display_name', coalesce(s ->> 'description', ''), s ->> 'category',
            coalesce(s ->> 'value_type', 'string')::public.context_value_type,
            coalesce(s ->> 'fetch_hint', 'on_demand')::public.context_fetch_hint,
            coalesce(s ->> 'sensitivity', 'internal')::public.context_sensitivity, 'active', 'manual',
            coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]), nullif(s ->> 'slug', ''), v_sort,
            (select auth.uid()),
            case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end,
            coalesce((s ->> 'max_items')::int, 1),
            case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end,
            case when jsonb_typeof(s -> 'reference_source') = 'object' then s -> 'reference_source' end)
    returning * into v_img;
  elsif v_rowupdate then
    update context.context_items i
       set display_name = case when s ? 'display_name' then s ->> 'display_name' else i.display_name end,
           description = case when s ? 'description' then s ->> 'description' else i.description end,
           category = case when s ? 'category' then s ->> 'category' else i.category end,
           value_type = case when s ? 'value_type' then (s ->> 'value_type')::public.context_value_type else i.value_type end,
           fetch_hint = case when s ? 'fetch_hint' then (s ->> 'fetch_hint')::public.context_fetch_hint else i.fetch_hint end,
           sensitivity = case when s ? 'sensitivity' then (s ->> 'sensitivity')::public.context_sensitivity else i.sensitivity end,
           tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s -> 'tags')), '{}'::text[]) else i.tags end,
           sort_order = case when s ? 'sort_order' then (s ->> 'sort_order')::smallint else i.sort_order end,
           status = case when s ? 'status' then (s ->> 'status')::public.context_item_status else i.status end,
           status_note = case when s ? 'status_note' then s ->> 'status_note' else i.status_note end,
           custom_component = case when s ? 'custom_component' then case when jsonb_typeof(s -> 'custom_component') = 'null' then null else s -> 'custom_component' end else i.custom_component end,
           review_interval_days = case when s ? 'review_interval_days' then (s ->> 'review_interval_days')::int else i.review_interval_days end,
           allowed_reference_types = case when s ? 'allowed_reference_types' then case when jsonb_typeof(s -> 'allowed_reference_types') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_reference_types')) end else i.allowed_reference_types end,
           max_items = case when s ? 'max_items' then coalesce((s ->> 'max_items')::int, 1) else i.max_items end,
           allowed_scope_type_ids = case when s ? 'allowed_scope_type_ids' then case when jsonb_typeof(s -> 'allowed_scope_type_ids') = 'array' then array(select jsonb_array_elements_text(s -> 'allowed_scope_type_ids'))::uuid[] end else i.allowed_scope_type_ids end,
           reference_source = case when s ? 'reference_source' then case when jsonb_typeof(s -> 'reference_source') = 'null' then null else s -> 'reference_source' end else i.reference_source end
     where i.id = p_item_id
    returning * into v_img;
    if v_img.id is null then
      raise exception 'There is no such context field you may change.' using errcode = '42501',
          detail = jsonb_build_object('item_id', p_item_id)::text;
    end if;
  else
    update context.context_items
       set display_name = coalesce(s ->> 'display_name', display_name),
           description  = coalesce(s ->> 'description', description),
           category     = coalesce(s ->> 'category', category),
           value_type   = coalesce((s ->> 'value_type')::public.context_value_type, value_type),
           fetch_hint   = coalesce((s ->> 'fetch_hint')::public.context_fetch_hint, fetch_hint),
           sensitivity  = coalesce((s ->> 'sensitivity')::public.context_sensitivity, sensitivity),
           tags         = coalesce(case when s ? 'tags' then array(select jsonb_array_elements_text(s -> 'tags')) end, tags),
           sort_order   = coalesce((s ->> 'sort_order')::smallint, sort_order),
           status       = coalesce((s ->> 'status')::public.context_item_status, status),
           status_note  = coalesce(s ->> 'status_note', status_note),
           updated_at   = now()
     where id = p_item_id
    returning * into v_img;
    if v_img.id is null then
      perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
    end if;
  end if;
  perform set_config('custom.context_door_row', '', true);

  -- 3. THE IMAGE'S OWN WORDS BACK, and 4. the twin after the old triggers when step 3 changed nothing.
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, v_img.id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(
      v_org, v_img.id, custom.field_kernel_id(), case when p_item_id is null then 'created' else 'updated' end)));
  end if;

  v_row := to_jsonb(v_img);
  perform custom.assert_client_may_reach(v_org, 'custom.context_item_write');
  return custom._ctx_answer(v_org, v_img.id, v_row);
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_archive(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    context.context_items;
  v_was    text;
  v_actor  text;
  v_did    text;
  v_now    timestamptz := now();
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.delete_context_item's own checks and sentences.
  if v_org is null or v_f.deleted_at is not null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', v_now, 'is_active', false,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_item_id::text, true);
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  update context.context_items
     set deleted_at = v_now, is_active = false, updated_at = v_now
   where id = p_item_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found(format('active context item %s not found', p_item_id));
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, p_item_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_item_id, custom.field_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_archive');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'deleted_at', v_img.deleted_at));
end;
$function$;

CREATE OR REPLACE FUNCTION custom.context_item_restore(p_item_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_f      custom.record;
  v_org    uuid;
  v_type   uuid;
  v_spec   jsonb;
  v_img    context.context_items;
  v_was    text;
  v_actor  text;
  v_did    text;
begin
  -- LANE 9 W2-W (SCOPES-ON-THE-STORE): THE STORE DECIDES AND IS WRITTEN FIRST; THE OLD ROW IS ITS IMAGE.
  select f.* into v_f from custom.record f
    join custom.record t on t.organization_id = f.organization_id and t.id::text = f.data ->> 'entity_definition_id'
                        and t.table_id = custom.table_kernel_id() and t.data ->> 'kept_for' = 'context'
   where f.id = p_item_id and f.data_class = 'field' and f.metadata -> 'moved_from' ->> 'table' = 'context.context_items';
  v_org := v_f.organization_id;
  v_type := nullif(v_f.data ->> 'entity_definition_id', '')::uuid;
  -- public.restore_context_item's own checks and sentences.
  if v_org is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;
  if v_f.deleted_at is null and coalesce((v_f.metadata #>> '{moved_from,carried,is_active}')::boolean, true) then
    perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
    return custom._ctx_answer(v_org, p_item_id,
             jsonb_build_object('id', p_item_id, 'restored', false, 'detail', 'It is already in use.'));
  end if;
  if (auth.role() = 'service_role' or iam.has_org_admin(v_org)) is not true then
    raise exception 'organization admin required for this organization' using errcode = '42501',
            detail = jsonb_build_object('org', v_org)::text;
  end if;
  v_spec := custom.scope_item_row_of(v_f) || jsonb_build_object(
    'scope_type_id', v_type, 'created_by', v_f.created_by, 'deleted_at', null, 'is_active', true,
    'review_interval_days', v_f.data -> 'review_interval_days', 'depends_on', coalesce(v_f.data -> 'depends_on', '[]'::jsonb),
    'status_note', v_f.data -> 'status_note', 'source_type', 'manual');

  v_actor := coalesce(current_setting('app.actor_system', true), '');
  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  perform set_config('custom.context_door_row', p_item_id::text, true);
  perform custom._ctx_store_item(v_org, v_type, p_item_id, v_spec);
  perform set_config('app.actor_system', v_actor, true);
  perform custom._ctx_mark(v_was);

  update context.context_items
     set deleted_at = null, is_active = true, updated_at = now()
   where id = p_item_id
  returning * into v_img;
  perform set_config('custom.context_door_row', '', true);
  if v_img.id is null then
    perform platform.refuse_not_found(format('context item %s not found', p_item_id));
  end if;

  v_was := custom._ctx_mark('door');
  if v_actor = '' then perform set_config('app.actor_system', 'custom.context_write_through', true); end if;
  v_did := custom._ctx_store_item(v_org, v_type, p_item_id, to_jsonb(v_img)) ->> 'did';
  perform custom._ctx_mark(v_was);
  if v_did is not distinct from 'current' then
    perform custom._context_side_effects(jsonb_build_array(jsonb_build_array(v_org, p_item_id, custom.field_kernel_id(), 'updated')));
  end if;

  perform custom.assert_client_may_reach(v_org, 'custom.context_item_restore');
  return custom._ctx_answer(v_org, p_item_id, jsonb_build_object('id', v_img.id, 'restored', true));
end;
$function$;

CREATE OR REPLACE FUNCTION public.entity_undelete(p_token text, p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
-- lane TRASH-TABLES: token `record` (custom.record — every Table and Record of the record store) is
-- restored by custom.record_restore(organization, id): the store's ladder decides (42501 when the
-- caller may not change it) and the archive event brings back exactly what it took. The organization
-- is read FROM THE ROW, never from the caller.
-- lane TRASH-COVERAGE-2: a row whose parent is archived (platform.archived_parent_of) brings the
-- parent back first, through this same door, so a child is never left live under a removed parent
-- (platform._guard_soft_delete_parent would refuse it anyway). Kinds with their own restore door go
-- through it and never a raw update: folder -> public.restore_folder (its subfolders and files),
-- scope type -> public.restore_scope_type, scope -> public.restore_scope, scope type Field ->
-- public.restore_context_item, library document -> rag.fn_restore_library_document (its chunks and
-- data-store memberships), HR employee -> public.hr_employee_restore (HR's gate and audit).
-- lane STORE-RESTORE-DOORS: a record-store row goes through its own class's door
-- (public._trash_store_restore: custom.field_restore, rule_restore, relation_restore, doc_template_restore,
-- dashboard_restore; a Table or Record custom.record_restore); a mandate through mandate.definition_restore.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting (Meet's host / co-host rule).
declare
  v_s text;
  v_t text;
  v_feature_owned_restore boolean;
  v_n int;
  v_org uuid;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_at timestamptz;
  v_found boolean;
  v_res jsonb;
  v_detail text;
  v_col text;
  v_val text;
  v_noun text;
begin
  -- A passage link (anchored_to association) is a filtered trash kind with its own door.
  if p_token = 'passage_link' then
    perform public.passage_link_restore(p_id);
    return true;
  end if;

  if p_token = 'record' then
    select r.organization_id into v_org
      from custom.record r
     where r.id = p_id and r.deleted_at is not null;
    if v_org is null then
      return false;
    end if;
    perform public._trash_store_restore(v_org, p_id);
    return true;
  end if;

  select schema_name, table_name, feature_owned_restore
    into v_s, v_t, v_feature_owned_restore
    from platform.entity_types
   where token = p_token;

  if v_s is null then
    raise exception 'unknown token %', p_token using errcode = '22023';
  end if;
  if coalesce(v_feature_owned_restore, false) then
    raise exception 'entity % requires feature-owned restoration', p_token using errcode = '42501';
  end if;
  execute format('select true, t.deleted_at from %I.%I t where t.id = $1', v_s, v_t)
    into v_found, v_at using p_id;
  if not coalesce(v_found, false) or v_at is null then
    return false;
  end if;

  -- The parent first: a child of an archived parent only comes back with it.
  for v_i in 1..8 loop
    v_pid := null;
    select ap.parent_token, ap.parent_id into v_ptok, v_pid
      from platform.archived_parent_of(p_token, p_id) ap limit 1;
    exit when v_pid is null;
    perform public.entity_undelete(v_ptok, v_pid);
  end loop;

  execute format('select t.deleted_at from %I.%I t where t.id = $1', v_s, v_t) into v_at using p_id;
  if v_at is null then
    -- It came back with its parent. A Field comes back in use.
    if p_token = 'context_item' then
      perform public.restore_context_item(p_id);
    end if;
    return true;
  end if;

  case p_token
    when 'folder' then perform public.restore_folder(p_id); return true;
    when 'scope_type' then perform public.restore_scope_type(p_id); return true;
    when 'scope' then perform public.restore_scope(p_id); return true;
    when 'context_item' then perform public.restore_context_item(p_id); return true;
    when 'processed_document' then perform rag.fn_restore_library_document(p_id); return true;
    when 'mandate' then perform mandate.definition_restore(p_id); return true;
    when 'team' then perform public.team_restore(p_id); return true;
    -- lane DOORS-DECIDE-LAST: a Meeting comes back through Meet's own door (host or co-host; its
    -- invitations and occurrence exceptions return with it by the cascade edge).
    when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null); return true;
    -- A passage comment (and its suggestion / reply rows) comes back through its own door: author or record admin.
    when 'comment' then perform public.cmt_restore(p_id); return true;
    when 'hr_employee' then
      v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
      if not coalesce((v_res ->> 'ok')::boolean, false) then
        raise exception '%', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                      'HR did not allow this person to be restored.')
          using errcode = '42501';
      end if;
      return true;
    else null;
  end case;

  -- 1347: a client_read_only type is changed only through its own doors.
  if iam.is_client_lane() and exists (select 1 from platform.entity_types et
                                       where et.token = p_token and et.client_read_only) then
    raise exception 'a % is changed only through the screen that manages it', p_token using errcode = '42501';
  end if;

  if not iam.has_access(p_token, p_id, 'editor') then
    raise exception 'access denied' using errcode = '42501';
  end if;

  -- A removed row stops holding its name (db-rules §8, DD-121): while it sat in
  -- Trash a live row may have taken the same name/slug. Restoring it then hits
  -- the live-only unique index; say which name is taken and what to do, never
  -- a raw 23505 (the code stays 23505 so callers can still tell).
  begin
    execute format('UPDATE %I.%I SET deleted_at=NULL WHERE id=$1 AND deleted_at IS NOT NULL', v_s, v_t)
      using p_id;
  exception when unique_violation then
    get stacked diagnostics v_detail = pg_exception_detail;
    v_col := substring(v_detail from 'Key \(([^)]*)\)=');
    v_val := substring(v_detail from '\)=\((.*)\) already exists');
    select lower(coalesce(nullif(btrim(et.label), ''), p_token)) into v_noun
      from platform.entity_types et where et.token = p_token;
    raise exception using
      errcode = '23505',
      message = format('This %s can''t be restored: another %s already uses the %s "%s".',
                       v_noun, v_noun, coalesce(v_col, 'same name'), coalesce(v_val, '')),
      detail  = v_detail,
      hint    = format('Rename the other %s (or give it a different %s), then restore this one.',
                       v_noun, coalesce(v_col, 'name'));
  end;
  get diagnostics v_n = row_count;
  if v_n > 0 and p_token = 'workflow' then
    perform workflow.restore_triggers_archived_with(p_id, v_at);
  end if;
  return v_n > 0;
end;
$function$;

CREATE OR REPLACE FUNCTION public.org_trash_restore(p_organization_id uuid, p_token text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- lane TRASH-2. An owner or admin of the organization restores one member's archived item that sits
-- in THIS organization. One audit row (iam.org_admin_audit, action trash.restore) and, when the item
-- is somebody else's, an in-app notice to its owner. Never a purge.
-- lane TRASH-TABLES: a record-store Table or Record (token `record`) is restored by
-- custom.record_restore, which asks the store's own ladder for the caller and brings back exactly what
-- its archive took; a refusal is returned as restored=false with the store's sentence.
-- lane TRASH-COVERAGE-2: a row whose parent is archived brings the parent back first, through this
-- same door (audited and noticed as the parent). Kinds with their own restore door go through it:
-- folder (public.restore_folder), scope type (public.restore_scope_type), scope (public.restore_scope),
-- scope type Field (public.restore_context_item), library document (rag.fn_restore_library_document),
-- HR employee (public.hr_employee_restore); a door's
-- refusal is restored=false with a sentence, never a raw update around it.
-- lane STORE-RESTORE-DOORS: a Field, Rule, link, document template or dashboard (token `record`) goes
-- through its own store door (public._trash_store_restore) and a mandate through
-- mandate.definition_restore; the door's own refusal sentence is the answer.
-- lane DOORS-DECIDE-LAST: a Meeting through communication.meet_restore_meeting.
-- lane SCOPES-READS-REST (2026-09-29): a scope type, scope or context item is found, titled and
-- parented from the record store (its context Table, Record or Field), never from context.*; it is
-- still restored through its own door (restore_scope_type / restore_scope / restore_context_item).
declare
  v_me uuid := public._org_trash_gate(p_organization_id);
  e record;
  v_rel regclass;
  v_title_col text;
  v_owner uuid;
  v_title text;
  v_label text;
  v_me_name text;
  v_org_name text;
  v_subject text;
  v_body text;
  v_class text;
  v_i int;
  v_ptok text;
  v_pid uuid;
  v_ptitle text;
  v_via_parent boolean := false;
  v_res jsonb;
  v_at timestamptz;
  v_title_expr text;
  v_found boolean;
  v_n int;
  v_why text;
  v_ctx boolean;
begin
  if p_token = 'record' then
    select r.created_by, r.data_class,
           case when r.data_class = 'table'
                then coalesce(nullif(btrim(r.data ->> 'name'), ''), 'Untitled table')
                when r.data_class = 'record'
                then coalesce(nullif(btrim(custom.record_words(r.organization_id, r.id)), ''), 'Untitled record')
                else coalesce(public._trash_store_title(r.organization_id, r.id), 'Untitled') end
      into v_owner, v_class, v_title
      from custom.record r
     where r.organization_id = p_organization_id and r.id = p_id
       and r.deleted_at is not null
       and r.data_class in ('table', 'record', 'field', 'rule', 'relation', 'doc_template', 'dashboard');
    if not found then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;
    begin
      perform public._trash_store_restore(p_organization_id, p_id);
    exception
      when insufficient_privilege then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      when check_violation or unique_violation or no_data_found or raise_exception then
        get stacked diagnostics v_why = message_text;
        return jsonb_build_object('restored', false, 'message', v_why);
    end;
    v_label := case v_class when 'table' then 'Table' when 'record' then 'Record' when 'field' then 'Field'
                            when 'rule' then 'Rule' when 'relation' then 'Link'
                            when 'doc_template' then 'Document template' else 'Dashboard' end;
    select 'record'::text as token, v_label as label into e;
  else
    select t.token, t.user_artifact_kind, t.label, t.schema_name, t.table_name,
           coalesce(t.retention_owner_column, 'created_by') as owner_col, t.title_column, t.feature_owned_restore
      into e
      from platform.entity_types t
     where t.token = p_token and t.is_active and t.user_artifact_kind is not null;
    if not found then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;
    if coalesce(e.feature_owned_restore, false) or e.token in ('credential_item', 'user_secret', 'credential_attachment') then
      raise exception 'Vault items are restored by their owner from their own Trash.' using errcode = '42501';
    end if;
    v_ctx := e.schema_name = 'context' and e.token in ('scope_type', 'scope', 'context_item');
    v_rel := case when v_ctx then null else to_regclass(format('%I.%I', e.schema_name, e.table_name)) end;
    if v_rel is null and not v_ctx then
      raise exception 'That kind of item is not in Trash.' using errcode = '22023';
    end if;

    select a.attname into v_title_col from pg_attribute a
     where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
       and a.attname = any (array['label_plural', coalesce(e.title_column, '')])
     order by (a.attname <> 'label_plural') limit 1;
    if v_title_col is null then
      select a.attname into v_title_col from pg_attribute a
       where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
         and a.attname = any (array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'])
       order by array_position(array['name','title','label','display_name','file_name','folder_name','page_title','subject_value','target_domain','jurisdiction_key','path','code','label_plural','body','description'], a.attname::text)
       limit 1;
    end if;

    v_title_expr := case when v_title_col is null then 'null::text' else format('left(t.%I::text, 200)', v_title_col) end;

    -- The parent first: a child of an archived parent only comes back with it.
    for v_i in 1..8 loop
      v_pid := null;
      if v_ctx then
        -- a scope's or a context item's parent is the context Table it sits in, when archived
        select 'scope_type'::text, k.id, left(k.data ->> 'label_plural', 200) into v_ptok, v_pid, v_ptitle
          from custom.record x
          join custom.record k
            on k.organization_id = x.organization_id and k.data_class = 'table'
           and k.data ->> 'kept_for' = 'context' and k.deleted_at is not null
           and k.id = case x.data_class when 'record' then x.table_id
                                        else nullif(x.data ->> 'entity_definition_id', '')::uuid end
         where e.token in ('scope', 'context_item') and x.id = p_id
           and x.data_class = case e.token when 'scope' then 'record' else 'field' end
         limit 1;
      else
      select ap.parent_token, ap.parent_id, ap.parent_title into v_ptok, v_pid, v_ptitle
        from platform.archived_parent_of(e.token, p_id) ap limit 1;
      end if;
      exit when v_pid is null;
      if not exists (select 1 from platform.entity_types t
                      where t.token = v_ptok and t.is_active and t.user_artifact_kind is not null) then
        return jsonb_build_object('restored', false,
          'message', format('It is inside %s, which is archived and is not in this organization''s Trash. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_ptitle), ''), 'something')));
      end if;
      v_res := public.org_trash_restore(p_organization_id, v_ptok, v_pid);
      if not coalesce((v_res ->> 'restored')::boolean, false) then
        return v_res;
      end if;
      v_via_parent := true;
    end loop;

    -- The row, in THIS organization (a scope type's Field reads its organization from its scope type).
    if v_ctx then
      select true, x.created_by,
             left(case e.token when 'scope_type' then x.data ->> 'label_plural'
                               when 'scope' then x.data ->> 'name'
                               else x.data ->> 'label' end, 200),
             x.deleted_at
        into v_found, v_owner, v_title, v_at
        from custom.record x
        join custom.record k
          on k.organization_id = x.organization_id and k.data_class = 'table'
         and k.data ->> 'kept_for' = 'context'
         and k.id = case e.token when 'scope_type' then x.id
                                 when 'scope' then x.table_id
                                 else nullif(x.data ->> 'entity_definition_id', '')::uuid end
       where x.id = p_id and x.organization_id = p_organization_id
         and x.data_class = case e.token when 'scope_type' then 'table'
                                         when 'scope' then 'record' else 'field' end;
    else
      execute format('select true, t.%I, %s, t.deleted_at from %I.%I t where t.id = $1 and t.organization_id = $2',
                     e.owner_col, v_title_expr, e.schema_name, e.table_name)
        into v_found, v_owner, v_title, v_at
        using p_id, p_organization_id;
    end if;
    if not coalesce(v_found, false) or (v_at is null and not v_via_parent) then
      return jsonb_build_object('restored', false,
        'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
    end if;

    if v_at is null then
      -- It came back with its parent (audited and noticed there). A Field comes back in use.
      if e.token = 'context_item' then
        perform public.restore_context_item(p_id);
      end if;
      return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
        'message', format('%s came back with %s.', coalesce(nullif(btrim(v_title), ''), e.label),
                          coalesce(nullif(btrim(v_ptitle), ''), 'what it sits in')));
    end if;

    if e.token in ('folder', 'scope_type', 'scope', 'context_item', 'processed_document', 'hr_employee', 'mandate', 'meet_meeting') then
      begin
        case e.token
          when 'folder' then perform public.restore_folder(p_id);
          when 'scope_type' then perform public.restore_scope_type(p_id);
          when 'scope' then perform public.restore_scope(p_id);
          when 'context_item' then perform public.restore_context_item(p_id);
          when 'processed_document' then perform rag.fn_restore_library_document(p_id);
          when 'mandate' then perform mandate.definition_restore(p_id);
          -- lane DOORS-DECIDE-LAST: a Meeting through Meet's own door (host or co-host).
          when 'meet_meeting' then perform communication.meet_restore_meeting(p_id, null);
          when 'hr_employee' then
            v_res := public.hr_employee_restore(jsonb_build_object('employee_id', p_id));
            if not coalesce((v_res ->> 'ok')::boolean, false) then
              return jsonb_build_object('restored', false,
                'message', coalesce(nullif(btrim(v_res ->> 'detail'), ''),
                                    'Only someone HR allows to restore this person can bring them back.'));
            end if;
        end case;
      exception when insufficient_privilege or raise_exception or no_data_found then
        return jsonb_build_object('restored', false,
          'message', format('Only someone who can edit %s can bring it back. Its owner can restore it from their own Trash.',
                            coalesce(nullif(btrim(v_title), ''), 'it')));
      end;
    else
      execute format(
        'update %I.%I t set deleted_at = null
          where t.id = $1 and t.organization_id = $2 and t.deleted_at is not null
          returning t.%I, %s',
        e.schema_name, e.table_name, e.owner_col, v_title_expr)
        into v_owner, v_title
        using p_id, p_organization_id;
      get diagnostics v_n = row_count;

      -- (EXECUTE never sets FOUND; the row count is the answer.)
      if v_n = 0 then
        return jsonb_build_object('restored', false,
          'message', 'It is no longer in this organization''s Trash — somebody may have restored it already.');
      end if;
      if e.token = 'workflow' then
        perform workflow.restore_triggers_archived_with(p_id, v_at);
      end if;
    end if;
    v_label := e.label;
  end if;

  perform iam._org_audit(p_organization_id, v_owner, 'trash.restore',
    jsonb_build_object('entity_token', e.token, 'id', p_id, 'label', v_label, 'title', v_title));

  if v_owner is not null and v_owner is distinct from v_me then
    select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
                    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
                    nullif(btrim(u.email), ''), 'An organization admin')
      into v_me_name from auth.users u where u.id = v_me;
    select coalesce(nullif(btrim(o.name), ''), 'your organization') into v_org_name
      from iam.organizations o where o.id = p_organization_id;
    v_subject := format('%s restored your %s', coalesce(v_me_name, 'An organization admin'), lower(v_label));
    v_body := format('%s restored "%s" from %s''s Trash. It is back where it was.',
                     coalesce(v_me_name, 'An organization admin'),
                     coalesce(nullif(btrim(v_title), ''), 'Untitled'), coalesce(v_org_name, 'your organization'));
    insert into communication.notification
      (organization_id, event_key, channel, recipient_user_id, recipient_kind,
       dedupe_key, subject, body, payload, target_kind, target_id, deep_link, visibility)
    values
      (p_organization_id, 'trash.restored_by_org_admin', 'in_app', v_owner, 'user',
       format('trash.restore:%s:%s:%s', e.token, p_id, extract(epoch from clock_timestamp())::bigint),
       v_subject, left(v_body, 600),
       jsonb_build_object('entity_token', e.token, 'id', p_id, 'by', v_me, 'source', 'org_trash_restore',
                          'notice', jsonb_build_object('subject', v_subject, 'body', v_body)),
       e.token, p_id, null, 'personal'::platform.visibility)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return jsonb_build_object('restored', true, 'owner_id', v_owner, 'title', v_title,
    'message', format('%s restored.', coalesce(nullif(btrim(v_title), ''), v_label)));
end;
$function$;

DROP FUNCTION custom.scope_row_of(custom.record);
DROP FUNCTION custom.context_item_row_of(custom.record);

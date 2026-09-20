-- chair-step: the inverse of share_one_ladder_reaches_the_share_dialog.sql. It puts the six generic sharing RPCs back to asking created_by = auth.uid() and drops the one predicate and the two store-door adapters. Running it makes the ladder's admin rung unable to share, change a level, revoke, or even SEE who has access, which is the defect this lane found; it exists to satisfy rule 27 (up -> inverse -> up) and for nothing else.
-- based-on: public.share_resource_with_user(text, uuid, uuid, text) 56bcfe73edef78f48af92f36bb833c5606196a7fb2564e1830656b0a02617e1e
-- based-on: public.share_resource_with_org(text, uuid, uuid, text) d7dbcd6e3d09ab1d63e58f76194987c827b377a1b7bebb54dba362422daa11f2
-- based-on: public.revoke_resource_access(text, uuid, uuid) a825b8214a5eeb1b720a288760b47f5fdfdc2471477195f227c4befc488ebe74
-- based-on: public.revoke_resource_org_access(text, uuid, uuid) b4309945719b1171a1ec7b87370acef92d5cae03b3c7e355ed7ab4541f78eadb
-- based-on: public.update_permission_level(text, uuid, uuid, uuid, text) f23c2eda44dac2c1bcf7454b3c352792a5985f5e3c7979ead32658e7893c9bf9
-- based-on: public.get_resource_permissions(text, uuid) cd2d2c42d3b2f561083849ebe94151764561f8c3688577afc2e1d55bc1d90e8f
--
CREATE OR REPLACE FUNCTION public.share_resource_with_user(p_resource_type text, p_resource_id uuid, p_target_user_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_resolved record; v_owner_col text; v_owner_id uuid; v_new_id uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF p_permission_level NOT IN ('viewer', 'commenter', 'editor', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level');
  END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;
  v_owner_col := public.shareable_owner_column(v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);
  EXECUTE format('SELECT %I FROM %I.%I WHERE %I = $1',
    v_owner_col, v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column
  ) INTO v_owner_id USING p_resource_id;
  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Resource not found'); END IF;
  IF v_owner_id <> v_uid  THEN RETURN jsonb_build_object('success', false, 'error', 'You do not own this resource'); END IF;
  IF EXISTS (
    SELECT 1 FROM iam.permissions
    WHERE resource_type = v_resolved.resource_type AND resource_id = p_resource_id AND granted_to_user_id = p_target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user already has access to this resource');
  END IF;
  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_user_id, permission_level, created_by)
  VALUES (v_resolved.resource_type, p_resource_id, p_target_user_id, p_permission_level::permission_level, v_uid)
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true, 'message', 'Successfully shared with user',
    'permission_id', v_new_id, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.share_resource_with_org(p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_resolved record; v_owner_col text; v_owner_id uuid; v_new_id uuid;
  v_members_can_add boolean; v_requires_approval boolean; v_default_perm permission_level;
  v_is_admin boolean; v_status text := 'active'; v_level text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;
  v_owner_col := public.shareable_owner_column(v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);
  EXECUTE format('SELECT %I FROM %I.%I WHERE %I = $1', v_owner_col, v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column)
    INTO v_owner_id USING p_resource_id;
  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Resource not found'); END IF;
  IF v_owner_id <> v_uid  THEN RETURN jsonb_build_object('success', false, 'error', 'You do not own this resource'); END IF;
  IF NOT EXISTS (SELECT 1 FROM iam.organization_member WHERE organization_id=p_target_org_id AND user_id=v_uid) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization not found or you are not a member'); END IF;
  SELECT members_can_add, needs_approval, default_permission
    INTO v_members_can_add, v_requires_approval, v_default_perm
    FROM platform.org_module_config
   WHERE organization_id = p_target_org_id AND module_token = v_resolved.resource_type;
  v_members_can_add   := COALESCE(v_members_can_add, true);
  v_requires_approval := COALESCE(v_requires_approval, false);
  v_level := COALESCE(p_permission_level, v_default_perm::text, 'viewer');
  IF v_level NOT IN ('viewer', 'commenter', 'editor', 'admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level'); END IF;
  SELECT EXISTS (SELECT 1 FROM iam.organization_member WHERE organization_id=p_target_org_id AND user_id=v_uid AND role IN ('owner','admin')) INTO v_is_admin;
  IF NOT v_members_can_add AND NOT v_is_admin THEN RETURN jsonb_build_object('success', false, 'error', 'Members cannot add this kind to the organization'); END IF;
  IF v_requires_approval AND NOT v_is_admin THEN v_status := 'pending'; END IF;
  IF EXISTS (SELECT 1 FROM iam.permissions WHERE resource_type=v_resolved.resource_type AND resource_id=p_resource_id AND granted_to_organization_id=p_target_org_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Organization already has access'); END IF;
  INSERT INTO iam.permissions (resource_type, resource_id, granted_to_organization_id, permission_level, created_by, status)
  VALUES (v_resolved.resource_type, p_resource_id, p_target_org_id, v_level::permission_level, v_uid, v_status)
  RETURNING id INTO v_new_id;
  RETURN jsonb_build_object('success', true,
    'message', CASE WHEN v_status='pending' THEN 'Shared — pending admin approval' ELSE 'Shared with organization' END,
    'permission_id', v_new_id, 'status', v_status, 'permission_level', v_level, 'resource_type', v_resolved.resource_type);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END; $function$

;

CREATE OR REPLACE FUNCTION public.revoke_resource_access(p_resource_type text, p_resource_id uuid, p_target_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_deleted  int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can revoke access');
  END IF;

  DELETE FROM iam.permissions
   WHERE resource_type      = v_resolved.resource_type
     AND resource_id        = p_resource_id
     AND granted_to_user_id = p_target_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No matching permission found'); END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Access revoked');
END;
$function$

;

CREATE OR REPLACE FUNCTION public.revoke_resource_org_access(p_resource_type text, p_resource_id uuid, p_target_org_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_deleted  int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can revoke access');
  END IF;

  DELETE FROM iam.permissions
   WHERE resource_type              = v_resolved.resource_type
     AND resource_id                = p_resource_id
     AND granted_to_organization_id = p_target_org_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No matching organization permission found'); END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Organization access revoked');
END;
$function$

;

CREATE OR REPLACE FUNCTION public.update_permission_level(p_resource_type text, p_resource_id uuid, p_target_user_id uuid DEFAULT NULL::uuid, p_target_org_id uuid DEFAULT NULL::uuid, p_new_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid      uuid := auth.uid();
  v_resolved record;
  v_updated  int;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF p_new_level NOT IN ('viewer', 'commenter', 'editor', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level');
  END IF;
  IF p_target_user_id IS NULL AND p_target_org_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Must specify target user or organization');
  END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'You do not own this resource');
  END IF;

  UPDATE iam.permissions
     SET permission_level = p_new_level::permission_level
   WHERE resource_type = v_resolved.resource_type
     AND resource_id   = p_resource_id
     AND (
       (p_target_user_id IS NOT NULL AND granted_to_user_id        = p_target_user_id)
       OR
       (p_target_org_id  IS NOT NULL AND granted_to_organization_id = p_target_org_id)
     );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'No matching permission found');
  END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Permission level updated to ' || p_new_level);
END;
$function$

;

CREATE OR REPLACE FUNCTION public.get_resource_permissions(p_resource_type text, p_resource_id uuid)
 RETURNS TABLE(id uuid, resource_type text, resource_id uuid, granted_to_user_id uuid, granted_to_organization_id uuid, is_public boolean, permission_level text, created_at timestamp with time zone, granted_to_user jsonb, granted_to_organization jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_resolved record;
BEGIN
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN; END;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    perm.id,
    perm.resource_type::text,
    perm.resource_id,
    perm.granted_to_user_id,
    perm.granted_to_organization_id,
    perm.is_public,
    perm.permission_level::text,
    perm.created_at,
    CASE WHEN perm.granted_to_user_id IS NOT NULL THEN
      jsonb_build_object(
        'id', u.id::text,
        'email', u.email,
        'displayName', COALESCE(
          u.raw_user_meta_data->>'display_name',
          u.raw_user_meta_data->>'full_name',
          split_part(u.email, '@', 1)
        )
      )
    END AS granted_to_user,
    CASE WHEN perm.granted_to_organization_id IS NOT NULL THEN
      jsonb_build_object(
        'id', o.id::text,
        'name', COALESCE(o.name, 'Unknown Organization'),
        'slug', COALESCE(o.slug, 'unknown'),
        'logoUrl', o.logo_url
      )
    END AS granted_to_organization
  FROM iam.permissions perm
  LEFT JOIN auth.users        u ON u.id = perm.granted_to_user_id
  LEFT JOIN iam.organizations o ON o.id = perm.granted_to_organization_id
  WHERE perm.resource_type = v_resolved.resource_type
    AND perm.resource_id   = p_resource_id
  ORDER BY perm.created_at DESC;
END;
$function$

;

delete from platform.client_callable_door d
 where d.schema_name = 'public'
   and d.function_name in ('may_manage_sharing', 'store_door_share', 'store_door_unshare');
drop function if exists public.store_door_unshare(text, uuid, text, uuid);
drop function if exists public.store_door_share(text, uuid, text, uuid, text);
drop function if exists public.may_manage_sharing(text, uuid);

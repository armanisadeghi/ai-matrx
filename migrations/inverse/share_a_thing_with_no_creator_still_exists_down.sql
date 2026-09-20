-- chair-step: the inverse of share_a_thing_with_no_creator_still_exists.sql. It restores the two sharing RPCs' old test, which tells an admin that a Table with no creator does not exist. Rule 27 only.
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
  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  -- SCHEMA `custom` KEEPS ITS OWN DOOR. The record store has rules this generic body
  -- does not know (the store switch, VIS-31's external principal, VIS-34's both-sides wall,
  -- and an UPSERT rather than a refusal on re-share), so the write is handed to it.
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_share(v_resolved.resource_type, p_resource_id, 'person', p_target_user_id, p_permission_level);
  END IF;
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
  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_share(v_resolved.resource_type, p_resource_id, 'organization', p_target_org_id, p_permission_level);
  END IF;
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

delete from platform.client_callable_door d where d.schema_name='public' and d.function_name='shareable_resource_exists';
drop function if exists public.shareable_resource_exists(text, uuid);

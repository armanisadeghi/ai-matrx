-- chair-step: it replaces two live platform sharing RPCs. Each one's EXISTENCE test changes and nothing else: `the owner column is null` becomes `no row with that id`, which are two different facts the old line collapsed into one answer. The additive allow-list refuses a replacement of a live body without a guard knob, and correctly so; these two are the PLATFORM's, serving all 127 registered resource types, and gating them on the record store's product switch would be a lie about what they are. The inverse is migrations/inverse/share_a_thing_with_no_creator_still_exists_down.sql and restores both verbatim.
-- based-on: public.share_resource_with_user(text, uuid, uuid, text) 56bcfe73edef78f48af92f36bb833c5606196a7fb2564e1830656b0a02617e1e
-- based-on: public.share_resource_with_org(text, uuid, uuid, text) d7dbcd6e3d09ab1d63e58f76194987c827b377a1b7bebb54dba362422daa11f2
--
-- SHARE — A THING WITH NO CREATOR IS NOT A THING THAT DOES NOT EXIST.
--
-- Measured on the real screen, 2026-09-19, with the one share dialog open on a Table:
--
--     Resource not found
--
-- The Table is there. What is not there is a value in its `created_by` column, because
-- `custom.table_declare` does not stamp one — and `public.share_resource_with_user` reads the
-- owner column FIRST and treats a null as "Resource not found":
--
--     EXECUTE format('SELECT %I FROM %I.%I WHERE %I = $1', …) INTO v_owner_id USING p_resource_id;
--     IF v_owner_id IS NULL THEN RETURN … 'Resource not found'; END IF;
--
-- Two different facts, one answer. Before this lane it could not be reached, because the very
-- next line refused anybody who was not the owner anyway; once `admin` on the thing became a
-- way in (share_one_ladder_reaches_the_share_dialog.sql), an admin sharing an ownerless row
-- started being told the row does not exist. Censused live: **19 Tables in this database carry
-- no creator**, and every one of them is unshareable with that sentence.
--
-- `public.shareable_resource_exists` asks the registry for the table and the id column and
-- probes for the ROW. Nothing else changes: the ownership question is still asked, one line
-- later, by `public.may_manage_sharing`.
--
-- LEFT BEHIND, deliberately, and named here so it is not lost: `custom.table_declare` should
-- stamp `created_by` so a Table has an Owner like every other record (VIS-25). That is the
-- record store's write door, not the sharing surface, and it needs a backfill decision for the
-- 19 rows that already exist — so it belongs to whoever owns that door, with this file as the
-- evidence that it matters.

create or replace function public.shareable_resource_exists(p_resource_type text, p_resource_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_reg    record;
  v_exists boolean;
begin
  if p_resource_id is null then return false; end if;
  select r.schema_name, r.table_name, r.id_column into v_reg
    from platform.shareable_resource_registry r
   where r.resource_type = p_resource_type and r.is_active;
  if not found then return false; end if;
  execute format('select exists (select 1 from %I.%I where %I = $1)',
                 v_reg.schema_name, v_reg.table_name, v_reg.id_column)
    into v_exists using p_resource_id;
  return coalesce(v_exists, false);
exception when others then
  -- A probe that cannot run is not evidence the row is missing. It answers TRUE so the caller
  -- falls through to the permission check, which refuses on its own terms and in its own words
  -- rather than telling somebody their record has vanished.
  return true;
end;
$$;

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'shareable_resource_exists',
   iam.door_identity_args('public.shareable_resource_exists(text, uuid)'::regprocedure),
   array['text'::regtype::oid, 'uuid'::regtype::oid],
   'It answers one boolean — does a row with this id exist in the table the registry names — and returns no data from it. It is called from inside the sharing RPCs, which apply public.may_manage_sharing immediately afterwards.',
   'migrations/campaign/share_a_thing_with_no_creator_still_exists.sql (lane SHARE)',
   'server_only: an existence probe with no access check of its own, called by the sharing RPCs before they apply their permission check. A client calling it directly could learn whether an id exists without holding anything on it, so it gets no client grant.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

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
  IF NOT public.shareable_resource_exists(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resource not found');
  END IF;
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
$function$;

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
  IF NOT public.shareable_resource_exists(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Resource not found');
  END IF;
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
END; $function$;

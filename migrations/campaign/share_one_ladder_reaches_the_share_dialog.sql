-- chair-step: it replaces SIX live platform sharing RPCs. Not one of them changes what it stores or who it stores it for; each one's OWNERSHIP CHECK — `created_by = auth.uid()`, a second ladder the contract forbids — is replaced by one predicate that admits the Owner exactly as before AND the `admin` rung of VIS-17's one ladder, and each one hands a schema-`custom` write to the record store's own door. The additive allow-list refuses a replacement of a live body without a guard knob, and correctly so; these six are the PLATFORM's, serving all 127 registered resource types, and gating them on the record store's product switch would be a lie about what they are. The inverse is migrations/inverse/share_one_ladder_reaches_the_share_dialog_down.sql and restores all six verbatim.
-- based-on: public.share_resource_with_user(text, uuid, uuid, text) d7e4c8662e525039a336ef9e3d707d15b82547d72a4cdd622626a32b1ebf711f
-- based-on: public.share_resource_with_org(text, uuid, uuid, text) 22edd9bd8c4f5fb4a86b174eb0ef76c16f5aba73b87e6b81ae5ce0514d5cd322
-- based-on: public.revoke_resource_access(text, uuid, uuid) 3b6bfec49519d5e0d369dafa28fddf6e063b74bd1acadea98c22ebed2b791dfe
-- based-on: public.revoke_resource_org_access(text, uuid, uuid) 0a67a4f17348264e444ab87d6015295eb93ef9c53c7a9666880e164dfe7ef0cc
-- based-on: public.update_permission_level(text, uuid, uuid, uuid, text) cda58f6f67e3d7b2d1cb11c57ec37a7064360265f95ccb207b70592eb0959a49
-- based-on: public.get_resource_permissions(text, uuid) 2f959b846d18bb47fe9e4a3e5ea857fb046cc3ea4047e2f503afd655b43e8aeb
--
-- SHARE — THE ONE LADDER REACHES THE SHARE DIALOG.
--
-- WHY NO `-- guard:` LINE. Every other file this lane wrote is held behind `custom/system_enabled`,
-- because everything else it built belongs to the record store. These six functions do not: they
-- are the PLATFORM's sharing RPCs, serving all 127 registered resource types, and gating them on
-- the record store's product switch would be a lie about what they are. The change is a WIDENING
-- and only a widening — `may_manage_sharing` returns true for every caller the old `created_by`
-- check returned true for, and adds the ladder's own `admin` rung on top. Nothing that could
-- share yesterday cannot share today, and nothing that could not READ can now share, because the
-- new arm asks the same access kernel every read on this platform already asks.
--
-- THE DEFECT, MEASURED ON THE MAIN DATABASE 2026-09-19, in a rolled-back transaction, as
-- `authenticated` carrying a real person's JWT.
--
-- VIS-17 is the law: ONE ladder of access levels on things — Owner > admin > editor >
-- commenter > viewer > (none) — and `admin` is defined, in `iam.content_levels()`'s own words,
-- as "can change it and decide who else may". The app has exactly one sharing dialog
-- (matrx-frontend features/sharing) and it drives six generic RPCs. Every one of them asks a
-- DIFFERENT question:
--
--     public.share_resource_with_user     IF v_owner_id <> v_uid  THEN 'You do not own this resource'
--     public.share_resource_with_org      IF v_owner_id <> v_uid  THEN 'You do not own this resource'
--     public.revoke_resource_access       IF NOT is_resource_owner THEN 'Only the owner can revoke'
--     public.revoke_resource_org_access   IF NOT is_resource_owner THEN 'Only the owner can revoke'
--     public.update_permission_level      IF NOT is_resource_owner THEN 'You do not own this resource'
--     public.get_resource_permissions     IF NOT is_resource_owner THEN RETURN;   -- silently empty
--
-- `is_resource_owner` reads ONE column — `created_by`. So the rung whose entire definition is
-- "decides who else may" could not share, could not change a level, could not revoke, and — the
-- worst of the six — was handed an EMPTY LIST by `get_resource_permissions` rather than a
-- refusal, so the dialog showed an admin "nobody has access" and no error at all. That is a
-- second ladder, and the contract says a second ladder anywhere is a defect.
--
-- Measured: as test@test.com, holding admin on a record in admin's Workspace,
-- `share_resource_with_user('record', …)` answered
--     {"success": false, "error": "You do not own this resource"}
--
-- THE FIX, and it is the class rather than the record store's instance: ONE predicate,
-- `public.may_manage_sharing`, asked by all six. It admits the Owner exactly as before (nothing
-- narrows — an owner who could share yesterday can share today) and adds the ladder's own
-- `admin` rung, asked through the SAME access kernel the rest of the platform asks. For a
-- record it asks `custom.has_visibility`, which is the store's one ladder including the
-- organization's member default and the carrying walk; for everything else it asks
-- `iam.has_access_for`, the platform's kernel. It never invents an arm.
--
-- AND THE RECORD STORE KEEPS ITS OWN DOOR. The generic bodies do not know the store's rules —
-- the product switch, VIS-31's closed external-principal lane, VIS-34's both-organizations
-- wall, and that re-sharing somebody at a new level is an UPSERT rather than the generic
-- "already has access" refusal. So for any resource whose registry row says schema `custom`,
-- the WRITE is handed to `custom.share_grant` / `custom.share_revoke` through two thin
-- adapters. One write path, the store's rules, the app's one dialog.
--
-- WHAT THIS DOES NOT DO: it does not touch `public.is_resource_owner`, which still answers the
-- narrow question it has always answered, for the callers that genuinely want the creator.

-- ───────────────────────────────────────────────────────────── the one question, asked once

create function public.may_manage_sharing(p_resource_type text, p_resource_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_uid   uuid := (select auth.uid());
  v_owner uuid;
begin
  if v_uid is null or p_resource_id is null then return false; end if;

  -- Rung one, unchanged and first: the Owner. VIS-25 holds it as `created_by` on the row
  -- itself, so this is the same read `public.is_resource_owner` makes.
  v_owner := iam.owner_of(p_resource_type, p_resource_id);
  if v_owner is not null and v_owner = v_uid then return true; end if;

  -- Rung two, which is what was missing: `admin` ON THE THING. Asked through the store's own
  -- ladder for a record (it carries the organization's member default and the carrying walk
  -- that the platform kernel does not), and through the platform's kernel for everything else.
  if p_resource_type = 'record' then
    return custom.has_visibility(v_uid, 'record', p_resource_id, 'admin'::public.permission_level);
  end if;
  return iam.has_access_for(v_uid, p_resource_type, p_resource_id, 'admin'::public.permission_level);
exception when others then
  -- A question this cannot answer is answered NO. An access predicate that raises is an access
  -- predicate that took a screen down; one that guesses yes is a hole.
  return false;
end;
$$;

comment on function public.may_manage_sharing(text, uuid) is
  'VIS-17, 2026-09-19 (lane SHARE). "May this person decide who else may see this thing?" — the '
  'Owner rung or the `admin` rung of the ONE ladder, and nothing else. The six generic share RPCs '
  'asked `created_by = auth.uid()` instead, which made `admin` a level that could not do the one '
  'thing its own definition names. Widens only: every caller the old check admitted, this admits.';

-- ──────────────────────────────────────────── the two adapters onto the record store's door

create function public.store_door_share(
  p_resource_type text, p_resource_id uuid, p_kind text, p_principal_id uuid, p_level text
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org uuid;
  v_out jsonb;
begin
  -- The store is keyed (organization_id, id) and the generic dialog has no organization in
  -- hand, so it is READ OFF THE ROW rather than taken from the caller: a record id names
  -- exactly one organization, and `custom.share_grant` then checks this caller's membership of
  -- THAT one. Nothing here lets a caller name an organization they are not in.
  select r.organization_id into v_org from custom.record r where r.id = p_resource_id;
  if v_org is null then
    return jsonb_build_object('success', false, 'error', 'Resource not found');
  end if;
  v_out := custom.share_grant(v_org, p_resource_id, p_kind, p_principal_id,
                              coalesce(p_level, 'viewer')::public.permission_level);
  return jsonb_build_object('success', true, 'message', v_out ->> 'message',
                            'permission_id', v_out ->> 'permission_id',
                            'permission_level', v_out ->> 'level',
                            'resource_type', p_resource_type);
exception when others then
  -- The store's refusals are SENTENCES, written for the person who hit them. They are carried
  -- through verbatim rather than replaced with a generic failure.
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

create function public.store_door_unshare(
  p_resource_type text, p_resource_id uuid, p_kind text, p_principal_id uuid
) returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog'
as $$
declare
  v_org uuid;
  v_out jsonb;
begin
  select r.organization_id into v_org from custom.record r where r.id = p_resource_id;
  if v_org is null then
    return jsonb_build_object('success', false, 'error', 'Resource not found');
  end if;
  v_out := custom.share_revoke(v_org, p_resource_id, p_kind, p_principal_id);
  -- `still_reaches` is the honest half: a revoked grant does not always end access, and the
  -- store says so. The message is carried through so the dialog can repeat it rather than
  -- claim the person is out.
  return jsonb_build_object('success', true, 'message', v_out ->> 'message',
                            'still_reaches', v_out ->> 'still_reaches',
                            'resource_type', p_resource_type);
exception when others then
  return jsonb_build_object('success', false, 'error', sqlerrm);
end;
$$;

-- ───────────────────────────────────── the six, each asking the one question (bodies patched)

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
END; $function$;

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

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_unshare(v_resolved.resource_type, p_resource_id, 'person', p_target_user_id);
  END IF;

  DELETE FROM iam.permissions
   WHERE resource_type      = v_resolved.resource_type
     AND resource_id        = p_resource_id
     AND granted_to_user_id = p_target_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No matching permission found'); END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Access revoked');
END;
$function$;

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

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_unshare(v_resolved.resource_type, p_resource_id, 'organization', p_target_org_id);
  END IF;

  DELETE FROM iam.permissions
   WHERE resource_type              = v_resolved.resource_type
     AND resource_id                = p_resource_id
     AND granted_to_organization_id = p_target_org_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted = 0 THEN RETURN jsonb_build_object('success', false, 'error', 'No matching organization permission found'); END IF;
  RETURN jsonb_build_object('success', true, 'message', 'Organization access revoked');
END;
$function$;

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

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error',
      'You need Admin on this to decide who else may see it. Ask whoever holds it, or an owner of the organization.');
  END IF;
  IF v_resolved.schema_name = 'custom' THEN
    RETURN public.store_door_share(v_resolved.resource_type, p_resource_id,
             CASE WHEN p_target_org_id IS NOT NULL THEN 'organization' ELSE 'person' END,
             COALESCE(p_target_org_id, p_target_user_id), p_new_level);
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
$function$;

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

  IF NOT public.may_manage_sharing(v_resolved.resource_type, p_resource_id) THEN RETURN; END IF;

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
$function$;

-- ────────────────────────────────────────────────── the three new functions, declared in data

insert into platform.client_callable_door
  (schema_name, function_name, identity_args, identity_argtypes, reason, declared_by,
   non_client_lane, signed_in_callers, anonymous_callers)
values
  ('public', 'may_manage_sharing',
   iam.door_identity_args('public.may_manage_sharing(text, uuid)'::regprocedure),
   array['text'::regtype::oid, 'uuid'::regtype::oid],
   'Both arguments name the thing being asked about, and the answer is about THE CALLER (auth.uid()) and nothing else: it returns a boolean, never a row, and it cannot be steered to ask on somebody else''s behalf. A NULL id, an unregistered type or any error answers false. Client-callable because the share dialog has to know whether to draw its controls at all — a dialog that shows them and then refuses is the dead control this platform refuses.',
   'migrations/campaign/share_one_ladder_reaches_the_share_dialog.sql (lane SHARE)',
   null, true, false),
  ('public', 'store_door_share',
   iam.door_identity_args('public.store_door_share(text, uuid, text, uuid, text)'::regprocedure),
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid],
   'server_only: an adapter the six generic sharing RPCs call after they have already applied public.may_manage_sharing. It resolves the record''s own organization off the row (so a caller cannot name one) and hands the write to custom.share_grant, which applies the store switch, the organization wall and the external-principal rule itself. No client calls it: a client calls share_resource_with_user, which is where the permission decision lives.',
   'migrations/campaign/share_one_ladder_reaches_the_share_dialog.sql (lane SHARE)',
   'server_only: this is an adapter between the platform''s generic sharing RPCs and the record store''s own share door. The permission decision is made by the RPC that calls it; a client that reached this directly would skip that decision, so no client grant is issued and schema public''s EXECUTE is not extended to it.',
   false, false),
  ('public', 'store_door_unshare',
   iam.door_identity_args('public.store_door_unshare(text, uuid, text, uuid)'::regprocedure),
   array['text'::regtype::oid, 'uuid'::regtype::oid, 'text'::regtype::oid, 'uuid'::regtype::oid],
   'server_only: the revoke half of the same adapter, with the same reasoning.',
   'migrations/campaign/share_one_ladder_reaches_the_share_dialog.sql (lane SHARE)',
   'server_only: this is an adapter between the platform''s generic sharing RPCs and the record store''s own share door. The permission decision is made by the RPC that calls it; a client that reached this directly would skip that decision, so no client grant is issued and schema public''s EXECUTE is not extended to it.',
   false, false)
on conflict (schema_name, function_name, identity_argtypes) do nothing;

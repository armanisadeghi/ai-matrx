-- sharing_registry_canonical_owner_column_fix.sql
-- ============================================================================
-- Fix: sharing is broken for every table that was canonicalized onto the
-- platform base contract (created_by / visibility) while its
-- platform.shareable_resource_registry row still declared the pre-reorg
-- owner_column ('user_id'/'owner_id') and is_public_column ('is_public').
--
-- Symptom (live, /notes 2026-07-07): get_resource_permissions / listPermissions
-- / share_resource_with_user all throw 42703 `column "user_id" does not exist`
-- because resolve_shareable_resource() hands the RPCs a column name that no
-- longer exists on the physical table. The RPC's owner lookup
--   EXECUTE 'SELECT user_id FROM workbench.notes ...'
-- errors, and (for get_resource_permissions/is_resource_owner) the error is
-- uncaught and propagates to the client. Sharing a note is 100% broken.
--
-- Two-layer fix (structural + data), so this class is impossible, not patched:
--   1. STRUCTURAL — owner-resolving RPCs (is_resource_owner,
--      share_resource_with_user, share_resource_with_org) resolve the effective
--      owner column at call time: use the registry column if it physically
--      exists, else fall back to the canonical `created_by`. A future table that
--      canonicalizes before its registry row is updated now Just Works.
--   2. STRUCTURAL — make_resource_public / make_resource_private only touch a
--      declared is_public_column when it physically exists AND is boolean, so a
--      stale/legacy is_public_column can never produce a bad UPDATE (e.g. the
--      is_public_column='visibility' double-set bug).
--   3. DATA — bring every registry row into line with its live table:
--      B strip double-qualified table_name ('scraper.crawl_runs' -> 'crawl_runs')
--      C deactivate rows whose physical table no longer exists
--      D owner_column -> 'created_by' where the declared owner col is gone
--      E is_public_column -> NULL wherever the table has the visibility enum
--        (visibility is the canonical public driver; the legacy boolean is
--        ignored by RLS and must not be written).
--
-- Idempotent (CREATE OR REPLACE + guarded, live-schema-driven UPDATEs); safe to
-- re-apply and self-heals the same class for any newly-canonicalized table.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Effective-owner-column resolver (the structural class-killer)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.shareable_owner_column(
  p_schema         text,
  p_table          text,
  p_registry_owner text
) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  -- Prefer the registry-declared owner column when it physically exists.
  IF p_registry_owner IS NOT NULL AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_schema AND table_name = p_table
      AND column_name = p_registry_owner
  ) THEN
    RETURN p_registry_owner;
  END IF;

  -- Canonical fallback: created_by is the owner on every canonical entity table.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_schema AND table_name = p_table
      AND column_name = 'created_by'
  ) THEN
    RETURN 'created_by';
  END IF;

  -- Last resort: hand back the registry value so the caller raises a clear,
  -- loud column error rather than silently mis-authorizing.
  RETURN p_registry_owner;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. is_resource_owner — resolve owner column via the helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_resource_owner(p_resource_type text, p_resource_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_resolved  record;
  v_owner_col text;
  v_owner_id  uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN false; END;

  v_owner_col := public.shareable_owner_column(
    v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);

  EXECUTE format(
    'SELECT %I FROM %I.%I WHERE %I = $1',
    v_owner_col, v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column
  ) INTO v_owner_id USING p_resource_id;

  RETURN v_owner_id IS NOT NULL AND v_owner_id = v_uid;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. share_resource_with_user — resolve owner column via the helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_resource_with_user(p_resource_type text, p_resource_id uuid, p_target_user_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_resolved  record;
  v_owner_col text;
  v_owner_id  uuid;
  v_new_id    uuid;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  IF p_permission_level NOT IN ('viewer', 'editor', 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level');
  END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  v_owner_col := public.shareable_owner_column(
    v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);

  EXECUTE format(
    'SELECT %I FROM %I.%I WHERE %I = $1',
    v_owner_col, v_resolved.schema_name, v_resolved.table_name, v_resolved.id_column
  ) INTO v_owner_id USING p_resource_id;

  IF v_owner_id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Resource not found'); END IF;
  IF v_owner_id <> v_uid  THEN RETURN jsonb_build_object('success', false, 'error', 'You do not own this resource'); END IF;

  IF EXISTS (
    SELECT 1 FROM iam.permissions
    WHERE resource_type      = v_resolved.resource_type
      AND resource_id        = p_resource_id
      AND granted_to_user_id = p_target_user_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'This user already has access to this resource');
  END IF;

  INSERT INTO iam.permissions (
    resource_type, resource_id, granted_to_user_id, permission_level, created_by
  ) VALUES (
    v_resolved.resource_type, p_resource_id, p_target_user_id,
    p_permission_level::permission_level, v_uid
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Successfully shared with user',
    'permission_id', v_new_id,
    'resource_type', v_resolved.resource_type
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. share_resource_with_org — resolve owner column via the helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.share_resource_with_org(p_resource_type text, p_resource_id uuid, p_target_org_id uuid, p_permission_level text DEFAULT 'viewer'::text)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid(); v_resolved record; v_owner_col text; v_owner_id uuid; v_new_id uuid;
  v_members_can_add boolean; v_requires_approval boolean; v_default_perm permission_level;
  v_is_admin boolean; v_status text := 'active'; v_level text;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  v_owner_col := public.shareable_owner_column(
    v_resolved.schema_name, v_resolved.table_name, v_resolved.owner_column);

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
  IF v_level NOT IN ('viewer', 'editor', 'admin') THEN RETURN jsonb_build_object('success', false, 'error', 'Invalid permission level'); END IF;
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

-- ---------------------------------------------------------------------------
-- 5. make_resource_public — only write is_public_column when it is a real
--    boolean column (kills the is_public_column='visibility' double-set bug).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_resource_public(p_resource_type text, p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_resolved     record;
  v_has_card_vis boolean;
  v_has_vis      boolean;
  v_has_bool_pub boolean;
  v_set          text := '';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name AND column_name='card_visibility') INTO v_has_card_vis;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name AND column_name='visibility') INTO v_has_vis;
  SELECT (v_resolved.is_public_column IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name
      AND column_name=v_resolved.is_public_column AND data_type='boolean')) INTO v_has_bool_pub;

  IF NOT v_has_card_vis AND NOT v_has_vis AND NOT v_has_bool_pub THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Resource %s does not support public visibility', v_resolved.resource_type));
  END IF;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can change visibility');
  END IF;

  -- card_visibility wins (body visibility on agent.definition is CHECK-capped non-public)
  IF v_has_card_vis THEN
    v_set := 'card_visibility = ''public''::platform.visibility';
  ELSIF v_has_vis THEN
    v_set := 'visibility = ''public''::platform.visibility';
  END IF;

  IF v_has_bool_pub THEN
    v_set := v_set || CASE WHEN v_set <> '' THEN ', ' ELSE '' END || format('%I = true', v_resolved.is_public_column);
  END IF;

  EXECUTE format('UPDATE %I.%I SET %s WHERE %I = $1',
    v_resolved.schema_name, v_resolved.table_name, v_set, v_resolved.id_column) USING p_resource_id;

  RETURN jsonb_build_object('success', true, 'message', v_resolved.display_label || ' is now public');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. make_resource_private — same is_public_column guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.make_resource_private(p_resource_type text, p_resource_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          uuid := auth.uid();
  v_resolved     record;
  v_has_card_vis boolean;
  v_has_vis      boolean;
  v_has_bool_pub boolean;
  v_default      text;
  v_set          text := '';
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Not authenticated'); END IF;
  BEGIN
    SELECT * INTO STRICT v_resolved FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success', false, 'error', SQLERRM); END;

  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name AND column_name='card_visibility') INTO v_has_card_vis;
  SELECT EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name AND column_name='visibility') INTO v_has_vis;
  SELECT (v_resolved.is_public_column IS NOT NULL AND EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema=v_resolved.schema_name AND table_name=v_resolved.table_name
      AND column_name=v_resolved.is_public_column AND data_type='boolean')) INTO v_has_bool_pub;

  IF NOT v_has_card_vis AND NOT v_has_vis AND NOT v_has_bool_pub THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('Resource %s does not support public visibility', v_resolved.resource_type));
  END IF;

  IF NOT public.is_resource_owner(v_resolved.resource_type, p_resource_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only the owner can change visibility');
  END IF;

  SELECT e.default_visibility::text INTO v_default
    FROM platform.entity_types e
   WHERE e.schema_name = v_resolved.schema_name AND e.table_name = v_resolved.table_name;
  v_default := COALESCE(v_default, 'internal');

  IF v_has_card_vis THEN
    v_set := format('card_visibility = %L::platform.visibility', v_default);
  ELSIF v_has_vis THEN
    v_set := format('visibility = %L::platform.visibility', v_default);
  END IF;

  IF v_has_bool_pub THEN
    v_set := v_set || CASE WHEN v_set <> '' THEN ', ' ELSE '' END || format('%I = false', v_resolved.is_public_column);
  END IF;

  EXECUTE format('UPDATE %I.%I SET %s WHERE %I = $1',
    v_resolved.schema_name, v_resolved.table_name, v_set, v_resolved.id_column) USING p_resource_id;

  RETURN jsonb_build_object('success', true, 'message', v_resolved.display_label || ' is now private');
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7. DATA — bring registry rows into line with their live tables.
--    Order matters: B (fix table_name) before C/D/E (which read the table).
-- ---------------------------------------------------------------------------

-- B: strip a double-qualified table_name ('scraper.crawl_runs' -> 'crawl_runs').
UPDATE platform.shareable_resource_registry
SET table_name = split_part(table_name, '.', 2)
WHERE table_name LIKE schema_name || '.%';

-- C: deactivate rows whose physical table no longer exists (dropped features).
UPDATE platform.shareable_resource_registry r
SET is_active = false
WHERE r.is_active
  AND to_regclass(r.schema_name || '.' || r.table_name) IS NULL;

-- D: owner_column -> 'created_by' where the declared owner column is gone but
--    the canonical created_by exists.
UPDATE platform.shareable_resource_registry r
SET owner_column = 'created_by'
WHERE r.is_active
  AND r.owner_column IS DISTINCT FROM 'created_by'
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name AND c.column_name=r.owner_column)
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name AND c.column_name='created_by');

-- E: is_public_column -> NULL wherever the table has the canonical visibility
--    enum (visibility is the public driver; the legacy boolean is RLS-ignored).
UPDATE platform.shareable_resource_registry r
SET is_public_column = NULL
WHERE r.is_active
  AND r.is_public_column IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM information_schema.columns c
    WHERE c.table_schema=r.schema_name AND c.table_name=r.table_name AND c.column_name='visibility');

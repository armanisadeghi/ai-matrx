-- scope_rpcs_org_membership_guard.sql
-- KNOWN_DEFECTS D2 (cheap slice, 2026-07-02): close the unauthenticated scope
-- DEFINER RPCs. Before this, create_scope / create_scope_type / update_scope /
-- delete_scope / delete_scope_type were SECURITY DEFINER, granted to `anon`, and
-- performed ZERO caller checks — any user (even anonymous) could create/rename/
-- DELETE scopes and scope-types in ANY org. delete_scope_type cascades to every
-- scope of the type + every association edge (irrecoverable).
--
-- Fix (mirrors the existing set_scope_context_value guard + ctx_set_entity_scopes_auth.sql):
--   1. Every write RPC resolves the target org and requires iam.has_org_access(org)
--      (member of that org) — closes cross-org writes. auth.uid() is NULL for anon,
--      so has_org_access is false → RAISE 42501, blocking anon even before the grant.
--   2. SET search_path on each (protected-resources: no search-path injection foothold).
--   3. REVOKE EXECUTE FROM anon on all scope write RPCs (defense in depth; the anon
--      role has no legitimate reason to author org scopes).
-- Idempotent: CREATE OR REPLACE + REVOKE IF ... (REVOKE is a no-op if already revoked).
-- The broader iam.memberships RLS rework stays deferred to the security overhaul
-- (its takeover/disclosure holes were already closed by the canonical RLS).
-- (No explicit BEGIN/COMMIT: applied via Supabase apply_migration, which wraps its
-- own transaction; every statement below is individually idempotent + safe.)

-- ---------------------------------------------------------------------------
-- create_scope: guard the target org (p_org_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_scope(
  p_org_id uuid, p_type_id uuid, p_name text, p_parent_scope_id uuid DEFAULT NULL::uuid,
  p_description text DEFAULT ''::text, p_settings jsonb DEFAULT '{}'::jsonb,
  p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
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
    p_org_id, p_type_id, p_parent_scope_id, p_name, p_description, p_settings, p_slug, v_sort, auth.uid()
  )
  RETURNING * INTO v_scope;
  SELECT label_singular INTO v_type_label FROM context.scope_types WHERE id = p_type_id;
  RETURN to_jsonb(v_scope) || jsonb_build_object('type_label', v_type_label);
END;
$function$;

-- ---------------------------------------------------------------------------
-- create_scope_type: guard the target org (p_org_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_scope_type(
  p_org_id uuid, p_label_singular text, p_label_plural text, p_parent_type_id uuid DEFAULT NULL::uuid,
  p_icon text DEFAULT 'folder'::text, p_description text DEFAULT ''::text, p_sort_order smallint DEFAULT 0,
  p_max_assignments smallint DEFAULT NULL::smallint, p_default_variable_keys text[] DEFAULT '{}'::text[],
  p_color text DEFAULT NULL::text, p_slug text DEFAULT NULL::text)
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

-- ---------------------------------------------------------------------------
-- update_scope: resolve org from the scope, guard it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_scope(
  p_scope_id uuid, p_name text DEFAULT NULL::text, p_description text DEFAULT NULL::text,
  p_settings jsonb DEFAULT NULL::jsonb, p_slug text DEFAULT NULL::text, p_sort_order smallint DEFAULT NULL::smallint)
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

-- ---------------------------------------------------------------------------
-- delete_scope: resolve org from the scope, guard it (cascades to children + edges)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_scope(p_scope_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_child_count int; v_assignment_count int; v_org uuid;
BEGIN
    SELECT organization_id INTO v_org FROM context.scopes WHERE id = p_scope_id;
    IF v_org IS NULL OR NOT iam.has_org_access(v_org) THEN
      RAISE EXCEPTION 'not authorized to delete scope %', p_scope_id USING ERRCODE = '42501';
    END IF;

    WITH RECURSIVE children AS (
        SELECT id FROM context.scopes WHERE parent_scope_id = p_scope_id
        UNION ALL
        SELECT s.id FROM context.scopes s JOIN children c ON s.parent_scope_id = c.id
    )
    SELECT count(*) INTO v_child_count FROM children;

    WITH RECURSIVE all_scopes AS (
        SELECT p_scope_id AS id
        UNION ALL
        SELECT s.id FROM context.scopes s JOIN all_scopes a ON s.parent_scope_id = a.id
    )
    SELECT count(*) INTO v_assignment_count
    FROM platform.associations
    WHERE target_type='scope' AND target_id IN (SELECT id FROM all_scopes);

    DELETE FROM context.scopes WHERE id = p_scope_id;

    RETURN jsonb_build_object('deleted_children', v_child_count, 'deleted_assignments', v_assignment_count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- delete_scope_type: resolve org from the type, guard it (cascades every scope of the type)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_scope_type(p_type_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_scope_count int; v_assignment_count int; v_org uuid;
BEGIN
    SELECT organization_id INTO v_org FROM context.scope_types WHERE id = p_type_id;
    IF v_org IS NULL OR NOT iam.has_org_access(v_org) THEN
      RAISE EXCEPTION 'not authorized to delete scope type %', p_type_id USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_assignment_count
    FROM platform.associations a
    JOIN context.scopes s ON a.target_id = s.id
    WHERE a.target_type='scope' AND s.scope_type_id = p_type_id;

    SELECT count(*) INTO v_scope_count FROM context.scopes WHERE scope_type_id = p_type_id;

    DELETE FROM context.scope_types WHERE id = p_type_id;

    RETURN jsonb_build_object('deleted_scopes', v_scope_count, 'deleted_assignments', v_assignment_count);
END;
$function$;

-- ---------------------------------------------------------------------------
-- Defense in depth: no anon EXECUTE on any scope write RPC. `authenticated` keeps it.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.create_scope(uuid,uuid,text,uuid,text,jsonb,text,smallint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_scope_type(uuid,text,text,uuid,text,text,smallint,smallint,text[],text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_scope(uuid,text,text,jsonb,text,smallint) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_scope(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_scope_type(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_scope_context_value(uuid,uuid,text,numeric,boolean,jsonb,text,date,text) FROM anon;

COMMIT;

-- library_reachability_cascade_hardening.sql
--
-- Hardens library_store_file_reachability_cascade after adversarial review:
--   1. entity_row_access_attrs — tables with owner_id / no visibility no longer
--      abort has_access before the reachability loop (processed_document fix)
--   2. page-image cld_file → processed_document associations + sync trigger
--   3. member/doc sync triggers drop OLD edges on identity UPDATE
--   4. public.has_access_as locked to service_role (no anon/authenticated probe)
--
-- Idempotent. Apply after library_store_file_reachability_cascade.sql.

-- ---------------------------------------------------------------------------
-- 1. Robust ownership/visibility probe for registered entity tables
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.entity_row_access_attrs(
  p_schema text,
  p_table text,
  p_id uuid,
  OUT o_vis platform.visibility,
  OUT o_owner uuid,
  OUT o_org uuid,
  OUT o_found boolean
)
RETURNS record
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'platform'
AS $$
BEGIN
  o_found := false;
  o_vis := 'private'::platform.visibility;
  o_owner := NULL;
  o_org := NULL;

  IF p_schema IS NULL OR p_table IS NULL OR p_id IS NULL THEN
    RETURN;
  END IF;

  -- Canonical shape (files, data_stores, most platform entities)
  BEGIN
    EXECUTE format(
      'SELECT visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- visibility + owner_id (rare hybrid)
  BEGIN
    EXECUTE format(
      'SELECT visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- docproc.processed_documents: owner_id, no visibility column
  BEGIN
    EXECUTE format(
      'SELECT ''private''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- created_by without visibility
  BEGIN
    EXECUTE format(
      'SELECT ''private''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but no ownership columns — still allow reachability below
  BEGIN
    EXECUTE format(
      'SELECT ''private''::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$$;

COMMENT ON FUNCTION platform.entity_row_access_attrs(text, text, uuid) IS
  'Resolve visibility/owner/org for iam.has_access. Maps owner_id→owner and defaults missing visibility to private so tables like docproc.processed_documents still reach the reachability loop.';

REVOKE ALL ON FUNCTION platform.entity_row_access_attrs(text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.entity_row_access_attrs(text, text, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. iam.has_access — use entity_row_access_attrs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iam.has_access(
  p_type text,
  p_id uuid,
  p_required permission_level DEFAULT 'viewer'::permission_level
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
DECLARE
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := (SELECT auth.uid());
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid; v_c_found boolean;
  rec record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT schema_name, table_name, COALESCE(is_component,false)
    INTO v_schema, v_table, v_is_component
  FROM platform.entity_types WHERE token = p_type;
  IF v_schema IS NULL THEN RETURN false; END IF;

  IF v_is_component THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships WHERE child_type = p_type AND kind='composition' LIMIT 1;
    IF v_parent_type IS NULL THEN RETURN false; END IF;
    EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', v_parent_col, v_schema, v_table)
      INTO v_parent_id USING p_id;
    IF v_parent_id IS NULL THEN RETURN false; END IF;
    RETURN iam.has_access(v_parent_type, v_parent_id, p_required);
  END IF;

  IF p_type = 'data_store' AND p_required = 'viewer'
       AND public.user_can_read_data_store_via_grant(v_uid, p_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_vis, v_owner, v_org, v_found
  FROM platform.entity_row_access_attrs(v_schema, v_table, p_id);
  IF NOT COALESCE(v_found, false) THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;
  IF p_required = 'viewer' AND v_org IS NOT NULL AND public.is_org_admin(v_org) THEN RETURN true; END IF;
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;

  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
       AND public.is_super_admin()
  THEN RETURN true; END IF;

  IF public.has_permission(p_type, p_id, p_required) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM iam.memberships m
    JOIN iam.membership_grant g ON g.member_role = m.role AND g.container_type IN (p_type, '*')
    WHERE m.container_type = p_type AND m.container_id = p_id AND m.user_id = v_uid
      AND m.deleted_at IS NULL AND g.confers >= p_required
  ) THEN RETURN true; END IF;

  FOR rec IN
    SELECT r.container_type, r.container_id
    FROM platform.reachability r
    WHERE r.item_type = p_type AND r.item_id = p_id
      AND r.max_level >= p_required
  LOOP
    IF public.has_permission(rec.container_type, rec.container_id, p_required) THEN
      RETURN true;
    END IF;
    IF rec.container_type = 'data_store' AND p_required = 'viewer'
         AND public.user_can_read_data_store_via_grant(v_uid, rec.container_id) THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM iam.memberships m
      JOIN iam.membership_grant g ON g.member_role = m.role
        AND g.container_type IN (rec.container_type, '*')
      WHERE m.container_type = rec.container_type AND m.container_id = rec.container_id
        AND m.user_id = v_uid AND m.deleted_at IS NULL AND g.confers >= p_required
    ) THEN
      RETURN true;
    END IF;
    SELECT et.schema_name, et.table_name INTO v_c_schema, v_c_table
    FROM platform.entity_types et WHERE et.token = rec.container_type;
    IF v_c_schema IS NOT NULL THEN
      SELECT * INTO v_c_vis, v_c_owner, v_c_org, v_c_found
      FROM platform.entity_row_access_attrs(v_c_schema, v_c_table, rec.container_id);
      IF v_c_owner = v_uid THEN RETURN true; END IF;
      IF p_required = 'viewer' AND v_c_vis IS NOT NULL THEN
        IF v_c_vis = 'public' THEN RETURN true; END IF;
        IF v_c_vis >= 'internal'::platform.visibility
             AND v_c_org IS NOT NULL AND iam.has_org_access(v_c_org) THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_vis >= 'internal'::platform.visibility AND v_org IS NOT NULL
       AND iam.has_org_access(v_org) THEN RETURN true; END IF;
  IF v_vis >= 'internal'::platform.visibility THEN
    FOR rec IN SELECT parent_type, fk_column FROM platform.entity_relationships
               WHERE child_type = p_type AND kind='containment' LOOP
      EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', rec.fk_column, v_schema, v_table)
        INTO v_parent_id USING p_id;
      IF v_parent_id IS NOT NULL AND iam.has_access(rec.parent_type, v_parent_id, p_required) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END
$function$;

-- ---------------------------------------------------------------------------
-- 3. iam.has_access_as — same attrs helper
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION iam.has_access_as(
  p_user uuid,
  p_type text,
  p_id uuid,
  p_required permission_level DEFAULT 'viewer'::permission_level
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'platform', 'iam', 'rag'
AS $function$
DECLARE
  v_schema text; v_table text; v_is_component boolean;
  v_uid uuid := p_user;
  v_vis platform.visibility; v_owner uuid; v_org uuid; v_found boolean;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid; v_c_found boolean;
  rec record;
BEGIN
  IF v_uid IS NULL THEN RETURN false; END IF;

  SELECT schema_name, table_name, COALESCE(is_component,false)
    INTO v_schema, v_table, v_is_component
  FROM platform.entity_types WHERE token = p_type;
  IF v_schema IS NULL THEN RETURN false; END IF;

  IF v_is_component THEN
    SELECT parent_type, fk_column INTO v_parent_type, v_parent_col
    FROM platform.entity_relationships WHERE child_type = p_type AND kind='composition' LIMIT 1;
    IF v_parent_type IS NULL THEN RETURN false; END IF;
    EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', v_parent_col, v_schema, v_table)
      INTO v_parent_id USING p_id;
    IF v_parent_id IS NULL THEN RETURN false; END IF;
    RETURN iam.has_access_as(v_uid, v_parent_type, v_parent_id, p_required);
  END IF;

  IF p_type = 'data_store' AND p_required = 'viewer'
       AND public.user_can_read_data_store_via_grant(v_uid, p_id) THEN
    RETURN true;
  END IF;

  SELECT * INTO v_vis, v_owner, v_org, v_found
  FROM platform.entity_row_access_attrs(v_schema, v_table, p_id);
  IF NOT COALESCE(v_found, false) THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;
  IF p_required = 'viewer' AND v_org IS NOT NULL AND EXISTS (
       SELECT 1 FROM iam.organization_member om
       WHERE om.organization_id = v_org AND om.user_id = v_uid
         AND om.role IN ('owner', 'admin')
     ) THEN RETURN true; END IF;
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;

  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
       AND EXISTS (SELECT 1 FROM admin.admins a WHERE a.user_id = v_uid AND a.level = 'super_admin')
  THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM iam.permissions p
    WHERE p.resource_type = p_type
      AND p.resource_id = p_id
      AND COALESCE(p.status, 'active') = 'active'
      AND (p.expires_at IS NULL OR p.expires_at > now())
      AND p.permission_level >= p_required
      AND (
        p.granted_to_user_id = v_uid
        OR (p.granted_to_organization_id IS NOT NULL AND EXISTS (
              SELECT 1 FROM iam.organization_member om
              WHERE om.organization_id = p.granted_to_organization_id AND om.user_id = v_uid))
        OR COALESCE(p.is_public, false) IS TRUE
      )
  ) THEN RETURN true; END IF;

  IF EXISTS (
    SELECT 1 FROM iam.memberships m
    JOIN iam.membership_grant g ON g.member_role = m.role AND g.container_type IN (p_type, '*')
    WHERE m.container_type = p_type AND m.container_id = p_id AND m.user_id = v_uid
      AND m.deleted_at IS NULL AND g.confers >= p_required
  ) THEN RETURN true; END IF;

  FOR rec IN
    SELECT r.container_type, r.container_id
    FROM platform.reachability r
    WHERE r.item_type = p_type AND r.item_id = p_id
      AND r.max_level >= p_required
  LOOP
    IF EXISTS (
      SELECT 1 FROM iam.permissions p
      WHERE p.resource_type = rec.container_type
        AND p.resource_id = rec.container_id
        AND COALESCE(p.status, 'active') = 'active'
        AND (p.expires_at IS NULL OR p.expires_at > now())
        AND p.permission_level >= p_required
        AND (
          p.granted_to_user_id = v_uid
          OR (p.granted_to_organization_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM iam.organization_member om
                WHERE om.organization_id = p.granted_to_organization_id AND om.user_id = v_uid))
          OR COALESCE(p.is_public, false) IS TRUE
        )
    ) THEN RETURN true; END IF;

    IF rec.container_type = 'data_store' AND p_required = 'viewer'
         AND public.user_can_read_data_store_via_grant(v_uid, rec.container_id) THEN
      RETURN true;
    END IF;

    IF EXISTS (
      SELECT 1 FROM iam.memberships m
      JOIN iam.membership_grant g ON g.member_role = m.role
        AND g.container_type IN (rec.container_type, '*')
      WHERE m.container_type = rec.container_type AND m.container_id = rec.container_id
        AND m.user_id = v_uid AND m.deleted_at IS NULL AND g.confers >= p_required
    ) THEN
      RETURN true;
    END IF;

    SELECT et.schema_name, et.table_name INTO v_c_schema, v_c_table
    FROM platform.entity_types et WHERE et.token = rec.container_type;
    IF v_c_schema IS NOT NULL THEN
      SELECT * INTO v_c_vis, v_c_owner, v_c_org, v_c_found
      FROM platform.entity_row_access_attrs(v_c_schema, v_c_table, rec.container_id);
      IF v_c_owner = v_uid THEN RETURN true; END IF;
      IF p_required = 'viewer' AND v_c_vis IS NOT NULL THEN
        IF v_c_vis = 'public' THEN RETURN true; END IF;
        IF v_c_vis >= 'internal'::platform.visibility
             AND v_c_org IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM iam.organization_member om
               WHERE om.organization_id = v_c_org AND om.user_id = v_uid
             ) THEN RETURN true; END IF;
      END IF;
    END IF;
  END LOOP;

  IF v_vis >= 'internal'::platform.visibility AND v_org IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM iam.organization_member om
         WHERE om.organization_id = v_org AND om.user_id = v_uid
       ) THEN RETURN true; END IF;

  IF v_vis >= 'internal'::platform.visibility THEN
    FOR rec IN SELECT parent_type, fk_column FROM platform.entity_relationships
               WHERE child_type = p_type AND kind='containment' LOOP
      EXECUTE format('SELECT %I FROM %I.%I WHERE id=$1', rec.fk_column, v_schema, v_table)
        INTO v_parent_id USING p_id;
      IF v_parent_id IS NOT NULL AND iam.has_access_as(v_uid, rec.parent_type, v_parent_id, p_required) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION public.has_access_as(
  p_user uuid,
  p_type text,
  p_id uuid,
  p_required permission_level DEFAULT 'viewer'::permission_level
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, iam
AS $$
  -- Service-role only in practice (EXECUTE revoked from authenticated/anon).
  -- If a JWT is present, never allow impersonating another user.
  SELECT iam.has_access_as(
    CASE WHEN auth.uid() IS NOT NULL THEN auth.uid() ELSE p_user END,
    p_type, p_id, p_required
  );
$$;

REVOKE ALL ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) FROM anon;
REVOKE ALL ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) TO service_role;
REVOKE ALL ON FUNCTION iam.has_access_as(uuid, text, uuid, permission_level) FROM PUBLIC;
REVOKE ALL ON FUNCTION iam.has_access_as(uuid, text, uuid, permission_level) FROM anon;
REVOKE ALL ON FUNCTION iam.has_access_as(uuid, text, uuid, permission_level) FROM authenticated;
GRANT EXECUTE ON FUNCTION iam.has_access_as(uuid, text, uuid, permission_level) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Fix member sync: drop OLD edge on identity UPDATE; safe uuid casts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.sync_data_store_member_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, rag, iam
AS $$
DECLARE
  v_org uuid;
  v_file uuid;
  v_store uuid;
  v_old_file uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_kind = 'cld_file' THEN
      BEGIN
        v_old_file := OLD.source_id::uuid;
        DELETE FROM platform.associations a
        WHERE a.source_type = 'file'
          AND a.source_id = v_old_file
          AND a.target_type = 'data_store'
          AND a.target_id = OLD.data_store_id
          AND a.role IS NOT DISTINCT FROM 'library_member';
      EXCEPTION WHEN others THEN
        RAISE WARNING '[rag.sync_data_store_member_association] DELETE skip non-uuid source_id=%', OLD.source_id;
      END;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: always drop the OLD edge first (prevents privilege retention)
  IF TG_OP = 'UPDATE' AND OLD.source_kind = 'cld_file' THEN
    BEGIN
      v_old_file := OLD.source_id::uuid;
      DELETE FROM platform.associations a
      WHERE a.source_type = 'file'
        AND a.source_id = v_old_file
        AND a.target_type = 'data_store'
        AND a.target_id = OLD.data_store_id
        AND a.role IS NOT DISTINCT FROM 'library_member';
    EXCEPTION WHEN others THEN
      NULL;
    END;
  END IF;

  v_store := NEW.data_store_id;
  IF NEW.source_kind <> 'cld_file' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    BEGIN
      v_file := NEW.source_id::uuid;
      DELETE FROM platform.associations a
      WHERE a.source_type = 'file'
        AND a.source_id = v_file
        AND a.target_type = 'data_store'
        AND a.target_id = v_store
        AND a.role IS NOT DISTINCT FROM 'library_member';
    EXCEPTION WHEN others THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  BEGIN
    v_file := NEW.source_id::uuid;
  EXCEPTION WHEN others THEN
    RAISE WARNING '[rag.sync_data_store_member_association] non-uuid source_id=% on store=%', NEW.source_id, v_store;
    RETURN NEW;
  END;

  SELECT COALESCE(ds.organization_id, (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1))
    INTO v_org
  FROM rag.data_stores ds
  WHERE ds.id = v_store;

  INSERT INTO platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata
  )
  VALUES (
    'file', v_file, 'data_store', v_store,
    v_org, 'library_member',
    jsonb_build_object(
      'legacy_table', 'rag.data_store_members',
      'source_kind', 'cld_file'
    )
  )
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_data_store_members_assoc ON rag.data_store_members;
CREATE TRIGGER trg_data_store_members_assoc
  AFTER INSERT OR UPDATE OF deleted_at, source_kind, source_id, data_store_id
  OR DELETE ON rag.data_store_members
  FOR EACH ROW EXECUTE FUNCTION rag.sync_data_store_member_association();

-- ---------------------------------------------------------------------------
-- 5. Fix processed_doc sync: drop OLD edge on source_id UPDATE
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION docproc.sync_processed_doc_file_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, docproc, files, iam
AS $$
DECLARE
  v_org uuid;
  v_file uuid;
  v_old_file uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_kind = 'cld_file' THEN
      BEGIN
        v_old_file := OLD.source_id::uuid;
        DELETE FROM platform.associations a
        WHERE a.source_type = 'processed_document'
          AND a.source_id = OLD.id
          AND a.target_type = 'file'
          AND a.target_id = v_old_file
          AND a.role IS NOT DISTINCT FROM 'source_file';
      EXCEPTION WHEN others THEN
        NULL;
      END;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: drop any prior source_file edge for this doc (identity may have changed)
  IF TG_OP = 'UPDATE' THEN
    DELETE FROM platform.associations a
    WHERE a.source_type = 'processed_document'
      AND a.source_id = NEW.id
      AND a.target_type = 'file'
      AND a.role IS NOT DISTINCT FROM 'source_file';
  END IF;

  IF NEW.source_kind IS DISTINCT FROM 'cld_file' OR NEW.source_id IS NULL THEN
    IF TG_OP = 'INSERT' THEN
      DELETE FROM platform.associations a
      WHERE a.source_type = 'processed_document'
        AND a.source_id = NEW.id
        AND a.target_type = 'file'
        AND a.role IS NOT DISTINCT FROM 'source_file';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM platform.associations a
    WHERE a.source_type = 'processed_document'
      AND a.source_id = NEW.id
      AND a.target_type = 'file'
      AND a.role IS NOT DISTINCT FROM 'source_file';
    RETURN NEW;
  END IF;

  BEGIN
    v_file := NEW.source_id::uuid;
  EXCEPTION WHEN others THEN
    RETURN NEW;
  END;

  v_org := COALESCE(
    NEW.organization_id,
    (SELECT organization_id FROM files.files WHERE id = v_file),
    (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
  );

  INSERT INTO platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata
  )
  VALUES (
    'processed_document', NEW.id, 'file', v_file,
    v_org, 'source_file',
    jsonb_build_object('legacy_table', 'docproc.processed_documents', 'source_kind', 'cld_file')
  )
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_processed_documents_file_assoc ON docproc.processed_documents;
CREATE TRIGGER trg_processed_documents_file_assoc
  AFTER INSERT OR UPDATE OF source_kind, source_id, organization_id, deleted_at
  OR DELETE ON docproc.processed_documents
  FOR EACH ROW EXECUTE FUNCTION docproc.sync_processed_doc_file_association();

-- ---------------------------------------------------------------------------
-- 6. Page-image files → processed_document (Conveys viewer)
-- SUPERSEDED 2026-07-11 by page_image_assoc_retarget_to_source_file.sql:
-- file→processed_document made a non-shareable container; canonical is now
-- page_image file → source PDF file (role=page_image). Left for history only.
-- ---------------------------------------------------------------------------
INSERT INTO platform.association_types (
  source_type, target_type, label, container_side, conveys_max, is_active, notes
)
VALUES (
  'file', 'processed_document', NULL, 'target', 'viewer', true,
  'Page render images belong to their processed document. Viewer on the doc (via store→file→doc) conveys viewer on page image files. 2026-07-10'
)
ON CONFLICT (source_type, target_type) DO UPDATE
SET container_side = EXCLUDED.container_side,
    conveys_max    = EXCLUDED.conveys_max,
    is_active      = EXCLUDED.is_active,
    notes          = EXCLUDED.notes,
    updated_at     = now();

CREATE OR REPLACE FUNCTION docproc.sync_page_image_file_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, docproc, files, iam
AS $$
DECLARE
  v_org uuid;
  v_file uuid;
  v_old_file uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.image_cld_file_id IS NOT NULL THEN
      DELETE FROM platform.associations a
      WHERE a.source_type = 'file'
        AND a.source_id = OLD.image_cld_file_id
        AND a.target_type = 'processed_document'
        AND a.target_id = OLD.processed_document_id
        AND a.role IS NOT DISTINCT FROM 'page_image';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.image_cld_file_id IS NOT NULL
       AND (
         OLD.image_cld_file_id IS DISTINCT FROM NEW.image_cld_file_id
         OR OLD.processed_document_id IS DISTINCT FROM NEW.processed_document_id
       ) THEN
    DELETE FROM platform.associations a
    WHERE a.source_type = 'file'
      AND a.source_id = OLD.image_cld_file_id
      AND a.target_type = 'processed_document'
      AND a.target_id = OLD.processed_document_id
      AND a.role IS NOT DISTINCT FROM 'page_image';
  END IF;

  IF NEW.image_cld_file_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_file := NEW.image_cld_file_id;

  SELECT COALESCE(
    pd.organization_id,
    (SELECT organization_id FROM files.files WHERE id = v_file),
    (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
  )
    INTO v_org
  FROM docproc.processed_documents pd
  WHERE pd.id = NEW.processed_document_id;

  INSERT INTO platform.associations (
    source_type, source_id, target_type, target_id,
    organization_id, role, metadata
  )
  VALUES (
    'file', v_file, 'processed_document', NEW.processed_document_id,
    v_org, 'page_image',
    jsonb_build_object(
      'legacy_table', 'docproc.processed_document_pages',
      'page_id', NEW.id
    )
  )
  ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_processed_document_pages_image_assoc ON docproc.processed_document_pages;
CREATE TRIGGER trg_processed_document_pages_image_assoc
  AFTER INSERT OR UPDATE OF image_cld_file_id, processed_document_id
  OR DELETE ON docproc.processed_document_pages
  FOR EACH ROW EXECUTE FUNCTION docproc.sync_page_image_file_association();

-- Backfill page-image associations (library docs + all docs with images)
INSERT INTO platform.associations (
  source_type, source_id, target_type, target_id,
  organization_id, role, metadata
)
SELECT
  'file',
  p.image_cld_file_id,
  'processed_document',
  p.processed_document_id,
  COALESCE(
    pd.organization_id,
    f.organization_id,
    (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
  ),
  'page_image',
  jsonb_build_object(
    'legacy_table', 'docproc.processed_document_pages',
    'page_id', p.id
  )
FROM docproc.processed_document_pages p
JOIN docproc.processed_documents pd ON pd.id = p.processed_document_id
LEFT JOIN files.files f ON f.id = p.image_cld_file_id
WHERE p.image_cld_file_id IS NOT NULL
  AND pd.deleted_at IS NULL
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Rebuild reachability
-- ---------------------------------------------------------------------------
SELECT platform.rebuild_reachability();

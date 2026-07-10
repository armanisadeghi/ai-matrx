-- library_store_file_reachability_cascade.sql
--
-- Make Shared Knowledge (data_store_grants) cascade through the platform
-- reachability / has_access judge — no per-feature open-path exceptions.
--
-- Model (little → big, Conveys):
--   file → data_store   (container = data_store, conveys_max = viewer)
-- Industry/global/org grants on the store then reach member files via
-- platform.reachability. Docproc babies get additive SELECT RLS via the
-- existing can_read_processed_document (already grant-aware).
--
-- Also: iam.has_access_as(user,…) so service-role file download can ask the
-- same judge (auth.uid() is NULL under the service key).
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. data_stores needs visibility for iam.has_access entity path
-- ---------------------------------------------------------------------------
ALTER TABLE rag.data_stores
  ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private'::platform.visibility;

COMMENT ON COLUMN rag.data_stores.visibility IS
  'Ambient visibility for iam.has_access. Library stores stay private; audience READ is via rag.data_store_grants, not public visibility.';

-- ---------------------------------------------------------------------------
-- 2. Entity types for the library tree (register before association edges)
-- ---------------------------------------------------------------------------
INSERT INTO platform.entity_types (
  token, schema_name, table_name, label,
  is_component, is_listed, is_versioned, has_soft_delete, is_active, default_visibility
)
SELECT 'processed_document', 'docproc', 'processed_documents', 'Processed document',
       false, false, false, true, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'processed_document');

INSERT INTO platform.entity_types (
  token, schema_name, table_name, label,
  is_component, is_listed, is_versioned, has_soft_delete, is_active, default_visibility
)
SELECT 'processed_document_page', 'docproc', 'processed_document_pages', 'Processed document page',
       true, false, false, false, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'processed_document_page');

-- data_store already registered; ensure active
UPDATE platform.entity_types
   SET is_active = true, schema_name = 'rag', table_name = 'data_stores'
 WHERE token = 'data_store';

-- Page access IS the parent document (composition)
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'processed_document_page', 'processed_document', 'processed_document_id', 'composition'
WHERE NOT EXISTS (
  SELECT 1 FROM platform.entity_relationships
  WHERE child_type = 'processed_document_page' AND kind = 'composition'
);

-- ---------------------------------------------------------------------------
-- 3. Relationship rule: file → data_store Conveys viewer
--    (register BEFORE writing edges — auto_orient reads the registry)
-- ---------------------------------------------------------------------------
INSERT INTO platform.association_types (
  source_type, target_type, label, container_side, conveys_max, is_active, notes
)
VALUES (
  'file', 'data_store', NULL, 'target', 'viewer', true,
  'Shared Knowledge Resources: a library data store contains its member files. Industry/global/org grants on the store convey viewer to member files via reachability. 2026-07-10'
)
ON CONFLICT (source_type, target_type) DO UPDATE
SET container_side = EXCLUDED.container_side,
    conveys_max    = EXCLUDED.conveys_max,
    is_active      = EXCLUDED.is_active,
    notes          = EXCLUDED.notes,
    updated_at     = now();

-- processed_document → file Conveys viewer (grandbaby path once docs use has_access)
INSERT INTO platform.association_types (
  source_type, target_type, label, container_side, conveys_max, is_active, notes
)
VALUES (
  'processed_document', 'file', NULL, 'target', 'viewer', true,
  'A processed document belongs to its source file. Viewer on the file conveys viewer on the processed doc. 2026-07-10'
)
ON CONFLICT (source_type, target_type) DO UPDATE
SET container_side = EXCLUDED.container_side,
    conveys_max    = EXCLUDED.conveys_max,
    is_active      = EXCLUDED.is_active,
    notes          = EXCLUDED.notes,
    updated_at     = now();

-- ---------------------------------------------------------------------------
-- 4. Grant helper — single predicate for library audience READ
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_can_read_data_store_via_grant(
  p_user uuid,
  p_store uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, rag, iam
AS $$
  SELECT p_user IS NOT NULL
     AND p_store IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM rag.data_store_grants g
       WHERE g.data_store_id = p_store
         AND (
           g.audience = 'global'
           OR (g.audience = 'organization'
               AND g.organization_id IN (
                 SELECT om.organization_id
                 FROM iam.organization_member om
                 WHERE om.user_id = p_user
               ))
           OR (g.audience = 'industry'
               AND EXISTS (
                 SELECT 1
                 FROM iam.org_industries oi
                 JOIN iam.organization_member om
                   ON om.organization_id = oi.organization_id
                 WHERE om.user_id = p_user
                   AND oi.industry_id = g.industry_id
               ))
         )
     );
$$;

COMMENT ON FUNCTION public.user_can_read_data_store_via_grant(uuid, uuid) IS
  'Shared Knowledge READ: true when p_user is reached by a rag.data_store_grants row (global|organization|industry). Viewer only — never write.';

REVOKE ALL ON FUNCTION public.user_can_read_data_store_via_grant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_read_data_store_via_grant(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. iam.has_access — add data_store_grants pass (self + reachability containers)
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
  v_vis platform.visibility; v_owner uuid; v_org uuid;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid;
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

  -- Shared Knowledge: direct grant on a data_store (viewer only)
  IF p_type = 'data_store' AND p_required = 'viewer'
       AND public.user_can_read_data_store_via_grant(v_uid, p_id) THEN
    RETURN true;
  END IF;

  BEGIN
    EXECUTE format('SELECT visibility, created_by, organization_id FROM %I.%I WHERE id=$1', v_schema, v_table)
      INTO v_vis, v_owner, v_org USING p_id;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF NOT FOUND THEN RETURN false; END IF;

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
    -- Shared Knowledge: holding a data_store via industry/global/org grant
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
      BEGIN
        EXECUTE format('SELECT created_by, visibility, organization_id FROM %I.%I WHERE id=$1', v_c_schema, v_c_table)
          INTO v_c_owner, v_c_vis, v_c_org USING rec.container_id;
      EXCEPTION WHEN others THEN v_c_owner := NULL; v_c_vis := NULL; v_c_org := NULL; END;
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

-- Explicit-user twin for service-role callers (file download, etc.)
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
  v_vis platform.visibility; v_owner uuid; v_org uuid;
  v_parent_type text; v_parent_col text; v_parent_id uuid;
  v_c_schema text; v_c_table text; v_c_owner uuid;
  v_c_vis platform.visibility; v_c_org uuid;
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

  BEGIN
    EXECUTE format('SELECT visibility, created_by, organization_id FROM %I.%I WHERE id=$1', v_schema, v_table)
      INTO v_vis, v_owner, v_org USING p_id;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF NOT FOUND THEN RETURN false; END IF;

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

  -- Explicit grants for p_user (public.has_permission is auth.uid()-bound)
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
      BEGIN
        EXECUTE format('SELECT created_by, visibility, organization_id FROM %I.%I WHERE id=$1', v_c_schema, v_c_table)
          INTO v_c_owner, v_c_vis, v_c_org USING rec.container_id;
      EXCEPTION WHEN others THEN v_c_owner := NULL; v_c_vis := NULL; v_c_org := NULL; END;
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

-- PostgREST-exposed wrapper (platform schema is not FE-callable)
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
  SELECT iam.has_access_as(p_user, p_type, p_id, p_required);
$$;

REVOKE ALL ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_access_as(uuid, text, uuid, permission_level) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION iam.has_access_as(uuid, text, uuid, permission_level) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Mirror data_store_members (cld_file) → platform.associations (file→data_store)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rag.sync_data_store_member_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, rag
AS $$
DECLARE
  v_org uuid;
  v_file uuid;
  v_store uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_kind = 'cld_file' THEN
      DELETE FROM platform.associations a
      WHERE a.source_type = 'file'
        AND a.source_id = OLD.source_id::uuid
        AND a.target_type = 'data_store'
        AND a.target_id = OLD.data_store_id
        AND a.role IS NOT DISTINCT FROM 'library_member';
    END IF;
    RETURN OLD;
  END IF;

  v_store := NEW.data_store_id;
  IF NEW.source_kind <> 'cld_file' THEN
    RETURN NEW;
  END IF;

  -- Soft-deleted member → remove edge
  IF NEW.deleted_at IS NOT NULL THEN
    DELETE FROM platform.associations a
    WHERE a.source_type = 'file'
      AND a.source_id = NEW.source_id::uuid
      AND a.target_type = 'data_store'
      AND a.target_id = v_store
      AND a.role IS NOT DISTINCT FROM 'library_member';
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

-- Backfill live cld_file members
INSERT INTO platform.associations (
  source_type, source_id, target_type, target_id,
  organization_id, role, metadata
)
SELECT
  'file',
  dm.source_id::uuid,
  'data_store',
  dm.data_store_id,
  COALESCE(ds.organization_id, (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)),
  'library_member',
  jsonb_build_object('legacy_table', 'rag.data_store_members', 'source_kind', 'cld_file')
FROM rag.data_store_members dm
JOIN rag.data_stores ds ON ds.id = dm.data_store_id
WHERE dm.deleted_at IS NULL
  AND dm.source_kind = 'cld_file'
  AND dm.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Mirror processed_documents (cld_file) → associations (processed_document→file)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION docproc.sync_processed_doc_file_association()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, platform, docproc, files
AS $$
DECLARE
  v_org uuid;
  v_file uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.source_kind = 'cld_file' THEN
      DELETE FROM platform.associations a
      WHERE a.source_type = 'processed_document'
        AND a.source_id = OLD.id
        AND a.target_type = 'file'
        AND a.target_id = OLD.source_id::uuid
        AND a.role IS NOT DISTINCT FROM 'source_file';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.source_kind IS DISTINCT FROM 'cld_file' OR NEW.source_id IS NULL THEN
    -- If kind changed away from cld_file, drop any prior edge
    DELETE FROM platform.associations a
    WHERE a.source_type = 'processed_document'
      AND a.source_id = NEW.id
      AND a.target_type = 'file'
      AND a.role IS NOT DISTINCT FROM 'source_file';
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

INSERT INTO platform.associations (
  source_type, source_id, target_type, target_id,
  organization_id, role, metadata
)
SELECT
  'processed_document',
  pd.id,
  'file',
  pd.source_id::uuid,
  COALESCE(
    pd.organization_id,
    f.organization_id,
    (SELECT organization_id FROM iam.system_orgs WHERE key = 'library' LIMIT 1)
  ),
  'source_file',
  jsonb_build_object('legacy_table', 'docproc.processed_documents', 'source_kind', 'cld_file')
FROM docproc.processed_documents pd
LEFT JOIN files.files f ON f.id = pd.source_id::uuid
WHERE pd.deleted_at IS NULL
  AND pd.source_kind = 'cld_file'
  AND pd.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT ON CONSTRAINT associations_unique DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. Additive SELECT RLS on docproc babies (grant-aware; keep existing policies)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS processed_documents_library_grant_select ON docproc.processed_documents;
CREATE POLICY processed_documents_library_grant_select
  ON docproc.processed_documents
  FOR SELECT
  TO authenticated
  USING (public.can_read_processed_document(id, auth.uid()));

DROP POLICY IF EXISTS processed_document_pages_library_grant_select ON docproc.processed_document_pages;
CREATE POLICY processed_document_pages_library_grant_select
  ON docproc.processed_document_pages
  FOR SELECT
  TO authenticated
  USING (public.can_read_processed_document(processed_document_id, auth.uid()));

-- ---------------------------------------------------------------------------
-- 9. Rebuild reachability closure
-- ---------------------------------------------------------------------------
SELECT platform.rebuild_reachability();

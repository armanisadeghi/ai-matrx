-- ============================================================
-- Shareable Resource Registry admin RPCs, surfaced on the Relationship
-- Manager (/administration/relationships). Makes this page the full home for
-- platform.shareable_resource_registry — not just link-policy toggles
-- (/administration/sharing keeps those levers too, unchanged).
--
-- Companion to relationship_manager_admin_rpcs.sql /
-- relationship_manager_crud_and_problems.sql. Same rules: platform is not
-- PostgREST-exposed, so these live in PUBLIC; every function re-checks
-- public.is_super_admin() in the body; SECURITY DEFINER, search_path = ''.
-- Idempotent (CREATE OR REPLACE / DROP FUNCTION IF EXISTS first for changed
-- signatures).
-- ============================================================

-- 1. Full registry rows for the admin table (superset of admin_list_share_policies
--    — that RPC stays for the /administration/sharing link-policy specialty view).
CREATE OR REPLACE FUNCTION public.admin_shareable_registry_list()
RETURNS TABLE (
  resource_type text, schema_name text, table_name text,
  id_column text, owner_column text, is_public_column text,
  display_label text, url_path_template text,
  rls_uses_has_permission boolean, is_active boolean, notes text,
  content_role text, is_scopeable boolean,
  is_link_shareable boolean, public_columns text[],
  created_at timestamptz, updated_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.resource_type, r.schema_name, r.table_name,
         r.id_column, r.owner_column, r.is_public_column,
         r.display_label, r.url_path_template,
         r.rls_uses_has_permission, r.is_active, r.notes,
         r.content_role, r.is_scopeable,
         r.is_link_shareable, r.public_columns,
         r.created_at, r.updated_at
  FROM platform.shareable_resource_registry r
  WHERE public.is_super_admin()
  ORDER BY r.is_active DESC, r.resource_type;
$$;

-- 2. Prefill defaults for registering a token that isn't shareable yet —
--    reads platform.entity_types for schema/table/label so the create form
--    doesn't ask the admin to retype what the entity registry already knows.
CREATE OR REPLACE FUNCTION public.admin_shareable_registry_defaults(p_token text)
RETURNS TABLE (
  resource_type text, schema_name text, table_name text, display_label text,
  already_registered boolean
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.token, e.schema_name, e.table_name, e.label,
         EXISTS(SELECT 1 FROM platform.shareable_resource_registry s WHERE s.resource_type = e.token)
  FROM platform.entity_types e
  WHERE public.is_super_admin() AND e.token = p_token;
$$;

-- 3. Create or update a shareable-registry row (upsert). This is the fix for
--    the Relationship Manager drift "conveying_container_not_shareable" —
--    registering the row here makes the reachability cascade live the moment
--    it commits. Absorbs the same fields admin_set_share_policy touches
--    (is_link_shareable / public_columns) so this is the ONE place to manage
--    a resource end-to-end; /administration/sharing keeps working unchanged.
DROP FUNCTION IF EXISTS public.admin_upsert_shareable_resource(text, text, text, text, text, text, text, text, boolean, boolean, text, text, boolean, boolean, text[]);
CREATE OR REPLACE FUNCTION public.admin_upsert_shareable_resource(
  p_resource_type text,
  p_schema_name text,
  p_table_name text,
  p_display_label text,
  p_url_path_template text,
  p_id_column text DEFAULT 'id',
  p_owner_column text DEFAULT 'created_by',
  p_is_public_column text DEFAULT NULL,
  p_rls_uses_has_permission boolean DEFAULT false,
  p_is_active boolean DEFAULT true,
  p_content_role text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_scopeable boolean DEFAULT false,
  p_is_link_shareable boolean DEFAULT false,
  p_public_columns text[] DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_safe text[];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Same "never let a typo become a phantom allowlist entry" guard as
  -- admin_set_share_policy.
  SELECT array_agg(col ORDER BY ord) INTO v_safe
    FROM unnest(COALESCE(p_public_columns, '{}')) WITH ORDINALITY AS u(col, ord)
   WHERE EXISTS (SELECT 1 FROM information_schema.columns c
     WHERE c.table_schema = p_schema_name AND c.table_name = p_table_name AND c.column_name = u.col);

  INSERT INTO platform.shareable_resource_registry (
    resource_type, schema_name, table_name, id_column, owner_column, is_public_column,
    display_label, url_path_template, rls_uses_has_permission, is_active, notes,
    content_role, is_scopeable, is_link_shareable, public_columns
  ) VALUES (
    p_resource_type, p_schema_name, p_table_name, p_id_column, p_owner_column, NULLIF(p_is_public_column, ''),
    p_display_label, p_url_path_template, p_rls_uses_has_permission, p_is_active, NULLIF(p_notes, ''),
    NULLIF(p_content_role, ''), p_is_scopeable, p_is_link_shareable, v_safe
  )
  ON CONFLICT (resource_type) DO UPDATE SET
    schema_name = EXCLUDED.schema_name,
    table_name = EXCLUDED.table_name,
    id_column = EXCLUDED.id_column,
    owner_column = EXCLUDED.owner_column,
    is_public_column = EXCLUDED.is_public_column,
    display_label = EXCLUDED.display_label,
    url_path_template = EXCLUDED.url_path_template,
    rls_uses_has_permission = EXCLUDED.rls_uses_has_permission,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes,
    content_role = EXCLUDED.content_role,
    is_scopeable = EXCLUDED.is_scopeable,
    is_link_shareable = EXCLUDED.is_link_shareable,
    public_columns = EXCLUDED.public_columns,
    updated_at = now();
END $$;

-- 4. Soft on/off — keeps the row (and its history) instead of deleting it.
--    admin_relationship_problems() already requires is_active, so flipping
--    this off re-creates the conveying_container_not_shareable drift on
--    purpose (e.g. a container that should no longer be shareable).
CREATE OR REPLACE FUNCTION public.admin_set_shareable_active(p_resource_type text, p_is_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE platform.shareable_resource_registry
     SET is_active = p_is_active, updated_at = now()
   WHERE resource_type = p_resource_type;
END $$;

-- Lock down: strip PUBLIC/anon, grant to authenticated (guard does the gating).
REVOKE ALL ON FUNCTION
  public.admin_shareable_registry_list(),
  public.admin_shareable_registry_defaults(text),
  public.admin_upsert_shareable_resource(text, text, text, text, text, text, text, text, boolean, boolean, text, text, boolean, boolean, text[]),
  public.admin_set_shareable_active(text, boolean)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_shareable_registry_list(),
  public.admin_shareable_registry_defaults(text),
  public.admin_upsert_shareable_resource(text, text, text, text, text, text, text, text, boolean, boolean, text, text, boolean, boolean, text[]),
  public.admin_set_shareable_active(text, boolean)
TO authenticated, service_role;

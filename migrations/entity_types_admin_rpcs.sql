-- ============================================================
-- Entity Types registry admin RPCs, surfaced on the Relationship Manager hub
-- (/administration/relationships/entity-types). First-ever write path for
-- platform.entity_types outside SQL migrations — the admin UI can now
-- register, edit, and deactivate entity tokens directly.
--
-- Companion to relationship_manager_admin_rpcs.sql /
-- relationship_manager_shareable_admin_rpcs.sql. Same rules: platform is not
-- PostgREST-exposed, so these live in PUBLIC; every function re-checks
-- public.is_super_admin() in the body; SECURITY DEFINER, search_path = ''.
-- Idempotent (CREATE OR REPLACE).
--
-- public.entity_types_list() (anon-granted, active-only, feeds
-- pnpm gen:entity-types) is deliberately untouched.
--
-- Deletion is deactivate-only: tokens are FK targets of
-- platform.associations.source_type/target_type — a hard delete would orphan
-- edges. Deactivating removes the token from entity_types_list() and the
-- generated TS vocabulary on the next gen:entity-types run.
--
-- table_ref (regclass) is derived, never user-supplied: the upsert recomputes
-- it from schema_name + table_name after validating the table exists.
-- ============================================================

-- 1. Full registry rows for the admin table — ALL rows incl. inactive
--    (entity_types_list() stays the active-only public projection).
--    default_visibility is projected as text (enum platform.visibility:
--    private | internal | link | public).
CREATE OR REPLACE FUNCTION public.admin_entity_types_list()
RETURNS TABLE (
  token text, schema_name text, table_name text, label text,
  base_tier smallint, is_versioned boolean, has_soft_delete boolean,
  is_listed boolean, is_component boolean, is_module boolean,
  category text, default_scopeable boolean,
  default_visibility text, default_members_can_add boolean,
  default_needs_approval boolean, default_auto_ingest boolean,
  rls_variant text, table_ref text,
  is_active boolean, notes text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.token, e.schema_name, e.table_name, e.label,
         e.base_tier, e.is_versioned, e.has_soft_delete,
         e.is_listed, e.is_component, e.is_module,
         e.category, e.default_scopeable,
         e.default_visibility::text, e.default_members_can_add,
         e.default_needs_approval, e.default_auto_ingest,
         e.rls_variant, e.table_ref::text,
         e.is_active, e.notes
  FROM platform.entity_types e
  WHERE public.is_super_admin()
  ORDER BY e.is_active DESC, e.token;
$$;

-- 2. Create or update an entity type (upsert keyed on token — the PK is
--    immutable; edits ride ON CONFLICT). Validates the token shape and that
--    the physical table actually exists, so a typo can't register a phantom
--    entity that breaks the generated vocabulary and every registry consumer.
--    Defaults mirror the live column defaults.
CREATE OR REPLACE FUNCTION public.admin_upsert_entity_type(
  p_token text,
  p_schema_name text,
  p_table_name text,
  p_label text,
  p_base_tier smallint DEFAULT 1,
  p_is_versioned boolean DEFAULT true,
  p_has_soft_delete boolean DEFAULT true,
  p_is_listed boolean DEFAULT false,
  p_is_component boolean DEFAULT false,
  p_is_module boolean DEFAULT false,
  p_category text DEFAULT NULL,
  p_default_scopeable boolean DEFAULT true,
  p_default_visibility text DEFAULT NULL,
  p_default_members_can_add boolean DEFAULT true,
  p_default_needs_approval boolean DEFAULT false,
  p_default_auto_ingest boolean DEFAULT false,
  p_rls_variant text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_ref regclass;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_token !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'invalid token "%": must be snake_case starting with a letter (^[a-z][a-z0-9_]*$)', p_token;
  END IF;

  v_ref := pg_catalog.to_regclass(pg_catalog.quote_ident(p_schema_name) || '.' || pg_catalog.quote_ident(p_table_name));
  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'table %.% does not exist — register the token only after the physical table is live', p_schema_name, p_table_name;
  END IF;

  INSERT INTO platform.entity_types (
    token, schema_name, table_name, label, base_tier,
    is_versioned, has_soft_delete, is_listed, is_component, is_module,
    category, default_scopeable,
    default_visibility, default_members_can_add, default_needs_approval,
    default_auto_ingest, rls_variant, table_ref,
    is_active, notes
  ) VALUES (
    p_token, p_schema_name, p_table_name, p_label, p_base_tier,
    p_is_versioned, p_has_soft_delete, p_is_listed, p_is_component, p_is_module,
    NULLIF(p_category, ''), p_default_scopeable,
    NULLIF(p_default_visibility, '')::platform.visibility, p_default_members_can_add,
    p_default_needs_approval, p_default_auto_ingest,
    NULLIF(p_rls_variant, ''), v_ref,
    p_is_active, NULLIF(p_notes, '')
  )
  ON CONFLICT (token) DO UPDATE SET
    schema_name = EXCLUDED.schema_name,
    table_name = EXCLUDED.table_name,
    label = EXCLUDED.label,
    base_tier = EXCLUDED.base_tier,
    is_versioned = EXCLUDED.is_versioned,
    has_soft_delete = EXCLUDED.has_soft_delete,
    is_listed = EXCLUDED.is_listed,
    is_component = EXCLUDED.is_component,
    is_module = EXCLUDED.is_module,
    category = EXCLUDED.category,
    default_scopeable = EXCLUDED.default_scopeable,
    default_visibility = EXCLUDED.default_visibility,
    default_members_can_add = EXCLUDED.default_members_can_add,
    default_needs_approval = EXCLUDED.default_needs_approval,
    default_auto_ingest = EXCLUDED.default_auto_ingest,
    rls_variant = EXCLUDED.rls_variant,
    table_ref = EXCLUDED.table_ref,
    is_active = EXCLUDED.is_active,
    notes = EXCLUDED.notes;
END $$;

-- 3. Deactivate / reactivate — the only "delete". Loud on a missing token.
CREATE OR REPLACE FUNCTION public.admin_set_entity_type_active(
  p_token text,
  p_is_active boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  UPDATE platform.entity_types
     SET is_active = p_is_active
   WHERE token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entity type "%" not found', p_token;
  END IF;
END $$;

-- Lock down: strip PUBLIC/anon, grant to authenticated (guard does the gating).
REVOKE ALL ON FUNCTION
  public.admin_entity_types_list(),
  public.admin_upsert_entity_type(text, text, text, text, smallint, boolean, boolean, boolean, boolean, boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text),
  public.admin_set_entity_type_active(text, boolean)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_entity_types_list(),
  public.admin_upsert_entity_type(text, text, text, text, smallint, boolean, boolean, boolean, boolean, boolean, text, boolean, text, boolean, boolean, boolean, text, boolean, text),
  public.admin_set_entity_type_active(text, boolean)
TO authenticated, service_role;

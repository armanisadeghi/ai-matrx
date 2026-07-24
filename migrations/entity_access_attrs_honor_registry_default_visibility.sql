-- Ownership-column-less entity tables must honor the registry's declared
-- default_visibility instead of being hard-coded to 'personal'.
--
-- REGRESSION FIXED
-- aidream 0227_enforce_entity_acl_on_all_association_writes.sql (applied
-- 2026-07-23 19:57 UTC) made assoc_add require `iam.has_access(target,
-- 'viewer')` for every non-conveying edge. That check resolves the row's
-- access attributes through platform.entity_row_access_attrs(), whose final
-- fallback branch — "row exists but the table has NO visibility / created_by /
-- owner_id / organization_id columns" — returned visibility 'personal' with a
-- NULL owner and NULL org. A row with no owner and no org can never satisfy
-- 'personal': iam.has_access_for_base() then denies EVERY user, so every
-- association edge targeting such a table became impossible to write.
--
-- Concretely: binding an agent to a UI surface (agent -> surface, container_side
-- 'none') failed for every user with
--     42501  assoc_add: viewer access to target required
-- even though platform.entity_types declares surface.default_visibility =
-- 'public'. ui.ui_surface is a platform catalog table — no owner, no org, by
-- design — and the registry already stated its intent; the access resolver was
-- simply ignoring that declaration.
--
-- THE FIX (no new mechanism, no new column, no new security layer)
-- The fallback branch now reads platform.entity_types.default_visibility for
-- (schema, table) and falls back to 'personal' when the registry does not
-- declare one. Intent stays declared in exactly one place — the entity registry
-- — and the access resolver honors it.
--
-- Blast radius: only registered entity tables with NO ownership columns at all
-- (today: ui.ui_surface [public], public.analysis_recipes, runtime.global_origin,
-- scraper.sites — the latter three declare no default_visibility and therefore
-- keep today's deny-everyone behavior). Every branch that finds a real
-- visibility / owner / org column is untouched, and this only ever relaxes a
-- *viewer* read check; editor/owner authorization is unchanged.

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
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform'
AS $function$
DECLARE
  v_registry_vis platform.visibility;
BEGIN
  o_found := false;
  o_vis := 'personal'::platform.visibility;
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
      'SELECT ''personal''::platform.visibility, owner_id, organization_id, true FROM %I.%I WHERE id = $1',
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
      'SELECT ''personal''::platform.visibility, created_by, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found USING p_id;
    IF o_found IS TRUE THEN RETURN; END IF;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  WHEN others THEN
    NULL;
  END;

  -- Row exists but the table carries NO ownership columns at all — a platform
  -- catalog (ui.ui_surface, ...). There is no owner and no org to key access
  -- on, so 'personal' is meaningless here and denies everyone. Honor the
  -- registry's declared intent; 'personal' remains the default when the
  -- registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, NULL::uuid, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
  EXCEPTION WHEN others THEN
    o_found := false;
  END;
END;
$function$;

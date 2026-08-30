-- Org-scoped ownership-column-less entity tables must expose their
-- organization_id to the access resolver.
--
-- REGRESSION FIXED (QA F1 · feedback 35d311a9, 2026-08-30)
-- /scopes (scope-type page) — attaching ANY resource to a scope type failed for
-- every user with
--     42501  assoc_add: non-conveying edges require editor access to one
--            endpoint and viewer access to the other
-- The Files picker made it visible (its selection looked simply inert), but the
-- generic candidate list failed identically: the container endpoint
-- (`scope_type` → context.scope_types) always resolved to "no access".
--
-- WHY
-- context.scope_types carries organization_id but has NO visibility /
-- created_by / owner_id columns. platform.entity_row_access_attrs() only reads
-- organization_id alongside an ownership column, so all four ownership-shaped
-- probes hit undefined_column and control fell to the catalog fallback added by
-- entity_access_attrs_honor_registry_default_visibility.sql — which honors the
-- registry's default_visibility ('internal' for scope_type) but returns
-- o_org NULL. With no owner and no org, iam.has_access_for_base() has nothing
-- to key membership on and denies every user, so assoc_add refuses the edge.
--
-- THE FIX (same doctrine as the previous migration: no new mechanism, no new
-- column, no new security layer)
-- One more probe between the ownership probes and the no-columns fallback:
-- "no ownership columns, but the table HAS organization_id" — return that org
-- with the registry-declared default visibility (personal when undeclared) and
-- a NULL owner. iam.has_access_for_base() then applies its normal org rules:
-- org admins get viewer, and internal-visibility rows grant org members editor.
--
-- Blast radius: only registered entity tables with organization_id and no
-- ownership columns (today: context.scope_types [internal] — the broken case —
-- plus rag.kg_sweep_state [personal] and a set of runtime/seo/pdf/platform
-- plumbing tables with no declared default_visibility, which stay 'personal'
-- and gain only the org-admin viewer path). Tables with any real ownership
-- column are untouched.

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

  -- Registry-declared intent for tables with no ownership columns; 'personal'
  -- remains the default when the registry declares nothing.
  SELECT et.default_visibility
    INTO v_registry_vis
  FROM platform.entity_types et
  WHERE et.schema_name = p_schema
    AND et.table_name = p_table
  LIMIT 1;

  -- No ownership columns, but the table IS org-scoped (context.scope_types,
  -- runtime plumbing, ...): surface organization_id so membership-based access
  -- can apply, with the registry's declared visibility.
  BEGIN
    EXECUTE format(
      'SELECT $2::platform.visibility, NULL::uuid, organization_id, true FROM %I.%I WHERE id = $1',
      p_schema, p_table
    ) INTO o_vis, o_owner, o_org, o_found
    USING p_id, coalesce(v_registry_vis, 'personal'::platform.visibility);
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

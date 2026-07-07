-- get_resource_access — the DB side of the P7 useAccess/requireAccess primitive.
--
-- Given a shareable resource (token + id), resolve the CURRENT caller's effective
-- access as one value: {level: none|view|edit|admin, is_owner, exists}. This is a
-- UX-layer resolver — RLS remains the security boundary — but it is the single
-- source of truth the view/edit gate + duplicate-to-edit read, so the answer must
-- match what RLS would actually allow.
--
-- Resolution:
--   • Registry-driven (resolve_shareable_resource) so it works for EVERY shareable
--     type — canonical entity_types tokens AND legacy tables — with no per-type code.
--   • Owner  → admin (+ is_owner). Owner is the registry owner_column = auth.uid().
--   • Anon (no session) → view iff the row is public, else none. (Anon never sees a
--     grant; the public /p/e lane relies on this.)
--   • Authenticated non-owner: canonical tokens use iam.has_access (full model:
--     grants, org, membership, reachability, containment); legacy tables use the
--     token-agnostic public.has_permission. Highest satisfied level wins; a public
--     row floors everyone at view.
--
-- SECURITY DEFINER + dynamic read mirrors iam.has_access exactly (same pattern,
-- same guardrails). Granted to anon + authenticated; the function reveals only the
-- caller's own access level, never resource content.

CREATE OR REPLACE FUNCTION public.get_resource_access(
  p_resource_type text,
  p_resource_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'platform', 'iam'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_reg record;
  v_token text;
  v_is_entity boolean := false;
  v_owner uuid;
  v_public boolean := false;
  v_vis platform.visibility;
  v_level text := 'none';
BEGIN
  -- Resolve the registry row (alias- and token-tolerant). resolve_shareable_resource
  -- RAISES on an unregistered type — degrade to no-access rather than throwing.
  BEGIN
    SELECT * INTO v_reg FROM public.resolve_shareable_resource(p_resource_type);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END;
  IF v_reg IS NULL OR v_reg.table_name IS NULL THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END IF;
  v_token := v_reg.resource_type;

  -- Is this a canonical entity_types token (full iam.has_access model applies)?
  SELECT true INTO v_is_entity
  FROM platform.entity_types
  WHERE token = v_token AND COALESCE(is_component, false) = false
  LIMIT 1;
  v_is_entity := COALESCE(v_is_entity, false);

  -- Read owner + public flag from the resource row via the registry columns.
  BEGIN
    IF v_reg.is_public_column IS NOT NULL THEN
      EXECUTE format(
        'SELECT %I, COALESCE(%I, false) FROM %I.%I WHERE %I = $1',
        v_reg.owner_column, v_reg.is_public_column,
        COALESCE(v_reg.schema_name, 'public'), v_reg.table_name, v_reg.id_column
      ) INTO v_owner, v_public USING p_resource_id;
    ELSE
      -- Canonical: public lives on the platform.visibility enum.
      EXECUTE format(
        'SELECT %I, visibility FROM %I.%I WHERE %I = $1',
        v_reg.owner_column,
        COALESCE(v_reg.schema_name, 'public'), v_reg.table_name, v_reg.id_column
      ) INTO v_owner, v_vis USING p_resource_id;
      v_public := (v_vis = 'public');
    END IF;
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END IF;

  -- Owner → full control.
  IF v_uid IS NOT NULL AND v_owner IS NOT NULL AND v_owner = v_uid THEN
    RETURN jsonb_build_object('level', 'admin', 'is_owner', true, 'exists', true);
  END IF;

  -- Anon: only a public row is viewable (the indexable /p/e lane).
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'level', CASE WHEN v_public THEN 'view' ELSE 'none' END,
      'is_owner', false, 'exists', true
    );
  END IF;

  -- Authenticated non-owner: probe highest→lowest so the max level wins.
  IF v_is_entity THEN
    IF iam.has_access(v_token, p_resource_id, 'admin'::permission_level) THEN
      v_level := 'admin';
    ELSIF iam.has_access(v_token, p_resource_id, 'editor'::permission_level) THEN
      v_level := 'edit';
    ELSIF iam.has_access(v_token, p_resource_id, 'viewer'::permission_level) THEN
      v_level := 'view';
    END IF;
  ELSE
    IF public.has_permission(v_token, p_resource_id, 'admin'::permission_level) THEN
      v_level := 'admin';
    ELSIF public.has_permission(v_token, p_resource_id, 'editor'::permission_level) THEN
      v_level := 'edit';
    ELSIF public.has_permission(v_token, p_resource_id, 'viewer'::permission_level) THEN
      v_level := 'view';
    END IF;
  END IF;

  -- A public row floors everyone at view.
  IF v_level = 'none' AND v_public THEN
    v_level := 'view';
  END IF;

  RETURN jsonb_build_object('level', v_level, 'is_owner', false, 'exists', true);
END
$function$;

REVOKE ALL ON FUNCTION public.get_resource_access(text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_resource_access(text, uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.get_resource_access(text, uuid) IS
  'P7 useAccess/requireAccess resolver. Returns {level:none|view|edit|admin,is_owner,exists} for the current caller. Registry-driven; canonical tokens use iam.has_access, legacy tables use has_permission; anon sees public rows as view. UX layer — RLS is still the boundary.';

-- get_resource_access — the DB side of the P7 useAccess/requireAccess primitive.
--
-- Given a resource (token + id), resolve the CURRENT caller's effective access as
-- one value: {level: none|view|edit|admin, is_owner, exists}. This is a UX-layer
-- resolver — RLS remains the security boundary — but it is the single source of
-- truth the view/edit gate + duplicate-to-edit read, so the answer must match what
-- RLS would actually allow.
--
-- THE TYPE AUTHORITY IS platform.entity_types (G16b, fixed 2026-08-15).
--   Until this fix the function resolved its type through resolve_shareable_resource
--   (platform.shareable_resource_registry) and swallowed that function's RAISE on an
--   unregistered token into {level:none, exists:false}. 129 active, non-component
--   entity tokens — ai_model among them — are absent from that registry, so every
--   perfectly readable row of those types was reported NONEXISTENT to useAccess and
--   requireAccess. "Your type isn't in a legacy registry" is not "there is no such
--   row"; conflating the two is the exact class of lie features/access-gate/ exists
--   to kill. entity_types is what iam.has_access itself keys on, so it is what this
--   function keys on too — and its answer now agrees with access_denied_context.
--
-- Resolution:
--   • Type resolves through platform.entity_types FIRST. The shareable registry is
--     consulted only as a legacy per-type COLUMN HINT (id/owner/is_public column
--     names, which entity_types does not carry) and as the fallback type authority
--     for any token that should ever exist solely there.
--   • NO READ MAY DEPEND ON A COLUMN THAT MIGHT NOT EXIST. Existence + owner come
--     from registry-declared columns only; the public flag is read in its own
--     tolerant block. The pre-fix code paired the owner column WITH `visibility` in
--     one statement, so seven canonical tokens whose live tables carry no
--     `visibility` (batch_provider_batch, context_item, pdf_redaction_audit,
--     sandbox_instance, seo_collection_run, seo_rank_target,
--     user_analysis_preference) threw and told the row's OWNER it did not exist.
--   • Whenever the registry hint cannot read the row, resolution FALLS THROUGH to
--     platform.entity_row_access_attrs — the same primitive access_denied_context
--     uses — rather than reporting the row missing. That shared reader is what makes
--     the two resolvers agree by construction rather than by coincidence.
--   • Owner  → admin (+ is_owner).
--   • Anon (no session) → view iff the row is public, else none AND exists:false.
--     (Anon never sees a grant; the public /p/e lane relies on this, and a private
--     row's existence is never leaked to anon.)
--   • Authenticated non-owner: canonical non-component tokens use iam.has_access
--     (full model: grants, org, membership, reachability, containment); everything
--     else uses the token-agnostic public.has_permission. Highest satisfied level
--     wins; a public row floors everyone at view.
--
-- iam.has_access remains the sole access authority and is untouched here — this
-- change moves only which rows we admit EXIST, never who may reach them.
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
  v_ent record;
  v_reg record;
  v_attrs record;
  v_uid uuid := (SELECT auth.uid());
  v_token text;
  v_is_entity boolean := false;
  v_owner uuid;
  v_found boolean;
  v_public boolean := false;
  v_vis platform.visibility;
  v_level text := 'none';
BEGIN
  IF p_resource_type IS NULL OR p_resource_id IS NULL THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END IF;

  -- (1) THE TYPE AUTHORITY: platform.entity_types, exactly what iam.has_access keys on.
  SELECT et.token, et.schema_name, et.table_name,
         COALESCE(et.is_component, false) AS is_component
    INTO v_ent
  FROM platform.entity_types et
  WHERE et.token = p_resource_type
    AND COALESCE(et.is_active, true)
  LIMIT 1;

  -- (2) The legacy registry — a COLUMN HINT, and the type fallback for any token
  -- that lives only there. Read directly (never resolve_shareable_resource, whose
  -- RAISE on an unregistered token is what produced the exists:false lie).
  SELECT r.resource_type, r.schema_name, r.table_name,
         r.id_column, r.owner_column, r.is_public_column
    INTO v_reg
  FROM platform.shareable_resource_registry r
  WHERE r.resource_type = p_resource_type
    AND r.is_active = true
  LIMIT 1;

  -- Unresolvable in BOTH authorities: there is genuinely no such type.
  IF v_ent.token IS NULL AND v_reg.resource_type IS NULL THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END IF;

  v_token := COALESCE(v_ent.token, v_reg.resource_type);
  -- Canonical NON-COMPONENT tokens get the full iam.has_access model; components and
  -- registry-only tokens keep public.has_permission, exactly as before.
  v_is_entity := (v_ent.token IS NOT NULL AND v_ent.is_component = false);

  IF v_reg.resource_type IS NOT NULL THEN
    -- Registry hint present: it declares the id/owner columns that entity_row_access_attrs
    -- cannot discover (file_analysis → file_id, six tables owned by user_id, …).
    --
    -- NOTHING here may depend on a column that might not exist. The owner+existence read
    -- uses ONLY registry-declared columns; the public flag is read separately and
    -- tolerantly. The old single read paired the owner column WITH `visibility`, so for a
    -- canonical token whose table has no `visibility` (batch_provider_batch, context_item,
    -- pdf_redaction_audit, sandbox_instance, seo_collection_run, seo_rank_target,
    -- user_analysis_preference — all live, all with their owner column present) the whole
    -- statement threw and the OWNER was told their own row does not exist.
    BEGIN
      EXECUTE format(
        'SELECT %I, true FROM %I.%I WHERE %I = $1',
        v_reg.owner_column,
        COALESCE(v_reg.schema_name, 'public'), v_reg.table_name, v_reg.id_column
      ) INTO v_owner, v_found USING p_resource_id;
    EXCEPTION WHEN others THEN
      -- The hint itself is unusable (dead table, renamed column). Do NOT report the row
      -- missing — fall through to the entity reader below and let it answer.
      v_owner := NULL;
      v_found := NULL;
    END;

    IF v_found IS TRUE THEN
      -- Public flag, in its own tolerant block: a missing column means "no public
      -- concept", never a failed resolution.
      IF v_reg.is_public_column IS NOT NULL THEN
        BEGIN
          EXECUTE format(
            'SELECT COALESCE(%I, false) FROM %I.%I WHERE %I = $1',
            v_reg.is_public_column,
            COALESCE(v_reg.schema_name, 'public'), v_reg.table_name, v_reg.id_column
          ) INTO v_public USING p_resource_id;
        EXCEPTION WHEN others THEN
          v_public := false;
        END;
      ELSIF v_is_entity THEN
        -- Canonical entity: public lives on the platform.visibility enum — when the
        -- table actually carries one.
        BEGIN
          EXECUTE format(
            'SELECT visibility FROM %I.%I WHERE %I = $1',
            COALESCE(v_reg.schema_name, 'public'), v_reg.table_name, v_reg.id_column
          ) INTO v_vis USING p_resource_id;
          v_public := (v_vis = 'public');
        EXCEPTION WHEN others THEN
          v_public := false;
        END;
      ELSE
        v_public := false;
      END IF;
    END IF;
  END IF;

  -- Entity reader: the authority for every token with no usable registry hint — the
  -- 129-token case this function used to call nonexistent, plus any token whose hint
  -- could not read the row. platform.entity_row_access_attrs is the shared owner/org/
  -- visibility reader (created_by → owner_id ladder, then the registry's declared
  -- default_visibility for ownerless platform catalogs). access_denied_context reads
  -- the row the same way, which is precisely why the two resolvers agree on `exists`.
  IF v_found IS NOT TRUE AND v_ent.token IS NOT NULL THEN
    SELECT * INTO v_attrs
    FROM platform.entity_row_access_attrs(v_ent.schema_name, v_ent.table_name, p_resource_id);

    IF COALESCE(v_attrs.o_found, false) THEN
      v_owner  := v_attrs.o_owner;
      v_public := (v_attrs.o_vis = 'public'::platform.visibility);
      v_found  := true;
    END IF;
  END IF;

  IF v_found IS NOT TRUE THEN
    RETURN jsonb_build_object('level', 'none', 'is_owner', false, 'exists', false);
  END IF;

  -- Owner → full control.
  IF v_uid IS NOT NULL AND v_owner IS NOT NULL AND v_owner = v_uid THEN
    RETURN jsonb_build_object('level', 'admin', 'is_owner', true, 'exists', true);
  END IF;

  -- Anon: only a public row is viewable (the indexable /p/e lane). A private row
  -- reports exists:false too — never leak a private resource's existence to anon.
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'level', CASE WHEN v_public THEN 'view' ELSE 'none' END,
      'is_owner', false, 'exists', v_public
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
  'P7 useAccess/requireAccess resolver. Returns {level:none|view|edit|admin,is_owner,exists} for the current caller. Type resolves through platform.entity_types (the authority iam.has_access keys on); the shareable registry is a legacy column hint only. Canonical non-component tokens use iam.has_access, the rest use has_permission; anon sees public rows as view. UX layer — RLS is still the boundary.';

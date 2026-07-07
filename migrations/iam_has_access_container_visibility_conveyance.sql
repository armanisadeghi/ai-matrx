-- iam.has_access — convey a CONTAINER's own visibility (public / internal) to its
-- reachable contents, completing the platform conveyance model.
--
-- Before: the reachability loop propagated a container's explicit GRANTS,
-- MEMBERSHIP, and OWNERSHIP to its contents (capped by conveys_max) — so
-- *sharing* a container (e.g. granting a flashcard set to a user) already exposed
-- its cards. But the container's own VISIBILITY did not convey: making a set
-- `public` left its private cards invisible to a non-owner in-app (the read went
-- through fc_card RLS → has_access → no path). That's the missing half of
-- "publishing a container publishes its contents".
--
-- After: inside the reachability loop, the container row read (already done for
-- the ownership check) also fetches visibility + organization_id, and conveys
-- READ (viewer) when the container is `public` (anyone) or `internal`+ in an org
-- the caller can access — the SAME shortcuts an item gets on its OWN visibility,
-- applied to a container that reaches it. Which pairs convey, and up to what
-- level, stays governed by platform.association_types (container_side +
-- conveys_max) via platform.reachability — this is not flashcard-specific.
--
-- Read-only by construction: visibility never confers write, so the new branch
-- gates on p_required='viewer'. Everything else is byte-for-byte the prior body.
-- Anon (auth.uid() IS NULL) still short-circuits false at the top; anonymous
-- public reads go through the per-feature SECURITY DEFINER read RPCs.

CREATE OR REPLACE FUNCTION iam.has_access(p_type text, p_id uuid, p_required permission_level DEFAULT 'viewer'::permission_level)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'platform', 'iam'
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

  BEGIN
    EXECUTE format('SELECT visibility, created_by, organization_id FROM %I.%I WHERE id=$1', v_schema, v_table)
      INTO v_vis, v_owner, v_org USING p_id;
  EXCEPTION WHEN others THEN RETURN false; END;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_owner = v_uid THEN RETURN true; END IF;                                   -- owner
  IF p_required = 'viewer' AND v_org IS NOT NULL AND public.is_org_admin(v_org) THEN RETURN true; END IF; -- org-admin oversight (read)
  IF v_vis = 'public' AND p_required = 'viewer' THEN RETURN true; END IF;        -- public read

  IF p_required = 'viewer'
       AND v_vis >= 'internal'::platform.visibility
       AND v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
  THEN RETURN true; END IF;

  IF v_org IS NOT NULL
       AND v_org IN (SELECT organization_id FROM iam.system_orgs WHERE global_readable)
       AND public.is_super_admin()
  THEN RETURN true; END IF;

  IF public.has_permission(p_type, p_id, p_required) THEN RETURN true; END IF;   -- explicit grant (iam.permissions)

  -- Direct membership on THIS object. iam.memberships is the canonical
  -- membership store; role→level via iam.membership_grant. Non-recursive; a no-op
  -- for entities that have no membership rows. Grants regardless of visibility
  -- (a member sees a private project), exactly like the owner short-circuit.
  IF EXISTS (
    SELECT 1 FROM iam.memberships m
    JOIN iam.membership_grant g ON g.member_role = m.role AND g.container_type IN (p_type, '*')
    WHERE m.container_type = p_type AND m.container_id = p_id AND m.user_id = v_uid
      AND m.deleted_at IS NULL AND g.confers >= p_required
  ) THEN RETURN true; END IF;

  -- Inherited access via association containment (platform.reachability).
  -- The reachability cache is the flattened container→contents closure over
  -- platform.associations, filtered by platform.association_types rules
  -- (container_side <> 'none'). Holding the container — by explicit grant,
  -- membership, ownership, OR the container's own visibility (public / internal)
  -- — extends to reachable items, capped per path by conveys_max (r.max_level).
  -- Tuples are truth: revoking the container grant/membership or flipping it
  -- private cuts access on the next query with zero recompute. Flat and
  -- non-recursive; a no-op when reachability has no rows for the item.
  FOR rec IN
    SELECT r.container_type, r.container_id
    FROM platform.reachability r
    WHERE r.item_type = p_type AND r.item_id = p_id
      AND r.max_level >= p_required
  LOOP
    -- explicit grant on the container (user or org grant; status/expiry-aware)
    IF public.has_permission(rec.container_type, rec.container_id, p_required) THEN
      RETURN true;
    END IF;
    -- membership in the container
    IF EXISTS (
      SELECT 1 FROM iam.memberships m
      JOIN iam.membership_grant g ON g.member_role = m.role
        AND g.container_type IN (rec.container_type, '*')
      WHERE m.container_type = rec.container_type AND m.container_id = rec.container_id
        AND m.user_id = v_uid AND m.deleted_at IS NULL AND g.confers >= p_required
    ) THEN
      RETURN true;
    END IF;
    -- ownership OR own-visibility of the container. One row read serves both:
    -- ownership (a collaborator added an item to my thread) and visibility
    -- conveyance (a public/internal container publishes read on its contents —
    -- the same shortcut the item gets on its own visibility). Visibility conveys
    -- READ only, so it is gated on p_required='viewer'.
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
       AND iam.has_org_access(v_org) THEN RETURN true; END IF;                   -- org context (internal+)
  IF v_vis >= 'internal'::platform.visibility THEN                              -- containment cascade
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
END $function$;

-- ============================================================
-- Admin RPCs for the Relationship Manager UI (/administration/relationships)
-- In PUBLIC (not platform): platform is not PostgREST-exposed, so supabase-js
-- can only reach these in an exposed schema. Guarded by public.is_super_admin().
-- ============================================================

-- 1. List all rules with live edge counts and closure impact
CREATE OR REPLACE FUNCTION public.admin_relationship_rules()
RETURNS TABLE (
  source_type text, target_type text, label text,
  container_side text, conveys_max public.permission_level,
  is_active boolean, notes text,
  created_at timestamptz, updated_at timestamptz,
  edge_count bigint, closure_rows bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.source_type, r.target_type, r.label,
         r.container_side, r.conveys_max, r.is_active, r.notes,
         r.created_at, r.updated_at,
         (SELECT count(*) FROM platform.associations a
           WHERE a.source_type = r.source_type AND a.target_type = r.target_type
             AND (r.label IS NULL OR a.label = r.label)) AS edge_count,
         (SELECT count(*) FROM platform.reachability x
           WHERE r.container_side = 'target' AND x.container_type = r.target_type AND x.item_type = r.source_type
              OR r.container_side = 'source' AND x.container_type = r.source_type AND x.item_type = r.target_type) AS closure_rows
  FROM platform.association_types r
  WHERE public.is_super_admin()
  ORDER BY (r.container_side <> 'none') DESC, edge_count DESC;
$$;

-- 2. Association pairs present in data but missing from the registry
CREATE OR REPLACE FUNCTION public.admin_unregistered_pairs()
RETURNS TABLE (source_type text, target_type text, label text, edge_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT a.source_type, a.target_type, a.label, count(*)
  FROM platform.associations a
  WHERE public.is_super_admin()
    AND NOT EXISTS (
      SELECT 1 FROM platform.association_types r
      WHERE r.source_type = a.source_type AND r.target_type = a.target_type
        AND (r.label IS NULL OR r.label = a.label) AND r.is_active)
  GROUP BY 1, 2, 3 ORDER BY count(*) DESC;
$$;

-- 3. Create or update a rule (upsert). Closure rebuilds automatically via trigger.
-- p_label / p_notes are optional (label NULL = generic rule); '' normalizes to NULL
-- so it can't half-collide with the COALESCE(label,'') unique index.
DROP FUNCTION IF EXISTS public.admin_upsert_relationship_rule(text, text, text, text, public.permission_level, boolean, text);
CREATE OR REPLACE FUNCTION public.admin_upsert_relationship_rule(
  p_source_type text, p_target_type text,
  p_container_side text, p_conveys_max public.permission_level,
  p_is_active boolean,
  p_label text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  INSERT INTO platform.association_types
    (source_type, target_type, label, container_side, conveys_max, is_active, notes)
  VALUES (p_source_type, p_target_type, NULLIF(p_label, ''), p_container_side, p_conveys_max, p_is_active, NULLIF(p_notes, ''))
  ON CONFLICT (source_type, target_type, COALESCE(label, ''))
  DO UPDATE SET container_side = EXCLUDED.container_side,
                conveys_max    = EXCLUDED.conveys_max,
                is_active      = EXCLUDED.is_active,
                notes          = EXCLUDED.notes;
END $$;

-- 4. Rebuild the cache; returns row count
CREATE OR REPLACE FUNCTION public.admin_rebuild_reachability()
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN platform.rebuild_reachability();
END $$;

-- 5. Inspect: what does this container reach?
CREATE OR REPLACE FUNCTION public.admin_reachability_contents(p_type text, p_id uuid)
RETURNS TABLE (item_type text, item_id uuid, depth int, max_level public.permission_level)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.item_type, r.item_id, r.depth, r.max_level
  FROM platform.reachability r
  WHERE public.is_super_admin()
    AND r.container_type = p_type AND r.container_id = p_id
  ORDER BY r.depth, r.item_type;
$$;

-- 6. Inspect: which containers convey access to this item?
CREATE OR REPLACE FUNCTION public.admin_reachability_containers(p_type text, p_id uuid)
RETURNS TABLE (container_type text, container_id uuid, depth int, max_level public.permission_level)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.container_type, r.container_id, r.depth, r.max_level
  FROM platform.reachability r
  WHERE public.is_super_admin()
    AND r.item_type = p_type AND r.item_id = p_id
  ORDER BY r.depth;
$$;

-- 7. Toggle enforcement; returns the new state
CREATE OR REPLACE FUNCTION public.admin_set_association_enforcement(p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_enabled THEN
    ALTER TABLE platform.associations ENABLE TRIGGER trg_associations_enforce_known;
  ELSE
    ALTER TABLE platform.associations DISABLE TRIGGER trg_associations_enforce_known;
  END IF;
  RETURN p_enabled;
END $$;

-- 8. System status card
CREATE OR REPLACE FUNCTION public.admin_relationship_system_status()
RETURNS TABLE (
  total_rules bigint, rules_conveying bigint, closure_rows bigint,
  max_depth int, enforcement_enabled boolean, unregistered_pairs bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT
    (SELECT count(*) FROM platform.association_types),
    (SELECT count(*) FROM platform.association_types WHERE container_side <> 'none' AND is_active),
    (SELECT count(*) FROM platform.reachability),
    (SELECT COALESCE(max(depth), 0) FROM platform.reachability),
    (SELECT tgenabled <> 'D' FROM pg_trigger WHERE tgname = 'trg_associations_enforce_known'),
    (SELECT count(*) FROM public.admin_unregistered_pairs())
  WHERE public.is_super_admin();
$$;

-- Lock down: strip PUBLIC, grant to authenticated (guard does the gating)
REVOKE ALL ON FUNCTION
  public.admin_relationship_rules(),
  public.admin_unregistered_pairs(),
  public.admin_upsert_relationship_rule(text, text, text, public.permission_level, boolean, text, text),
  public.admin_rebuild_reachability(),
  public.admin_reachability_contents(text, uuid),
  public.admin_reachability_containers(text, uuid),
  public.admin_set_association_enforcement(boolean),
  public.admin_relationship_system_status()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_relationship_rules(),
  public.admin_unregistered_pairs(),
  public.admin_upsert_relationship_rule(text, text, text, public.permission_level, boolean, text, text),
  public.admin_rebuild_reachability(),
  public.admin_reachability_contents(text, uuid),
  public.admin_reachability_containers(text, uuid),
  public.admin_set_association_enforcement(boolean),
  public.admin_relationship_system_status()
TO authenticated, service_role;

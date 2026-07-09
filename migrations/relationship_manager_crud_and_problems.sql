-- ============================================================
-- Relationship Manager — full CRUD (delete) + unified drift report.
-- Companion to relationship_manager_admin_rpcs.sql. Same rules:
-- lives in PUBLIC (platform is not PostgREST-exposed), every function
-- re-checks public.is_super_admin() in the body.
-- ============================================================

-- 9. Delete a rule entirely (not just deactivate). Safe + reversible:
--    the statement-level trg_association_types_reachability rebuilds the
--    closure on DELETE, and the rule can always be recreated. Deleting a
--    rule that still has edges simply returns those edges to "unregistered".
--    Label matching mirrors the COALESCE(label,'') unique index.
CREATE OR REPLACE FUNCTION public.admin_delete_relationship_rule(
  p_source_type text, p_target_type text, p_label text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'admin only' USING ERRCODE = 'insufficient_privilege';
  END IF;
  DELETE FROM platform.association_types
   WHERE source_type = p_source_type
     AND target_type = p_target_type
     AND COALESCE(label, '') = COALESCE(NULLIF(p_label, ''), '');
END $$;

-- 10. Unified drift/problems report. ONE canonical source for everything the
--     admin must fix, including DB-only drift the client can't compute
--     (shareable-registry gaps). Ordered error-first, then by blast radius.
CREATE OR REPLACE FUNCTION public.admin_relationship_problems()
RETURNS TABLE (
  kind text, severity text,
  source_type text, target_type text, label text,
  container_side text, edge_count bigint, detail text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  -- 1. Unregistered pairs — edges in data with no active rule covering them.
  SELECT 'unregistered_pair'::text, 'error'::text,
         a.source_type, a.target_type, a.label, NULL::text, count(*),
         'Association shape exists in the data but no active rule registers it. Register it as known, or enforcement will reject future writes of this shape.'::text
  FROM platform.associations a
  WHERE public.is_super_admin()
    AND NOT EXISTS (
      SELECT 1 FROM platform.association_types r
      WHERE r.source_type = a.source_type AND r.target_type = a.target_type
        AND (r.label IS NULL OR r.label = a.label) AND r.is_active)
  GROUP BY a.source_type, a.target_type, a.label

  UNION ALL
  -- 2. Wrong-way edges — the reverse shape has edges, no active reverse rule
  --    owns them, and it is not a self-pair. The writer stored the edge against
  --    the canonical direction.
  SELECT 'wrong_way_edges'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (SELECT count(*) FROM platform.associations a
            WHERE a.source_type = r.target_type AND a.target_type = r.source_type
              AND (r.label IS NULL OR a.label = r.label)),
         'Edges exist stored in the reverse direction of this registered pair. Find the writer and fix it — the direction guard only rejects writes made after the guard was installed.'::text
  FROM platform.association_types r
  WHERE public.is_super_admin() AND r.is_active AND r.source_type <> r.target_type
    AND NOT EXISTS (
      SELECT 1 FROM platform.association_types rr
      WHERE rr.source_type = r.target_type AND rr.target_type = r.source_type
        AND rr.label IS NOT DISTINCT FROM r.label AND rr.is_active)
    AND EXISTS (
      SELECT 1 FROM platform.associations a
      WHERE a.source_type = r.target_type AND a.target_type = r.source_type
        AND (r.label IS NULL OR a.label = r.label))

  UNION ALL
  -- 3. Conveying rule whose container type is NOT a shareable resource.
  --    The cascade is structurally dead: the container can never be shared,
  --    so no access will ever flow through this rule.
  SELECT 'conveying_container_not_shareable'::text, 'error'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (SELECT count(*) FROM platform.associations a
            WHERE a.source_type = r.source_type AND a.target_type = r.target_type
              AND (r.label IS NULL OR a.label = r.label)),
         'This rule conveys access, but its container type ('
           || (CASE WHEN r.container_side = 'target' THEN r.target_type ELSE r.source_type END)
           || ') is not in shareable_resource_registry, so the container can never be shared and the cascade is dead.'::text
  FROM platform.association_types r
  WHERE public.is_super_admin() AND r.is_active AND r.container_side <> 'none'
    AND NOT EXISTS (
      SELECT 1 FROM platform.shareable_resource_registry s
      WHERE s.resource_type =
        CASE WHEN r.container_side = 'target' THEN r.target_type ELSE r.source_type END)

  UNION ALL
  -- 4. Active conveying rule with zero edges — speculative or drifted; harmless
  --    but worth surfacing so the registry reflects reality.
  SELECT 'conveying_rule_no_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side, 0::bigint,
         'Rule conveys access but no associations of this shape exist yet. Fine if pre-registered ahead of a feature; otherwise it may be a leftover.'::text
  FROM platform.association_types r
  WHERE public.is_super_admin() AND r.is_active AND r.container_side <> 'none'
    AND NOT EXISTS (
      SELECT 1 FROM platform.associations a
      WHERE a.source_type = r.source_type AND a.target_type = r.target_type
        AND (r.label IS NULL OR a.label = r.label))

  UNION ALL
  -- 5. Inactive rule that still has edges — those edges are treated as
  --    unregistered and would be rejected once enforcement is on.
  SELECT 'inactive_rule_with_edges'::text, 'warning'::text,
         r.source_type, r.target_type, r.label, r.container_side,
         (SELECT count(*) FROM platform.associations a
            WHERE a.source_type = r.source_type AND a.target_type = r.target_type
              AND (r.label IS NULL OR a.label = r.label)),
         'Rule is inactive but associations of this shape still exist. They convey nothing and count as unregistered — reactivate the rule or clean up the edges.'::text
  FROM platform.association_types r
  WHERE public.is_super_admin() AND NOT r.is_active
    AND EXISTS (
      SELECT 1 FROM platform.associations a
      WHERE a.source_type = r.source_type AND a.target_type = r.target_type
        AND (r.label IS NULL OR a.label = r.label))

  ORDER BY 2, 7 DESC;
$$;

-- Lock down: strip PUBLIC/anon, grant to authenticated (guard does the gating).
REVOKE ALL ON FUNCTION
  public.admin_delete_relationship_rule(text, text, text),
  public.admin_relationship_problems()
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION
  public.admin_delete_relationship_rule(text, text, text),
  public.admin_relationship_problems()
TO authenticated, service_role;

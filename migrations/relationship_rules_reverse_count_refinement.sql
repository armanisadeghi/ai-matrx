-- reverse_edge_count refinement: self-pairs (agent->agent) would count their own
-- edges, and a retired-direction row would flag the CANONICAL rule's edges.
-- Wrong-way = edges in the reverse shape only when no active rule owns that shape.
CREATE OR REPLACE FUNCTION public.admin_relationship_rules()
RETURNS TABLE (
  source_type text, target_type text, label text,
  container_side text, conveys_max public.permission_level,
  is_active boolean, notes text,
  created_at timestamptz, updated_at timestamptz,
  edge_count bigint, closure_rows bigint, reverse_edge_count bigint
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT r.source_type, r.target_type, r.label,
         r.container_side, r.conveys_max, r.is_active, r.notes,
         r.created_at, r.updated_at,
         (SELECT count(*) FROM platform.associations a
           WHERE a.source_type = r.source_type AND a.target_type = r.target_type
             AND (r.label IS NULL OR a.label = r.label)) AS edge_count,
         (SELECT count(*) FROM platform.reachability x
           WHERE r.container_side = 'target' AND x.container_type = r.target_type AND x.item_type = r.source_type
              OR r.container_side = 'source' AND x.container_type = r.source_type AND x.item_type = r.target_type) AS closure_rows,
         CASE
           WHEN r.source_type = r.target_type THEN 0
           WHEN EXISTS (SELECT 1 FROM platform.association_types rr
                         WHERE rr.source_type = r.target_type AND rr.target_type = r.source_type
                           AND rr.label IS NOT DISTINCT FROM r.label AND rr.is_active) THEN 0
           ELSE (SELECT count(*) FROM platform.associations a
                  WHERE a.source_type = r.target_type AND a.target_type = r.source_type
                    AND (r.label IS NULL OR a.label = r.label))
         END AS reverse_edge_count
  FROM platform.association_types r
  WHERE public.is_super_admin()
  ORDER BY (r.container_side <> 'none') DESC, edge_count DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_relationship_rules() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_relationship_rules() TO authenticated, service_role;

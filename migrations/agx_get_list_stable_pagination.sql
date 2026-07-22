-- agx_get_list: stable, total-order pagination.
--
-- DEFECT (found 2026-07-22): the ORDER BY was `is_favorite DESC, updated_at DESC`
-- — not a TOTAL order. Each LIMIT/OFFSET page is a separate query execution, and
-- Postgres uses a bounded top-N sort over the UNION ALL, so row order was not
-- stable between executions. Paging a 365-row result 100 at a time returned 365
-- rows but only 306 DISTINCT ids: ~59 rows duplicated across pages and ~59
-- different rows never returned at all.
--
-- Those dropped agents never reached Redux, so the client-side agent search
-- could never find them — while the direct /agents/[id]/build route (which reads
-- agent.definition directly) worked fine. That asymmetry is the whole bug.
--
-- FIX: append `id` as a final tiebreaker so the sort key is unique per row,
-- making the ordering a total order and offset pagination deterministic.
--
-- Verified after this change: 365 rows / 365 distinct ids across pages 0..400.

CREATE OR REPLACE FUNCTION public.agx_get_list(p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH all_agents AS (
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email
    FROM agent.definition a WHERE a.user_id = v_uid AND a.agent_type = 'user'
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  )
  SELECT * FROM all_agents
  -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY all_agents.is_favorite DESC, all_agents.updated_at DESC, all_agents.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- D101 (partial) — `public.agx_get_list` returns SOFT-DELETED agents.
--
-- The function has no `deleted_at IS NULL` predicate on ANY of its three arms
-- (owned / user-granted / org-granted), so a deleted agent keeps appearing in
-- the `/agents/all` gallery. One such row is live today. A user who deletes an
-- agent and still sees it has been told a lie by the product.
--
-- This is the backport the defect names as the interim fix. `agx_get_list` and
-- `/agents/all` were being left untouched until `/agents/browse` (which uses the
-- replacement reader `public.agx_list_scoped`) is ratified — but "wait for the
-- rewrite" is not a reason to keep serving deleted rows, and the predicate is
-- three words per arm.
--
-- STILL OPEN in D101, deliberately NOT fixed here:
--   * no org scope — every user agent is `visibility='internal'` with an
--     `organization_id`, yet this reader returns only rows you own or were
--     explicitly granted, so a teammate's agent in your own org is invisible.
--     That is a behaviour CHANGE (it widens what the gallery shows) and belongs
--     with the `/agents/browse` ratification, not in a leak fix.
--   * `features/agents/redux/agent-definition/thunks.ts:805` still HARD-deletes,
--     so this path has no soft-delete/undo at all.
--
-- Idempotent: CREATE OR REPLACE. Signature is unchanged.

CREATE OR REPLACE FUNCTION public.agx_get_list(
    p_limit  integer DEFAULT NULL::integer,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    id uuid, agent_type text, name text, description text, model_id uuid,
    category text, tags text[], is_active boolean, is_archived boolean,
    is_favorite boolean, user_id uuid, organization_id uuid, project_id uuid,
    task_id uuid, source_agent_id uuid, created_at timestamp with time zone,
    updated_at timestamp with time zone, is_owner boolean, access_level text,
    shared_by_email text
)
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
    FROM agent.definition a
    WHERE a.user_id = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: a deleted agent is not in anyone's list
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
      AND a.deleted_at IS NULL   -- D101
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
      AND a.deleted_at IS NULL   -- D101
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  )
  SELECT * FROM all_agents
  ORDER BY all_agents.is_favorite DESC, all_agents.updated_at DESC, all_agents.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- D101 (companion to `agx_get_list_excludes_soft_deleted.sql`) — `agx_search`
-- has the SAME missing `deleted_at IS NULL` predicate, and it writes into the
-- SAME surface.
--
-- `migrations/agx_search_two_tier.sql:59` says the access model was "copied
-- verbatim from agx_get_list" — it copied the missing predicate too. Fixing only
-- the list reader closed the front door of `/agents/all` and left the search door
-- into the same grid wide open:
--
--   user soft-deletes an agent → it correctly disappears from the list →
--   user types its name into the gallery search → `agx_search` returns it →
--   `mergeAgentListRows` (`features/agents/redux/agent-definition/thunks.ts:155`,
--   "ADDITIVE BY CONTRACT … never replaced or evicted") merges it back into the
--   store → it is on screen again, and now it will not leave.
--
-- Found by adversarial review of the list-only fix.
--
-- STILL OPEN (D101): ~6 more SECURITY DEFINER readers of `agent.definition`
-- carry the same gap — `agx_get_shared_with_me`, `agx_get_shared_for_chat`,
-- `get_agents_for_chat`, `agx_get_access_level`, `agx_duplicate_agent`,
-- `agx_get_shortcuts_for_context` / `_initial`, and `agx_get_list_full`'s builtin
-- arm. They are not on this gallery path; sweeping them is its own change.
--
-- Idempotent: CREATE OR REPLACE. Signature and scoring are unchanged — the ONLY
-- edits are three `AND a.deleted_at IS NULL` predicates.

CREATE OR REPLACE FUNCTION public.agx_search(
    p_query  text,
    p_deep   boolean DEFAULT false,
    p_limit  integer DEFAULT 50,
    p_offset integer DEFAULT 0
)
RETURNS TABLE(
    id uuid, agent_type text, name text, description text, model_id uuid,
    category text, tags text[], is_active boolean, is_archived boolean,
    is_favorite boolean, user_id uuid, organization_id uuid, project_id uuid,
    task_id uuid, source_agent_id uuid, created_at timestamp with time zone,
    updated_at timestamp with time zone, is_owner boolean, access_level text,
    shared_by_email text, match_score integer, match_field text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_q    text := lower(btrim(coalesce(p_query, '')));
  v_like text;
BEGIN
  IF v_uid IS NULL OR v_q = '' THEN RETURN; END IF;

  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH accessible AS (
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email,
           a.messages
    FROM agent.definition a
    WHERE a.user_id = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: search must not resurrect a deleted agent
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
      AND a.deleted_at IS NULL   -- D101
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
      AND a.deleted_at IS NULL   -- D101
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  ),
  scored AS (
    SELECT c.*,
      ( CASE WHEN lower(c.id::text) = v_q THEN 100000
             WHEN lower(c.id::text) LIKE v_like THEN 5000 ELSE 0 END
      + CASE WHEN lower(coalesce(c.name,'')) = v_q THEN 10000
             WHEN lower(coalesce(c.name,'')) LIKE v_q || '%' THEN 5000
             WHEN lower(coalesce(c.name,'')) LIKE v_like THEN 2000 ELSE 0 END
      + CASE WHEN lower(coalesce(c.description,'')) = v_q THEN 1000
             WHEN lower(coalesce(c.description,'')) LIKE v_like THEN 500 ELSE 0 END
      + CASE WHEN lower(coalesce(c.category,'')) LIKE v_like THEN 300 ELSE 0 END
      + CASE WHEN EXISTS (SELECT 1 FROM unnest(coalesce(c.tags, '{}'::text[])) t WHERE lower(t) LIKE v_like) THEN 300 ELSE 0 END
      + CASE WHEN lower(coalesce(c.model_id::text,'')) LIKE v_like THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(c.agent_type,'')) LIKE v_like THEN 100 ELSE 0 END
      + CASE WHEN lower(coalesce(c.shared_by_email,'')) LIKE v_like THEN 200 ELSE 0 END
      + CASE WHEN p_deep AND lower(coalesce(c.messages::text,'')) LIKE v_like THEN 50 ELSE 0 END
      )::integer AS match_score,
      CASE
        WHEN lower(c.id::text) = v_q OR lower(c.id::text) LIKE v_like THEN 'id'
        WHEN lower(coalesce(c.name,'')) LIKE v_like THEN 'name'
        WHEN lower(coalesce(c.description,'')) LIKE v_like THEN 'description'
        WHEN lower(coalesce(c.category,'')) LIKE v_like THEN 'category'
        WHEN EXISTS (SELECT 1 FROM unnest(coalesce(c.tags, '{}'::text[])) t WHERE lower(t) LIKE v_like) THEN 'tags'
        WHEN lower(coalesce(c.shared_by_email,'')) LIKE v_like THEN 'shared_by_email'
        WHEN lower(coalesce(c.model_id::text,'')) LIKE v_like THEN 'model'
        WHEN lower(coalesce(c.agent_type,'')) LIKE v_like THEN 'agent_type'
        WHEN p_deep AND lower(coalesce(c.messages::text,'')) LIKE v_like THEN 'prompt'
        ELSE NULL
      END AS match_field
    FROM accessible c
  )
  SELECT s.id, s.agent_type, s.name, s.description, s.model_id, s.category, s.tags,
         s.is_active, s.is_archived, s.is_favorite, s.user_id, s.organization_id,
         s.project_id, s.task_id, s.source_agent_id, s.created_at, s.updated_at,
         s.is_owner, s.access_level, s.shared_by_email, s.match_score, s.match_field
  FROM scored s
  WHERE s.match_score > 0
  -- `s.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY s.match_score DESC, s.is_favorite DESC, s.updated_at DESC, s.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

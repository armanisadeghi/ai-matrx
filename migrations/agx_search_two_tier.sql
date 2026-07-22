-- agx_search: canonical server-side agent search. Two tiers, one RPC.
--
-- WHY THIS EXISTS
-- The agent list is paginated. Any search that only filters what the client
-- happens to have loaded is a lie — it silently reports "no results" for
-- agents that simply were not fetched yet. (That is exactly how a missing
-- agent went unnoticed: see agx_get_list_stable_pagination.sql.) Paginated
-- data therefore REQUIRES a server-side search. The client may show local
-- matches instantly, but it must also hit this RPC and MERGE the results into
-- the store additively — never replace the store with the search result.
--
-- THE TWO TIERS
--   Tier 1 (p_deep = false, the default): the obvious fields — name,
--     description, category, tags, model, type, id, shared-by email. Fast,
--     always on, and what nearly every search should need.
--   Tier 2 (p_deep = true): everything in tier 1 PLUS the agent's own prompt
--     content (`messages` jsonb). Opt-in, because it is a fundamentally
--     different question ("which agent talks about X inside its prompt")
--     and it must never crowd out the obvious answers.
--
-- Tier 2 is a strict SUPERSET of tier 1, and a prompt-body hit scores 50 —
-- below every field score in tier 1. So turning deep search on can only ever
-- ADD results BELOW the obvious ones; it can never reorder or bury a name
-- match. That ordering guarantee is the whole point of the tier split.
--
-- SCORING PARITY — LOAD-BEARING
-- The weights below MIRROR features/agents/search/score.ts exactly. Local
-- results (scored in TS) and server results (scored here) are merged into one
-- list, so if the two scorers disagree the list visibly reshuffles the moment
-- the server responds. Change one, change BOTH in the same commit.
--
-- ORDER BY ends in `id` — a unique tiebreaker making the sort a TOTAL order,
-- so LIMIT/OFFSET paging over search results cannot drop or duplicate rows.
-- This is the same defect that motivated the fix above. Do not remove it.

CREATE OR REPLACE FUNCTION public.agx_search(
  p_query text,
  p_deep boolean DEFAULT false,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, user_id uuid, organization_id uuid, project_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, match_score integer, match_field text)
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

  -- Escape LIKE metacharacters so a query containing % or _ matches literally.
  v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';

  RETURN QUERY
  WITH accessible AS (
    -- Access model copied verbatim from agx_get_list: owned, then directly
    -- shared, then org-shared (excluding anything already directly shared).
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email,
           a.messages
    FROM agent.definition a WHERE a.user_id = v_uid AND a.agent_type = 'user'
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.user_id, a.organization_id,
           a.project_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.user_id
    WHERE a.user_id != v_uid
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
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  ),
  scored AS (
    SELECT c.*,
      -- Mirrors features/agents/search/score.ts. Keep in sync.
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
      -- Tier 2 only. 50 sits below every tier-1 score by design.
      + CASE WHEN p_deep AND lower(coalesce(c.messages::text,'')) LIKE v_like THEN 50 ELSE 0 END
      )::integer AS match_score,
      -- Highest-priority field that matched, so the UI can say WHY a row is here.
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
  -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  ORDER BY s.match_score DESC, s.is_favorite DESC, s.updated_at DESC, s.id
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO authenticated;

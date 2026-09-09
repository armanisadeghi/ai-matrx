-- agx_list_orchestra_badge_column.sql
--
-- P4b of common-docs/projects/npm-package-extraction/AGENT-PICKER-DESIGN.md.
--
-- THE DEFECT. Workflow Studio's old hand-rolled picker showed an Orchestra
-- badge (conductor marker, member count, mode, tagline, member titles) that the
-- Python route `GET /agents` stamped from `platform.associations` via
-- `aidream/services/orchestras/orchestra_reader.py::read_orchestra_badges`.
-- Every UI picker on the platform now reads the RPC `agx_get_list_full()`
-- instead, and that RPC had no such column — so EVERY client lost the badge at
-- once. The class fix is here, in the one read every client shares, not a
-- second fetch in any client.
--
-- WHAT CHANGES. A trailing nullable `orchestra jsonb` column on
-- `agx_get_list`, `agx_get_list_full` and `agx_search`, shaped
--   {"mode":…, "tagline":…, "depth_budget":…, "member_count":…, "member_titles":[…]}
-- and NULL for every agent that is not a conductor. Membership, ORDER BY,
-- SECURITY DEFINER, `search_path` and the argument signatures are byte-for-byte
-- unchanged; a `RETURNS TABLE` change cannot be done with CREATE OR REPLACE, so
-- each function is dropped and recreated and its GRANTs are restored here (DROP
-- takes them with it). All three are grandfathered in
-- `platform.definer_client_grant_grandfather` on their identity args, which the
-- output column list does not touch.
--
-- Consumers tolerate the extra column: the package row parser
-- (`@ai-matrx/agents/catalog` `toAgentSummary`) reads columns by name and
-- ignores unknown ones, and matrx-local's sidecar mirror takes the column set as
-- a REQUIRED MINIMUM since v1.4.79 (it already carries a first-class `orchestra`
-- column). Desktops on <=v1.4.78 rebuild rows from a pinned list, so they drop
-- the column and simply show no badge until they update.

-- ── Index behind the badge read ──────────────────────────────────────────────
-- Twelve conductor markers hide in ~32k associations and every picker mount
-- pays for finding them. Without this the marker scan is a full seq scan
-- (measured: 952 shared buffers per badge read); with it, an index scan of 10.
-- Partial and tiny — it indexes only live agent→agent orchestra markers.
CREATE INDEX IF NOT EXISTS idx_assoc_orchestra_marker_live
  ON platform.associations (source_id)
  WHERE deleted_at IS NULL AND role = 'orchestra' AND source_type = 'agent' AND target_type = 'agent';

-- ── The ONE definition of an Orchestra badge in SQL ──────────────────────────
-- A conductor is the agent's own self-edge (`source_id = target_id`,
-- `role = 'orchestra'`); its `metadata` carries mode / tagline / depth_budget.
-- `role = 'member'` edges give the count, and only NON-EMPTY labels give the
-- titles — an Orchestra whose edges carry no labels would otherwise render
-- "Delegates to: Member, Member, Member", noise that reads like data.
--
-- Deliberately ONE function called by all three readers rather than three
-- inlined copies: the association vocabulary (`agent`/`orchestra`/`member`,
-- `deleted_at IS NULL` per D135) has drifted before when it was written twice.
--
-- SECURITY INVOKER on purpose. Its only callers are the SECURITY DEFINER
-- readers below, so it runs as their owner there; called directly it stays
-- under the caller's RLS, and it is revoked from the client roles so it never
-- becomes a PostgREST door of its own.
--
-- `depth_budget` is passed through RAW (the declared jsonb number, or null when
-- absent/ill-typed). The platform default ceiling is a Python constant
-- (PROJECTED_AGENT_MAX_RECURSION_DEPTH) and is deliberately NOT copied into SQL
-- — a badge reports what the composition DECLARED; the runtime ceiling stays
-- owned by the one place that enforces it.
CREATE OR REPLACE FUNCTION public.agx_orchestra_badges()
RETURNS TABLE(agent_id uuid, orchestra jsonb)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT DISTINCT ON (m.source_id)
    m.source_id AS agent_id,
    jsonb_build_object(
      -- Mirrors the reader's `_meta_str(...) or "supervisor"`: a missing,
      -- non-string or empty mode reads as the default, never as blank.
      'mode', COALESCE(
        NULLIF(
          CASE WHEN jsonb_typeof(m.metadata -> 'mode') = 'string'
               THEN m.metadata ->> 'mode' END,
          ''),
        'supervisor'),
      'tagline', CASE WHEN jsonb_typeof(m.metadata -> 'tagline') = 'string'
                      THEN m.metadata ->> 'tagline' END,
      'depth_budget', CASE WHEN jsonb_typeof(m.metadata -> 'depth_budget') = 'number'
                           THEN m.metadata -> 'depth_budget' END,
      -- From the ROW count, never from the title list: titles hold only
      -- labelled edges, so an unlabelled Orchestra would report 0 members.
      'member_count', COALESCE(mem.member_count, 0),
      'member_titles', COALESCE(mem.member_titles, '[]'::jsonb)
    ) AS orchestra
  FROM platform.associations m
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS member_count,
           COALESCE(
             jsonb_agg(e.title ORDER BY e.position NULLS LAST, e.id)
               FILTER (WHERE e.title IS NOT NULL),
             '[]'::jsonb) AS member_titles
    FROM (
      SELECT a.position, a.id, NULLIF(btrim(COALESCE(a.label, '')), '') AS title
      FROM platform.associations a
      WHERE a.source_type = 'agent'
        AND a.target_type = 'agent'
        AND a.role = 'member'
        AND a.source_id = m.source_id
        AND a.deleted_at IS NULL   -- D135: a tombstoned edge is not a member
    ) e
  ) mem ON true
  WHERE m.source_type = 'agent'
    AND m.target_type = 'agent'
    AND m.role = 'orchestra'
    AND m.source_id = m.target_id  -- the SELF-edge is what marks a conductor
    AND m.deleted_at IS NULL       -- D135: a tombstoned marker is not an orchestra
  -- DISTINCT ON keeps one badge per conductor deterministically if a duplicate
  -- marker ever exists (the reader's dict-write kept the last one silently).
  ORDER BY m.source_id, m.created_at DESC, m.id;
$function$;

REVOKE ALL ON FUNCTION public.agx_orchestra_badges() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.agx_orchestra_badges() FROM anon;
REVOKE ALL ON FUNCTION public.agx_orchestra_badges() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.agx_orchestra_badges() TO service_role;

-- ── agx_get_list ─────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.agx_get_list(integer, integer);

CREATE FUNCTION public.agx_get_list(p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, orchestra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid();
BEGIN
  RETURN QUERY
  WITH all_agents AS (
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email
    FROM agent.definition a
    WHERE a.created_by = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: a deleted agent is not in anyone's list
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type = 'agent' AND p2.resource_id = a.id AND p2.granted_to_user_id = v_uid)
  ),
  -- The page is cut BEFORE the badge join, so LIMIT/OFFSET still bite on
  -- exactly the rows they used to and the badge can never change membership.
  page AS (
    SELECT * FROM all_agents
    -- `id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
    ORDER BY all_agents.is_favorite DESC, all_agents.updated_at DESC, all_agents.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT p.*, o.orchestra
  FROM page p
  LEFT JOIN agx_orchestra_badges() o ON o.agent_id = p.id
  -- Re-stated because the join is free to reorder. Same keys, same total order.
  ORDER BY p.is_favorite DESC, p.updated_at DESC, p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_get_list(integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agx_get_list(integer, integer) TO service_role;

-- ── agx_get_list_full ────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.agx_get_list_full();

CREATE FUNCTION public.agx_get_list_full()
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, orchestra jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY SELECT * FROM agx_get_list();
  -- Builtins get the badge too: a system agent can be a conductor, and a badge
  -- that appeared on your own agents but not on the platform's would be a lie
  -- about the platform's, not a saving.
  RETURN QUERY SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags, a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at, false, 'system'::text, NULL::text, o.orchestra
  FROM agent.definition a
  LEFT JOIN agx_orchestra_badges() o ON o.agent_id = a.id
  WHERE a.agent_type = 'builtin' AND a.is_active = true AND a.deleted_at IS NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_get_list_full() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full() TO anon;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full() TO authenticated;
GRANT EXECUTE ON FUNCTION public.agx_get_list_full() TO service_role;

-- ── agx_search ───────────────────────────────────────────────────────────────
-- Its row shape mirrors the list plus the two ranking columns, and the package
-- feeds both through the SAME row parser — so a searched conductor must carry
-- the badge or the picker would lose it the moment you typed.
DROP FUNCTION IF EXISTS public.agx_search(text, boolean, integer, integer);

CREATE FUNCTION public.agx_search(p_query text, p_deep boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, created_by uuid, organization_id uuid, task_id uuid, source_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, shared_by_email text, match_score integer, match_field text, orchestra jsonb)
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
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           true AS is_owner, 'owner'::text AS access_level, NULL::text AS shared_by_email,
           a.messages
    FROM agent.definition a
    WHERE a.created_by = v_uid AND a.agent_type = 'user'
      AND a.deleted_at IS NULL   -- D101: search must not resurrect a deleted agent
    UNION ALL
    SELECT a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id AND perm.granted_to_user_id = v_uid
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
      AND a.deleted_at IS NULL   -- D101
    UNION ALL
    SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.model_id, a.category, a.tags,
           a.is_active, a.is_archived, a.is_favorite, a.created_by, a.organization_id, a.task_id, a.source_agent_id, a.created_at, a.updated_at,
           false, perm.permission_level::text, u_owner.email, a.messages
    FROM agent.definition a
    INNER JOIN iam.permissions perm ON perm.resource_type = 'agent' AND perm.resource_id = a.id
      AND perm.granted_to_organization_id IN (SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id = v_uid)
    LEFT JOIN auth.users u_owner ON u_owner.id = a.created_by
    WHERE a.created_by != v_uid
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
  ),
  -- Same discipline as the list: rank, order and CUT the page first, then hang
  -- the badge on the rows that survived.
  page AS (
    SELECT s.id, s.agent_type, s.name, s.description, s.model_id, s.category, s.tags,
           s.is_active, s.is_archived, s.is_favorite, s.created_by, s.organization_id, s.task_id, s.source_agent_id, s.created_at, s.updated_at,
           s.is_owner, s.access_level, s.shared_by_email, s.match_score, s.match_field
    FROM scored s
    WHERE s.match_score > 0
    -- `s.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
    ORDER BY s.match_score DESC, s.is_favorite DESC, s.updated_at DESC, s.id
    LIMIT p_limit OFFSET p_offset
  )
  SELECT p.*, o.orchestra
  FROM page p
  LEFT JOIN agx_orchestra_badges() o ON o.agent_id = p.id
  ORDER BY p.match_score DESC, p.is_favorite DESC, p.updated_at DESC, p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_search(text, boolean, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.agx_search(text, boolean, integer, integer) TO service_role;

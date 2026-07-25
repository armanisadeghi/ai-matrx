-- agx_list_scoped — THE VIEW LAW list reader for agents.
--
-- Replaces the "fetch every row then slice in the browser" pattern behind
-- /agents/all with ONE server-side query that declares its scope explicitly,
-- sorts/filters/paginates in Postgres, and returns a true total_count.
--
-- Why this exists (three defects in agx_get_list it fixes):
--   1. NO ORG SCOPE. Every user agent is visibility='internal' with an
--      organization_id, yet agx_get_list only returns rows you OWN or were
--      explicitly GRANTED. Agents your own teammates created in your own org
--      were invisible. "My Orgs" is that missing destination.
--   2. NO TOTAL COUNT. Counts were derived client-side from whatever happened
--      to be loaded, so they were post-filter guesses, never totals.
--   3. LEAKS SOFT-DELETED ROWS. agx_get_list has no `deleted_at IS NULL`
--      predicate. This one does.
--
-- Scopes (mutually exclusive destinations, never an RLS-shaped blur):
--   mine   → rows I created.
--   orgs   → rows created by SOMEONE ELSE inside an org I belong to, whose
--            visibility admits org-mates ('internal' | 'public'). Ambient
--            discovery. p_org_id narrows to one org; NULL = all my orgs.
--            Personal orgs are excluded — their content IS "mine".
--   shared → rows explicitly granted to me (user grant) or to one of my orgs
--            (org grant) via iam.permissions. A deliberate act by an owner.
--            May overlap `orgs`; the two answer different questions
--            ("who handed this to me?" vs "what does my org have?").
--   public → visibility='public' rows I did not create. The commons.
--
-- SECURITY DEFINER: membership is enforced in-function against
-- iam.organization_member. Never widen a scope without re-reading that join.

CREATE OR REPLACE FUNCTION public.agx_list_scoped(
  p_scope          text    DEFAULT 'mine',
  p_org_id         uuid    DEFAULT NULL,
  p_search         text    DEFAULT NULL,
  p_deep           boolean DEFAULT false,
  p_sort           text    DEFAULT 'updated',
  p_dir            text    DEFAULT 'desc',
  p_favorites_only boolean DEFAULT false,
  p_archived       text    DEFAULT 'active',
  p_category       text    DEFAULT NULL,
  p_limit          integer DEFAULT 50,
  p_offset         integer DEFAULT 0
)
RETURNS TABLE(
  id                uuid,
  agent_type        text,
  name              text,
  description       text,
  model_id          uuid,
  category          text,
  tags              text[],
  is_active         boolean,
  is_archived       boolean,
  is_favorite       boolean,
  visibility        text,
  user_id           uuid,
  organization_id   uuid,
  organization_name text,
  project_id        uuid,
  task_id           uuid,
  source_agent_id   uuid,
  version           integer,
  created_at        timestamptz,
  updated_at        timestamptz,
  is_owner          boolean,
  access_level      text,
  owner_email       text,
  total_count       bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_scope  text := lower(coalesce(p_scope, 'mine'));
  v_dir    text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort   text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'agx_list_scoped: not authenticated';
  END IF;

  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope;
  END IF;

  IF v_sort NOT IN ('updated', 'created', 'name', 'category') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    -- Non-personal orgs only: a personal org's contents are "mine", and
    -- re-surfacing them under "My Orgs" would duplicate the tab.
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid
      AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    -- mine -------------------------------------------------------------
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a
    WHERE v_scope = 'mine'
      AND a.user_id = v_uid

    UNION ALL
    -- orgs -------------------------------------------------------------
    SELECT a.*, false, 'org'::text
    FROM agent.definition a
    WHERE v_scope = 'orgs'
      AND a.user_id IS DISTINCT FROM v_uid
      -- my_orgs aliases the column to `org_id` on purpose: a bare
      -- `organization_id` resolves to the RETURNS TABLE OUT variable of the
      -- same name, not the CTE column (42702 ambiguous reference).
      AND a.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND a.visibility IN ('internal', 'public')

    UNION ALL
    -- shared: explicit user grant --------------------------------------
    SELECT a.*, false, perm.permission_level::text
    FROM agent.definition a
    JOIN iam.permissions perm
      ON perm.resource_type = 'agent'
     AND perm.resource_id = a.id
     AND perm.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND a.user_id IS DISTINCT FROM v_uid

    UNION ALL
    -- shared: explicit org grant (excluding rows already covered above) --
    SELECT DISTINCT ON (a.id) a.*, false, perm.permission_level::text
    FROM agent.definition a
    JOIN iam.permissions perm
      ON perm.resource_type = 'agent'
     AND perm.resource_id = a.id
     AND perm.granted_to_organization_id IN (
           SELECT om.organization_id
           FROM iam.organization_member om
           WHERE om.user_id = v_uid
         )
    WHERE v_scope = 'shared'
      AND a.user_id IS DISTINCT FROM v_uid
      AND NOT EXISTS (
        SELECT 1 FROM iam.permissions p2
        WHERE p2.resource_type = 'agent'
          AND p2.resource_id = a.id
          AND p2.granted_to_user_id = v_uid
      )

    UNION ALL
    -- public -----------------------------------------------------------
    SELECT a.*, false, 'public'::text
    FROM agent.definition a
    WHERE v_scope = 'public'
      AND a.user_id IS DISTINCT FROM v_uid
      AND a.visibility = 'public'
  ),
  filtered AS (
    SELECT s.*
    FROM scoped s
    WHERE s.agent_type = 'user'
      AND s.deleted_at IS NULL
      AND (NOT p_favorites_only OR s.is_favorite IS TRUE)
      AND (
        CASE lower(coalesce(p_archived, 'active'))
          WHEN 'archived' THEN s.is_archived IS TRUE
          WHEN 'all'      THEN true
          ELSE                 s.is_archived IS NOT TRUE
        END
      )
      AND (p_category IS NULL OR s.category = p_category)
      AND (
        v_search IS NULL
        OR s.name ILIKE '%' || v_search || '%'
        OR s.description ILIKE '%' || v_search || '%'
        OR s.category ILIKE '%' || v_search || '%'
        OR EXISTS (
             SELECT 1 FROM unnest(coalesce(s.tags, ARRAY[]::text[])) t
             WHERE t ILIKE '%' || v_search || '%'
           )
        -- Deep search reaches into prompt content. Opt-in: it is a full
        -- jsonb-to-text scan and must never be the default.
        OR (p_deep AND s.messages::text ILIKE '%' || v_search || '%')
      )
  ),
  counted AS (
    SELECT f.*, count(*) OVER () AS s_total FROM filtered f
  )
  SELECT
    c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]),
    c.is_active, c.is_archived, c.is_favorite, c.visibility::text,
    c.user_id, c.organization_id, o.name, c.project_id, c.task_id,
    c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, u.email::text, c.s_total
  FROM counted c
  LEFT JOIN iam.organizations o ON o.id = c.organization_id
  LEFT JOIN auth.users u ON u.id = c.user_id
  -- Every ORDER BY ends in `id`. A non-total order silently drops rows across
  -- pages (that exact bug cost this table 59 of 365 agents once already —
  -- see agx_get_list_stable_pagination.sql).
  ORDER BY
    CASE WHEN v_sort = 'updated'  AND v_dir = 'desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort = 'updated'  AND v_dir = 'asc'  THEN c.updated_at END ASC,
    CASE WHEN v_sort = 'created'  AND v_dir = 'desc' THEN c.created_at END DESC,
    CASE WHEN v_sort = 'created'  AND v_dir = 'asc'  THEN c.created_at END ASC,
    CASE WHEN v_sort = 'name'     AND v_dir = 'desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort = 'name'     AND v_dir = 'asc'  THEN lower(c.name) END ASC,
    CASE WHEN v_sort = 'category' AND v_dir = 'desc' THEN lower(c.category) END DESC,
    CASE WHEN v_sort = 'category' AND v_dir = 'asc'  THEN lower(c.category) END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit, 50), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, text, integer, integer) TO authenticated;

-- Facet counts for the scope tabs. One round trip returns every tab's total so
-- the tab bar shows TRUE counts instead of "however many rows we happened to
-- have loaded". Honors the same active/archived + favorites + search filters
-- so the tab numbers agree with what clicking the tab actually shows.
CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(
  p_search         text    DEFAULT NULL,
  p_deep           boolean DEFAULT false,
  p_favorites_only boolean DEFAULT false,
  p_archived       text    DEFAULT 'active',
  p_category       text    DEFAULT NULL
)
RETURNS TABLE(scope text, org_id uuid, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(
      v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      p_favorites_only, p_archived, p_category, 1, 0
    ) r;
  END LOOP;

  -- Per-org breakdown so the "My Orgs" dropdown can show a count per chip.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.agx_list_scoped(
    'orgs', o.id, p_search, p_deep, 'updated', 'desc',
    p_favorites_only, p_archived, p_category, 1, 0
  ) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_list_scope_counts(text, boolean, boolean, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_scope_counts(text, boolean, boolean, text, text) TO authenticated;

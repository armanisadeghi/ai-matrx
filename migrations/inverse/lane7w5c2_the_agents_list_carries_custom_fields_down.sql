-- chair-step: inverse of migrations/campaign/lane7w5c2_the_agents_list_carries_custom_fields.sql — drops
-- public.agx_list_scoped and re-creates the body without custom_fields, byte for byte, and its grants.
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 8d725c0d70710cc40f296752a16934556a1b5563feb7111028418d513d3378d4

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('agent')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The system scope is the only one that reads the builtin corpus; a platform
  -- admin reads all of it, everyone else the published built-ins. Resolved
  -- once so the scan is not per-row.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (and All,
  -- which contains them) — per-row platform.shown_to_lists; every other lane never
  -- looks at it, so it is not built for them (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := platform.shown_to_context('agent');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by agx_list_scope_counts: ONE statement that returns, for
  -- every user lane (all, mine, team, orgs, shared, public, system), the ids this same list would show
  -- (access_level carries the lane name, one row per lane and agent, strongest way in kept), so the row-secured
  -- tables are read once instead of once per lane. Same lane predicates and filters as below; nothing is sorted,
  -- scored or paged. The admin platform scopes are not part of it. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE v_need_names boolean := v_f ?| ARRAY['owner_email','organization_name'];
    BEGIN
      v_ctx := platform.shown_to_context('agent');
      RETURN QUERY
      WITH defs AS MATERIALIZED (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at, a.shown_to, a.card_visibility,
          (p_deep AND v_search IS NOT NULL AND a.messages::text ILIKE '%'||v_search||'%') AS deep_hit
        FROM agent.definition a
      ),
      mine AS (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
          a.deep_hit AS deep_hit,
          true AS s_is_owner, 'owner'::text AS s_access
        FROM defs a WHERE a.created_by = v_uid AND (p_org_id IS NULL OR a.organization_id = p_org_id)
      ),
      orgs AS (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
          a.deep_hit AS deep_hit,
          (a.created_by = v_uid) AS s_is_owner, CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text AS s_access
        FROM defs a
        WHERE (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
          AND platform.shown_to_lists(a.shown_to, a.visibility, a.created_by, a.organization_id, v_uid, v_ctx)
      ),
      team AS (
        SELECT o.* FROM orgs o
        WHERE (o.organization_id, o.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
          a.deep_hit AS deep_hit,
          false AS s_is_owner, perm.permission_level::text AS s_access
        FROM defs a
        JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
          AND perm.granted_to_user_id = v_uid
        WHERE a.created_by IS DISTINCT FROM v_uid AND (p_org_id IS NULL OR a.organization_id = p_org_id)
        UNION ALL
        SELECT os.id, os.agent_type, os.name, os.description, os.category, os.tags, os.is_archived, os.deleted_at, os.visibility,
          os.created_by, os.organization_id, os.version, os.created_at, os.updated_at, os.deep_hit, false, os.s_access2
        FROM (
          SELECT DISTINCT ON (a.id) a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
            a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
            a.deep_hit AS deep_hit,
            perm.permission_level::text AS s_access2
          FROM defs a
          JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
            AND perm.granted_to_organization_id IN (
              SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
          WHERE a.created_by IS DISTINCT FROM v_uid
            AND (p_org_id IS NULL OR a.organization_id = p_org_id)
            AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
              AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
          ORDER BY a.id, perm.permission_level::text
        ) os
      ),
      pub AS (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
          (p_deep AND v_search IS NOT NULL AND a.messages::text ILIKE '%'||v_search||'%') AS deep_hit,
          false AS s_is_owner, 'public'::text AS s_access
        FROM agent.public_card_rows() a
        WHERE a.created_by IS DISTINCT FROM v_uid AND (p_org_id IS NULL OR a.organization_id = p_org_id)
      ),
      sys AS (
        SELECT a.id, a.agent_type, a.name, a.description, a.category, a.tags, a.is_archived, a.deleted_at, a.visibility,
          a.created_by, a.organization_id, a.version, a.created_at, a.updated_at,
          a.deep_hit AS deep_hit,
          v_is_admin AS s_is_owner, 'system'::text AS s_access
        FROM defs a
        WHERE (v_is_admin OR a.card_visibility = 'public'::platform.visibility)
          AND (p_org_id IS NULL OR a.organization_id = p_org_id)
      ),
      lane_raw AS (
        SELECT 'mine'::text AS lane, m.* FROM mine m
        UNION ALL SELECT 'orgs', o.* FROM orgs o
        UNION ALL SELECT 'team', t.* FROM team t
        UNION ALL SELECT 'shared', s.* FROM shared s
        UNION ALL SELECT 'public', p.* FROM pub p
        UNION ALL SELECT 'system', y.* FROM sys y
        UNION ALL SELECT 'all', m.* FROM mine m
        UNION ALL SELECT 'all', o.* FROM orgs o
        UNION ALL SELECT 'all', s.* FROM shared s
      ),
      deduped AS (
        SELECT DISTINCT ON (s.lane, s.id) s.* FROM lane_raw s
        ORDER BY s.lane, s.id, s.s_is_owner DESC,
          CASE s.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2
                          WHEN 'org' THEN 3 WHEN 'commenter' THEN 4 WHEN 'viewer' THEN 5 ELSE 6 END
      ),
      joined AS (
        SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
        FROM deduped s
        LEFT JOIN iam.organizations o ON o.id = s.organization_id
        LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by AND v_need_names
      ),
      filtered AS (
        SELECT j.* FROM joined j
    WHERE (j.lane = 'platform_all' OR j.agent_type = (CASE WHEN j.lane='system' THEN 'builtin' ELSE 'user' END))
      AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR j.deep_hit)
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('agent', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, 'agent')), '{}')))
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
      )
      SELECT d.id, NULL::text, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text[], NULL::boolean, NULL::boolean,
        NULL::boolean, NULL::text, NULL::uuid, d.organization_id, NULL::text, NULL::uuid, NULL::uuid, NULL::integer,
        NULL::timestamptz, NULL::timestamptz, NULL::boolean, d.lane, NULL::text, 0::bigint
      FROM filtered d;
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('all','mine','team','orgs','shared','public','system','platform_orgs','platform_users','platform_all') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    -- MINE (and All): what I made, in any organization — narrowed by the organization filter.
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope IN ('mine','all') AND a.created_by = v_uid
      AND (p_org_id IS NULL OR a.organization_id = p_org_id)
    UNION ALL
    SELECT a.*, (a.created_by = v_uid), CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM agent.definition a
    WHERE v_scope IN ('orgs','team','all') AND (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (a.organization_id, a.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(a.shown_to, a.visibility, a.created_by, a.organization_id, v_uid, v_ctx)
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope IN ('shared','all') AND a.created_by IS DISTINCT FROM v_uid
      AND (p_org_id IS NULL OR a.organization_id = p_org_id)
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope IN ('shared','all') AND a.created_by IS DISTINCT FROM v_uid
        AND (p_org_id IS NULL OR a.organization_id = p_org_id)
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
          AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
      ORDER BY a.id, perm.permission_level::text
    ) org_shared
    UNION ALL
    -- PUBLIC = what a tenant PUBLISHED: the agent's CARD is public (card_visibility, the one
    -- column the publish path writes; the body can never be public — CHECK). The card rows come
    -- through agent.public_card_rows(), a definer that projects card fields only, because RLS
    -- hides a stranger's agent body from this invoker function (2026-09-26).
    SELECT a.*, false, 'public'::text FROM agent.public_card_rows() a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid
      AND (p_org_id IS NULL OR a.organization_id = p_org_id)
    UNION ALL
    -- SYSTEM: the platform's own builtin corpus. Every signed-in person reads
    -- the PUBLISHED built-ins (card_visibility = 'public', the one column the
    -- publish path writes) and does not own them; a platform admin also reads
    -- the unpublished rest and owns them — the row-level affordances (rename,
    -- favorite, delete) are what the System Agents page exists to give them.
    -- (2026-09-27: this arm was admin-only, so /agents/all never showed the
    -- 500+ public built-ins to anyone.)
    SELECT a.*, v_is_admin, 'system'::text FROM agent.definition a
    WHERE v_scope='system' AND (v_is_admin OR a.card_visibility = 'public'::platform.visibility)
      AND (p_org_id IS NULL OR a.organization_id = p_org_id)
    UNION ALL
    -- ADMIN PLATFORM SCOPES (Arman, 2026-09-26: "No one acts as themselves in
    -- admin"). The whole platform, never the viewer: every organization's
    -- agents, every person's own agents, or everything. Admin-only.
    SELECT a.*, (a.agent_type = 'builtin'), 'platform'::text FROM agent.definition a
    LEFT JOIN iam.organizations po ON po.id = a.organization_id
    WHERE v_is_admin AND (
         (v_scope='platform_orgs' AND a.organization_id IS NOT NULL
            AND a.organization_id IS DISTINCT FROM (SELECT so.organization_id FROM iam.system_orgs so WHERE so.key = 'system')
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_users' AND a.organization_id IS NULL
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_all' AND (p_org_id IS NULL OR a.organization_id = p_org_id)))
  ),
  -- ALL is a union of lanes, so one agent can arrive by several (mine AND my org,
  -- my org AND a share): ONE row per agent, keeping the strongest way in.
  deduped AS (
    SELECT DISTINCT ON (s.id) s.* FROM scoped s
    ORDER BY s.id, s.s_is_owner DESC,
      CASE s.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2
                      WHEN 'org' THEN 3 WHEN 'commenter' THEN 4 WHEN 'viewer' THEN 5 ELSE 6 END
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM deduped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
  ),
  filtered AS (
    SELECT j.* FROM joined j
    -- The corpus a scope reads. Every user-facing scope reads user agents;
    -- `system` reads the builtin corpus and NOTHING else, so a builtin can
    -- never leak into Mine/Orgs/Shared/Public and a user agent can never
    -- masquerade as a platform agent.
    WHERE (v_scope = 'platform_all' OR j.agent_type = (CASE WHEN v_scope='system' THEN 'builtin' ELSE 'user' END))
      AND j.deleted_at IS NULL
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.is_archived IS TRUE
             WHEN 'all' THEN true
             ELSE j.is_archived IS NOT TRUE END)
      AND (v_search IS NULL
        OR j.name ILIKE '%'||v_search||'%'
        OR j.description ILIKE '%'||v_search||'%'
        OR j.category ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(coalesce(j.tags, ARRAY[]::text[])) t
                   WHERE t ILIKE '%'||v_search||'%')
        OR (p_deep AND j.messages::text ILIKE '%'||v_search||'%'))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR platform.my_favorite('agent', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, 'agent')), '{}')))
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.agx_search_score(
      v_search, f.id, f.name, f.description, f.category, f.tags,
      f.model_id, f.agent_type, f.s_owner_email,
      p_deep AND f.messages::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('agent', c.id),
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN platform.my_favorite('agent', c.id) END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='name' AND v_dir='desc' THEN lower(c.name) END DESC,
    CASE WHEN v_sort='name' AND v_dir='asc' THEN lower(c.name) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.description,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.category,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.tags,','),'')) END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='access_level' AND v_dir='desc' THEN lower(coalesce(c.s_access,'')) END DESC,
    CASE WHEN v_sort='access_level' AND v_dir='asc' THEN lower(coalesce(c.s_access,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='version' AND v_dir='desc' THEN c.version END DESC,
    CASE WHEN v_sort='version' AND v_dir='asc' THEN c.version END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('agent', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('agent', c.id) END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) TO authenticated, service_role;

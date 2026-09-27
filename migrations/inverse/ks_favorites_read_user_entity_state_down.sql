-- chair-step: inverse of ks_favorites_read_user_entity_state — restores the twelve pre-change bodies and the view, drops platform.my_favorite. Rehearsal only.
-- based-on: public.agx_get_list(integer, integer) 5602015dffb93fb5e65c5bd2861a6516e6d749d6e0cd60efca9bb3b09bf09ba8
-- based-on: public.agx_get_list_full() 3720dc128e2cf3aa1a50073a3a4c7c86973d45682c6ee92b1da88b14809cf0e8
-- based-on: public.agx_search(text, boolean, integer, integer) 833a83f5cd5264ab0423499352b04c29c727a4451c9721ef41609cdab8f6b1f9
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 833ba0b2cfcceb96e253f294765f5cef9b8bcce1f397b3821215752bef606133
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 746042ca415a35c9c7daec13d9fcf239f5338989c7f45294890d4994fdb38554
-- based-on: public.get_agent_core_batch(uuid[], text[]) 5acd9a47aa354dee2321386edf40a551fc1d85d39f0ea728cc8004ab878c1fc3
-- based-on: public.get_agent_conversations(uuid, integer, integer, integer) 54de2dee3c709f83215de64ec987f6f24a60e6bcc5ee31f2ee7ac11077671d5f
-- based-on: public.agx_create_agent_from_template(uuid) 2394ae38d0d022f61d9c4aa9caf2e28ff1d2dceda273b6fd370b92a8bcc31105
-- based-on: public.agx_duplicate_agent(uuid, boolean, uuid) fb996e8f002504c6728b3cd5de0baa97ce4ec80794660c9f89013b8cd404564f
-- based-on: public.agx_duplicate_version(uuid, boolean, uuid) 990cbf312b51f6b1dd846944323a0cccfa7009566a233b098697c3fe5c0ca901
-- based-on: public.wfx_duplicate_definition(uuid, uuid) 28b400958d3bcc4f6b0af52377e852d70a24a38abff88855dc7ee4246659bca4
-- based-on: public.wfx_duplicate_version(uuid, uuid) c3b4f1588e37d9ad4cc04b57032082b6c31318cbcdaa7a955e7a2c6953a37ebd
CREATE OR REPLACE FUNCTION public.agx_get_list(p_limit integer DEFAULT NULL::integer, p_offset integer DEFAULT 0)
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

CREATE OR REPLACE FUNCTION public.agx_get_list_full()
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
  WHERE a.agent_type = 'builtin' AND a.is_active = true AND a.deleted_at IS NULL
    -- 🚨 DD-208: a door is never wider than its table. `builtin` is a TYPE, not a
    -- visibility. These two disjuncts are agent.definition's own std_select.
    AND (
      a.created_by = (select auth.uid())
      OR (a.organization_id IS NOT NULL
          AND a.visibility >= 'internal'::platform.visibility
          AND a.organization_id IN (SELECT so.organization_id
                                      FROM iam.system_orgs so WHERE so.global_readable))
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_search(p_query text, p_deep boolean DEFAULT false, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
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

CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('agent')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The system scope is the only one that reads the builtin corpus, and only
  -- a platform admin may. Resolved once so the scan is not per-row.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public','system','platform_orgs','platform_users','platform_all') THEN
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
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.created_by = v_uid
    UNION ALL
    SELECT a.*, (a.created_by = v_uid), CASE WHEN a.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM agent.definition a
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR a.organization_id = p_org_id) AND a.organization_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
    UNION ALL
    -- DISTINCT ON needs its own ORDER BY (deterministic access_level when
    -- several org grants exist) — hence the subquery wrapper. (D134)
    SELECT * FROM (
      SELECT DISTINCT ON (a.id) a.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM agent.definition a
      JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND a.created_by IS DISTINCT FROM v_uid
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
    UNION ALL
    -- SYSTEM: the platform's own builtin corpus. Admin-only, and owned by the
    -- admin viewing it — the row-level affordances (rename, favorite, delete)
    -- are exactly what this scope exists to give them.
    SELECT a.*, true, 'system'::text FROM agent.definition a
    WHERE v_scope='system' AND v_is_admin
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
      OR v_scope='platform_all')
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
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
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
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
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE FIRST when searching. A name match must outrank a description
    -- match; ordering a search by updated_at buries the thing you asked for.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    -- Favorites pinned to the top of EVERY sort. This is the product default:
    -- what you starred is what you reach for.
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
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
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.wfx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, card_visibility text, created_by uuid, organization_id uuid, organization_name text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, step_count integer, run_count bigint, last_run_id uuid, last_run_status text, last_run_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('workflow')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'wfx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'wfx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived','steps','runs','last_run','status') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT d.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM workflow.definition d WHERE v_scope='mine' AND d.created_by = v_uid
    UNION ALL
    SELECT d.*, (d.created_by = v_uid), CASE WHEN d.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM workflow.definition d
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR d.organization_id = p_org_id) AND d.organization_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT d.*, false, perm.permission_level::text FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (d.id) d.*, false, perm.permission_level::text
    FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND d.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='workflow'
        AND p2.resource_id=d.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    -- PUBLIC = the workflow's CARD is public. Rows come through workflow.public_card_rows()
    -- (card fields only) because RLS hides a stranger's workflow body from this invoker (2026-09-26).
    SELECT d.*, false, 'public'::text FROM workflow.public_card_rows() d
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid
  ),
  joined AS (
    SELECT s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      coalesce(jsonb_array_length(s.nodes), 0) AS s_steps,
      coalesce(r.s_runs, 0::bigint) AS s_runs,
      r.s_last_run_id, r.s_last_run_status, r.s_last_run_at
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    LEFT JOIN LATERAL (
      SELECT (array_agg(x.id ORDER BY x.created_at DESC))[1] AS s_last_run_id,
             (array_agg(x.status ORDER BY x.created_at DESC))[1] AS s_last_run_status,
             max(x.created_at) AS s_last_run_at,
             count(*) AS s_runs
      FROM workflow.run x
      WHERE x.definition_id = s.id AND x.deleted_at IS NULL
    ) r ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
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
        OR (p_deep AND j.nodes::text ILIKE '%'||v_search||'%'))
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'version'
           OR j.version::text IN (SELECT jsonb_array_elements_text(v_f->'version'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.s_last_run_status,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'last_run'
           OR j.s_last_run_at >= public.agx_since_bucket(v_f->'last_run'->'values'->>0))
      AND (NOT v_f ? 'steps'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'steps'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_steps::bigint, b)))
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_runs, b)))
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, public.mtx_search_score(
      v_search, f.id, f.name, f.description, f.tags, f.s_owner_email,
      ARRAY[f.category], ARRAY[f.s_last_run_status],
      p_deep AND f.nodes::text ILIKE '%'||v_search||'%'
    ) AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.id, c.name, c.description, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.card_visibility::text,
    c.created_by, c.organization_id, c.s_org_name, c.version,
    c.created_at, c.updated_at, c.s_steps, c.s_runs,
    c.s_last_run_id, c.s_last_run_status, c.s_last_run_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
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
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN c.is_archived END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN c.is_archived END ASC,
    CASE WHEN v_sort='steps' AND v_dir='desc' THEN c.s_steps END DESC,
    CASE WHEN v_sort='steps' AND v_dir='asc' THEN c.s_steps END ASC,
    CASE WHEN v_sort='runs' AND v_dir='desc' THEN c.s_runs END DESC,
    CASE WHEN v_sort='runs' AND v_dir='asc' THEN c.s_runs END ASC,
    CASE WHEN v_sort='last_run' AND v_dir='desc' THEN c.s_last_run_at END DESC NULLS LAST,
    CASE WHEN v_sort='last_run' AND v_dir='asc' THEN c.s_last_run_at END ASC NULLS LAST,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.s_last_run_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.s_last_run_status,'')) END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_agent_core_batch(p_ids uuid[], p_sources text[])
 RETURNS TABLE(id uuid, source text, name text, description text, tags text[], category text, is_archived boolean, is_favorite boolean, is_active boolean, output_format text, created_at timestamp with time zone, updated_at timestamp with time zone, version integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  prompt_ids uuid[];
  builtin_ids uuid[];
BEGIN
  SELECT array_agg(p_ids[i])
    INTO prompt_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] = 'prompts';

  SELECT array_agg(p_ids[i])
    INTO builtin_ids
    FROM generate_subscripts(p_ids, 1) AS i
    WHERE p_sources[i] IN ('builtins', 'shared');

  IF prompt_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      CASE WHEN d.created_by = (select auth.uid()) THEN 'prompts' ELSE 'shared' END::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      false AS is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(prompt_ids)
      AND d.agent_type = 'user'
      AND (d.created_by = (select auth.uid()) OR iam.has_access('agent', d.id, 'viewer'::public.permission_level));
  END IF;

  IF builtin_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT
      d.id,
      'builtins'::text,
      d.name::text,
      d.description,
      d.tags,
      d.category,
      d.is_archived,
      d.is_favorite,
      d.is_active,
      NULL::text AS output_format,
      d.created_at,
      d.updated_at,
      d.version
    FROM agent.definition d
    WHERE d.id = ANY(builtin_ids) AND d.agent_type = 'builtin'
      -- 🚨 DD-208: agent.definition's own std_select, not a wider door.
      AND (
        d.created_by = (select auth.uid())
        OR (d.organization_id IS NOT NULL
            AND d.visibility >= 'internal'::platform.visibility
            AND d.organization_id IN (SELECT so.organization_id
                                        FROM iam.system_orgs so WHERE so.global_readable))
      );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_agent_conversations(p_agent_id uuid, p_version_number integer DEFAULT NULL::integer, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(conversation_id uuid, title text, description text, status text, message_count smallint, last_model_id uuid, initial_agent_version_id uuid, agent_version_number integer, source_app text, source_feature text, created_at timestamp with time zone, updated_at timestamp with time zone, is_favorite boolean)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select
    c.id, c.title, c.description, c.status, c.message_count,
    c.last_model_id, c.initial_agent_version_id,
    av.version_number,
    c.source_app, c.source_feature,
    c.created_at, c.updated_at,
    c.is_favorite
  from chat.conversation c
  left join agent.definition_version av on av.id = c.initial_agent_version_id
  where c.initial_agent_id = p_agent_id
    and c.deleted_at is null
    and (p_version_number is null or av.version_number = p_version_number)
  -- `c.id` is the unique tiebreaker that makes this a TOTAL order. Do not remove it.
  order by c.updated_at desc, c.id desc
  limit p_limit offset p_offset;
$function$;

CREATE OR REPLACE FUNCTION public.agx_create_agent_from_template(p_template_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM agent.template
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found';
  END IF;

  IF v_source.visibility <> 'public' THEN
    IF NOT iam.has_access_for(v_uid, 'agent_template', p_template_id, 'viewer') THEN
      RAISE EXCEPTION 'Access denied';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  INSERT INTO agent.definition (
    id, agent_type, name, description, messages, variable_definitions, model_id,
    model_tiers, settings, output_schema, tools, custom_tools, context_policies,
    auto_context_disabled,
    mcp_servers, category, tags, is_active, is_archived, is_favorite,
    created_by, organization_id, task_id, source_agent_id, source_snapshot_at
  )
  VALUES (
    v_new_id, 'user', v_source.name, v_source.description, v_source.messages,
    v_source.variable_definitions, v_source.model_id, v_source.model_tiers,
    v_source.settings, v_source.output_schema, v_source.tools, v_source.custom_tools,
    v_source.context_policies, v_source.auto_context_disabled,
    v_source.mcp_servers, v_source.category, v_source.tags,
    true, false, false,
    v_uid, NULL, NULL, NULL, NULL);

  UPDATE agent.template
  SET use_count = use_count + 1
  WHERE id = p_template_id;

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_agent(p_agent_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM agent.definition
  WHERE id = p_agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent not found';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT iam.has_access_for(v_uid, 'agent', p_agent_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT v_as_system THEN
    -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
    -- chooses a tenant). Until this function took p_organization_id it wrote NULL
    -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
    -- copy died on the NOT NULL constraint with a message nobody could act on.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
        USING ERRCODE = '22023';
    END IF;
    IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
      RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, false,
      NULL, NULL, p_agent_id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_source.name || ' (Copy)'), v_source.description,
      v_source.messages, v_source.variable_definitions, v_source.model_id,
      v_source.model_tiers, v_source.settings, v_source.output_schema,
      v_source.tools, v_source.custom_tools, v_source.context_policies,
      v_source.auto_context_disabled,
      v_source.mcp_servers, v_source.tool_config,
      v_source.skill_config, v_source.matrx_actions, v_source.ui_gates,
      v_source.default_rag_boost, v_source.rag_awareness_mode, v_source.input_kind,
      v_source.category, v_source.tags, true, false, false,
      v_uid, p_organization_id, NULL, p_agent_id, now()
    );
  END IF;

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(p_agent_id, v_new_id, v_uid);

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.agx_duplicate_version(p_version_id uuid, p_as_system boolean DEFAULT false, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ver        record;
  v_master     record;
  v_new_id     uuid;
  v_uid        uuid    := auth.uid();
  v_as_system  boolean := COALESCE(p_as_system, false);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM agent.definition_version
  WHERE id = p_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Agent version not found';
  END IF;

  SELECT * INTO v_master
  FROM agent.definition
  WHERE id = v_ver.agent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master agent not found for version';
  END IF;

  IF v_as_system THEN
    IF NOT is_super_admin() THEN
      RAISE EXCEPTION 'Only super admins can duplicate as a system agent';
    END IF;
  ELSIF NOT (
    iam.has_access_for(v_uid, 'agent', v_master.id, 'viewer')
    OR v_master.agent_type = 'builtin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  IF NOT v_as_system THEN
    -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
    -- chooses a tenant). Until this function took p_organization_id it wrote NULL
    -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
    -- copy died on the NOT NULL constraint with a message nobody could act on.
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
        USING ERRCODE = '22023';
    END IF;
    IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
      RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  v_new_id := gen_random_uuid();

  IF v_as_system THEN
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'builtin', agent.next_free_agent_name(NULL, v_ver.name || ' (Copy)'), v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      NULL, NULL, v_master.id, now()
    );
  ELSE
    INSERT INTO agent.definition (
      id, agent_type, name, description,
      messages, variable_definitions, model_id, model_tiers, settings, output_schema,
      tools, custom_tools, context_policies, auto_context_disabled, mcp_servers, tool_config,
      skill_config, matrx_actions, ui_gates, default_rag_boost, rag_awareness_mode, input_kind,
      category, tags, is_active, is_archived, is_favorite,
      created_by, organization_id, task_id, source_agent_id, source_snapshot_at
    )
    VALUES (
      v_new_id, 'user', agent.next_free_agent_name(p_organization_id, v_ver.name || ' (Copy)'), v_ver.description,
      v_ver.messages, v_ver.variable_definitions, v_ver.model_id,
      v_ver.model_tiers, v_ver.settings, v_ver.output_schema,
      v_ver.tools, v_ver.custom_tools, v_ver.context_policies,
      v_ver.auto_context_disabled,
      v_ver.mcp_servers, v_ver.tool_config,
      v_ver.skill_config, v_ver.matrx_actions, v_ver.ui_gates,
      v_ver.default_rag_boost, v_ver.rag_awareness_mode, v_ver.input_kind,
      v_ver.category, v_ver.tags, true, false, false,
      v_uid, p_organization_id, NULL, v_master.id, now()
    );
  END IF;

  -- Carry what is attached to the definition (term lists, agent resources).
  PERFORM private.copy_agent_definition_attachments(v_master.id, v_new_id, v_uid);

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wfx_duplicate_definition(p_definition_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_source record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_source
  FROM workflow.definition
  WHERE id = p_definition_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow not found';
  END IF;

  IF NOT iam.has_access_for(v_uid, 'workflow', p_definition_id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
  -- chooses a tenant). Until this function took p_organization_id it wrote NULL
  -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
  -- copy died on the NOT NULL constraint with a message nobody could act on.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
      USING ERRCODE = '22023';
  END IF;
  IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
      USING ERRCODE = '42501';
  END IF;
  v_new_id := gen_random_uuid();

  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id, v_source.name || ' (Copy)', v_source.description,
    v_source.nodes, v_source.edges, v_source.viewport, v_source.channels,
    v_source.strict_channels, v_source.entry_nodes,
    v_source.metadata, v_source.variables, v_source.category, v_source.tags,
    v_source.max_concurrent_runs,
    true, false, false,
    v_uid, p_organization_id, NULL, NULL,
    p_definition_id, now()
  );

  RETURN v_new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wfx_duplicate_version(p_version_id uuid, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ver    record;
  v_master record;
  v_new_id uuid;
  v_uid    uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_ver
  FROM workflow.definition_version
  WHERE id = p_version_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Workflow version not found';
  END IF;

  SELECT * INTO v_master
  FROM workflow.definition
  WHERE id = v_ver.definition_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master workflow not found for version';
  END IF;

  IF NOT iam.has_access_for(v_uid, 'workflow', v_master.id, 'viewer') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- 🚨 THE CALLER NAMES THE ORGANIZATION (0929, 2026-09-19: the database never
  -- chooses a tenant). Until this function took p_organization_id it wrote NULL
  -- and leaned on the dropped `_stamp_org_default` trigger, so after 0929 every
  -- copy died on the NOT NULL constraint with a message nobody could act on.
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'Choose which organization the copy belongs to (p_organization_id is required).'
      USING ERRCODE = '22023';
  END IF;
  IF NOT iam.has_org_access_for(v_uid, p_organization_id) THEN
    RAISE EXCEPTION 'You are not a member of the organization you asked to put this copy in.'
      USING ERRCODE = '42501';
  END IF;
  v_new_id := gen_random_uuid();

  INSERT INTO workflow.definition (
    id, name, description,
    nodes, edges, viewport, channels, strict_channels, entry_nodes,
    metadata, variables, category, tags, max_concurrent_runs,
    is_active, is_archived, is_favorite,
    created_by, organization_id, project_id, task_id,
    source_definition_id, source_snapshot_at
  )
  VALUES (
    v_new_id,
    coalesce(v_ver.name, v_master.name) || ' (Copy)',
    coalesce(v_ver.description, v_master.description),
    coalesce(v_ver.nodes, v_master.nodes, '[]'::jsonb),
    coalesce(v_ver.edges, v_master.edges, '[]'::jsonb),
    coalesce(v_ver.viewport, v_master.viewport, '{"x": 0, "y": 0, "zoom": 1}'::jsonb),
    coalesce(v_ver.channels, v_master.channels, '[]'::jsonb),
    coalesce(v_ver.strict_channels, v_master.strict_channels, false),
    coalesce(v_ver.entry_nodes, v_master.entry_nodes, '[]'::jsonb),
    coalesce(v_ver.metadata, v_master.metadata, '{}'::jsonb),
    coalesce(v_ver.variables, v_master.variables, '[]'::jsonb),
    coalesce(v_ver.category, v_master.category),
    coalesce(v_ver.tags, v_master.tags, ARRAY[]::text[]),
    v_master.max_concurrent_runs,
    true, false, false,
    v_uid, p_organization_id, NULL, NULL,
    v_master.id, now()
  );

  RETURN v_new_id;
END;
$function$;

create or replace view workflow.v_definition_catalog with (security_invoker = true) as
 SELECT d.id,
    d.name,
    d.description,
    d.category,
    d.tags,
    d.is_favorite,
    d.is_active,
    d.is_archived,
    d.visibility,
    d.organization_id,
    d.created_by,
    d.created_at,
    d.updated_at,
    d.engram_state,
    COALESCE(jsonb_array_length(d.nodes), 0) AS step_count,
    r.last_run_id,
    r.last_run_status,
    r.last_run_at,
    COALESCE(r.run_count, 0::bigint) AS run_count
   FROM workflow.definition d
     LEFT JOIN LATERAL ( SELECT (array_agg(x.id ORDER BY x.created_at DESC))[1] AS last_run_id,
            (array_agg(x.status ORDER BY x.created_at DESC))[1] AS last_run_status,
            max(x.created_at) AS last_run_at,
            count(*) AS run_count
           FROM workflow.run x
          WHERE x.definition_id = d.id AND x.deleted_at IS NULL) r ON true
  WHERE d.deleted_at IS NULL;

drop function if exists platform.my_favorite(text, uuid);
-- chair-step: the inverse of migrations/list_lanes_owner_and_public_cards.sql — puts back the
--   seven *_list_scoped bodies whose My Orgs arm disowned the viewer's own rows, the agents and
--   workflows Public lanes that listed no public card, and get_share_capabilities without
--   organization_column; then withdraws the two card-projection definers and their door rows.
--   An inverse puts a defect back; it touches no data.
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 3316a0d1a4c3786c6bc1d84858a30dc2510da2fe5add3ff3220259b73faa27ab
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) fd88f64d26382005a97d3d006767950b34dd216c2f65c23e29b27f858898cfa3
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) cbd92ddd13e3358821dad4d8368463b75501499f61b57b5c8d73ef29fac4f437
-- based-on: public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) e3ba30e6c781551938dfacaccd297f8fff5631bb69e6f86ee57bce3a21dd7af4
-- based-on: public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 31c80d61eab664f5a88f637ad08540c558e14319cac17ff146475d1aea0f288e
-- based-on: public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) 6c915a073bdb3a4cbde02b61160139b7fe1fa51b3ef54a6421d5b0c5c5aafe80
-- based-on: public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) 244bcc0c002ecf49fe2cb298c54bc4aedbd1eb5048eaf03a1d4e752781d62769
-- based-on: public.get_share_capabilities(text) 5f181668a4c1b5aacd149e83ca271f4300a13fca3945ef17aaf94520960052e4

set local lock_timeout = '2s';

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
    SELECT a.*, false, 'org'::text FROM agent.definition a
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
    SELECT a.*, false, 'public'::text FROM agent.definition a
    WHERE v_scope='public' AND a.created_by IS DISTINCT FROM v_uid AND a.visibility='public'
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
         (v_scope='platform_orgs' AND po.is_personal IS NOT TRUE
            AND a.organization_id IS DISTINCT FROM (SELECT so.organization_id FROM iam.system_orgs so WHERE so.key = 'system')
            AND (p_org_id IS NULL OR a.organization_id = p_org_id))
      OR (v_scope='platform_users' AND po.is_personal IS TRUE
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
    SELECT d.*, false, 'org'::text FROM workflow.definition d
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
    SELECT d.*, false, 'public'::text FROM workflow.definition d
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid
      AND d.card_visibility='public'
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

CREATE OR REPLACE FUNCTION public.cvx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'last_activity'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, conversation_type text, origin_class text, source_app text, source_feature text, status text, message_count integer, is_favorite boolean, is_archived boolean, visibility text, provider text, provider_session_id text, workspace_name text, provider_account text, title_source text, category text, fidelity text, binding_status text, binding_origin text, binding_last_seen_at timestamp with time zone, organization_id uuid, organization_name text, owner_email text, created_by uuid, initial_agent_id uuid, created_at timestamp with time zone, updated_at timestamp with time zone, last_activity_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('conversation')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'last_activity'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- ONE rule for "is this search deep" (public.cvx_search_is_deep), shared
  -- with cvx_list_scope_counts. A caller that already ran the probe hands the
  -- hit set in as p_filters->'__deep_hits' and is deep by definition. The
  -- pass itself is the definer probe public.cvx_deep_hits — under this
  -- function's invoker policy the trigram index cannot be used (ILIKE is not
  -- leakproof) and the page timed out.
  v_deep boolean := public.cvx_search_is_deep(v_search, p_deep)
    OR (coalesce(p_filters, '{}'::jsonb) ? '__deep_hits');
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cvx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared') THEN
    RAISE EXCEPTION 'cvx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('last_activity','updated','created','title','conversation_type',
                    'origin_class','source_app','source_feature','message_count',
                    'provider','workspace_name','provider_account','title_source',
                    'category','fidelity','binding_status','binding_last_seen_at',
                    'organization_name','owner_email','visibility','favorite',
                    'archived') THEN
    v_sort := 'last_activity';
  END IF;

  RETURN QUERY
  WITH deep_hits AS (
    -- ONE indexed pass over message bodies, hashed once, probed per row.
    -- A caller that ran the probe already (cvx_list_scope_counts, fifteen
    -- calls per request) hands the set in as p_filters->'__deep_hits';
    -- otherwise the definer probe runs here. Never a correlated EXISTS: that
    -- is a scan per conversation, twice.
    SELECT (x)::uuid AS conversation_id
    FROM jsonb_array_elements_text(v_f->'__deep_hits') AS x
    WHERE v_f ? '__deep_hits'
    UNION ALL
    SELECT h AS conversation_id
    FROM public.cvx_deep_hits(v_search) AS h
    WHERE NOT (v_f ? '__deep_hits') AND v_deep AND v_search IS NOT NULL
  ),
  scoped AS (
    SELECT c.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM chat.conversation c
    WHERE v_scope='mine' AND c.created_by = v_uid
    UNION ALL
    SELECT c.*, false, 'org'::text FROM chat.conversation c
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR c.organization_id = p_org_id) AND c.organization_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND c.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (c.id) c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND c.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='conversation'
        AND p2.resource_id=c.id AND p2.granted_to_user_id=v_uid)
  ),
  joined AS (
    SELECT
      s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      cs.provider AS s_provider,
      cs.provider_session_id AS s_provider_session_id,
      cs.metadata->>'workspace_name' AS s_workspace_name,
      public.cvx_provider_account_display(cs.metadata) AS s_provider_account,
      cs.metadata->>'title_source' AS s_title_source,
      coalesce(
        s.metadata->'coding_session_bridge'->>'category',
        cs.metadata->>'provider_category'
      ) AS s_category,
      cs.fidelity AS s_fidelity,
      cs.status AS s_binding_status,
      cs.origin AS s_binding_origin,
      cs.last_seen_at AS s_binding_last_seen_at,
      coalesce(ues.is_favorite, false) AS s_is_favorite,
      public.cvx_audience(cs.provider, s.source_app, s.source_feature, s.origin_class, s.conversation_type)
        AS s_audience
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    LEFT JOIN platform.user_entity_state ues
      ON ues.user_id = v_uid
     AND ues.entity_type = 'conversation'
     AND ues.entity_id = s.id
    LEFT JOIN LATERAL (
      SELECT b.provider, b.provider_session_id, b.metadata, b.fidelity,
             b.status, b.origin, b.last_seen_at
      FROM chat.coding_session b
      WHERE b.conversation_id = s.id AND b.deleted_at IS NULL
      ORDER BY b.last_seen_at DESC NULLS LAST, b.created_at DESC, b.id
      LIMIT 1
    ) cs ON true
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND j.is_ephemeral IS NOT TRUE
      AND (CASE lower(coalesce(p_archived,'active'))
             WHEN 'archived' THEN j.status = 'archived'
             WHEN 'all' THEN true
             ELSE j.status IS DISTINCT FROM 'archived' END)
      -- THE SEARCH FILTER ADMITS EVERY FIELD cvx_search_score RANKS. A field
      -- the scorer ranks but the filter drops scores 100000 and returns
      -- nothing — that is how a pasted conversation id found no row until
      -- 2026-09-18. Keep this list and the scorer's in lockstep.
      AND (v_search IS NULL
        OR coalesce(j.title,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.description,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.s_workspace_name,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.source_feature,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.source_app,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.s_provider_account,'') ILIKE '%'||v_search||'%'
        OR j.id::text ILIKE '%'||v_search||'%'
        -- EVERY live binding, not only the newest: a resumed Claude Code
        -- session carries several provider ids and each is a name someone
        -- was handed.
        OR EXISTS (
              SELECT 1 FROM chat.coding_session b
              WHERE b.conversation_id = j.id AND b.deleted_at IS NULL
                AND coalesce(b.provider_session_id,'') ILIKE '%'||v_search||'%')
        OR j.id IN (SELECT dh.conversation_id FROM deep_hits dh))
      AND (NOT v_f ? 'audience'
           OR j.s_audience IN (SELECT jsonb_array_elements_text(v_f->'audience'->'values')))
      AND (NOT v_f ? 'title' OR coalesce(j.title,'') ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'provider_session_id'
           OR coalesce(j.s_provider_session_id,'') ILIKE '%'||(v_f->'provider_session_id'->>'value')||'%')
      AND (NOT v_f ? 'organization_name'
           OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'conversation_type'
           OR j.conversation_type IN (SELECT jsonb_array_elements_text(v_f->'conversation_type'->'values')))
      AND (NOT v_f ? 'origin_class'
           OR j.origin_class IN (SELECT jsonb_array_elements_text(v_f->'origin_class'->'values')))
      AND (NOT v_f ? 'source_app'
           OR coalesce(nullif(j.source_app,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'source_app'->'values')))
      AND (NOT v_f ? 'source_feature'
           OR coalesce(nullif(j.source_feature,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'source_feature'->'values')))
      AND (NOT v_f ? 'provider'
           OR coalesce(j.s_provider,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'provider'->'values')))
      AND (NOT v_f ? 'workspace_name'
           OR coalesce(j.s_workspace_name,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'workspace_name'->'values')))
      AND (NOT v_f ? 'provider_account'
           OR coalesce(j.s_provider_account,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'provider_account'->'values')))
      AND (NOT v_f ? 'title_source'
           OR coalesce(j.s_title_source,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'title_source'->'values')))
      AND (NOT v_f ? 'category'
           OR coalesce(j.s_category,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'fidelity'
           OR coalesce(j.s_fidelity,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'fidelity'->'values')))
      AND (NOT v_f ? 'binding_status'
           OR coalesce(j.s_binding_status,'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'binding_status'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'owner_email'
           OR coalesce(nullif(j.s_owner_email,''),'__none__')
              IN (SELECT jsonb_array_elements_text(v_f->'owner_email'->'values')))
      AND (NOT v_f ? 'access_level'
           OR j.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')))
      AND (NOT v_f ? 'message_count'
           OR public.cvx_size_band(j.message_count)
              IN (SELECT jsonb_array_elements_text(v_f->'message_count'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'binding_last_seen_at'
           OR j.s_binding_last_seen_at >= public.agx_since_bucket(v_f->'binding_last_seen_at'->'values'->>0))
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.s_is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR (j.status = 'archived') IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  activity AS (
    SELECT
      f.*,
      greatest(
        coalesce(lm.last_at, f.created_at),
        coalesce(f.s_binding_last_seen_at, f.created_at),
        f.created_at
      ) AS s_last_activity
    FROM filtered f
    LEFT JOIN LATERAL (
      SELECT m.created_at AS last_at
      FROM chat.message m
      WHERE m.conversation_id = f.id
        AND m.deleted_at IS NULL
        AND m.is_visible_to_user = true
      ORDER BY m.created_at DESC
      LIMIT 1
    ) lm ON true
  ),
  activity_filtered AS (
    SELECT a.* FROM activity a
    WHERE (NOT v_f ? 'last_activity'
           OR a.s_last_activity >= public.agx_since_bucket(v_f->'last_activity'->'values'->>0))
  ),
  scored AS (
    SELECT f.*, public.cvx_search_score(
      v_search, f.id, f.title, f.description, f.s_workspace_name,
      f.source_feature, f.source_app, f.s_provider_account,
      f.s_provider_session_id,
      (f.id IN (SELECT dh.conversation_id FROM deep_hits dh))
    ) AS s_score
    FROM activity_filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.id, c.title, c.conversation_type, c.origin_class, c.source_app,
    c.source_feature, c.status, c.message_count, c.s_is_favorite,
    (c.status = 'archived'), c.visibility::text,
    c.s_provider, c.s_provider_session_id, c.s_workspace_name,
    c.s_provider_account, c.s_title_source, c.s_category, c.s_fidelity,
    c.s_binding_status, c.s_binding_origin, c.s_binding_last_seen_at,
    c.organization_id, c.s_org_name, c.s_owner_email, c.created_by,
    c.initial_agent_id, c.created_at, c.updated_at, c.s_last_activity,
    c.s_is_owner, c.s_access, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN c.s_is_favorite END DESC NULLS LAST,
    CASE WHEN v_sort='last_activity' AND v_dir='desc' THEN c.s_last_activity END DESC,
    CASE WHEN v_sort='last_activity' AND v_dir='asc' THEN c.s_last_activity END ASC,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.created_at END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.created_at END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(coalesce(c.title,'')) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(coalesce(c.title,'')) END ASC,
    CASE WHEN v_sort='conversation_type' AND v_dir='desc' THEN c.conversation_type END DESC,
    CASE WHEN v_sort='conversation_type' AND v_dir='asc' THEN c.conversation_type END ASC,
    CASE WHEN v_sort='origin_class' AND v_dir='desc' THEN c.origin_class END DESC,
    CASE WHEN v_sort='origin_class' AND v_dir='asc' THEN c.origin_class END ASC,
    CASE WHEN v_sort='source_app' AND v_dir='desc' THEN lower(coalesce(c.source_app,'')) END DESC,
    CASE WHEN v_sort='source_app' AND v_dir='asc' THEN lower(coalesce(c.source_app,'')) END ASC,
    CASE WHEN v_sort='source_feature' AND v_dir='desc' THEN lower(coalesce(c.source_feature,'')) END DESC,
    CASE WHEN v_sort='source_feature' AND v_dir='asc' THEN lower(coalesce(c.source_feature,'')) END ASC,
    CASE WHEN v_sort='message_count' AND v_dir='desc' THEN c.message_count END DESC,
    CASE WHEN v_sort='message_count' AND v_dir='asc' THEN c.message_count END ASC,
    CASE WHEN v_sort='provider' AND v_dir='desc' THEN lower(coalesce(c.s_provider,'')) END DESC,
    CASE WHEN v_sort='provider' AND v_dir='asc' THEN lower(coalesce(c.s_provider,'')) END ASC,
    CASE WHEN v_sort='workspace_name' AND v_dir='desc' THEN lower(coalesce(c.s_workspace_name,'')) END DESC,
    CASE WHEN v_sort='workspace_name' AND v_dir='asc' THEN lower(coalesce(c.s_workspace_name,'')) END ASC,
    CASE WHEN v_sort='provider_account' AND v_dir='desc' THEN lower(coalesce(c.s_provider_account,'')) END DESC,
    CASE WHEN v_sort='provider_account' AND v_dir='asc' THEN lower(coalesce(c.s_provider_account,'')) END ASC,
    CASE WHEN v_sort='title_source' AND v_dir='desc' THEN lower(coalesce(c.s_title_source,'')) END DESC,
    CASE WHEN v_sort='title_source' AND v_dir='asc' THEN lower(coalesce(c.s_title_source,'')) END ASC,
    CASE WHEN v_sort='category' AND v_dir='desc' THEN lower(coalesce(c.s_category,'')) END DESC,
    CASE WHEN v_sort='category' AND v_dir='asc' THEN lower(coalesce(c.s_category,'')) END ASC,
    CASE WHEN v_sort='fidelity' AND v_dir='desc' THEN lower(coalesce(c.s_fidelity,'')) END DESC,
    CASE WHEN v_sort='fidelity' AND v_dir='asc' THEN lower(coalesce(c.s_fidelity,'')) END ASC,
    CASE WHEN v_sort='binding_status' AND v_dir='desc' THEN lower(coalesce(c.s_binding_status,'')) END DESC,
    CASE WHEN v_sort='binding_status' AND v_dir='asc' THEN lower(coalesce(c.s_binding_status,'')) END ASC,
    CASE WHEN v_sort='binding_last_seen_at' AND v_dir='desc' THEN c.s_binding_last_seen_at END DESC NULLS LAST,
    CASE WHEN v_sort='binding_last_seen_at' AND v_dir='asc' THEN c.s_binding_last_seen_at END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN lower(c.visibility::text) END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN lower(c.visibility::text) END ASC,
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.s_is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.s_is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN (c.status='archived') END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN (c.status='archived') END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ivw_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, vision_statement text, stage text, current_round integer, open_questions bigint, visibility text, user_id uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('interview_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'ivw_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'ivw_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','stage','current_round',
                    'open_questions','organization_name','owner_email','visibility') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT s.id AS u_id,
      coalesce(nullif(s.title,''),'Untitled interview') AS u_title,
      coalesce(s.vision_statement,'') AS u_vision,
      s.stage::text AS u_stage,
      s.current_round AS u_round,
      (SELECT count(*) FROM interview.question q
        WHERE q.session_id = s.id
          AND q.state IN ('open','partially_answered','dodged')) AS u_open_q,
      s.visibility::text AS u_visibility,
      s.created_by AS u_user_id,
      s.organization_id AS u_org_id,
      s.created_at AS u_created,
      s.updated_at AS u_updated
    FROM interview.session s
    WHERE s.deleted_at IS NULL
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, false, 'org'::text FROM unified u
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = 'interview_session'
      AND perm.resource_id = u.u_id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = 'interview_session'
        AND perm.resource_id = u.u_id
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = 'interview_session'
            AND p2.resource_id = u.u_id
            AND p2.granted_to_user_id = v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_vision ILIKE '%'||v_search||'%')
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'vision_statement' OR j.u_vision ILIKE '%'||(v_f->'vision_statement'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'stage'
           OR j.u_stage IN (SELECT jsonb_array_elements_text(v_f->'stage'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.ivw_search_score(
        v_search, f.u_id, f.u_title, f.u_vision, f.u_stage, f.s_owner_email)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_title, c.u_vision, c.u_stage, c.u_round, c.u_open_q,
    c.u_visibility, c.u_user_id, c.u_org_id, c.s_org_name,
    c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='stage' AND v_dir='desc' THEN c.u_stage END DESC,
    CASE WHEN v_sort='stage' AND v_dir='asc' THEN c.u_stage END ASC,
    CASE WHEN v_sort='current_round' AND v_dir='desc' THEN c.u_round END DESC,
    CASE WHEN v_sort='current_round' AND v_dir='asc' THEN c.u_round END ASC,
    CASE WHEN v_sort='open_questions' AND v_dir='desc' THEN c.u_open_q END DESC,
    CASE WHEN v_sort='open_questions' AND v_dir='asc' THEN c.u_open_q END ASC,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, title text, description text, status text, folder_name text, tags text[], duration_seconds numeric, word_count integer, is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer, visibility text, created_by uuid, organization_id uuid, organization_name text, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('studio_session')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'trx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'trx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','description','kind','status',
                    'folder_name','tags','duration','word_count',
                    'organization_name','owner_email','visibility','draft') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT t.id AS u_id, 'transcript'::text AS u_kind,
      coalesce(nullif(t.title,''),'Untitled transcript') AS u_title,
      coalesce(t.description,'') AS u_description,
      CASE WHEN t.is_draft THEN 'draft' ELSE 'final' END AS u_status,
      coalesce(nullif(t.folder_name,''),'Transcripts') AS u_folder,
      coalesce(t.tags, ARRAY[]::text[]) AS u_tags,
      CASE WHEN t.metadata->>'duration' ~ '^[0-9]+\.?[0-9]*$'
           THEN (t.metadata->>'duration')::numeric END AS u_duration,
      CASE WHEN t.metadata->>'wordCount' ~ '^[0-9]+$'
           THEN (t.metadata->>'wordCount')::integer END AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      t.visibility::text AS u_visibility, t.created_by AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit
    FROM transcripts.transcripts t
    WHERE t.deleted_at IS NULL
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      s.visibility::text, s.created_by, s.organization_id, s.created_at, s.updated_at,
      false
    FROM transcripts.studio_sessions s
    WHERE s.deleted_at IS NULL
    UNION ALL
    SELECT r.id, 'unsorted'::text,
      'Recording ' || (r.segment_index + 1)::text, ''::text,
      'unsorted'::text,
      NULL::text, ARRAY[]::text[],
      CASE WHEN r.ended_at IS NOT NULL AND r.ended_at > r.started_at
           THEN extract(epoch FROM (r.ended_at - r.started_at)) END,
      NULL::integer, false,
      r.session_id, NULL::uuid, r.segment_index,
      coalesce(ps.visibility::text,'personal'), r.user_id,
      coalesce(r.organization_id, ps.organization_id),
      r.started_at, coalesce(r.detached_at, r.updated_at, r.started_at),
      false
    FROM transcripts.studio_recording_segments r
    LEFT JOIN transcripts.studio_sessions ps ON ps.id = r.session_id
    WHERE r.detached_at IS NOT NULL AND r.archived_at IS NULL
      AND (ps.id IS NULL OR ps.deleted_at IS NULL)
  ),
  scoped AS (
    SELECT u.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM unified u WHERE v_scope='mine' AND u.u_user_id = v_uid
    UNION ALL
    SELECT u.*, false, 'org'::text FROM unified u
    WHERE v_scope='orgs' AND (p_org_id IS NULL OR u.u_org_id = p_org_id) AND u.u_org_id IN (SELECT iam.my_orgs())
    UNION ALL
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
      AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT * FROM (
      SELECT DISTINCT ON (u.u_id) u.*, false AS s_is_owner2, perm.permission_level::text AS s_access2
      FROM unified u
      JOIN iam.permissions perm
        ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
        AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
        AND perm.granted_to_organization_id IN (
          SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
      WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
        AND NOT EXISTS (SELECT 1 FROM iam.permissions p2
          WHERE p2.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
            AND p2.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
            AND p2.granted_to_user_id=v_uid)
      ORDER BY u.u_id, perm.permission_level::text
    ) org_shared
    UNION ALL
    SELECT u.*, false, 'public'::text FROM unified u
    WHERE v_scope='public' AND u.u_user_id IS DISTINCT FROM v_uid AND u.u_visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, au.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.u_org_id
    LEFT JOIN platform.visible_user_identity au ON au.id = s.u_user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE (v_search IS NULL
        OR j.u_title ILIKE '%'||v_search||'%'
        OR j.u_description ILIKE '%'||v_search||'%'
        OR coalesce(j.u_folder,'') ILIKE '%'||v_search||'%'
        OR EXISTS (SELECT 1 FROM unnest(j.u_tags) t WHERE t ILIKE '%'||v_search||'%')
        OR j.u_deep_hit)
      AND (NOT v_f ? 'title' OR j.u_title ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'description' OR j.u_description ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'kind'
           OR j.u_kind IN (SELECT jsonb_array_elements_text(v_f->'kind'->'values')))
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.u_status,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'folder_name'
           OR (j.u_kind = 'transcript'
               AND coalesce(nullif(j.u_folder,''),'__none__') IN (
                     SELECT jsonb_array_elements_text(v_f->'folder_name'->'values'))))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'tags'
           OR (j.u_kind = 'transcript'
               AND ((j.u_tags && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
                    OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
                        AND coalesce(array_length(j.u_tags,1),0) = 0))))
      AND (NOT v_f ? 'duration'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'duration'->'values') b
                      WHERE public.trx_duration_matches(j.u_duration, b)))
      AND (NOT v_f ? 'word_count'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'word_count'->'values') b
                      WHERE public.trx_words_matches(j.u_words, b)))
      AND (NOT v_f ? 'updated'
           OR j.u_updated >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.u_created >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'draft'
           OR j.u_draft IS NOT DISTINCT FROM (v_f->'draft'->>'value')::boolean)
  ),
  scored AS (
    SELECT f.*, CASE WHEN v_search IS NOT NULL AND coalesce(p_limit, 25) > 1
      THEN public.trx_search_score(
        v_search, f.u_id, f.u_title, f.u_description, f.u_kind, f.u_folder,
        f.u_tags, f.s_owner_email, f.u_deep_hit)
      ELSE 0 END AS s_score
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT c.u_id, c.u_kind, c.u_title, c.u_description, c.u_status, c.u_folder,
    c.u_tags, c.u_duration, c.u_words, c.u_draft, c.u_session_id,
    c.u_transcript_id, c.u_segment_index, c.u_visibility, c.u_user_id,
    c.u_org_id, c.s_org_name, c.u_created, c.u_updated,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
    CASE WHEN v_sort='description' AND v_dir='desc' THEN lower(coalesce(c.u_description,'')) END DESC,
    CASE WHEN v_sort='description' AND v_dir='asc' THEN lower(coalesce(c.u_description,'')) END ASC,
    CASE WHEN v_sort='kind' AND v_dir='desc' THEN c.u_kind END DESC,
    CASE WHEN v_sort='kind' AND v_dir='asc' THEN c.u_kind END ASC,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.u_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.u_status,'')) END ASC,
    CASE WHEN v_sort='folder_name' AND v_dir='desc' THEN lower(coalesce(c.u_folder,'')) END DESC,
    CASE WHEN v_sort='folder_name' AND v_dir='asc' THEN lower(coalesce(c.u_folder,'')) END ASC,
    CASE WHEN v_sort='tags' AND v_dir='desc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END DESC,
    CASE WHEN v_sort='tags' AND v_dir='asc' THEN lower(coalesce(array_to_string(c.u_tags,','),'')) END ASC,
    CASE WHEN v_sort='duration' AND v_dir='desc' THEN c.u_duration END DESC NULLS LAST,
    CASE WHEN v_sort='duration' AND v_dir='asc' THEN c.u_duration END ASC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='desc' THEN c.u_words END DESC NULLS LAST,
    CASE WHEN v_sort='word_count' AND v_dir='asc' THEN c.u_words END ASC NULLS LAST,
    CASE WHEN v_sort='organization_name' AND v_dir='desc' THEN lower(coalesce(c.s_org_name,'')) END DESC,
    CASE WHEN v_sort='organization_name' AND v_dir='asc' THEN lower(coalesce(c.s_org_name,'')) END ASC,
    CASE WHEN v_sort='owner_email' AND v_dir='desc' THEN lower(coalesce(c.s_owner_email,'')) END DESC,
    CASE WHEN v_sort='owner_email' AND v_dir='asc' THEN lower(coalesce(c.s_owner_email,'')) END ASC,
    CASE WHEN v_sort='visibility' AND v_dir='desc' THEN c.u_visibility END DESC,
    CASE WHEN v_sort='visibility' AND v_dir='asc' THEN c.u_visibility END ASC,
    CASE WHEN v_sort='draft' AND v_dir='desc' THEN c.u_draft END DESC,
    CASE WHEN v_sort='draft' AND v_dir='asc' THEN c.u_draft END ASC,
    c.u_id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(target_id uuid, site_id uuid, site_name text, site_domain text, brand_id uuid, keyword_id uuid, keyword text, engine text, device text, search_type text, tracking_label text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, organization_id uuid, organization_name text, owner_email text, is_owner boolean, access_level text, latest_position integer, previous_position integer, movement integer, best_position integer, last_checked_at timestamp with time zone, history_observed_at timestamp with time zone[], history_organic_rank integer[], total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('seo_rank_target')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'keyword', 'site_name', 'tracking_label', 'device', 'latest_position',
    'movement', 'best_position', 'last_checked_at', 'is_active', 'created_at'
  ) THEN
    v_sort := 'created_at';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id AS b_target_id,
      coalesce(t.site_id, target_page.site_id) AS b_site_id,
      s.name AS b_site_name,
      s.domain AS b_site_domain,
      s.brand_id AS b_brand_id,
      s.visibility AS b_site_visibility,
      CASE
        WHEN s.id IS NOT NULL
        THEN iam.has_access('web_site', s.id, 'viewer')
        ELSE false
      END AS b_site_accessible,
      t.target_page_id AS b_target_page_id,
      t.keyword_id AS b_keyword_id,
      k.phrase AS b_keyword,
      t.engine AS b_engine,
      t.device AS b_device,
      t.search_type AS b_search_type,
      public.seo_rank_tracking_label(t.engine, t.search_type) AS b_tracking_label,
      t.is_active AS b_is_active,
      t.created_at AS b_created_at,
      t.updated_at AS b_updated_at,
      t.created_by AS b_created_by,
      t.organization_id AS b_org_id,
      o.name AS b_org_name,
      au.email::text AS b_owner_email
    FROM seo.rank_target t
    JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
    LEFT JOIN web.page target_page
      ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
    LEFT JOIN web.site s
      ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
    LEFT JOIN iam.organizations o ON o.id = t.organization_id
    LEFT JOIN platform.visible_user_identity au ON au.id = t.created_by
    WHERE t.deleted_at IS NULL
  ),
  scoped AS (
    SELECT b.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM base b
    WHERE v_scope = 'mine' AND b.b_created_by = v_uid

    UNION ALL

    SELECT b.*, false, 'org'::text
    FROM base b
    WHERE v_scope = 'orgs'
      AND (p_org_id IS NULL OR b.b_org_id = p_org_id) AND b.b_org_id IN (SELECT iam.my_orgs())

    UNION ALL

    SELECT b.*, false, 'shared'::text
    FROM base b
    WHERE v_scope = 'shared'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND (
        public.has_permission('seo_rank_target', b.b_target_id, 'viewer')
        OR (b.b_target_page_id IS NOT NULL AND public.has_permission('web_page', b.b_target_page_id, 'viewer'
        ))
        OR (b.b_site_id IS NOT NULL AND public.has_permission('web_site', b.b_site_id, 'viewer'
        ))
        OR (b.b_brand_id IS NOT NULL AND public.has_permission('web_brand', b.b_brand_id, 'viewer'
        ))
      )

    UNION ALL

    SELECT b.*, false, 'public'::text
    FROM base b
    WHERE v_scope = 'public'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_site_visibility = 'public'::platform.visibility
  ),
  enriched AS (
    SELECT
      s.*,
      obs.latest_position AS e_latest_position,
      obs.previous_position AS e_previous_position,
      CASE
        WHEN obs.latest_position IS NOT NULL AND obs.previous_position IS NOT NULL
        THEN obs.previous_position - obs.latest_position
      END AS e_movement,
      obs.best_position AS e_best_position,
      obs.last_checked_at AS e_last_checked_at
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[1] AS latest_position,
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[2] AS previous_position,
        min(ro.organic_rank) FILTER (WHERE ro.organic_rank IS NOT NULL) AS best_position,
        max(ro.observed_at) AS last_checked_at
      FROM seo.rank_observation ro
      WHERE ro.rank_target_id = s.b_target_id
        AND ro.observed_at >= now() - interval '90 days'
    ) obs ON true
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      v_search IS NULL
      OR e.b_keyword ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_domain, '') ILIKE '%' || v_search || '%'
      OR e.b_tracking_label ILIKE '%' || v_search || '%'
    )
      AND (NOT v_f ? 'keyword'
        OR e.b_keyword ILIKE '%' || (v_f->'keyword'->>'value') || '%')
      AND (NOT v_f ? 'site_name'
        OR coalesce(e.b_site_name, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%'
        OR coalesce(e.b_site_domain, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%')
      AND (NOT v_f ? 'tracking_label' OR e.b_tracking_label IN (
        SELECT jsonb_array_elements_text(v_f->'tracking_label'->'values')
      ))
      AND (NOT v_f ? 'device' OR e.b_device IN (
        SELECT jsonb_array_elements_text(v_f->'device'->'values')
      ))
      AND (NOT v_f ? 'latest_position' OR public.seo_rank_position_bucket(e.e_latest_position) IN (
        SELECT jsonb_array_elements_text(v_f->'latest_position'->'values')
      ))
      AND (NOT v_f ? 'movement' OR CASE
        WHEN e.e_movement IS NULL THEN 'unknown'
        WHEN e.e_movement > 0 THEN 'improved'
        WHEN e.e_movement < 0 THEN 'declined'
        ELSE 'unchanged'
      END IN (SELECT jsonb_array_elements_text(v_f->'movement'->'values')))
      AND (NOT v_f ? 'best_position' OR public.seo_rank_position_bucket(e.e_best_position) IN (
        SELECT jsonb_array_elements_text(v_f->'best_position'->'values')
      ))
      AND (NOT v_f ? 'last_checked_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'last_checked_at'->'values') bucket
        WHERE CASE bucket
          WHEN 'never' THEN e.e_last_checked_at IS NULL
          ELSE e.e_last_checked_at >= public.agx_since_bucket(bucket)
        END
      ))
      AND (NOT v_f ? 'is_active'
        OR e.b_is_active IS NOT DISTINCT FROM (v_f->'is_active'->>'value')::boolean)
      AND (NOT v_f ? 'created_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'created_at'->'values') bucket
        WHERE e.b_created_at >= public.agx_since_bucket(bucket)
      ))
  ),
  scored AS (
    SELECT f.*, CASE
      WHEN v_search IS NULL THEN 0
      WHEN lower(f.b_keyword) = lower(v_search) THEN 10000
      WHEN lower(f.b_keyword) LIKE lower(v_search) || '%' THEN 5000
      WHEN f.b_keyword ILIKE '%' || v_search || '%' THEN 3000
      WHEN coalesce(f.b_site_name, '') ILIKE '%' || v_search || '%' THEN 1000
      WHEN coalesce(f.b_site_domain, '') ILIKE '%' || v_search || '%' THEN 800
      ELSE 100
    END AS s_search_score
    FROM filtered f
  ),
  counted AS (
    SELECT s.*, count(*) OVER () AS s_total_count
    FROM scored s
  ),
  page_rows AS (
    SELECT c.*
    FROM counted c
    ORDER BY
      CASE WHEN v_search IS NOT NULL THEN c.s_search_score END DESC NULLS LAST,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(c.b_keyword) END DESC,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(c.b_keyword) END ASC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(c.b_site_name, '')) END DESC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(c.b_site_name, '')) END ASC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(c.b_tracking_label) END DESC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(c.b_tracking_label) END ASC,
      CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(c.b_device) END DESC,
      CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(c.b_device) END ASC,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN c.e_latest_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN c.e_latest_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN c.e_movement END DESC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN c.e_movement END ASC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN c.e_best_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN c.e_best_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN c.e_last_checked_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN c.e_last_checked_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN c.b_is_active END DESC,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN c.b_is_active END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN c.b_created_at END DESC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN c.b_created_at END ASC,
      c.b_target_id
    LIMIT greatest(coalesce(p_limit, 25), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    p.b_target_id,
    CASE WHEN p.b_site_accessible THEN p.b_site_id END,
    CASE WHEN p.b_site_accessible THEN p.b_site_name END,
    CASE WHEN p.b_site_accessible THEN p.b_site_domain END,
    CASE WHEN p.b_site_accessible THEN p.b_brand_id END,
    p.b_keyword_id,
    p.b_keyword,
    p.b_engine,
    p.b_device,
    p.b_search_type,
    p.b_tracking_label,
    p.b_is_active,
    p.b_created_at,
    p.b_updated_at,
    p.b_created_by,
    p.b_org_id,
    p.b_org_name,
    p.b_owner_email,
    p.s_is_owner,
    p.s_access,
    p.e_latest_position,
    p.e_previous_position,
    p.e_movement,
    p.e_best_position,
    p.e_last_checked_at,
    coalesce(history.observed_at, ARRAY[]::timestamptz[]),
    coalesce(history.organic_rank, ARRAY[]::integer[]),
    p.s_total_count
  FROM page_rows p
  LEFT JOIN LATERAL (
    SELECT
      array_agg(ro.observed_at ORDER BY ro.observed_at ASC, ro.id ASC) AS observed_at,
      array_agg(ro.organic_rank ORDER BY ro.observed_at ASC, ro.id ASC) AS organic_rank
    FROM seo.rank_observation ro
    WHERE ro.rank_target_id = p.b_target_id
      AND ro.observed_at >= now() - interval '90 days'
  ) history ON true
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN p.s_search_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(p.b_keyword) END DESC,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(p.b_keyword) END ASC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(p.b_site_name, '')) END DESC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(p.b_site_name, '')) END ASC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(p.b_tracking_label) END DESC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(p.b_tracking_label) END ASC,
    CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(p.b_device) END DESC,
    CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(p.b_device) END ASC,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN p.e_latest_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN p.e_latest_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN p.e_movement END DESC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN p.e_movement END ASC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN p.e_best_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN p.e_best_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN p.e_last_checked_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN p.e_last_checked_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN p.b_is_active END DESC,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN p.b_is_active END ASC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN p.b_created_at END DESC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN p.b_created_at END ASC,
    p.b_target_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, kind text, label text, family text, authoring_owner text, is_active boolean, has_component boolean, visibility text, origin text, organization_id uuid, organization_name text, created_by uuid, owner_email text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('content_ir_kind')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'shx_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'shx_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'label', 'kind', 'family', 'authoring_owner', 'status', 'component',
    'visibility', 'origin', 'organization_name', 'owner_email',
    'access_level', 'version', 'created', 'updated'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT kd.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'mine' AND kd.created_by = v_uid

    UNION ALL

    SELECT kd.*, false, 'org'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'orgs'
      AND (p_org_id IS NULL OR kd.organization_id = p_org_id) AND kd.organization_id IN (SELECT iam.my_orgs())

    UNION ALL

    SELECT kd.*, false, permission.permission_level::text
    FROM content_ir.kind_definition kd
    JOIN iam.permissions permission
      ON permission.resource_type = 'content_ir_kind'
     AND permission.resource_id = kd.id
     AND permission.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND kd.created_by IS DISTINCT FROM v_uid

    UNION ALL

    SELECT org_shared.*
    FROM (
      SELECT DISTINCT ON (kd.id)
        kd.*, false AS s_is_owner, permission.permission_level::text AS s_access
      FROM content_ir.kind_definition kd
      JOIN iam.permissions permission
        ON permission.resource_type = 'content_ir_kind'
       AND permission.resource_id = kd.id
       AND permission.granted_to_organization_id IN (
         SELECT om.organization_id
         FROM iam.organization_member om
         WHERE om.user_id = v_uid
       )
      WHERE v_scope = 'shared'
        AND kd.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (
          SELECT 1
          FROM iam.permissions direct_permission
          WHERE direct_permission.resource_type = 'content_ir_kind'
            AND direct_permission.resource_id = kd.id
            AND direct_permission.granted_to_user_id = v_uid
        )
      ORDER BY kd.id, permission.permission_level::text
    ) org_shared

    UNION ALL

    SELECT kd.*, false, 'public'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'public'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.visibility = 'public'
  ),
  enriched AS (
    SELECT
      scoped.*,
      organization.name AS s_org_name,
      organization.is_personal AS s_org_is_personal,
      owner_user.email::text AS s_owner_email,
      EXISTS (
        SELECT 1
        FROM content_ir.kind_component component
        WHERE component.kind_definition_id = scoped.id
          AND component.is_active
          AND component.deleted_at IS NULL
          AND component.role = 'output'
          AND component.component_key <> 'generic_structured'
      ) AS s_has_component,
      CASE
        WHEN scoped.organization_id = v_system_org THEN 'system'
        WHEN organization.is_personal IS TRUE THEN 'personal'
        ELSE 'organization'
      END AS s_origin,
      CASE
        WHEN jsonb_typeof(scoped.metadata -> 'family') = 'string'
          THEN scoped.metadata ->> 'family'
        ELSE NULL
      END AS s_family
    FROM scoped
    LEFT JOIN iam.organizations organization ON organization.id = scoped.organization_id
    LEFT JOIN platform.visible_user_identity owner_user ON owner_user.id = scoped.created_by
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE enriched.deleted_at IS NULL
      AND enriched.is_contract_artifact IS NOT TRUE
      AND (
        v_search IS NULL
        OR enriched.label ILIKE '%' || v_search || '%'
        OR enriched.kind ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_family, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_org_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_owner_email, '') ILIKE '%' || v_search || '%'
      )
      AND (NOT v_filters ? 'label' OR enriched.label ILIKE '%' || (v_filters -> 'label' ->> 'value') || '%')
      AND (NOT v_filters ? 'kind' OR enriched.kind ILIKE '%' || (v_filters -> 'kind' ->> 'value') || '%')
      AND (NOT v_filters ? 'organization_name' OR coalesce(enriched.s_org_name, '') ILIKE '%' || (v_filters -> 'organization_name' ->> 'value') || '%')
      AND (NOT v_filters ? 'owner_email' OR coalesce(enriched.s_owner_email, '') ILIKE '%' || (v_filters -> 'owner_email' ->> 'value') || '%')
      AND (NOT v_filters ? 'family' OR coalesce(enriched.s_family, '__none__') IN (SELECT jsonb_array_elements_text(v_filters -> 'family' -> 'values')))
      AND (NOT v_filters ? 'authoring_owner' OR enriched.authoring_owner IN (SELECT jsonb_array_elements_text(v_filters -> 'authoring_owner' -> 'values')))
      AND (NOT v_filters ? 'status' OR (CASE WHEN enriched.is_active THEN 'active' ELSE 'inactive' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'status' -> 'values')))
      AND (NOT v_filters ? 'component' OR (CASE WHEN enriched.s_has_component THEN 'custom' ELSE 'generic' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'component' -> 'values')))
      AND (NOT v_filters ? 'visibility' OR enriched.visibility::text IN (SELECT jsonb_array_elements_text(v_filters -> 'visibility' -> 'values')))
      AND (NOT v_filters ? 'origin' OR enriched.s_origin IN (SELECT jsonb_array_elements_text(v_filters -> 'origin' -> 'values')))
      AND (NOT v_filters ? 'access_level' OR enriched.s_access IN (SELECT jsonb_array_elements_text(v_filters -> 'access_level' -> 'values')))
      AND (NOT v_filters ? 'version' OR enriched.version::text IN (SELECT jsonb_array_elements_text(v_filters -> 'version' -> 'values')))
      AND (NOT v_filters ? 'created' OR enriched.created_at >= public.shx_since_bucket(v_filters -> 'created' -> 'values' ->> 0))
      AND (NOT v_filters ? 'updated' OR enriched.updated_at >= public.shx_since_bucket(v_filters -> 'updated' -> 'values' ->> 0))
  ),
  scored AS (
    SELECT filtered.*, public.shx_search_score(
      v_search,
      filtered.label,
      filtered.kind,
      filtered.s_family,
      filtered.s_owner_email,
      filtered.s_org_name
    ) AS s_score
    FROM filtered
  ),
  counted AS (
    SELECT scored.*, count(*) OVER () AS s_total
    FROM scored
  )
  SELECT
    counted.id,
    counted.kind,
    counted.label,
    counted.s_family,
    counted.authoring_owner,
    counted.is_active,
    counted.s_has_component,
    counted.visibility::text,
    counted.s_origin,
    counted.organization_id,
    counted.s_org_name,
    counted.created_by,
    counted.s_owner_email,
    counted.version,
    counted.created_at,
    counted.updated_at,
    counted.s_is_owner,
    counted.s_access,
    counted.s_total
  FROM counted
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN counted.s_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'label' AND v_dir = 'asc' THEN lower(counted.label) END ASC,
    CASE WHEN v_sort = 'label' AND v_dir = 'desc' THEN lower(counted.label) END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN lower(counted.kind) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN lower(counted.kind) END DESC,
    CASE WHEN v_sort = 'family' AND v_dir = 'asc' THEN lower(coalesce(counted.s_family, '')) END ASC,
    CASE WHEN v_sort = 'family' AND v_dir = 'desc' THEN lower(coalesce(counted.s_family, '')) END DESC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'asc' THEN counted.authoring_owner END ASC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'desc' THEN counted.authoring_owner END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN counted.is_active END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN counted.is_active END DESC,
    CASE WHEN v_sort = 'component' AND v_dir = 'asc' THEN counted.s_has_component END ASC,
    CASE WHEN v_sort = 'component' AND v_dir = 'desc' THEN counted.s_has_component END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN counted.visibility::text END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN counted.visibility::text END DESC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'asc' THEN counted.s_origin END ASC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'desc' THEN counted.s_origin END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(counted.s_org_name, '')) END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(counted.s_org_name, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(counted.s_owner_email, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(counted.s_owner_email, '')) END DESC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'asc' THEN counted.s_access END ASC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'desc' THEN counted.s_access END DESC,
    CASE WHEN v_sort = 'version' AND v_dir = 'asc' THEN counted.version END ASC,
    CASE WHEN v_sort = 'version' AND v_dir = 'desc' THEN counted.version END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN counted.created_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN counted.created_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN counted.updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN counted.updated_at END DESC,
    counted.id
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_share_capabilities(p_resource_type text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_r record;
  v_visibility_column text;
  v_boolean_column text;
  v_oid oid;
  v_body_not_public boolean := false;
begin
  select *
  into v_r
  from platform.shareable_resource_registry
  where resource_type = p_resource_type
    and is_active;

  if not found then
    raise exception 'Unknown shareable resource token: %. Pass platform.entity_types.token; bare table names are not accepted.', p_resource_type
      using errcode = 'P0001';
  end if;

  v_oid := to_regclass(format('%I.%I', v_r.schema_name, v_r.table_name));
  if v_oid is not null then
    select exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = any (c.conkey)
      where c.conrelid = v_oid
        and c.contype = 'c'
        and a.attname = 'visibility'
        and pg_get_constraintdef(c.oid) ilike '%public%'
    ) into v_body_not_public;
  end if;

  select c.column_name
  into v_visibility_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name in ('visibility', 'card_visibility')
    and not (v_body_not_public and c.column_name = 'visibility')
  order by case c.column_name
    when 'visibility' then 0
    when 'card_visibility' then 1
    else 2
  end
  limit 1;

  select c.column_name
  into v_boolean_column
  from information_schema.columns as c
  where c.table_schema = v_r.schema_name
    and c.table_name = v_r.table_name
    and c.column_name = v_r.is_public_column
    and c.data_type = 'boolean'
  limit 1;

  return jsonb_build_object(
    'supports_public',
      v_visibility_column is not null or v_boolean_column is not null,
    'is_link_shareable', coalesce(v_r.is_link_shareable, false),
    'public_state_column', coalesce(v_visibility_column, v_boolean_column),
    'public_state_kind', case
      when v_visibility_column is not null then 'enum'
      when v_boolean_column is not null then 'boolean'
      else null
    end
  );
end;
$function$;

delete from platform.client_callable_door
 where (schema_name, function_name, identity_args) in
       (('agent', 'public_card_rows', ''), ('workflow', 'public_card_rows', ''));
drop function agent.public_card_rows();
drop function workflow.public_card_rows();

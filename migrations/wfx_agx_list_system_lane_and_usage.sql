-- Workflows and agents: ONE list experience — the System lane and the shared usage columns.
--
-- workflow.definition.workflow_type (user | builtin | generated, mirrors agent.definition.agent_type)
-- was applied live through the Supabase MCP on 2026-10-07
-- (no file, by the DB-first rule). This file carries the list functions that read them, because
-- replacing these large function bodies through the MCP times out:
--
--   wfx_list_scoped        System lane (platform admin: every non-user workflow; everyone else: the
--                          published built-ins); generated rows never reach a user lane; new columns
--                          workflow_type, success_count, failure_count, total_cost; sorts
--                          success_rate / failures / cost / workflow_type; filter workflow_type
--   wfx_list_scope_counts  counts the System lane
--   wfx_list_facets        Type facet
--   workflow.public_card_rows  carries workflow_type on the card
--   agx_list_scoped        new columns run_count, success_count, failure_count, last_used_at,
--                          total_cost; sorts runs / last_used / success_rate / failures / cost;
--                          filters runs (bucket '0' = never used) and last_used
--   agx_list_facets        Runs facet
--
-- Every function body below is the live body at the based-on hash with the named edits applied
-- (generated in-database and asserted edit-by-edit), so nothing another lane changed is reverted.

-- based-on: platform.entity_usage(text, uuid) 7f586225ef7ffd81cb3d0d075a04c562c3c466bc0faaa8203fbd2a9916bb9a82
-- based-on: workflow.public_card_rows() 2094541ffa9d7f0251b963eee0f8a74c0c083331a284f6e2e677a8972745a81a
-- based-on: public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 2022a7bd470106c6c9569e465d8f4f8850b4a5969563048f1d7c162e7e4d0d4f
-- based-on: public.wfx_list_scope_counts(text, boolean, text, jsonb, uuid) 2074ed21299a201e7fe7b65839030b6e3c0c2eec23e16d90db4f1fa79a71ad5b
-- based-on: public.wfx_list_facets(text, uuid, text, boolean, text) efc5f471f2b76607f5838e279595adfaa1f6b58e5db55455fd27e60e7e106ac9
-- based-on: public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 5aafc43c13dc8982dcbc1d1a8930f0a9e3821f484bd8c954cc9be1bec4f74e75
-- based-on: public.agx_list_facets(text, uuid, text, boolean, text) f6edf00633c552c7cc4f835d4b27aebe1ac65e48e5f59785f784b092311a3089

-- ── THE ONE usage rollup, set-based ───────────────────────────────────────────
-- Replaces the per-id platform.entity_usage(text, uuid) applied earlier today: called once per
-- row, its row-security checks on chat.user_request re-ran for every row and a 650-agent System
-- lane timed out. One call per list query now, for every id on it.
DROP FUNCTION IF EXISTS platform.entity_usage(text, uuid);
CREATE OR REPLACE FUNCTION platform.entity_usage(p_entity text, p_ids uuid[])
RETURNS TABLE(entity_id uuid, run_count bigint, success_count bigint, failure_count bigint,
              last_used_at timestamp with time zone, total_cost numeric)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path TO ''
AS $function$
  SELECT r.definition_id,
         count(*)::bigint,
         count(*) FILTER (WHERE r.status = 'completed')::bigint,
         count(*) FILTER (WHERE r.status IN ('failed','errored'))::bigint,
         max(r.created_at),
         coalesce(sum(c.cost), 0)::numeric
  FROM workflow.run r
  LEFT JOIN (SELECT ur.workflow_run_id, sum(ur.total_cost) AS cost
             FROM chat.user_request ur
             WHERE p_entity = 'workflow' AND ur.deleted_at IS NULL
               AND ur.workflow_run_id IN (SELECT r2.id FROM workflow.run r2
                                          WHERE r2.definition_id = ANY (p_ids))
             GROUP BY ur.workflow_run_id) c ON c.workflow_run_id = r.id
  WHERE p_entity = 'workflow' AND r.definition_id = ANY (p_ids) AND r.deleted_at IS NULL
  GROUP BY r.definition_id
  UNION ALL
  SELECT u.agent_id,
         count(*)::bigint,
         count(*) FILTER (WHERE u.status = 'completed')::bigint,
         count(*) FILTER (WHERE u.status = 'failed')::bigint,
         max(u.created_at),
         coalesce(sum(u.total_cost), 0)::numeric
  FROM chat.user_request u
  WHERE p_entity = 'agent' AND u.agent_id = ANY (p_ids) AND u.deleted_at IS NULL
  GROUP BY u.agent_id
$function$;
COMMENT ON FUNCTION platform.entity_usage(text, uuid[]) IS
  'THE ONE usage rollup (runs, successes, failures, last used, AI cost) for workflows or agents, one row per id that has usage. SECURITY INVOKER: counts what the caller can see. Read by wfx_list_scoped and agx_list_scoped, once per query.';
REVOKE ALL ON FUNCTION platform.entity_usage(text, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform.entity_usage(text, uuid[]) TO authenticated, service_role;

-- ── workflow cards carry the type ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION workflow.public_card_rows()
 RETURNS SETOF workflow.definition
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'workflow', 'public'
AS $function$
  select jsonb_populate_record(null::workflow.definition, jsonb_build_object(
    'id', d.id, 'name', d.name, 'description', d.description,
    'category', d.category, 'tags', d.tags, 'is_active', d.is_active,
    'is_archived', d.is_archived, 'visibility', d.visibility,
    'card_visibility', d.card_visibility, 'created_by', d.created_by,
    'organization_id', d.organization_id, 'version', d.version,
    'created_at', d.created_at, 'updated_at', d.updated_at,
    'workflow_type', d.workflow_type,
    -- the step COUNT the card shows, never the steps themselves
    'nodes', (select coalesce(jsonb_agg('{}'::jsonb), '[]'::jsonb)
                from jsonb_array_elements(coalesce(d.nodes, '[]'::jsonb)))))
  from workflow.definition d
  where d.card_visibility = 'public'::platform.visibility
    and d.deleted_at is null;
$function$;

-- ── workflows list (return shape changes → drop and recreate) ────────────────
DROP FUNCTION public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);
CREATE OR REPLACE FUNCTION public.wfx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, name text, description text, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, card_visibility text, created_by uuid, organization_id uuid, organization_name text, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, step_count integer, run_count bigint, last_run_id uuid, last_run_status text, last_run_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint, custom_fields jsonb, workflow_type text, success_count bigint, failure_count bigint, total_cost numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('workflow')));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
  -- The System lane reads the platform's own workflows: a platform admin reads all of them
  -- (built-in and feature-generated), everyone else the published built-ins. Mirrors agx_list_scoped.
  v_is_admin boolean := public.is_platform_admin();
BEGIN
  -- The Shown-to context is read only by the organization / team lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := platform.shown_to_context('workflow');
  END IF;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'wfx_list_scoped: not authenticated'; END IF;

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by wfx_list_scope_counts: ONE statement that returns, for
  -- every lane (all, mine, team, orgs, shared, public), the ids this same list would show (access_level carries
  -- the lane name, 'all' deduped, strongest way in kept), so workflows are read under row security once instead
  -- of once per lane, and the run history is read only when a filter needs it. Same lane predicates and filters
  -- as below; nothing is sorted, scored or paged. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE
      v_need_names boolean := v_f ?| ARRAY['owner_email','organization_name'];
      v_need_runs boolean := v_f ?| ARRAY['status','last_run','runs'];
    BEGIN
      v_ctx := platform.shown_to_context('workflow');
      RETURN QUERY
      WITH defs AS MATERIALIZED (
        SELECT d.id, d.organization_id, d.created_by, d.shown_to, d.visibility, d.deleted_at, d.is_archived, d.name,
          d.description, d.category, d.tags, d.version, d.created_at, d.updated_at, d.workflow_type,
          (p_deep AND v_search IS NOT NULL AND d.nodes::text ILIKE '%'||v_search||'%') AS deep_hit,
          coalesce(jsonb_array_length(d.nodes), 0) AS s_steps
        FROM workflow.definition d
      ),
      cards AS (
        SELECT d.id, d.organization_id, d.created_by, d.shown_to, d.visibility, d.deleted_at, d.is_archived, d.name,
          d.description, d.category, d.tags, d.version, d.created_at, d.updated_at, d.workflow_type,
          (p_deep AND v_search IS NOT NULL AND d.nodes::text ILIKE '%'||v_search||'%') AS deep_hit,
          coalesce(jsonb_array_length(d.nodes), 0) AS s_steps
        FROM workflow.public_card_rows() d
        WHERE d.created_by IS DISTINCT FROM v_uid
      ),
      mine AS (SELECT d.id, d.organization_id, d.created_by, true AS s_is_owner, 'owner'::text AS s_access
               FROM defs d WHERE d.created_by = v_uid AND d.workflow_type = 'user'),
      orgs AS (
        SELECT d.id, d.organization_id, d.created_by, (d.created_by = v_uid) AS s_is_owner,
          CASE WHEN d.created_by = v_uid THEN 'owner' ELSE 'org' END::text AS s_access
        FROM defs d
        WHERE (p_org_id IS NULL OR d.organization_id = p_org_id) AND d.organization_id IN (SELECT iam.my_orgs())
          AND d.workflow_type = 'user'
          AND platform.shown_to_lists(d.shown_to, d.visibility, d.created_by, d.organization_id, v_uid, v_ctx)
      ),
      team AS (
        SELECT o.* FROM orgs o
        WHERE (o.organization_id, o.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT d.id, d.organization_id, d.created_by, false AS s_is_owner, perm.permission_level::text AS s_access
        FROM defs d
        JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
          AND perm.granted_to_user_id = v_uid
        WHERE d.created_by IS DISTINCT FROM v_uid AND d.workflow_type = 'user'
        UNION ALL
        SELECT os.id, os.organization_id, os.created_by, false, os.s_access FROM (
          SELECT DISTINCT ON (d.id) d.id, d.organization_id, d.created_by, perm.permission_level::text AS s_access
          FROM defs d
          JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
            AND perm.granted_to_organization_id IN (
              SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
          WHERE d.created_by IS DISTINCT FROM v_uid AND d.workflow_type = 'user'
            AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='workflow'
              AND p2.resource_id=d.id AND p2.granted_to_user_id=v_uid)
        ) os
      ),
      pub AS (SELECT c.id, c.organization_id, c.created_by, false AS s_is_owner, 'public'::text AS s_access FROM cards c
               WHERE c.workflow_type = 'user'),
      sys AS (SELECT d.id, d.organization_id, d.created_by, false AS s_is_owner, 'system'::text AS s_access
              FROM defs d WHERE v_is_admin AND d.workflow_type <> 'user'
              UNION ALL
              SELECT c.id, c.organization_id, c.created_by, false, 'system'::text
              FROM cards c WHERE NOT v_is_admin AND c.workflow_type = 'builtin'),
      all_raw AS (
        SELECT m.id, m.organization_id, m.s_access FROM mine m
        UNION ALL SELECT o.id, o.organization_id, o.s_access FROM orgs o
        UNION ALL SELECT s.id, s.organization_id, s.s_access FROM shared s
      ),
      lane_rows AS (
        SELECT 'mine'::text AS lane, m.id, m.organization_id, m.s_access FROM mine m
        UNION ALL SELECT 'orgs', o.id, o.organization_id, o.s_access FROM orgs o
        UNION ALL SELECT 'team', t.id, t.organization_id, t.s_access FROM team t
        UNION ALL SELECT 'shared', s.id, s.organization_id, s.s_access FROM shared s
        UNION ALL SELECT 'public', p.id, p.organization_id, p.s_access FROM pub p
        UNION ALL SELECT 'system', y.id, y.organization_id, y.s_access FROM sys y
        UNION ALL SELECT 'all', r.id, r.organization_id, r.s_access FROM (
          SELECT sr.*, row_number() OVER (PARTITION BY sr.id ORDER BY CASE sr.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'edit' THEN 2 WHEN 'org' THEN 4 ELSE 3 END) AS s_rn
          FROM all_raw sr) r
        WHERE r.s_rn = 1
      ),
      cand AS (
        SELECT 'd'::text AS src, x.* FROM defs x WHERE x.id IN (SELECT lr.id FROM lane_rows lr WHERE lr.lane <> 'public'
                                                    AND NOT (lr.lane = 'system' AND NOT v_is_admin))
        UNION ALL
        SELECT 'c', c.* FROM cards c WHERE c.id IN (SELECT lr.id FROM lane_rows lr WHERE lr.lane = 'public'
                                                    OR (lr.lane = 'system' AND NOT v_is_admin))
      ),
      joined AS (
        SELECT s.*,
          o.name AS s_org_name,
          u.email::text AS s_owner_email,
          coalesce(r.s_runs, 0::bigint) AS s_runs,
          r.s_last_run_id, r.s_last_run_status, r.s_last_run_at
        FROM cand s
        LEFT JOIN iam.organizations o ON o.id = s.organization_id
        LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by AND v_need_names
        LEFT JOIN LATERAL (
          SELECT (array_agg(x.id ORDER BY x.created_at DESC))[1] AS s_last_run_id,
                 (array_agg(x.status ORDER BY x.created_at DESC))[1] AS s_last_run_status,
                 max(x.created_at) AS s_last_run_at,
                 count(*) AS s_runs
          FROM workflow.run x
          WHERE v_need_runs AND x.definition_id = s.id AND x.deleted_at IS NULL
        ) r ON true
      ),
      ok AS (
        SELECT DISTINCT j.src, j.id FROM joined j
    WHERE j.deleted_at IS NULL
      AND (p_org_id IS NULL OR j.organization_id = p_org_id)
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
      AND (NOT v_f ? 'name' OR j.name ILIKE '%'||(v_f->'name'->>'value')||'%')
      AND (NOT v_f ? 'description' OR coalesce(j.description,'') ILIKE '%'||(v_f->'description'->>'value')||'%')
      AND (NOT v_f ? 'owner_email' OR coalesce(j.s_owner_email,'') ILIKE '%'||(v_f->'owner_email'->>'value')||'%')
      AND (NOT v_f ? 'organization_name' OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      AND (NOT v_f ? 'category'
           OR coalesce(nullif(j.category,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'category'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.visibility::text IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
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
           OR platform.my_favorite('workflow', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, 'workflow')), '{}')))
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
      AND (NOT v_f ? 'workflow_type'
           OR j.workflow_type IN (SELECT jsonb_array_elements_text(v_f->'workflow_type'->'values')))
      )
      SELECT lr.id, NULL::text, NULL::text, NULL::text, NULL::text[], NULL::boolean, NULL::boolean, NULL::boolean,
        NULL::text, NULL::text, NULL::uuid, lr.organization_id, NULL::text, NULL::integer, NULL::timestamptz,
        NULL::timestamptz, NULL::integer, NULL::bigint, NULL::uuid, NULL::text, NULL::timestamptz, NULL::boolean,
        lr.lane, NULL::text, 0::bigint, NULL::jsonb, NULL::text, NULL::bigint, NULL::bigint, NULL::numeric
      FROM lane_rows lr JOIN ok ON ok.id = lr.id AND ok.src = CASE WHEN lr.lane = 'public' OR (lr.lane = 'system' AND NOT v_is_admin) THEN 'c' ELSE 'd' END
      WHERE (NOT v_f ? 'access_level'
             OR lr.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')));
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','public','system','all') THEN
    RAISE EXCEPTION 'wfx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived','steps','runs','last_run','status',
                    'success_rate','failures','cost','workflow_type') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH scoped_raw AS (
    SELECT d.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM workflow.definition d WHERE v_scope IN ('mine','all') AND d.created_by = v_uid AND d.workflow_type = 'user'
    UNION ALL
    SELECT d.*, (d.created_by = v_uid), CASE WHEN d.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM workflow.definition d
    WHERE v_scope IN ('orgs','team','all') AND (p_org_id IS NULL OR d.organization_id = p_org_id) AND d.organization_id IN (SELECT iam.my_orgs())
      AND d.workflow_type = 'user'
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (d.organization_id, d.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(d.shown_to, d.visibility, d.created_by, d.organization_id, v_uid, v_ctx)
    UNION ALL
    SELECT d.*, false, perm.permission_level::text FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope IN ('shared','all') AND d.created_by IS DISTINCT FROM v_uid AND d.workflow_type = 'user'
    UNION ALL
    SELECT DISTINCT ON (d.id) d.*, false, perm.permission_level::text
    FROM workflow.definition d
    JOIN iam.permissions perm ON perm.resource_type='workflow' AND perm.resource_id=d.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope IN ('shared','all') AND d.created_by IS DISTINCT FROM v_uid AND d.workflow_type = 'user'
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='workflow'
        AND p2.resource_id=d.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    -- PUBLIC = the workflow's CARD is public. Rows come through workflow.public_card_rows()
    -- (card fields only) because RLS hides a stranger's workflow body from this invoker (2026-09-26).
    SELECT d.*, false, 'public'::text FROM workflow.public_card_rows() d
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid AND d.workflow_type = 'user'
    UNION ALL
    -- SYSTEM = the platform's own workflows (workflow_type <> 'user'). A platform admin reads every
    -- one, built-in and feature-generated; everyone else the built-ins whose card is public.
    SELECT d.*, false, 'system'::text FROM workflow.definition d
    WHERE v_scope='system' AND v_is_admin AND d.workflow_type <> 'user'
    UNION ALL
    SELECT d.*, false, 'system'::text FROM workflow.public_card_rows() d
    WHERE v_scope='system' AND NOT v_is_admin AND d.workflow_type = 'builtin'
  ),
  scoped AS (
    -- ALL = Mine + My team + My Orgs + Shared, one row per id, most privileged access label kept
    SELECT r.* FROM (
      SELECT sr.*, row_number() OVER (PARTITION BY sr.id ORDER BY CASE sr.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'edit' THEN 2 WHEN 'org' THEN 4 ELSE 3 END) AS s_rn
      FROM scoped_raw sr) r
    WHERE r.s_rn = 1 OR v_scope <> 'all'
  ),
  joined AS (
    SELECT s.*,
      o.name AS s_org_name,
      u.email::text AS s_owner_email,
      coalesce(jsonb_array_length(s.nodes), 0) AS s_steps,
      coalesce(r.s_runs, 0::bigint) AS s_runs,
      r.s_last_run_id, r.s_last_run_status, r.s_last_run_at,
      us.u_ok, us.u_fail, us.u_cost
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
    -- THE ONE usage rollup (platform.entity_usage), shared with agx_list_scoped.
    LEFT JOIN (SELECT eu.entity_id AS u_id, eu.success_count AS u_ok, eu.failure_count AS u_fail,
                      eu.total_cost AS u_cost
               FROM platform.entity_usage('workflow', (SELECT array_agg(sc.id) FROM scoped sc)) eu) us
      ON us.u_id = s.id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND (p_org_id IS NULL OR j.organization_id = p_org_id)
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
           OR platform.my_favorite('workflow', j.id) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? '__dimension' OR j.id = ANY(coalesce((SELECT platform.list_dimension_ids(v_f, 'workflow')), '{}')))
      AND (NOT v_f ? 'archived'
           OR coalesce(j.is_archived,false) IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
      AND (NOT v_f ? 'workflow_type'
           OR j.workflow_type IN (SELECT jsonb_array_elements_text(v_f->'workflow_type'->'values')))
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
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, platform.my_favorite('workflow', c.id),
    c.visibility::text, c.card_visibility::text,
    c.created_by, c.organization_id, c.s_org_name, c.version,
    c.created_at, c.updated_at, c.s_steps, c.s_runs,
    c.s_last_run_id, c.s_last_run_status, c.s_last_run_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total,
    CASE WHEN c.created_by = v_uid OR c.organization_id IN (SELECT iam.my_orgs()) THEN (SELECT x.custom_fields FROM workflow.definition x WHERE x.id = c.id) END,
    c.workflow_type, coalesce(c.u_ok, 0), coalesce(c.u_fail, 0), coalesce(c.u_cost, 0)
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN platform.my_favorite('workflow', c.id) END DESC NULLS LAST,
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
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN platform.my_favorite('workflow', c.id) END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN platform.my_favorite('workflow', c.id) END ASC,
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
    CASE WHEN v_sort='success_rate' AND v_dir='desc' THEN c.u_ok::numeric / nullif(c.u_ok + c.u_fail, 0) END DESC NULLS LAST,
    CASE WHEN v_sort='success_rate' AND v_dir='asc' THEN c.u_ok::numeric / nullif(c.u_ok + c.u_fail, 0) END ASC NULLS LAST,
    CASE WHEN v_sort='failures' AND v_dir='desc' THEN c.u_fail END DESC NULLS LAST,
    CASE WHEN v_sort='failures' AND v_dir='asc' THEN c.u_fail END ASC NULLS LAST,
    CASE WHEN v_sort='cost' AND v_dir='desc' THEN c.u_cost END DESC NULLS LAST,
    CASE WHEN v_sort='cost' AND v_dir='asc' THEN c.u_cost END ASC NULLS LAST,
    CASE WHEN v_sort='workflow_type' AND v_dir='desc' THEN c.workflow_type END DESC,
    CASE WHEN v_sort='workflow_type' AND v_dir='asc' THEN c.workflow_type END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.wfx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  -- THE COUNT IS THE LIST (law 4): SECURITY INVOKER; one list call per lane grouped by organization.
  RETURN QUERY
  WITH g AS (
    SELECT r.access_level AS lane, r.organization_id AS oid, count(*)::bigint AS n
    FROM public.wfx_list_scoped('_lanes', NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1000000, 0) r
    GROUP BY r.access_level, r.organization_id
  ), lanes AS (
    SELECT l.lane, coalesce(sum(g.n) FILTER (WHERE p_org_id IS NULL OR g.oid = p_org_id), 0)::bigint AS total
    FROM unnest(ARRAY['mine','team','orgs','shared','public','system','all']) AS l(lane)
    LEFT JOIN g ON g.lane = l.lane GROUP BY l.lane
  )
  SELECT ln.lane, NULL::uuid, NULL::text, ln.total FROM lanes ln
  UNION ALL
  SELECT 'orgs'::text, o.id, o.name, coalesce(sum(g.n), 0)::bigint
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN g ON g.lane = 'orgs' AND g.oid = o.id
  GROUP BY o.id, o.name
  UNION ALL
  SELECT 'team'::text, o.id, o.name, coalesce(sum(g.n), 0)::bigint
  FROM iam.organizations o
  JOIN (SELECT DISTINCT tr.organization_id FROM iam.my_team_reach(NULL) tr
         WHERE tr.user_id <> (select auth.uid())) tm ON tm.organization_id = o.id
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN g ON g.lane = 'team' AND g.oid = o.id
  GROUP BY o.id, o.name
  UNION ALL
  SELECT 'all'::text, o.id, o.name, coalesce(sum(g.n), 0)::bigint
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN g ON g.lane = 'all' AND g.oid = o.id
  GROUP BY o.id, o.name;
END;
$function$;

CREATE OR REPLACE FUNCTION public.wfx_list_facets(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(kind text, value text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.category, r.tags, r.is_favorite, r.is_archived, r.visibility,
           r.access_level, r.version, r.organization_name, r.owner_email,
           r.last_run_status, r.step_count, r.run_count, r.workflow_type
    FROM public.wfx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      false, p_archived, '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'category'::text, COALESCE(NULLIF(b.category, ''), '__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'tag'::text, t.tag, count(*)
  FROM base b
  CROSS JOIN LATERAL (
    SELECT CASE WHEN coalesce(array_length(b.tags,1),0)=0 THEN '__none__' ELSE x END AS tag
    FROM unnest(CASE WHEN coalesce(array_length(b.tags,1),0)=0
                     THEN ARRAY['__none__'] ELSE b.tags END) x
  ) t
  GROUP BY t.tag
  UNION ALL
  SELECT 'visibility'::text, b.visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'access_level'::text, b.access_level, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'version'::text, b.version::text, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'status'::text, COALESCE(NULLIF(b.last_run_status,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, COALESCE(NULLIF(b.organization_name,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, COALESCE(NULLIF(b.owner_email,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'steps'::text, s.bucket, count(*)
  FROM base b
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(b.step_count,0)=0 THEN '0'
                                  WHEN b.step_count <= 5 THEN '1-5'
                                  WHEN b.step_count <= 20 THEN '6-20'
                                  ELSE 'gt20' END AS bucket) s
  GROUP BY s.bucket
  UNION ALL
  SELECT 'runs'::text, r2.bucket, count(*)
  FROM base b
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(b.run_count,0)=0 THEN '0'
                                  WHEN b.run_count <= 5 THEN '1-5'
                                  WHEN b.run_count <= 20 THEN '6-20'
                                  ELSE 'gt20' END AS bucket) r2
  GROUP BY r2.bucket
  UNION ALL
  SELECT 'favorite'::text, 'only', count(*) FILTER (WHERE b.is_favorite) FROM base b
  UNION ALL
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b
  UNION ALL
  SELECT 'workflow_type'::text, b.workflow_type, count(*) FROM base b GROUP BY 2;
END;
$function$;

-- ── agents list (return shape changes → drop and recreate) ───────────────────
DROP FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);
CREATE OR REPLACE FUNCTION public.agx_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_sort text DEFAULT 'updated'::text, p_dir text DEFAULT 'desc'::text, p_favorites_first boolean DEFAULT true, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, agent_type text, name text, description text, model_id uuid, category text, tags text[], is_active boolean, is_archived boolean, is_favorite boolean, visibility text, created_by uuid, organization_id uuid, organization_name text, task_id uuid, source_agent_id uuid, version integer, created_at timestamp with time zone, updated_at timestamp with time zone, is_owner boolean, access_level text, owner_email text, total_count bigint, custom_fields jsonb, offering_id uuid, run_count bigint, success_count bigint, failure_count bigint, last_used_at timestamp with time zone, total_cost numeric)
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
        SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email, us.u_runs, us.u_last
        FROM deduped s
        LEFT JOIN iam.organizations o ON o.id = s.organization_id
        LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by AND v_need_names
        -- usage is read only when a usage filter needs it (the counts must equal the list)
        LEFT JOIN (SELECT eu.entity_id AS u_id, eu.run_count AS u_runs, eu.last_used_at AS u_last
                   FROM platform.entity_usage('agent', CASE WHEN v_f ?| ARRAY['runs','last_used']
                                                           THEN (SELECT array_agg(dd.id) FROM deduped dd) END) eu) us
          ON us.u_id = s.id
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
      -- USAGE filters (bucket '0' is "never used")
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(coalesce(j.u_runs, 0), b)))
      AND (NOT v_f ? 'last_used'
           OR j.u_last >= public.agx_since_bucket(v_f->'last_used'->'values'->>0))
      )
      SELECT d.id, NULL::text, NULL::text, NULL::text, NULL::uuid, NULL::text, NULL::text[], NULL::boolean, NULL::boolean,
        NULL::boolean, NULL::text, NULL::uuid, d.organization_id, NULL::text, NULL::uuid, NULL::uuid, NULL::integer,
        NULL::timestamptz, NULL::timestamptz, NULL::boolean, d.lane, NULL::text, 0::bigint, NULL::jsonb, NULL::uuid,
        NULL::bigint, NULL::bigint, NULL::bigint, NULL::timestamptz, NULL::numeric
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
                    'version','favorite','archived',
                    'runs','last_used','success_rate','failures','cost') THEN
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
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email,
      us.u_runs, us.u_ok, us.u_fail, us.u_last, us.u_cost
    FROM deduped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by
    -- THE ONE usage rollup (platform.entity_usage), shared with wfx_list_scoped.
    LEFT JOIN (SELECT eu.entity_id AS u_id, eu.run_count AS u_runs, eu.success_count AS u_ok,
                      eu.failure_count AS u_fail, eu.last_used_at AS u_last, eu.total_cost AS u_cost
               FROM platform.entity_usage('agent', (SELECT array_agg(dd.id) FROM deduped dd)) eu) us
      ON us.u_id = s.id
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
      -- USAGE filters (bucket '0' is "never used")
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(coalesce(j.u_runs, 0), b)))
      AND (NOT v_f ? 'last_used'
           OR j.u_last >= public.agx_since_bucket(v_f->'last_used'->'values'->>0))
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
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total,
    -- LANE 7 W5: the organization's own field values, so the list's custom-field columns have
    -- values. Never on the public lane: a published agent's CARD is public, its body is not.
    CASE WHEN c.s_access <> 'public' THEN c.custom_fields END,
    -- The agent's CLASS pin, read from the row's own settings (never the public lane's card).
    CASE WHEN c.s_access <> 'public' AND c.settings->>'offering_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (c.settings->>'offering_id')::uuid END,
    coalesce(c.u_runs, 0), coalesce(c.u_ok, 0), coalesce(c.u_fail, 0), c.u_last, coalesce(c.u_cost, 0)
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
    CASE WHEN v_sort='runs' AND v_dir='desc' THEN c.u_runs END DESC NULLS LAST,
    CASE WHEN v_sort='runs' AND v_dir='asc' THEN c.u_runs END ASC NULLS LAST,
    CASE WHEN v_sort='last_used' AND v_dir='desc' THEN c.u_last END DESC NULLS LAST,
    CASE WHEN v_sort='last_used' AND v_dir='asc' THEN c.u_last END ASC NULLS FIRST,
    CASE WHEN v_sort='success_rate' AND v_dir='desc' THEN c.u_ok::numeric / nullif(c.u_ok + c.u_fail, 0) END DESC NULLS LAST,
    CASE WHEN v_sort='success_rate' AND v_dir='asc' THEN c.u_ok::numeric / nullif(c.u_ok + c.u_fail, 0) END ASC NULLS LAST,
    CASE WHEN v_sort='failures' AND v_dir='desc' THEN c.u_fail END DESC NULLS LAST,
    CASE WHEN v_sort='failures' AND v_dir='asc' THEN c.u_fail END ASC NULLS LAST,
    CASE WHEN v_sort='cost' AND v_dir='desc' THEN c.u_cost END DESC NULLS LAST,
    CASE WHEN v_sort='cost' AND v_dir='asc' THEN c.u_cost END ASC NULLS LAST,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.agx_list_facets(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text)
 RETURNS TABLE(kind text, value text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.category, r.tags, r.is_favorite, r.is_archived, r.visibility,
           r.access_level, r.version, r.organization_name, r.owner_email, r.run_count
    FROM public.agx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      false, p_archived, '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'category'::text, COALESCE(NULLIF(b.category, ''), '__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'tag'::text, t.tag, count(*)
  FROM base b
  CROSS JOIN LATERAL (
    SELECT CASE WHEN coalesce(array_length(b.tags,1),0)=0 THEN '__none__' ELSE x END AS tag
    FROM unnest(CASE WHEN coalesce(array_length(b.tags,1),0)=0
                     THEN ARRAY['__none__'] ELSE b.tags END) x
  ) t
  GROUP BY t.tag
  UNION ALL
  SELECT 'visibility'::text, b.visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'access_level'::text, b.access_level, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'version'::text, b.version::text, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, COALESCE(NULLIF(b.organization_name,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, COALESCE(NULLIF(b.owner_email,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'favorite'::text, 'only', count(*) FILTER (WHERE b.is_favorite) FROM base b
  UNION ALL
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b
  UNION ALL
  SELECT 'runs'::text, r2.bucket, count(*)
  FROM base b
  CROSS JOIN LATERAL (SELECT CASE WHEN coalesce(b.run_count,0)=0 THEN '0'
                                  WHEN b.run_count <= 5 THEN '1-5'
                                  WHEN b.run_count <= 20 THEN '6-20'
                                  ELSE 'gt20' END AS bucket) r2
  GROUP BY r2.bucket;
END;
$function$;

-- Restores the five conversation functions preceding Mandate Candidates C0.
-- based-on: chat.conversation_lane(text, text, text, text) 7c5e536957f0f1ea7d69598f829c2d5652e3c18a5b69bbbac36ecde7710ee9ee
-- based-on: public.cvx_audience(text, text, text, text, text) e0f603cdbbff9b50bb619777363e2a3477803f15f70a98162097dccdd83c1289
-- based-on: public.get_cx_conversation_lane_facets() a43ec6fc0e690082cd202a3e5b02baae5ef772f1b462a78293426ad8224de203
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) a884af3209e3e16529c0a089e0a407c5dd33dced2764ebabf8622a9c82c29a22
-- based-on: public.cx_search_conversations(text, boolean, text, text[], uuid[], text[], text[], text[], boolean, text[], integer, integer) 6f4ad8c4c80f76e9932c37b7b4034322064191c8f85649544439c007d7d5116e
-- Captured from the quarantined clone before the hidden-lane migration.
-- Refuse to expose persisted candidate conversations during rollback.
-- The chair must stop candidate creation before rollback; keep writers excluded
-- during this transaction so the emptiness check cannot race an insert.
DO $rollback$
BEGIN
  LOCK TABLE chat.conversation IN SHARE MODE;
  IF EXISTS (SELECT 1 FROM chat.conversation WHERE conversation_type = 'mandate_candidate') THEN
    RAISE EXCEPTION 'Cannot restore visible conversation lanes while candidate conversations exist';
  END IF;
END
$rollback$;

CREATE OR REPLACE FUNCTION chat.conversation_lane(source_app text, source_feature text, origin_class text, conversation_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when conversation_type = 'subagent' or origin_class = 'child_agent'
      then 'subagent'
    when source_app = 'code-plugin'
      then 'plugin'
    when origin_class in ('scheduled', 'workflow', 'system', 'client_auto')
      or conversation_type in ('scheduled', 'workflow', 'auto', 'system',
                               'research', 'podcast', 'hindsight_replay')
      or source_feature = 'system'
      or source_app = 'aidream'
      or source_app like 'aidream-%'
      or source_app in ('matrx-scheduler', 'mcp-agent-service')
      then 'auto'
    when source_feature in ('chat', 'agent-runner', 'agent-builder', 'agent-app',
                            'agent-comparison', 'agent-generator', 'agents-other',
                            'voice-agent')
      then 'chat'
    else 'matrx'
  end
$function$
;

CREATE OR REPLACE FUNCTION public.cvx_audience(p_provider text, p_source_app text, p_source_feature text, p_origin_class text, p_conversation_type text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
AS $function$
  -- Decides NOTHING. chat.conversation_lane is the one classifier; this is the
  -- /work bucket each lane belongs to, plus the one fact the lane cannot see:
  -- a live coding-session binding makes a row external whatever its lane.
  SELECT CASE
    WHEN p_provider IS NOT NULL
      OR chat.conversation_lane(p_source_app, p_source_feature, p_origin_class,
                                p_conversation_type) = 'plugin'
      THEN 'external'
    WHEN chat.conversation_lane(p_source_app, p_source_feature, p_origin_class,
                                p_conversation_type) IN ('auto', 'subagent')
      THEN 'internal'
    ELSE 'chat'
  END
$function$
;

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

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by cvx_list_scope_counts: ONE statement that returns, for
  -- every lane (all, mine, team, orgs, shared), the ids this same list would show (access_level carries the lane
  -- name, 'all' deduped, strongest way in kept), so conversations are read under row security once instead of
  -- once per lane, and the bindings / favourites / last-message reads run only when a search or filter needs
  -- them. Same lane predicates and filters as below; nothing is sorted, scored or paged. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE
      v_need_names boolean := v_f ?| ARRAY['owner_email','organization_name'];
      v_need_cs boolean := v_search IS NOT NULL OR v_f ?| ARRAY['audience','provider_session_id','provider','workspace_name','provider_account','title_source','category','fidelity','binding_status','binding_last_seen_at','last_activity'];
      v_need_fav boolean := v_f ? 'favorite';
      v_need_last boolean := v_f ? 'last_activity';
    BEGIN
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
      convs AS MATERIALIZED (SELECT c.* FROM chat.conversation c),
      mine AS (SELECT c.id, c.organization_id, c.created_by, true AS s_is_owner, 'owner'::text AS s_access
               FROM convs c WHERE c.created_by = v_uid),
      orgs AS (
        SELECT c.id, c.organization_id, c.created_by, (c.created_by = v_uid) AS s_is_owner,
          CASE WHEN c.created_by = v_uid THEN 'owner' ELSE 'org' END::text AS s_access
        FROM convs c
        WHERE (p_org_id IS NULL OR c.organization_id = p_org_id) AND c.organization_id IN (SELECT iam.my_orgs())
      ),
      team AS (
        SELECT o.* FROM orgs o
        WHERE (o.organization_id, o.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT c.id, c.organization_id, c.created_by, false AS s_is_owner, perm.permission_level::text AS s_access
        FROM convs c
        JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
          AND perm.granted_to_user_id = v_uid
        WHERE c.created_by IS DISTINCT FROM v_uid
        UNION ALL
        SELECT os.id, os.organization_id, os.created_by, false, os.s_access FROM (
          SELECT DISTINCT ON (c.id) c.id, c.organization_id, c.created_by, perm.permission_level::text AS s_access
          FROM convs c
          JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
            AND perm.granted_to_organization_id IN (
              SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
          WHERE c.created_by IS DISTINCT FROM v_uid
            AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='conversation'
              AND p2.resource_id=c.id AND p2.granted_to_user_id=v_uid)
        ) os
      ),
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
        UNION ALL SELECT 'all', r.id, r.organization_id, r.s_access FROM (
          SELECT sr.*, row_number() OVER (PARTITION BY sr.id ORDER BY CASE sr.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'edit' THEN 2 WHEN 'org' THEN 4 ELSE 3 END) AS s_rn
          FROM all_raw sr) r
        WHERE r.s_rn = 1
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
        FROM (SELECT c.* FROM convs c WHERE c.id IN (SELECT lr.id FROM lane_rows lr)) s
        LEFT JOIN iam.organizations o ON o.id = s.organization_id
        LEFT JOIN platform.visible_user_identity u ON u.id = s.created_by AND v_need_names
        LEFT JOIN platform.user_entity_state ues
          ON ues.user_id = v_uid
         AND ues.entity_type = 'conversation'
         AND ues.entity_id = s.id
         AND v_need_fav
        LEFT JOIN LATERAL (
          SELECT b.provider, b.provider_session_id, b.metadata, b.fidelity,
                 b.status, b.origin, b.last_seen_at
          FROM chat.coding_session b
          WHERE v_need_cs AND b.conversation_id = s.id AND b.deleted_at IS NULL
          ORDER BY b.last_seen_at DESC NULLS LAST, b.created_at DESC, b.id
          LIMIT 1
        ) cs ON true
      ),
      filtered AS (
        SELECT j.* FROM joined j
    WHERE j.deleted_at IS NULL
      AND (p_org_id IS NULL OR j.organization_id = p_org_id)
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
          f.id,
          greatest(
            coalesce(lm.last_at, f.created_at),
            coalesce(f.s_binding_last_seen_at, f.created_at),
            f.created_at
          ) AS s_last_activity
        FROM filtered f
        LEFT JOIN LATERAL (
          SELECT m.created_at AS last_at
          FROM chat.message m
          WHERE v_need_last AND m.conversation_id = f.id
            AND m.deleted_at IS NULL
            AND m.is_visible_to_user = true
          ORDER BY m.created_at DESC
          LIMIT 1
        ) lm ON true
      ),
      ok AS (
        SELECT a.id FROM activity a
        WHERE (NOT v_f ? 'last_activity'
               OR a.s_last_activity >= public.agx_since_bucket(v_f->'last_activity'->'values'->>0))
      )
      SELECT lr.id, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::integer, NULL::boolean,
        NULL::boolean, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
        NULL::text, NULL::text, NULL::timestamptz, lr.organization_id, NULL::text, NULL::text, NULL::uuid, NULL::uuid,
        NULL::timestamptz, NULL::timestamptz, NULL::timestamptz, NULL::boolean, lr.lane, 0::bigint
      FROM lane_rows lr JOIN ok ON ok.id = lr.id
      WHERE (NOT v_f ? 'access_level'
             OR lr.s_access IN (SELECT jsonb_array_elements_text(v_f->'access_level'->'values')));
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('mine','team','orgs','shared','all') THEN
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
  scoped_raw AS (
    SELECT c.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM chat.conversation c
    WHERE v_scope IN ('mine','all') AND c.created_by = v_uid
    UNION ALL
    SELECT c.*, (c.created_by = v_uid), CASE WHEN c.created_by = v_uid THEN 'owner' ELSE 'org' END::text FROM chat.conversation c
    WHERE v_scope IN ('orgs','team','all') AND (p_org_id IS NULL OR c.organization_id = p_org_id) AND c.organization_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (c.organization_id, c.created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
    UNION ALL
    SELECT c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope IN ('shared','all') AND c.created_by IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (c.id) c.*, false, perm.permission_level::text FROM chat.conversation c
    JOIN iam.permissions perm ON perm.resource_type='conversation' AND perm.resource_id=c.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope IN ('shared','all') AND c.created_by IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='conversation'
        AND p2.resource_id=c.id AND p2.granted_to_user_id=v_uid)
  ),
  scoped AS (
    -- ALL = Mine + My team + My Orgs + Shared, one row per id, most privileged access label kept
    SELECT r.* FROM (
      SELECT sr.*, row_number() OVER (PARTITION BY sr.id ORDER BY CASE sr.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'edit' THEN 2 WHEN 'org' THEN 4 ELSE 3 END) AS s_rn
      FROM scoped_raw sr) r
    WHERE r.s_rn = 1 OR v_scope <> 'all'
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
      AND (p_org_id IS NULL OR j.organization_id = p_org_id)
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
$function$
;

CREATE OR REPLACE FUNCTION public.cx_search_conversations(p_search text, p_deep boolean DEFAULT false, p_since text DEFAULT '30d'::text, p_lanes text[] DEFAULT NULL::text[], p_agent_ids uuid[] DEFAULT NULL::uuid[], p_exclude_source_features text[] DEFAULT '{}'::text[], p_include_source_features text[] DEFAULT '{}'::text[], p_include_source_apps text[] DEFAULT '{}'::text[], p_include_empty_source boolean DEFAULT false, p_origin_classes text[] DEFAULT NULL::text[], p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, title text, description text, status text, message_count integer, is_favorite boolean, exclude_from_kg boolean, initial_agent_id uuid, last_model_id uuid, source_app text, source_feature text, origin_class text, created_at timestamp with time zone, updated_at timestamp with time zone, last_activity_at timestamp with time zone, total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := auth.uid();
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_deep boolean := public.cvx_search_is_deep(v_search, p_deep);
begin
  if v_uid is null then
    raise exception 'cx_search_conversations: not authenticated';
  end if;
  if v_search is null then return; end if;

  return query
  with deep_hits as (
    select h as conversation_id
    from public.cvx_deep_hits(v_search) as h
    where v_deep
  ),
  filtered as (
    select
      c.*,
      coalesce(ues.is_favorite, false) as s_is_favorite,
      cs.provider_session_id as s_provider_session_id,
      cs.metadata->>'workspace_name' as s_workspace_name,
      public.cvx_provider_account_display(cs.metadata) as s_provider_account
    from chat.conversation c
    left join platform.user_entity_state ues
      on ues.user_id = v_uid
     and ues.entity_type = 'conversation'
     and ues.entity_id = c.id
    left join lateral (
      select b.provider_session_id, b.metadata
      from chat.coding_session b
      where b.conversation_id = c.id and b.deleted_at is null
      order by b.last_seen_at desc nulls last, b.created_at desc, b.id
      limit 1
    ) cs on true
    where c.created_by = v_uid
      and c.deleted_at is null
      and c.is_ephemeral is false
      and (p_lanes is null or chat.conversation_lane(
        c.source_app, c.source_feature, c.origin_class, c.conversation_type
      ) = any(p_lanes))
      and (p_agent_ids is null or c.initial_agent_id = any(p_agent_ids))
      and (
        coalesce(array_length(p_exclude_source_features, 1), 0) = 0
        or (
          c.source_feature is not null
          and not (c.source_feature = any(p_exclude_source_features))
        )
      )
      and (
        (
          coalesce(array_length(p_include_source_features, 1), 0) = 0
          and coalesce(array_length(p_include_source_apps, 1), 0) = 0
          and not coalesce(p_include_empty_source, false)
        )
        or c.source_feature = any(coalesce(p_include_source_features, '{}'::text[]))
        or c.source_app = any(coalesce(p_include_source_apps, '{}'::text[]))
        or (coalesce(p_include_empty_source, false) and nullif(c.source_feature, '') is null)
      )
      and (p_origin_classes is null or c.origin_class = any(p_origin_classes))
  ),
  active as (
    select
      f.*,
      greatest(
        coalesce(lm.last_at, f.created_at),
        f.created_at
      ) as s_last_activity
    from filtered f
    left join lateral (
      select m.created_at as last_at
      from chat.message m
      where m.conversation_id = f.id
        and m.deleted_at is null
        and m.is_visible_to_user is true
      order by m.created_at desc
      limit 1
    ) lm on true
    where p_since = 'all'
       or p_since is null
       or greatest(coalesce(lm.last_at, f.created_at), f.created_at)
          >= public.agx_since_bucket(p_since)
  ),
  scored as (
    select
      a.*,
      public.cvx_search_score(
        v_search,
        a.id,
        a.title,
        a.description,
        a.s_workspace_name,
        a.source_feature,
        a.source_app,
        a.s_provider_account,
        a.s_provider_session_id,
        a.id in (select d.conversation_id from deep_hits d)
      ) as s_score
    from active a
  ),
  matched as (
    select s.*, count(*) over () as s_total
    from scored s
    where s.s_score > 0
  )
  select
    m.id,
    m.title,
    m.description,
    m.status,
    m.message_count,
    m.s_is_favorite,
    m.exclude_from_kg,
    m.initial_agent_id,
    m.last_model_id,
    m.source_app,
    m.source_feature,
    m.origin_class,
    m.created_at,
    m.updated_at,
    m.s_last_activity,
    m.s_total
  from matched m
  order by m.s_score desc, m.s_is_favorite desc, m.s_last_activity desc, m.id
  limit least(greatest(coalesce(p_limit, 30), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.get_cx_conversation_lane_facets()
 RETURNS TABLE(lane text, source_app text, source_feature text, n bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    chat.conversation_lane(c.source_app, c.source_feature, c.origin_class, c.conversation_type) as lane,
    c.source_app,
    c.source_feature,
    count(*)::bigint as n
  from chat.conversation c
  where c.created_by = (select auth.uid())
    and c.deleted_at is null
    and c.is_ephemeral = false
  group by 1, 2, 3
  order by count(*) desc;
$function$
;

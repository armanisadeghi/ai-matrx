-- cvx_deep_hits_once_per_request — 2026-09-18
-- based-on: public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer) 8db7db8fc1ecdee744897e0184125a87be30b4cd10376a332737445e466b7b9e
-- based-on: public.cvx_list_scope_counts(text, boolean, text, jsonb) 915b08b2607b84470f0d51a4b333e2f2dd9ce0ee31d56ba7d2ae9403e7f97a44
--
-- THE FINDING, from the user's seat (preview, admin@admin.com, 15:50Z): a
-- commit sha typed into /work/conversations found its row in 2.0 s, and the
-- scope tabs then answered "canceling statement due to statement timeout".
-- cvx_list_scope_counts calls cvx_list_scoped once per scope and once per
-- organization — fifteen times for this account — and every call re-ran the
-- message-body probe (public.cvx_deep_hits, ~1.7 s: the trigram index finds
-- ~95 candidates and each must be re-checked against a body that can be a
-- megabyte of tool output). 15 × 1.7 s = 11.2 s measured.
--
-- THE FIX: the probe runs ONCE per request. The precomputed hit set travels
-- to cvx_list_scoped inside p_filters as `__deep_hits` (a jsonb array of
-- conversation ids), which the counts function computes once and hands to
-- every call it makes. A client that passes `__deep_hits` itself only names
-- rows it can already see (the scoped set is still the gate), so the key is
-- harmless in the client's hands. And THE ONE RULE for what counts as an
-- identifier-shaped query lives in public.cvx_search_is_deep, read by both
-- functions, so the two can never disagree about when a search is deep.
--
-- cvx_list_facets calls the list function once and needs nothing.

CREATE OR REPLACE FUNCTION public.cvx_search_is_deep(p_search text, p_deep boolean)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $rule$
  -- A commit sha (7–40 hex characters, no dashes) is a name someone was
  -- handed that lives nowhere but message bodies, so it always searches
  -- them. A UUID-shaped id is served instantly by the id columns the filter
  -- admits; prose keeps the opt-in toggle.
  SELECT coalesce(p_deep, false)
      OR (nullif(btrim(coalesce(p_search, '')), '') IS NOT NULL
          AND btrim(p_search) ~ '^[0-9a-fA-F]{7,40}$');
$rule$;

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
      public.cvx_audience(cs.provider, s.source_app, s.origin_class, s.conversation_type)
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

CREATE OR REPLACE FUNCTION public.cvx_list_scope_counts(p_search text DEFAULT NULL::text, p_deep boolean DEFAULT false, p_archived text DEFAULT 'active'::text, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scope text;
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- THE PROBE RUNS ONCE. This function calls cvx_list_scoped once per scope
  -- and once per organization (fifteen times for a twelve-org account), and
  -- each call used to re-run the ~1.7 s message-body probe: 11.2 s measured,
  -- a statement timeout from the page. The hit set is computed here, once,
  -- and handed to every call as p_filters->'__deep_hits'.
  IF v_search IS NOT NULL
     AND public.cvx_search_is_deep(v_search, p_deep)
     AND NOT (v_filters ? '__deep_hits') THEN
    v_filters := v_filters || jsonb_build_object(
      '__deep_hits',
      coalesce((SELECT jsonb_agg(h) FROM public.cvx_deep_hits(v_search) AS h), '[]'::jsonb));
  END IF;

  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.cvx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, v_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown. Labels come from THIS query,
  -- never a Redux slice — a tab bar must be self-sufficient.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = (select auth.uid())
  LEFT JOIN LATERAL public.cvx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, v_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

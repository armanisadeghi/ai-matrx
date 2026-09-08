-- Q12: the three buckets a person actually thinks in, as ONE derived axis.
--
-- Arman's ruling (2026-09-07): the top of /work/conversations splits into
--   * internal — runs the platform started for itself while the app works
--                (subagents, workflow steps, scheduled jobs, podcast builds,
--                research sweeps, client-auto page runs, hindsight replays);
--   * chat     — conversations a person started directly, from any AI Matrx
--                surface (chat, agent run, build, the extension, the desktop);
--   * external — sessions mirrored from an outside coding app (Claude Code,
--                Codex, Cursor, VS Code), whatever bound them.
-- Everything else (which app, which type, which provider) is a SECOND cut
-- inside a bucket, never a peer of it.
--
-- The axis is derived here, once, from facts the row already carries, so the
-- list, the facets and the filter can never disagree about which bucket a row
-- is in. Precedence: a live coding-session binding or a coding source_app is
-- external no matter what else the row says; a machine origin_class is
-- internal; a human origin is chat; rows from before provenance was recorded
-- fall back to their conversation_type; the remainder is chat.
--
-- Filter key and facet kind are both `audience`. The row shape is unchanged
-- (no new RETURNS column), so this CREATE OR REPLACE is safe under live
-- traffic and stale clients keep working.

CREATE OR REPLACE FUNCTION public.cvx_audience(
  p_provider          text,
  p_source_app        text,
  p_origin_class      text,
  p_conversation_type text
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_provider IS NOT NULL
      OR p_source_app IN ('claude-code','codex','cursor','vscode')
      THEN 'external'
    WHEN p_origin_class IN ('child_agent','workflow','scheduled','system','client_auto')
      THEN 'internal'
    WHEN p_origin_class = 'human'
      THEN 'chat'
    WHEN p_conversation_type IN ('subagent','auto','system','hindsight_replay',
                                 'workflow','scheduled','research','podcast')
      THEN 'internal'
    ELSE 'chat'
  END
$function$;

REVOKE ALL ON FUNCTION public.cvx_audience(text,text,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.cvx_audience(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.cvx_list_scoped(
  p_scope           text    DEFAULT 'mine',
  p_org_id          uuid    DEFAULT NULL,
  p_search          text    DEFAULT NULL,
  p_deep            boolean DEFAULT false,
  p_sort            text    DEFAULT 'last_activity',
  p_dir             text    DEFAULT 'desc',
  p_favorites_first boolean DEFAULT true,
  p_archived        text    DEFAULT 'active',
  p_filters         jsonb   DEFAULT '{}'::jsonb,
  p_limit           integer DEFAULT 25,
  p_offset          integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  title text,
  conversation_type text,
  origin_class text,
  source_app text,
  source_feature text,
  status text,
  message_count integer,
  is_favorite boolean,
  is_archived boolean,
  visibility text,
  provider text,
  provider_session_id text,
  workspace_name text,
  provider_account text,
  title_source text,
  category text,
  fidelity text,
  binding_status text,
  binding_origin text,
  binding_last_seen_at timestamptz,
  organization_id uuid,
  organization_name text,
  owner_email text,
  created_by uuid,
  initial_agent_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  last_activity_at timestamptz,
  is_owner boolean,
  access_level text,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'last_activity'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cvx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared') THEN
    RAISE EXCEPTION 'cvx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('last_activity','updated','created','title','conversation_type',
                    'origin_class','source_app','source_feature','message_count',
                    'provider','workspace_name','provider_account','title_source',
                    'category','fidelity','binding_status','binding_last_seen_at',
                    'organization_name','owner_email','visibility','favorite',
                    'archived') THEN
    v_sort := 'last_activity';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    -- Aliased to org_id: a bare `organization_id` resolves to the RETURNS TABLE
    -- OUT variable of the same name (42702 ambiguous reference).
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    SELECT c.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM chat.conversation c
    WHERE v_scope='mine' AND c.created_by = v_uid
    UNION ALL
    SELECT c.*, false, 'org'::text FROM chat.conversation c
    WHERE v_scope='orgs' AND c.created_by IS DISTINCT FROM v_uid
      AND c.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND c.visibility IN ('internal','public')
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
      -- The provider account as the person knows it (full email or org id),
      -- with the opaque key/fingerprint only as a fallback for rows delivered
      -- before the label existed. Credentials and tokens never enter metadata.
      coalesce(
        cs.metadata->>'provider_account_label',
        cs.metadata->>'provider_account_key',
        cs.metadata->>'provider_account_fingerprint',
        cs.metadata->>'account_fingerprint'
      ) AS s_provider_account,
      cs.metadata->>'title_source' AS s_title_source,
      coalesce(
        s.metadata->'coding_session_bridge'->>'category',
        cs.metadata->>'provider_category'
      ) AS s_category,
      cs.fidelity AS s_fidelity,
      cs.status AS s_binding_status,
      cs.origin AS s_binding_origin,
      cs.last_seen_at AS s_binding_last_seen_at,
      -- Favorite state is per-user. The conversation column is frozen history;
      -- the canonical row for this caller lives in platform.user_entity_state.
      coalesce(ues.is_favorite, false) AS s_is_favorite,
      -- THE BUCKET. One derived value, computed once, used by the filter below
      -- and by cvx_list_facets — so the count on a bucket chip is exactly what
      -- clicking it shows.
      public.cvx_audience(cs.provider, s.source_app, s.origin_class, s.conversation_type)
        AS s_audience
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN auth.users u ON u.id = s.created_by
    LEFT JOIN platform.user_entity_state ues
      ON ues.user_id = v_uid
     AND ues.entity_type = 'conversation'
     AND ues.entity_id = s.id
    -- Newest live binding only. A conversation with several historical
    -- bindings shows the one that describes it now, not an arbitrary row.
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
      AND (v_search IS NULL
        OR coalesce(j.title,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.description,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.s_workspace_name,'') ILIKE '%'||v_search||'%'
        OR coalesce(j.source_feature,'') ILIKE '%'||v_search||'%'
        OR (p_deep AND EXISTS (
              SELECT 1 FROM chat.message m
              WHERE m.conversation_id = j.id AND m.deleted_at IS NULL
                AND m.is_visible_to_user IS TRUE
                AND m.content::text ILIKE '%'||v_search||'%')))
      -- THE BUCKET filter. Multi-select like every other axis.
      AND (NOT v_f ? 'audience'
           OR j.s_audience IN (SELECT jsonb_array_elements_text(v_f->'audience'->'values')))
      -- Per-column TEXT filters
      AND (NOT v_f ? 'title' OR coalesce(j.title,'') ILIKE '%'||(v_f->'title'->>'value')||'%')
      AND (NOT v_f ? 'provider_session_id'
           OR coalesce(j.s_provider_session_id,'') ILIKE '%'||(v_f->'provider_session_id'->>'value')||'%')
      AND (NOT v_f ? 'organization_name'
           OR coalesce(j.s_org_name,'') ILIKE '%'||(v_f->'organization_name'->>'value')||'%')
      -- Per-column MULTI-SELECT filters
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
      -- A message count's finite value set is a SIZE BAND, not an integer.
      AND (NOT v_f ? 'message_count'
           OR public.cvx_size_band(j.message_count)
              IN (SELECT jsonb_array_elements_text(v_f->'message_count'->'values')))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'binding_last_seen_at'
           OR j.s_binding_last_seen_at >= public.agx_since_bucket(v_f->'binding_last_seen_at'->'values'->>0))
      -- BOOLEAN filters
      AND (NOT v_f ? 'favorite'
           OR coalesce(j.s_is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR (j.status = 'archived') IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
  ),
  -- THE HONEST ACTIVITY STAMP. Computed AFTER `filtered` on purpose: it is one
  -- index probe per surviving row (cx_message_conversation_recent_idx), so
  -- paying it before the filters would charge the whole corpus for a page.
  --
  -- GREATEST over three real events — the newest visible message, the last time
  -- the provider binding delivered, and the conversation's own birth — so a
  -- conversation with no messages yet still reports something true instead of
  -- NULL, and a mirrored provider session that has delivered but not yet
  -- imported messages does not read as dead.
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
  -- The date filter for the column lives here rather than in `filtered`,
  -- because this is the first place the value exists.
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
      -- CASE, not AND: CASE is the only construct Postgres guarantees will
      -- short-circuit, and this EXISTS scans messages.
      CASE WHEN p_deep AND v_search IS NOT NULL THEN EXISTS (
        SELECT 1 FROM chat.message m
        WHERE m.conversation_id = f.id AND m.deleted_at IS NULL
          AND m.is_visible_to_user IS TRUE
          AND m.content::text ILIKE '%'||v_search||'%')
      ELSE false END
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
    -- RELEVANCE LEADS while searching. Ordering a search by updated_at buries
    -- the thing you asked for (lib/entity-list/FEATURE.md rule 4). With no
    -- search every score is 0, so this clause is inert and favorites-first +
    -- the chosen column sort behave exactly as before.
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

REVOKE ALL ON FUNCTION public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) TO authenticated;

-- Facets: the bucket joins the unfiltered facet family so each bucket chip
-- carries a TRUE count, and a second `audience_*` family is counted INSIDE
-- each bucket so the secondary chips (which app / which run type) under a
-- selected bucket show the number that clicking them will produce.
CREATE OR REPLACE FUNCTION public.cvx_list_facets(
  p_scope    text    DEFAULT 'mine',
  p_org_id   uuid    DEFAULT NULL,
  p_search   text    DEFAULT NULL,
  p_deep     boolean DEFAULT false,
  p_archived text    DEFAULT 'active'
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.conversation_type, r.origin_class, r.source_app, r.source_feature,
           r.provider, r.workspace_name, r.provider_account, r.title_source,
           r.category, r.fidelity, r.binding_status, r.visibility, r.owner_email,
           r.organization_name, r.access_level, r.message_count,
           r.is_favorite, r.is_archived,
           public.cvx_audience(r.provider, r.source_app, r.origin_class, r.conversation_type)
             AS audience
    FROM public.cvx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      false, p_archived, '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'audience'::text, b.audience, count(*) FROM base b GROUP BY 2
  UNION ALL
  -- Second cut inside each bucket: app for chat + external, run type for internal.
  SELECT 'audience_source_app'::text, b.audience||':'||coalesce(nullif(b.source_app,''),'__none__'), count(*)
    FROM base b WHERE b.audience IN ('chat','external') GROUP BY 2
  UNION ALL
  SELECT 'audience_conversation_type'::text, b.audience||':'||b.conversation_type, count(*)
    FROM base b WHERE b.audience = 'internal' GROUP BY 2
  UNION ALL
  SELECT 'conversation_type'::text, b.conversation_type, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'origin_class'::text, b.origin_class, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'source_app'::text, coalesce(nullif(b.source_app,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'source_feature'::text, coalesce(nullif(b.source_feature,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'provider'::text, coalesce(b.provider,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'workspace_name'::text, coalesce(b.workspace_name,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'provider_account'::text, coalesce(b.provider_account,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'title_source'::text, coalesce(b.title_source,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'category'::text, coalesce(b.category,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'fidelity'::text, coalesce(b.fidelity,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'binding_status'::text, coalesce(b.binding_status,'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'visibility'::text, b.visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, coalesce(nullif(b.owner_email,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, coalesce(nullif(b.organization_name,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'access_level'::text, b.access_level, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'message_count'::text, public.cvx_size_band(b.message_count), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'favorite'::text, 'only', count(*) FILTER (WHERE b.is_favorite) FROM base b
  UNION ALL
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b;
END;
$function$;

REVOKE ALL ON FUNCTION public.cvx_list_facets(text,uuid,text,boolean,text) FROM public;
GRANT EXECUTE ON FUNCTION public.cvx_list_facets(text,uuid,text,boolean,text) TO authenticated;

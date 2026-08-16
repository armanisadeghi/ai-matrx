-- cvx_list_scoped — the canonical scoped-list RPC family for conversations.
--
-- Hand-written from the template in lib/list-scope/FEATURE.md; `agx_list_scoped`
-- (agents) is the worked reference. Powers the table view on /work/conversations
-- through lib/entity-list.
--
-- APP POLICY, enforced here: every column the table can show sorts AND filters
-- SERVER-SIDE over the whole result set. A control that only narrows the loaded
-- page is worse than no control.
--
-- What is conversation-specific:
--
--   * ONE conversation may carry a provider binding (`chat.coding_session`).
--     The newest live binding is joined LATERALLY so provider, workspace,
--     provider account, fidelity, delivery time and title provenance are real
--     sortable/filterable columns rather than a per-row round trip.
--   * `title_source` is projected because a derived title must never be
--     mistaken for the provider's own label. `first_prompt` (or absent) means
--     AI Matrx derived it; anything else names the provider that supplied it.
--   * `conversation_type` is the honesty axis. ~4.6k rows are
--     `conversation_type='subagent'` internal machine runs (batch derivations,
--     sweeps, meta-builder calls). The DEFAULT list narrows to the
--     human-relevant types; the surface exposes that as a visible, clearable
--     filter with an explicit "Machine runs" door — never a silent hide.
--
-- Filter bag shape (mirrors MatrxDataTable's ColumnFilterValue):
--   {"title":             {"kind":"text",   "value":"seo"}}
--   {"conversation_type": {"kind":"select", "values":["standard","workflow"]}}
--   {"favorite":          {"kind":"boolean","value":true}}
--   {"updated":           {"kind":"select", "values":["7d"]}}
-- '__none__' is the sentinel for "has no value".
--
-- Date buckets reuse `public.agx_since_bucket` deliberately: it is a generic
-- public helper with no agent semantics, and a second copy is exactly the
-- duplication reuse-first forbids.

DROP FUNCTION IF EXISTS public.cvx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.cvx_list_scope_counts(text, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.cvx_list_facets(text, uuid, text, boolean, text);

-- A message count's finite value set is a SIZE BAND, not an integer: nobody
-- filters for "exactly 37 messages". One function so the filter predicate and
-- the facet options can never disagree about where a band starts.
CREATE OR REPLACE FUNCTION public.cvx_size_band(p_count integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $band$
  SELECT CASE
    WHEN coalesce(p_count, 0) = 0 THEN 'empty'
    WHEN p_count <= 5   THEN '1-5'
    WHEN p_count <= 20  THEN '6-20'
    WHEN p_count <= 100 THEN '21-100'
    ELSE '100+'
  END;
$band$;
GRANT EXECUTE ON FUNCTION public.cvx_size_band(integer) TO authenticated;

-- ── RELEVANCE ───────────────────────────────────────────────────────────────
--
-- Rule 4 of lib/entity-list/FEATURE.md, learned the hard way on /agents/all:
-- NEVER ship a flat `ILIKE OR` ordered by `updated_at`. A title match has to
-- outrank a passing mention in a description, and ranking must happen BEFORE
-- LIMIT, which only the server can do.
--
-- Same tier SHAPE as `public.agx_search_score` (the proven implementation) with
-- the conversation's own fields substituted. It is NOT a second copy of that
-- function and is deliberately not in its parity fixture: agents rank on
-- name/category/tags, conversations rank on title/workspace/provider session.
--
--   id exact                100000   paste a conversation id and land on it
--   provider session exact   20000   paste a Claude Code session id, same deal
--   title exact              10000
--   title starts-with         5000
--   id partial                5000
--   provider session partial  4000
--   title word-boundary       3000   "seo" beats "seoul"
--   title contains            2000
--   description exact         1000
--   description contains       500
--   workspace                  300
--   source feature / app       200
--   provider account           200
--   message body                50   deep hits sort below every metadata hit

CREATE OR REPLACE FUNCTION public.cvx_search_score(
  p_query            text,
  p_id               uuid,
  p_title            text,
  p_description      text,
  p_workspace        text,
  p_source_feature   text,
  p_source_app       text,
  p_provider_account text,
  p_provider_session text,
  p_deep_hit         boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  ti    text := lower(coalesce(p_title, ''));
  ds    text := lower(coalesce(p_description, ''));
  idt   text := lower(p_id::text);
  ses   text := lower(coalesce(p_provider_session, ''));
  qesc  text;
  term  text;
  terms text[];
  term_hits integer := 0;
BEGIN
  IF q = '' THEN RETURN 0; END IF;
  -- Reused, not re-implemented: the escaper is generic regex hygiene with no
  -- agent semantics in it.
  qesc := public.agx_escape_regex(q);

  IF ti = q THEN score := score + 10000;
  ELSIF ti LIKE q || '%' THEN score := score + 5000;
  ELSIF ti ~ ('\m' || qesc || '\M') THEN score := score + 3000;
  ELSIF position(q in ti) > 0 THEN score := score + 2000;
  END IF;

  IF ds = q THEN score := score + 1000;
  ELSIF position(q in ds) > 0 THEN score := score + 500;
  END IF;

  IF position(q in lower(coalesce(p_workspace, ''))) > 0 THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_source_feature, ''))) > 0 THEN score := score + 200; END IF;
  IF position(q in lower(coalesce(p_source_app, ''))) > 0 THEN score := score + 200; END IF;
  IF position(q in lower(coalesce(p_provider_account, ''))) > 0 THEN score := score + 200; END IF;

  IF ses = q THEN score := score + 20000;
  ELSIF ses <> '' AND position(q in ses) > 0 THEN score := score + 4000;
  END IF;

  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  -- Multi-term: every term must land somewhere, so "seo audit" does not
  -- degrade into a loose OR that returns every audit and every SEO row.
  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (
           position(term in ti) > 0
        OR position(term in ds) > 0
        OR position(term in lower(coalesce(p_workspace, ''))) > 0
        OR position(term in lower(coalesce(p_source_feature, ''))) > 0
      ) THEN
        term_hits := term_hits + 1;
        IF position(term in ti) > 0 THEN score := score + 400;
        ELSE score := score + 100;
        END IF;
      END IF;
    END LOOP;
    IF term_hits < array_length(terms, 1) THEN score := 0; END IF;
  END IF;

  IF score = 0 AND p_deep_hit THEN score := 50; END IF;

  RETURN score;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.cvx_search_score(text,uuid,text,text,text,text,text,text,text,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.cvx_list_scoped(
  p_scope           text    DEFAULT 'mine',
  p_org_id          uuid    DEFAULT NULL,
  p_search          text    DEFAULT NULL,
  p_deep            boolean DEFAULT false,
  p_sort            text    DEFAULT 'updated',
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
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'cvx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared') THEN
    RAISE EXCEPTION 'cvx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','title','conversation_type','origin_class',
                    'source_app','source_feature','message_count','provider',
                    'workspace_name','provider_account','title_source','fidelity',
                    'binding_status','binding_last_seen_at','organization_name',
                    'owner_email','visibility','favorite','archived') THEN
    v_sort := 'updated';
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
      -- Display-safe account label first; opaque fingerprints only as a
      -- fallback. Never an email or a token from provider metadata.
      coalesce(
        cs.metadata->>'provider_account_label',
        cs.metadata->>'provider_account_key',
        cs.metadata->>'provider_account_fingerprint',
        cs.metadata->>'account_fingerprint'
      ) AS s_provider_account,
      cs.metadata->>'title_source' AS s_title_source,
      cs.fidelity AS s_fidelity,
      cs.status AS s_binding_status,
      cs.origin AS s_binding_origin,
      cs.last_seen_at AS s_binding_last_seen_at
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN auth.users u ON u.id = s.created_by
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
           OR coalesce(j.is_favorite,false) IS NOT DISTINCT FROM (v_f->'favorite'->>'value')::boolean)
      AND (NOT v_f ? 'archived'
           OR (j.status = 'archived') IS NOT DISTINCT FROM (v_f->'archived'->>'value')::boolean)
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
    FROM filtered f
  ),
  counted AS (SELECT s.*, count(*) OVER () AS s_total FROM scored s)
  SELECT
    c.id, c.title, c.conversation_type, c.origin_class, c.source_app,
    c.source_feature, c.status, c.message_count, c.is_favorite,
    (c.status = 'archived'), c.visibility::text,
    c.s_provider, c.s_provider_session_id, c.s_workspace_name,
    c.s_provider_account, c.s_title_source, c.s_fidelity,
    c.s_binding_status, c.s_binding_origin, c.s_binding_last_seen_at,
    c.organization_id, c.s_org_name, c.s_owner_email, c.created_by,
    c.initial_agent_id, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_total
  FROM counted c
  ORDER BY
    -- RELEVANCE LEADS while searching. Ordering a search by updated_at buries
    -- the thing you asked for (lib/entity-list/FEATURE.md rule 4). With no
    -- search every score is 0, so this clause is inert and favorites-first +
    -- the chosen column sort behave exactly as before.
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN p_favorites_first THEN c.is_favorite END DESC NULLS LAST,
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
    CASE WHEN v_sort='favorite' AND v_dir='desc' THEN c.is_favorite END DESC,
    CASE WHEN v_sort='favorite' AND v_dir='asc' THEN c.is_favorite END ASC,
    CASE WHEN v_sort='archived' AND v_dir='desc' THEN (c.status='archived') END DESC,
    CASE WHEN v_sort='archived' AND v_dir='asc' THEN (c.status='archived') END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

REVOKE ALL ON FUNCTION public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals, honoring every non-scope filter so a tab's number always
-- equals what clicking that tab actually shows.
CREATE OR REPLACE FUNCTION public.cvx_list_scope_counts(
  p_search   text    DEFAULT NULL,
  p_deep     boolean DEFAULT false,
  p_archived text    DEFAULT 'active',
  p_filters  jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.cvx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown. Labels come from THIS query,
  -- never a Redux slice — a tab bar must be self-sufficient.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.cvx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.cvx_list_scope_counts(text,boolean,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.cvx_list_scope_counts(text,boolean,text,jsonb) TO authenticated;

-- Filter-panel options WITH counts, for the current scope + search. Deliberately
-- NOT narrowed by the column selection itself: a facet list that hides the
-- option you just deselected traps the user inside their own filter.
--
-- This is what makes the machine-run default honest — the `conversation_type`
-- facet always reports the true subagent count, so the door to the hidden rows
-- carries its own number.
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
           r.fidelity, r.binding_status, r.visibility, r.owner_email,
           r.organization_name, r.access_level, r.message_count,
           r.is_favorite, r.is_archived
    FROM public.cvx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      false, p_archived, '{}'::jsonb, 1000000, 0) r
  )
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

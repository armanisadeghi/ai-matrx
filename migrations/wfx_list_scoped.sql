-- wfx_* — the scoped-list RPC family for `/workflows/all`.
--
-- Hand-written from the template in lib/list-scope/FEATURE.md, with
-- `agx_list_scoped_v3_all_columns.sql` (agents) and `trx_list_scoped.sql`
-- (transcripts) as the worked references. Four functions:
--
--   mtx_search_score      — THE generic relevance scorer (see below)
--   wfx_bucket_matches    — step/run count buckets, so a numeric column filters
--   wfx_list_scoped       — one page of rows + the true total
--   wfx_list_scope_counts — every scope tab's true total, with org labels
--   wfx_list_facets       — filter OPTIONS with counts for every finite column
--
-- Owner column is `created_by` (agents use `user_id` — checking the table
-- rather than assuming is invariant 4 of lib/list-scope/FEATURE.md).
-- `iam.permissions.resource_type` for this entity is 'workflow', matching the
-- table's own canonical RLS policies.

-- ── THE GENERIC SCORER ──────────────────────────────────────────────────────
-- `agx_search_score` and `trx_search_score` are the SAME function with
-- different field names: id / name / description / some 300-tier text fields /
-- tags / owner_email / some 100-tier text fields / deep. Writing a fourth
-- near-identical copy for workflows would be the "second implementation of
-- something we already own" this repo forbids, so the extra fields become two
-- arrays and the function becomes reusable by any surface.
--
-- Tiers are IDENTICAL to agx_search_score (which mirrors
-- features/agents/search/score.ts). Parity with the shared fixture
-- (features/agents/search/__fixtures__/search-score-parity.json) is what makes
-- this a reuse rather than a fork:
--     agx: p_extra_300 = {category},  p_extra_100 = {model_id, agent_type}
--     trx: p_extra_300 = {folder},    p_extra_100 = {kind}
--     wfx: p_extra_300 = {category},  p_extra_100 = {last_run_status}
--
-- Retrofitting agx_list_scoped / trx_list_scoped onto this generic is a
-- mechanical follow-up deliberately NOT bundled here: both are live surfaces
-- whose scorers are guarded by a parity fixture, and re-patching their function
-- bodies inside a workflow-list change would put them at risk for no gain.
CREATE OR REPLACE FUNCTION public.mtx_search_score(
  p_query       text,
  p_id          uuid,
  p_name        text,
  p_description text,
  p_tags        text[],
  p_owner_email text,
  p_extra_300   text[] DEFAULT ARRAY[]::text[],
  p_extra_100   text[] DEFAULT ARRAY[]::text[],
  p_deep_hit    boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  nm    text := lower(coalesce(p_name, ''));
  ds    text := lower(coalesce(p_description, ''));
  idt   text := lower(p_id::text);
  qesc  text;
  term  text;
  terms text[];
  term_hits integer := 0;
BEGIN
  IF q = '' THEN RETURN 0; END IF;
  qesc := public.agx_escape_regex(q);

  -- ── Name: the dominant signal ────────────────────────────────────────────
  IF nm = q THEN score := score + 10000;
  ELSIF nm LIKE q || '%' THEN score := score + 5000;
  ELSIF nm ~ ('\m' || qesc || '\M') THEN score := score + 3000;
  ELSIF position(q in nm) > 0 THEN score := score + 2000;
  END IF;

  -- ── Description ──────────────────────────────────────────────────────────
  IF ds = q THEN score := score + 1000;
  ELSIF position(q in ds) > 0 THEN score := score + 500;
  END IF;

  -- ── Secondary fields ─────────────────────────────────────────────────────
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_extra_300, ARRAY[]::text[])) e
             WHERE position(q in lower(coalesce(e, ''))) > 0) THEN
    score := score + 300;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
             WHERE position(q in lower(t)) > 0) THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_owner_email, ''))) > 0 THEN score := score + 200; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_extra_100, ARRAY[]::text[])) e
             WHERE position(q in lower(coalesce(e, ''))) > 0) THEN
    score := score + 100;
  END IF;

  -- ── Id: an exact UUID always wins outright ───────────────────────────────
  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  -- ── Multi-term fallback ──────────────────────────────────────────────────
  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (
           position(term in nm) > 0
        OR position(term in ds) > 0
        OR EXISTS (SELECT 1 FROM unnest(coalesce(p_extra_300, ARRAY[]::text[])) e
                   WHERE position(term in lower(coalesce(e, ''))) > 0)
        OR EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
                   WHERE position(term in lower(t)) > 0)
      ) THEN
        term_hits := term_hits + 1;
        IF position(term in nm) > 0 THEN score := score + 400;
        ELSE score := score + 100;
        END IF;
      END IF;
    END LOOP;
    -- All-or-nothing: a partial term match is not a match.
    IF term_hits < array_length(terms, 1) THEN score := 0; END IF;
  END IF;

  -- ── Deep (step body) hits rank below every metadata hit ──────────────────
  IF score = 0 AND p_deep_hit THEN score := 50; END IF;

  RETURN score;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mtx_search_score(text,uuid,text,text,text[],text,text[],text[],boolean) TO authenticated;

-- ── Numeric buckets ─────────────────────────────────────────────────────────
-- A count column's finite value set is "how many", so Steps and Runs filter
-- like every other column (app policy: no column is exempt).
CREATE OR REPLACE FUNCTION public.wfx_bucket_matches(p_n bigint, p_bucket text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_bucket
    WHEN '0'     THEN coalesce(p_n, 0) = 0
    WHEN '1-5'   THEN p_n >= 1 AND p_n <= 5
    WHEN '6-20'  THEN p_n >= 6 AND p_n <= 20
    WHEN 'gt20'  THEN p_n > 20
    ELSE false END;
$$;
GRANT EXECUTE ON FUNCTION public.wfx_bucket_matches(bigint, text) TO authenticated;

DROP FUNCTION IF EXISTS public.wfx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.wfx_list_scope_counts(text, boolean, text, jsonb);
DROP FUNCTION IF EXISTS public.wfx_list_facets(text, uuid, text, boolean, text);

CREATE OR REPLACE FUNCTION public.wfx_list_scoped(
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
  id uuid, name text, description text, category text, tags text[],
  is_active boolean, is_archived boolean, is_favorite boolean,
  visibility text, created_by uuid, organization_id uuid,
  organization_name text, version integer,
  created_at timestamptz, updated_at timestamptz,
  step_count integer, run_count bigint,
  last_run_id uuid, last_run_status text, last_run_at timestamptz,
  is_owner boolean, access_level text, owner_email text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir,'desc'))='asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  -- Column filters, keyed by column id. '__none__' is the sentinel for
  -- "has no value" (uncategorized / untagged / never run).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'wfx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'wfx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived','steps','runs','last_run','status') THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    -- Aliased to org_id on purpose: a bare `organization_id` resolves to the
    -- RETURNS TABLE OUT variable of the same name (42702 ambiguous reference).
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    SELECT d.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM workflow.definition d WHERE v_scope='mine' AND d.created_by = v_uid
    UNION ALL
    SELECT d.*, false, 'org'::text FROM workflow.definition d
    WHERE v_scope='orgs' AND d.created_by IS DISTINCT FROM v_uid
      AND d.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND d.visibility IN ('internal','public')
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
    WHERE v_scope='public' AND d.created_by IS DISTINCT FROM v_uid AND d.visibility='public'
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
    LEFT JOIN auth.users u ON u.id = s.created_by
    -- Same lateral the catalog view uses: the run facts WITHOUT shipping the
    -- nodes/edges jsonb into the client.
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
      -- A workflow that has never run has NO status; '__none__' is how the
      -- filter panel offers "never run" beside the real statuses.
      AND (NOT v_f ? 'status'
           OR coalesce(nullif(j.s_last_run_status,''), '__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'status'->'values')))
      AND (NOT v_f ? 'tags'
           OR (coalesce(j.tags, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.tags,1),0) = 0))
      -- DATE filters: a date column's finite value set is "how recently".
      AND (NOT v_f ? 'updated'
           OR j.updated_at >= public.agx_since_bucket(v_f->'updated'->'values'->>0))
      AND (NOT v_f ? 'created'
           OR j.created_at >= public.agx_since_bucket(v_f->'created'->'values'->>0))
      AND (NOT v_f ? 'last_run'
           OR j.s_last_run_at >= public.agx_since_bucket(v_f->'last_run'->'values'->>0))
      -- NUMERIC bucket filters
      AND (NOT v_f ? 'steps'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'steps'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_steps::bigint, b)))
      AND (NOT v_f ? 'runs'
           OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_f->'runs'->'values') b
                      WHERE public.wfx_bucket_matches(j.s_runs, b)))
      -- BOOLEAN filters
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
    c.visibility::text, c.created_by, c.organization_id, c.s_org_name, c.version,
    c.created_at, c.updated_at, c.s_steps, c.s_runs,
    c.s_last_run_id, c.s_last_run_status, c.s_last_run_at,
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
    CASE WHEN v_sort='steps' AND v_dir='desc' THEN c.s_steps END DESC,
    CASE WHEN v_sort='steps' AND v_dir='asc' THEN c.s_steps END ASC,
    CASE WHEN v_sort='runs' AND v_dir='desc' THEN c.s_runs END DESC,
    CASE WHEN v_sort='runs' AND v_dir='asc' THEN c.s_runs END ASC,
    -- NULLS LAST both ways: "never run" belongs at the bottom of a last-run
    -- sort in either direction, not floated to the top of the ascending one.
    CASE WHEN v_sort='last_run' AND v_dir='desc' THEN c.s_last_run_at END DESC NULLS LAST,
    CASE WHEN v_sort='last_run' AND v_dir='asc' THEN c.s_last_run_at END ASC NULLS LAST,
    CASE WHEN v_sort='status' AND v_dir='desc' THEN lower(coalesce(c.s_last_run_status,'')) END DESC,
    CASE WHEN v_sort='status' AND v_dir='asc' THEN lower(coalesce(c.s_last_run_status,'')) END ASC,
    -- Invariant 1: every ORDER BY ends in id, or pages silently drop rows.
    c.id
  LIMIT greatest(coalesce(p_limit,25),1) OFFSET greatest(coalesce(p_offset,0),0);
END;
$function$;

REVOKE ALL ON FUNCTION public.wfx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.wfx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals + the label of each narrowing option, honoring every
-- non-scope filter so a tab's number always equals what clicking it shows.
CREATE OR REPLACE FUNCTION public.wfx_list_scope_counts(
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
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.wfx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- One row per non-personal org the caller belongs to, WITH its name. Personal
  -- orgs are excluded: their content IS "Mine", and surfacing it again under My
  -- Orgs would double-count the same rows in two tabs.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.wfx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.wfx_list_scope_counts(text,boolean,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.wfx_list_scope_counts(text,boolean,text,jsonb) TO authenticated;

-- Filter-panel options WITH counts, for the current scope + search. Not
-- narrowed by the selection itself: a facet list that hides the option you just
-- deselected traps the user inside their own filter.
CREATE OR REPLACE FUNCTION public.wfx_list_facets(
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
    SELECT r.category, r.tags, r.is_favorite, r.is_archived, r.visibility,
           r.access_level, r.version, r.organization_name, r.owner_email,
           r.last_run_status, r.step_count, r.run_count
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
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b;
END;
$function$;

REVOKE ALL ON FUNCTION public.wfx_list_facets(text,uuid,text,boolean,text) FROM public;
GRANT EXECUTE ON FUNCTION public.wfx_list_facets(text,uuid,text,boolean,text) TO authenticated;

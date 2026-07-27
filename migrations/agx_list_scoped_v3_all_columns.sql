-- agx_list_scoped v3 — EVERY column sortable and filterable (app policy).
--
-- Supersedes v2 (agx_list_scoped_v2_filters.sql). The v2 overloads are dropped
-- rather than left to accumulate.
--
-- What changed and why:
--   * The per-column filter params (p_favorites / p_categories / p_tags)
--     collapse into ONE `p_filters jsonb` bag keyed by column id. The table
--     headers and the Filters panel now write the SAME structure, so a filter
--     set from a column header and the same filter set from the panel are
--     literally the same query — they cannot drift.
--   * p_sort accepts every column the table can show, not four of them. A
--     header that sorts one page and calls it "sorted by Name" is worse than a
--     header that does not sort, so if it sorts at all it sorts server-side.
--   * agx_list_facets covers every finite-valued column (visibility, access,
--     version, org, owner...) so each column filter offers real OPTIONS with
--     counts instead of a bare text box.
--   * agx_since_bucket + `updated` / `created` filters: a date column's finite
--     value set is "how recently", not "which exact timestamp".
--
-- Filter bag shape (mirrors MatrxDataTable's ColumnFilterValue):
--   {"name":      {"kind":"text",   "value":"seo"}}
--   {"category":  {"kind":"select", "values":["Analysis & Research","__none__"]}}
--   {"favorite":  {"kind":"boolean","value":true}}
--   {"updated":   {"kind":"select", "values":["7d"]}}
-- '__none__' is the sentinel for "has no value" (uncategorized / untagged).

DROP FUNCTION IF EXISTS public.agx_list_scope_counts(text, boolean, text, text, text[], text[]);
DROP FUNCTION IF EXISTS public.agx_list_scoped(text, uuid, text, boolean, text, text, boolean, text, text, text[], text[], integer, integer);
DROP FUNCTION IF EXISTS public.agx_list_facets(text, uuid, text, boolean, text);

CREATE OR REPLACE FUNCTION public.agx_since_bucket(p_bucket text)
RETURNS timestamptz
LANGUAGE sql IMMUTABLE
AS $bucket$
  SELECT CASE p_bucket
    WHEN '1h'  THEN now() - interval '1 hour'
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d'  THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    WHEN '1y'  THEN now() - interval '1 year'
    ELSE NULL
  END;
$bucket$;
GRANT EXECUTE ON FUNCTION public.agx_since_bucket(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.agx_list_scoped(
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
  id uuid, agent_type text, name text, description text, model_id uuid,
  category text, tags text[], is_active boolean, is_archived boolean,
  is_favorite boolean, visibility text, user_id uuid, organization_id uuid,
  organization_name text, project_id uuid, task_id uuid, source_agent_id uuid,
  version integer, created_at timestamptz, updated_at timestamptz,
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
  -- "has no value" (uncategorized / untagged).
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'agx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'agx_list_scoped: unknown scope %', v_scope; END IF;
  -- Whitelist covers EVERY column the table can show. Anything else falls back
  -- rather than erroring, so a stale client can never break the page.
  IF v_sort NOT IN ('updated','created','name','description','category','tags',
                    'organization_name','owner_email','access_level','visibility',
                    'version','favorite','archived') THEN
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
    SELECT a.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM agent.definition a WHERE v_scope='mine' AND a.user_id = v_uid
    UNION ALL
    SELECT a.*, false, 'org'::text FROM agent.definition a
    WHERE v_scope='orgs' AND a.user_id IS DISTINCT FROM v_uid
      AND a.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND a.visibility IN ('internal','public')
    UNION ALL
    SELECT a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND a.user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (a.id) a.*, false, perm.permission_level::text FROM agent.definition a
    JOIN iam.permissions perm ON perm.resource_type='agent' AND perm.resource_id=a.id
      AND perm.granted_to_organization_id IN (
        SELECT om.organization_id FROM iam.organization_member om WHERE om.user_id=v_uid)
    WHERE v_scope='shared' AND a.user_id IS DISTINCT FROM v_uid
      AND NOT EXISTS (SELECT 1 FROM iam.permissions p2 WHERE p2.resource_type='agent'
        AND p2.resource_id=a.id AND p2.granted_to_user_id=v_uid)
    UNION ALL
    SELECT a.*, false, 'public'::text FROM agent.definition a
    WHERE v_scope='public' AND a.user_id IS DISTINCT FROM v_uid AND a.visibility='public'
  ),
  joined AS (
    SELECT s.*, o.name AS s_org_name, u.email::text AS s_owner_email
    FROM scoped s
    LEFT JOIN iam.organizations o ON o.id = s.organization_id
    LEFT JOIN auth.users u ON u.id = s.user_id
  ),
  filtered AS (
    SELECT j.* FROM joined j
    WHERE j.agent_type='user' AND j.deleted_at IS NULL
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
  counted AS (SELECT f.*, count(*) OVER () AS s_total FROM filtered f)
  SELECT c.id, c.agent_type, c.name, c.description, c.model_id, c.category,
    coalesce(c.tags, ARRAY[]::text[]), c.is_active, c.is_archived, c.is_favorite,
    c.visibility::text, c.user_id, c.organization_id, c.s_org_name, c.project_id,
    c.task_id, c.source_agent_id, c.version, c.created_at, c.updated_at,
    c.s_is_owner, c.s_access, c.s_owner_email, c.s_total
  FROM counted c
  ORDER BY
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

REVOKE ALL ON FUNCTION public.agx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals, honoring every non-scope filter so a tab's number always
-- equals what clicking that tab actually shows.
CREATE OR REPLACE FUNCTION public.agx_list_scope_counts(
  p_search   text    DEFAULT NULL,
  p_deep     boolean DEFAULT false,
  p_archived text    DEFAULT 'active',
  p_filters  jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, org_id uuid, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, coalesce(max(r.total_count), 0)
    FROM public.agx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      true, p_archived, p_filters, 1, 0) r;
  END LOOP;

  -- Per-org breakdown for the My Orgs dropdown.
  RETURN QUERY
  SELECT 'orgs'::text, o.id, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.agx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    true, p_archived, p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_list_scope_counts(text,boolean,text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_scope_counts(text,boolean,text,jsonb) TO authenticated;

-- Filter-panel options WITH counts, for the current scope + search. Not
-- narrowed by the category/tag selection itself: a facet list that hides the
-- option you just deselected traps the user inside their own filter.
CREATE OR REPLACE FUNCTION public.agx_list_facets(
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
           r.access_level, r.version, r.organization_name, r.owner_email
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
  SELECT 'archived'::text, 'archived', count(*) FILTER (WHERE b.is_archived) FROM base b;
END;
$function$;

REVOKE ALL ON FUNCTION public.agx_list_facets(text,uuid,text,boolean,text) FROM public;
GRANT EXECUTE ON FUNCTION public.agx_list_facets(text,uuid,text,boolean,text) TO authenticated;

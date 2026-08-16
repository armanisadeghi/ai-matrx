-- ivw_list_scoped — /vision-interview as ONE scoped, paged, filterable list.
--
-- NOT YET APPLIED: written by the frontend session; the orchestrator applies
-- it via the Supabase MCP + records it in public._schema_migrations
-- (source='matrx-frontend'). Idempotent (CREATE OR REPLACE throughout).
--
-- Consumer of the canonical entity-list system (template:
-- migrations/trx_list_scoped.sql / agx_list_scoped_v3_all_columns.sql; rules:
-- lib/list-scope/FEATURE.md). One source table: interview.session.
--
-- Invariants carried from the template: total order (ORDER BY ends in id),
-- soft-delete filtered, count(*) OVER () AS total_count, one p_filters jsonb
-- bag, everything filters/sorts server-side, SECURITY DEFINER enforces
-- membership itself, relevance leads the ORDER BY while searching (never a
-- flat ILIKE ordered by updated_at).
--
-- Depends on public.agx_escape_regex + public.agx_since_bucket (both live —
-- shipped with agx_list_scoped_v3_all_columns.sql).
--
-- ORCHESTRATOR NOTE: the Shared scope keys iam.permissions on
-- resource_type = 'interview_session'. Align this token with the
-- platform.shareable_resource_registry entry the backend registers for
-- interview.session before applying, if the registered token differs.

-- ── Relevance: ported from agx/trx_search_score (tiers identical) ───────────
CREATE OR REPLACE FUNCTION public.ivw_search_score(
  p_query       text,
  p_id          uuid,
  p_title       text,
  p_vision      text,
  p_stage       text,
  p_owner_email text
)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  nm    text := lower(coalesce(p_title, ''));
  ds    text := lower(coalesce(p_vision, ''));
  idt   text := lower(p_id::text);
  qesc  text;
  term  text;
  terms text[];
  term_hits integer := 0;
BEGIN
  IF q = '' THEN RETURN 0; END IF;
  qesc := public.agx_escape_regex(q);

  IF nm = q THEN score := score + 10000;
  ELSIF nm LIKE q || '%' THEN score := score + 5000;
  ELSIF nm ~ ('\m' || qesc || '\M') THEN score := score + 3000;
  ELSIF position(q in nm) > 0 THEN score := score + 2000;
  END IF;

  IF ds = q THEN score := score + 1000;
  ELSIF position(q in ds) > 0 THEN score := score + 500;
  END IF;

  IF position(q in lower(coalesce(p_owner_email, ''))) > 0 THEN score := score + 200; END IF;
  IF position(q in lower(coalesce(p_stage, ''))) > 0 THEN score := score + 100; END IF;

  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (position(term in nm) > 0 OR position(term in ds) > 0) THEN
        term_hits := term_hits + 1;
        IF position(term in nm) > 0 THEN score := score + 400;
        ELSE score := score + 100;
        END IF;
      END IF;
    END LOOP;
    IF term_hits < array_length(terms, 1) THEN score := 0; END IF;
  END IF;

  RETURN score;
END;
$function$;
GRANT EXECUTE ON FUNCTION public.ivw_search_score(text,uuid,text,text,text,text) TO authenticated;

DROP FUNCTION IF EXISTS public.ivw_list_scoped(text, uuid, text, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.ivw_list_scoped(
  p_scope   text    DEFAULT 'mine',
  p_org_id  uuid    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_sort    text    DEFAULT 'updated',
  p_dir     text    DEFAULT 'desc',
  p_filters jsonb   DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 25,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, title text, vision_statement text, stage text,
  current_round integer, open_questions bigint,
  visibility text, user_id uuid, organization_id uuid, organization_name text,
  created_at timestamptz, updated_at timestamptz,
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
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  -- Column names prefixed u_ to dodge 42702 ambiguity with the OUT params.
  unified AS (
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
    WHERE v_scope='orgs' AND u.u_user_id IS DISTINCT FROM v_uid
      AND u.u_org_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND u.u_visibility IN ('internal','public')
    UNION ALL
    -- Shared: an explicit iam grant to me…
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = 'interview_session'
      AND perm.resource_id = u.u_id
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    -- …or to one of my orgs (deterministic access_level when several exist).
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
    LEFT JOIN auth.users au ON au.id = s.u_user_id
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
    -- Score only when a real page is being fetched (counts call with LIMIT 1).
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
    -- RELEVANCE FIRST when searching — never the flat ILIKE mistake.
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

REVOKE ALL ON FUNCTION public.ivw_list_scoped(text,uuid,text,text,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.ivw_list_scoped(text,uuid,text,text,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals + My Orgs narrowing options (names AND counts from the
-- same query — never a Redux slice; see lib/list-scope/FEATURE.md).
CREATE OR REPLACE FUNCTION public.ivw_list_scope_counts(
  p_search  text  DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.ivw_list_scoped(v_scope, NULL, p_search, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.ivw_list_scoped('orgs', o.id, p_search, 'updated','desc',
    p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.ivw_list_scope_counts(text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.ivw_list_scope_counts(text,jsonb) TO authenticated;

-- Filter-panel options WITH counts for the current scope + search. Not
-- narrowed by the selection itself (a facet list that hides the option you
-- just deselected traps the user inside their own filter).
CREATE OR REPLACE FUNCTION public.ivw_list_facets(
  p_scope  text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.stage AS b_stage, r.visibility AS b_visibility,
           r.organization_name AS b_org_name, r.owner_email AS b_owner_email
    FROM public.ivw_list_scoped(p_scope, p_org_id, p_search, 'updated','desc',
      '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'stage'::text, b.b_stage, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'visibility'::text, b.b_visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, COALESCE(NULLIF(b.b_org_name,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, COALESCE(NULLIF(b.b_owner_email,''),'__none__'), count(*)
  FROM base b GROUP BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.ivw_list_facets(text,uuid,text) FROM public;
GRANT EXECUTE ON FUNCTION public.ivw_list_facets(text,uuid,text) TO authenticated;

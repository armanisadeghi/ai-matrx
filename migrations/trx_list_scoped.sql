-- trx_list_scoped — the /transcripts hub as ONE scoped, paged, filterable list.
--
-- Second consumer of the canonical entity-list system (template:
-- agx_list_scoped_v3_all_columns.sql + agx_search_score.sql; rules:
-- lib/list-scope/FEATURE.md). The hub's five row shapes collapse to ONE row
-- type with a `kind` column, per the ratified decision in
-- docs/handoffs/canonical-entity-list-extraction.md §6:
--
--   transcript — transcripts.transcripts (the Processor workspace)
--   session    — transcripts.studio_sessions, source <> 'cleanup'
--   cleanup    — transcripts.studio_sessions, source =  'cleanup'
--   unsorted   — transcripts.studio_recording_segments, detached_at NOT NULL
--                (the Scribe unsorted pool)
--
-- Active in-session recordings are CHILDREN, not list rows — they stay a
-- studio concern (nested tree is a tracked follow-up on MatrxDataTable).
--
-- Invariants carried from the template: total order (ORDER BY ends in id),
-- soft-delete filtered, count(*) OVER () AS total_count, one p_filters jsonb
-- bag, everything filters/sorts server-side, SECURITY DEFINER enforces
-- membership itself. Relevance leads the ORDER BY while searching (built in
-- from day one — the mistake in handoff §0 does not repeat).

-- ── Relevance: ported from agx_search_score (tiers identical) ───────────────
-- title≡name; folder_name+kind sit at the category tier; sessions have no
-- deep body, so p_deep_hit only ever fires for transcript segments.
CREATE OR REPLACE FUNCTION public.trx_search_score(
  p_query       text,
  p_id          uuid,
  p_title       text,
  p_description text,
  p_kind        text,
  p_folder      text,
  p_tags        text[],
  p_owner_email text,
  p_deep_hit    boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql IMMUTABLE
AS $function$
DECLARE
  q     text := btrim(lower(coalesce(p_query, '')));
  score integer := 0;
  nm    text := lower(coalesce(p_title, ''));
  ds    text := lower(coalesce(p_description, ''));
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

  IF position(q in lower(coalesce(p_folder, ''))) > 0 THEN score := score + 300; END IF;
  IF EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
             WHERE position(q in lower(t)) > 0) THEN score := score + 300; END IF;
  IF position(q in lower(coalesce(p_owner_email, ''))) > 0 THEN score := score + 200; END IF;
  IF position(q in lower(coalesce(p_kind, ''))) > 0 THEN score := score + 100; END IF;

  IF idt = q THEN score := score + 100000;
  ELSIF position(q in idt) > 0 THEN score := score + 5000;
  END IF;

  IF score = 0 AND position(' ' in q) > 0 THEN
    terms := regexp_split_to_array(q, '\s+');
    FOREACH term IN ARRAY terms LOOP
      IF term <> '' AND (
           position(term in nm) > 0
        OR position(term in ds) > 0
        OR position(term in lower(coalesce(p_folder, ''))) > 0
        OR EXISTS (SELECT 1 FROM unnest(coalesce(p_tags, ARRAY[]::text[])) t
                   WHERE position(term in lower(t)) > 0)
      ) THEN
        term_hits := term_hits + 1;
        IF position(term in nm) > 0 THEN score := score + 400;
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
GRANT EXECUTE ON FUNCTION public.trx_search_score(text,uuid,text,text,text,text,text[],text,boolean) TO authenticated;

-- Duration / word-count buckets — a numeric column's finite value set, so the
-- columns can filter like every other (app policy: no column is exempt).
CREATE OR REPLACE FUNCTION public.trx_duration_matches(p_seconds numeric, p_bucket text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_bucket
    WHEN 'lt1m'  THEN p_seconds IS NOT NULL AND p_seconds < 60
    WHEN '1-5m'  THEN p_seconds >= 60 AND p_seconds < 300
    WHEN '5-20m' THEN p_seconds >= 300 AND p_seconds < 1200
    WHEN 'gt20m' THEN p_seconds >= 1200
    WHEN '__none__' THEN p_seconds IS NULL
    ELSE false END;
$$;
GRANT EXECUTE ON FUNCTION public.trx_duration_matches(numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.trx_words_matches(p_words integer, p_bucket text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_bucket
    WHEN 'lt500'   THEN p_words IS NOT NULL AND p_words < 500
    WHEN '500-2k'  THEN p_words >= 500 AND p_words < 2000
    WHEN '2k-10k'  THEN p_words >= 2000 AND p_words < 10000
    WHEN 'gt10k'   THEN p_words >= 10000
    WHEN '__none__' THEN p_words IS NULL
    ELSE false END;
$$;
GRANT EXECUTE ON FUNCTION public.trx_words_matches(integer, text) TO authenticated;

DROP FUNCTION IF EXISTS public.trx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.trx_list_scoped(
  p_scope   text    DEFAULT 'mine',
  p_org_id  uuid    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_deep    boolean DEFAULT false,
  p_sort    text    DEFAULT 'updated',
  p_dir     text    DEFAULT 'desc',
  p_filters jsonb   DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 25,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  id uuid, kind text, title text, description text, status text,
  folder_name text, tags text[], duration_seconds numeric, word_count integer,
  is_draft boolean, session_id uuid, transcript_id uuid, segment_index integer,
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
  IF v_uid IS NULL THEN RAISE EXCEPTION 'trx_list_scoped: not authenticated'; END IF;
  IF v_scope NOT IN ('mine','orgs','shared','public') THEN
    RAISE EXCEPTION 'trx_list_scoped: unknown scope %', v_scope; END IF;
  IF v_sort NOT IN ('updated','created','title','kind','status','folder_name',
                    'tags','duration','word_count','organization_name',
                    'owner_email','visibility','draft') THEN
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
  -- One flat shape per source table, BEFORE scoping. Column names prefixed u_
  -- to dodge 42702 ambiguity with the OUT parameters.
  unified AS (
    SELECT t.id AS u_id, 'transcript'::text AS u_kind,
      coalesce(nullif(t.title,''),'Untitled transcript') AS u_title,
      coalesce(t.description,'') AS u_description,
      CASE WHEN t.is_draft THEN 'draft' ELSE 'final' END AS u_status,
      coalesce(nullif(t.folder_name,''),'Transcripts') AS u_folder,
      coalesce(t.tags, ARRAY[]::text[]) AS u_tags,
      nullif(t.metadata->>'duration','')::numeric AS u_duration,
      nullif(t.metadata->>'wordCount','')::integer AS u_words,
      coalesce(t.is_draft,false) AS u_draft,
      NULL::uuid AS u_session_id, NULL::uuid AS u_transcript_id,
      NULL::integer AS u_segment_index,
      t.visibility::text AS u_visibility, t.user_id AS u_user_id,
      t.organization_id AS u_org_id, t.created_at AS u_created, t.updated_at AS u_updated,
      (p_deep AND v_search IS NOT NULL AND t.segments::text ILIKE '%'||v_search||'%') AS u_deep_hit
    FROM transcripts.transcripts t
    WHERE t.is_deleted IS NOT TRUE AND t.deleted_at IS NULL
    UNION ALL
    SELECT s.id, CASE WHEN s.source='cleanup' THEN 'cleanup' ELSE 'session' END,
      coalesce(nullif(s.title,''),'Untitled session'), ''::text,
      coalesce(s.status,''),
      NULL::text, ARRAY[]::text[],
      nullif(s.total_duration_ms,0)::numeric / 1000.0,
      NULL::integer, false,
      NULL::uuid, s.transcript_id, NULL::integer,
      s.visibility::text, s.user_id, s.organization_id, s.created_at, s.updated_at,
      false
    FROM transcripts.studio_sessions s
    WHERE s.is_deleted IS NOT TRUE AND s.deleted_at IS NULL
    UNION ALL
    -- Detached recordings (the Scribe unsorted pool). Visibility rides the
    -- parent session's, so reach can never exceed the parent's.
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
      AND (ps.id IS NULL OR (ps.is_deleted IS NOT TRUE AND ps.deleted_at IS NULL))
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
    -- Shared: an explicit iam grant to me, on either registered resource type.
    SELECT u.*, false, perm.permission_level::text FROM unified u
    JOIN iam.permissions perm
      ON perm.resource_type = CASE WHEN u.u_kind='transcript' THEN 'transcript' ELSE 'studio_session' END
      AND perm.resource_id = CASE WHEN u.u_kind='unsorted' THEN u.u_session_id ELSE u.u_id END
      AND perm.granted_to_user_id = v_uid
    WHERE v_scope='shared' AND u.u_user_id IS DISTINCT FROM v_uid
    UNION ALL
    SELECT DISTINCT ON (u.u_id) u.*, false, perm.permission_level::text FROM unified u
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
           OR coalesce(nullif(j.u_folder,''),'__none__') IN (
                SELECT jsonb_array_elements_text(v_f->'folder_name'->'values')))
      AND (NOT v_f ? 'visibility'
           OR j.u_visibility IN (SELECT jsonb_array_elements_text(v_f->'visibility'->'values')))
      AND (NOT v_f ? 'tags'
           OR (j.u_tags && ARRAY(SELECT jsonb_array_elements_text(v_f->'tags'->'values')))
           OR ('__none__' IN (SELECT jsonb_array_elements_text(v_f->'tags'->'values'))
               AND coalesce(array_length(j.u_tags,1),0) = 0))
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
    SELECT f.*, public.trx_search_score(
      v_search, f.u_id, f.u_title, f.u_description, f.u_kind, f.u_folder,
      f.u_tags, f.s_owner_email, f.u_deep_hit
    ) AS s_score
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
    -- RELEVANCE FIRST when searching (handoff §0 — never ship the flat ILIKE).
    CASE WHEN v_search IS NOT NULL THEN c.s_score END DESC NULLS LAST,
    CASE WHEN v_sort='updated' AND v_dir='desc' THEN c.u_updated END DESC,
    CASE WHEN v_sort='updated' AND v_dir='asc' THEN c.u_updated END ASC,
    CASE WHEN v_sort='created' AND v_dir='desc' THEN c.u_created END DESC,
    CASE WHEN v_sort='created' AND v_dir='asc' THEN c.u_created END ASC,
    CASE WHEN v_sort='title' AND v_dir='desc' THEN lower(c.u_title) END DESC,
    CASE WHEN v_sort='title' AND v_dir='asc' THEN lower(c.u_title) END ASC,
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

REVOKE ALL ON FUNCTION public.trx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer) FROM public;
GRANT EXECUTE ON FUNCTION public.trx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer) TO authenticated;

-- Scope tab totals + the My Orgs narrowing options (names AND counts from the
-- same query — never a Redux slice; see lib/list-scope/FEATURE.md).
CREATE OR REPLACE FUNCTION public.trx_list_scope_counts(
  p_search  text    DEFAULT NULL,
  p_deep    boolean DEFAULT false,
  p_filters jsonb   DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine','orgs','shared','public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.trx_list_scoped(v_scope, NULL, p_search, p_deep, 'updated', 'desc',
      p_filters, 1, 0) r;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, o.id, o.name, coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.trx_list_scoped('orgs', o.id, p_search, p_deep, 'updated','desc',
    p_filters, 1, 0) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.trx_list_scope_counts(text,boolean,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.trx_list_scope_counts(text,boolean,jsonb) TO authenticated;

-- Filter-panel options WITH counts, for the current scope + search. Not
-- narrowed by the selection itself (a facet list that hides the option you
-- just deselected traps the user inside their own filter).
CREATE OR REPLACE FUNCTION public.trx_list_facets(
  p_scope  text    DEFAULT 'mine',
  p_org_id uuid    DEFAULT NULL,
  p_search text    DEFAULT NULL,
  p_deep   boolean DEFAULT false
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT r.kind AS b_kind, r.status AS b_status, r.folder_name AS b_folder,
           r.tags AS b_tags, r.visibility AS b_visibility, r.is_draft AS b_draft,
           r.organization_name AS b_org_name, r.owner_email AS b_owner_email
    FROM public.trx_list_scoped(p_scope, p_org_id, p_search, p_deep, 'updated','desc',
      '{}'::jsonb, 1000000, 0) r
  )
  SELECT 'kind'::text, b.b_kind, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'status'::text, COALESCE(NULLIF(b.b_status,''),'__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'folder_name'::text, COALESCE(NULLIF(b.b_folder,''),'__none__'), count(*)
  FROM base b WHERE b.b_kind = 'transcript' GROUP BY 2
  UNION ALL
  SELECT 'tag'::text, t.tag, count(*)
  FROM base b
  CROSS JOIN LATERAL (
    SELECT CASE WHEN coalesce(array_length(b.b_tags,1),0)=0 THEN '__none__' ELSE x END AS tag
    FROM unnest(CASE WHEN coalesce(array_length(b.b_tags,1),0)=0
                     THEN ARRAY['__none__'] ELSE b.b_tags END) x
  ) t
  WHERE b.b_kind = 'transcript'
  GROUP BY t.tag
  UNION ALL
  SELECT 'visibility'::text, b.b_visibility, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'organization_name'::text, COALESCE(NULLIF(b.b_org_name,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'owner_email'::text, COALESCE(NULLIF(b.b_owner_email,''),'__none__'), count(*)
  FROM base b GROUP BY 2
  UNION ALL
  SELECT 'draft'::text, 'draft', count(*) FILTER (WHERE b.b_draft) FROM base b;
END;
$function$;

REVOKE ALL ON FUNCTION public.trx_list_facets(text,uuid,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.trx_list_facets(text,uuid,text,boolean) TO authenticated;

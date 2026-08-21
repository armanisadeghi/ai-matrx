-- Canonical Education Library: one scoped, paged list across every artifact
-- the Create Kit flow persists. The route used to query only public fc_set
-- rows, which made private decks, assessments, study media, and generated
-- notes appear to disappear after creation.
--
-- Scope vocabulary is the platform-fixed subset: mine / shared / public.
-- The helper is private-by-grant and every public RPC is authenticated-only.

SET lock_timeout = '8s';

DROP FUNCTION IF EXISTS public.edu_library_scope_rows(text);
CREATE FUNCTION public.edu_library_scope_rows(
  p_scope text DEFAULT 'mine'
)
RETURNS TABLE(
  id uuid,
  kind text,
  subtype text,
  title text,
  description text,
  status text,
  visibility text,
  created_by uuid,
  organization_id uuid,
  organization_name text,
  created_at timestamptz,
  updated_at timestamptz,
  is_owner boolean,
  access_level text,
  owner_email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'edu_library_scope_rows: not authenticated' USING ERRCODE = '42501';
  END IF;
  IF v_scope NOT IN ('mine', 'shared', 'public') THEN
    RAISE EXCEPTION 'edu_library_scope_rows: unknown scope %', v_scope USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH unified AS (
    SELECT
      s.id AS u_id,
      'fc_set'::text AS u_kind,
      'flashcards'::text AS u_subtype,
      coalesce(nullif(s.name, ''), 'Untitled flashcard deck') AS u_title,
      coalesce(s.description, '') AS u_description,
      'ready'::text AS u_status,
      s.visibility::text AS u_visibility,
      s.created_by AS u_created_by,
      s.organization_id AS u_organization_id,
      s.created_at AS u_created_at,
      s.updated_at AS u_updated_at
    FROM education.fc_set s
    WHERE s.deleted_at IS NULL

    UNION ALL

    SELECT
      a.id,
      'assessment'::text,
      a.assessment_kind,
      coalesce(nullif(a.title, ''), 'Untitled assessment'),
      coalesce(a.description, ''),
      coalesce(nullif(a.status, ''), 'draft'),
      a.visibility::text,
      a.created_by,
      a.organization_id,
      a.created_at,
      a.updated_at
    FROM education.assessment a
    WHERE a.deleted_at IS NULL

    UNION ALL

    SELECT
      m.id,
      'study_media'::text,
      m.media_kind,
      coalesce(nullif(m.title, ''), 'Untitled study media'),
      coalesce(m.description, ''),
      coalesce(nullif(m.status, ''), 'draft'),
      m.visibility::text,
      m.created_by,
      m.organization_id,
      m.created_at,
      m.updated_at
    FROM education.study_media m
    WHERE m.deleted_at IS NULL

    UNION ALL

    SELECT
      n.id,
      'note'::text,
      'notes'::text,
      coalesce(nullif(n.label, ''), 'Untitled note'),
      coalesce(nullif(n.folder_name, ''), 'Study note'),
      'ready'::text,
      n.visibility::text,
      n.created_by,
      n.organization_id,
      n.created_at,
      n.updated_at
    FROM workbench.notes n
    WHERE n.deleted_at IS NULL
  ),
  scoped AS (
    SELECT
      u.*,
      true AS s_is_owner,
      'owner'::text AS s_access_level
    FROM unified u
    WHERE v_scope = 'mine'
      AND u.u_created_by = v_uid

    UNION ALL

    SELECT
      u.*,
      false,
      'shared'::text
    FROM unified u
    WHERE v_scope = 'shared'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND EXISTS (
        SELECT 1
        FROM iam.permissions p
        WHERE p.resource_type = u.u_kind
          AND p.resource_id = u.u_id
          AND p.status = 'active'
          AND (p.expires_at IS NULL OR p.expires_at > now())
          AND (
            p.granted_to_user_id = v_uid
            OR p.granted_to_organization_id IN (
              SELECT om.organization_id
              FROM iam.organization_member om
              WHERE om.user_id = v_uid
            )
          )
      )

    UNION ALL

    SELECT
      u.*,
      false,
      'public'::text
    FROM unified u
    WHERE v_scope = 'public'
      AND u.u_created_by IS DISTINCT FROM v_uid
      AND u.u_visibility = 'public'
  )
  SELECT
    s.u_id,
    s.u_kind,
    s.u_subtype,
    s.u_title,
    s.u_description,
    s.u_status,
    s.u_visibility,
    s.u_created_by,
    s.u_organization_id,
    o.name,
    s.u_created_at,
    s.u_updated_at,
    s.s_is_owner,
    s.s_access_level,
    au.email::text
  FROM scoped s
  LEFT JOIN iam.organizations o ON o.id = s.u_organization_id
  LEFT JOIN auth.users au ON au.id = s.u_created_by;
END;
$function$;

REVOKE ALL ON FUNCTION public.edu_library_scope_rows(text) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS public.edu_library_list_scoped(text, text, text, text, jsonb, integer, integer);
CREATE FUNCTION public.edu_library_list_scoped(
  p_scope text DEFAULT 'mine',
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'updated',
  p_dir text DEFAULT 'desc',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  kind text,
  subtype text,
  title text,
  description text,
  status text,
  visibility text,
  created_by uuid,
  organization_id uuid,
  organization_name text,
  created_at timestamptz,
  updated_at timestamptz,
  is_owner boolean,
  access_level text,
  owner_email text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_sort NOT IN (
    'updated', 'created', 'title', 'kind', 'subtype', 'status',
    'visibility', 'organization_name', 'owner_email'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT r.*
    FROM public.edu_library_scope_rows(p_scope) r
    WHERE (
      v_search IS NULL
      OR r.title ILIKE '%' || v_search || '%'
      OR r.description ILIKE '%' || v_search || '%'
      OR r.kind ILIKE '%' || v_search || '%'
      OR r.subtype ILIKE '%' || v_search || '%'
      OR coalesce(r.owner_email, '') ILIKE '%' || v_search || '%'
    )
      AND (NOT v_filters ? 'title'
           OR r.title ILIKE '%' || (v_filters->'title'->>'value') || '%')
      AND (NOT v_filters ? 'description'
           OR r.description ILIKE '%' || (v_filters->'description'->>'value') || '%')
      AND (NOT v_filters ? 'kind'
           OR r.kind IN (SELECT jsonb_array_elements_text(v_filters->'kind'->'values')))
      AND (NOT v_filters ? 'subtype'
           OR r.subtype IN (SELECT jsonb_array_elements_text(v_filters->'subtype'->'values')))
      AND (NOT v_filters ? 'status'
           OR r.status IN (SELECT jsonb_array_elements_text(v_filters->'status'->'values')))
      AND (NOT v_filters ? 'visibility'
           OR r.visibility IN (SELECT jsonb_array_elements_text(v_filters->'visibility'->'values')))
      AND (NOT v_filters ? 'organization_name'
           OR coalesce(r.organization_name, '') ILIKE '%' || (v_filters->'organization_name'->>'value') || '%')
      AND (NOT v_filters ? 'owner_email'
           OR coalesce(r.owner_email, '') ILIKE '%' || (v_filters->'owner_email'->>'value') || '%')
      AND (NOT v_filters ? 'updated'
           OR r.updated_at >= public.agx_since_bucket(v_filters->'updated'->'values'->>0))
      AND (NOT v_filters ? 'created'
           OR r.created_at >= public.agx_since_bucket(v_filters->'created'->'values'->>0))
  ),
  scored AS (
    SELECT
      f.*,
      CASE
        WHEN v_search IS NULL OR coalesce(p_limit, 25) <= 1 THEN 0
        ELSE public.mtx_search_score(
          v_search,
          f.id,
          f.title,
          f.description,
          ARRAY[]::text[],
          f.owner_email,
          ARRAY[f.kind, f.subtype, f.status],
          ARRAY[f.visibility, coalesce(f.organization_name, '')],
          false
        )
      END AS search_score
    FROM filtered f
  ),
  counted AS (
    SELECT s.*, count(*) OVER () AS row_total
    FROM scored s
  )
  SELECT
    c.id,
    c.kind,
    c.subtype,
    c.title,
    c.description,
    c.status,
    c.visibility,
    c.created_by,
    c.organization_id,
    c.organization_name,
    c.created_at,
    c.updated_at,
    c.is_owner,
    c.access_level,
    c.owner_email,
    c.row_total
  FROM counted c
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN c.search_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN c.updated_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN c.updated_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN c.created_at END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN c.created_at END ASC,
    CASE WHEN v_sort = 'title' AND v_dir = 'desc' THEN lower(c.title) END DESC,
    CASE WHEN v_sort = 'title' AND v_dir = 'asc' THEN lower(c.title) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN c.kind END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN c.kind END ASC,
    CASE WHEN v_sort = 'subtype' AND v_dir = 'desc' THEN c.subtype END DESC,
    CASE WHEN v_sort = 'subtype' AND v_dir = 'asc' THEN c.subtype END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN c.status END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN c.status END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN c.visibility END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN c.visibility END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(c.organization_name, '')) END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(c.organization_name, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(c.owner_email, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(c.owner_email, '')) END ASC,
    c.id
  LIMIT greatest(coalesce(p_limit, 25), 1)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.edu_library_list_scoped(text, text, text, text, jsonb, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edu_library_list_scoped(text, text, text, text, jsonb, integer, integer) TO authenticated;

DROP FUNCTION IF EXISTS public.edu_library_scope_counts(text, jsonb);
CREATE FUNCTION public.edu_library_scope_counts(
  p_search text DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT
      v_scope,
      NULL::uuid,
      NULL::text,
      coalesce(max(r.total_count), 0)
    FROM public.edu_library_list_scoped(
      v_scope, p_search, 'updated', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.edu_library_scope_counts(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edu_library_scope_counts(text, jsonb) TO authenticated;

DROP FUNCTION IF EXISTS public.edu_library_facets(text, text);
CREATE FUNCTION public.edu_library_facets(
  p_scope text DEFAULT 'mine',
  p_search text DEFAULT NULL
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT
      r.kind AS b_kind,
      r.subtype AS b_subtype,
      r.status AS b_status,
      r.visibility AS b_visibility
    FROM public.edu_library_list_scoped(
      p_scope, p_search, 'updated', 'desc', '{}'::jsonb, 1000000, 0
    ) r
  )
  SELECT 'kind'::text, b.b_kind, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'subtype'::text, b.b_subtype, count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'status'::text, coalesce(nullif(b.b_status, ''), '__none__'), count(*) FROM base b GROUP BY 2
  UNION ALL
  SELECT 'visibility'::text, b.b_visibility, count(*) FROM base b GROUP BY 2;
END;
$function$;

REVOKE ALL ON FUNCTION public.edu_library_facets(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.edu_library_facets(text, text) TO authenticated;

COMMENT ON FUNCTION public.edu_library_list_scoped(text, text, text, text, jsonb, integer, integer)
IS 'Canonical scoped Education artifact library across decks, assessments, study media, and notes.';

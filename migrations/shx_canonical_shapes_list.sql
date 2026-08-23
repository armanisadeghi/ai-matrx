-- Canonical /shapes/all inventory RPCs.
--
-- Hand-written from lib/list-scope/FEATURE.md and the proven agx/trx list
-- family. The functions deliberately classify the fixed four supported
-- scopes (mine, orgs, shared, public), rank search before pagination, and
-- make every displayed column sortable and filterable server-side.

CREATE OR REPLACE FUNCTION public.shx_since_bucket(p_bucket text)
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE p_bucket
    WHEN '1h' THEN now() - interval '1 hour'
    WHEN '24h' THEN now() - interval '24 hours'
    WHEN '7d' THEN now() - interval '7 days'
    WHEN '30d' THEN now() - interval '30 days'
    WHEN '90d' THEN now() - interval '90 days'
    WHEN '1y' THEN now() - interval '1 year'
    ELSE '-infinity'::timestamptz
  END;
$$;

CREATE OR REPLACE FUNCTION public.shx_search_score(
  p_query text,
  p_label text,
  p_kind text,
  p_family text,
  p_owner_email text,
  p_organization_name text
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_query IS NULL THEN 0
    WHEN lower(p_label) = lower(p_query) THEN 1000
    WHEN lower(p_kind) = lower(p_query) THEN 950
    WHEN lower(p_label) LIKE lower(p_query) || '%' THEN 850
    WHEN lower(p_kind) LIKE lower(p_query) || '%' THEN 800
    WHEN p_label ILIKE '%' || p_query || '%' THEN 650
    WHEN p_kind ILIKE '%' || p_query || '%' THEN 600
    WHEN coalesce(p_family, '') ILIKE '%' || p_query || '%' THEN 400
    WHEN coalesce(p_organization_name, '') ILIKE '%' || p_query || '%' THEN 250
    WHEN coalesce(p_owner_email, '') ILIKE '%' || p_query || '%' THEN 200
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.shx_list_scoped(
  p_scope text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_deep boolean DEFAULT false,
  p_sort text DEFAULT 'updated',
  p_dir text DEFAULT 'desc',
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  kind text,
  label text,
  family text,
  authoring_owner text,
  is_active boolean,
  has_component boolean,
  visibility text,
  origin text,
  organization_id uuid,
  organization_name text,
  created_by uuid,
  owner_email text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  is_owner boolean,
  access_level text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'updated'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_filters jsonb := coalesce(p_filters, '{}'::jsonb);
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'shx_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'shx_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'label', 'kind', 'family', 'authoring_owner', 'status', 'component',
    'visibility', 'origin', 'organization_name', 'owner_email',
    'access_level', 'version', 'created', 'updated'
  ) THEN
    v_sort := 'updated';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations org ON org.id = om.organization_id
    WHERE om.user_id = v_uid
      AND org.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  scoped AS (
    SELECT kd.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'mine' AND kd.created_by = v_uid

    UNION ALL

    SELECT kd.*, false, 'org'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'orgs'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.organization_id IN (SELECT mo.org_id FROM my_orgs mo)
      AND kd.visibility IN ('internal', 'public')

    UNION ALL

    SELECT kd.*, false, permission.permission_level::text
    FROM content_ir.kind_definition kd
    JOIN iam.permissions permission
      ON permission.resource_type = 'content_ir_kind'
     AND permission.resource_id = kd.id
     AND permission.granted_to_user_id = v_uid
    WHERE v_scope = 'shared'
      AND kd.created_by IS DISTINCT FROM v_uid

    UNION ALL

    SELECT org_shared.*
    FROM (
      SELECT DISTINCT ON (kd.id)
        kd.*, false AS s_is_owner, permission.permission_level::text AS s_access
      FROM content_ir.kind_definition kd
      JOIN iam.permissions permission
        ON permission.resource_type = 'content_ir_kind'
       AND permission.resource_id = kd.id
       AND permission.granted_to_organization_id IN (
         SELECT om.organization_id
         FROM iam.organization_member om
         WHERE om.user_id = v_uid
       )
      WHERE v_scope = 'shared'
        AND kd.created_by IS DISTINCT FROM v_uid
        AND NOT EXISTS (
          SELECT 1
          FROM iam.permissions direct_permission
          WHERE direct_permission.resource_type = 'content_ir_kind'
            AND direct_permission.resource_id = kd.id
            AND direct_permission.granted_to_user_id = v_uid
        )
      ORDER BY kd.id, permission.permission_level::text
    ) org_shared

    UNION ALL

    SELECT kd.*, false, 'public'::text
    FROM content_ir.kind_definition kd
    WHERE v_scope = 'public'
      AND kd.created_by IS DISTINCT FROM v_uid
      AND kd.visibility = 'public'
  ),
  enriched AS (
    SELECT
      scoped.*,
      organization.name AS s_org_name,
      organization.is_personal AS s_org_is_personal,
      owner_user.email::text AS s_owner_email,
      EXISTS (
        SELECT 1
        FROM content_ir.kind_component component
        WHERE component.kind_definition_id = scoped.id
          AND component.is_active
          AND component.deleted_at IS NULL
      ) AS s_has_component,
      CASE
        WHEN scoped.organization_id = v_system_org THEN 'system'
        WHEN organization.is_personal IS TRUE THEN 'personal'
        ELSE 'organization'
      END AS s_origin,
      CASE
        WHEN jsonb_typeof(scoped.metadata -> 'family') = 'string'
          THEN scoped.metadata ->> 'family'
        ELSE NULL
      END AS s_family
    FROM scoped
    LEFT JOIN iam.organizations organization ON organization.id = scoped.organization_id
    LEFT JOIN auth.users owner_user ON owner_user.id = scoped.created_by
  ),
  filtered AS (
    SELECT enriched.*
    FROM enriched
    WHERE enriched.deleted_at IS NULL
      AND enriched.is_contract_artifact IS NOT TRUE
      AND (
        v_search IS NULL
        OR enriched.label ILIKE '%' || v_search || '%'
        OR enriched.kind ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_family, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_org_name, '') ILIKE '%' || v_search || '%'
        OR coalesce(enriched.s_owner_email, '') ILIKE '%' || v_search || '%'
      )
      AND (NOT v_filters ? 'label' OR enriched.label ILIKE '%' || (v_filters -> 'label' ->> 'value') || '%')
      AND (NOT v_filters ? 'kind' OR enriched.kind ILIKE '%' || (v_filters -> 'kind' ->> 'value') || '%')
      AND (NOT v_filters ? 'organization_name' OR coalesce(enriched.s_org_name, '') ILIKE '%' || (v_filters -> 'organization_name' ->> 'value') || '%')
      AND (NOT v_filters ? 'owner_email' OR coalesce(enriched.s_owner_email, '') ILIKE '%' || (v_filters -> 'owner_email' ->> 'value') || '%')
      AND (NOT v_filters ? 'family' OR coalesce(enriched.s_family, '__none__') IN (SELECT jsonb_array_elements_text(v_filters -> 'family' -> 'values')))
      AND (NOT v_filters ? 'authoring_owner' OR enriched.authoring_owner IN (SELECT jsonb_array_elements_text(v_filters -> 'authoring_owner' -> 'values')))
      AND (NOT v_filters ? 'status' OR (CASE WHEN enriched.is_active THEN 'active' ELSE 'inactive' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'status' -> 'values')))
      AND (NOT v_filters ? 'component' OR (CASE WHEN enriched.s_has_component THEN 'custom' ELSE 'generic' END) IN (SELECT jsonb_array_elements_text(v_filters -> 'component' -> 'values')))
      AND (NOT v_filters ? 'visibility' OR enriched.visibility::text IN (SELECT jsonb_array_elements_text(v_filters -> 'visibility' -> 'values')))
      AND (NOT v_filters ? 'origin' OR enriched.s_origin IN (SELECT jsonb_array_elements_text(v_filters -> 'origin' -> 'values')))
      AND (NOT v_filters ? 'access_level' OR enriched.s_access IN (SELECT jsonb_array_elements_text(v_filters -> 'access_level' -> 'values')))
      AND (NOT v_filters ? 'version' OR enriched.version::text IN (SELECT jsonb_array_elements_text(v_filters -> 'version' -> 'values')))
      AND (NOT v_filters ? 'created' OR enriched.created_at >= public.shx_since_bucket(v_filters -> 'created' -> 'values' ->> 0))
      AND (NOT v_filters ? 'updated' OR enriched.updated_at >= public.shx_since_bucket(v_filters -> 'updated' -> 'values' ->> 0))
  ),
  scored AS (
    SELECT filtered.*, public.shx_search_score(
      v_search,
      filtered.label,
      filtered.kind,
      filtered.s_family,
      filtered.s_owner_email,
      filtered.s_org_name
    ) AS s_score
    FROM filtered
  ),
  counted AS (
    SELECT scored.*, count(*) OVER () AS s_total
    FROM scored
  )
  SELECT
    counted.id,
    counted.kind,
    counted.label,
    counted.s_family,
    counted.authoring_owner,
    counted.is_active,
    counted.s_has_component,
    counted.visibility::text,
    counted.s_origin,
    counted.organization_id,
    counted.s_org_name,
    counted.created_by,
    counted.s_owner_email,
    counted.version,
    counted.created_at,
    counted.updated_at,
    counted.s_is_owner,
    counted.s_access,
    counted.s_total
  FROM counted
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN counted.s_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'label' AND v_dir = 'asc' THEN lower(counted.label) END ASC,
    CASE WHEN v_sort = 'label' AND v_dir = 'desc' THEN lower(counted.label) END DESC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'asc' THEN lower(counted.kind) END ASC,
    CASE WHEN v_sort = 'kind' AND v_dir = 'desc' THEN lower(counted.kind) END DESC,
    CASE WHEN v_sort = 'family' AND v_dir = 'asc' THEN lower(coalesce(counted.s_family, '')) END ASC,
    CASE WHEN v_sort = 'family' AND v_dir = 'desc' THEN lower(coalesce(counted.s_family, '')) END DESC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'asc' THEN counted.authoring_owner END ASC,
    CASE WHEN v_sort = 'authoring_owner' AND v_dir = 'desc' THEN counted.authoring_owner END DESC,
    CASE WHEN v_sort = 'status' AND v_dir = 'asc' THEN counted.is_active END ASC,
    CASE WHEN v_sort = 'status' AND v_dir = 'desc' THEN counted.is_active END DESC,
    CASE WHEN v_sort = 'component' AND v_dir = 'asc' THEN counted.s_has_component END ASC,
    CASE WHEN v_sort = 'component' AND v_dir = 'desc' THEN counted.s_has_component END DESC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'asc' THEN counted.visibility::text END ASC,
    CASE WHEN v_sort = 'visibility' AND v_dir = 'desc' THEN counted.visibility::text END DESC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'asc' THEN counted.s_origin END ASC,
    CASE WHEN v_sort = 'origin' AND v_dir = 'desc' THEN counted.s_origin END DESC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'asc' THEN lower(coalesce(counted.s_org_name, '')) END ASC,
    CASE WHEN v_sort = 'organization_name' AND v_dir = 'desc' THEN lower(coalesce(counted.s_org_name, '')) END DESC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'asc' THEN lower(coalesce(counted.s_owner_email, '')) END ASC,
    CASE WHEN v_sort = 'owner_email' AND v_dir = 'desc' THEN lower(coalesce(counted.s_owner_email, '')) END DESC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'asc' THEN counted.s_access END ASC,
    CASE WHEN v_sort = 'access_level' AND v_dir = 'desc' THEN counted.s_access END DESC,
    CASE WHEN v_sort = 'version' AND v_dir = 'asc' THEN counted.version END ASC,
    CASE WHEN v_sort = 'version' AND v_dir = 'desc' THEN counted.version END DESC,
    CASE WHEN v_sort = 'created' AND v_dir = 'asc' THEN counted.created_at END ASC,
    CASE WHEN v_sort = 'created' AND v_dir = 'desc' THEN counted.created_at END DESC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'asc' THEN counted.updated_at END ASC,
    CASE WHEN v_sort = 'updated' AND v_dir = 'desc' THEN counted.updated_at END DESC,
    counted.id
  LIMIT least(greatest(coalesce(p_limit, 25), 1), 1000)
  OFFSET greatest(coalesce(p_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.shx_list_scope_counts(
  p_search text DEFAULT NULL,
  p_deep boolean DEFAULT false,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(result.total_count), 0)
    FROM public.shx_list_scoped(
      v_scope, NULL, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
    ) result;
  END LOOP;

  RETURN QUERY
  SELECT 'orgs'::text, organization.id, organization.name, coalesce(max(result.total_count), 0)
  FROM iam.organizations organization
  JOIN iam.organization_member membership
    ON membership.organization_id = organization.id
   AND membership.user_id = (SELECT auth.uid())
  LEFT JOIN LATERAL public.shx_list_scoped(
    'orgs', organization.id, p_search, p_deep, 'updated', 'desc', p_filters, 1, 0
  ) result ON true
  WHERE organization.is_personal IS NOT TRUE
  GROUP BY organization.id, organization.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.shx_list_facets(
  p_scope text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_deep boolean DEFAULT false
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH base AS (
    SELECT result.*
    FROM public.shx_list_scoped(
      p_scope, p_org_id, p_search, p_deep, 'updated', 'desc', '{}'::jsonb, 1000, 0
    ) result
  )
  SELECT 'family', coalesce(nullif(base.family, ''), '__none__'), count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'authoring_owner', base.authoring_owner, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'status', CASE WHEN base.is_active THEN 'active' ELSE 'inactive' END, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'component', CASE WHEN base.has_component THEN 'custom' ELSE 'generic' END, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'visibility', base.visibility, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'origin', base.origin, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'access_level', base.access_level, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'version', base.version::text, count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'organization_name', coalesce(nullif(base.organization_name, ''), '__none__'), count(*) FROM base GROUP BY 2
  UNION ALL
  SELECT 'owner_email', coalesce(nullif(base.owner_email, ''), '__none__'), count(*) FROM base GROUP BY 2;
$$;

REVOKE ALL ON FUNCTION public.shx_since_bucket(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shx_search_score(text, text, text, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shx_list_scope_counts(text, boolean, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.shx_list_facets(text, uuid, text, boolean) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.shx_since_bucket(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shx_search_score(text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shx_list_scoped(text, uuid, text, boolean, text, text, jsonb, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shx_list_scope_counts(text, boolean, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shx_list_facets(text, uuid, text, boolean) TO authenticated, service_role;

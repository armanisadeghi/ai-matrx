-- Canonical scoped, server-paged list for /marketing/ranks.
-- Carries THE VIEW LAW's Mine / My Orgs / Shared / Public destinations,
-- exact counts, server filters/sorts, total ordering, and per-page history.

CREATE OR REPLACE FUNCTION public.seo_rank_tracking_label(
  p_engine text,
  p_search_type text
)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_search_type = 'local_pack' THEN 'Google — Map pack'
    WHEN p_search_type = 'ai_answer' THEN
      CASE p_engine
        WHEN 'chat_gpt' THEN 'ChatGPT (AI answers)'
        WHEN 'perplexity' THEN 'Perplexity (AI answers)'
        WHEN 'gemini' THEN 'Gemini (AI answers)'
        WHEN 'claude' THEN 'Claude (AI answers)'
        ELSE p_engine || ' (AI answers)'
      END
    ELSE CASE p_engine
      WHEN 'brave' THEN 'Brave'
      WHEN 'google' THEN 'Google'
      WHEN 'bing' THEN 'Bing'
      ELSE p_engine
    END
  END;
$function$;

CREATE OR REPLACE FUNCTION public.seo_rank_position_bucket(p_position integer)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $function$
  SELECT CASE
    WHEN p_position IS NULL THEN 'unranked'
    WHEN p_position <= 10 THEN 'top10'
    WHEN p_position <= 20 THEN '11-20'
    WHEN p_position <= 50 THEN '21-50'
    ELSE '51+'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scoped(
  p_scope   text    DEFAULT 'mine',
  p_org_id  uuid    DEFAULT NULL,
  p_search  text    DEFAULT NULL,
  p_sort    text    DEFAULT 'created_at',
  p_dir     text    DEFAULT 'desc',
  p_filters jsonb   DEFAULT '{}'::jsonb,
  p_limit   integer DEFAULT 25,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE(
  target_id uuid,
  site_id uuid,
  site_name text,
  site_domain text,
  brand_id uuid,
  keyword_id uuid,
  keyword text,
  engine text,
  device text,
  search_type text,
  tracking_label text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  created_by uuid,
  organization_id uuid,
  organization_name text,
  owner_email text,
  is_owner boolean,
  access_level text,
  latest_position integer,
  previous_position integer,
  movement integer,
  best_position integer,
  last_checked_at timestamptz,
  history_observed_at timestamptz[],
  history_organic_rank integer[],
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_scope text := lower(coalesce(p_scope, 'mine'));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: not authenticated';
  END IF;
  IF v_scope NOT IN ('mine', 'orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'keyword', 'site_name', 'tracking_label', 'device', 'latest_position',
    'movement', 'best_position', 'last_checked_at', 'is_active', 'created_at'
  ) THEN
    v_sort := 'created_at';
  END IF;

  RETURN QUERY
  WITH my_orgs AS (
    SELECT om.organization_id AS org_id
    FROM iam.organization_member om
    JOIN iam.organizations o ON o.id = om.organization_id
    WHERE om.user_id = v_uid
      AND o.is_personal IS NOT TRUE
      AND (p_org_id IS NULL OR om.organization_id = p_org_id)
  ),
  base AS (
    SELECT
      t.id AS b_target_id,
      coalesce(t.site_id, target_page.site_id) AS b_site_id,
      s.name AS b_site_name,
      s.domain AS b_site_domain,
      s.brand_id AS b_brand_id,
      s.visibility AS b_site_visibility,
      CASE
        WHEN s.id IS NOT NULL
        THEN iam.has_access_for(v_uid, 'web_site', s.id, 'viewer')
        ELSE false
      END AS b_site_accessible,
      t.target_page_id AS b_target_page_id,
      t.keyword_id AS b_keyword_id,
      k.phrase AS b_keyword,
      t.engine AS b_engine,
      t.device AS b_device,
      t.search_type AS b_search_type,
      public.seo_rank_tracking_label(t.engine, t.search_type) AS b_tracking_label,
      t.is_active AS b_is_active,
      t.created_at AS b_created_at,
      t.updated_at AS b_updated_at,
      t.created_by AS b_created_by,
      t.organization_id AS b_org_id,
      o.name AS b_org_name,
      au.email::text AS b_owner_email
    FROM seo.rank_target t
    JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
    LEFT JOIN web.page target_page
      ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
    LEFT JOIN web.site s
      ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
    LEFT JOIN iam.organizations o ON o.id = t.organization_id
    LEFT JOIN auth.users au ON au.id = t.created_by
    WHERE t.deleted_at IS NULL
  ),
  scoped AS (
    SELECT b.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM base b
    WHERE v_scope = 'mine' AND b.b_created_by = v_uid

    UNION ALL

    SELECT b.*, false, 'org'::text
    FROM base b
    WHERE v_scope = 'orgs'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_org_id IN (SELECT mo.org_id FROM my_orgs mo)

    UNION ALL

    SELECT b.*, false, 'shared'::text
    FROM base b
    WHERE v_scope = 'shared'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND (
        public.has_permission_for(v_uid, 'seo_rank_target', b.b_target_id, 'viewer')
        OR (b.b_target_page_id IS NOT NULL AND public.has_permission_for(
          v_uid, 'web_page', b.b_target_page_id, 'viewer'
        ))
        OR (b.b_site_id IS NOT NULL AND public.has_permission_for(
          v_uid, 'web_site', b.b_site_id, 'viewer'
        ))
        OR (b.b_brand_id IS NOT NULL AND public.has_permission_for(
          v_uid, 'web_brand', b.b_brand_id, 'viewer'
        ))
      )

    UNION ALL

    SELECT b.*, false, 'public'::text
    FROM base b
    WHERE v_scope = 'public'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_site_visibility = 'public'::platform.visibility
  ),
  enriched AS (
    SELECT
      s.*,
      obs.latest_position AS e_latest_position,
      obs.previous_position AS e_previous_position,
      CASE
        WHEN obs.latest_position IS NOT NULL AND obs.previous_position IS NOT NULL
        THEN obs.previous_position - obs.latest_position
      END AS e_movement,
      obs.best_position AS e_best_position,
      obs.last_checked_at AS e_last_checked_at
    FROM scoped s
    LEFT JOIN LATERAL (
      SELECT
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[1] AS latest_position,
        (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC)
          FILTER (WHERE ro.organic_rank IS NOT NULL))[2] AS previous_position,
        min(ro.organic_rank) FILTER (WHERE ro.organic_rank IS NOT NULL) AS best_position,
        max(ro.observed_at) AS last_checked_at
      FROM seo.rank_observation ro
      WHERE ro.rank_target_id = s.b_target_id
        AND ro.observed_at >= now() - interval '90 days'
    ) obs ON true
  ),
  filtered AS (
    SELECT e.*
    FROM enriched e
    WHERE (
      v_search IS NULL
      OR e.b_keyword ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_name, '') ILIKE '%' || v_search || '%'
      OR coalesce(e.b_site_domain, '') ILIKE '%' || v_search || '%'
      OR e.b_tracking_label ILIKE '%' || v_search || '%'
    )
      AND (NOT v_f ? 'keyword'
        OR e.b_keyword ILIKE '%' || (v_f->'keyword'->>'value') || '%')
      AND (NOT v_f ? 'site_name'
        OR coalesce(e.b_site_name, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%'
        OR coalesce(e.b_site_domain, '') ILIKE '%' || (v_f->'site_name'->>'value') || '%')
      AND (NOT v_f ? 'tracking_label' OR e.b_tracking_label IN (
        SELECT jsonb_array_elements_text(v_f->'tracking_label'->'values')
      ))
      AND (NOT v_f ? 'device' OR e.b_device IN (
        SELECT jsonb_array_elements_text(v_f->'device'->'values')
      ))
      AND (NOT v_f ? 'latest_position' OR public.seo_rank_position_bucket(e.e_latest_position) IN (
        SELECT jsonb_array_elements_text(v_f->'latest_position'->'values')
      ))
      AND (NOT v_f ? 'movement' OR CASE
        WHEN e.e_movement IS NULL THEN 'unknown'
        WHEN e.e_movement > 0 THEN 'improved'
        WHEN e.e_movement < 0 THEN 'declined'
        ELSE 'unchanged'
      END IN (SELECT jsonb_array_elements_text(v_f->'movement'->'values')))
      AND (NOT v_f ? 'best_position' OR public.seo_rank_position_bucket(e.e_best_position) IN (
        SELECT jsonb_array_elements_text(v_f->'best_position'->'values')
      ))
      AND (NOT v_f ? 'last_checked_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'last_checked_at'->'values') bucket
        WHERE CASE bucket
          WHEN 'never' THEN e.e_last_checked_at IS NULL
          ELSE e.e_last_checked_at >= public.agx_since_bucket(bucket)
        END
      ))
      AND (NOT v_f ? 'is_active'
        OR e.b_is_active IS NOT DISTINCT FROM (v_f->'is_active'->>'value')::boolean)
      AND (NOT v_f ? 'created_at' OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(v_f->'created_at'->'values') bucket
        WHERE e.b_created_at >= public.agx_since_bucket(bucket)
      ))
  ),
  scored AS (
    SELECT f.*, CASE
      WHEN v_search IS NULL THEN 0
      WHEN lower(f.b_keyword) = lower(v_search) THEN 10000
      WHEN lower(f.b_keyword) LIKE lower(v_search) || '%' THEN 5000
      WHEN f.b_keyword ILIKE '%' || v_search || '%' THEN 3000
      WHEN coalesce(f.b_site_name, '') ILIKE '%' || v_search || '%' THEN 1000
      WHEN coalesce(f.b_site_domain, '') ILIKE '%' || v_search || '%' THEN 800
      ELSE 100
    END AS s_search_score
    FROM filtered f
  ),
  counted AS (
    SELECT s.*, count(*) OVER () AS s_total_count
    FROM scored s
  ),
  page_rows AS (
    SELECT c.*
    FROM counted c
    ORDER BY
      CASE WHEN v_search IS NOT NULL THEN c.s_search_score END DESC NULLS LAST,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(c.b_keyword) END DESC,
      CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(c.b_keyword) END ASC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(c.b_site_name, '')) END DESC,
      CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(c.b_site_name, '')) END ASC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(c.b_tracking_label) END DESC,
      CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(c.b_tracking_label) END ASC,
      CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(c.b_device) END DESC,
      CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(c.b_device) END ASC,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN c.e_latest_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN c.e_latest_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN c.e_movement END DESC NULLS LAST,
      CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN c.e_movement END ASC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN c.e_best_position END DESC NULLS LAST,
      CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN c.e_best_position END ASC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN c.e_last_checked_at END DESC NULLS LAST,
      CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN c.e_last_checked_at END ASC NULLS LAST,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN c.b_is_active END DESC,
      CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN c.b_is_active END ASC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN c.b_created_at END DESC,
      CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN c.b_created_at END ASC,
      c.b_target_id
    LIMIT greatest(coalesce(p_limit, 25), 1)
    OFFSET greatest(coalesce(p_offset, 0), 0)
  )
  SELECT
    p.b_target_id,
    CASE WHEN p.b_site_accessible THEN p.b_site_id END,
    CASE WHEN p.b_site_accessible THEN p.b_site_name END,
    CASE WHEN p.b_site_accessible THEN p.b_site_domain END,
    CASE WHEN p.b_site_accessible THEN p.b_brand_id END,
    p.b_keyword_id,
    p.b_keyword,
    p.b_engine,
    p.b_device,
    p.b_search_type,
    p.b_tracking_label,
    p.b_is_active,
    p.b_created_at,
    p.b_updated_at,
    p.b_created_by,
    p.b_org_id,
    p.b_org_name,
    p.b_owner_email,
    p.s_is_owner,
    p.s_access,
    p.e_latest_position,
    p.e_previous_position,
    p.e_movement,
    p.e_best_position,
    p.e_last_checked_at,
    coalesce(history.observed_at, ARRAY[]::timestamptz[]),
    coalesce(history.organic_rank, ARRAY[]::integer[]),
    p.s_total_count
  FROM page_rows p
  LEFT JOIN LATERAL (
    SELECT
      array_agg(ro.observed_at ORDER BY ro.observed_at ASC, ro.id ASC) AS observed_at,
      array_agg(ro.organic_rank ORDER BY ro.observed_at ASC, ro.id ASC) AS organic_rank
    FROM seo.rank_observation ro
    WHERE ro.rank_target_id = p.b_target_id
      AND ro.observed_at >= now() - interval '90 days'
  ) history ON true
  ORDER BY
    CASE WHEN v_search IS NOT NULL THEN p.s_search_score END DESC NULLS LAST,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'desc' THEN lower(p.b_keyword) END DESC,
    CASE WHEN v_sort = 'keyword' AND v_dir = 'asc' THEN lower(p.b_keyword) END ASC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'desc' THEN lower(coalesce(p.b_site_name, '')) END DESC,
    CASE WHEN v_sort = 'site_name' AND v_dir = 'asc' THEN lower(coalesce(p.b_site_name, '')) END ASC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'desc' THEN lower(p.b_tracking_label) END DESC,
    CASE WHEN v_sort = 'tracking_label' AND v_dir = 'asc' THEN lower(p.b_tracking_label) END ASC,
    CASE WHEN v_sort = 'device' AND v_dir = 'desc' THEN lower(p.b_device) END DESC,
    CASE WHEN v_sort = 'device' AND v_dir = 'asc' THEN lower(p.b_device) END ASC,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'desc' THEN p.e_latest_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'latest_position' AND v_dir = 'asc' THEN p.e_latest_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'desc' THEN p.e_movement END DESC NULLS LAST,
    CASE WHEN v_sort = 'movement' AND v_dir = 'asc' THEN p.e_movement END ASC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'desc' THEN p.e_best_position END DESC NULLS LAST,
    CASE WHEN v_sort = 'best_position' AND v_dir = 'asc' THEN p.e_best_position END ASC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'desc' THEN p.e_last_checked_at END DESC NULLS LAST,
    CASE WHEN v_sort = 'last_checked_at' AND v_dir = 'asc' THEN p.e_last_checked_at END ASC NULLS LAST,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'desc' THEN p.b_is_active END DESC,
    CASE WHEN v_sort = 'is_active' AND v_dir = 'asc' THEN p.b_is_active END ASC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'desc' THEN p.b_created_at END DESC,
    CASE WHEN v_sort = 'created_at' AND v_dir = 'asc' THEN p.b_created_at END ASC,
    p.b_target_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.seo_rank_target_list_scoped(
  text, uuid, text, text, text, jsonb, integer, integer
) FROM public;
REVOKE ALL ON FUNCTION public.seo_rank_target_list_scoped(
  text, uuid, text, text, text, jsonb, integer, integer
) FROM anon;
GRANT EXECUTE ON FUNCTION public.seo_rank_target_list_scoped(
  text, uuid, text, text, text, jsonb, integer, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scope_counts(
  p_search  text  DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(scope text, narrow_id uuid, label text, total bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_scope text;
BEGIN
  FOREACH v_scope IN ARRAY ARRAY['mine', 'orgs', 'shared', 'public'] LOOP
    RETURN QUERY
    SELECT v_scope, NULL::uuid, NULL::text, coalesce(max(r.total_count), 0)
    FROM public.seo_rank_target_list_scoped(
      v_scope, NULL, p_search, 'created_at', 'desc', p_filters, 1, 0
    ) r;
  END LOOP;

  RETURN QUERY
  SELECT
    'orgs'::text,
    o.id,
    o.name,
    coalesce(max(r.total_count), 0)
  FROM iam.organizations o
  JOIN iam.organization_member om
    ON om.organization_id = o.id AND om.user_id = auth.uid()
  LEFT JOIN LATERAL public.seo_rank_target_list_scoped(
    'orgs', o.id, p_search, 'created_at', 'desc', p_filters, 1, 0
  ) r ON true
  WHERE o.is_personal IS NOT TRUE
  GROUP BY o.id, o.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.seo_rank_target_list_scope_counts(text, jsonb) FROM public;
REVOKE ALL ON FUNCTION public.seo_rank_target_list_scope_counts(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.seo_rank_target_list_scope_counts(text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_facets(
  p_scope  text DEFAULT 'mine',
  p_org_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(kind text, value text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT r.tracking_label, r.device
    FROM public.seo_rank_target_list_scoped(
      p_scope, p_org_id, p_search, 'created_at', 'desc', '{}'::jsonb, 1000000, 0
    ) r
  )
  SELECT 'tracking_label'::text, b.tracking_label, count(*)
  FROM base b GROUP BY b.tracking_label
  UNION ALL
  SELECT 'device'::text, b.device, count(*)
  FROM base b GROUP BY b.device;
$function$;

REVOKE ALL ON FUNCTION public.seo_rank_target_list_facets(text, uuid, text) FROM public;
REVOKE ALL ON FUNCTION public.seo_rank_target_list_facets(text, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.seo_rank_target_list_facets(text, uuid, text) TO authenticated;

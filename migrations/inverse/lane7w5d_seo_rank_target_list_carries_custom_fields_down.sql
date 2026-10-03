-- chair-step: inverse of migrations/campaign/lane7w5d_seo_rank_target_list_carries_custom_fields.sql — drops public.seo_rank_target_list_scoped and re-creates
-- production's body without custom_fields, byte for byte, and its grants.
-- based-on: public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) 16d3bd48120d22752c381fb5d03b7f7a7975af11c71077e0f19f153135582932

set local lock_timeout = '3s';

DROP FUNCTION IF EXISTS public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer);

CREATE OR REPLACE FUNCTION public.seo_rank_target_list_scoped(p_scope text DEFAULT 'mine'::text, p_org_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_sort text DEFAULT 'created_at'::text, p_dir text DEFAULT 'desc'::text, p_filters jsonb DEFAULT '{}'::jsonb, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS TABLE(target_id uuid, site_id uuid, site_name text, site_domain text, brand_id uuid, keyword_id uuid, keyword text, engine text, device text, search_type text, tracking_label text, is_active boolean, created_at timestamp with time zone, updated_at timestamp with time zone, created_by uuid, organization_id uuid, organization_name text, owner_email text, is_owner boolean, access_level text, latest_position integer, previous_position integer, movement integer, best_position integer, last_checked_at timestamp with time zone, history_observed_at timestamp with time zone[], history_organic_rank integer[], total_count bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_ctx jsonb;  -- access ladder T-11: Shown to
  v_scope text := lower(coalesce(p_scope, platform.entity_default_list_scope('seo_rank_target')));
  v_dir text := CASE WHEN lower(coalesce(p_dir, 'desc')) = 'asc' THEN 'asc' ELSE 'desc' END;
  v_sort text := lower(coalesce(p_sort, 'created_at'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
  v_f jsonb := coalesce(p_filters, '{}'::jsonb);
BEGIN
  -- The Shown-to context is read only by the organization / team / all lanes (per-row
  -- platform.shown_to_lists); every other lane never looks at it, so it is not built for them
  -- (lib/list-scope/FEATURE.md, invariant 10).
  IF v_scope IN ('orgs', 'team', 'all') THEN
    v_ctx := platform.shown_to_context('seo_rank_target');
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: not authenticated';
  END IF;

  -- INTERNAL LANE MODE (p_scope = '_lanes'), used only by seo_rank_target_list_scope_counts: ONE statement that
  -- returns, for every lane, the ids this same list would show (access_level carries the lane name, one row
  -- per lane and target, 'all' deduped), so the row-secured tables are read once instead of once per lane.
  -- Same lane predicates and filters as below; nothing is sorted, scored, paged or enriched beyond what a
  -- filter needs. Never a lane a page asks for.
  IF v_scope = '_lanes' THEN
    DECLARE v_needs_obs boolean := v_f ?| ARRAY['latest_position','movement','best_position','last_checked_at'];
    BEGIN
      v_ctx := platform.shown_to_context('seo_rank_target');
      RETURN QUERY
      WITH base AS (
        SELECT t.id AS b_id, coalesce(t.site_id, target_page.site_id) AS b_site_id,
          s.name AS b_site_name, s.domain AS b_site_domain, s.brand_id AS b_brand_id,
          s.visibility AS b_site_visibility, t.target_page_id AS b_target_page_id,
          k.phrase AS b_keyword, t.device AS b_device,
          public.seo_rank_tracking_label(t.engine, t.search_type) AS b_tracking_label,
          t.is_active AS b_is_active, t.created_at AS b_created_at, t.created_by AS b_created_by,
          t.organization_id AS b_org_id, t.shown_to AS b_shown, t.visibility AS b_visibility
        FROM seo.rank_target t
        JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
        LEFT JOIN web.page target_page ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
        LEFT JOIN web.site s ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
        WHERE t.deleted_at IS NULL
          AND (p_org_id IS NULL OR t.organization_id = p_org_id)
      ),
      mine AS (SELECT b.b_id, b.b_org_id FROM base b WHERE b.b_created_by = v_uid),
      orgs AS (
        SELECT b.b_id, b.b_org_id, b.b_created_by FROM base b
        WHERE b.b_org_id IN (SELECT iam.my_orgs())
          AND platform.shown_to_lists(b.b_shown, b.b_visibility, b.b_created_by, b.b_org_id, v_uid, v_ctx)
      ),
      team AS (
        SELECT o.b_id, o.b_org_id FROM orgs o
        WHERE (o.b_org_id, o.b_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r)
      ),
      shared AS (
        SELECT b.b_id, b.b_org_id FROM base b
        WHERE b.b_created_by IS DISTINCT FROM v_uid
          AND (
            public.has_permission('seo_rank_target', b.b_id, 'viewer')
            OR (b.b_target_page_id IS NOT NULL AND public.has_permission('web_page', b.b_target_page_id, 'viewer'))
            OR (b.b_site_id IS NOT NULL AND public.has_permission('web_site', b.b_site_id, 'viewer'))
            OR (b.b_brand_id IS NOT NULL AND public.has_permission('web_brand', b.b_brand_id, 'viewer'))
          )
      ),
      pub AS (
        SELECT b.b_id, b.b_org_id FROM base b
        WHERE b.b_created_by IS DISTINCT FROM v_uid AND b.b_site_visibility = 'public'::platform.visibility
      ),
      lane_rows AS (
        SELECT 'mine'::text AS lane, m.b_id, m.b_org_id FROM mine m
        UNION ALL SELECT 'orgs', o.b_id, o.b_org_id FROM orgs o
        UNION ALL SELECT 'team', t.b_id, t.b_org_id FROM team t
        UNION ALL SELECT 'shared', s.b_id, s.b_org_id FROM shared s
        UNION ALL SELECT 'public', p.b_id, p.b_org_id FROM pub p
        UNION ALL SELECT 'all', d.b_id, d.b_org_id FROM (
          SELECT DISTINCT ON (u.b_id) u.b_id, u.b_org_id FROM (
            SELECT m.b_id, m.b_org_id FROM mine m
            UNION ALL SELECT o.b_id, o.b_org_id FROM orgs o
            UNION ALL SELECT s.b_id, s.b_org_id FROM shared s
          ) u ORDER BY u.b_id
        ) d
      ),
      obs90 AS MATERIALIZED (
        SELECT ro.rank_target_id, ro.id, ro.observed_at, ro.organic_rank
        FROM seo.rank_observation ro
        WHERE v_needs_obs
          AND ro.rank_target_id IN (SELECT lr.b_id FROM lane_rows lr)
          AND ro.observed_at >= now() - interval '90 days'
      ),
      enriched AS (
        SELECT b.*,
          obs.latest_position AS e_latest_position,
          CASE WHEN obs.latest_position IS NOT NULL AND obs.previous_position IS NOT NULL
               THEN obs.previous_position - obs.latest_position END AS e_movement,
          obs.best_position AS e_best_position,
          obs.last_checked_at AS e_last_checked_at
        FROM base b
        LEFT JOIN LATERAL (
          SELECT
            (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC) FILTER (WHERE ro.organic_rank IS NOT NULL))[1] AS latest_position,
            (array_agg(ro.organic_rank ORDER BY ro.observed_at DESC, ro.id DESC) FILTER (WHERE ro.organic_rank IS NOT NULL))[2] AS previous_position,
            min(ro.organic_rank) FILTER (WHERE ro.organic_rank IS NOT NULL) AS best_position,
            max(ro.observed_at) AS last_checked_at
          FROM obs90 ro WHERE ro.rank_target_id = b.b_id
        ) obs ON true
        WHERE b.b_id IN (SELECT lr.b_id FROM lane_rows lr)
      ),
      ok AS (
        SELECT e.b_id
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
            SELECT jsonb_array_elements_text(v_f->'tracking_label'->'values')))
          AND (NOT v_f ? 'device' OR e.b_device IN (
            SELECT jsonb_array_elements_text(v_f->'device'->'values')))
          AND (NOT v_f ? 'latest_position' OR public.seo_rank_position_bucket(e.e_latest_position) IN (
            SELECT jsonb_array_elements_text(v_f->'latest_position'->'values')))
          AND (NOT v_f ? 'movement' OR CASE
            WHEN e.e_movement IS NULL THEN 'unknown'
            WHEN e.e_movement > 0 THEN 'improved'
            WHEN e.e_movement < 0 THEN 'declined'
            ELSE 'unchanged'
          END IN (SELECT jsonb_array_elements_text(v_f->'movement'->'values')))
          AND (NOT v_f ? 'best_position' OR public.seo_rank_position_bucket(e.e_best_position) IN (
            SELECT jsonb_array_elements_text(v_f->'best_position'->'values')))
          AND (NOT v_f ? 'last_checked_at' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_f->'last_checked_at'->'values') bucket
            WHERE CASE bucket
              WHEN 'never' THEN e.e_last_checked_at IS NULL
              ELSE e.e_last_checked_at >= public.agx_since_bucket(bucket)
            END))
          AND (NOT v_f ? 'is_active'
            OR e.b_is_active IS NOT DISTINCT FROM (v_f->'is_active'->>'value')::boolean)
          AND (NOT v_f ? 'created_at' OR EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(v_f->'created_at'->'values') bucket
            WHERE e.b_created_at >= public.agx_since_bucket(bucket)))
      )
      SELECT lr.b_id, NULL::uuid, NULL::text, NULL::text, NULL::uuid, NULL::uuid, NULL::text, NULL::text, NULL::text,
        NULL::text, NULL::text, NULL::boolean, NULL::timestamptz, NULL::timestamptz, NULL::uuid, lr.b_org_id,
        NULL::text, NULL::text, NULL::boolean, lr.lane, NULL::integer, NULL::integer, NULL::integer, NULL::integer,
        NULL::timestamptz, NULL::timestamptz[], NULL::integer[], 0::bigint
      FROM lane_rows lr JOIN ok ON ok.b_id = lr.b_id;
      RETURN;
    END;
  END IF;
  IF v_scope NOT IN ('all', 'mine', 'team','orgs', 'shared', 'public') THEN
    RAISE EXCEPTION 'seo_rank_target_list_scoped: unknown scope %', v_scope;
  END IF;
  IF v_sort NOT IN (
    'keyword', 'site_name', 'tracking_label', 'device', 'latest_position',
    'movement', 'best_position', 'last_checked_at', 'is_active', 'created_at'
  ) THEN
    v_sort := 'created_at';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      t.id AS b_target_id,
      coalesce(t.site_id, target_page.site_id) AS b_site_id,
      s.name AS b_site_name,
      s.domain AS b_site_domain,
      s.brand_id AS b_brand_id,
      s.visibility AS b_site_visibility,
      CASE
        WHEN s.id IS NOT NULL
        THEN iam.has_access('web_site', s.id, 'viewer')
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
      au.email::text AS b_owner_email,
      t.shown_to AS b_shown, t.visibility AS b_visibility
    FROM seo.rank_target t
    JOIN seo.keyword k ON k.id = t.keyword_id AND k.deleted_at IS NULL
    LEFT JOIN web.page target_page
      ON target_page.id = t.target_page_id AND target_page.deleted_at IS NULL
    LEFT JOIN web.site s
      ON s.id = coalesce(t.site_id, target_page.site_id) AND s.deleted_at IS NULL
    LEFT JOIN iam.organizations o ON o.id = t.organization_id
    LEFT JOIN platform.visible_user_identity au ON au.id = t.created_by
    WHERE t.deleted_at IS NULL
      -- The page's ORGANIZATION FILTER (NULL = all organizations) narrows every lane.
      AND (p_org_id IS NULL OR t.organization_id = p_org_id)
  ),
  scoped_raw AS (
    SELECT b.*, true AS s_is_owner, 'owner'::text AS s_access
    FROM base b
    WHERE v_scope IN ('mine','all') AND b.b_created_by = v_uid

    UNION ALL

    SELECT b.*, (b.b_created_by = v_uid), CASE WHEN b.b_created_by = v_uid THEN 'owner' ELSE 'org' END::text
    FROM base b
    WHERE v_scope IN ('orgs','team','all')
      AND (p_org_id IS NULL OR b.b_org_id = p_org_id) AND b.b_org_id IN (SELECT iam.my_orgs())
      -- MY TEAM (T-29): the same rows, narrowed to people who share a team with me there.
      AND (v_scope <> 'team' OR (b.b_org_id, b.b_created_by) IN (SELECT r.organization_id, r.user_id FROM iam.my_team_reach(p_org_id) r))
      -- access ladder T-11: and only what each row's Shown to lets this person's lists show
      AND platform.shown_to_lists(b.b_shown, b.b_visibility, b.b_created_by, b.b_org_id, v_uid, v_ctx)

    UNION ALL

    SELECT b.*, false, 'shared'::text
    FROM base b
    WHERE v_scope IN ('shared','all')
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND (
        public.has_permission('seo_rank_target', b.b_target_id, 'viewer')
        OR (b.b_target_page_id IS NOT NULL AND public.has_permission('web_page', b.b_target_page_id, 'viewer'
        ))
        OR (b.b_site_id IS NOT NULL AND public.has_permission('web_site', b.b_site_id, 'viewer'
        ))
        OR (b.b_brand_id IS NOT NULL AND public.has_permission('web_brand', b.b_brand_id, 'viewer'
        ))
      )

    UNION ALL

    SELECT b.*, false, 'public'::text
    FROM base b
    WHERE v_scope = 'public'
      AND b.b_created_by IS DISTINCT FROM v_uid
      AND b.b_site_visibility = 'public'::platform.visibility
  ),
  -- 'all' = Mine U My team U My Orgs U Shared: one row per target, most privileged label kept.
  scoped AS (
    SELECT DISTINCT ON (r.b_target_id) r.*
    FROM scoped_raw r
    ORDER BY r.b_target_id,
      CASE r.s_access WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 WHEN 'editor' THEN 2 ELSE 3 END
  ),
  -- ONE row-secured read of the observations (lib/list-scope/FEATURE.md, invariant 11). The two
  -- laterals below used to read seo.rank_observation separately, and each read built that table's
  -- full RLS access set (~0.8 s for an admin) on its own. Same rows (same predicate, same snapshot).
  obs90 AS MATERIALIZED (
    SELECT ro.rank_target_id, ro.id, ro.observed_at, ro.organic_rank
    FROM seo.rank_observation ro
    WHERE ro.rank_target_id IN (SELECT sc.b_target_id FROM scoped sc)
      AND ro.observed_at >= now() - interval '90 days'
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
      FROM obs90 ro
      WHERE ro.rank_target_id = s.b_target_id
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
    FROM obs90 ro
    WHERE ro.rank_target_id = p.b_target_id
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

GRANT EXECUTE ON FUNCTION public.seo_rank_target_list_scoped(text, uuid, text, text, text, jsonb, integer, integer) TO authenticated, service_role;

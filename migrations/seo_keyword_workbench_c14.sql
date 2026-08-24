-- C14 — THE KEYWORD WORKBENCH (search without limits + saved views)
--
-- Builds on C13 (`seo_stamp_assignment_layer.sql`), which already gave the
-- workbench its three write/read primitives: gsc_quick_add_value (P23),
-- gsc_set_keyword_stamps (P24) and gsc_keyword_stamps_for (the dynamic
-- columns, P26). This migration adds the three things the search half needs:
--
--  1. `gsc_perf_breakdown` learns SEVEN more filter keys — whole-word query
--     match plus click / impression / position ranges — so "search without
--     limits" is a server filter and not a client-side sieve over one page.
--  2. `gsc_breakdown_keyword_ids` — SELECT ALL MATCHING. A bulk assignment
--     must act on every keyword the filter set produced, not the 50 rows on
--     screen; the browser is never told to page through 20,000 rows to learn
--     what it already asked the server for.
--  3. `keyword_saved_view` gains its RPC family (list / upsert / delete).
--     A saved view IS the URL state (P26), so the table stores it verbatim
--     and the client is the only thing that has to understand its shape.
--
-- Idempotent: CREATE OR REPLACE only.
SET search_path TO seo, public;

-- ---------------------------------------------------------------------------
-- 1. gsc_perf_breakdown — the new filter keys
-- ---------------------------------------------------------------------------
-- MERGE NOTE: this is the C5+C6+C7 live body with the new predicates folded
-- in. Read the live definition before replacing it again — this function has
-- been replaced three times in one day by three different phases.
CREATE OR REPLACE FUNCTION seo.gsc_perf_breakdown(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL::date,
  p_compare_end date DEFAULT NULL::date,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL::text,
  p_sort text DEFAULT 'clicks'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  -- C14: whole-word match. "cost" must not drag in "costume" when the expert
  -- said the WORD cost — the single most-asked-for search nuance and the one
  -- a contains-filter can never express.
  f_qw text := NULLIF(btrim(p_filters->>'query_word'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
  -- C6: dimension stamps (all-of) and levels — THE SPREADSHEET FILTERS (P9)
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  -- C14: metric ranges, applied AFTER aggregation (they describe the row the
  -- user is looking at, not a single day's slice of it).
  f_cmin numeric := NULLIF(p_filters->>'clicks_min','')::numeric;
  f_cmax numeric := NULLIF(p_filters->>'clicks_max','')::numeric;
  f_imin numeric := NULLIF(p_filters->>'impressions_min','')::numeric;
  f_imax numeric := NULLIF(p_filters->>'impressions_max','')::numeric;
  f_pmin numeric := NULLIF(p_filters->>'position_min','')::numeric;
  f_pmax numeric := NULLIF(p_filters->>'position_max','')::numeric;
  v_qw_re text := CASE WHEN f_qw IS NOT NULL
    THEN '\m' || regexp_replace(f_qw, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M' END;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF p_sort NOT IN ('clicks', 'impressions', 'ctr', 'position', 'key', 'delta_clicks') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d,
      spd.clicks AS c,
      spd.impressions AS i,
      spd.average_position AS pos,
      spd.page_id AS pid,
      spd.keyword_id AS kid,
      CASE p_dimension
        WHEN 'query' THEN spd.query
        WHEN 'page' THEN COALESCE(spd.extras->>'page_url', spd.page_id::text)
        WHEN 'country' THEN spd.country
        WHEN 'device' THEN spd.device
        ELSE spd.search_appearance
      END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (v_qw_re IS NULL OR spd.query ~* v_qw_re)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start) AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = ANY(f_lv)))
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.d BETWEEN p_start AND p_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  cmp AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  joined AS (
    SELECT COALESCE(cur.k, cmp.k) AS k,
           COALESCE(cur.pid, cmp.pid) AS pid,
           COALESCE(cur.kid, cmp.kid) AS kid,
           COALESCE(cur.s_clicks, 0) AS c_clicks,
           COALESCE(cur.s_imps, 0) AS c_imps,
           cur.s_wpos AS c_wpos,
           COALESCE(cur.s_pos_imps, 0) AS c_pos_imps,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_clicks, 0) END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_imps, 0) END AS m_imps,
           cmp.s_wpos AS m_wpos,
           COALESCE(cmp.s_pos_imps, 0) AS m_pos_imps
    FROM cur FULL OUTER JOIN cmp ON cur.k = cmp.k
  ),
  filtered AS (
    SELECT j.*,
           CASE p_sort
             WHEN 'clicks' THEN j.c_clicks::numeric
             WHEN 'impressions' THEN j.c_imps::numeric
             WHEN 'ctr' THEN CASE WHEN j.c_imps > 0 THEN j.c_clicks::numeric / j.c_imps END
             WHEN 'position' THEN CASE WHEN j.c_pos_imps > 0 THEN j.c_wpos / j.c_pos_imps END
             WHEN 'delta_clicks' THEN (j.c_clicks - COALESCE(j.m_clicks, 0))::numeric
           END AS s_val
    FROM joined j
    WHERE (v_search IS NULL OR j.k ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (f_cmin IS NULL OR j.c_clicks >= f_cmin)
      AND (f_cmax IS NULL OR j.c_clicks <= f_cmax)
      AND (f_imin IS NULL OR j.c_imps >= f_imin)
      AND (f_imax IS NULL OR j.c_imps <= f_imax)
      -- A row with no positioned impressions has NO position; a position
      -- range must exclude it rather than silently treating it as zero
      -- (position 0 does not exist, and "top of page" is position 1).
      AND (f_pmin IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps >= f_pmin))
      AND (f_pmax IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps <= f_pmax))
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         CASE WHEN f.c_imps > 0 THEN round(f.c_clicks::numeric / f.c_imps, 6) END,
         CASE WHEN f.c_pos_imps > 0 THEN round(f.c_wpos / f.c_pos_imps, 2) END,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         CASE WHEN f.m_imps > 0 THEN round(f.m_clicks::numeric / f.m_imps, 6) END,
         CASE WHEN f.m_pos_imps > 0 THEN round(f.m_wpos / f.m_pos_imps, 2) END,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    (CASE WHEN p_sort_dir = 'desc' THEN f.s_val END) DESC NULLS LAST,
    (CASE WHEN p_sort_dir = 'asc' THEN f.s_val END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. SELECT ALL MATCHING — the keyword ids behind the whole filtered result
-- ---------------------------------------------------------------------------
-- Why a dedicated function rather than paging `gsc_perf_breakdown`: the
-- breakdown caps at 1,000 rows a call, so "select all 4,300 matches" would be
-- five full scans of a 667k-row profile inside an 8s statement timeout. This
-- does ONE scan and returns ids only.
--
-- It deliberately covers the QUERY dimension only — the workbench assigns
-- meaning to keywords, and a page/country row names no keyword to stamp.
-- The predicates mirror `gsc_perf_breakdown` exactly; the two live in this
-- one file so a filter added to one is added to the other in the same edit.
CREATE OR REPLACE FUNCTION seo.gsc_breakdown_keyword_ids(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile('query', p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_qw text := NULLIF(btrim(p_filters->>'query_word'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  f_cmin numeric := NULLIF(p_filters->>'clicks_min','')::numeric;
  f_cmax numeric := NULLIF(p_filters->>'clicks_max','')::numeric;
  f_imin numeric := NULLIF(p_filters->>'impressions_min','')::numeric;
  f_imax numeric := NULLIF(p_filters->>'impressions_max','')::numeric;
  f_pmin numeric := NULLIF(p_filters->>'position_min','')::numeric;
  f_pmax numeric := NULLIF(p_filters->>'position_max','')::numeric;
  v_qw_re text := CASE WHEN f_qw IS NOT NULL
    THEN '\m' || regexp_replace(f_qw, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M' END;
  v_ids uuid[];
  v_matched bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=%', p_limit;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.query AS k, spd.keyword_id AS kid, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
      AND spd.keyword_id IS NOT NULL
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (v_qw_re IS NULL OR spd.query ~* v_qw_re)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (v_search IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL AND x.date BETWEEN p_start AND p_end)) vm
             WHERE vm.value_band = ANY(f_lv)))
  ),
  agg AS (
    SELECT l.k,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::numeric AS s_clicks,
           SUM(l.i)::numeric AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.k IS NOT NULL
    GROUP BY l.k
  ),
  kept AS (
    SELECT DISTINCT a.kid, a.s_clicks
    FROM agg a
    WHERE a.kid IS NOT NULL
      AND (f_cmin IS NULL OR a.s_clicks >= f_cmin)
      AND (f_cmax IS NULL OR a.s_clicks <= f_cmax)
      AND (f_imin IS NULL OR a.s_imps >= f_imin)
      AND (f_imax IS NULL OR a.s_imps <= f_imax)
      AND (f_pmin IS NULL OR (a.s_pos_imps > 0 AND a.s_wpos / a.s_pos_imps >= f_pmin))
      AND (f_pmax IS NULL OR (a.s_pos_imps > 0 AND a.s_wpos / a.s_pos_imps <= f_pmax))
  )
  SELECT array_agg(k.kid ORDER BY k.s_clicks DESC, k.kid), count(*)
  INTO v_ids, v_matched
  FROM (SELECT * FROM kept ORDER BY s_clicks DESC, kid LIMIT p_limit) k;

  RETURN jsonb_build_object(
    'keyword_ids', to_jsonb(COALESCE(v_ids, ARRAY[]::uuid[])),
    'returned', COALESCE(v_matched, 0),
    -- Told plainly, never silently truncated: a bulk assignment the user
    -- believes covered everything but did not is the worst failure here.
    'capped', COALESCE(v_matched, 0) >= p_limit,
    'limit', p_limit);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. SAVED VIEWS (P26) — a named arrangement IS the URL state
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_saved_views(
  p_site_id uuid,
  p_surface text DEFAULT 'keyword_workbench'
)
RETURNS TABLE(id uuid, name text, surface text, state jsonb, sort_position integer, shared boolean, created_by uuid, updated_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT v.id, v.name, v.surface, v.state, v."position", v.shared, v.created_by, v.updated_at
  FROM seo.keyword_saved_view v
  WHERE v.site_id = p_site_id
    AND v.surface = p_surface
    AND v.deleted_at IS NULL
    -- Yours, plus anything a colleague shared on this site. A view is a
    -- reading of the table, not a secret.
    AND (v.shared OR v.created_by = (SELECT auth.uid()))
  ORDER BY v."position" NULLS LAST, v.created_at;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_save_view(
  p_site_id uuid,
  p_name text,
  p_state jsonb,
  p_id uuid DEFAULT NULL::uuid,
  p_surface text DEFAULT 'keyword_workbench',
  p_position integer DEFAULT NULL::integer,
  p_shared boolean DEFAULT false
)
RETURNS TABLE(id uuid, name text, surface text, state jsonb, sort_position integer, shared boolean, created_by uuid, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; v_uid uuid := (SELECT auth.uid()); v_id uuid := p_id;
  v_name text := btrim(p_name); v_pos integer := p_position;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'seo_view_name_required: give the view a name you will recognize.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'seo_view_name_too_long: keep it under 80 characters — it has to fit on a tab.';
  END IF;
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF v_id IS NOT NULL THEN
    UPDATE seo.keyword_saved_view v
       SET name = v_name, state = COALESCE(p_state, '{}'::jsonb),
           "position" = COALESCE(v_pos, v."position"), shared = p_shared,
           updated_at = now(), updated_by = v_uid, version = v.version + 1
     WHERE v.id = v_id AND v.site_id = p_site_id AND v.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_view_not_found: that view is gone — save it as a new one.';
    END IF;
  ELSE
    IF v_pos IS NULL THEN
      SELECT COALESCE(max(v."position"), 0) + 1 INTO v_pos
      FROM seo.keyword_saved_view v
      WHERE v.site_id = p_site_id AND v.surface = p_surface AND v.deleted_at IS NULL;
    END IF;
    INSERT INTO seo.keyword_saved_view
      (site_id, name, surface, state, "position", shared, organization_id, created_by, updated_by)
    VALUES (p_site_id, v_name, p_surface, COALESCE(p_state, '{}'::jsonb), v_pos, p_shared,
            v_org, v_uid, v_uid)
    RETURNING seo.keyword_saved_view.id INTO v_id;
  END IF;

  RETURN QUERY
  SELECT v.id, v.name, v.surface, v.state, v."position", v.shared, v.created_by, v.updated_at
  FROM seo.keyword_saved_view v WHERE v.id = v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_delete_saved_view(p_site_id uuid, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE v_uid uuid := (SELECT auth.uid()); v_n int;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  UPDATE seo.keyword_saved_view v
     SET deleted_at = now(), updated_at = now(), updated_by = v_uid
   WHERE v.id = p_id AND v.site_id = p_site_id AND v.deleted_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('deleted', v_n);
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.gsc_breakdown_keyword_ids(uuid, date, date, jsonb, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_saved_views(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_save_view(uuid, text, jsonb, uuid, text, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_delete_saved_view(uuid, uuid) TO authenticated;

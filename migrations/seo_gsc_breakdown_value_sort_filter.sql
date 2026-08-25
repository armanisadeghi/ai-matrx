-- MSR-03/04 (marketing-surface-repair register) — every column on the GSC
-- dimension table must sort AND filter. `gsc_perf_breakdown` already had
-- clicks/impressions/position ranges and a `key`/`topic` sort; this adds the
-- three still missing: CTR range filter, a Class (traffic_class) filter, a
-- Score (value_score) range filter, and CLASS/SCORE/LEVEL as real sort keys.
--
-- THE JOIN-SHAPE RULE (seo_class_movers_one_facts_join.sql): one facts CTE,
-- joined once, scoped to THIS site's window keyword ids — never the 197k
-- global corpus (`seo.gsc_keyword_class_map`/`seo.keyword_value_map` scan
-- their whole scope when handed a NULL id array). The facts join only runs
-- when something actually needs it (`v_need_value`); otherwise both
-- functions are called with an empty array, which resolves in effectively
-- zero rows — cheap insurance against a stray future call site forgetting
-- the dimension guard.
--
-- Class/Score/Level are keyword-level, so — like `topic`/`stamps`/`levels` —
-- they only mean something on the query dimension. A combination request the
-- RPC can't serve raises, never silently returns an empty page.
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
) RETURNS TABLE(
  key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint,
  ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint,
  cmp_ctr numeric, cmp_avg_position numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_qw text := NULLIF(btrim(p_filters->>'query_word'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  f_tp text := NULLIF(btrim(p_filters->>'topic'), '');
  f_tp_id uuid;
  f_pl text := NULLIF(btrim(p_filters->>'placement'), '');
  f_lo text := NULLIF(btrim(p_filters->>'location'), '');
  f_lo_id uuid;
  f_cmin numeric := NULLIF(p_filters->>'clicks_min','')::numeric;
  f_cmax numeric := NULLIF(p_filters->>'clicks_max','')::numeric;
  f_imin numeric := NULLIF(p_filters->>'impressions_min','')::numeric;
  f_imax numeric := NULLIF(p_filters->>'impressions_max','')::numeric;
  f_pmin numeric := NULLIF(p_filters->>'position_min','')::numeric;
  f_pmax numeric := NULLIF(p_filters->>'position_max','')::numeric;
  -- New: CTR range, Class set, Score range (MSR-03/04).
  f_ctrmin numeric := NULLIF(p_filters->>'ctr_min','')::numeric;
  f_ctrmax numeric := NULLIF(p_filters->>'ctr_max','')::numeric;
  f_cls text[] := CASE WHEN jsonb_typeof(p_filters->'traffic_classes') = 'array' AND jsonb_array_length(p_filters->'traffic_classes') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'traffic_classes')) END;
  f_scoremin numeric := NULLIF(p_filters->>'value_score_min','')::numeric;
  f_scoremax numeric := NULLIF(p_filters->>'value_score_max','')::numeric;
  v_qw_re text := CASE WHEN f_qw IS NOT NULL
    THEN '\m' || regexp_replace(f_qw, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M' END;
  v_need_value boolean;
  v_val_ids uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF p_sort NOT IN ('clicks', 'impressions', 'ctr', 'position', 'key', 'delta_clicks', 'topic', 'traffic_class', 'value_score', 'value_band') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF f_tp IS NOT NULL AND f_tp <> 'none' THEN
    BEGIN
      f_tp_id := f_tp::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'gsc_topic_filter_invalid: the service filter takes a topic id or "none".';
    END;
  END IF;
  IF f_pl IS NOT NULL AND f_pl NOT IN ('proposed', 'agent', 'human') THEN
    RAISE EXCEPTION 'gsc_placement_filter_invalid: the placement filter takes proposed, agent or human.';
  END IF;
  IF f_lo IS NOT NULL AND f_lo NOT IN ('unresolved', 'not_local') THEN
    BEGIN
      f_lo_id := f_lo::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'gsc_location_filter_invalid: the location filter takes a business location id, "unresolved" or "not_local".';
    END;
  END IF;
  IF f_cls IS NOT NULL AND EXISTS (
    SELECT 1 FROM unnest(f_cls) c(v) WHERE c.v NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified')
  ) THEN
    RAISE EXCEPTION 'gsc_class_unknown: traffic_classes must be money, educational, brand, mismatch or unclassified';
  END IF;
  -- Class/Score/Level are keyword-level truth — meaningless outside the query
  -- dimension, exactly like `topic`/`stamps`/`levels` above.
  IF p_dimension <> 'query' AND (
    f_cls IS NOT NULL OR f_scoremin IS NOT NULL OR f_scoremax IS NOT NULL
    OR p_sort IN ('traffic_class', 'value_score', 'value_band')
  ) THEN
    RAISE EXCEPTION 'gsc_filter_combination_unsupported: class/score/level only apply to the query dimension';
  END IF;

  v_need_value := p_dimension = 'query' AND (
    f_cls IS NOT NULL OR f_scoremin IS NOT NULL OR f_scoremax IS NOT NULL
    OR p_sort IN ('traffic_class', 'value_score', 'value_band')
  );
  IF v_need_value THEN
    SELECT array_agg(DISTINCT x.keyword_id) INTO v_val_ids
    FROM seo.search_performance_daily x
    WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
      AND x.keyword_id IS NOT NULL
      AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                     AND GREATEST(COALESCE(p_compare_end, p_end), p_end);
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
  topic_set AS (
    SELECT s.kw_id FROM seo.gsc_topic_keyword_set(f_tp_id) s WHERE f_tp_id IS NOT NULL
  ),
  loc_hits AS (
    SELECT kl.keyword_id AS kw_id, kl.location_id
    FROM seo.gsc_keyword_locations(p_site_id) kl
    WHERE f_lo IS NOT NULL
  ),
  local_kw AS (
    SELECT DISTINCT kp.keyword_id AS kw_id
    FROM seo.keyword_place kp
    WHERE f_lo IN ('unresolved', 'not_local') AND kp.deleted_at IS NULL
  ),
  -- MSR-03/04 — Class · Score · Level facts, resolved ONCE for this window's
  -- keyword ids (empty array, and therefore ~free, when nothing needs them).
  kw_facts AS (
    SELECT COALESCE(cm.keyword_id, vm.keyword_id) AS keyword_id,
           COALESCE(cm.traffic_class, 'unclassified') AS traffic_class,
           vm.value_score,
           COALESCE(vm.value_band, 'unvalued') AS value_band
    FROM seo.gsc_keyword_class_map(p_site_id, COALESCE(v_val_ids, ARRAY[]::uuid[])) cm
    FULL JOIN seo.keyword_value_map(p_site_id, COALESCE(v_val_ids, ARRAY[]::uuid[])) vm
      ON vm.keyword_id = cm.keyword_id
    WHERE v_need_value
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
      AND spd.date BETWEEN (SELECT min(w2.d) FROM winner w2)
                       AND (SELECT max(w2.d) FROM winner w2)
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
      AND (f_tp IS NULL
           OR (f_tp = 'none'
               AND NOT EXISTS (SELECT 1 FROM seo.keyword_topic kt
                                WHERE kt.keyword_id = spd.keyword_id
                                  AND kt.is_primary AND kt.deleted_at IS NULL))
           OR (f_tp_id IS NOT NULL AND spd.keyword_id IN (SELECT ts.kw_id FROM topic_set ts)))
      AND (f_pl IS NULL
           OR EXISTS (SELECT 1 FROM seo.keyword_topic kt
                       WHERE kt.keyword_id = spd.keyword_id
                         AND kt.is_primary AND kt.deleted_at IS NULL
                         AND (f_pl <> 'proposed'
                              OR kt.metadata #>> '{placement,confirmed}' = 'false')
                         AND (f_pl <> 'human' OR kt.assigned_by = 'human')
                         AND (f_pl <> 'agent' OR kt.assigned_by IS DISTINCT FROM 'human')))
      AND (f_lo IS NULL
           OR (f_lo_id IS NOT NULL
               AND EXISTS (SELECT 1 FROM loc_hits lh
                            WHERE lh.kw_id = spd.keyword_id AND lh.location_id = f_lo_id))
           OR (f_lo = 'unresolved'
               AND EXISTS (SELECT 1 FROM local_kw lk WHERE lk.kw_id = spd.keyword_id)
               AND NOT EXISTS (SELECT 1 FROM loc_hits lh WHERE lh.kw_id = spd.keyword_id))
           OR (f_lo = 'not_local'
               AND spd.keyword_id IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM local_kw lk WHERE lk.kw_id = spd.keyword_id)))
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
             WHEN 'value_score' THEN kf.value_score
           END AS s_val,
           CASE
             WHEN p_sort = 'topic' THEN (
               SELECT t.name
               FROM seo.keyword_topic kt
               JOIN seo.topic t ON t.id = kt.topic_id AND t.deleted_at IS NULL
               WHERE kt.keyword_id = j.kid AND kt.is_primary AND kt.deleted_at IS NULL
               LIMIT 1
             )
             WHEN p_sort = 'traffic_class' THEN kf.traffic_class
             WHEN p_sort = 'value_band' THEN kf.value_band
           END AS s_txt
    FROM joined j
    LEFT JOIN kw_facts kf ON kf.keyword_id = j.kid
    WHERE (v_search IS NULL OR j.k ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (f_cmin IS NULL OR j.c_clicks >= f_cmin)
      AND (f_cmax IS NULL OR j.c_clicks <= f_cmax)
      AND (f_imin IS NULL OR j.c_imps >= f_imin)
      AND (f_imax IS NULL OR j.c_imps <= f_imax)
      AND (f_pmin IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps >= f_pmin))
      AND (f_pmax IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps <= f_pmax))
      AND (f_ctrmin IS NULL OR (j.c_imps > 0 AND j.c_clicks::numeric / j.c_imps >= f_ctrmin))
      AND (f_ctrmax IS NULL OR (j.c_imps > 0 AND j.c_clicks::numeric / j.c_imps <= f_ctrmax))
      AND (f_cls IS NULL OR kf.traffic_class = ANY(f_cls))
      AND (f_scoremin IS NULL OR kf.value_score >= f_scoremin)
      AND (f_scoremax IS NULL OR kf.value_score <= f_scoremax)
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
    (CASE WHEN p_sort IN ('topic', 'traffic_class', 'value_band') AND p_sort_dir = 'desc' THEN f.s_txt END) DESC NULLS LAST,
    (CASE WHEN p_sort IN ('topic', 'traffic_class', 'value_band') AND p_sort_dir = 'asc' THEN f.s_txt END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.gsc_perf_breakdown(uuid, text, date, date, date, date, jsonb, text, text, text, int, int) TO authenticated;

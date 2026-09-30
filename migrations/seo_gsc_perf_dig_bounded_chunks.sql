-- draft: gsc-ideas 2026-09-30 — option (c) rewrite of seo.gsc_perf_dig, exact but only ~20% faster; parked pending the owner's ruling on a winner-resolved daily rollup table. Needs -- based-on lines, real function/watermark names for __FN__/__WM__, and an inverse before it can apply.
CREATE OR REPLACE FUNCTION seo.__FN__(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date DEFAULT NULL::date, p_compare_end date DEFAULT NULL::date, p_conditions jsonb DEFAULT '[]'::jsonb, p_filters jsonb DEFAULT '{}'::jsonb, p_sort text DEFAULT 'clicks'::text, p_sort_dir text DEFAULT 'desc'::text, p_limit integer DEFAULT 100, p_traffic_class text DEFAULT NULL::text, p_level text DEFAULT NULL::text)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint, ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint, cmp_ctr numeric, cmp_avg_position numeric, delta_clicks bigint, delta_impressions bigint, delta_ctr numeric, delta_position numeric, delta_clicks_pct numeric, delta_impressions_pct numeric, traffic_class text, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'pg_temp'
 SET plan_cache_mode TO 'force_custom_plan'
 SET work_mem TO '__WM__'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_need_class boolean;
  v_metrics constant text[] := ARRAY[
    'clicks','impressions','ctr','position',
    'cmp_clicks','cmp_impressions','cmp_ctr','cmp_position',
    'delta_clicks','delta_impressions','delta_ctr','delta_position',
    'delta_clicks_pct','delta_impressions_pct'];
  v_cond jsonb;
  v_metric text;
  v_op text;
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_lv text := NULLIF(btrim(p_level), '');
  -- THE SCOPE RULE: the span is walked in bounded chunks, one site and at
  -- most CHUNK_DAYS days per statement; each chunk reads its rows ONCE and
  -- picks each day's winning run from the rows it already holds.
  c_chunk_days constant integer := 63;
  v_lo date;
  v_hi date;
  v_a date;
  v_b date;
  -- The per-(key, keyword) partials every chunk adds to; rolled up once at the end.
  a_k text[] := '{}';   a_kid uuid[] := '{}';
  a_cn bigint[] := '{}'; a_cpid text[] := '{}'; a_cc bigint[] := '{}'; a_ci bigint[] := '{}';
  a_cw numeric[] := '{}'; a_cpi bigint[] := '{}';
  a_mn bigint[] := '{}'; a_mpid text[] := '{}'; a_mc bigint[] := '{}'; a_mi bigint[] := '{}';
  a_mw numeric[] := '{}'; a_mpi bigint[] := '{}';
  t_k text[]; t_kid uuid[];
  t_cn bigint[]; t_cpid text[]; t_cc bigint[]; t_ci bigint[]; t_cw numeric[]; t_cpi bigint[];
  t_mn bigint[]; t_mpid text[]; t_mc bigint[]; t_mi bigint[]; t_mw numeric[]; t_mpi bigint[];
  v_level_kids uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension IS NULL OR p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dig_dimension_unsupported: % (dig rules run on query or page)', COALESCE(p_dimension, '(null)');
  END IF;
  IF p_traffic_class IS NOT NULL
     AND p_traffic_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_traffic_class;
  END IF;
  IF f_lv IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM seo.gsc_value_vocabulary(p_site_id, 'value_band') v WHERE v.value = f_lv)
     AND f_lv NOT IN ('unvalued', 'negative') THEN
    RAISE EXCEPTION 'gsc_level_unknown: % is not one of this site''s levels', f_lv;
  END IF;
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF jsonb_typeof(p_conditions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'gsc_dig_conditions_invalid: conditions must be a json array';
  END IF;
  IF jsonb_array_length(p_conditions) > 20 THEN
    RAISE EXCEPTION 'gsc_dig_too_many_conditions: max 20';
  END IF;
  FOR v_cond IN SELECT * FROM jsonb_array_elements(p_conditions) LOOP
    v_metric := v_cond->>'metric';
    v_op := v_cond->>'op';
    IF v_metric IS NULL OR NOT (v_metric = ANY (v_metrics)) THEN
      RAISE EXCEPTION 'gsc_dig_metric_unknown: %', COALESCE(v_metric, '(missing)');
    END IF;
    IF v_op IS NULL OR v_op NOT IN ('gt', 'gte', 'lt', 'lte') THEN
      RAISE EXCEPTION 'gsc_dig_op_unknown: %', COALESCE(v_op, '(missing)');
    END IF;
    IF jsonb_typeof(v_cond->'value') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'gsc_dig_value_invalid: condition on % needs a numeric value', v_metric;
    END IF;
    IF (v_metric LIKE 'cmp\_%' OR v_metric LIKE 'delta\_%') AND p_compare_start IS NULL THEN
      RAISE EXCEPTION 'gsc_dig_compare_required: metric % needs a compare period', v_metric;
    END IF;
  END LOOP;
  IF p_sort <> 'key' AND NOT (p_sort = ANY (v_metrics)) THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF (p_sort LIKE 'cmp\_%' OR p_sort LIKE 'delta\_%') AND p_compare_start IS NULL THEN
    RAISE EXCEPTION 'gsc_dig_compare_required: sort % needs a compare period', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  -- C5d: 0 = NO LIMIT — every row that passes. This is the STAMPING path
  -- (`fn_evaluate_condition_matchers`): a segment holds every keyword that
  -- matches, not the first page of them. Tables always pass 1..1000; the
  -- editor's own validation never offers 0, so a UI can't reach this by
  -- accident. Bounded by THE SCOPE RULE — one window, never the corpus.
  IF p_limit < 0 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% (1–1000, or 0 for every match)', p_limit;
  END IF;

  IF (p_traffic_class IS NOT NULL OR f_lv IS NOT NULL) AND v_profile = 'page' THEN
    v_profile := 'query_page';
  END IF;
  v_need_class := p_traffic_class IS NOT NULL OR v_profile IN ('query', 'query_page');

  -- Walk [LEAST(start), GREATEST(end)] in chunks of at most c_chunk_days days.
  -- A day's winning run is decided from that day's rows alone (DISTINCT ON
  -- date ORDER BY created_at DESC, run_id DESC), so chunking by day is exact.
  -- Chunks that touch neither window are skipped (they add no row).
  v_lo := LEAST(COALESCE(p_compare_start, p_start), p_start);
  v_hi := GREATEST(COALESCE(p_compare_end, p_end), p_end);
  v_a := v_lo;
  WHILE v_a IS NOT NULL AND v_hi IS NOT NULL AND v_a <= v_hi LOOP
    v_b := LEAST(v_a + (c_chunk_days - 1), v_hi);
    IF (v_a <= p_end AND v_b >= p_start)
       OR (p_compare_start IS NOT NULL AND v_a <= p_compare_end AND v_b >= p_compare_start) THEN
      WITH winner AS (
        -- Each day's winning run, exactly as DISTINCT ON (date) ORDER BY
        -- created_at DESC, run_id DESC decides it: one backward index probe per day.
        SELECT dd.d::date AS d, x.rid
        FROM generate_series(v_a, v_b, interval '1 day') AS dd(d)
        CROSS JOIN LATERAL (
          SELECT spd.run_id AS rid
          FROM seo.search_performance_daily spd
          WHERE spd.provider = 'gsc'
            AND spd.site_id = p_site_id
            AND spd.dimension_profile = v_profile
            AND spd.date = dd.d::date
          ORDER BY spd.created_at DESC, spd.run_id DESC
          LIMIT 1) x
        WHERE dd.d::date BETWEEN p_start AND p_end
           OR (p_compare_start IS NOT NULL AND dd.d::date BETWEEN p_compare_start AND p_compare_end)
      ),
      r AS (
        SELECT spd.date AS d,
               spd.clicks AS c,
               spd.impressions AS i,
               spd.average_position AS pos,
               spd.page_id AS pid,
               spd.keyword_id AS kid,
               spd.query AS q,
               CASE WHEN p_dimension = 'page' OR f_pc IS NOT NULL OR f_pe IS NOT NULL
                    THEN spd.extras->>'page_url' END AS pu,
               (spd.date BETWEEN p_start AND p_end) AS in_cur,
               (p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
                AND spd.date BETWEEN p_compare_start AND p_compare_end) AS in_cmp
        FROM winner w
        JOIN seo.search_performance_daily spd
          ON spd.provider = 'gsc'
         AND spd.site_id = p_site_id
         AND spd.dimension_profile = v_profile
         AND spd.date BETWEEN v_a AND v_b
         AND spd.date = w.d
         -- IS TRUE keeps run_id a FILTER: as a join key the planner walks
         -- idx_spd_run (a whole run, every site) once per day.
         AND (spd.run_id = w.rid) IS TRUE
      ),
      part AS (
        SELECT CASE p_dimension WHEN 'query' THEN r.q ELSE COALESCE(r.pu, r.pid::text) END AS k,
               r.kid,
               COUNT(*) FILTER (WHERE r.in_cur) AS cn,
               MIN(r.pid::text) FILTER (WHERE r.in_cur) AS cpid,
               SUM(r.c) FILTER (WHERE r.in_cur) AS cc,
               SUM(r.i) FILTER (WHERE r.in_cur) AS ci,
               SUM(r.pos * r.i) FILTER (WHERE r.in_cur AND r.pos IS NOT NULL) AS cw,
               SUM(r.i) FILTER (WHERE r.in_cur AND r.pos IS NOT NULL) AS cpi,
               COUNT(*) FILTER (WHERE r.in_cmp) AS mn,
               MIN(r.pid::text) FILTER (WHERE r.in_cmp) AS mpid,
               SUM(r.c) FILTER (WHERE r.in_cmp) AS mc,
               SUM(r.i) FILTER (WHERE r.in_cmp) AS mi,
               SUM(r.pos * r.i) FILTER (WHERE r.in_cmp AND r.pos IS NOT NULL) AS mw,
               SUM(r.i) FILTER (WHERE r.in_cmp AND r.pos IS NOT NULL) AS mpi
        FROM r
        WHERE (CASE p_dimension WHEN 'query' THEN r.q ELSE COALESCE(r.pu, r.pid::text) END) IS NOT NULL
          AND (f_qc IS NULL OR r.q ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
          AND (f_qe IS NULL OR r.q = f_qe)
          AND (f_qn IS NULL OR r.q IS DISTINCT FROM f_qn)
          AND (f_pc IS NULL OR r.pu ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
          AND (f_pe IS NULL OR r.pu = f_pe OR r.pid::text = f_pe)
        GROUP BY 1, 2
      )
      SELECT array_agg(p.k), array_agg(p.kid),
             array_agg(p.cn), array_agg(p.cpid), array_agg(p.cc), array_agg(p.ci), array_agg(p.cw), array_agg(p.cpi),
             array_agg(p.mn), array_agg(p.mpid), array_agg(p.mc), array_agg(p.mi), array_agg(p.mw), array_agg(p.mpi)
        INTO t_k, t_kid, t_cn, t_cpid, t_cc, t_ci, t_cw, t_cpi, t_mn, t_mpid, t_mc, t_mi, t_mw, t_mpi
      FROM part p;
      IF t_k IS NOT NULL THEN
        a_k := a_k || t_k;       a_kid := a_kid || t_kid;
        a_cn := a_cn || t_cn;    a_cpid := a_cpid || t_cpid; a_cc := a_cc || t_cc;
        a_ci := a_ci || t_ci;    a_cw := a_cw || t_cw;       a_cpi := a_cpi || t_cpi;
        a_mn := a_mn || t_mn;    a_mpid := a_mpid || t_mpid; a_mc := a_mc || t_mc;
        a_mi := a_mi || t_mi;    a_mw := a_mw || t_mw;       a_mpi := a_mpi || t_mpi;
      END IF;
    END IF;
    v_a := v_b + 1;
  END LOOP;

  -- The level filter keeps a row whose keyword sits in that value band.
  -- keyword_value_map scores each keyword on its own, so it is asked about
  -- exactly the keywords these rows carry.
  IF f_lv IS NOT NULL THEN
    SELECT array_agg(vm.keyword_id) INTO v_level_kids
    FROM seo.keyword_value_map(p_site_id,
           (SELECT array_agg(DISTINCT u.kid) FROM unnest(a_kid) AS u(kid) WHERE u.kid IS NOT NULL)) vm
    WHERE vm.value_band = f_lv;
  END IF;

  RETURN QUERY
  WITH p AS (
    SELECT * FROM unnest(a_k, a_kid, a_cn, a_cpid, a_cc, a_ci, a_cw, a_cpi,
                         a_mn, a_mpid, a_mc, a_mi, a_mw, a_mpi)
      AS u(k, kid, cn, cpid, cc, ci, cw, cpi, mn, mpid, mc, mi, mw, mpi)
  ),
  cm AS (
    -- Class only for the keywords these rows carry — never the whole corpus.
    SELECT m.keyword_id, m.traffic_class
    FROM seo.gsc_keyword_class_map(p_site_id,
           (SELECT array_agg(DISTINCT p.kid) FROM p WHERE p.kid IS NOT NULL)) m
    WHERE v_need_class
  ),
  pc AS (
    SELECT p.*,
           CASE WHEN v_need_class THEN COALESCE(cm.traffic_class, 'unclassified') END AS cls
    FROM p
    LEFT JOIN cm ON cm.keyword_id = p.kid
    WHERE (p_traffic_class IS NULL
           OR COALESCE(cm.traffic_class, 'unclassified') = p_traffic_class)
      AND (f_lv IS NULL OR p.kid = ANY (COALESCE(v_level_kids, '{}'::uuid[])))
  ),
  joined AS (
    SELECT pc.k,
           COALESCE(MIN(pc.cpid), MIN(pc.mpid))::uuid AS pid,
           COALESCE(MIN(pc.kid::text) FILTER (WHERE pc.cn > 0),
                    MIN(pc.kid::text) FILTER (WHERE pc.mn > 0))::uuid AS kid,
           COALESCE(MAX(pc.cls) FILTER (WHERE pc.cn > 0),
                    MAX(pc.cls) FILTER (WHERE pc.mn > 0)) AS cls,
           COALESCE(SUM(pc.cc), 0)::bigint AS c_clicks,
           COALESCE(SUM(pc.ci), 0)::bigint AS c_imps,
           SUM(pc.cw) AS c_wpos,
           COALESCE(SUM(pc.cpi), 0)::bigint AS c_pos_imps,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(SUM(pc.mc), 0)::bigint END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(SUM(pc.mi), 0)::bigint END AS m_imps,
           SUM(pc.mw) AS m_wpos,
           COALESCE(SUM(pc.mpi), 0)::bigint AS m_pos_imps
    FROM pc
    GROUP BY pc.k
  ),
  metrics AS (
    SELECT j.k, j.pid, j.kid, j.cls,
           j.c_clicks, j.c_imps,
           CASE WHEN j.c_imps > 0 THEN round(j.c_clicks::numeric / j.c_imps, 6) END AS c_ctr,
           CASE WHEN j.c_pos_imps > 0 THEN round(j.c_wpos / j.c_pos_imps, 2) END AS c_pos,
           j.m_clicks, j.m_imps,
           CASE WHEN j.m_imps > 0 THEN round(j.m_clicks::numeric / j.m_imps, 6) END AS m_ctr,
           CASE WHEN j.m_pos_imps > 0 THEN round(j.m_wpos / j.m_pos_imps, 2) END AS m_pos
    FROM joined j
  ),
  passed AS (
    SELECT m.*,
           CASE WHEN p_sort = 'key' THEN NULL
                ELSE seo.gsc_dig_metric_value(p_sort, m.c_clicks, m.c_imps, m.c_ctr, m.c_pos,
                                              m.m_clicks, m.m_imps, m.m_ctr, m.m_pos)
           END AS s_val
    FROM metrics m
    WHERE jsonb_array_length(p_conditions) = 0
       OR (SELECT bool_and(seo.gsc_dig_condition_passes(
              c->>'op',
              seo.gsc_dig_metric_value(c->>'metric', m.c_clicks, m.c_imps, m.c_ctr, m.c_pos,
                                       m.m_clicks, m.m_imps, m.m_ctr, m.m_pos),
              (c->>'value')::numeric))
           FROM jsonb_array_elements(p_conditions) c)
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         f.c_ctr,
         f.c_pos,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         f.m_ctr,
         f.m_pos,
         (f.c_clicks - f.m_clicks)::bigint,
         (f.c_imps - f.m_imps)::bigint,
         f.c_ctr - f.m_ctr,
         f.c_pos - f.m_pos,
         CASE WHEN f.m_clicks > 0 THEN round((f.c_clicks - f.m_clicks)::numeric * 100 / f.m_clicks, 2) END,
         CASE WHEN f.m_imps > 0 THEN round((f.c_imps - f.m_imps)::numeric * 100 / f.m_imps, 2) END,
         f.cls,
         COUNT(*) OVER ()::bigint
  FROM passed f
  ORDER BY
    (CASE WHEN p_sort_dir = 'desc' THEN f.s_val END) DESC NULLS LAST,
    (CASE WHEN p_sort_dir = 'asc' THEN f.s_val END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  -- LIMIT NULL is "no limit" in Postgres — the 0 sentinel lands here.
  LIMIT (CASE WHEN p_limit = 0 THEN NULL ELSE p_limit END);
END;
$function$

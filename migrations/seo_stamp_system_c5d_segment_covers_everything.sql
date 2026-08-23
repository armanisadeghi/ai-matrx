-- ============================================================================
-- C5d (2026-08-23) — A SEGMENT COVERS EVERY KEYWORD THAT MATCHES.
--
-- Arman's sentence is the specification: "ten thousand words getting
-- impressions, five thousand have one or fewer impressions — why can't I just
-- put a category on THOSE so they instantly have a place they belong." Those.
-- All of them.
--
-- C5 reused a dig rule verbatim, INCLUDING its `row_limit`, so a rule matching
-- 2,952 parked keywords stamped the first 1,000. C5b made that loud rather
-- than silent. Loud was the wrong answer to the wrong question: a row limit is
-- how many rows a TABLE shows, not what a segment MEANS. Nobody setting
-- "100 rows max" on a dig rule was deciding that their "parked" segment holds
-- 100 keywords.
--
-- So: `p_limit = 0` means NO LIMIT — the stamping path, and the only caller
-- that uses it. Everything else about the rule is still reused verbatim (base
-- filters, class pin, level pin, conditions, compare semantics), so what the
-- table shows is still a PAGE of exactly what gets stamped. The evaluator
-- reports `matched` (the whole set) and `table_row_limit` (what the tab shows)
-- so the UI can say which is which instead of warning about a cap that no
-- longer exists.
--
-- 🚨 THE SCOPE RULE is untouched and is what keeps this bounded: one window,
-- never the corpus. Largest 28-day window across every site measured
-- 2026-08-23: All Green Recycling, 27,234 keywords — the same order as the
-- whole-site text-matcher pass `fn_evaluate_matchers` already runs.
-- ============================================================================

BEGIN;

-- ── gsc_perf_dig: p_limit = 0 ⇒ no limit (the stamping path) ────────────────
-- Body is otherwise byte-identical to C5's. Only the guard and the LIMIT move.
CREATE OR REPLACE FUNCTION seo.gsc_perf_dig(
  p_site_id uuid, p_dimension text, p_start date, p_end date,
  p_compare_start date DEFAULT NULL, p_compare_end date DEFAULT NULL,
  p_conditions jsonb DEFAULT '[]'::jsonb, p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort text DEFAULT 'clicks', p_sort_dir text DEFAULT 'desc',
  p_limit integer DEFAULT 100, p_traffic_class text DEFAULT NULL,
  p_level text DEFAULT NULL)
RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint,
              ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint,
              cmp_ctr numeric, cmp_avg_position numeric, delta_clicks bigint,
              delta_impressions bigint, delta_ctr numeric, delta_position numeric,
              delta_clicks_pct numeric, delta_impressions_pct numeric,
              traffic_class text, total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
SET plan_cache_mode TO 'force_custom_plan'
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
      CASE WHEN v_need_class
           THEN COALESCE(cm.traffic_class, 'unclassified') END AS cls,
      CASE p_dimension
        WHEN 'query' THEN spd.query
        ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
      END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm
      ON v_need_class AND cm.keyword_id = spd.keyword_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (p_traffic_class IS NULL
           OR COALESCE(cm.traffic_class, 'unclassified') = p_traffic_class)
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                                  AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = f_lv))
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           MAX(l.cls) AS cls,
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
           MAX(l.cls) AS cls,
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
           COALESCE(cur.cls, cmp.cls) AS cls,
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
$function$;

-- ── the evaluator stamps EVERY match ────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.fn_evaluate_condition_matchers(
  p_site_id uuid,
  p_matcher_ids uuid[] DEFAULT NULL,
  p_dimension_id uuid DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_start date := p_start;
  v_end date := p_end;
  v_cmp_start date;
  v_cmp_end date;
  v_use_cmp boolean;
  v_span int;
  v_m record;
  v_rule seo.gsc_dig_rule%ROWTYPE;
  v_found int;
  v_stamped int;
  v_removed int;
  v_total_stamped int := 0;
  v_total_removed int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  IF v_end IS NULL THEN
    SELECT max(spd.date) INTO v_end
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query';
  END IF;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'gsc_no_performance_data: this site has no Search Console days yet, so there is no "now" to evaluate against';
  END IF;
  IF v_start IS NULL THEN v_start := v_end - 27; END IF;
  IF v_start > v_end THEN
    RAISE EXCEPTION 'gsc_window_inverted: the window starts after it ends';
  END IF;
  v_span := (v_end - v_start) + 1;
  v_cmp_end := v_start - 1;
  v_cmp_start := v_cmp_end - (v_span - 1);

  CREATE TEMP TABLE IF NOT EXISTS _cond_hit (kw_id uuid PRIMARY KEY) ON COMMIT DROP;

  FOR v_m IN
    SELECT dm.id, dm.value_id, dm.condition_rule_id,
           cv.parent_id AS dim_id, cv.name AS value_label, cd.name AS dim_label,
           COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.kind = 'condition'
      AND dm.enabled AND dm.deleted_at IS NULL
      AND (p_matcher_ids IS NULL OR dm.id = ANY(p_matcher_ids))
      AND (p_dimension_id IS NULL OR cv.parent_id = p_dimension_id)
    ORDER BY dm.id
  LOOP
    SELECT * INTO v_rule FROM seo.gsc_dig_rule r WHERE r.id = v_m.condition_rule_id AND r.deleted_at IS NULL;
    IF NOT FOUND THEN
      v_results := v_results || jsonb_build_object(
        'matcher_id', v_m.id, 'value', v_m.value_label, 'error', 'rule_missing');
      CONTINUE;
    END IF;

    v_use_cmp := v_rule.sort_metric LIKE 'cmp\_%' OR v_rule.sort_metric LIKE 'delta\_%'
      OR EXISTS (SELECT 1 FROM jsonb_array_elements(v_rule.conditions) c
                  WHERE c->>'metric' LIKE 'cmp\_%' OR c->>'metric' LIKE 'delta\_%');

    TRUNCATE _cond_hit;
    -- C5d: `0` — EVERY keyword the rule matches, not the first page of them.
    -- The rule's `row_limit` governs the table it is displayed in; it was
    -- never a statement about what the segment means.
    INSERT INTO _cond_hit
    SELECT DISTINCT d.keyword_id
    FROM seo.gsc_perf_dig(
           p_site_id, v_rule.dimension, v_start, v_end,
           CASE WHEN v_use_cmp THEN v_cmp_start END,
           CASE WHEN v_use_cmp THEN v_cmp_end END,
           v_rule.conditions, v_rule.base_filters, v_rule.sort_metric,
           v_rule.sort_dir, 0, v_rule.traffic_class, v_rule.level) d
    WHERE d.keyword_id IS NOT NULL;
    GET DIAGNOSTICS v_found = ROW_COUNT;

    DELETE FROM _cond_hit c
    WHERE v_m.single_card AND EXISTS (
      SELECT 1 FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id
      WHERE kf.keyword_id = c.kw_id AND cv.parent_id = v_m.dim_id
        AND kf.deleted_at IS NULL AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
        AND (kf.pinned OR kf.source = 'human'));

    WITH up AS (
      INSERT INTO seo.keyword_facet
        (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
      SELECT c.kw_id, v_m.value_id, p_site_id, 'matcher', 100, v_m.id, now(), v_org, 'internal'
      FROM _cond_hit c
      ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid))
        WHERE deleted_at IS NULL
      DO UPDATE SET matcher_id = EXCLUDED.matcher_id, as_of = now(), updated_at = now()
        WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
      RETURNING 1
    ) SELECT count(*) INTO v_stamped FROM up;

    WITH gone AS (
      UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
       WHERE kf.matcher_id = v_m.id AND kf.source = 'matcher'
         AND NOT kf.pinned AND kf.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM _cond_hit c WHERE c.kw_id = kf.keyword_id)
      RETURNING 1
    ) SELECT count(*) INTO v_removed FROM gone;

    UPDATE seo.dimension_value_matcher dm
       SET last_evaluated_at = now(),
           match_count = (SELECT count(*) FROM seo.keyword_facet kf
                           WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL)
     WHERE dm.id = v_m.id;

    v_total_stamped := v_total_stamped + v_stamped;
    v_total_removed := v_total_removed + v_removed;
    v_results := v_results || jsonb_build_object(
      'matcher_id', v_m.id, 'rule', v_rule.name,
      'dimension', v_m.dim_label, 'value', v_m.value_label,
      'matched', v_found, 'stamped', v_stamped, 'removed', v_removed,
      -- Context for the UI, not a cap: how many rows the Dig Here TABLE shows
      -- of the set that was stamped.
      'table_row_limit', v_rule.row_limit,
      'used_compare', v_use_cmp);
  END LOOP;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end,
                                 'compare_start', v_cmp_start, 'compare_end', v_cmp_end),
    'matchers', jsonb_array_length(v_results),
    'stamped', v_total_stamped, 'removed', v_total_removed,
    'evaluated_at', now(), 'results', v_results);
END;
$function$;

COMMIT;

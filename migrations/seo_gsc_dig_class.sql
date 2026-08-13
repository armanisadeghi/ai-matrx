-- CLASS-AWARE Dig Here (2026-08-08) — the traffic-class layer and the dig
-- rules engine merged. "Show me MONEY queries at position 8–20 losing
-- impressions" becomes one rule instead of an eyeball join across tabs.
--
-- 1. seo.gsc_dig_rule gains `traffic_class` (nullable) — a rule may pin
--    itself to one class from the ONE resolver
--    (seo.gsc_keyword_class_map — user site valuation > intent_class >
--    'unclassified'; never a second mapping).
-- 2. seo.gsc_perf_dig gains `p_traffic_class` + a `traffic_class` output
--    column. Query-dimension rows always carry their class. A
--    class-FILTERED page-dimension dig switches to the `query_page`
--    profile (class travels with the query; same approach as
--    gsc_perf_class_movers) — totals there sit below the bare `page`
--    profile because Google anonymizes some queries; that loss is inherent
--    to class attribution, not a bug. An UNfiltered page dig keeps the
--    `page` profile and reports traffic_class NULL (page-profile facts
--    carry no query linkage).
-- 3. Three class-aware system templates (fixed UUIDs …0006-0008).

ALTER TABLE seo.gsc_dig_rule
  ADD COLUMN IF NOT EXISTS traffic_class text
  CHECK (traffic_class IN ('money', 'educational', 'brand', 'mismatch', 'unclassified'));

-- Return type changes (new column) — the old signature must go first.
DROP FUNCTION IF EXISTS seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, int);

CREATE OR REPLACE FUNCTION seo.gsc_perf_dig(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL,
  p_conditions jsonb DEFAULT '[]'::jsonb,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_sort text DEFAULT 'clicks',
  p_sort_dir text DEFAULT 'desc',
  p_limit int DEFAULT 100,
  p_traffic_class text DEFAULT NULL
) RETURNS TABLE (
  key text,
  page_id uuid,
  keyword_id uuid,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  avg_position numeric,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_ctr numeric,
  cmp_avg_position numeric,
  delta_clicks bigint,
  delta_impressions bigint,
  delta_ctr numeric,
  delta_position numeric,
  delta_clicks_pct numeric,
  delta_impressions_pct numeric,
  traffic_class text,
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  -- Class is resolvable only when facts carry keyword_id (query and
  -- query_page profiles). Joined for the filter, and for query-dim output.
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
BEGIN
  IF p_dimension IS NULL OR p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dig_dimension_unsupported: % (dig rules run on query or page)', COALESCE(p_dimension, '(null)');
  END IF;
  IF p_traffic_class IS NOT NULL
     AND p_traffic_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_traffic_class;
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
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=%', p_limit;
  END IF;

  -- A class-filtered PAGE dig needs query linkage: switch to query_page.
  IF p_traffic_class IS NOT NULL AND v_profile = 'page' THEN
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
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, int, text) TO authenticated;

-- ─── Class-aware system templates (fixed UUIDs; edits ship as re-seeds) ──
-- Thresholds are deliberate starting points for Arman to refine.

INSERT INTO seo.gsc_dig_rule
  (id, name, description, dimension, conditions, sort_metric, sort_dir, row_limit, is_template, traffic_class)
VALUES
  ('a1d16001-0000-4000-8000-000000000006', 'Money keywords losing ground',
   'The traffic that pays the bills, shrinking: money-class queries down more than 20% versus the compare period. The single most important list on this site.',
   'query',
   '[{"metric":"delta_clicks_pct","op":"lt","value":-20},{"metric":"cmp_clicks","op":"gt","value":10}]'::jsonb,
   'delta_clicks', 'asc', 100, true, 'money'),
  ('a1d16001-0000-4000-8000-000000000007', 'Mismatch traffic rising',
   'Traffic that can never serve this business, growing: rising impressions on not-offered / avoided / negative-value queries. Growth here inflates the totals while meaning nothing.',
   'query',
   '[{"metric":"delta_impressions_pct","op":"gt","value":25},{"metric":"impressions","op":"gt","value":500}]'::jsonb,
   'impressions', 'desc', 100, true, 'mismatch'),
  ('a1d16001-0000-4000-8000-000000000008', 'Educational risers',
   'Educational queries taking off — SEO juice building. Check each one has a money page to funnel toward, or the strength is given away for free.',
   'query',
   '[{"metric":"delta_clicks_pct","op":"gt","value":30},{"metric":"clicks","op":"gt","value":10}]'::jsonb,
   'delta_clicks', 'desc', 100, true, 'educational')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  dimension = EXCLUDED.dimension,
  conditions = EXCLUDED.conditions,
  sort_metric = EXCLUDED.sort_metric,
  sort_dir = EXCLUDED.sort_dir,
  row_limit = EXCLUDED.row_limit,
  is_template = true,
  traffic_class = EXCLUDED.traffic_class,
  deleted_at = NULL,
  updated_at = now();

-- 2026-08-12 (applied live via Supabase MCP, not by re-running this file):
-- ALTER FUNCTION seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb,
--   jsonb, text, text, integer, text) SET plan_cache_mode = force_custom_plan;
-- Fixes the ~120s cold stall — the cached generic plan from the first call
-- was pathological for later parameter shapes; a custom plan per call is
-- negligible against the function's aggregate scans.

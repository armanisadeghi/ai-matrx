-- Search Console v2 — Dig Here rules engine, Watchlist reads, New Pages
-- launch tracker. Extends the read layer in seo_gsc_perf_rpcs.sql; THE
-- ACCURACY CONTRACT in that file's header applies to every function here
-- (winning-run dedup, weighted position, escaped ILIKE, compare bounds
-- both-or-neither). Everything below is SECURITY INVOKER — RLS on
-- seo.search_performance_daily / web.page / seo.keyword is the ceiling.
--
-- Pieces:
--   * seo.gsc_dig_rule — saved dig rules. System templates (is_template,
--     ownerless, fixed UUIDs, world-readable) + user rules (owner-writable,
--     org-readable). Rule CONTENTS are always sent to gsc_perf_dig by the
--     client — the table stores rules, the RPC stays stateless so unsaved
--     drafts preview identically.
--   * seo.gsc_perf_dig — breakdown + a conditions engine. NO dynamic SQL:
--     the conditions jsonb is validated up front (whitelisted metric/op,
--     numeric value) and evaluated set-based via two IMMUTABLE helpers.
--   * seo.gsc_perf_watch — metrics for an explicit watched set of page ids
--     + keyword ids, ANCHORED on the input arrays so zero-data watched
--     items return real zero rows.
--   * seo.gsc_perf_page_first_dates — all-history first/last impression
--     dates per page (the launch tracker's milestone read).
--   * web.page.launch_tracking jsonb — the manual "new page" tracker state
--     ({added_at, added_by, indexing_requested_at|null, notes|null});
--     team-visible, written directly under existing web.page RLS.

-- ─── Dig rules table ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS seo.gsc_dig_rule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  dimension text NOT NULL DEFAULT 'query' CHECK (dimension IN ('query', 'page')),
  -- [{"metric": "...", "op": "gt|gte|lt|lte", "value": <number>}, ...] (ANDed)
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_metric text NOT NULL DEFAULT 'clicks',
  sort_dir text NOT NULL DEFAULT 'desc' CHECK (sort_dir IN ('asc', 'desc')),
  row_limit int NOT NULL DEFAULT 100 CHECK (row_limit BETWEEN 1 AND 1000),
  -- GscFilters shape, query/page group only (dig dimensions are query|page)
  base_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_template boolean NOT NULL DEFAULT false,
  -- NULL = usable on any site the user can read
  site_id uuid REFERENCES web.site (id) ON DELETE CASCADE,
  organization_id uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  -- Templates are the ONLY ownerless rows.
  CONSTRAINT gsc_dig_rule_owned CHECK (is_template OR created_by IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_seo_gsc_dig_rule_owner
  ON seo.gsc_dig_rule (created_by) WHERE deleted_at IS NULL;

ALTER TABLE seo.gsc_dig_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS std_select ON seo.gsc_dig_rule;
CREATE POLICY std_select ON seo.gsc_dig_rule FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      is_template
      OR created_by = (SELECT auth.uid())
      OR (organization_id IS NOT NULL AND iam.has_org_access(organization_id))
    )
  );

DROP POLICY IF EXISTS std_insert ON seo.gsc_dig_rule;
CREATE POLICY std_insert ON seo.gsc_dig_rule FOR INSERT TO authenticated
  WITH CHECK (NOT is_template AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS std_update ON seo.gsc_dig_rule;
CREATE POLICY std_update ON seo.gsc_dig_rule FOR UPDATE TO authenticated
  USING (NOT is_template AND created_by = (SELECT auth.uid()))
  WITH CHECK (NOT is_template AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS svc_all ON seo.gsc_dig_rule;
CREATE POLICY svc_all ON seo.gsc_dig_rule TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON seo.gsc_dig_rule TO authenticated;

DROP TRIGGER IF EXISTS _touch_row ON seo.gsc_dig_rule;
CREATE TRIGGER _touch_row BEFORE UPDATE ON seo.gsc_dig_rule
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

-- ─── Seeded system templates (fixed UUIDs; edits ship as re-seeds) ──────
-- Thresholds are deliberate starting points for Arman to refine.

INSERT INTO seo.gsc_dig_rule
  (id, name, description, dimension, conditions, sort_metric, sort_dir, row_limit, is_template)
VALUES
  ('a1d16001-0000-4000-8000-000000000001', 'Striking distance',
   'Queries sitting just off page one (position 8–20) with real demand — small on-page pushes move these to page 1.',
   'query',
   '[{"metric":"position","op":"gte","value":8},{"metric":"position","op":"lte","value":20},{"metric":"impressions","op":"gt","value":500}]'::jsonb,
   'impressions', 'desc', 100, true),
  ('a1d16001-0000-4000-8000-000000000002', 'CTR laggards',
   'Ranking well (top 10) with strong impressions but a weak click-through rate — title/meta rewrites pay off here.',
   'query',
   '[{"metric":"impressions","op":"gt","value":1000},{"metric":"ctr","op":"lt","value":0.02},{"metric":"position","op":"lte","value":10}]'::jsonb,
   'impressions', 'desc', 100, true),
  ('a1d16001-0000-4000-8000-000000000003', 'Losing ground',
   'Queries that had meaningful traffic and dropped more than 20% versus the compare period — catch decay early.',
   'query',
   '[{"metric":"delta_clicks_pct","op":"lt","value":-20},{"metric":"cmp_clicks","op":"gt","value":50}]'::jsonb,
   'delta_clicks', 'asc', 100, true),
  ('a1d16001-0000-4000-8000-000000000004', 'Rising stars',
   'Queries growing more than 50% versus the compare period with real clicks — double down while momentum lasts.',
   'query',
   '[{"metric":"delta_clicks_pct","op":"gt","value":50},{"metric":"clicks","op":"gt","value":10}]'::jsonb,
   'delta_clicks', 'desc', 100, true),
  ('a1d16001-0000-4000-8000-000000000005', 'Pages at position 11–20, high impressions',
   'Pages stranded on page two despite heavy impression volume — the classic low-hanging-fruit page list.',
   'page',
   '[{"metric":"position","op":"gte","value":11},{"metric":"position","op":"lte","value":20},{"metric":"impressions","op":"gt","value":1000}]'::jsonb,
   'impressions', 'desc', 100, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  dimension = EXCLUDED.dimension,
  conditions = EXCLUDED.conditions,
  sort_metric = EXCLUDED.sort_metric,
  sort_dir = EXCLUDED.sort_dir,
  row_limit = EXCLUDED.row_limit,
  is_template = true,
  deleted_at = NULL,
  updated_at = now();

-- ─── Dig evaluation helpers (the server-side metric whitelist) ──────────
-- gsc_dig_metric_value is THE single mapping from metric name → value; the
-- FE's GscDigMetric union mirrors it exactly. NULL for unknown metrics and
-- for compare metrics without a compare period — and a NULL value NEVER
-- passes a condition.

CREATE OR REPLACE FUNCTION seo.gsc_dig_metric_value(
  p_metric text,
  c_clicks bigint, c_imps bigint, c_ctr numeric, c_pos numeric,
  m_clicks bigint, m_imps bigint, m_ctr numeric, m_pos numeric
) RETURNS numeric
LANGUAGE sql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
  SELECT CASE p_metric
    WHEN 'clicks' THEN c_clicks::numeric
    WHEN 'impressions' THEN c_imps::numeric
    WHEN 'ctr' THEN c_ctr
    WHEN 'position' THEN c_pos
    WHEN 'cmp_clicks' THEN m_clicks::numeric
    WHEN 'cmp_impressions' THEN m_imps::numeric
    WHEN 'cmp_ctr' THEN m_ctr
    WHEN 'cmp_position' THEN m_pos
    WHEN 'delta_clicks' THEN (c_clicks - m_clicks)::numeric
    WHEN 'delta_impressions' THEN (c_imps - m_imps)::numeric
    WHEN 'delta_ctr' THEN c_ctr - m_ctr
    WHEN 'delta_position' THEN c_pos - m_pos
    WHEN 'delta_clicks_pct' THEN CASE WHEN m_clicks > 0
      THEN round((c_clicks - m_clicks)::numeric * 100 / m_clicks, 2) END
    WHEN 'delta_impressions_pct' THEN CASE WHEN m_imps > 0
      THEN round((c_imps - m_imps)::numeric * 100 / m_imps, 2) END
  END;
$$;

CREATE OR REPLACE FUNCTION seo.gsc_dig_condition_passes(
  p_op text, p_value numeric, p_threshold numeric
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = seo, pg_temp
AS $$
  SELECT CASE
    WHEN p_value IS NULL OR p_threshold IS NULL THEN false
    WHEN p_op = 'gt' THEN p_value > p_threshold
    WHEN p_op = 'gte' THEN p_value >= p_threshold
    WHEN p_op = 'lt' THEN p_value < p_threshold
    WHEN p_op = 'lte' THEN p_value <= p_threshold
    ELSE false
  END;
$$;

-- ─── seo.gsc_perf_dig ───────────────────────────────────────────────────
-- Breakdown + AND-ed conditions over computed metrics. With p_conditions
-- = '[]' this MUST equal gsc_perf_breakdown for the same slice (the
-- regression check). Stateless: callers send rule CONTENTS, never rule ids.

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
  p_limit int DEFAULT 100
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
  total_count bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
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
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dig_dimension_unsupported: % (dig rules run on query or page)', p_dimension;
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
        ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
      END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
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
  metrics AS (
    SELECT j.k, j.pid, j.kid,
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

-- ─── seo.gsc_perf_watch ─────────────────────────────────────────────────
-- Metrics for an explicit watched set — ANCHORED on the input id arrays so
-- a watched item with no data in the period returns a real zero row (its
-- key resolved from web.page / seo.keyword). Query matching is by
-- keyword_id when the fact row carries it AND by normalized phrase (the
-- watch bridge mints keywords for GSC queries whose fact rows predate the
-- link, so phrase identity is the durable join).

CREATE OR REPLACE FUNCTION seo.gsc_perf_watch(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL,
  p_page_ids uuid[] DEFAULT '{}'::uuid[],
  p_keyword_ids uuid[] DEFAULT '{}'::uuid[]
) RETURNS TABLE (
  kind text,
  entity_id uuid,
  key text,
  clicks bigint,
  impressions bigint,
  ctr numeric,
  avg_position numeric,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_ctr numeric,
  cmp_avg_position numeric
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
BEGIN
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF COALESCE(array_length(p_page_ids, 1), 0) > 200
     OR COALESCE(array_length(p_keyword_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'gsc_watch_too_many: max 200 pages and 200 queries';
  END IF;

  RETURN QUERY
  -- Pages half (profile 'page', grouped by page_id)
  WITH pwinner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  plat AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos, spd.page_id AS pid
    FROM seo.search_performance_daily spd
    JOIN pwinner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.page_id = ANY (p_page_ids)
  ),
  pcur AS (
    SELECT l.pid,
           SUM(l.c)::bigint AS s_clicks, SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM plat l WHERE l.d BETWEEN p_start AND p_end GROUP BY l.pid
  ),
  pcmp AS (
    SELECT l.pid,
           SUM(l.c)::bigint AS s_clicks, SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM plat l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end
    GROUP BY l.pid
  ),
  -- Queries half (profile 'query', matched by keyword_id OR normalized phrase)
  kws AS (
    SELECT u.id, kw.phrase, kw.normalized_phrase
    FROM unnest(p_keyword_ids) AS u(id)
    LEFT JOIN seo.keyword kw ON kw.id = u.id
  ),
  qwinner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  qlat AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos, spd.keyword_id AS kid,
           seo.fn_normalize_phrase(spd.query) AS nk
    FROM seo.search_performance_daily spd
    JOIN qwinner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.query IS NOT NULL
      -- Skip the whole query-profile scan (and per-row normalization)
      -- when nothing is watched on the query side.
      AND COALESCE(array_length(p_keyword_ids, 1), 0) > 0
  ),
  qmatch AS (
    SELECT k.id AS wkid, l.d, l.c, l.i, l.pos
    FROM qlat l
    JOIN kws k ON l.kid = k.id
               OR (k.normalized_phrase IS NOT NULL AND l.nk = k.normalized_phrase)
  ),
  qcur AS (
    SELECT m.wkid,
           SUM(m.c)::bigint AS s_clicks, SUM(m.i)::bigint AS s_imps,
           SUM(m.pos * m.i) FILTER (WHERE m.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(m.i) FILTER (WHERE m.pos IS NOT NULL), 0) AS s_pos_imps
    FROM qmatch m WHERE m.d BETWEEN p_start AND p_end GROUP BY m.wkid
  ),
  qcmp AS (
    SELECT m.wkid,
           SUM(m.c)::bigint AS s_clicks, SUM(m.i)::bigint AS s_imps,
           SUM(m.pos * m.i) FILTER (WHERE m.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(m.i) FILTER (WHERE m.pos IS NOT NULL), 0) AS s_pos_imps
    FROM qmatch m
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND m.d BETWEEN p_compare_start AND p_compare_end
    GROUP BY m.wkid
  )
  SELECT 'page'::text,
         u.id,
         COALESCE(wp.url, u.id::text),
         COALESCE(pc.s_clicks, 0)::bigint,
         COALESCE(pc.s_imps, 0)::bigint,
         CASE WHEN COALESCE(pc.s_imps, 0) > 0 THEN round(pc.s_clicks::numeric / pc.s_imps, 6) END,
         CASE WHEN COALESCE(pc.s_pos_imps, 0) > 0 THEN round(pc.s_wpos / pc.s_pos_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(pm.s_clicks, 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(pm.s_imps, 0)::bigint END,
         CASE WHEN COALESCE(pm.s_imps, 0) > 0 THEN round(pm.s_clicks::numeric / pm.s_imps, 6) END,
         CASE WHEN COALESCE(pm.s_pos_imps, 0) > 0 THEN round(pm.s_wpos / pm.s_pos_imps, 2) END
  FROM unnest(p_page_ids) AS u(id)
  LEFT JOIN pcur pc ON pc.pid = u.id
  LEFT JOIN pcmp pm ON pm.pid = u.id
  LEFT JOIN web.page wp ON wp.id = u.id
  UNION ALL
  SELECT 'query'::text,
         k.id,
         COALESCE(k.phrase, k.id::text),
         COALESCE(qc.s_clicks, 0)::bigint,
         COALESCE(qc.s_imps, 0)::bigint,
         CASE WHEN COALESCE(qc.s_imps, 0) > 0 THEN round(qc.s_clicks::numeric / qc.s_imps, 6) END,
         CASE WHEN COALESCE(qc.s_pos_imps, 0) > 0 THEN round(qc.s_wpos / qc.s_pos_imps, 2) END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(qm.s_clicks, 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(qm.s_imps, 0)::bigint END,
         CASE WHEN COALESCE(qm.s_imps, 0) > 0 THEN round(qm.s_clicks::numeric / qm.s_imps, 6) END,
         CASE WHEN COALESCE(qm.s_pos_imps, 0) > 0 THEN round(qm.s_wpos / qm.s_pos_imps, 2) END
  FROM kws k
  LEFT JOIN qcur qc ON qc.wkid = k.id
  LEFT JOIN qcmp qm ON qm.wkid = k.id
  ORDER BY 1, 4 DESC, 3 ASC;
END;
$$;

-- ─── seo.gsc_perf_page_first_dates ──────────────────────────────────────
-- All-history winning-run first/last impression date + lifetime totals per
-- page — the New Pages tracker milestone read. Anchored on the input ids:
-- a page still awaiting its first impression returns a NULL-date row.

CREATE OR REPLACE FUNCTION seo.gsc_perf_page_first_dates(
  p_site_id uuid,
  p_page_ids uuid[]
) RETURNS TABLE (
  page_id uuid,
  url text,
  first_impression_date date,
  last_impression_date date,
  lifetime_clicks bigint,
  lifetime_impressions bigint
)
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $$
BEGIN
  IF COALESCE(array_length(p_page_ids, 1), 0) > 200 THEN
    RAISE EXCEPTION 'gsc_watch_too_many: max 200 pages';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  agg AS (
    SELECT spd.page_id AS pid,
           MIN(spd.date) FILTER (WHERE spd.impressions > 0) AS first_d,
           MAX(spd.date) FILTER (WHERE spd.impressions > 0) AS last_d,
           SUM(spd.clicks)::bigint AS s_clicks,
           SUM(spd.impressions)::bigint AS s_imps
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'page'
      AND spd.page_id = ANY (p_page_ids)
    GROUP BY spd.page_id
  )
  SELECT u.id,
         COALESCE(wp.url, u.id::text),
         a.first_d,
         a.last_d,
         COALESCE(a.s_clicks, 0)::bigint,
         COALESCE(a.s_imps, 0)::bigint
  FROM unnest(p_page_ids) AS u(id)
  LEFT JOIN agg a ON a.pid = u.id
  LEFT JOIN web.page wp ON wp.id = u.id
  ORDER BY a.first_d DESC NULLS FIRST, 2 ASC;
END;
$$;

-- ─── web.page launch tracking ───────────────────────────────────────────

ALTER TABLE web.page ADD COLUMN IF NOT EXISTS launch_tracking jsonb;

COMMENT ON COLUMN web.page.launch_tracking IS
  'New-page launch tracker state: {added_at, added_by, indexing_requested_at|null, notes|null}. NULL = not tracked. Team-visible; written by the Search Console dashboard under page RLS.';

CREATE INDEX IF NOT EXISTS idx_web_page_launch_tracking
  ON web.page (site_id)
  WHERE launch_tracking IS NOT NULL AND deleted_at IS NULL;

-- ─── Grants ─────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION seo.gsc_dig_metric_value(text, bigint, bigint, numeric, numeric, bigint, bigint, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_dig_condition_passes(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_watch(uuid, date, date, date, date, uuid[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_page_first_dates(uuid, uuid[]) TO authenticated;

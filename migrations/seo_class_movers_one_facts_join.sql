-- ============================================================================
-- gsc_perf_class_movers: 10 s -> 0.8 s on the class-pinned page dimension.
-- Measured live 2026-08-23/24 on Data Destruction (38eff4c9…), window
-- 2026-07-25..2026-08-21 vs 2026-06-27..2026-07-24.
--
-- THE DEFECT was never the corpus and never the class pin's selectivity — the
-- SCOPE RULE fix (seo_class_map_scope_fix.sql) had already cut the class map
-- to the window. `EXPLAIN (ANALYZE, BUFFERS)` on the full body named it:
--
--   Nested Loop Left Join  Join Filter: (vm.keyword_id = spd.keyword_id)
--     Rows Removed by Join Filter: 81,094,419
--     ->  CTE Scan on resolved vm  (rows=5860, loops=13841)
--
-- `classed` joined TWO map CTEs in sequence. The FIRST join (classes) carried
-- the class pin, so the planner's estimate for its output collapsed from
-- ~5,000 rows to 25 — and against a 25-row outer, rescanning a CTE (which it
-- guesses holds 1,000 rows, because a function scan has no statistics) looks
-- cheaper than building a hash. It is not: a CTE scan can never be an index
-- lookup, so the "cheap" nested loop was 13,841 x 5,860 = 81 M comparisons.
-- That is why PINNING made it SLOWER (page 0.8 s -> 10 s, query 0.6 s -> 2.5 s)
-- while the unpinned paths were fine: only a pin collapses the estimate.
--
-- THE RULE this encodes: a keyword's facts are resolved ONCE and joined ONCE.
-- The class map and the value map are FULL JOINed to each other first (which
-- is exactly the two independent LEFT JOINs it replaces, whatever each map
-- does or does not return), and `classed` makes a single hash join against the
-- result. There is no second join left for a collapsed estimate to poison, and
-- Postgres has no nested-loop implementation of a FULL JOIN, so the inner join
-- cannot fall into the same trap either.
--
-- Two structurally-different things were tried and REVERTED before this, both
-- recorded in seo_class_map_scope_fix.sql: pre-filtering the fact scan with
-- `= ANY(class_ids)` (17.7 s) and pushing the class pin inside the `classes`
-- CTE with an INNER JOIN (page/all went 0.9 s -> 45 s+). Neither touched the
-- real cause. Do not retry them.
--
-- Results are identical to the pre-change function, row for row, on all four
-- measured paths — see the verification block at the bottom of this file.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.gsc_perf_class_movers(p_site_id uuid, p_dimension text, p_start date, p_end date, p_compare_start date, p_compare_end date, p_class text DEFAULT NULL::text, p_direction text DEFAULT 'loss'::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0, p_filters jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(key text, page_id uuid, keyword_id uuid, traffic_class text, value_band text, clicks bigint, impressions bigint, cmp_clicks bigint, cmp_impressions bigint, delta_clicks bigint, delta_impressions bigint, class_mix jsonb, total_count bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
 -- THE SECOND HAZARD, measured the same day: this body's right plan DEPENDS on
 -- the parameter values (which dimension, whether a class is pinned, whether a
 -- level filter is set), so the generic plan plpgsql switches to on the 6th
 -- execution of a pooled connection is wrong by construction. Measured on the
 -- fixed function: calls 1-5 ran 445-870 ms, then the query dimension with no
 -- class pin jumped to 11.1 s on calls 8 and 10 and stayed there. Planning this
 -- body costs ~3 ms against 600 ms of execution -- always re-plan.
 SET plan_cache_mode TO 'force_custom_plan'
 -- THE THIRD COST, on the fleet's largest site: All Green Recycling's 56-day
 -- query_page window is 478,035 rows, and `bucketed`'s group-by spilled to an
 -- external merge (123 MB of temp) at the 16 MB default. Doubling work_mem for
 -- this ONE read lets it hash instead: page/money 7,408 ms -> 3,513 ms and
 -- page/all 5,773 ms -> 4,969 ms, measured. 64 MB bought nothing more
 -- (3,595 / 4,984 ms), so 32 MB is the whole win at the smallest cost.
 SET work_mem TO '32MB'
AS $function$
DECLARE
  v_profile text;
  v_levels text[];
  v_ids uuid[];
  v_lo date := LEAST(p_compare_start, p_start);
  v_hi date := GREATEST(p_compare_end, p_end);
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
  END IF;
  IF p_direction NOT IN ('gain', 'loss') THEN
    RAISE EXCEPTION 'gsc_direction_unknown: %', p_direction;
  END IF;
  IF p_class IS NOT NULL AND p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  IF jsonb_typeof(COALESCE(p_filters, '{}'::jsonb) -> 'levels') = 'array' THEN
    SELECT array_agg(t.value) INTO v_levels
    FROM jsonb_array_elements_text(p_filters -> 'levels') AS t(value)
    WHERE t.value IS NOT NULL AND btrim(t.value) <> '';
  END IF;

  v_profile := CASE p_dimension WHEN 'query' THEN 'query' ELSE 'query_page' END;

  -- THE SCOPE RULE: both maps resolve this window, never the 197k corpus.
  SELECT array_agg(DISTINCT spd.keyword_id) INTO v_ids
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
    AND spd.dimension_profile = v_profile AND spd.keyword_id IS NOT NULL
    AND spd.date BETWEEN v_lo AND v_hi;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN v_lo AND v_hi
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.page_id AS pid,
           CASE p_dimension
             WHEN 'query' THEN spd.query
             ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
           END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
  ),
  -- ONE facts row per keyword, resolved once, joined once. The FULL JOIN is
  -- the two independent LEFT JOINs this replaces: a keyword either map knows
  -- about survives, with NULLs for whatever the other did not return.
  kw_facts AS MATERIALIZED (
    SELECT COALESCE(cm.keyword_id, vm.keyword_id) AS keyword_id,
           cm.traffic_class,
           vm.value_band
    FROM seo.gsc_keyword_class_map(p_site_id, v_ids) cm
    FULL JOIN seo.keyword_value_map(p_site_id, v_ids) vm
      ON vm.keyword_id = cm.keyword_id
  ),
  classed AS (
    SELECT l.*,
           COALESCE(f.traffic_class, 'unclassified') AS cls,
           COALESCE(f.value_band, 'unvalued') AS bnd
    FROM latest l
    LEFT JOIN kw_facts f ON f.keyword_id = l.kid
    WHERE l.k IS NOT NULL
      AND (p_class IS NULL OR COALESCE(f.traffic_class, 'unclassified') = p_class)
      AND (v_levels IS NULL OR COALESCE(f.value_band, 'unvalued') = ANY (v_levels))
  ),
  bucketed AS (
    SELECT c.k, c.cls, c.bnd,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           (array_agg(c.kid ORDER BY c.kid) FILTER (WHERE c.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i
    FROM classed c
    GROUP BY c.k, c.cls, c.bnd
  ),
  by_class AS (
    SELECT b.k, b.cls, SUM(b.cur_c)::bigint AS cur_c, SUM(b.cmp_c)::bigint AS cmp_c
    FROM bucketed b GROUP BY b.k, b.cls
  ),
  dom_band AS (
    SELECT DISTINCT ON (b.k) b.k, b.bnd
    FROM (SELECT b2.k, b2.bnd, SUM(b2.cur_c) AS cur_c, SUM(b2.cmp_c) AS cmp_c FROM bucketed b2 GROUP BY b2.k, b2.bnd) b
    ORDER BY b.k, b.cur_c DESC, b.cmp_c DESC, b.bnd ASC
  ),
  rolled AS (
    SELECT b.k,
           (array_agg(b.pid ORDER BY b.pid) FILTER (WHERE b.pid IS NOT NULL))[1] AS pid,
           (array_agg(b.kid ORDER BY b.kid) FILTER (WHERE b.kid IS NOT NULL))[1] AS kid,
           (array_agg(b.cls ORDER BY b.cur_c DESC, b.cmp_c DESC, b.cls ASC))[1] AS dom_cls,
           SUM(b.cur_c)::bigint AS cur_c, SUM(b.cur_i)::bigint AS cur_i,
           SUM(b.cmp_c)::bigint AS cmp_c, SUM(b.cmp_i)::bigint AS cmp_i
    FROM bucketed b GROUP BY b.k
  ),
  mixed AS (
    SELECT bc.k, jsonb_object_agg(bc.cls, jsonb_build_object('clicks', bc.cur_c, 'cmp_clicks', bc.cmp_c))
             FILTER (WHERE bc.cur_c > 0 OR bc.cmp_c > 0) AS mix
    FROM by_class bc GROUP BY bc.k
  ),
  moved AS (
    SELECT r.*, db.bnd AS dom_bnd, m.mix, (r.cur_c - r.cmp_c) AS d_c, (r.cur_i - r.cmp_i) AS d_i
    FROM rolled r
    LEFT JOIN dom_band db ON db.k = r.k
    LEFT JOIN mixed m ON m.k = r.k
    WHERE r.cur_c > 0 OR r.cmp_c > 0 OR r.cur_i > 0 OR r.cmp_i > 0
  )
  SELECT m.k, m.pid, m.kid, m.dom_cls, COALESCE(m.dom_bnd, 'unvalued'),
         m.cur_c, m.cur_i, m.cmp_c, m.cmp_i, m.d_c::bigint, m.d_i::bigint,
         COALESCE(m.mix, '{}'::jsonb), COUNT(*) OVER ()::bigint
  FROM moved m
  WHERE CASE WHEN p_direction = 'gain'
             THEN m.d_c > 0 OR (m.d_c = 0 AND m.d_i > 0)
             ELSE m.d_c < 0 OR (m.d_c = 0 AND m.d_i < 0) END
  ORDER BY
    (CASE WHEN p_direction = 'gain' THEN m.d_c END) DESC NULLS LAST,
    (CASE WHEN p_direction = 'loss' THEN m.d_c END) ASC NULLS LAST,
    ABS(m.d_i) DESC, m.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ----------------------------------------------------------------------------
-- VERIFIED LIVE 2026-08-24, site 38eff4c9-b021-451a-b995-7d9b3d17db5e,
-- window 2026-07-25..2026-08-21 vs 2026-06-27..2026-07-24, limit 200.
-- Every case returns byte-identical rows to the pre-change function (md5 of the
-- ordered, fully-concatenated result set).
--
--   case                                  before        after
--   page/money/loss                       10,008 ms  ->    648 ms
--   page/money/gain                        9,873 ms  ->    602 ms
--   page/all/loss                            864 ms  ->    786 ms
--   page/all/gain                            809 ms  ->    782 ms
--   query/money/loss                       2,521 ms  ->    439 ms
--   query/money/gain                       2,500 ms  ->    450 ms
--   query/all/loss                           658 ms  ->    601 ms
--   query/educational/loss                 1,347 ms  ->    440 ms
--   page/unclassified/loss                45,629 ms  ->    780 ms
--   page/all/loss levels=[unvalued]       43,149 ms  ->    829 ms
--   page/money/loss limit 50 offset 50     9,814 ms  ->    617 ms
--   query/brand/loss                         508 ms  ->    438 ms
--
-- Note page/unclassified (45.6 s) and the levels filter (43.1 s): the class pin
-- was never the special case. ANY filter that collapses the planner's estimate
-- for `classed` triggered the same nested loop. That is why the fix is the join
-- SHAPE and not a pin-specific special case.
--
-- The generic-plan hazard, measured on the fixed body BEFORE the
-- plan_cache_mode SET: 12 consecutive calls on one connection ran
-- 834/613/608/605/782/448/872/**11118**/619/**11079**/870/445 ms -- the cliff
-- lands exactly where plpgsql stops re-planning. With the SET, 16 consecutive
-- calls ran 440-838 ms with no cliff. PostgREST connections are pooled and
-- long-lived, so this was a production hazard, not a lab artifact.
--
-- ALL GREEN RECYCLING (d0aff5b6..., 1,199,815 query_page rows in the same
-- window -- 5x Data Destruction). The old two-join shape did not complete
-- within 120 s there at all; the new one, with work_mem at 32 MB:
--   page/money   3,513 ms      page/all   4,969 ms      query/all  2,987 ms
-- Still the slowest site in the fleet and still worth more work -- the `winner`
-- CTE alone costs 978 ms because it reads all 1.2 M window rows through an
-- incremental sort to pick 56 run ids. A covering index
-- (site_id, dimension_profile, date, created_at DESC, run_id DESC)
-- WHERE provider='gsc' plus a per-date LATERAL would make that ~5 ms, at the
-- cost of roughly 1 GB on a 10 GB table. Not taken here: it is a separate
-- decision from this defect, and every path is now inside the 8 s timeout.
-- ----------------------------------------------------------------------------

-- ============================================================================
-- THE WINDOW PREDICATE — a filter must never cost you the index condition.
-- Swept 2026-08-24 after the gsc_perf_class_movers fix
-- (seo_class_movers_one_facts_join.sql) asked "where else?".
--
-- THE DEFECT. Every `seo.gsc_perf_*` reader shapes its fact scan the same way:
--
--     latest AS (
--       SELECT ... FROM seo.search_performance_daily spd
--       JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
--       WHERE spd.provider='gsc' AND spd.site_id=p_site_id
--         AND spd.dimension_profile=v_profile
--         AND (f_lv IS NULL OR spd.keyword_id IN (SELECT ... keyword_value_map ...))
--
-- The date range is nowhere in that WHERE — it is implied by the join to
-- `winner`, which only holds dates inside the window. That works right up
-- until a filter appears. The level filter is an OR'd IN-subquery, so the
-- planner cannot pull it up into a semi-join; it attaches it to the scan as a
-- hashed SubPlan, and once the scan carries a filter the planner stops
-- pushing the join's date restriction into the index condition. Measured on
-- All Green Recycling:
--
--     Index Scan using idx_seo_sperf_gsc_read on search_performance_daily spd
--       Index Cond: ((site_id = ...) AND (dimension_profile = 'query_page'))
--       Filter: (ANY (keyword_id = (hashed SubPlan 2).col1))
--       rows=4,847,721                    <-- the site's ENTIRE history
--
-- 4,847,721 rows scanned instead of the window's 1,199,815. Adding a level
-- filter therefore made these reads 4x-400x SLOWER than no filter at all:
--
--     gsc_perf_summary      3 ms ->  2,932 ms
--     gsc_perf_timeseries   2 ms ->  2,801 ms
--     gsc_perf_breakdown  1,014 ms -> 19,488 ms   (past the 8 s timeout: a 500)
--
-- THE FIX is one line per function, and it is provably a no-op: the join
-- `w.d = spd.date` already forces spd.date to be one of winner's dates, so
-- restating that as a range removes no row that the join would have kept.
-- It exists purely so the range survives into the Index Cond when a filter
-- lands on the scan. It is written against `winner` rather than each
-- function's own bounds expression so it is the SAME text everywhere and
-- cannot drift from what the join actually enforces.
--
-- MEASURED ALTERNATIVE, REJECTED: also hoisting the value map out of the OR'd
-- subquery into a MATERIALIZED CTE (so it is resolved once instead of being a
-- SubPlan). On the All Green page window that was 2,526-2,670 ms against
-- 2,619 ms for the one-line change alone -- no measurable gain for a much
-- larger diff. The index condition was the whole story. Do not add the CTE
-- without a measurement that says otherwise.
--
-- gsc_breakdown_keyword_ids already carries `spd.date BETWEEN p_start AND
-- p_end` and is deliberately untouched. gsc_perf_dig and gsc_perf_juice need
-- this AND a scope fix on their class-map call; they are handled separately.
--
-- Applied as a transformation rather than six pasted bodies on purpose: the
-- change is one identical line, and every function asserts before and after,
-- so a drifted body fails loudly instead of being silently rewritten.
-- ============================================================================

DO $do$
DECLARE
  v_fn text;
  v_oid oid;
  v_def text;
  v_new text;
  v_anchor CONSTANT text :=
    E'JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id\n'
    '    WHERE spd.provider = ''gsc''\n'
    '      AND spd.site_id = p_site_id\n'
    '      AND spd.dimension_profile = v_profile\n';
  v_added CONSTANT text :=
    E'      AND spd.date BETWEEN (SELECT min(w2.d) FROM winner w2)\n'
    '                       AND (SELECT max(w2.d) FROM winner w2)\n';
  v_hits int;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'seo.gsc_perf_summary',
    'seo.gsc_perf_timeseries',
    'seo.gsc_perf_breakdown',
    'seo.gsc_perf_class_movers'
  ] LOOP
    SELECT p.oid INTO STRICT v_oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = split_part(v_fn, '.', 1) AND p.proname = split_part(v_fn, '.', 2);

    v_def := pg_get_functiondef(v_oid);

    -- Idempotent: already carries the predicate, nothing to do.
    CONTINUE WHEN position('SELECT min(w2.d) FROM winner w2' in v_def) > 0;

    -- Plain-substring count (the replace below is also plain, not a regex --
    -- escaping this anchor as a pattern is a bug waiting to happen).
    v_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION 'window_predicate_sweep: % has % anchor matches, expected exactly 1 (body drifted -- fix by hand)', v_fn, v_hits;
    END IF;

    v_new := replace(v_def, v_anchor, v_anchor || v_added);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'window_predicate_sweep: % replacement was a no-op', v_fn;
    END IF;

    EXECUTE v_new;

    IF position('SELECT min(w2.d) FROM winner w2' in pg_get_functiondef(v_oid)) = 0 THEN
      RAISE EXCEPTION 'window_predicate_sweep: % did not take the predicate', v_fn;
    END IF;
    RAISE NOTICE 'window_predicate_sweep: % updated', v_fn;
  END LOOP;
END
$do$;

-- ============================================================================
-- C5b (2026-08-23) — A CAPPED SEGMENT MUST SAY SO.
--
-- Found in the C5 live smoke on DDI: a dig rule carries its own `row_limit`
-- (default 100, max 1000), and `fn_evaluate_condition_matchers` reuses the
-- rule verbatim — so a rule matching 5,180 parked keywords stamped exactly
-- 1,000 of them and reported "stamped: 1000" as if that were the whole set.
-- Silent truncation reads as "covered everything" when it did not.
--
-- The row limit STAYS the rule's (what the results table shows is exactly
-- what gets stamped — that identity is worth more than a bigger number).
-- What changes: the evaluator now reports the TOTAL the rule matched beside
-- the count it stamped, and flags `limited` when the two differ, so the UI
-- can say "1,000 of 5,180 — your rule's row limit" instead of nothing.
-- `gsc_perf_dig` already computes the total (COUNT(*) OVER () runs before
-- the LIMIT), so nothing is recomputed and nothing is re-implemented.
-- ============================================================================

BEGIN;

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
  v_span int;
  v_m record;
  v_rule seo.gsc_dig_rule%ROWTYPE;
  v_found int;
  v_total bigint;
  v_stamped int;
  v_removed int;
  v_total_stamped int := 0;
  v_total_removed int := 0;
  v_any_limited boolean := false;
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

  CREATE TEMP TABLE IF NOT EXISTS _cond_hit (kw_id uuid PRIMARY KEY, total bigint) ON COMMIT DROP;

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

    TRUNCATE _cond_hit;
    INSERT INTO _cond_hit
    SELECT DISTINCT ON (d.keyword_id) d.keyword_id, d.total_count
    FROM seo.gsc_perf_dig(
           p_site_id, v_rule.dimension, v_start, v_end, v_cmp_start, v_cmp_end,
           v_rule.conditions, v_rule.base_filters, v_rule.sort_metric,
           v_rule.sort_dir, v_rule.row_limit, v_rule.traffic_class, v_rule.level) d
    WHERE d.keyword_id IS NOT NULL;
    GET DIAGNOSTICS v_found = ROW_COUNT;
    -- `total_count` is COUNT(*) OVER () — the rows that PASSED, before the
    -- rule's own LIMIT. When it exceeds what came back, the segment is a
    -- truncation and the caller has to be told.
    SELECT max(c.total) INTO v_total FROM _cond_hit c;

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
    v_any_limited := v_any_limited OR COALESCE(v_total, 0) > v_found;
    v_results := v_results || jsonb_build_object(
      'matcher_id', v_m.id, 'rule', v_rule.name,
      'dimension', v_m.dim_label, 'value', v_m.value_label,
      'matched', v_found, 'matched_total', COALESCE(v_total, v_found),
      'row_limit', v_rule.row_limit,
      'limited', COALESCE(v_total, 0) > v_found,
      'stamped', v_stamped, 'removed', v_removed);
  END LOOP;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end,
                                 'compare_start', v_cmp_start, 'compare_end', v_cmp_end),
    'matchers', jsonb_array_length(v_results),
    'stamped', v_total_stamped, 'removed', v_total_removed,
    'limited', v_any_limited,
    'evaluated_at', now(), 'results', v_results);
END;
$function$;

COMMIT;

-- ============================================================================
-- C5e (2026-08-23) — RE-EVALUATION WRITES ONLY WHAT CHANGED, AND A BIG FIRST
-- FILL FINISHES INSTEAD OF TIMING OUT.
--
-- C5d made a segment cover every keyword that matches. Measured immediately
-- after, on the live DB:
--   * an unlimited dig costs the same as a limited one (0.97s vs 0.88s on
--     DDI) — the scan is per-WINDOW, not per-row, so removing the row limit
--     was free;
--   * the STAMP WRITES are the cost: 4,471 rows ≈ 1.43s, ~0.32 ms/row;
--   * `authenticated` (the PostgREST path a person's Re-evaluate press takes)
--     carries `statement_timeout = 8s`;
--   * the largest 28-day window in the fleet is All Green Recycling at 27,234
--     keywords ⇒ a worst-case first fill ≈ 8.7s of writing alone. Over budget.
--
-- Two fixes, each correct on its own merits:
--
-- 1. DELTA WRITES. C5 re-wrote every row on every evaluation purely to bump
--    `as_of`. Now `as_of` is set when a keyword ENTERS the segment and left
--    alone thereafter — which is also the more useful fact ("parked since"),
--    and makes a steady-state re-evaluation write nothing at all. The
--    SEGMENT's freshness was never a property of an individual stamp: it is
--    `dimension_value_matcher.last_evaluated_at`, one row, and that is what
--    every "as of" now reads.
--
-- 2. A RESUMABLE WRITE BUDGET (`seo.situational_stamps.writes_per_pass`, a
--    knob, not a constant). One pass stamps at most that many NEW keywords.
--    If more remain it returns `remaining > 0` and — critically — SKIPS the
--    release pass, because releasing against a half-filled set would empty
--    the segment it is still filling. The caller presses again (the UI loops
--    automatically); the nightly pass finishes anything left.
--
-- What did NOT change: the segment still means every keyword that matches.
-- A budget is how much work one round-trip does, never what a segment holds.
-- ============================================================================

BEGIN;

-- ── the knobs (limits are knobs, and agents set them) ───────────────────────
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
VALUES
  ('seo.situational_stamps', 'writes_per_pass',
   to_jsonb(8000), to_jsonb(8000), 'integer', 'keywords', 500, 100000,
   'Keywords stamped per evaluation pass',
   'How many NEW keywords one press of Re-evaluate (or one scheduled pass) may stamp into a situational segment. It is a round-trip budget, never a cap on what the segment holds: when more remain the pass reports them and the next pass continues, and the release step waits until the fill is complete so a half-filled segment is never emptied.',
   'agent',
   'Measured live 2026-08-23: stamp writes cost ~0.32 ms/row (4,471 rows in 1.43s on Data Destruction, Inc.), and the unlimited dig that feeds them costs ~1s regardless of result size. The `authenticated` role — the PostgREST path a person''s Re-evaluate press takes — carries statement_timeout = 8s. 8,000 writes ≈ 2.6s, leaving roughly 5s of head-room for the dig and the release pass on the slowest site. The largest 28-day window in the entire fleet is All Green Recycling at 27,234 keywords, so even a pathological no-conditions segment completes in four passes; every real segment measured so far (DDI parked = 1,563) completes in one.',
   '2026-10-22'),
  ('seo.situational_stamps', 'window_days',
   to_jsonb(28), to_jsonb(28), 'integer', 'days', 1, 480,
   'Evaluation window',
   'How many days back a situational segment looks when it is re-derived. A situational stamp is a claim about now, so this is the definition of "now" for every Dig Here rule that fills a segment.',
   'agent',
   'Matches the Search Console default range (GSC_DEFAULT_RANGE = 28 days) so a segment means the same window the person was looking at when they created it — the identity between what the Dig Here table shows and what the segment holds is the whole point. Google''s own dashboards default to 28 days for the same reason: shorter windows swing on weekday seasonality, longer ones stop describing the present.',
   '2026-10-22')
ON CONFLICT (feature, key) DO NOTHING;

-- ── the evaluator ──────────────────────────────────────────────────────────
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
  v_window_days int;
  v_budget int;
  v_left int;
  v_m record;
  v_rule seo.gsc_dig_rule%ROWTYPE;
  v_found int;
  v_fresh int;
  v_stamped int;
  v_removed int;
  v_remaining int;
  v_complete boolean;
  v_total_stamped int := 0;
  v_total_removed int := 0;
  v_total_remaining int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  SELECT COALESCE((value #>> '{}')::int, 28) INTO v_window_days
    FROM platform.feature_knob WHERE feature = 'seo.situational_stamps' AND key = 'window_days';
  SELECT COALESCE((value #>> '{}')::int, 8000) INTO v_budget
    FROM platform.feature_knob WHERE feature = 'seo.situational_stamps' AND key = 'writes_per_pass';
  v_window_days := COALESCE(v_window_days, 28);
  v_budget := COALESCE(v_budget, 8000);
  v_left := v_budget;

  IF v_end IS NULL THEN
    SELECT max(spd.date) INTO v_end
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query';
  END IF;
  IF v_end IS NULL THEN
    RAISE EXCEPTION 'gsc_no_performance_data: this site has no Search Console days yet, so there is no "now" to evaluate against';
  END IF;
  IF v_start IS NULL THEN v_start := v_end - (v_window_days - 1); END IF;
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
    -- `0` = every keyword the rule matches (C5d). The rule's own row_limit
    -- governs the TABLE it is displayed in, never what the segment means.
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

    -- A person's ruling on a single-choice dimension outranks the rule.
    DELETE FROM _cond_hit c
    WHERE v_m.single_card AND EXISTS (
      SELECT 1 FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id
      WHERE kf.keyword_id = c.kw_id AND cv.parent_id = v_m.dim_id
        AND kf.deleted_at IS NULL AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
        AND (kf.pinned OR kf.source = 'human'));

    -- Only the keywords NOT already carrying this stamp are work.
    SELECT count(*) INTO v_fresh FROM _cond_hit c
    WHERE NOT EXISTS (
      SELECT 1 FROM seo.keyword_facet kf
      WHERE kf.keyword_id = c.kw_id AND kf.category_id = v_m.value_id
        AND kf.site_id = p_site_id AND kf.deleted_at IS NULL);

    v_remaining := GREATEST(v_fresh - GREATEST(v_left, 0), 0);
    v_complete := v_remaining = 0;

    WITH pick AS (
      SELECT c.kw_id FROM _cond_hit c
      WHERE NOT EXISTS (
        SELECT 1 FROM seo.keyword_facet kf
        WHERE kf.keyword_id = c.kw_id AND kf.category_id = v_m.value_id
          AND kf.site_id = p_site_id AND kf.deleted_at IS NULL)
      ORDER BY c.kw_id
      LIMIT GREATEST(v_left, 0)
    ),
    up AS (
      INSERT INTO seo.keyword_facet
        (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
      SELECT p.kw_id, v_m.value_id, p_site_id, 'matcher', 100, v_m.id, now(), v_org, 'internal'
      FROM pick p
      ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid))
        WHERE deleted_at IS NULL
      -- `as_of` is when the keyword ENTERED this segment; a re-evaluation that
      -- finds it still matching leaves it alone (that is the delta write).
      -- Adoption from another matcher is the only reason to touch the row.
      DO UPDATE SET matcher_id = EXCLUDED.matcher_id, updated_at = now()
        WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
          AND seo.keyword_facet.matcher_id IS DISTINCT FROM EXCLUDED.matcher_id
      RETURNING 1
    ) SELECT count(*) INTO v_stamped FROM up;
    v_left := v_left - v_stamped;

    -- 🚨 Release ONLY when the fill is complete. Against a half-filled set
    -- this would delete the very stamps the next pass is on its way to make.
    v_removed := 0;
    IF v_complete THEN
      WITH gone AS (
        UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
         WHERE kf.matcher_id = v_m.id AND kf.source = 'matcher'
           AND NOT kf.pinned AND kf.deleted_at IS NULL
           AND NOT EXISTS (SELECT 1 FROM _cond_hit c WHERE c.kw_id = kf.keyword_id)
        RETURNING 1
      ) SELECT count(*) INTO v_removed FROM gone;
    END IF;

    -- THE SEGMENT's freshness lives here, on ONE row — never on each stamp.
    UPDATE seo.dimension_value_matcher dm
       SET last_evaluated_at = now(),
           match_count = (SELECT count(*) FROM seo.keyword_facet kf
                           WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL),
           metadata = dm.metadata || jsonb_build_object('fill_remaining', v_remaining)
     WHERE dm.id = v_m.id;

    v_total_stamped := v_total_stamped + v_stamped;
    v_total_removed := v_total_removed + v_removed;
    v_total_remaining := v_total_remaining + v_remaining;
    v_results := v_results || jsonb_build_object(
      'matcher_id', v_m.id, 'rule', v_rule.name,
      'dimension', v_m.dim_label, 'value', v_m.value_label,
      'matched', v_found, 'stamped', v_stamped, 'removed', v_removed,
      'remaining', v_remaining, 'complete', v_complete,
      'table_row_limit', v_rule.row_limit, 'used_compare', v_use_cmp);
  END LOOP;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end,
                                 'compare_start', v_cmp_start, 'compare_end', v_cmp_end),
    'matchers', jsonb_array_length(v_results),
    'stamped', v_total_stamped, 'removed', v_total_removed,
    -- > 0 ⇒ press again (the UI loops); the segment is still filling.
    'remaining', v_total_remaining,
    'writes_per_pass', v_budget,
    'evaluated_at', now(), 'results', v_results);
END;
$function$;

-- ── "as of" = when the SEGMENT was last worked out, not when one keyword was ─
-- Gains `fill_remaining`, so the return type changes: drop, then create.
DROP FUNCTION IF EXISTS seo.gsc_dig_rule_stamps(uuid, uuid);

CREATE OR REPLACE FUNCTION seo.gsc_dig_rule_stamps(p_site_id uuid, p_rule_id uuid DEFAULT NULL)
RETURNS TABLE(matcher_id uuid, rule_id uuid, rule_name text, dimension_id uuid,
              dimension text, dimension_label text, value_id uuid, value text,
              value_label text, enabled boolean, last_evaluated_at timestamptz,
              match_count integer, stamp_count bigint, as_of timestamptz,
              fill_remaining integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT dm.id, dm.condition_rule_id, r.name, cd.id, cd.slug, cd.name,
         cv.id, COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)), cv.name,
         dm.enabled, dm.last_evaluated_at, dm.match_count,
         (SELECT count(*) FROM seo.keyword_facet kf
           WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL),
         -- The segment was worked out at `last_evaluated_at`. The newest stamp
         -- only says when the most recent keyword joined it.
         dm.last_evaluated_at,
         COALESCE((dm.metadata->>'fill_remaining')::int, 0)
  FROM seo.dimension_value_matcher dm
  JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  LEFT JOIN seo.gsc_dig_rule r ON r.id = dm.condition_rule_id
  WHERE dm.site_id = p_site_id AND dm.kind = 'condition' AND dm.deleted_at IS NULL
    AND (p_rule_id IS NULL OR dm.condition_rule_id = p_rule_id)
  ORDER BY cd.name, cv.name;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_dig_rule_stamps(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.gsc_dig_rule_stamps(uuid, uuid) TO authenticated;

-- The dimensions screen reads the same freshness: a value filled by rules is
-- as fresh as its rules' last run, and only falls back to its newest stamp
-- when nothing derives it.
CREATE OR REPLACE FUNCTION seo.facet_dimension_catalog(p_site_id uuid DEFAULT NULL)
RETURNS TABLE(dimension_id uuid, slug text, label text, description text, scope text,
              cardinality text, nature text, site_id uuid, is_system boolean,
              value_count bigint, keyword_count bigint, rule_count bigint,
              condition_matcher_count bigint, situational_as_of timestamptz,
              facet_values jsonb, is_ready boolean, can_abstain boolean, readiness_note text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_site_id IS NOT NULL THEN
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  RETURN QUERY
  WITH dims AS (
    SELECT c.id, c.slug, c.name, c.metadata, c.is_system
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
      AND (
        COALESCE(c.metadata->>'scope','platform') = 'platform'
        OR (p_site_id IS NOT NULL AND (c.metadata->>'site_id')::uuid = p_site_id)
      )
  ),
  vals AS (
    SELECT cv.parent_id AS dim_id, cv.id AS value_id, cv.slug AS value_slug,
           COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key,
           cv.name AS value_label, cv.metadata->>'description' AS value_description,
           COALESCE((cv.metadata->>'abstain')::boolean, false) AS is_abstain,
           cv.position,
           (SELECT count(*) FROM seo.keyword_facet kf
             WHERE kf.category_id = cv.id AND kf.deleted_at IS NULL) AS kw_count,
           COALESCE(
             (SELECT max(dm.last_evaluated_at) FROM seo.dimension_value_matcher dm
               WHERE dm.value_id = cv.id AND dm.kind = 'condition'
                 AND dm.deleted_at IS NULL AND dm.enabled
                 AND (p_site_id IS NULL OR dm.site_id = p_site_id)),
             (SELECT max(kf.as_of) FROM seo.keyword_facet kf
               WHERE kf.category_id = cv.id AND kf.deleted_at IS NULL
                 AND (p_site_id IS NULL OR kf.site_id = p_site_id))
           ) AS value_as_of,
           (SELECT count(*) FROM seo.dimension_value_matcher dm
             WHERE dm.value_id = cv.id AND dm.kind = 'condition'
               AND dm.deleted_at IS NULL AND dm.enabled
               AND (p_site_id IS NULL OR dm.site_id = p_site_id)) AS cond_count
    FROM platform.categories cv
    JOIN dims d ON d.id = cv.parent_id
    WHERE cv.deleted_at IS NULL
  )
  SELECT d.id, d.slug, d.name, d.metadata->>'description',
         COALESCE(d.metadata->>'scope','platform'),
         COALESCE(d.metadata->>'cardinality','single'),
         COALESCE(d.metadata->>'nature','intrinsic'),
         (d.metadata->>'site_id')::uuid,
         d.is_system,
         COALESCE(count(v.value_id), 0)::bigint,
         COALESCE(sum(v.kw_count), 0)::bigint,
         (SELECT count(*) FROM seo.keyword_class_rule r
           WHERE r.match_facet = d.slug AND r.deleted_at IS NULL
             AND (p_site_id IS NULL OR r.site_id = p_site_id OR r.site_id IS NULL)),
         COALESCE(sum(v.cond_count), 0)::bigint,
         max(v.value_as_of),
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'value_id', v.value_id, 'slug', v.value_slug, 'key', v.value_key,
             'label', v.value_label, 'description', v.value_description,
             'abstain', COALESCE(v.is_abstain, false),
             'keyword_count', v.kw_count,
             'as_of', v.value_as_of,
             'condition_matcher_count', v.cond_count)
           ORDER BY v.position NULLS LAST, v.value_label
         ) FILTER (WHERE v.value_id IS NOT NULL), '[]'::jsonb),
         (SELECT r.is_ready FROM seo.facet_dimension_readiness(d.id) r),
         (SELECT r.can_abstain FROM seo.facet_dimension_readiness(d.id) r),
         (SELECT r.readiness_note FROM seo.facet_dimension_readiness(d.id) r)
  FROM dims d
  LEFT JOIN vals v ON v.dim_id = d.id
  GROUP BY d.id, d.slug, d.name, d.metadata, d.is_system
  ORDER BY COALESCE(d.metadata->>'scope','platform') DESC, d.name;
END;
$function$;

REVOKE ALL ON FUNCTION seo.facet_dimension_catalog(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_catalog(uuid) TO authenticated;

COMMIT;

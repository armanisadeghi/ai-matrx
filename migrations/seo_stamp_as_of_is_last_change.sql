-- ============================================================================
-- `as_of` MEANS LAST CHANGE (Arman's ruling, 2026-08-24)
--
-- Asked what a stamp's `as_of` should mean, Arman ruled: "I'm guessing last
-- change is the best one." Before this, `fn_evaluate_matchers_internal`'s
-- upsert bumped `as_of = now()` on EVERY re-run — even when the stamp landed
-- identical (same matcher, same value). One corpus-wide "run my rules" click,
-- or any future nightly re-stamp, would have made every rule-made stamp in
-- the system look freshly changed, and "what changed recently" — the receipt
-- a reviewer sorts by — would have meant nothing.
--
-- The fix is one predicate on the engine's upsert: the DO UPDATE fires only
-- when the winning matcher actually changed. Two honest consequences:
--   · `as_of` (and `updated_at`) hold still across no-op re-runs;
--   · the RPC's `stamped` count now means "stamps that CHANGED", so a
--     no-change re-run honestly reports 0 instead of re-counting the corpus.
-- Pinned and human stamps were already untouchable here; unchanged.
-- Body is the live pg_get_functiondef with only that predicate added.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers_internal(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_org uuid; v_stamped int := 0; v_removed int := 0; v_conflicts int := 0; v_matchers int := 0; v_scope int := 0;
  v_brand_matcher uuid; v_brand_value uuid;
BEGIN
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  CREATE TEMP TABLE IF NOT EXISTS _scope (kw_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _scope;
  INSERT INTO _scope
    SELECT DISTINCT x.kw_id FROM (
      SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
      UNION
      SELECT spd.keyword_id FROM seo.search_performance_daily spd
       WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      UNION
      SELECT skv.keyword_id FROM seo.site_keyword_value skv
       WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL
    ) x WHERE x.kw_id IS NOT NULL;
  SELECT count(*) INTO v_scope FROM _scope;

  CREATE TEMP TABLE IF NOT EXISTS _hits (kw_id uuid, value_id uuid, dim_id uuid, matcher_id uuid, single_card boolean) ON COMMIT DROP;
  TRUNCATE _hits;
  CREATE TEMP TABLE IF NOT EXISTS _desired (kw_id uuid, value_id uuid, dim_id uuid, matcher_id uuid, single_card boolean) ON COMMIT DROP;
  TRUNCATE _desired;

  WITH m AS (
    SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,
           cv.parent_id AS dim_id, COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
      AND dm.kind NOT IN ('condition','brand_identity')
  ),
  kw AS (SELECT k.id, k.normalized_phrase FROM seo.keyword k JOIN _scope s ON s.kw_id = k.id WHERE k.deleted_at IS NULL)
  INSERT INTO _hits
    SELECT kw.id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM kw JOIN m ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
         (m.kind = 'contains'    AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'exact'       AND kw.normalized_phrase = m.pattern)
      OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'ends_with'   AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
      OR (m.kind = 'word'        AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    SELECT kp.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL
    JOIN _scope s ON s.kw_id = kp.keyword_id WHERE m.kind = 'place'
    UNION ALL
    SELECT kf.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL
                                     AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    JOIN _scope s ON s.kw_id = kf.keyword_id WHERE m.kind = 'fact';

  SELECT dm.id, dm.value_id INTO v_brand_matcher, v_brand_value
  FROM seo.dimension_value_matcher dm
  WHERE dm.site_id = p_site_id AND dm.kind = 'brand_identity' AND dm.enabled AND dm.deleted_at IS NULL
  LIMIT 1;
  IF v_brand_matcher IS NOT NULL THEN
    INSERT INTO _hits
    WITH bh AS MATERIALIZED (SELECT * FROM seo.gsc_brand_hits(p_site_id)),
    alias_ok AS (SELECT bh.joined, count(*) <= seo.gsc_brand_generic_threshold() AS weak_ok FROM bh GROUP BY bh.joined)
    SELECT DISTINCT bh.keyword_id, v_brand_value,
           (SELECT parent_id FROM platform.categories WHERE id = v_brand_value), v_brand_matcher, true
    FROM bh JOIN alias_ok ao ON ao.joined = bh.joined
    JOIN _scope s ON s.kw_id = bh.keyword_id
    WHERE bh.strong OR ao.weak_ok;
  END IF;

  INSERT INTO _desired
  SELECT DISTINCT ON (kw_id, value_id) kw_id, value_id, dim_id, matcher_id, single_card
  FROM (SELECT h.*, row_number() OVER (PARTITION BY h.kw_id, h.dim_id ORDER BY h.matcher_id) AS rn FROM _hits h) r
  WHERE (NOT single_card) OR rn = 1
  ORDER BY kw_id, value_id, matcher_id;

  SELECT count(*) INTO v_conflicts FROM (
    SELECT kw_id, dim_id FROM _hits WHERE single_card GROUP BY kw_id, dim_id HAVING count(DISTINCT value_id) > 1) c;

  DELETE FROM _desired d
  WHERE d.single_card AND EXISTS (
    SELECT 1 FROM seo.keyword_facet kf JOIN platform.categories cv ON cv.id = kf.category_id
    WHERE kf.keyword_id = d.kw_id AND cv.parent_id = d.dim_id AND kf.deleted_at IS NULL
      AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
      AND (kf.pinned OR kf.source = 'human'));

  WITH up AS (
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
    SELECT d.kw_id, d.value_id, p_site_id, 'matcher', 100, d.matcher_id, now(), v_org, 'internal' FROM _desired d
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET matcher_id = EXCLUDED.matcher_id, as_of = now(), updated_at = now()
      WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
        -- as_of = LAST CHANGE: a re-run that lands the same matcher moves nothing
        AND seo.keyword_facet.matcher_id IS DISTINCT FROM EXCLUDED.matcher_id
    RETURNING 1
  ) SELECT count(*) INTO v_stamped FROM up;

  WITH gone AS (
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    WHERE kf.site_id = p_site_id AND kf.source = 'matcher' AND NOT kf.pinned AND kf.deleted_at IS NULL
      AND kf.keyword_id IN (SELECT kw_id FROM _scope)
      AND NOT EXISTS (SELECT 1 FROM seo.dimension_value_matcher cdm
                       WHERE cdm.id = kf.matcher_id AND cdm.kind = 'condition')
      AND NOT EXISTS (SELECT 1 FROM _desired d WHERE d.kw_id = kf.keyword_id AND d.value_id = kf.category_id)
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM gone;

  UPDATE seo.dimension_value_matcher dm
     SET last_evaluated_at = now(),
         match_count = (SELECT count(*) FROM seo.keyword_facet kf WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL)
   WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.kind <> 'condition';
  SELECT count(*) INTO v_matchers FROM seo.dimension_value_matcher
   WHERE site_id = p_site_id AND deleted_at IS NULL AND enabled AND kind <> 'condition';

  RETURN jsonb_build_object('scope_keywords', v_scope, 'matchers', v_matchers, 'stamped', v_stamped,
                            'removed', v_removed, 'single_cardinality_conflicts', v_conflicts, 'evaluated_at', now());
END $function$
;

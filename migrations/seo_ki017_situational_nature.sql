-- KI-017: Situational nature adopted correctly
--
-- THE LAW (P20 / decisions doc): a dimension declares nature = intrinsic
-- (stable fact about the keyword) or situational (volatile fact about the
-- keyword's situation on THIS site, right now). `as_of` = LAST CHANGE and
-- belongs ONLY on situational stamps. It must never be written for a stamp
-- whose dimension is intrinsic.
--
-- Audit (2026-08-25 -> re-verified live before this migration):
--   - Every LIVE dimension row in platform.categories (dimension='seo_facet',
--     parent_id IS NULL) already correctly declares metadata.nature. All 15
--     platform facets + all site geo/qualifier dimensions are 'intrinsic'.
--     The only 'situational' dimension (c5_test_attention, a Dig Here test
--     artifact, duplicated) has both its condition matchers already
--     soft-deleted. No dimension needed re-declaring.
--   - The bug is entirely in the WRITERS: three live functions stamp
--     as_of=now() unconditionally, regardless of the target dimension's
--     declared nature:
--       1. seo.fn_evaluate_matchers_internal  (site matcher engine --
--          exact/word/contains/starts/ends/place/fact/brand_identity kinds)
--       2. seo.gsc_set_keyword_stamps          (the one human write path, P24)
--       3. seo.gsc_set_keyword_class           (legacy traffic_class writer,
--          ON CONFLICT branch only -- traffic_class is intrinsic, always)
--   - fn_evaluate_condition_matchers (the Dig Here / situational engine) was
--     already correct: it only ever targets condition-kind matchers, which
--     by construction only ever attach to situational dimensions, and its
--     as_of semantics (set on first entry into the segment, never touched on
--     a same-match re-run) already match the LAW. Left untouched.
--
-- This migration:
--   (a) fixes the three writers to gate as_of on the target dimension's
--       declared nature, and
--   (b) nulls out as_of on every existing stamp whose dimension is NOT
--       situational (idempotent -- a second run finds nothing to null).

-- =========================================================================
-- (a) WRITER FIXES
-- =========================================================================

-- 1. Matcher engine: as_of only for stamps landing on a situational dimension.
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

  -- as_of = LAST CHANGE, and belongs ONLY on situational stamps (P20 / the
  -- intrinsic-vs-situational LAW). A matcher hit on an intrinsic dimension
  -- (qualifiers, geo, traffic class via brand_identity, ...) never carries it.
  WITH up AS (
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
    SELECT d.kw_id, d.value_id, p_site_id, 'matcher', 100, d.matcher_id,
           CASE WHEN cd.metadata->>'nature' = 'situational' THEN now() ELSE NULL END,
           v_org, 'internal'
    FROM _desired d
    JOIN platform.categories cd ON cd.id = d.dim_id
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET matcher_id = EXCLUDED.matcher_id, as_of = EXCLUDED.as_of, updated_at = now()
      WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
        -- a re-run that lands the same matcher moves nothing
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
END $function$;

-- 2. Human write path (P24): as_of only when the value's dimension is situational.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_stamps(p_site_id uuid, p_keyword_ids uuid[], p_value_id uuid, p_notes text DEFAULT NULL::text, p_clear boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
DECLARE
  v_org uuid; v_uid uuid := (SELECT auth.uid());
  v_dim uuid; v_single boolean; v_situational boolean; v_notes text := NULLIF(btrim(p_notes), '');
  v_written int := 0; v_replaced int := 0;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pick at least one keyword.';
  END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;
  SELECT cv.parent_id, COALESCE(cd.metadata->>'cardinality','single') = 'single', cd.metadata->>'nature' = 'situational'
    INTO v_dim, v_single, v_situational
  FROM platform.categories cv JOIN platform.categories cd ON cd.id = cv.parent_id
  WHERE cv.id = p_value_id AND cv.deleted_at IS NULL AND cd.deleted_at IS NULL;
  IF v_dim IS NULL THEN
    RAISE EXCEPTION 'seo_value_unknown: that value no longer exists.';
  END IF;
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  IF p_clear THEN
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now(), updated_by = v_uid
    WHERE kf.site_id = p_site_id AND kf.keyword_id = ANY(p_keyword_ids)
      AND kf.category_id = p_value_id AND kf.deleted_at IS NULL;
    GET DIAGNOSTICS v_replaced = ROW_COUNT;
    RETURN jsonb_build_object('cleared', v_replaced, 'written', 0);
  END IF;

  -- A single-choice dimension holds ONE stamp per keyword: retire the others.
  IF v_single THEN
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now(), updated_by = v_uid
    FROM platform.categories cv
    WHERE cv.id = kf.category_id AND cv.parent_id = v_dim AND cv.id <> p_value_id
      AND kf.site_id = p_site_id AND kf.keyword_id = ANY(p_keyword_ids) AND kf.deleted_at IS NULL;
    GET DIAGNOSTICS v_replaced = ROW_COUNT;
  END IF;

  -- as_of = LAST CHANGE, and belongs ONLY on situational stamps (P20). A
  -- human ruling on an intrinsic dimension (what the query IS) is pinned
  -- truth, not a freshness-tracked situation -- it never carries as_of.
  WITH up AS (
    INSERT INTO seo.keyword_facet
      (keyword_id, category_id, site_id, source, confidence, organization_id, visibility, pinned, notes, as_of, created_by, updated_by, metadata)
    SELECT k.id, p_value_id, p_site_id, 'human', 100, v_org, 'internal', true, v_notes,
           CASE WHEN v_situational THEN now() ELSE NULL END, v_uid, v_uid,
           jsonb_build_object('assigned_at', now(), 'assigned_by', v_uid)
    FROM seo.keyword k WHERE k.id = ANY(p_keyword_ids) AND k.deleted_at IS NULL
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET source = 'human', pinned = true,
                  notes = COALESCE(EXCLUDED.notes, seo.keyword_facet.notes),
                  as_of = EXCLUDED.as_of, updated_at = now(), updated_by = EXCLUDED.updated_by
    RETURNING 1
  ) SELECT count(*) INTO v_written FROM up;

  RETURN jsonb_build_object('written', v_written, 'replaced', v_replaced,
                            'dimension_id', v_dim, 'value_id', p_value_id, 'notes_saved', v_notes IS NOT NULL);
END $function$;

-- 3. Legacy traffic_class writer: traffic_class is always intrinsic -- never write as_of.
CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_class(p_site_id uuid, p_keyword_ids uuid[], p_class text, p_notes text DEFAULT NULL::text, p_origin text DEFAULT 'manual'::text, p_rule_id uuid DEFAULT NULL::uuid, p_confirmed boolean DEFAULT true)
 RETURNS TABLE(keyword_id uuid, traffic_class text, class_source text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'platform', 'pg_temp'
AS $function$
#variable_conflict use_column
DECLARE
  v_notes text := NULLIF(btrim(p_notes), '');
  v_org uuid;
  v_uid uuid := (SELECT auth.uid());
  v_meta jsonb;
  v_dim uuid := (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL);
  v_val uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'clear') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_origin NOT IN ('manual', 'rule', 'import', 'ai') THEN
    RAISE EXCEPTION 'gsc_origin_unknown: %', p_origin;
  END IF;
  IF p_class = 'mismatch' AND v_notes IS NULL THEN
    RAISE EXCEPTION 'gsc_mismatch_needs_notes: a mismatch ruling must carry its reasoning';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pass at least one keyword id';
  END IF;
  IF array_length(p_keyword_ids, 1) > 1000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: max 1000 per call';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;
  v_meta := jsonb_strip_nulls(jsonb_build_object('origin', p_origin, 'rule_id', p_rule_id, 'confirmed', p_confirmed, 'applied_at', now()));

  IF p_class = 'clear' THEN
    UPDATE seo.site_keyword_value skv SET
      traffic_class = NULL,
      content_role = CASE WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL ELSE skv.content_role END,
      service_match = CASE WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL ELSE skv.service_match END,
      lead_quality = CASE WHEN skv.lead_quality = 'negative_value' THEN NULL ELSE skv.lead_quality END,
      suppression_reason = NULL,
      workflow_status = CASE WHEN skv.workflow_status = 'suppressed' THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(v_notes, skv.notes),
      metadata = skv.metadata - 'classification',
      updated_at = now(), updated_by = v_uid, version = skv.version + 1
    WHERE skv.site_id = p_site_id AND skv.keyword_id = ANY (p_keyword_ids) AND skv.deleted_at IS NULL;
    -- the stamp: clear this site's non-matcher stamps on the dimension (back to matchers/defaults)
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    FROM platform.categories cv
    WHERE cv.id = kf.category_id AND cv.parent_id = v_dim
      AND kf.site_id = p_site_id AND kf.keyword_id = ANY (p_keyword_ids) AND kf.deleted_at IS NULL
      AND kf.source IN ('human','import','rule','classifier','pack');
  ELSE
    INSERT INTO seo.site_keyword_value AS skv
      (organization_id, site_id, keyword_id, traffic_class, content_role, service_match, notes, metadata, created_by, updated_by)
    SELECT v_org, p_site_id, kw.id, p_class,
           CASE p_class WHEN 'money' THEN 'money_page' WHEN 'educational' THEN 'supporting_content' END,
           CASE p_class WHEN 'mismatch' THEN 'not_offered' END,
           v_notes, jsonb_build_object('classification', v_meta), v_uid, v_uid
    FROM seo.keyword kw WHERE kw.id = ANY (p_keyword_ids) AND kw.deleted_at IS NULL
    ON CONFLICT (site_id, keyword_id) DO UPDATE SET
      traffic_class = EXCLUDED.traffic_class,
      content_role = CASE WHEN EXCLUDED.traffic_class IN ('money', 'educational') THEN EXCLUDED.content_role
                          WHEN skv.content_role IN ('money_page', 'supporting_content') THEN NULL ELSE skv.content_role END,
      service_match = CASE WHEN EXCLUDED.traffic_class = 'mismatch' THEN 'not_offered'
                           WHEN skv.service_match IN ('not_offered', 'actively_avoided') THEN NULL ELSE skv.service_match END,
      lead_quality = CASE WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.lead_quality
                          WHEN skv.lead_quality = 'negative_value' THEN NULL ELSE skv.lead_quality END,
      suppression_reason = CASE WHEN EXCLUDED.traffic_class = 'mismatch' THEN skv.suppression_reason ELSE NULL END,
      workflow_status = CASE WHEN EXCLUDED.traffic_class <> 'mismatch' AND skv.workflow_status = 'suppressed' THEN 'candidate' ELSE skv.workflow_status END,
      notes = COALESCE(EXCLUDED.notes, skv.notes),
      metadata = skv.metadata || EXCLUDED.metadata,
      deleted_at = NULL, updated_at = now(), updated_by = EXCLUDED.updated_by, version = skv.version + 1;

    -- THE STAMP (single-cardinality: one class per keyword per site -- retire the others first)
    SELECT id INTO v_val FROM platform.categories WHERE dimension='seo_facet' AND deleted_at IS NULL AND slug = 'traffic_class:' || p_class;
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    FROM platform.categories cv
    WHERE cv.id = kf.category_id AND cv.parent_id = v_dim AND cv.id <> v_val
      AND kf.site_id = p_site_id AND kf.keyword_id = ANY (p_keyword_ids) AND kf.deleted_at IS NULL;
    -- traffic_class is an intrinsic dimension (platform.categories declares it so) --
    -- this writer never sets as_of, on insert or re-classification.
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, organization_id, visibility, pinned, notes, metadata)
    SELECT kw.id, v_val, p_site_id,
           CASE p_origin WHEN 'rule' THEN 'rule' WHEN 'import' THEN 'import' WHEN 'ai' THEN 'classifier' ELSE 'human' END,
           100, v_org, 'internal', (p_origin IN ('manual','import') OR p_confirmed), v_notes,
           jsonb_build_object('classification', v_meta)
    FROM seo.keyword kw WHERE kw.id = ANY (p_keyword_ids) AND kw.deleted_at IS NULL
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET source = EXCLUDED.source, pinned = EXCLUDED.pinned, notes = COALESCE(EXCLUDED.notes, seo.keyword_facet.notes),
                  metadata = seo.keyword_facet.metadata || EXCLUDED.metadata, updated_at = now();
  END IF;

  IF p_rule_id IS NOT NULL THEN
    UPDATE seo.keyword_class_rule r SET last_applied_at = now() WHERE r.id = p_rule_id;
  END IF;

  RETURN QUERY
  SELECT cm.keyword_id, cm.traffic_class, cm.class_source
  FROM seo.gsc_keyword_class_map(p_site_id) cm
  WHERE cm.keyword_id = ANY (p_keyword_ids);
END;
$function$;

-- =========================================================================
-- (b) DATA FIX -- idempotent
-- =========================================================================

UPDATE seo.keyword_facet kf
SET as_of = NULL, updated_at = now()
FROM platform.categories cv
JOIN platform.categories cd ON cd.id = cv.parent_id
WHERE cv.id = kf.category_id
  AND kf.as_of IS NOT NULL
  AND kf.deleted_at IS NULL
  AND coalesce(cd.metadata->>'nature','intrinsic') <> 'situational';

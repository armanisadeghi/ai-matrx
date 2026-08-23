-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C3 (2026-08-23)
-- TRAFFIC CLASS BECOMES A DIMENSION. The read-time resolver
-- `gsc_keyword_class_map` is rewritten IN PLACE (same signature — its 11
-- consumers keep working) to read STAMPS on the platform dimension
-- `traffic_class`:
--   human rulings (site_keyword_value.traffic_class / semantic columns)  → human stamps (site-scoped, pinned)
--   class-rule patterns + brand aliases (already matchers, C1)           → matcher stamps via the engine
--   the site's derived brand identity (domain / names, genericity guard) → ONE `brand_identity` matcher per site, evaluated by the engine
--   the AI intent fact                                                   → derived UNIVERSAL default stamps (source classifier, version derived-intent-v1)
-- Precedence = the stamp system's: human > site matcher > universal.
-- traffic_class is marked NOT AI-classifiable: brand and mismatch depend on
-- WHICH business, so the universal classifier never guesses them (P10).
-- Writers dual-write: gsc_set_keyword_class keeps its columns AND writes the
-- stamp; the columns retire in C11.
-- ============================================================================

-- ── 1. Registry: traffic_class is stamped by matchers/humans/derivation only ──
UPDATE platform.categories
   SET metadata = metadata || jsonb_build_object('ai_classifiable', false,
       'description', 'What kind of traffic a query brings: money (could buy), educational (could learn), brand (already knows you), mismatch (can never serve). Brand and mismatch depend on WHICH business, so the universal AI never stamps this dimension — human rulings, your matchers, the site''s brand identity, and a derived default from the AI intent fact do.')
 WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION seo.facet_dimension_readiness(p_dimension_id uuid)
 RETURNS TABLE(is_ready boolean, can_abstain boolean, readiness_note text)
 LANGUAGE sql STABLE
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  WITH d AS (
    SELECT COALESCE((c.metadata->>'ai_classifiable')::boolean, true) AS ai_ok
    FROM platform.categories c WHERE c.id = p_dimension_id
  ),
  v AS (
    SELECT count(*) FILTER (WHERE COALESCE((c.metadata->>'abstain')::boolean, false)) AS abstains,
           count(*) FILTER (WHERE NOT COALESCE((c.metadata->>'abstain')::boolean, false)) AS real_vals
    FROM platform.categories c WHERE c.parent_id = p_dimension_id AND c.deleted_at IS NULL
  )
  SELECT (d.ai_ok AND v.real_vals >= 2),
         v.abstains > 0,
         CASE
           WHEN NOT d.ai_ok THEN 'Not offered to the AI by design — this dimension is stamped by your matchers, your rulings, and derived defaults (its values depend on which business).'
           WHEN v.real_vals < 2 THEN 'Needs at least two real choices. With only one, the AI is forced to stamp it on everything — so this dimension is not being applied yet.'
           WHEN v.abstains = 0 THEN 'Working, but it has no "not clear" choice — so the AI must pick something even when the words do not say. Consider adding one.'
           ELSE 'Ready — the AI can answer this honestly, including declining to.'
         END
  FROM d, v;
$function$;

-- ── 2. Matcher kind `brand_identity` (one per site; evaluated via gsc_brand_hits) ──
ALTER TABLE seo.dimension_value_matcher
  DROP CONSTRAINT IF EXISTS dvm_kind_check,
  ADD CONSTRAINT dvm_kind_check CHECK (kind IN ('exact','word','contains','starts_with','ends_with','place','fact','condition','brand_identity')),
  DROP CONSTRAINT IF EXISTS dvm_target_check,
  ADD CONSTRAINT dvm_target_check CHECK (
    (kind IN ('exact','word','contains','starts_with','ends_with') AND pattern IS NOT NULL AND place_id IS NULL AND fact_value_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'place'     AND place_id IS NOT NULL AND pattern IS NULL AND fact_value_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'fact'      AND fact_value_id IS NOT NULL AND pattern IS NULL AND place_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'condition' AND condition_rule_id IS NOT NULL AND pattern IS NULL AND place_id IS NULL AND fact_value_id IS NULL)
    OR (kind = 'brand_identity' AND pattern IS NULL AND place_id IS NULL AND fact_value_id IS NULL AND condition_rule_id IS NULL)
  );

INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, origin, notes)
SELECT s.id, s.organization_id, v.id, 'brand_identity', 'migration',
       'This site''s brand identity (domain, site name, brand name, custom aliases) — derived by seo.gsc_brand_aliases with the genericity guard'
FROM web.site s
CROSS JOIN (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND slug='traffic_class:brand' AND deleted_at IS NULL) v
WHERE s.deleted_at IS NULL
  AND EXISTS (SELECT 1 FROM seo.search_performance_daily spd WHERE spd.site_id = s.id LIMIT 1)
ON CONFLICT DO NOTHING;

-- ── 3. Engine learns brand_identity ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_org uuid; v_stamped int := 0; v_removed int := 0; v_conflicts int := 0; v_matchers int := 0; v_scope int := 0;
  v_brand_matcher uuid; v_brand_value uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
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

  -- brand identity: the site's derived aliases with the genericity guard (ONE matcher row per site)
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
    RETURNING 1
  ) SELECT count(*) INTO v_stamped FROM up;

  WITH gone AS (
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    WHERE kf.site_id = p_site_id AND kf.source = 'matcher' AND NOT kf.pinned AND kf.deleted_at IS NULL
      AND kf.keyword_id IN (SELECT kw_id FROM _scope)
      AND NOT EXISTS (SELECT 1 FROM _desired d WHERE d.kw_id = kf.keyword_id AND d.value_id = kf.category_id)
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM gone;

  UPDATE seo.dimension_value_matcher dm
     SET last_evaluated_at = now(),
         match_count = (SELECT count(*) FROM seo.keyword_facet kf WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL)
   WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL;
  SELECT count(*) INTO v_matchers FROM seo.dimension_value_matcher WHERE site_id = p_site_id AND deleted_at IS NULL AND enabled;

  RETURN jsonb_build_object('scope_keywords', v_scope, 'matchers', v_matchers, 'stamped', v_stamped,
                            'removed', v_removed, 'single_cardinality_conflicts', v_conflicts, 'evaluated_at', now());
END $fn$;

-- ── 4. Derived universal defaults from the AI intent fact (idempotent) ──────
INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, classifier_version, organization_id, visibility, metadata)
SELECT k.id, v.id, NULL, 'classifier', 60, 'derived-intent-v1',
       (SELECT organization_id FROM platform.categories WHERE slug='traffic_class' AND dimension='seo_facet' AND parent_id IS NULL AND deleted_at IS NULL),
       'public', jsonb_build_object('derived_from','intent_class','intent_class',k.intent_class)
FROM seo.keyword k
JOIN platform.categories v ON v.dimension='seo_facet' AND v.deleted_at IS NULL AND v.slug =
     CASE WHEN k.intent_class IN ('transactional','commercial_investigation') THEN 'traffic_class:money'
          WHEN k.intent_class = 'informational' THEN 'traffic_class:educational'
          WHEN k.intent_class = 'navigational' THEN 'traffic_class:brand' END
WHERE k.deleted_at IS NULL AND k.intent_class IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM seo.keyword_facet kf JOIN platform.categories c ON c.id = kf.category_id
    WHERE kf.keyword_id = k.id AND kf.site_id IS NULL AND kf.deleted_at IS NULL AND c.parent_id = v.parent_id);

-- ── 5. Human rulings → pinned human stamps (site-scoped, idempotent) ────────
INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, organization_id, visibility, pinned, notes, metadata)
SELECT skv.keyword_id, v.id, skv.site_id,
       CASE COALESCE(skv.metadata->'classification'->>'origin','manual')
            WHEN 'rule' THEN 'rule' WHEN 'import' THEN 'import' WHEN 'ai' THEN 'classifier' ELSE 'human' END,
       100, skv.organization_id, 'internal',
       COALESCE(skv.metadata->'classification'->>'origin','manual') IN ('manual','import')
         OR COALESCE((skv.metadata->'classification'->>'confirmed')::boolean, false),
       skv.notes,
       jsonb_build_object('migrated_from','site_keyword_value','classification', COALESCE(skv.metadata->'classification','{}'::jsonb))
FROM seo.site_keyword_value skv
JOIN LATERAL (
  SELECT CASE
    WHEN skv.traffic_class IS NOT NULL THEN skv.traffic_class
    WHEN skv.suppression_reason IS NOT NULL OR skv.service_match IN ('not_offered','actively_avoided') OR skv.lead_quality = 'negative_value' THEN 'mismatch'
    WHEN skv.content_role = 'money_page' THEN 'money'
    WHEN skv.content_role = 'supporting_content' THEN 'educational'
  END AS cls
) x ON x.cls IS NOT NULL
JOIN platform.categories v ON v.dimension='seo_facet' AND v.deleted_at IS NULL AND v.slug = 'traffic_class:' || x.cls
WHERE skv.deleted_at IS NULL
ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
DO NOTHING;

-- ── 6. THE CLASS RESOLVER, on stamps (same signature; 11 consumers unchanged) ──
CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_map(p_site_id uuid)
 RETURNS TABLE(keyword_id uuid, traffic_class text, class_source text)
 LANGUAGE sql STABLE
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  WITH dim AS (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL),
  st AS (
    SELECT kf.keyword_id, COALESCE(cv.metadata->>'value', split_part(cv.slug,':',2)) AS cls, kf.source, kf.site_id, kf.pinned, kf.matcher_id,
           CASE kf.source WHEN 'human' THEN 1 WHEN 'import' THEN 2 WHEN 'rule' THEN 3 WHEN 'matcher' THEN 3 WHEN 'pack' THEN 3 ELSE 5 END
             + CASE WHEN kf.pinned THEN -1 ELSE 0 END
             + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
    FROM seo.keyword_facet kf
    JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL AND cv.parent_id = (SELECT id FROM dim)
    WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
  ),
  best AS (
    SELECT DISTINCT ON (s.keyword_id) s.* FROM st s ORDER BY s.keyword_id, s.prio, s.site_id NULLS LAST
  )
  SELECT kw.id,
         CASE WHEN b.cls IS NULL OR b.cls = 'not_clear' THEN 'unclassified' ELSE b.cls END,
         CASE
           WHEN b.cls IS NULL OR b.cls = 'not_clear' THEN 'none'
           WHEN b.source IN ('human','import') THEN 'site_value'
           WHEN b.source = 'matcher' AND EXISTS (SELECT 1 FROM seo.dimension_value_matcher dm WHERE dm.id = b.matcher_id AND (dm.kind = 'brand_identity' OR dm.notes = 'brand alias')) THEN 'brand_match'
           WHEN b.source IN ('matcher','rule','pack') THEN 'site_value'
           WHEN b.source = 'classifier' THEN 'intent_class'
           ELSE 'none'
         END
  FROM seo.keyword kw
  LEFT JOIN best b ON b.keyword_id = kw.id
  WHERE kw.deleted_at IS NULL;
$function$;

-- ── 7. Writers dual-write the stamp ─────────────────────────────────────────
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

    -- THE STAMP (single-cardinality: one class per keyword per site — retire the others first)
    SELECT id INTO v_val FROM platform.categories WHERE dimension='seo_facet' AND deleted_at IS NULL AND slug = 'traffic_class:' || p_class;
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
    FROM platform.categories cv
    WHERE cv.id = kf.category_id AND cv.parent_id = v_dim AND cv.id <> v_val
      AND kf.site_id = p_site_id AND kf.keyword_id = ANY (p_keyword_ids) AND kf.deleted_at IS NULL;
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, organization_id, visibility, pinned, notes, metadata)
    SELECT kw.id, v_val, p_site_id,
           CASE p_origin WHEN 'rule' THEN 'rule' WHEN 'import' THEN 'import' WHEN 'ai' THEN 'classifier' ELSE 'human' END,
           100, v_org, 'internal', (p_origin IN ('manual','import') OR p_confirmed), v_notes,
           jsonb_build_object('classification', v_meta)
    FROM seo.keyword kw WHERE kw.id = ANY (p_keyword_ids) AND kw.deleted_at IS NULL
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET source = EXCLUDED.source, pinned = EXCLUDED.pinned, notes = COALESCE(EXCLUDED.notes, seo.keyword_facet.notes),
                  metadata = seo.keyword_facet.metadata || EXCLUDED.metadata, as_of = now(), updated_at = now();
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

CREATE OR REPLACE FUNCTION seo.gsc_confirm_keyword_class(p_site_id uuid, p_keyword_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_count int;
  v_dim uuid := (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL);
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords: pass at least one keyword id';
  END IF;
  UPDATE seo.site_keyword_value skv
  SET metadata = jsonb_set(skv.metadata, '{classification,confirmed}', 'true'::jsonb),
      updated_at = now(), updated_by = (SELECT auth.uid()), version = skv.version + 1
  WHERE skv.site_id = p_site_id AND skv.keyword_id = ANY (p_keyword_ids) AND skv.deleted_at IS NULL
    AND skv.traffic_class IS NOT NULL
    AND COALESCE((skv.metadata->'classification'->>'confirmed')::boolean, true) = false;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- a confirmed class is a human's word: pin the stamp
  UPDATE seo.keyword_facet kf SET pinned = true, source = 'human', updated_at = now(),
         metadata = jsonb_set(COALESCE(kf.metadata,'{}'::jsonb), '{classification,confirmed}', 'true'::jsonb)
  FROM platform.categories cv
  WHERE cv.id = kf.category_id AND cv.parent_id = v_dim
    AND kf.site_id = p_site_id AND kf.keyword_id = ANY (p_keyword_ids) AND kf.deleted_at IS NULL
    AND kf.source IN ('rule','matcher','classifier','pack','import');
  RETURN v_count;
END;
$function$;

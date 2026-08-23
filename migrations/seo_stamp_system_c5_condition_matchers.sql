-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C5 (2026-08-23)
-- DIG HERE SAVES ITS MATCHES AS A STAMP (condition matchers + situational
-- dimensions) AND GAINS A LEVEL PIN.
--
-- Arman: "ten thousand words getting impressions, five thousand have one or
-- fewer impressions — why can't I just put a category on those so they
-- instantly have a place they belong."  A Dig Here rule already FINDS that
-- set; C5 lets the rule hand the set a NAME that lives on the keyword.
--
-- The model (P19–P22, PLAN.md C5):
--   * A dimension declares its NATURE: intrinsic (describes the keyword,
--     stable) or situational (describes the keyword's situation on this site
--     NOW — volatile, carries an as-of, re-derived on cadence/on demand).
--   * A Dig Here rule becomes ONE matcher row of kind 'condition' on a
--     situational VALUE.  The rule stays exactly what it was — the stateless
--     `gsc_perf_dig` path is REUSED verbatim (own base filters, own class /
--     level pin, own sort + row limit, own period semantics), never
--     re-implemented.
--   * Evaluation stamps `source='matcher'`, `as_of=now()`, site-scoped and
--     `internal`; a re-evaluation removes the stamps that no longer match.
--     Human/pinned stamps are never touched (P20).
--   * P21 — the stamp is the SEGMENT ("parked", "shift-traffic candidate").
--     It never carries a lifecycle: nothing here has a status a person closes.
--
-- 🚨 THE SCOPE RULE holds throughout: a condition matcher is evaluated over
-- ONE window (the site's current window by default), never the whole history.
-- ============================================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1. DIMENSION NATURE (P20) — declared on creation, reported by the catalog
-- ────────────────────────────────────────────────────────────────────────────

-- `p_nature` is new; the 5-arg form is dropped so a 5-named-arg call can never
-- be ambiguous between two overloads.
DROP FUNCTION IF EXISTS seo.facet_dimension_upsert(text, text, text, uuid, text);

CREATE OR REPLACE FUNCTION seo.facet_dimension_upsert(
  p_slug text,
  p_label text,
  p_description text DEFAULT NULL,
  p_site_id uuid DEFAULT NULL,
  p_cardinality text DEFAULT 'single',
  p_nature text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'iam', 'pg_temp'
AS $function$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_id   uuid;
  v_scope text := CASE WHEN p_site_id IS NULL THEN 'platform' ELSE 'site' END;
  v_existing_scope text;
  v_existing_site  uuid;
  v_nature text := COALESCE(NULLIF(btrim(p_nature), ''), 'intrinsic');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_slug !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'seo_registry_bad_value: "%" must be lowercase letters, digits and underscores, starting with a letter', p_slug;
  END IF;
  IF coalesce(btrim(p_label),'') = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a dimension must have a name';
  END IF;
  IF p_cardinality NOT IN ('single','multi') THEN
    RAISE EXCEPTION 'seo_registry_bad_cardinality: cardinality is "single" or "multi", not "%"', p_cardinality;
  END IF;
  IF v_nature NOT IN ('intrinsic','situational') THEN
    RAISE EXCEPTION 'seo_registry_bad_nature: a dimension is "intrinsic" (it describes the keyword) or "situational" (it describes the keyword''s situation right now), not "%"', v_nature;
  END IF;

  IF p_site_id IS NULL THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: platform dimensions are facts every site shares, so only super admins create them. Create it on this site instead and it is yours to shape.';
    END IF;
    SELECT c.organization_id INTO v_org
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
      AND c.is_system AND c.deleted_at IS NULL
    ORDER BY c.created_at LIMIT 1;
    IF v_org IS NULL THEN
      RAISE EXCEPTION 'seo_registry_no_platform_org: no platform facet exists to inherit an owner from';
    END IF;
  ELSE
    PERFORM seo.gsc_assert_site_access(p_site_id);
    SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;
  END IF;

  SELECT c.id, COALESCE(c.metadata->>'scope','platform'), (c.metadata->>'site_id')::uuid
    INTO v_id, v_existing_scope, v_existing_site
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_slug AND c.deleted_at IS NULL;

  IF FOUND THEN
    IF v_existing_scope = 'platform' AND NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" is a platform dimension — its label is shared by every site. Only super admins change it.', p_slug;
    END IF;
    IF v_existing_scope = 'site' AND v_existing_site IS DISTINCT FROM p_site_id THEN
      RAISE EXCEPTION 'seo_registry_duplicate: another site already owns a dimension named "%". Pick a different name.', p_slug;
    END IF;
    UPDATE platform.categories
       SET name = btrim(p_label),
           metadata = metadata
                      || jsonb_build_object('cardinality', p_cardinality)
                      -- Nature is only rewritten when the caller states one;
                      -- an editor that does not know about nature must never
                      -- silently reclassify a dimension it is only renaming.
                      || CASE WHEN p_nature IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('nature', v_nature) END
                      || CASE WHEN p_nature IS NULL OR v_nature <> 'situational' THEN '{}'::jsonb
                              ELSE jsonb_build_object('ai_classifiable', false) END
                      || CASE WHEN p_description IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('description', btrim(p_description)) END,
           updated_by = v_uid, updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO platform.categories
    (dimension, slug, name, parent_id, organization_id, is_system, visibility, metadata, created_by, updated_by)
  VALUES
    ('seo_facet', p_slug, btrim(p_label), NULL, v_org, p_site_id IS NULL, 'internal',
     jsonb_strip_nulls(jsonb_build_object(
       'scope', v_scope, 'cardinality', p_cardinality, 'nature', v_nature,
       'site_id', p_site_id::text,
       'description', NULLIF(btrim(COALESCE(p_description,'')), '')))
     -- A situational dimension is filled by RULES, never by the universal
     -- classifier: "is this keyword parked on this site right now" is not a
     -- fact about the words. The classifier is never offered it (C3's flag).
     || CASE WHEN v_nature = 'situational' THEN jsonb_build_object('ai_classifiable', false) ELSE '{}'::jsonb END,
     v_uid, v_uid)
  RETURNING id INTO v_id;

  -- The honest-decline option exists so the AI can decline instead of
  -- guessing. A situational dimension has no AI to decline — seeding
  -- "not clear" there would be a value nothing can ever stamp.
  IF v_nature <> 'situational' THEN
    PERFORM seo.facet_dimension_seed_abstain(v_id, v_org, p_site_id IS NULL, v_uid);
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION seo.facet_dimension_upsert(text, text, text, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_upsert(text, text, text, uuid, text, text) TO authenticated;

-- Readiness: a situational dimension is never handed to the classifier, so the
-- "fewer than two choices" gate would report a problem that does not exist.
CREATE OR REPLACE FUNCTION seo.facet_dimension_readiness(p_dimension_id uuid)
RETURNS TABLE(is_ready boolean, can_abstain boolean, readiness_note text)
LANGUAGE sql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  WITH d AS (
    SELECT COALESCE((c.metadata->>'ai_classifiable')::boolean, true) AS ai_ok,
           COALESCE(c.metadata->>'nature','intrinsic') AS nature
    FROM platform.categories c WHERE c.id = p_dimension_id
  ),
  v AS (
    SELECT count(*) FILTER (WHERE COALESCE((c.metadata->>'abstain')::boolean, false)) AS abstains,
           count(*) FILTER (WHERE NOT COALESCE((c.metadata->>'abstain')::boolean, false)) AS real_vals
    FROM platform.categories c WHERE c.parent_id = p_dimension_id AND c.deleted_at IS NULL
  ),
  cond AS (
    SELECT count(*) AS rules
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    WHERE cv.parent_id = p_dimension_id AND dm.kind = 'condition'
      AND dm.enabled AND dm.deleted_at IS NULL
  )
  SELECT
    -- A situational dimension is never handed to the classifier, so the
    -- "two real choices" gate would report a problem it does not have. What
    -- makes it ready is having a rule that fills it.
    CASE WHEN d.nature = 'situational' THEN cond.rules > 0
         ELSE (d.ai_ok AND v.real_vals >= 2) END,
    CASE WHEN d.nature = 'situational' THEN true ELSE v.abstains > 0 END,
    CASE
      WHEN d.nature = 'situational' AND cond.rules > 0
        THEN format('Situational — filled by %s Dig Here rule%s, not by the AI. Re-evaluate it to refresh what it holds.',
                    cond.rules, CASE WHEN cond.rules = 1 THEN '' ELSE 's' END)
      WHEN d.nature = 'situational'
        THEN 'Situational — nothing fills it yet. Save a Dig Here rule''s matches into one of its values and it starts holding keywords.'
      WHEN NOT d.ai_ok THEN 'Not offered to the AI by design — this dimension is stamped by your matchers, your rulings, and derived defaults (its values depend on which business).'
      WHEN v.real_vals < 2 THEN 'Needs at least two real choices. With only one, the AI is forced to stamp it on everything — so this dimension is not being applied yet.'
      WHEN v.abstains = 0 THEN 'Working, but it has no "not clear" choice — so the AI must pick something even when the words do not say. Consider adding one.'
      ELSE 'Ready — the AI can answer this honestly, including declining to.'
    END
  FROM d, v, cond;
$function$;

GRANT EXECUTE ON FUNCTION seo.facet_dimension_readiness(uuid) TO authenticated;

-- Every existing dimension is intrinsic (C1 stamped them; this is the
-- idempotent backstop for any created since).
UPDATE platform.categories
   SET metadata = metadata || jsonb_build_object('nature','intrinsic')
 WHERE dimension = 'seo_facet' AND parent_id IS NULL AND deleted_at IS NULL
   AND NOT (metadata ? 'nature');

-- The catalog reports nature, how fresh the situational stamps are, and how
-- many rules fill it (P22: the screens that group by nature read this).
DROP FUNCTION IF EXISTS seo.facet_dimension_catalog(uuid);

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
           -- Situational values carry a freshness: the newest stamp this site
           -- holds on them. A value showing a count without an as-of would be
           -- claiming a present-tense fact with no time behind it.
           (SELECT max(kf.as_of) FROM seo.keyword_facet kf
             WHERE kf.category_id = cv.id AND kf.deleted_at IS NULL
               AND (p_site_id IS NULL OR kf.site_id = p_site_id)) AS value_as_of,
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

-- ────────────────────────────────────────────────────────────────────────────
-- 2. THE LEVEL PIN on Dig Here (beside the class pin)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE seo.gsc_dig_rule ADD COLUMN IF NOT EXISTS level text;
COMMENT ON COLUMN seo.gsc_dig_rule.level IS
  'Optional LEVEL pin — one value from seo.gsc_value_vocabulary(site, ''value_band''). Thresholds with level words only; a level names nothing (P18).';

DROP FUNCTION IF EXISTS seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, integer, text);

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
  -- The level vocabulary is the SITE's (its own value_band rows, or the
  -- platform template when it has none) — never a list hardcoded here.
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
  IF p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=%', p_limit;
  END IF;

  -- Class AND level are keyword-level facts: a page dig that pins either one
  -- evaluates over query_page (the fact travels with the query).
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
      -- THE SCOPE RULE: the resolver runs over the keywords in THIS window,
      -- never the whole site (C6 uses the identical shape).
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
  LIMIT p_limit;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, integer, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_dig(uuid, text, date, date, date, date, jsonb, jsonb, text, text, integer, text, text) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. SAVE MATCHES AS A STAMP — the condition-matcher write path
-- ────────────────────────────────────────────────────────────────────────────

-- Attach a Dig Here rule to a situational VALUE as a condition matcher.
-- ONE row per (site, value, rule) — the identity index enforces it, and a
-- re-attach revives a previously removed one rather than duplicating it.
CREATE OR REPLACE FUNCTION seo.gsc_dig_rule_stamp_upsert(
  p_site_id uuid, p_rule_id uuid, p_value_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_org uuid;
  v_id  uuid;
  v_rule seo.gsc_dig_rule%ROWTYPE;
  v_nature text;
  v_dim_label text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'seo_registry_unauthenticated'; END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  SELECT * INTO v_rule FROM seo.gsc_dig_rule r
   WHERE r.id = p_rule_id AND r.deleted_at IS NULL
     AND (r.site_id IS NULL OR r.site_id = p_site_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_rule_not_found: that Dig Here rule is not available on this site';
  END IF;
  -- A stamp lands on a KEYWORD. A page rule with no class or level pin
  -- produces page rows with no keyword behind them — there is nothing to
  -- stamp, so we refuse rather than saving a matcher that finds nothing.
  IF v_rule.dimension <> 'query' AND v_rule.traffic_class IS NULL AND v_rule.level IS NULL THEN
    RAISE EXCEPTION 'seo_registry_rule_not_keyword_level: "%" digs pages, so its matches are pages, not keywords. A stamp lands on a keyword — use a query rule (or pin the page rule to a class or level, which makes it evaluate per query).', v_rule.name;
  END IF;

  SELECT COALESCE(cd.metadata->>'nature','intrinsic'), cd.name INTO v_nature, v_dim_label
  FROM platform.categories cv
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE cv.id = p_value_id AND cv.deleted_at IS NULL
    AND (COALESCE(cd.metadata->>'scope','platform') = 'site'
         AND (cd.metadata->>'site_id')::uuid = p_site_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_value_not_site_owned: a rule can only fill a value on one of THIS site''s own dimensions — platform dimensions are shared facts and no site''s rule may write them.';
  END IF;
  IF v_nature <> 'situational' THEN
    RAISE EXCEPTION 'seo_registry_value_not_situational: "%" is an intrinsic dimension — it describes what a keyword IS, and a Dig Here rule describes what is happening to it right now. Make (or pick) a situational dimension instead.', v_dim_label;
  END IF;

  INSERT INTO seo.dimension_value_matcher
    (site_id, value_id, kind, condition_rule_id, enabled, origin, organization_id, created_by, updated_by)
  VALUES
    (p_site_id, p_value_id, 'condition', p_rule_id, true, 'human', v_org, v_uid, v_uid)
  ON CONFLICT (site_id, value_id, kind,
               COALESCE(lower(pattern), ''), COALESCE(place_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(fact_value_id, '00000000-0000-0000-0000-000000000000'::uuid),
               COALESCE(condition_rule_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL
  DO UPDATE SET enabled = true, updated_by = v_uid, updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_dig_rule_stamp_upsert(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.gsc_dig_rule_stamp_upsert(uuid, uuid, uuid) TO authenticated;

-- Detach: the matcher goes, and so do the stamps it (and only it) put there.
-- Human and pinned stamps on the same value stay — a person's ruling is not
-- the rule's to withdraw (P20).
CREATE OR REPLACE FUNCTION seo.gsc_dig_rule_stamp_remove(p_site_id uuid, p_matcher_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_removed int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'seo_registry_unauthenticated'; END IF;
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF NOT EXISTS (SELECT 1 FROM seo.dimension_value_matcher dm
                  WHERE dm.id = p_matcher_id AND dm.site_id = p_site_id
                    AND dm.kind = 'condition' AND dm.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_registry_matcher_not_found: that saved stamp is not on this site (it may already be removed)';
  END IF;

  WITH gone AS (
    UPDATE seo.keyword_facet kf SET deleted_at = now(), updated_at = now()
     WHERE kf.matcher_id = p_matcher_id AND kf.deleted_at IS NULL AND NOT kf.pinned
       AND kf.source = 'matcher'
    RETURNING 1
  ) SELECT count(*) INTO v_removed FROM gone;

  UPDATE seo.dimension_value_matcher
     SET deleted_at = now(), enabled = false, updated_by = v_uid, updated_at = now()
   WHERE id = p_matcher_id;

  RETURN jsonb_build_object('matcher_id', p_matcher_id, 'stamps_removed', v_removed);
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_dig_rule_stamp_remove(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.gsc_dig_rule_stamp_remove(uuid, uuid) TO authenticated;

-- What a rule (or the whole site) saves its matches into — the read behind
-- "Saves matches as: Parked · 4,812 keywords · as of 2 hours ago".
CREATE OR REPLACE FUNCTION seo.gsc_dig_rule_stamps(p_site_id uuid, p_rule_id uuid DEFAULT NULL)
RETURNS TABLE(matcher_id uuid, rule_id uuid, rule_name text, dimension_id uuid,
              dimension text, dimension_label text, value_id uuid, value text,
              value_label text, enabled boolean, last_evaluated_at timestamptz,
              match_count integer, stamp_count bigint, as_of timestamptz)
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
         (SELECT max(kf.as_of) FROM seo.keyword_facet kf
           WHERE kf.matcher_id = dm.id AND kf.deleted_at IS NULL)
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

-- ────────────────────────────────────────────────────────────────────────────
-- 4. THE ENGINE, situational half — condition matchers → stamps
-- ────────────────────────────────────────────────────────────────────────────

-- Deterministic and idempotent. For each condition matcher: run the rule
-- through the SAME `gsc_perf_dig` the Dig Here tab and its editor preview use
-- (its own base filters, class/level pin, sort and row limit), over ONE window,
-- and reconcile the stamps to the result.
--
-- 🚨 BOUNDED BY CONSTRUCTION: only the keywords the window returns are ever
-- touched, and only the stamps this matcher itself wrote are ever removed.
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
  v_stamped int;
  v_removed int;
  v_total_stamped int := 0;
  v_total_removed int := 0;
  v_results jsonb := '[]'::jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;

  -- The site's current window: the 28 days ending on the most recent day
  -- Google has given us, compared against the 28 before it. A situational
  -- stamp with no window behind it would be a present-tense claim about
  -- nothing (THE TRUE CURRENT STATUS law).
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
      -- The rule behind this matcher is gone. Say so instead of silently
      -- leaving stale stamps standing as if they were still derived.
      v_results := v_results || jsonb_build_object(
        'matcher_id', v_m.id, 'value', v_m.value_label, 'error', 'rule_missing');
      CONTINUE;
    END IF;

    TRUNCATE _cond_hit;
    -- The compare window always travels: a rule whose conditions or sort need
    -- it gets it, and one that does not is unaffected by its presence.
    INSERT INTO _cond_hit
    SELECT DISTINCT d.keyword_id
    FROM seo.gsc_perf_dig(
           p_site_id, v_rule.dimension, v_start, v_end, v_cmp_start, v_cmp_end,
           v_rule.conditions, v_rule.base_filters, v_rule.sort_metric,
           v_rule.sort_dir, v_rule.row_limit, v_rule.traffic_class, v_rule.level) d
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

    -- No longer matching ⇒ the stamp goes. Human-pinned stamps stay (P20).
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
      'matched', v_found, 'stamped', v_stamped, 'removed', v_removed);
  END LOOP;

  RETURN jsonb_build_object(
    'window', jsonb_build_object('start', v_start, 'end', v_end,
                                 'compare_start', v_cmp_start, 'compare_end', v_cmp_end),
    'matchers', jsonb_array_length(v_results),
    'stamped', v_total_stamped, 'removed', v_total_removed,
    'evaluated_at', now(), 'results', v_results);
END;
$function$;

REVOKE ALL ON FUNCTION seo.fn_evaluate_condition_matchers(uuid, uuid[], uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION seo.fn_evaluate_condition_matchers(uuid, uuid[], uuid, date, date) TO authenticated, service_role;

-- ────────────────────────────────────────────────────────────────────────────
-- 5. The text-matcher engine must not sweep away condition stamps
-- ────────────────────────────────────────────────────────────────────────────
-- `fn_evaluate_matchers` skips kind 'condition' when it builds its desired
-- set, so without this guard its removal pass would delete every condition
-- stamp in scope as "no longer matching". Two engines, two territories.
CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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
      -- C5: a condition matcher's stamps belong to the situational engine.
      -- This pass never built them, so it may never take them away.
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

-- ────────────────────────────────────────────────────────────────────────────
-- 6. AS-OF SURFACES: no situational stamp renders without its time
-- ────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS seo.gsc_effective_stamps(uuid, uuid[]);

CREATE OR REPLACE FUNCTION seo.gsc_effective_stamps(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS TABLE(keyword_id uuid, dimension text, dimension_label text, value text, value_label text,
              value_id uuid, source text, pinned boolean, site_scoped boolean,
              nature text, as_of timestamptz)
LANGUAGE sql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $$
  WITH st AS (
    SELECT kf.keyword_id, cd.slug AS dim_slug, cd.name AS dim_label, cv.parent_id AS dim_id,
           COALESCE(cv.metadata->>'value', split_part(cv.slug,':',2)) AS val, cv.name AS val_label, cv.id AS val_id,
           kf.source, kf.pinned, kf.site_id IS NOT NULL AS site_scoped,
           COALESCE(cd.metadata->>'nature','intrinsic') AS nature, kf.as_of,
           COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card,
           CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'import' THEN 2 WHEN 'matcher' THEN 3 WHEN 'rule' THEN 3 WHEN 'pack' THEN 3 WHEN 'classifier' THEN 5 ELSE 6 END END
             + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
    FROM seo.keyword_facet kf
    JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
      AND (p_keyword_ids IS NULL OR kf.keyword_id = ANY(p_keyword_ids))
  ),
  ranked AS (SELECT s.*, row_number() OVER (PARTITION BY s.keyword_id, s.dim_id ORDER BY s.prio, s.val_id) AS rn FROM st s)
  SELECT r.keyword_id, r.dim_slug, r.dim_label, r.val, r.val_label, r.val_id, r.source, r.pinned,
         r.site_scoped, r.nature, r.as_of
  FROM ranked r WHERE (NOT r.single_card) OR r.rn = 1;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_effective_stamps(uuid, uuid[]) TO PUBLIC;

-- gsc_stamp_keyword_set reads it by name; recreated so the pair always ship
-- together and a future reader never has to guess which one moved.
CREATE OR REPLACE FUNCTION seo.gsc_stamp_keyword_set(p_site_id uuid, p_stamps jsonb)
RETURNS TABLE(kw_id uuid)
LANGUAGE sql STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $$
  WITH want AS (
    SELECT DISTINCT NULLIF(btrim(e->>'dimension'),'') AS dim, NULLIF(btrim(e->>'value'),'') AS val
    FROM jsonb_array_elements(COALESCE(p_stamps,'[]'::jsonb)) e
  ),
  want_ok AS (SELECT * FROM want WHERE dim IS NOT NULL AND val IS NOT NULL),
  n AS (SELECT count(*) AS c FROM want_ok),
  have AS (
    SELECT es.keyword_id, es.dimension, es.value
    FROM seo.gsc_effective_stamps(p_site_id, NULL) es
    JOIN want_ok w ON w.dim = es.dimension AND w.val = es.value
  )
  SELECT h.keyword_id FROM have h, n GROUP BY h.keyword_id, n.c HAVING count(DISTINCT h.dimension||':'||h.value) = n.c AND n.c > 0;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_stamp_keyword_set(uuid, jsonb) TO PUBLIC;

-- The receipt carries the as-of and the nature of every stamp step, so a
-- situational contribution can never read as a permanent fact about the word.
CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH RECURSIVE
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk WHERE sk.kw_id IS NOT NULL
),
bands AS (
  SELECT sv.value, (sv.config->>'min_score')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL AND sv.config ? 'min_score'
  UNION ALL
  SELECT c.slug, (c.metadata->>'min_score')::numeric
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band' AND sv2.active
        AND sv2.deleted_at IS NULL AND sv2.config ? 'min_score')
),
floor_band AS (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.name AS topic_name, COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value' OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL ORDER BY l.kw_id, l.depth DESC
),
worth AS MATERIALIZED (
  SELECT w.value_id, w.effect, w.amount, w.notes
  FROM seo.site_value_worth w WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
),
stamps AS MATERIALIZED (
  SELECT kf.keyword_id AS kw_id, kf.category_id AS value_id, cv.parent_id AS dim_id,
         cd.slug AS dim_slug, cd.name AS dim_label,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS value_key, cv.name AS value_label,
         kf.source, kf.matcher_id, kf.site_id, kf.pinned, kf.as_of,
         COALESCE(cd.metadata->>'nature','intrinsic') AS nature,
         COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card,
         CASE WHEN kf.pinned THEN 0 ELSE CASE kf.source WHEN 'human' THEN 1 WHEN 'matcher' THEN 3 WHEN 'pack' THEN 3 WHEN 'rule' THEN 3 WHEN 'import' THEN 3 WHEN 'classifier' THEN 5 ELSE 6 END END
           + CASE WHEN kf.site_id IS NULL THEN 1 ELSE 0 END AS prio
  FROM seo.keyword_facet kf
  JOIN site_keywords sk ON sk.kw_id = kf.keyword_id
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
),
effective_stamps AS (
  SELECT s.* FROM (
    SELECT s.*, row_number() OVER (PARTITION BY s.kw_id, s.dim_id ORDER BY s.prio, s.value_id) AS rn
    FROM stamps s
  ) s WHERE (NOT s.single_card) OR s.rn = 1
),
contrib AS (
  SELECT es.kw_id, es.value_id, es.dim_slug, es.dim_label, es.value_key, es.value_label,
         es.source, es.matcher_id, es.nature, es.as_of, w.effect, w.amount, w.notes
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(jsonb_build_object(
           'kind','stamp','dimension',c.dim_slug,'dimension_label',c.dim_label,
           'value',c.value_key,'value_label',c.value_label,'value_id',c.value_id,
           'effect',c.effect,'amount',c.amount,'source',c.source,'matcher_id',c.matcher_id,
           'nature',c.nature,'as_of',c.as_of,'notes',c.notes)
           ORDER BY CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END, c.dim_slug, c.value_key) AS stamp_reasons
  FROM contrib c GROUP BY c.kw_id
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    COALESCE(tb.base_weight, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(10, GREATEST(0.01, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN topic_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN root_kind rk ON rk.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.is_never THEN 0
       WHEN s.adds_total <= 0 THEN NULL
       ELSE round(s.adds_total * s.factor_total, 1) END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.is_never THEN 'negative'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.adds_total * s.factor_total, 1) ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN s.is_never THEN 'computed'
       WHEN s.adds_total <= 0 THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override','level',o.value_tier))
       ELSE
         jsonb_build_array(jsonb_build_object('kind','summary','adds',round(s.adds_total,1),'factor',round(s.factor_total,4),
                                              'n_factors',s.n_factors,'never',s.is_never,
                                              'score', CASE WHEN s.is_never THEN 0 WHEN s.adds_total <= 0 THEN NULL ELSE round(s.adds_total * s.factor_total,1) END))
         || CASE WHEN s.has_topic THEN jsonb_build_array(jsonb_build_object(
              'kind','topic','topic',s.topic_name,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || CASE WHEN NOT s.has_topic AND s.adds_total <= 0 AND NOT s.is_never AND jsonb_array_length(s.stamp_reasons) > 0
              THEN jsonb_build_array(jsonb_build_object('kind','no_base','pending_base',true)) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

COMMIT;

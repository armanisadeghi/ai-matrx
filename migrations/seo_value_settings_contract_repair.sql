-- KI-046 contract repair — the settings ladder and the value resolver speak
-- one level shape and one score scale.
--
-- The first production save was rejected with gsc_vocab_missing_negative.
-- The guard was correct; value_settings_scope had filtered the reserved
-- negative row out because it intentionally has no min_score. The compact
-- ladder payload ({value,label,min_score}) was then passed unchanged to the
-- vocabulary predicate/site writer, which consume {config:{min_score}}. Even
-- after restoring negative, live platform thresholds 140/200 would have hit
-- the predicate's obsolete pre-baseline 0-100 ceiling. Finally, the terminal
-- resolver still read site-or-platform directly, bypassing org/brand levels.
--
-- Keep the public RPC signatures stable. Normalize only inside the ONE write
-- path, keep negative as a threshold-less guard, allow the non-negative score
-- scale introduced by KI-048, and make the resolver consume fn_value_levels.

CREATE OR REPLACE FUNCTION seo.gsc_assert_vocabulary_coherent(p_kind text, p_rows jsonb)
RETURNS void
LANGUAGE plpgsql STABLE
SET search_path = seo, pg_temp
AS $fn$
DECLARE
  r jsonb;
  v text;
  n int;
  ms numeric;
BEGIN
  IF p_kind NOT IN ('value_band','geo_band') THEN
    RAISE EXCEPTION 'gsc_bad_vocab_kind: %', p_kind;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'gsc_vocab_bad_payload: expected an array of rows';
  END IF;

  n := jsonb_array_length(p_rows);
  IF n < 2 THEN
    RAISE EXCEPTION 'gsc_vocab_too_few: a vocabulary needs at least 2 entries (got %)', n;
  END IF;

  FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e LOOP
    v := btrim(COALESCE(r->>'value', ''));
    IF v = '' THEN
      RAISE EXCEPTION 'gsc_vocab_blank_value: every entry needs an identity';
    END IF;
    IF v !~ '^[a-z0-9][a-z0-9_]*$' THEN
      RAISE EXCEPTION 'gsc_vocab_bad_value: "%" must be lowercase letters, digits and underscores', v;
    END IF;
    IF v = 'unvalued' THEN
      RAISE EXCEPTION 'gsc_vocab_reserved_value: "unvalued" is reserved — it is what the resolver says when no meaning reaches a keyword, so it can never be a band you assign';
    END IF;
    IF btrim(COALESCE(r->>'label','')) = '' THEN
      RAISE EXCEPTION 'gsc_vocab_blank_label: "%" needs a name — the name is what every keyword is labelled with', v;
    END IF;
  END LOOP;

  IF (SELECT count(DISTINCT btrim(e->>'value')) FROM jsonb_array_elements(p_rows) e) <> n THEN
    RAISE EXCEPTION 'gsc_vocab_duplicate_value: two entries share the same identity';
  END IF;
  IF (SELECT count(DISTINCT lower(btrim(e->>'label'))) FROM jsonb_array_elements(p_rows) e) <> n THEN
    RAISE EXCEPTION 'gsc_vocab_duplicate_label: two entries share the same name — every band must be tellable apart';
  END IF;

  IF p_kind = 'value_band' THEN
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e WHERE e->>'value' = 'negative') THEN
      RAISE EXCEPTION 'gsc_vocab_missing_negative: the reserved "negative" band must stay — the resolver emits it for excluded geo, not-offered services and actively-avoided topics. You may rename it, never remove it';
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
               WHERE e->>'value' = 'negative' AND (e->'config') ? 'min_score') THEN
      RAISE EXCEPTION 'gsc_vocab_negative_threshold: the negative band is a guard, not a score range — it carries no threshold';
    END IF;

    FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e WHERE e->>'value' <> 'negative' LOOP
      IF NOT ((r->'config') ? 'min_score') THEN
        RAISE EXCEPTION 'gsc_vocab_missing_threshold: "%" needs a minimum score', r->>'label';
      END IF;
      BEGIN
        ms := (r->'config'->>'min_score')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'gsc_vocab_bad_threshold: "%" has a minimum score that is not a number', r->>'label';
      END;
      IF ms < 0 THEN
        RAISE EXCEPTION 'gsc_vocab_threshold_range: "%" is at %, but scores cannot be below 0', r->>'label', ms;
      END IF;
    END LOOP;

    IF (SELECT count(DISTINCT (e->'config'->>'min_score')::numeric)
        FROM jsonb_array_elements(p_rows) e WHERE e->>'value' <> 'negative') <> n - 1 THEN
      RAISE EXCEPTION 'gsc_vocab_duplicate_threshold: two bands start at the same score — a score would land in both';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) e
                   WHERE e->>'value' <> 'negative' AND (e->'config'->>'min_score')::numeric = 0) THEN
      RAISE EXCEPTION 'gsc_vocab_no_floor: one band must start at 0, or the lowest-scoring keywords land in no band at all';
    END IF;
  ELSE
    FOR r IN SELECT e FROM jsonb_array_elements(p_rows) e LOOP
      IF NOT ((r->'config') ? 'multiplier') THEN
        RAISE EXCEPTION 'gsc_vocab_missing_multiplier: "%" needs a multiplier', r->>'label';
      END IF;
      BEGIN
        ms := (r->'config'->>'multiplier')::numeric;
      EXCEPTION WHEN others THEN
        RAISE EXCEPTION 'gsc_vocab_bad_multiplier: "%" has a multiplier that is not a number', r->>'label';
      END;
      IF ms < 0 OR ms > 10 THEN
        RAISE EXCEPTION 'gsc_vocab_multiplier_range: "%" is x%, but multipliers run 0-10', r->>'label', ms;
      END IF;
    END LOOP;
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.fn_value_levels(p_site_id uuid)
RETURNS TABLE (value text, label text, min_score numeric, source_scope text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
WITH site_rows AS (
  SELECT sv.value, COALESCE(sv.label, initcap(replace(sv.value,'_',' '))) AS label,
         NULLIF(sv.config->>'min_score','')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL
),
brand_rows AS (
  SELECT e->>'value' AS value,
         COALESCE(e->>'label', initcap(replace(e->>'value','_',' '))) AS label,
         NULLIF(e->>'min_score','')::numeric AS min_score
  FROM web.site s
  JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.settings->'keyword_value'->'levels','[]'::jsonb)) e
  WHERE s.id = p_site_id AND s.deleted_at IS NULL
),
org_rows AS (
  SELECT e->>'value' AS value,
         COALESCE(e->>'label', initcap(replace(e->>'value','_',' '))) AS label,
         NULLIF(e->>'min_score','')::numeric AS min_score
  FROM web.site s
  JOIN iam.organizations o ON o.id = s.organization_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.settings->'keyword_value'->'levels','[]'::jsonb)) e
  WHERE s.id = p_site_id AND s.deleted_at IS NULL
),
platform_rows AS (
  SELECT c.slug AS value, c.name AS label,
         NULLIF(c.metadata->>'min_score','')::numeric AS min_score
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL
)
SELECT value, label, min_score, 'site'     FROM site_rows
UNION ALL
SELECT value, label, min_score, 'brand'    FROM brand_rows    WHERE NOT EXISTS (SELECT 1 FROM site_rows)
UNION ALL
SELECT value, label, min_score, 'org'      FROM org_rows      WHERE NOT EXISTS (SELECT 1 FROM site_rows)
                                                                AND NOT EXISTS (SELECT 1 FROM brand_rows)
UNION ALL
SELECT value, label, min_score, 'platform' FROM platform_rows WHERE NOT EXISTS (SELECT 1 FROM site_rows)
                                                                AND NOT EXISTS (SELECT 1 FROM brand_rows)
                                                                AND NOT EXISTS (SELECT 1 FROM org_rows);
$fn$;

CREATE OR REPLACE FUNCTION seo.value_settings_scope(p_scope text, p_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_own_baseline   numeric;
  v_own_levels     jsonb;
  v_label          text;
  v_parent         jsonb;
  v_inh_baseline   numeric;
  v_inh_levels     jsonb;
  v_may_edit       boolean := seo.fn_value_settings_may_edit(p_scope, p_id);
  v_sites          int := 0;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_settings_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_settings_id_required: % needs an id', p_scope;
  END IF;
  IF NOT v_may_edit AND NOT (
       (p_scope = 'site'  AND seo.fn_is_site_editor(p_id))
    OR (p_scope = 'org'   AND iam.has_org_access(p_id))
    OR (p_scope = 'brand' AND iam.has_org_access((SELECT b.organization_id FROM web.brand b WHERE b.id = p_id)))
    OR (p_scope = 'platform')) THEN
    RAISE EXCEPTION 'seo_settings_denied: no access to these settings' USING ERRCODE = '42501';
  END IF;

  IF p_scope = 'platform' THEN
    v_label := 'Platform defaults';
    v_own_baseline := (SELECT NULLIF(k.value #>> '{}','')::numeric FROM platform.feature_knob k
                        WHERE k.feature='seo.keyword_value' AND k.key='baseline_score');
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object(
                                      'value', c.slug, 'label', c.name,
                                      'min_score', NULLIF(c.metadata->>'min_score','')::numeric)
                                      ORDER BY NULLIF(c.metadata->>'min_score','')::numeric DESC NULLS LAST)
                       FROM platform.categories c
                      WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL);
    v_sites := (SELECT count(*) FROM web.site s WHERE s.deleted_at IS NULL);

  ELSIF p_scope = 'org' THEN
    SELECT o.name, NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric,
           o.settings->'keyword_value'->'levels'
      INTO v_label, v_own_baseline, v_own_levels
      FROM iam.organizations o WHERE o.id = p_id;
    v_parent := jsonb_build_object('scope','platform','label','Platform defaults');
    v_sites := (SELECT count(*) FROM web.site s WHERE s.organization_id = p_id AND s.deleted_at IS NULL);

  ELSIF p_scope = 'brand' THEN
    SELECT b.name, NULLIF(b.settings->'keyword_value'->>'baseline','')::numeric,
           b.settings->'keyword_value'->'levels'
      INTO v_label, v_own_baseline, v_own_levels
      FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    v_parent := (SELECT jsonb_build_object('scope','org','id',o.id,'label',o.name)
                   FROM web.brand b JOIN iam.organizations o ON o.id = b.organization_id WHERE b.id = p_id);
    v_sites := (SELECT count(*) FROM web.site s WHERE s.brand_id = p_id AND s.deleted_at IS NULL);

  ELSE
    SELECT COALESCE(s.name, s.domain), NULLIF(s.settings->'keyword_value'->>'baseline','')::numeric
      INTO v_label, v_own_baseline
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object(
                                'value', sv.value,
                                'label', COALESCE(sv.label, initcap(replace(sv.value,'_',' '))),
                                'min_score', NULLIF(sv.config->>'min_score','')::numeric)
                              ORDER BY NULLIF(sv.config->>'min_score','')::numeric DESC NULLS LAST)
                       FROM seo.site_vocabulary sv
                      WHERE sv.site_id = p_id AND sv.vocab_kind='value_band' AND sv.active
                        AND sv.deleted_at IS NULL);
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id = s.brand_id WHERE s.id = p_id);
    v_sites := 1;
  END IF;

  -- Inherited means the answer strictly ABOVE this rung. It must never include
  -- the site's own value merely because fn_value_baseline/levels are effective.
  IF p_scope = 'site' THEN
    SELECT COALESCE(
             NULLIF(b.settings->'keyword_value'->>'baseline','')::numeric,
             NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric),
           COALESCE(
             NULLIF(b.settings->'keyword_value'->'levels','[]'::jsonb),
             NULLIF(o.settings->'keyword_value'->'levels','[]'::jsonb))
      INTO v_inh_baseline, v_inh_levels
      FROM web.site s
      LEFT JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
      JOIN iam.organizations o ON o.id = s.organization_id
     WHERE s.id = p_id AND s.deleted_at IS NULL;
  ELSIF p_scope = 'brand' THEN
    SELECT NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric,
           o.settings->'keyword_value'->'levels'
      INTO v_inh_baseline, v_inh_levels
      FROM web.brand b JOIN iam.organizations o ON o.id = b.organization_id WHERE b.id = p_id;
  ELSIF p_scope = 'org' THEN
    v_inh_baseline := NULL;
    v_inh_levels := NULL;
  END IF;

  IF v_inh_baseline IS NULL AND p_scope <> 'platform' THEN
    v_inh_baseline := (SELECT NULLIF(k.value #>> '{}','')::numeric FROM platform.feature_knob k
                        WHERE k.feature='seo.keyword_value' AND k.key='baseline_score');
  END IF;
  IF v_inh_levels IS NULL AND p_scope <> 'platform' THEN
    v_inh_levels := (SELECT jsonb_agg(jsonb_build_object(
                                     'value', c.slug, 'label', c.name,
                                     'min_score', NULLIF(c.metadata->>'min_score','')::numeric,
                                     'source','platform')
                                     ORDER BY NULLIF(c.metadata->>'min_score','')::numeric DESC NULLS LAST)
                      FROM platform.categories c
                     WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL);
  END IF;

  RETURN jsonb_build_object(
    'scope', p_scope, 'id', p_id, 'label', v_label,
    'may_edit', v_may_edit,
    'parent', v_parent,
    'sites_affected', v_sites,
    'own', jsonb_build_object('baseline', v_own_baseline, 'levels', v_own_levels),
    'inherited', jsonb_build_object('baseline', v_inh_baseline, 'levels', v_inh_levels),
    'effective', jsonb_build_object(
      'baseline', COALESCE(v_own_baseline, v_inh_baseline),
      'levels', COALESCE(NULLIF(v_own_levels,'[]'::jsonb), v_inh_levels)));
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.set_value_settings(
  p_scope text,
  p_id uuid DEFAULT NULL,
  p_baseline numeric DEFAULT NULL,
  p_levels jsonb DEFAULT NULL,
  p_clear text[] DEFAULT '{}'
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_kv           jsonb;
  v_vocab_levels jsonb;
  e              jsonb;
BEGIN
  IF p_scope NOT IN ('platform','org','brand','site') THEN
    RAISE EXCEPTION 'seo_settings_bad_scope: scope must be platform, org, brand or site (got %)', COALESCE(p_scope,'null');
  END IF;
  IF p_scope <> 'platform' AND p_id IS NULL THEN
    RAISE EXCEPTION 'seo_settings_id_required: % needs an id', p_scope;
  END IF;
  IF NOT seo.fn_value_settings_may_edit(p_scope, p_id) THEN
    RAISE EXCEPTION 'seo_settings_denied: you do not have permission to change these settings'
      USING ERRCODE = '42501';
  END IF;
  IF p_baseline IS NOT NULL AND (p_baseline < 0 OR p_baseline > 100000) THEN
    RAISE EXCEPTION 'seo_settings_bad_baseline: a baseline is between 0 and 100000 (got %)', p_baseline;
  END IF;

  IF p_levels IS NOT NULL THEN
    IF jsonb_typeof(p_levels) <> 'array' THEN
      RAISE EXCEPTION 'seo_settings_bad_levels: levels must be a list';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
      IF NULLIF(btrim(COALESCE(e->>'value','')),'') IS NULL THEN
        RAISE EXCEPTION 'seo_settings_level_needs_value: every level needs an identity';
      END IF;
      IF e->>'value' = 'negative' THEN
        IF NULLIF(btrim(COALESCE(e->>'min_score','')),'') IS NOT NULL THEN
          RAISE EXCEPTION 'gsc_vocab_negative_threshold: the negative band is a guard, not a score range — it carries no threshold';
        END IF;
      ELSIF (e->>'min_score') IS NULL OR (e->>'min_score') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'seo_settings_level_needs_score: level "%" needs a number to start at', e->>'value';
      END IF;
    END LOOP;

    SELECT jsonb_agg(jsonb_build_object(
             'value', e->>'value',
             'label', e->>'label',
             'description', NULL,
             'sort', ord - 1,
             'config', CASE WHEN e->>'value' = 'negative' THEN '{}'::jsonb
                            ELSE jsonb_build_object('min_score', (e->>'min_score')::numeric) END)
             ORDER BY ord)
      INTO v_vocab_levels
      FROM jsonb_array_elements(p_levels) WITH ORDINALITY AS rows(e, ord);
    PERFORM seo.gsc_assert_vocabulary_coherent('value_band', v_vocab_levels);
  END IF;

  IF p_scope = 'platform' THEN
    IF p_baseline IS NOT NULL THEN
      UPDATE platform.feature_knob SET value = to_jsonb(p_baseline), updated_at = now(),
             updated_by = (SELECT auth.uid()), set_by = 'human'
       WHERE feature='seo.keyword_value' AND key='baseline_score';
    END IF;
    IF p_levels IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_levels) incoming
        WHERE NOT EXISTS (
          SELECT 1 FROM platform.categories c
          WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL
            AND c.slug = incoming->>'value'))
      OR EXISTS (
        SELECT 1 FROM platform.categories c
        WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL
          AND NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_levels) incoming
            WHERE incoming->>'value' = c.slug)) THEN
        RAISE EXCEPTION 'seo_settings_platform_identities_fixed: add or retire platform level identities in the vocabulary registry; this screen changes their names and thresholds';
      END IF;
      FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
        UPDATE platform.categories c
           SET metadata = CASE WHEN e->>'value' = 'negative'
                               THEN COALESCE(c.metadata,'{}'::jsonb) - 'min_score'
                               ELSE COALESCE(c.metadata,'{}'::jsonb)
                                    || jsonb_build_object('min_score', (e->>'min_score')::numeric) END,
               name = COALESCE(NULLIF(btrim(COALESCE(e->>'label','')),''), c.name),
               updated_at = now()
         WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL AND c.slug = e->>'value';
      END LOOP;
    END IF;
    IF 'baseline' = ANY(p_clear) OR 'levels' = ANY(p_clear) THEN
      RAISE EXCEPTION 'seo_settings_platform_is_the_floor: the platform tier has nothing above it to inherit from — change the values instead of clearing them';
    END IF;

  ELSIF p_scope IN ('org','brand') THEN
    IF p_scope = 'org' THEN
      SELECT COALESCE(o.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM iam.organizations o WHERE o.id = p_id;
    ELSE
      SELECT COALESCE(b.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM web.brand b WHERE b.id = p_id AND b.deleted_at IS NULL;
    END IF;
    IF v_kv IS NULL THEN
      RAISE EXCEPTION 'seo_settings_scope_not_found: no % with id %', p_scope, p_id USING ERRCODE = 'P0002';
    END IF;
    IF p_baseline IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('baseline', p_baseline); END IF;
    IF p_levels   IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('levels', p_levels); END IF;
    IF 'baseline' = ANY(p_clear) THEN v_kv := v_kv - 'baseline'; END IF;
    IF 'levels'   = ANY(p_clear) THEN v_kv := v_kv - 'levels';   END IF;

    IF p_scope = 'org' THEN
      UPDATE iam.organizations o
         SET settings = CASE WHEN v_kv = '{}'::jsonb
                             THEN COALESCE(o.settings,'{}'::jsonb) - 'keyword_value'
                             ELSE COALESCE(o.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END
       WHERE o.id = p_id;
    ELSE
      UPDATE web.brand b
         SET settings = CASE WHEN v_kv = '{}'::jsonb
                             THEN COALESCE(b.settings,'{}'::jsonb) - 'keyword_value'
                             ELSE COALESCE(b.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END,
             updated_at = now(), updated_by = (SELECT auth.uid())
       WHERE b.id = p_id AND b.deleted_at IS NULL;
    END IF;

  ELSE
    SELECT COALESCE(s.settings->'keyword_value','{}'::jsonb) INTO v_kv FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    IF v_kv IS NULL THEN
      RAISE EXCEPTION 'gsc_site_not_found: %', p_id USING ERRCODE = 'P0002';
    END IF;
    IF p_baseline IS NOT NULL THEN v_kv := v_kv || jsonb_build_object('baseline', p_baseline); END IF;
    IF 'baseline' = ANY(p_clear) THEN v_kv := v_kv - 'baseline'; END IF;
    UPDATE web.site s
       SET settings = CASE WHEN v_kv = '{}'::jsonb
                           THEN COALESCE(s.settings,'{}'::jsonb) - 'keyword_value'
                           ELSE COALESCE(s.settings,'{}'::jsonb) || jsonb_build_object('keyword_value', v_kv) END,
           updated_at = now(), updated_by = (SELECT auth.uid())
     WHERE s.id = p_id AND s.deleted_at IS NULL;

    IF p_levels IS NOT NULL THEN
      PERFORM seo.gsc_save_value_vocabulary(p_id, 'value_band', v_vocab_levels, '{}'::jsonb);
    END IF;
    IF 'levels' = ANY(p_clear) THEN
      PERFORM seo.gsc_reset_value_vocabulary(p_id, 'value_band', '{}'::jsonb);
    END IF;
  END IF;

  RETURN seo.value_settings_scope(p_scope, p_id);
END;
$fn$;

-- This is the live KI-048 resolver body with only the bands CTE changed. Read
-- the current definition before updating this migration; do not rebuild it
-- from older resolver migrations.
CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
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
bands AS MATERIALIZED (
  SELECT l.value, l.min_score
  FROM seo.fn_value_levels(p_site_id) l
  WHERE l.min_score IS NOT NULL
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
    l.kw_id, tp.id AS topic_id, tp.name AS topic_name, COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value' OR stv.offering_match IN ('not_offered','actively_avoided')) AS negative_guard
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
effective_stamps AS MATERIALIZED (
  SELECT es.* FROM seo.fn_effective_stamps(
    p_site_id, (SELECT array_agg(sk.kw_id) FROM site_keywords sk)) es
),
combos AS MATERIALIZED (
  SELECT c.id, c.value_ids, c.effect, c.amount, c.label, c.notes,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'value_id', cv.id, 'dimension', cd.slug, 'dimension_label', cd.name,
                    'value', COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
                    'value_label', cv.name)
                  ORDER BY cd.slug, cv.slug)
           FROM platform.categories cv
           JOIN platform.categories cd ON cd.id = cv.parent_id
           WHERE cv.id = ANY (c.value_ids)), '[]'::jsonb) AS values_json
  FROM seo.site_value_combo c
  WHERE c.site_id = p_site_id AND c.deleted_at IS NULL AND c.enabled
),
combo_hits AS (
  SELECT es.kw_id, cb.id AS combo_id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json
  FROM combos cb
  JOIN effective_stamps es ON es.value_id = ANY (cb.value_ids)
  GROUP BY es.kw_id, cb.id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json, cb.value_ids
  HAVING count(DISTINCT es.value_id) = cardinality(cb.value_ids)
),
contrib AS (
  SELECT es.kw_id, w.effect, w.amount, 0 AS kind_rank,
         es.dim_slug AS sort_a, es.value_key AS sort_b,
         jsonb_build_object(
           'kind','stamp','dimension',es.dim_slug,'dimension_label',es.dim_label,
           'value',es.value_key,'value_label',es.value_label,'value_id',es.value_id,
           'effect',w.effect,'amount',w.amount,'source',es.source,'matcher_id',es.matcher_id,
           'nature',es.nature,'as_of',es.as_of,'notes',w.notes) AS reason
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
  UNION ALL
  SELECT ch.kw_id, ch.effect, ch.amount, 1 AS kind_rank,
         COALESCE(ch.label,'') AS sort_a, ch.combo_id::text AS sort_b,
         jsonb_build_object(
           'kind','combo','combo_id',ch.combo_id,'label',ch.label,'values',ch.values_json,
           'effect',ch.effect,'amount',ch.amount,'notes',ch.notes) AS reason
  FROM combo_hits ch
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(c.reason ORDER BY
           CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END,
           c.kind_rank, c.sort_a, c.sort_b) AS stamp_reasons
  FROM contrib c GROUP BY c.kw_id
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
baseline AS (SELECT seo.fn_value_baseline(p_site_id) AS v),
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    (tb.kw_id IS NOT NULL OR pk.kw_id IS NOT NULL) AS has_meaning,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    (SELECT v FROM baseline) AS baseline,
    COALESCE(tb.base_weight, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(5, GREATEST(0.05, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.topic_id, tb.topic_name, tb.base_weight, tb.negative_guard, rk.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN topic_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN root_kind rk ON rk.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
),
final AS (
  SELECT s.*, GREATEST(0, round((s.baseline + s.adds_total) * s.factor_total, 1)) AS raw_score
  FROM scored s
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN s.is_never THEN 0
       WHEN NOT s.has_meaning THEN NULL
       ELSE s.raw_score END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN s.is_never THEN 'negative'
       WHEN NOT s.has_meaning THEN 'unvalued'
       WHEN s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= s.raw_score ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT s.has_meaning AND NOT s.is_never THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override','level',o.value_tier))
       ELSE
         jsonb_build_array(jsonb_build_object(
           'kind','summary',
           'baseline', s.baseline,
           'adds', round(s.adds_total, 1),
           'total_before_factor', round(s.baseline + s.adds_total, 1),
           'factor', round(s.factor_total, 4),
           'n_factors', s.n_factors,
           'never', s.is_never,
           'has_meaning', s.has_meaning,
           'score', CASE WHEN s.is_never THEN 0 WHEN NOT s.has_meaning THEN NULL ELSE s.raw_score END))
         || CASE WHEN s.has_meaning
              THEN jsonb_build_array(jsonb_build_object('kind','baseline','amount',s.baseline))
              ELSE '[]'::jsonb END
         || CASE WHEN s.has_topic THEN jsonb_build_array(jsonb_build_object(
              'kind','topic','topic',s.topic_name,'topic_id',s.topic_id,'weight',s.base_weight,'effect','add','amount',s.base_weight,
              'root',s.root_type,'negative_guard',COALESCE(s.negative_guard,false))) ELSE '[]'::jsonb END
         || s.stamp_reasons
  END AS reasons
FROM final s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$fn$;

REVOKE ALL ON FUNCTION seo.fn_value_levels(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_value_levels(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.value_settings_scope(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.value_settings_scope(text, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.set_value_settings(text, uuid, numeric, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.set_value_settings(text, uuid, numeric, jsonb, text[]) TO authenticated, service_role;

-- KI-046 / KI-029 — THE SETTINGS LADDER: platform -> organization -> brand -> site.
--
-- Arman, 2026-08-25: "the numbers come from the brand, but then the brand, if it
-- doesn't have it, gets them from the org, and if the org doesn't have it, it
-- comes from [the system]. So let me set the system and the origin of the
-- brands, but you've gotta give me those UIs first."
--
-- Two numbers ladder: the SCORE BASELINE and the LEVEL THRESHOLDS. Nearest scope
-- that has an answer wins; a scope that says nothing inherits and is never
-- overwritten by a tier above it.
--
-- Storage reuses what already exists — no new tables:
--   platform  baseline platform.feature_knob('seo.keyword_value','baseline_score')
--             levels   platform.categories dimension 'seo_value_band' (metadata.min_score)
--   org       iam.organizations.settings -> 'keyword_value'
--   brand     web.brand.settings          -> 'keyword_value'
--   site      baseline web.site.settings  -> 'keyword_value'
--             levels   seo.site_vocabulary (the live per-site editor keeps its home)
--
-- Coherence is enforced by the ONE existing predicate
-- seo.gsc_assert_vocabulary_coherent at every tier, so a level set that would be
-- nonsense is refused the same way wherever it is written.

-- ── the effective LEVELS for a site, with the tier they came from ────────────
CREATE OR REPLACE FUNCTION seo.fn_value_levels(p_site_id uuid)
RETURNS TABLE (value text, label text, min_score numeric, source_scope text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
WITH site_rows AS (
  SELECT sv.value, COALESCE(sv.label, initcap(replace(sv.value,'_',' '))) AS label,
         (sv.config->>'min_score')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL AND sv.config ? 'min_score'
),
brand_rows AS (
  SELECT e->>'value' AS value,
         COALESCE(e->>'label', initcap(replace(e->>'value','_',' '))) AS label,
         (e->>'min_score')::numeric AS min_score
  FROM web.site s
  JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(b.settings->'keyword_value'->'levels','[]'::jsonb)) e
  WHERE s.id = p_site_id AND s.deleted_at IS NULL
),
org_rows AS (
  SELECT e->>'value' AS value,
         COALESCE(e->>'label', initcap(replace(e->>'value','_',' '))) AS label,
         (e->>'min_score')::numeric AS min_score
  FROM web.site s
  JOIN iam.organizations o ON o.id = s.organization_id
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.settings->'keyword_value'->'levels','[]'::jsonb)) e
  WHERE s.id = p_site_id AND s.deleted_at IS NULL
),
platform_rows AS (
  SELECT c.slug AS value, c.name AS label, (c.metadata->>'min_score')::numeric AS min_score
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'
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

REVOKE ALL ON FUNCTION seo.fn_value_levels(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_value_levels(uuid) TO authenticated, service_role;

-- ── the effective BASELINE for a site: site -> brand -> org -> platform ──────
CREATE OR REPLACE FUNCTION seo.fn_value_baseline(p_site_id uuid)
RETURNS numeric
LANGUAGE sql STABLE
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT COALESCE(
    (SELECT NULLIF(s.settings->'keyword_value'->>'baseline','')::numeric
       FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL),
    (SELECT NULLIF(b.settings->'keyword_value'->>'baseline','')::numeric
       FROM web.site s JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
      WHERE s.id = p_site_id AND s.deleted_at IS NULL),
    (SELECT NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric
       FROM web.site s JOIN iam.organizations o ON o.id = s.organization_id
      WHERE s.id = p_site_id AND s.deleted_at IS NULL),
    (SELECT NULLIF(k.value #>> '{}','')::numeric
       FROM platform.feature_knob k
      WHERE k.feature = 'seo.keyword_value' AND k.key = 'baseline_score'),
    100);
$fn$;

-- ── which tier answered, for the receipts and the editors ────────────────────
CREATE OR REPLACE FUNCTION seo.fn_value_baseline_source(p_site_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
  SELECT CASE
    WHEN (SELECT s.settings->'keyword_value'->>'baseline' FROM web.site s WHERE s.id = p_site_id) IS NOT NULL THEN 'site'
    WHEN (SELECT b.settings->'keyword_value'->>'baseline' FROM web.site s JOIN web.brand b ON b.id = s.brand_id WHERE s.id = p_site_id) IS NOT NULL THEN 'brand'
    WHEN (SELECT o.settings->'keyword_value'->>'baseline' FROM web.site s JOIN iam.organizations o ON o.id = s.organization_id WHERE s.id = p_site_id) IS NOT NULL THEN 'org'
    ELSE 'platform' END;
$fn$;

REVOKE ALL ON FUNCTION seo.fn_value_baseline_source(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_value_baseline_source(uuid) TO authenticated, service_role;

-- ── who may set what ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION seo.fn_value_settings_may_edit(p_scope text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF public.is_platform_admin() THEN RETURN true; END IF;
  RETURN CASE p_scope
    WHEN 'platform' THEN false                              -- platform admins only, handled above
    WHEN 'org'      THEN iam.has_org_admin(p_id)
    WHEN 'brand'    THEN iam.has_access('web_brand', p_id, 'editor'::public.permission_level)
                      OR iam.has_org_admin((SELECT b.organization_id FROM web.brand b WHERE b.id = p_id))
    WHEN 'site'     THEN seo.fn_is_site_editor(p_id)
    ELSE false END;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.fn_value_settings_may_edit(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_value_settings_may_edit(text, uuid) TO authenticated, service_role;

-- ── what one editor screen needs: own values, what it would inherit, effective ─
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
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name,
                                                         'min_score', (c.metadata->>'min_score')::numeric)
                                      ORDER BY (c.metadata->>'min_score')::numeric DESC)
                       FROM platform.categories c
                      WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score');
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

  ELSE -- site
    SELECT COALESCE(s.name, s.domain), NULLIF(s.settings->'keyword_value'->>'baseline','')::numeric
      INTO v_label, v_own_baseline
      FROM web.site s WHERE s.id = p_id AND s.deleted_at IS NULL;
    v_own_levels := (SELECT jsonb_agg(jsonb_build_object('value', sv.value,
                                'label', COALESCE(sv.label, initcap(replace(sv.value,'_',' '))),
                                'min_score', (sv.config->>'min_score')::numeric)
                              ORDER BY (sv.config->>'min_score')::numeric DESC)
                       FROM seo.site_vocabulary sv
                      WHERE sv.site_id = p_id AND sv.vocab_kind='value_band' AND sv.active
                        AND sv.deleted_at IS NULL AND sv.config ? 'min_score');
    v_parent := (SELECT jsonb_build_object('scope','brand','id',b.id,'label',b.name)
                   FROM web.site s JOIN web.brand b ON b.id = s.brand_id WHERE s.id = p_id);
    v_sites := 1;
  END IF;

  -- What this scope WOULD use if it said nothing. For a site that is the live
  -- resolver's own answer; for the tiers above it is the next tier up.
  IF p_scope = 'site' THEN
    v_inh_baseline := seo.fn_value_baseline(p_id);
    v_inh_levels := (SELECT jsonb_agg(jsonb_build_object('value', l.value, 'label', l.label,
                                                         'min_score', l.min_score, 'source', l.source_scope)
                                      ORDER BY l.min_score DESC)
                       FROM seo.fn_value_levels(p_id) l);
  ELSIF p_scope = 'brand' THEN
    SELECT NULLIF(o.settings->'keyword_value'->>'baseline','')::numeric, o.settings->'keyword_value'->'levels'
      INTO v_inh_baseline, v_inh_levels
      FROM web.brand b JOIN iam.organizations o ON o.id = b.organization_id WHERE b.id = p_id;
  ELSIF p_scope = 'org' THEN
    v_inh_baseline := NULL; v_inh_levels := NULL;
  END IF;

  IF v_inh_baseline IS NULL AND p_scope <> 'platform' THEN
    v_inh_baseline := (SELECT NULLIF(k.value #>> '{}','')::numeric FROM platform.feature_knob k
                        WHERE k.feature='seo.keyword_value' AND k.key='baseline_score');
  END IF;
  IF v_inh_levels IS NULL AND p_scope <> 'platform' THEN
    v_inh_levels := (SELECT jsonb_agg(jsonb_build_object('value', c.slug, 'label', c.name,
                                                         'min_score', (c.metadata->>'min_score')::numeric,
                                                         'source','platform')
                                      ORDER BY (c.metadata->>'min_score')::numeric DESC)
                       FROM platform.categories c
                      WHERE c.dimension='seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score');
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

REVOKE ALL ON FUNCTION seo.value_settings_scope(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.value_settings_scope(text, uuid) TO authenticated, service_role;

-- ── THE ONE WRITE PATH for every tier ───────────────────────────────────────
-- p_baseline / p_levels: NULL means "leave as it is"; to hand a setting back to
-- the tier above, pass it in p_clear (['baseline'] / ['levels'] / both).
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
  v_kv jsonb;
  e    jsonb;
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

  -- Same coherence rules wherever levels are written (one predicate, no drift).
  IF p_levels IS NOT NULL THEN
    IF jsonb_typeof(p_levels) <> 'array' THEN
      RAISE EXCEPTION 'seo_settings_bad_levels: levels must be a list';
    END IF;
    FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
      IF NULLIF(btrim(COALESCE(e->>'value','')),'') IS NULL THEN
        RAISE EXCEPTION 'seo_settings_level_needs_value: every level needs an identity';
      END IF;
      IF (e->>'min_score') IS NULL OR (e->>'min_score') !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
        RAISE EXCEPTION 'seo_settings_level_needs_score: level "%" needs a number to start at', e->>'value';
      END IF;
    END LOOP;
    PERFORM seo.gsc_assert_vocabulary_coherent('value_band', p_levels);
  END IF;

  IF p_scope = 'platform' THEN
    IF p_baseline IS NOT NULL THEN
      UPDATE platform.feature_knob SET value = to_jsonb(p_baseline), updated_at = now(),
             updated_by = (SELECT auth.uid()), set_by = 'human'
       WHERE feature='seo.keyword_value' AND key='baseline_score';
    END IF;
    IF p_levels IS NOT NULL THEN
      FOR e IN SELECT * FROM jsonb_array_elements(p_levels) LOOP
        UPDATE platform.categories c
           SET metadata = COALESCE(c.metadata,'{}'::jsonb) || jsonb_build_object('min_score', (e->>'min_score')::numeric),
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

  ELSE -- site: baseline in settings, levels keep their live home
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
      PERFORM seo.gsc_save_value_vocabulary(p_id, 'value_band', p_levels, NULL);
    END IF;
    IF 'levels' = ANY(p_clear) THEN
      UPDATE seo.site_vocabulary sv SET deleted_at = now()
       WHERE sv.site_id = p_id AND sv.vocab_kind = 'value_band' AND sv.deleted_at IS NULL;
    END IF;
  END IF;

  RETURN seo.value_settings_scope(p_scope, p_id);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.set_value_settings(text, uuid, numeric, jsonb, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.set_value_settings(text, uuid, numeric, jsonb, text[]) TO authenticated, service_role;

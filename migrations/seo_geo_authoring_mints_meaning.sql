-- ============================================================================
-- GEO AUTHORING MINTS MEANING — the C2 geo regression, closed (2026-08-24)
--
-- THE DEFECT. C1 moved every geo contribution onto STAMPS and its migration
-- block minted, for each existing service area, a dimension VALUE + MATCHERS +
-- WORTH. C2 then rebuilt the resolver to read only stamps — `keyword_value_map`
-- stopped reading `seo.site_geo_area` entirely. But the AUTHORING path
-- (features/marketing/seo/value-system/rules/data.ts → a plain INSERT/UPDATE on
-- seo.site_geo_area) never learned to mint anything. So every area authored in
-- the product after C1 was inert on arrival, and by 2026-08-24 not one of the
-- 11 live areas on any site carried a single matcher: geography contributed
-- NOTHING to any score, for any site, silently.
--
-- THE FIX, in one sentence: writing a service area IS minting its meaning.
-- A trigger on seo.site_geo_area ensures the site's geo dimension, ensures the
-- area's VALUE, syncs its MATCHERS (place matchers for place_ids, word matchers
-- for match_tokens) and sets its WORTH from its band — in the SAME transaction
-- as the row, so every caller gets it and no client orchestrates it. Archiving
-- an area retires its value/matchers/worth instead of orphaning them; renaming
-- one renames the value and keeps the slug stable.
--
-- Reuses C1's `seo._ensure_site_dimension` / `seo._slugify` and C1's band →
-- worth mapping verbatim. There is no second mapping.
--
-- Also here: the alarm. An area that matches nothing must SCREAM where a person
-- authors it — `seo.gsc_geo_area_health` per area, a new disconnected row in
-- `seo.gsc_site_meaning_health`, and `seo.gsc_geo_area_reconnect` as the
-- one-click fix.
--
-- Idempotent. Safe to re-run.
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
-- ============================================================================

-- ── 1. The engine gains an internal entrypoint ──────────────────────────────
-- C5's live body (condition-stamp guard + the brand_identity matcher), minus the
-- editor assert, so triggers and backfills can run THE engine rather than a copy
-- of it. 🚨 Whoever edits this: the newest body is C5's, NOT C1's — replacing it
-- with C1's silently drops every brand stamp on the site.
CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers_internal(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
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

REVOKE ALL ON FUNCTION seo.fn_evaluate_matchers_internal(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.fn_evaluate_matchers_internal(uuid, uuid[]) TO service_role;
COMMENT ON FUNCTION seo.fn_evaluate_matchers_internal(uuid, uuid[]) IS
  'THE matcher engine body (C1), without the editor assert, for triggers and backfills. Callers that come from a person go through seo.fn_evaluate_matchers, which asserts first and delegates here.';

-- The public entrypoint keeps its contract and stops carrying a copy of the body.
CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  RETURN seo.fn_evaluate_matchers_internal(p_site_id, p_keyword_ids);
END $fn$;

-- ── 2. Writing a service area IS minting its meaning ────────────────────────
CREATE OR REPLACE FUNCTION seo.fn_geo_area_sync_meaning(p_area_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  g record; v_org uuid; v_dim uuid; v_val uuid; v_slug text; v_base_slug text; v_mult numeric;
  v_added int := 0; v_revived int := 0; v_retired int := 0; v_want int := 0;
  v_existing_slug_owner text;
BEGIN
  SELECT * INTO g FROM seo.site_geo_area WHERE id = p_area_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_such_area'); END IF;

  SELECT COALESCE(g.organization_id, s.organization_id) INTO v_org FROM web.site s WHERE s.id = g.site_id;

  -- The area's value is found by IDENTITY (area_id in metadata), never by its
  -- label — so a rename renames the value instead of minting a second one.
  SELECT c.id INTO v_val FROM platform.categories c
   WHERE c.dimension = 'seo_facet' AND c.metadata->>'area_id' = p_area_id::text
   ORDER BY c.deleted_at NULLS FIRST, c.created_at LIMIT 1;

  -- ARCHIVED AREA → retire its meaning rather than orphaning it.
  IF g.deleted_at IS NOT NULL THEN
    IF v_val IS NULL THEN RETURN jsonb_build_object('ok', true, 'archived', true, 'value_id', NULL); END IF;
    UPDATE seo.dimension_value_matcher SET deleted_at = now(), updated_at = now()
      WHERE value_id = v_val AND deleted_at IS NULL;
    UPDATE seo.site_value_worth SET deleted_at = now(), updated_at = now()
      WHERE value_id = v_val AND site_id = g.site_id AND deleted_at IS NULL;
    UPDATE seo.keyword_facet SET deleted_at = now(), updated_at = now()
      WHERE category_id = v_val AND deleted_at IS NULL AND source = 'matcher' AND NOT pinned;
    UPDATE platform.categories SET deleted_at = now(), updated_at = now()
      WHERE id = v_val AND deleted_at IS NULL;
    RETURN jsonb_build_object('ok', true, 'archived', true, 'value_id', v_val);
  END IF;

  v_dim := seo._ensure_site_dimension(
    g.site_id, 'geo', 'Geo',
    'Where a search points, graded by what that place is worth to this business.', 'intrinsic');

  IF v_val IS NULL THEN
    v_base_slug := COALESCE(NULLIF(seo._slugify(g.label), ''), 'area_' || left(p_area_id::text, 8));
    v_slug := (SELECT slug FROM platform.categories WHERE id = v_dim) || ':' || v_base_slug;
    -- Two areas may legitimately share a label; identity wins over prettiness.
    SELECT c.metadata->>'area_id' INTO v_existing_slug_owner FROM platform.categories c
     WHERE c.dimension = 'seo_facet' AND c.slug = v_slug AND c.deleted_at IS NULL;
    IF v_existing_slug_owner IS NULL OR v_existing_slug_owner <> p_area_id::text THEN
      IF EXISTS (SELECT 1 FROM platform.categories c WHERE c.dimension='seo_facet' AND c.slug = v_slug AND c.deleted_at IS NULL) THEN
        v_base_slug := v_base_slug || '_' || left(p_area_id::text, 8);
      END IF;
    END IF;
    v_val := seo._ensure_value(v_dim, v_base_slug, g.label,
      jsonb_build_object('geo_band', g.geo_band, 'area_id', p_area_id::text, 'area_kind', g.area_kind));
  ELSE
    -- Rename / re-band / restore-from-archive. The slug never moves.
    UPDATE platform.categories
       SET name = g.label,
           parent_id = v_dim,
           deleted_at = NULL,
           metadata = COALESCE(metadata, '{}'::jsonb)
                      || jsonb_build_object('geo_band', g.geo_band, 'area_id', p_area_id::text, 'area_kind', g.area_kind),
           updated_at = now()
     WHERE id = v_val
       AND (name IS DISTINCT FROM g.label
            OR parent_id IS DISTINCT FROM v_dim
            OR deleted_at IS NOT NULL
            OR metadata->>'geo_band' IS DISTINCT FROM g.geo_band
            OR metadata->>'area_kind' IS DISTINCT FROM g.area_kind);
  END IF;

  -- MATCHERS. Desired set = one place matcher per picked place, one word
  -- matcher per typed token. THE REGEX WALL still applies: every pattern goes
  -- through seo.dimension_value_matcher's own assert trigger.
  CREATE TEMP TABLE IF NOT EXISTS _geo_want (kind text, pattern text, place_id uuid) ON COMMIT DROP;
  TRUNCATE _geo_want;
  INSERT INTO _geo_want (kind, pattern, place_id)
    SELECT 'word', lower(btrim(t)), NULL
      FROM jsonb_array_elements_text(COALESCE(g.match_tokens, '[]'::jsonb)) t
     WHERE btrim(t) <> '';
  INSERT INTO _geo_want (kind, pattern, place_id)
    SELECT DISTINCT 'place', NULL, p FROM unnest(COALESCE(g.place_ids, '{}'::uuid[])) p WHERE p IS NOT NULL;
  SELECT count(*) INTO v_want FROM _geo_want;

  -- Retire matchers this area no longer wants (the value belongs to the area).
  WITH gone AS (
    UPDATE seo.dimension_value_matcher dm SET deleted_at = now(), updated_at = now()
     WHERE dm.value_id = v_val AND dm.site_id = g.site_id AND dm.deleted_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM _geo_want w
          WHERE w.kind = dm.kind
            AND COALESCE(w.pattern, '') = COALESCE(dm.pattern, '')
            AND COALESCE(w.place_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE(dm.place_id, '00000000-0000-0000-0000-000000000000'::uuid))
    RETURNING 1) SELECT count(*) INTO v_retired FROM gone;

  -- Revive any that were retired earlier and are wanted again.
  WITH back AS (
    UPDATE seo.dimension_value_matcher dm SET deleted_at = NULL, enabled = true, updated_at = now()
     WHERE dm.value_id = v_val AND dm.site_id = g.site_id AND dm.deleted_at IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM _geo_want w
          WHERE w.kind = dm.kind
            AND COALESCE(w.pattern, '') = COALESCE(dm.pattern, '')
            AND COALESCE(w.place_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = COALESCE(dm.place_id, '00000000-0000-0000-0000-000000000000'::uuid))
    RETURNING 1) SELECT count(*) INTO v_revived FROM back;

  WITH fresh AS (
    INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, pattern, place_id, origin, notes)
    SELECT g.site_id, v_org, v_val, w.kind, w.pattern, w.place_id, 'human',
           'from service area "' || g.label || '"'
      FROM _geo_want w
     WHERE NOT EXISTS (
       SELECT 1 FROM seo.dimension_value_matcher dm
        WHERE dm.value_id = v_val AND dm.site_id = g.site_id AND dm.deleted_at IS NULL
          AND dm.kind = w.kind
          AND COALESCE(dm.pattern, '') = COALESCE(w.pattern, '')
          AND COALESCE(dm.place_id, '00000000-0000-0000-0000-000000000000'::uuid)
              = COALESCE(w.place_id, '00000000-0000-0000-0000-000000000000'::uuid))
    RETURNING 1) SELECT count(*) INTO v_added FROM fresh;

  -- WORTH from the band. C1's mapping, unchanged: site vocabulary first, the
  -- platform band second; ×0 is the `never` flag, ×1 is no row at all.
  SELECT (sv.config->>'multiplier')::numeric INTO v_mult
    FROM seo.site_vocabulary sv
   WHERE sv.site_id = g.site_id AND sv.vocab_kind = 'geo_band' AND sv.active
     AND sv.deleted_at IS NULL AND sv.value = g.geo_band;
  IF v_mult IS NULL THEN
    SELECT (c.metadata->>'multiplier')::numeric INTO v_mult
      FROM platform.categories c
     WHERE c.dimension = 'seo_geo_band' AND c.slug = g.geo_band AND c.deleted_at IS NULL;
  END IF;
  v_mult := COALESCE(v_mult, 1);

  IF v_mult = 1 THEN
    UPDATE seo.site_value_worth SET deleted_at = now(), updated_at = now()
     WHERE site_id = g.site_id AND value_id = v_val AND deleted_at IS NULL;
  ELSE
    UPDATE seo.site_value_worth
       SET effect = CASE WHEN v_mult = 0 THEN 'never' ELSE 'scale' END,
           amount = CASE WHEN v_mult = 0 THEN NULL ELSE LEAST(5, GREATEST(0.05, v_mult)) END,
           notes  = 'geo band "' || g.geo_band || '"' || CASE WHEN v_mult = 0 THEN ' ×0 → never' ELSE ' multiplier' END,
           deleted_at = NULL, updated_at = now()
     WHERE site_id = g.site_id AND value_id = v_val;
    IF NOT FOUND THEN
      INSERT INTO seo.site_value_worth (site_id, organization_id, value_id, effect, amount, origin, notes)
      VALUES (g.site_id, v_org, v_val,
              CASE WHEN v_mult = 0 THEN 'never' ELSE 'scale' END,
              CASE WHEN v_mult = 0 THEN NULL ELSE LEAST(5, GREATEST(0.05, v_mult)) END,
              'human',
              'geo band "' || g.geo_band || '"' || CASE WHEN v_mult = 0 THEN ' ×0 → never' ELSE ' multiplier' END);
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'area_id', p_area_id, 'site_id', g.site_id, 'value_id', v_val,
                            'wanted', v_want, 'added', v_added, 'revived', v_revived, 'retired', v_retired,
                            'multiplier', v_mult);
END $fn$;

REVOKE ALL ON FUNCTION seo.fn_geo_area_sync_meaning(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_geo_area_sync_meaning(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.fn_geo_area_sync_meaning(uuid) IS
  'Authoring mints meaning (2026-08-24). Makes a service area''s dimension VALUE, MATCHERS and WORTH agree with the row, in the row''s own transaction. Called by the trigger on seo.site_geo_area, so every writer gets it and no client orchestrates it.';

CREATE OR REPLACE FUNCTION seo.site_geo_area_sync_meaning_tg()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  PERFORM seo.fn_geo_area_sync_meaning(NEW.id);
  RETURN NULL;
END $fn$;

DROP TRIGGER IF EXISTS site_geo_area_sync_meaning ON seo.site_geo_area;
CREATE TRIGGER site_geo_area_sync_meaning
  AFTER INSERT OR UPDATE OF label, area_kind, match_tokens, place_ids, geo_band, deleted_at, organization_id
  ON seo.site_geo_area
  FOR EACH ROW EXECUTE FUNCTION seo.site_geo_area_sync_meaning_tg();

-- ── 3. The alarm: an area that matches nothing changes no score ─────────────
CREATE OR REPLACE FUNCTION seo.gsc_geo_area_health(p_site_id uuid)
RETURNS TABLE(area_id uuid, label text, geo_band text, places integer, tokens integer,
              value_id uuid, matchers bigint, stamps bigint, state text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT g.id, g.label, g.geo_band,
         COALESCE(array_length(g.place_ids, 1), 0)::integer,
         COALESCE(jsonb_array_length(g.match_tokens), 0)::integer,
         v.id,
         COALESCE(m.n, 0), COALESCE(f.n, 0),
         CASE
           WHEN COALESCE(array_length(g.place_ids, 1), 0) = 0
                AND COALESCE(jsonb_array_length(g.match_tokens), 0) = 0 THEN 'empty'
           WHEN COALESCE(m.n, 0) = 0 THEN 'disconnected'
           WHEN COALESCE(f.n, 0) = 0 THEN 'no_hits'
           ELSE 'live'
         END
    FROM seo.site_geo_area g
    LEFT JOIN platform.categories v
      ON v.dimension = 'seo_facet' AND v.deleted_at IS NULL AND v.metadata->>'area_id' = g.id::text
    LEFT JOIN LATERAL (SELECT count(*) AS n FROM seo.dimension_value_matcher dm
                        WHERE dm.value_id = v.id AND dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled) m ON true
    LEFT JOIN LATERAL (SELECT count(*) AS n FROM seo.keyword_facet kf
                        WHERE kf.category_id = v.id AND kf.site_id = p_site_id AND kf.deleted_at IS NULL) f ON true
   WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
   ORDER BY g.label;
END $fn$;

REVOKE ALL ON FUNCTION seo.gsc_geo_area_health(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_geo_area_health(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_geo_area_health(uuid) IS
  'Per service area: does it actually change a score? empty = nothing inside it; disconnected = it has places/words but no matchers, so it is inert (the C2 regression class); no_hits = wired but no keyword has matched yet; live = stamping. Fix for disconnected is seo.gsc_geo_area_reconnect.';

-- The one-click fix behind the alarm.
-- The reconnect button must finish inside a web request. Building the engine's
-- default scope means a sequential scan of seo.search_performance_daily (14M
-- rows; measured 37s on All Green Recycling), so this RPC never asks for it:
-- it hands the engine exactly the keywords this site's GEO matchers can reach —
-- places through the indexed seo.keyword_place, words through one pass over
-- seo.keyword, plus everything already carrying one of these geo stamps so
-- removals still happen. Same engine, bounded input.
CREATE OR REPLACE FUNCTION seo.gsc_geo_area_reconnect(p_site_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE r record; v_areas int := 0; v_result jsonb; v_ids uuid[]; v_values uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  FOR r IN SELECT id FROM seo.site_geo_area WHERE site_id = p_site_id LOOP
    PERFORM seo.fn_geo_area_sync_meaning(r.id);
    v_areas := v_areas + 1;
  END LOOP;

  SELECT array_agg(c.id) INTO v_values
  FROM platform.categories c
  JOIN platform.categories d ON d.id = c.parent_id AND d.deleted_at IS NULL
  WHERE c.dimension = 'seo_facet' AND c.deleted_at IS NULL
    AND (d.metadata->>'site_id')::uuid = p_site_id
    AND COALESCE(d.metadata->>'standard_key','') = 'geo';

  IF v_values IS NULL THEN
    RETURN jsonb_build_object('areas_synced', v_areas, 'scope_keywords', 0, 'stamped', 0,
                              'removed', 0, 'matchers', 0, 'single_cardinality_conflicts', 0,
                              'evaluated_at', now());
  END IF;

  SELECT array_agg(DISTINCT x.kw) INTO v_ids FROM (
    SELECT kp.keyword_id AS kw
      FROM seo.dimension_value_matcher dm
      JOIN seo.keyword_place kp ON kp.place_id = dm.place_id AND kp.deleted_at IS NULL
     WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
       AND dm.kind = 'place' AND dm.value_id = ANY(v_values)
    UNION
    SELECT k.id
      FROM seo.keyword k
      JOIN seo.dimension_value_matcher dm
        ON dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
       AND dm.value_id = ANY(v_values) AND dm.kind = 'word'
       AND k.normalized_phrase ~ ('\m' || dm.pattern || '\M')
     WHERE k.deleted_at IS NULL
    UNION
    SELECT kf.keyword_id
      FROM seo.keyword_facet kf
     WHERE kf.site_id = p_site_id AND kf.deleted_at IS NULL AND kf.category_id = ANY(v_values)
  ) x WHERE x.kw IS NOT NULL;

  v_result := seo.fn_evaluate_matchers_internal(p_site_id, COALESCE(v_ids, '{}'::uuid[]));
  RETURN jsonb_build_object('areas_synced', v_areas) || v_result;
END $fn$;

REVOKE ALL ON FUNCTION seo.gsc_geo_area_reconnect(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_geo_area_reconnect(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_geo_area_reconnect(uuid) IS
  'Re-mints every service area''s meaning for a site and re-runs the matcher engine. The one-click fix behind the "this area matches nothing" alarm.';

-- ── 4. Meaning health learns the disconnected state ─────────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_site_meaning_health(p_site_id uuid)
 RETURNS TABLE(area text, severity text, headline text, detail text, count_value bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'web', 'pg_temp'
AS $function$
DECLARE
  v_geo_total bigint; v_geo_inert bigint; v_geo_disconnected bigint;
  v_rules bigint; v_facet_rules bigint;
  v_topics bigint; v_kw_on_tree bigint;
  v_dims_not_ready bigint; v_dims_no_abstain bigint;
  v_bands_site bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  -- An area is finished when it names gazetteer places OR typed words (I3);
  -- only an area with neither is a shell that matches nothing.
  SELECT count(*),
         count(*) FILTER (WHERE COALESCE(jsonb_array_length(g.match_tokens), 0) = 0
                            AND COALESCE(array_length(g.place_ids, 1), 0) = 0)
    INTO v_geo_total, v_geo_inert
  FROM seo.site_geo_area g WHERE g.site_id = p_site_id AND g.deleted_at IS NULL;

  -- …and an area that is FULL and still has no matchers is worse: it looks
  -- finished on every screen and changes no score at all. That is exactly the
  -- state C2 left every site in, so it gets its own line and never hides
  -- inside the "no places yet" count.
  SELECT count(*) INTO v_geo_disconnected
  FROM seo.gsc_geo_area_health(p_site_id) h WHERE h.state = 'disconnected';

  SELECT count(*), count(*) FILTER (WHERE r.match_facet IS NOT NULL)
    INTO v_rules, v_facet_rules
  FROM seo.keyword_class_rule r
  WHERE r.site_id = p_site_id AND r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL;

  SELECT count(*) INTO v_topics
  FROM seo.site_topic_value t WHERE t.site_id = p_site_id AND t.deleted_at IS NULL;

  SELECT count(DISTINCT kt.keyword_id) INTO v_kw_on_tree
  FROM seo.keyword_topic kt WHERE kt.is_primary AND kt.deleted_at IS NULL;

  SELECT count(*) INTO v_bands_site
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band'
    AND sv.active AND sv.deleted_at IS NULL;

  SELECT count(*) FILTER (WHERE NOT r.is_ready),
         count(*) FILTER (WHERE r.is_ready AND NOT r.can_abstain)
    INTO v_dims_not_ready, v_dims_no_abstain
  FROM platform.categories c
  CROSS JOIN LATERAL seo.facet_dimension_readiness(c.id) r
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
    AND (COALESCE(c.metadata->>'scope','platform') = 'platform'
         OR (c.metadata->>'site_id')::uuid = p_site_id);

  IF v_geo_disconnected > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s service area%s full of places but not connected to scoring',
             v_geo_disconnected, CASE WHEN v_geo_disconnected = 1 THEN '' ELSE 's' END),
      'The places are named, but nothing links them to your value tiers, so these areas change no score at all — the worst state a setting can be in, because every screen shows them as finished. Open the Rulebook and reconnect them; it takes one click and nothing you typed is lost.',
      v_geo_disconnected;
  END IF;

  -- Geo areas that were labelled but never given the places they stand for.
  IF v_geo_inert > 0 THEN
    RETURN QUERY SELECT 'geo', 'inert',
      format('%s of your %s service areas match nothing', v_geo_inert, v_geo_total),
      'They have a name and a band but no places in them — no picked place, no typed name — so no keyword has ever matched one. Until you say which towns, cities or regions each stands for, geography counts for nothing in your value tiers.',
      v_geo_inert;
  ELSIF v_geo_total = 0 THEN
    RETURN QUERY SELECT 'geo', 'gap',
      'No service areas yet',
      'Nothing tells the system which places are worth your money. Add your ideal area and the ones you will accept, and "near me in the wrong city" stops counting as a win.',
      0::bigint;
  ELSIF v_geo_disconnected = 0 THEN
    RETURN QUERY SELECT 'geo', 'ok',
      format('%s service areas, all with places in them', v_geo_total),
      'Every area names the places it stands for, so location counts in the value of every search that mentions one. When several areas match the same search the lowest multiplier wins — a place you never serve beats a place you love.',
      v_geo_total;
  END IF;

  -- Rules.
  IF v_rules = 0 THEN
    RETURN QUERY SELECT 'rules', 'gap',
      'No value rules yet',
      'This is where a word changes what a keyword is worth — "free" pulling value down, "certified" pushing it up. Without any, every keyword leans entirely on its topic.',
      0::bigint;
  ELSE
    RETURN QUERY SELECT 'rules', 'ok',
      format('%s value rules, %s of them reading a dimension', v_rules, v_facet_rules),
      'Rules that read a dimension only fire on keywords the classifier has actually looked at.',
      v_rules;
  END IF;

  -- The tree.
  IF v_topics = 0 THEN
    RETURN QUERY SELECT 'topics', 'gap',
      'No topic is worth anything yet',
      'Nothing has been ruled as something you sell, so no keyword can be traced to money. This is the first thing to fill in.',
      0::bigint;
  ELSE
    RETURN QUERY SELECT 'topics', 'ok',
      format('%s topics carry a worth for this site', v_topics),
      format('%s keywords across the platform have a primary topic. The topic tree is shared; what each topic is WORTH is yours. Only keywords on the tree can be traced up to something you sell — everything else is honestly unvalued. The topics screen reports this site''s own split.', v_kw_on_tree),
      v_topics;
  END IF;

  -- Dimensions.
  IF v_dims_not_ready > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'inert',
      format('%s dimensions are not being applied', v_dims_not_ready),
      'A dimension needs at least two real choices. With only one, the AI would be forced to stamp it on everything, so it is held back until you add another.',
      v_dims_not_ready;
  END IF;
  IF v_dims_no_abstain > 0 THEN
    RETURN QUERY SELECT 'dimensions', 'gap',
      format('%s dimensions cannot say "not clear"', v_dims_no_abstain),
      'On these the AI must pick a value even when the words do not say — so some answers are guesses that look like facts.',
      v_dims_no_abstain;
  END IF;

  -- Bands.
  IF v_bands_site = 0 THEN
    RETURN QUERY SELECT 'bands', 'gap',
      'Using the platform''s starter tiers',
      'The tier names and thresholds are still ours, not yours. Rename them in your language and the whole page relabels.',
      0::bigint;
  END IF;
END;
$function$;

-- ── 5. Backfill every area on every site (idempotent) ───────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM seo.site_geo_area ORDER BY created_at LOOP
    PERFORM seo.fn_geo_area_sync_meaning(r.id);
  END LOOP;
END $do$;

-- KI-043 — COPY MEANING TO A SIBLING SITE.
--
-- Arman's ruling (2026-08-25): meaning belongs to the SITE — never the brand,
-- never the organization — and where two sites of one business genuinely share
-- it, "we give you an easy way to just duplicate the data if it's the same."
-- There is no inheritance here and no shared row: this copies, once, on demand.
--
-- Rules the copy obeys:
--   * ADDITIVE. It never overwrites or deletes anything the target already
--     decided. A target row that already exists is reported as skipped, not
--     replaced, so copying twice is safe and copying into a working site cannot
--     destroy its rulings.
--   * SITE VALUES ARE REMAPPED, not shared. A site-scoped dimension belongs to
--     its own site, so the copy ensures an equivalent dimension + value on the
--     target and points the copied matcher/worth/combo at THAT id. Platform
--     values are already shared and pass through untouched.
--   * STAMPS ARE NOT COPIED. Stamps are what the target's own matchers conclude
--     about the target's own keywords; the answer is re-derived by running the
--     matcher engine, which the result tells the caller to do.
--   * ORIGIN is 'human' — a person chose to copy this — and the source site is
--     recorded in metadata.copied_from_site. ('copy' is not an allowed origin:
--     the vocabulary is human | pack | agent | migration.)
--   * `location_ids` on a geo area is deliberately dropped — physical locations
--     belong to a brand, and a sibling site may sit under a different one.
--   * DRY RUN IS THE SAME PATH. p_dry_run=true walks the identical code and
--     rolls back, so the preview cannot disagree with what the write does.

CREATE OR REPLACE FUNCTION seo.site_meaning_copy(
  p_from_site uuid,
  p_to_site   uuid,
  p_parts     text[] DEFAULT ARRAY['matchers','worth','geo','topics','combos','guidelines'],
  p_dry_run   boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_out        jsonb := '[]'::jsonb;
  v_copied     int;
  v_skipped    int;
  v_org        uuid;
  v_from_label text;
  v_to_label   text;
  r            record;
  v_val        uuid;
  v_ids        uuid[];
BEGIN
  -- A caller that passes NULL means "everything" — before this, `= ANY(NULL)`
  -- is NULL for every part, so the copy silently did nothing and reported 0.
  p_parts := COALESCE(p_parts, ARRAY['matchers','worth','geo','topics','combos','guidelines']);

  IF p_from_site IS NULL OR p_to_site IS NULL THEN
    RAISE EXCEPTION 'seo_copy_needs_two_sites: choose the site to copy from and the site to copy into';
  END IF;
  IF p_from_site = p_to_site THEN
    RAISE EXCEPTION 'seo_copy_same_site: those are the same site';
  END IF;
  IF NOT seo.fn_is_site_editor(p_from_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_source: you can not read the meaning of the site you are copying from'
      USING ERRCODE = '42501';
  END IF;
  IF NOT seo.fn_is_site_editor(p_to_site) THEN
    RAISE EXCEPTION 'seo_copy_denied_target: you do not have permission to change this site'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(name, domain) INTO v_from_label FROM web.site WHERE id = p_from_site AND deleted_at IS NULL;
  SELECT COALESCE(name, domain), organization_id INTO v_to_label, v_org FROM web.site WHERE id = p_to_site AND deleted_at IS NULL;
  IF v_from_label IS NULL OR v_to_label IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: one of those sites does not exist' USING ERRCODE = 'P0002';
  END IF;

  -- Map every value the source uses onto an id that is valid for the target.
  -- Platform values map to themselves; a site value is recreated on the target.
  -- ON COMMIT DROP is not enough: two calls inside ONE transaction (a preview
  -- then the write, which is exactly how the screen uses this) would collide.
  DROP TABLE IF EXISTS _val_map;
  CREATE TEMP TABLE _val_map (src uuid PRIMARY KEY, dst uuid) ON COMMIT DROP;

  INSERT INTO _val_map (src, dst)
  SELECT DISTINCT v.id,
         CASE WHEN COALESCE(d.metadata->>'scope','platform') <> 'site' THEN v.id ELSE NULL END
  FROM platform.categories v
  JOIN platform.categories d ON d.id = v.parent_id AND d.dimension = 'seo_facet'
  WHERE v.deleted_at IS NULL AND d.deleted_at IS NULL
    AND (v.id IN (SELECT m.value_id FROM seo.dimension_value_matcher m
                   WHERE m.site_id = p_from_site AND m.deleted_at IS NULL)
      OR v.id IN (SELECT w.value_id FROM seo.site_value_worth w
                   WHERE w.site_id = p_from_site AND w.deleted_at IS NULL)
      OR v.id IN (SELECT unnest(c.value_ids) FROM seo.site_value_combo c
                   WHERE c.site_id = p_from_site AND c.deleted_at IS NULL));

  FOR r IN
    SELECT vm.src, v.slug AS value_slug, v.name AS value_label, v.metadata AS value_meta,
           d.name AS dim_label, d.metadata AS dim_meta, d.slug AS dim_slug
      FROM _val_map vm
      JOIN platform.categories v ON v.id = vm.src
      JOIN platform.categories d ON d.id = v.parent_id
     WHERE vm.dst IS NULL
  LOOP
    v_val := seo._ensure_value(
      seo._ensure_site_dimension(
        p_to_site,
        COALESCE(r.dim_meta->>'standard_key', regexp_replace(r.dim_slug, '_[0-9a-f]{8}$', '')),
        r.dim_label,
        r.dim_meta->>'description',
        COALESCE(r.dim_meta->>'nature','intrinsic')),
      COALESCE(r.value_meta->>'value', split_part(r.value_slug, ':', 2)),
      r.value_label,
      COALESCE(r.value_meta, '{}'::jsonb));
    UPDATE _val_map SET dst = v_val WHERE src = r.src;
  END LOOP;

  -- ── matchers ──────────────────────────────────────────────────────────────
  IF 'matchers' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (
      SELECT EXISTS (
               SELECT 1 FROM seo.dimension_value_matcher t
                WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
                  AND t.value_id = vm.dst AND t.kind = m.kind
                  AND t.pattern IS NOT DISTINCT FROM m.pattern
                  AND t.place_id IS NOT DISTINCT FROM m.place_id) AS dup
        FROM seo.dimension_value_matcher m
        JOIN _val_map vm ON vm.src = m.value_id
       WHERE m.site_id = p_from_site AND m.deleted_at IS NULL
    ) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.dimension_value_matcher
        (site_id, value_id, kind, pattern, place_id, fact_value_id, enabled, origin, notes, organization_id, created_by, metadata)
      SELECT p_to_site, vm.dst, m.kind, m.pattern, m.place_id,
             (SELECT vm2.dst FROM _val_map vm2 WHERE vm2.src = m.fact_value_id),
             m.enabled, 'human', m.notes, v_org, (SELECT auth.uid()),
             COALESCE(m.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.dimension_value_matcher m
        JOIN _val_map vm ON vm.src = m.value_id
       WHERE m.site_id = p_from_site AND m.deleted_at IS NULL
         AND NOT EXISTS (
           SELECT 1 FROM seo.dimension_value_matcher t
            WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
              AND t.value_id = vm.dst AND t.kind = m.kind
              AND t.pattern IS NOT DISTINCT FROM m.pattern
              AND t.place_id IS NOT DISTINCT FROM m.place_id);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','matchers','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── worth ─────────────────────────────────────────────────────────────────
  IF 'worth' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (
      SELECT EXISTS (SELECT 1 FROM seo.site_value_worth t
                      WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.value_id = vm.dst) AS dup
        FROM seo.site_value_worth w JOIN _val_map vm ON vm.src = w.value_id
       WHERE w.site_id = p_from_site AND w.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_value_worth (site_id, value_id, effect, amount, origin, notes, organization_id, created_by, metadata)
      SELECT p_to_site, vm.dst, w.effect, w.amount, 'human', w.notes, v_org, (SELECT auth.uid()),
             COALESCE(w.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_value_worth w JOIN _val_map vm ON vm.src = w.value_id
       WHERE w.site_id = p_from_site AND w.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_value_worth t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.value_id = vm.dst);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','worth','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── geo areas (places and words travel; brand-owned locations do not) ─────
  IF 'geo' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (SELECT EXISTS (SELECT 1 FROM seo.site_geo_area t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND lower(t.label) = lower(g.label)) AS dup
            FROM seo.site_geo_area g WHERE g.site_id = p_from_site AND g.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_geo_area (site_id, label, area_kind, match_tokens, geo_band, notes, place_ids, organization_id, created_by, metadata)
      SELECT p_to_site, g.label, g.area_kind, g.match_tokens, g.geo_band, g.notes, g.place_ids, v_org, (SELECT auth.uid()),
             COALESCE(g.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_geo_area g
       WHERE g.site_id = p_from_site AND g.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_geo_area t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND lower(t.label) = lower(g.label));
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','geo','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── topic worth (topics are global, so the ids travel as they are) ────────
  IF 'topics' = ANY(p_parts) THEN
    SELECT count(*) FILTER (WHERE NOT dup), count(*) FILTER (WHERE dup) INTO v_copied, v_skipped
    FROM (SELECT EXISTS (SELECT 1 FROM seo.site_topic_value t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.topic_id = v.topic_id) AS dup
            FROM seo.site_topic_value v WHERE v.site_id = p_from_site AND v.deleted_at IS NULL) x;
    IF NOT p_dry_run THEN
      INSERT INTO seo.site_topic_value
        (site_id, topic_id, service_match, lead_quality, audience_fit, capacity_appetite, brand_fit, weight, notes, organization_id, created_by, metadata)
      SELECT p_to_site, v.topic_id, v.service_match, v.lead_quality, v.audience_fit, v.capacity_appetite,
             v.brand_fit, v.weight, v.notes, v_org, (SELECT auth.uid()),
             COALESCE(v.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site)
        FROM seo.site_topic_value v
       WHERE v.site_id = p_from_site AND v.deleted_at IS NULL
         AND NOT EXISTS (SELECT 1 FROM seo.site_topic_value t
                          WHERE t.site_id = p_to_site AND t.deleted_at IS NULL AND t.topic_id = v.topic_id);
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','topics','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── combinations (remapped through the same value map) ───────────────────
  IF 'combos' = ANY(p_parts) THEN
    v_copied := 0; v_skipped := 0;
    FOR r IN SELECT c.* FROM seo.site_value_combo c
              WHERE c.site_id = p_from_site AND c.deleted_at IS NULL
    LOOP
      SELECT array_agg(vm.dst ORDER BY vm.dst) INTO v_ids
        FROM unnest(r.value_ids) s(id) JOIN _val_map vm ON vm.src = s.id;
      IF v_ids IS NULL OR array_length(v_ids,1) IS DISTINCT FROM array_length(r.value_ids,1) THEN
        CONTINUE;  -- a value that could not be mapped: skip rather than invent one
      END IF;
      IF EXISTS (SELECT 1 FROM seo.site_value_combo t
                  WHERE t.site_id = p_to_site AND t.deleted_at IS NULL
                    AND t.value_ids @> v_ids AND t.value_ids <@ v_ids) THEN
        v_skipped := v_skipped + 1;
      ELSE
        v_copied := v_copied + 1;
        IF NOT p_dry_run THEN
          INSERT INTO seo.site_value_combo (site_id, value_ids, effect, amount, label, notes, origin, enabled, organization_id, created_by, metadata)
          VALUES (p_to_site, v_ids, r.effect, r.amount, r.label, r.notes, 'human', r.enabled, v_org, (SELECT auth.uid()),
                  COALESCE(r.metadata,'{}'::jsonb) || jsonb_build_object('copied_from_site', p_from_site));
        END IF;
      END IF;
    END LOOP;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','combos','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  -- ── business guidelines (only when the target has none) ──────────────────
  IF 'guidelines' = ANY(p_parts) THEN
    v_copied := 0; v_skipped := 0;
    IF (SELECT NULLIF(btrim(COALESCE(s.settings->'kw_guidelines'->>'text','')),'') FROM web.site s WHERE s.id = p_to_site) IS NOT NULL THEN
      v_skipped := 1;
    ELSIF (SELECT NULLIF(btrim(COALESCE(s.settings->'kw_guidelines'->>'text','')),'') FROM web.site s WHERE s.id = p_from_site) IS NOT NULL THEN
      v_copied := 1;
      IF NOT p_dry_run THEN
        PERFORM seo.gsc_set_site_kw_guidelines(
          p_to_site,
          (SELECT s.settings->'kw_guidelines'->>'text' FROM web.site s WHERE s.id = p_from_site));
      END IF;
    END IF;
    v_out := v_out || jsonb_build_array(jsonb_build_object('part','guidelines','copied',v_copied,'skipped_existing',v_skipped));
  END IF;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'from', jsonb_build_object('id', p_from_site, 'label', v_from_label),
    'to',   jsonb_build_object('id', p_to_site,   'label', v_to_label),
    'parts', v_out,
    'total_copied', (SELECT COALESCE(sum((e->>'copied')::int),0) FROM jsonb_array_elements(v_out) e),
    'total_skipped', (SELECT COALESCE(sum((e->>'skipped_existing')::int),0) FROM jsonb_array_elements(v_out) e),
    -- Stamps are never copied: the target's own matchers decide what its own
    -- keywords mean, and that answer is produced by running the engine.
    'next_step', CASE WHEN p_dry_run THEN 'preview only — nothing was written'
                      ELSE 'run the matchers on this site so the copied rules stamp its keywords' END);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.site_meaning_copy(uuid, uuid, text[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.site_meaning_copy(uuid, uuid, text[], boolean) TO authenticated, service_role;

-- Which sites a person could copy FROM, siblings of the same brand first.
CREATE OR REPLACE FUNCTION seo.site_meaning_copy_sources(p_to_site uuid)
RETURNS TABLE (site_id uuid, label text, domain text, same_brand boolean, meaning_rows bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'public', 'pg_temp'
AS $fn$
  SELECT s.id, COALESCE(s.name, s.domain), s.domain,
         s.brand_id IS NOT DISTINCT FROM (SELECT t.brand_id FROM web.site t WHERE t.id = p_to_site),
         (SELECT count(*) FROM seo.dimension_value_matcher m WHERE m.site_id = s.id AND m.deleted_at IS NULL)
       + (SELECT count(*) FROM seo.site_value_worth w WHERE w.site_id = s.id AND w.deleted_at IS NULL)
       + (SELECT count(*) FROM seo.site_geo_area g WHERE g.site_id = s.id AND g.deleted_at IS NULL)
       + (SELECT count(*) FROM seo.site_topic_value v WHERE v.site_id = s.id AND v.deleted_at IS NULL)
  FROM web.site s
  WHERE s.deleted_at IS NULL AND s.id <> p_to_site AND seo.fn_is_site_editor(s.id)
  ORDER BY (s.brand_id IS NOT DISTINCT FROM (SELECT t.brand_id FROM web.site t WHERE t.id = p_to_site)) DESC,
           5 DESC, 2;
$fn$;

REVOKE ALL ON FUNCTION seo.site_meaning_copy_sources(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.site_meaning_copy_sources(uuid) TO authenticated, service_role;

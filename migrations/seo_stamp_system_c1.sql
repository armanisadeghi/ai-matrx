-- ============================================================================
-- KEYWORD INTELLIGENCE CONVERGENCE — PHASE C1 (2026-08-23)
-- The ONE stamp system's storage + matcher engine. Additive: the current
-- resolver and surfaces keep working unchanged until C2/C3 switch over.
--
-- SoR: common-docs/projects/keyword-intelligence-convergence/PLAN.md
-- Principles P17–P22: common-docs/systems/marketing/seo/seo-keywords/keyword-system-decisions.md
--
-- Dimension → Value → Matchers (per-phrase kind) + Worth (per site) → Stamps.
--   seo.dimension_value_matcher  ONE matcher table (component of web.site)
--   seo.site_value_worth         ONE worth table   (component of web.site)
--   seo.keyword_facet            THE stamp table gains site_id / matcher_id / as_of / pinned
--   platform.categories          dimensions gain metadata.nature; traffic_class becomes a dimension
--   seo.fn_evaluate_matchers     the deterministic, idempotent engine
-- Existing rules / geo areas / brand aliases are COPIED into the new tables
-- (idempotent — re-running changes nothing); the old tables stay until C11.
-- ============================================================================

-- ── 1. ONE matcher table ────────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('seo.dimension_value_matcher') IS NULL THEN
    PERFORM platform.create_entity_table(
      p_schema     => 'seo',
      p_table      => 'dimension_value_matcher',
      p_token      => 'seo_dimension_value_matcher',
      p_label      => 'Dimension Value Matcher',
      p_fields     => array[
        'site_id uuid NOT NULL',
        'value_id uuid NOT NULL',
        'kind text NOT NULL',
        'pattern text',
        'place_id uuid',
        'fact_value_id uuid',
        'condition_rule_id uuid',
        'enabled boolean NOT NULL DEFAULT true',
        'origin text NOT NULL DEFAULT ''human''',
        'pack_id uuid',
        'notes text',
        'last_evaluated_at timestamptz',
        'match_count integer'
      ],
      p_variant    => 'component',
      p_versioned  => true,
      p_soft_delete=> true,
      p_visibility => 'none',
      p_category   => false,
      p_listed     => true,
      p_org_default=> true,
      p_gin_jsonb  => false,
      p_parents    => array['web_site:site_id']
    );
  END IF;
END $do$;

ALTER TABLE seo.dimension_value_matcher
  DROP CONSTRAINT IF EXISTS dvm_kind_check,
  ADD CONSTRAINT dvm_kind_check CHECK (kind IN ('exact','word','contains','starts_with','ends_with','place','fact','condition')),
  DROP CONSTRAINT IF EXISTS dvm_origin_check,
  ADD CONSTRAINT dvm_origin_check CHECK (origin IN ('human','pack','agent','migration')),
  DROP CONSTRAINT IF EXISTS dvm_target_check,
  ADD CONSTRAINT dvm_target_check CHECK (
    (kind IN ('exact','word','contains','starts_with','ends_with') AND pattern IS NOT NULL AND place_id IS NULL AND fact_value_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'place'     AND place_id IS NOT NULL AND pattern IS NULL AND fact_value_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'fact'      AND fact_value_id IS NOT NULL AND pattern IS NULL AND place_id IS NULL AND condition_rule_id IS NULL)
    OR (kind = 'condition' AND condition_rule_id IS NOT NULL AND pattern IS NULL AND place_id IS NULL AND fact_value_id IS NULL)
  ),
  DROP CONSTRAINT IF EXISTS dvm_value_fk,
  ADD CONSTRAINT dvm_value_fk FOREIGN KEY (value_id) REFERENCES platform.categories(id),
  DROP CONSTRAINT IF EXISTS dvm_place_fk,
  ADD CONSTRAINT dvm_place_fk FOREIGN KEY (place_id) REFERENCES seo.geo_place(id),
  DROP CONSTRAINT IF EXISTS dvm_fact_value_fk,
  ADD CONSTRAINT dvm_fact_value_fk FOREIGN KEY (fact_value_id) REFERENCES platform.categories(id),
  DROP CONSTRAINT IF EXISTS dvm_condition_fk,
  ADD CONSTRAINT dvm_condition_fk FOREIGN KEY (condition_rule_id) REFERENCES seo.gsc_dig_rule(id);

CREATE UNIQUE INDEX IF NOT EXISTS dvm_identity_uniq ON seo.dimension_value_matcher
  (site_id, value_id, kind, COALESCE(lower(pattern),''), COALESCE(place_id,'00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(fact_value_id,'00000000-0000-0000-0000-000000000000'::uuid), COALESCE(condition_rule_id,'00000000-0000-0000-0000-000000000000'::uuid))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS dvm_site_value_idx ON seo.dimension_value_matcher (site_id, value_id) WHERE deleted_at IS NULL AND enabled;

-- THE REGEX WALL: a typed pattern is interpolated into a regex by the engine.
CREATE OR REPLACE FUNCTION seo.dvm_assert_safe()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF NEW.pattern IS NOT NULL THEN
    PERFORM seo.assert_safe_match_token(NEW.pattern, 'matcher phrase');
    NEW.pattern := lower(btrim(NEW.pattern));
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS _assert_safe ON seo.dimension_value_matcher;
CREATE TRIGGER _assert_safe BEFORE INSERT OR UPDATE ON seo.dimension_value_matcher
  FOR EACH ROW EXECUTE FUNCTION seo.dvm_assert_safe();

COMMENT ON TABLE seo.dimension_value_matcher IS
  'THE ONE matcher table (P19). A matcher hangs on a dimension VALUE and carries its own kind (exact/word/contains/starts_with/ends_with/place/fact/condition). Matchers only FIND; the stamp (seo.keyword_facet) is the truth. Component of web.site. Pack templates live in seo.starter_pack_item and are copied here on adoption.';

-- ── 2. ONE worth table ──────────────────────────────────────────────────────
DO $do$
BEGIN
  IF to_regclass('seo.site_value_worth') IS NULL THEN
    PERFORM platform.create_entity_table(
      p_schema     => 'seo',
      p_table      => 'site_value_worth',
      p_token      => 'seo_site_value_worth',
      p_label      => 'Site Value Worth',
      p_fields     => array[
        'site_id uuid NOT NULL',
        'value_id uuid NOT NULL',
        'effect text NOT NULL',
        'amount numeric',
        'origin text NOT NULL DEFAULT ''human''',
        'pack_id uuid',
        'notes text'
      ],
      p_variant    => 'component',
      p_versioned  => true,
      p_soft_delete=> true,
      p_visibility => 'none',
      p_category   => false,
      p_listed     => true,
      p_org_default=> true,
      p_gin_jsonb  => false,
      p_parents    => array['web_site:site_id']
    );
  END IF;
END $do$;

ALTER TABLE seo.site_value_worth
  DROP CONSTRAINT IF EXISTS svw_effect_check,
  ADD CONSTRAINT svw_effect_check CHECK (
    (effect = 'add'   AND amount IS NOT NULL)
    OR (effect = 'scale' AND amount IS NOT NULL AND amount >= 0.05 AND amount <= 5)
    OR (effect = 'never' AND amount IS NULL)
  ),
  DROP CONSTRAINT IF EXISTS svw_origin_check,
  ADD CONSTRAINT svw_origin_check CHECK (origin IN ('human','pack','agent','migration')),
  DROP CONSTRAINT IF EXISTS svw_value_fk,
  ADD CONSTRAINT svw_value_fk FOREIGN KEY (value_id) REFERENCES platform.categories(id);
CREATE UNIQUE INDEX IF NOT EXISTS svw_site_value_uniq ON seo.site_value_worth (site_id, value_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE seo.site_value_worth IS
  'THE ONE worth table (P18). What a dimension VALUE is worth to THIS site: add ±N, scale ×F (0.05–5), or never (a flag, not ×0). Most values have no row — stamps are meaning first (P17). Topic worth stays on seo.site_topic_value (the declared hierarchical exception).';

-- ── 3. The stamp table learns site scope, matcher provenance, as-of, pins ───
ALTER TABLE seo.keyword_facet
  ADD COLUMN IF NOT EXISTS site_id uuid,
  ADD COLUMN IF NOT EXISTS matcher_id uuid,
  ADD COLUMN IF NOT EXISTS as_of timestamptz,
  ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
ALTER TABLE seo.keyword_facet
  DROP CONSTRAINT IF EXISTS keyword_facet_site_fk,
  ADD CONSTRAINT keyword_facet_site_fk FOREIGN KEY (site_id) REFERENCES web.site(id),
  DROP CONSTRAINT IF EXISTS keyword_facet_matcher_fk,
  ADD CONSTRAINT keyword_facet_matcher_fk FOREIGN KEY (matcher_id) REFERENCES seo.dimension_value_matcher(id);
-- sources: classifier (AI) · rule (legacy auto-applied class rule) · human · pack · matcher (the engine) · import
ALTER TABLE seo.keyword_facet DROP CONSTRAINT IF EXISTS keyword_facet_source_check;
ALTER TABLE seo.keyword_facet ADD CONSTRAINT keyword_facet_source_check
  CHECK (source = ANY (ARRAY['classifier','rule','human','pack','matcher','import']));
-- a site-scoped stamp and a universal stamp of the same value are different rows
DROP INDEX IF EXISTS seo.keyword_facet_kw_cat_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS keyword_facet_kw_cat_site_uniq ON seo.keyword_facet
  (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS keyword_facet_site_cat_idx ON seo.keyword_facet (site_id, category_id) WHERE deleted_at IS NULL AND site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS keyword_facet_matcher_idx ON seo.keyword_facet (matcher_id) WHERE deleted_at IS NULL AND matcher_id IS NOT NULL;
COMMENT ON COLUMN seo.keyword_facet.site_id IS 'NULL = universal fact (AI classifier, platform matcher). Set = a stamp that is true for THIS site only (site matcher, human ruling on a platform value, site dimension).';
COMMENT ON COLUMN seo.keyword_facet.pinned IS 'A human stamp the matcher engine must never remove or replace.';

-- ── 4. Dimensions declare a nature (P20); traffic class becomes a dimension ─
UPDATE platform.categories
   SET metadata = metadata || jsonb_build_object('nature','intrinsic')
 WHERE dimension='seo_facet' AND parent_id IS NULL AND deleted_at IS NULL
   AND NOT (metadata ? 'nature');

DO $do$
DECLARE v_org uuid; v_dim uuid; v_pos int := 0; r record;
BEGIN
  SELECT c.organization_id INTO v_org FROM platform.categories c
   WHERE c.dimension='seo_facet' AND c.parent_id IS NULL AND c.is_system AND c.deleted_at IS NULL
   ORDER BY c.created_at LIMIT 1;
  SELECT id INTO v_dim FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL;
  IF v_dim IS NULL THEN
    INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, metadata)
    VALUES ('seo_facet','traffic_class','Traffic class',NULL,v_org,true,'internal',
            jsonb_build_object('scope','platform','cardinality','single','nature','intrinsic',
              'description','What kind of traffic a query brings: money (could buy), educational (could learn), brand (already knows you), mismatch (can never serve). Human rulings, matchers and the AI intent fact all stamp this one dimension.'))
    RETURNING id INTO v_dim;
  END IF;
  FOR r IN SELECT * FROM (VALUES
      ('money','Money','Searcher could buy what this site sells'),
      ('educational','Educational','Searcher is learning; authority and funnel top'),
      ('brand','Brand','Searcher already knows this business — branded traffic is not SEO growth'),
      ('mismatch','Mismatch','Traffic this business can never serve'),
      ('not_clear','Not clear','The words do not say. Never guess a class that is not in the query.')
    ) v(slug,label,descr) LOOP
    v_pos := v_pos + 1;
    INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, position, metadata)
    SELECT 'seo_facet', 'traffic_class:'||r.slug, r.label, v_dim, v_org, true, 'internal', v_pos,
           jsonb_build_object('value', r.slug, 'description', r.descr) || CASE WHEN r.slug='not_clear' THEN jsonb_build_object('abstain',true) ELSE '{}'::jsonb END
    WHERE NOT EXISTS (SELECT 1 FROM platform.categories c WHERE c.dimension='seo_facet' AND c.slug='traffic_class:'||r.slug AND c.deleted_at IS NULL);
  END LOOP;
END $do$;

-- ── 5. Migrate existing rules / geo areas / brand aliases (idempotent) ──────
CREATE OR REPLACE FUNCTION seo._slugify(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(regexp_replace(lower(btrim(p)), '[^a-z0-9]+', '_', 'g'), '^_+|_+$', '', 'g');
$$;

-- Ensure a site-standard dimension exists (namespaced slug until the registry
-- scopes site dimensions per site in C4). Returns the dimension id.
CREATE OR REPLACE FUNCTION seo._ensure_site_dimension(p_site_id uuid, p_key text, p_label text, p_description text, p_nature text)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_slug text := 'site_' || p_key || '_' || replace(left(p_site_id::text, 8), '-', '');
        v_org uuid; v_id uuid;
BEGIN
  SELECT organization_id INTO v_org FROM web.site WHERE id = p_site_id;
  SELECT id INTO v_id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug=v_slug AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, metadata)
    VALUES ('seo_facet', v_slug, p_label, NULL, v_org, false, 'internal',
            jsonb_build_object('scope','site','site_id',p_site_id::text,'cardinality','single','nature',p_nature,'description',p_description,'standard_key',p_key))
    RETURNING id INTO v_id;
    PERFORM seo.facet_dimension_seed_abstain(v_id, v_org, false, NULL);
  END IF;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION seo._ensure_value(p_dimension_id uuid, p_value_slug text, p_label text, p_extra jsonb)
RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_dim_slug text; v_org uuid; v_id uuid; v_slug text;
BEGIN
  SELECT slug, organization_id INTO v_dim_slug, v_org FROM platform.categories WHERE id = p_dimension_id;
  v_slug := v_dim_slug || ':' || p_value_slug;
  SELECT id INTO v_id FROM platform.categories WHERE dimension='seo_facet' AND slug=v_slug AND deleted_at IS NULL;
  IF v_id IS NULL THEN
    INSERT INTO platform.categories (dimension, slug, name, parent_id, organization_id, is_system, visibility, position, metadata)
    VALUES ('seo_facet', v_slug, p_label, p_dimension_id, v_org, false, 'internal',
            (SELECT COALESCE(max(position),0)+1 FROM platform.categories WHERE parent_id=p_dimension_id),
            jsonb_build_object('value', p_value_slug) || COALESCE(p_extra,'{}'::jsonb))
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $fn$;

DO $do$
DECLARE
  s record; r record; g record; a record; tok text; pid uuid;
  v_geo_dim uuid; v_qual_dim uuid; v_val uuid; v_class_val uuid; v_brand_val uuid;
  v_mult numeric; v_slug text; v_site_org uuid;
  v_tc_dim uuid := (SELECT id FROM platform.categories WHERE dimension='seo_facet' AND parent_id IS NULL AND slug='traffic_class' AND deleted_at IS NULL);
BEGIN
  SELECT id INTO v_brand_val FROM platform.categories WHERE dimension='seo_facet' AND slug='traffic_class:brand' AND deleted_at IS NULL;

  FOR s IN
    SELECT DISTINCT st.id, st.organization_id, st.brand_id FROM web.site st
    WHERE st.deleted_at IS NULL AND (
      EXISTS (SELECT 1 FROM seo.keyword_class_rule x WHERE x.site_id=st.id AND x.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM seo.site_geo_area x WHERE x.site_id=st.id AND x.deleted_at IS NULL)
      OR EXISTS (SELECT 1 FROM web.brand b WHERE b.id=st.brand_id AND COALESCE(b.profile->'brand_aliases','[]'::jsonb) <> '[]'::jsonb))
  LOOP
    v_site_org := s.organization_id;

    -- 5a. GEO AREAS → values of the site geo dimension; tokens/places → matchers; band → worth
    IF EXISTS (SELECT 1 FROM seo.site_geo_area x WHERE x.site_id=s.id AND x.deleted_at IS NULL) THEN
      v_geo_dim := seo._ensure_site_dimension(s.id, 'geo', 'Geo', 'Where a search points, graded by what that place is worth to this business.', 'intrinsic');
      FOR g IN SELECT * FROM seo.site_geo_area WHERE site_id=s.id AND deleted_at IS NULL LOOP
        v_slug := COALESCE(NULLIF(seo._slugify(g.label),''), 'area_'||left(g.id::text,8));
        v_val := seo._ensure_value(v_geo_dim, v_slug, g.label, jsonb_build_object('geo_band', g.geo_band, 'area_id', g.id::text, 'area_kind', g.area_kind));
        FOR tok IN SELECT jsonb_array_elements_text(COALESCE(g.match_tokens,'[]'::jsonb)) LOOP
          INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, pattern, origin, pack_id, notes)
          VALUES (s.id, v_site_org, v_val, 'word', lower(tok), 'migration', (g.metadata->>'adopted_from_pack')::uuid, 'from geo area "'||g.label||'"')
          ON CONFLICT DO NOTHING;
        END LOOP;
        FOREACH pid IN ARRAY COALESCE(g.place_ids, '{}'::uuid[]) LOOP
          INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, place_id, origin, pack_id, notes)
          VALUES (s.id, v_site_org, v_val, 'place', pid, 'migration', (g.metadata->>'adopted_from_pack')::uuid, 'from geo area "'||g.label||'"')
          ON CONFLICT DO NOTHING;
        END LOOP;
        SELECT COALESCE((sv.config->>'multiplier')::numeric, 1) INTO v_mult
          FROM seo.site_vocabulary sv WHERE sv.site_id=s.id AND sv.vocab_kind='geo_band' AND sv.active AND sv.deleted_at IS NULL AND sv.value=g.geo_band;
        IF v_mult IS NULL THEN
          SELECT COALESCE((c.metadata->>'multiplier')::numeric, 1) INTO v_mult FROM platform.categories c WHERE c.dimension='seo_geo_band' AND c.slug=g.geo_band AND c.deleted_at IS NULL;
        END IF;
        v_mult := COALESCE(v_mult, 1);
        IF v_mult = 0 THEN
          INSERT INTO seo.site_value_worth (site_id, organization_id, value_id, effect, amount, origin, notes)
          VALUES (s.id, v_site_org, v_val, 'never', NULL, 'migration', 'geo band "'||g.geo_band||'" ×0 → never') ON CONFLICT DO NOTHING;
        ELSIF v_mult <> 1 THEN
          INSERT INTO seo.site_value_worth (site_id, organization_id, value_id, effect, amount, origin, notes)
          VALUES (s.id, v_site_org, v_val, 'scale', LEAST(5, GREATEST(0.05, v_mult)), 'migration', 'geo band "'||g.geo_band||'" multiplier') ON CONFLICT DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- 5b. RULES
    FOR r IN SELECT * FROM seo.keyword_class_rule WHERE site_id=s.id AND deleted_at IS NULL LOOP
      -- class rules: pattern → matcher on traffic_class:<class>
      IF r.target_class IS NOT NULL AND r.pattern IS NOT NULL AND r.target_class IN ('money','educational','brand','mismatch') THEN
        SELECT id INTO v_class_val FROM platform.categories WHERE dimension='seo_facet' AND slug='traffic_class:'||r.target_class AND deleted_at IS NULL;
        INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, pattern, origin, pack_id, notes)
        VALUES (s.id, v_site_org, v_class_val, COALESCE(r.match_kind,'contains'), lower(r.pattern), CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'migration' END, r.pack_id, 'from class rule "'||r.name||'"')
        ON CONFLICT DO NOTHING;
      END IF;
      -- value rules with a phrase → a Qualifiers value + matcher + scale worth
      IF r.value_multiplier IS NOT NULL AND r.pattern IS NOT NULL THEN
        v_qual_dim := seo._ensure_site_dimension(s.id, 'qualifiers', 'Qualifiers', 'Words in a search that change what it is worth to this business (free, cheap, certified, emergency…).', 'intrinsic');
        v_slug := COALESCE(NULLIF(seo._slugify(r.name),''), 'rule_'||left(r.id::text,8));
        v_val := seo._ensure_value(v_qual_dim, v_slug, r.name, jsonb_build_object('rule_id', r.id::text, 'description', r.description));
        INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, pattern, origin, pack_id, notes)
        VALUES (s.id, v_site_org, v_val, COALESCE(r.match_kind,'contains'), lower(r.pattern), CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'migration' END, r.pack_id, 'from value rule "'||r.name||'"')
        ON CONFLICT DO NOTHING;
        INSERT INTO seo.site_value_worth (site_id, organization_id, value_id, effect, amount, origin, pack_id, notes)
        VALUES (s.id, v_site_org, v_val, 'scale', LEAST(5, GREATEST(0.05, r.value_multiplier)), CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'migration' END, r.pack_id, COALESCE(r.notes, 'from value rule "'||r.name||'"'))
        ON CONFLICT DO NOTHING;
      END IF;
      -- value rules on a fact → worth on that platform/site value (AI/engine stamps it)
      IF r.value_multiplier IS NOT NULL AND r.match_facet IS NOT NULL AND r.match_facet_value IS NOT NULL THEN
        SELECT id INTO v_val FROM platform.categories WHERE dimension='seo_facet' AND slug=r.match_facet||':'||r.match_facet_value AND deleted_at IS NULL;
        IF v_val IS NOT NULL THEN
          INSERT INTO seo.site_value_worth (site_id, organization_id, value_id, effect, amount, origin, pack_id, notes)
          VALUES (s.id, v_site_org, v_val, 'scale', LEAST(5, GREATEST(0.05, r.value_multiplier)), CASE WHEN r.pack_id IS NOT NULL THEN 'pack' ELSE 'migration' END, r.pack_id, COALESCE(r.notes, 'from value rule "'||r.name||'"'))
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;
    END LOOP;

    -- 5c. BRAND ALIASES → word matchers on traffic_class:brand for every site of the brand
    FOR a IN SELECT jsonb_array_elements_text(COALESCE(b.profile->'brand_aliases','[]'::jsonb)) AS alias
             FROM web.brand b WHERE b.id = s.brand_id LOOP
      IF length(btrim(a.alias)) >= 3 THEN
        INSERT INTO seo.dimension_value_matcher (site_id, organization_id, value_id, kind, pattern, origin, notes)
        VALUES (s.id, v_site_org, v_brand_val, 'word', lower(btrim(a.alias)), 'migration', 'brand alias')
        ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;
END $do$;

-- ── 6. THE ENGINE — deterministic, idempotent, bounded, provenance-carrying ──
-- Applies this site's enabled matchers (text / place / fact) to the given
-- keywords and makes the stamp table agree: desired stamps are upserted with
-- matcher provenance; matcher-made stamps that no longer match are soft-
-- deleted; human stamps are never touched (pinned or source='human');
-- single-cardinality conflicts keep the lowest matcher id and are COUNTED.
-- Condition matchers (situational, Dig Here) are evaluated in C5.
CREATE OR REPLACE FUNCTION seo.fn_evaluate_matchers(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $fn$
DECLARE
  v_org uuid; v_stamped int := 0; v_removed int := 0; v_conflicts int := 0; v_matchers int := 0; v_scope int := 0;
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

  CREATE TEMP TABLE IF NOT EXISTS _desired (kw_id uuid, value_id uuid, dim_id uuid, matcher_id uuid, single_card boolean) ON COMMIT DROP;
  TRUNCATE _desired;

  WITH m AS (
    SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,
           cv.parent_id AS dim_id, COALESCE(cd.metadata->>'cardinality','single') = 'single' AS single_card
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
      AND dm.kind <> 'condition'
  ),
  kw AS (
    SELECT k.id, k.normalized_phrase FROM seo.keyword k JOIN _scope s ON s.kw_id = k.id WHERE k.deleted_at IS NULL
  ),
  hits AS (
    -- text
    SELECT kw.id AS kw_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM kw JOIN m ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
         (m.kind = 'contains'    AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'exact'       AND kw.normalized_phrase = m.pattern)
      OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'ends_with'   AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
      OR (m.kind = 'word'        AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    -- place
    SELECT kp.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL
    JOIN _scope s ON s.kw_id = kp.keyword_id
    WHERE m.kind = 'place'
    UNION ALL
    -- fact: an existing stamp (universal or this site's)
    SELECT kf.keyword_id, m.value_id, m.dim_id, m.matcher_id, m.single_card
    FROM m JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL
                                     AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    JOIN _scope s ON s.kw_id = kf.keyword_id
    WHERE m.kind = 'fact'
  ),
  ranked AS (
    SELECT h.*, row_number() OVER (PARTITION BY h.kw_id, h.dim_id ORDER BY h.matcher_id) AS rn
    FROM hits h
  )
  INSERT INTO _desired
  SELECT DISTINCT ON (kw_id, value_id) kw_id, value_id, dim_id, matcher_id, single_card
  FROM ranked
  WHERE (NOT single_card) OR rn = 1
  ORDER BY kw_id, value_id, matcher_id;

  -- (conflicts are single-cardinality dimensions where >1 value matched: recount directly)
  WITH m AS (
    SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id, cv.parent_id AS dim_id
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled AND dm.kind <> 'condition'
      AND COALESCE(cd.metadata->>'cardinality','single') = 'single'
  ), kw AS (SELECT k.id, k.normalized_phrase FROM seo.keyword k JOIN _scope s ON s.kw_id = k.id WHERE k.deleted_at IS NULL),
  hits AS (
    SELECT kw.id AS kw_id, m.value_id, m.dim_id FROM kw JOIN m ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
         (m.kind = 'contains' AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'exact' AND kw.normalized_phrase = m.pattern)
      OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'ends_with' AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
      OR (m.kind = 'word' AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    SELECT kp.keyword_id, m.value_id, m.dim_id FROM m JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL JOIN _scope s ON s.kw_id = kp.keyword_id WHERE m.kind='place'
    UNION ALL
    SELECT kf.keyword_id, m.value_id, m.dim_id FROM m JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL AND (kf.site_id IS NULL OR kf.site_id = p_site_id) JOIN _scope s ON s.kw_id = kf.keyword_id WHERE m.kind='fact'
  )
  SELECT count(*) INTO v_conflicts FROM (SELECT kw_id, dim_id FROM hits GROUP BY kw_id, dim_id HAVING count(DISTINCT value_id) > 1) c;

  -- Human stamps win: drop desired rows where a human stamp exists for a single-cardinality dimension (same site scope or universal)
  DELETE FROM _desired d
  WHERE d.single_card AND EXISTS (
    SELECT 1 FROM seo.keyword_facet kf
    JOIN platform.categories cv ON cv.id = kf.category_id
    WHERE kf.keyword_id = d.kw_id AND cv.parent_id = d.dim_id AND kf.deleted_at IS NULL
      AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
      AND (kf.pinned OR kf.source = 'human'));

  -- Upsert desired stamps (site-scoped, matcher-sourced)
  WITH up AS (
    -- site-scoped stamps are NEVER public: universal facts are public, a site's meaning is its own.
    -- They are read through the site-guarded SECURITY DEFINER RPCs, not by direct table reads.
    INSERT INTO seo.keyword_facet (keyword_id, category_id, site_id, source, confidence, matcher_id, as_of, organization_id, visibility)
    SELECT d.kw_id, d.value_id, p_site_id, 'matcher', 100, d.matcher_id, now(), v_org, 'internal' FROM _desired d
    ON CONFLICT (keyword_id, category_id, COALESCE(site_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE deleted_at IS NULL
    DO UPDATE SET matcher_id = EXCLUDED.matcher_id, as_of = now(), updated_at = now()
      WHERE seo.keyword_facet.source = 'matcher' AND NOT seo.keyword_facet.pinned
    RETURNING 1
  ) SELECT count(*) INTO v_stamped FROM up;

  -- Remove matcher-made stamps for this site that no longer match (within scope)
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

REVOKE ALL ON FUNCTION seo.fn_evaluate_matchers(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.fn_evaluate_matchers(uuid, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION seo.fn_evaluate_matchers(uuid, uuid[]) IS
  'THE matcher engine (C1). Deterministic + idempotent: makes seo.keyword_facet agree with this site''s enabled matchers for the given keywords; human/pinned stamps are never touched; single-cardinality conflicts keep the lowest matcher id and are counted. Condition matchers are evaluated in C5.';

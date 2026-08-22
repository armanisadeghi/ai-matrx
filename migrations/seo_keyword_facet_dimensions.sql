-- ============================================================================
-- USER-CREATABLE KEYWORD DIMENSIONS  (D37)
--
-- THE DEFECT THIS CLOSES.  The 13 keyword facets were 13 hard TEXT columns on
-- seo.keyword, each fenced by a CHECK array.  That is the exact shape db-rules
-- §5 forbids ("a growing controlled list is a registry you FK into, never a
-- CHECK array or enum"), and it had the precise consequence Arman named: the
-- vocabulary was governed by DDL, so a business could not add a dimension its
-- own value depends on -- vendor solicitation, competitor research, equipment
-- class, payer type -- without an engineer and a migration.  The registry
-- surface that shipped 2026-08-21 could rename a label but never add meaning:
-- facet_registry_add_value refuses until someone widens a CHECK by hand.
--
-- THE SHAPE.  A dimension is a parent row in platform.categories
-- (dimension='seo_facet'); its values are its children, slugged 'dim:value'.
-- That was ALREADY true for the 13 -- this migration makes it load-bearing
-- instead of decorative:
--
--   * seo.keyword_facet   -- keyword x category assignment.  THE fact store.
--                            Replaces the 13 columns as source of truth.
--   * dimension scope     -- platform (Matrx System org, is_system) stays
--                            super-admin: a universal fact must mean the same
--                            thing for every tenant or no cross-site learning
--                            can exist.  SITE dimensions are new and are the
--                            whole point: authored by anyone with site access.
--   * the resolver        -- seo.keyword_value_map's 13-arm hardcoded CASE is
--                            replaced by ONE join, so a dimension invented
--                            this afternoon carries value the same evening.
--
-- The 13 columns are NOT dropped here.  They stay as a legacy mirror while the
-- classifier is moved over; retirement is its own change with its own proof.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md (D37).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE FACT STORE
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('seo.keyword_facet') IS NULL THEN
    PERFORM platform.create_entity_table(
      p_schema => 'seo', p_table => 'keyword_facet',
      p_token  => 'seo_keyword_facet', p_label => 'Keyword Facet',
      p_fields => ARRAY[
        'keyword_id uuid NOT NULL REFERENCES seo.keyword(id) ON DELETE CASCADE',
        'source text NOT NULL DEFAULT ''classifier''',
        'confidence smallint',
        'classifier_version text',
        'notes text'
      ],
      p_variant => 'system', p_versioned => true, p_soft_delete => true,
      p_visibility => 'public', p_category => true, p_listed => false,
      p_org_default => true, p_gin_jsonb => false
    );
    ALTER TABLE seo.keyword_facet ALTER COLUMN category_id SET NOT NULL;
    ALTER TABLE seo.keyword_facet ADD CONSTRAINT keyword_facet_source_check
      CHECK (source IN ('classifier','rule','human','pack'));
    ALTER TABLE seo.keyword_facet ADD CONSTRAINT keyword_facet_confidence_check
      CHECK (confidence IS NULL OR (confidence BETWEEN 0 AND 100));
  END IF;
END $$;

-- One value per (keyword, facet-value).  Cardinality per DIMENSION is enforced
-- by the write RPC, not here: a multi-select dimension is a legitimate design
-- and a unique index on the parent would forbid it forever.
CREATE UNIQUE INDEX IF NOT EXISTS keyword_facet_kw_cat_uniq
  ON seo.keyword_facet (keyword_id, category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS keyword_facet_category_idx
  ON seo.keyword_facet (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS keyword_facet_keyword_idx
  ON seo.keyword_facet (keyword_id) WHERE deleted_at IS NULL;

COMMENT ON TABLE seo.keyword_facet IS
  'Keyword x facet-value assignments. category_id points at a platform.categories row under dimension=seo_facet (parent = the dimension, child = the value). Source of truth for keyword dimensions; the 13 legacy columns on seo.keyword are a mirror pending retirement (D37).';

-- ---------------------------------------------------------------------------
-- 2. DIMENSION SCOPE  -- metadata contract on the parent category row
--      scope        'platform' | 'site'
--      site_id      required when scope='site'
--      cardinality  'single' | 'multi'   (single = one value per keyword)
--      description  free text
-- ---------------------------------------------------------------------------
UPDATE platform.categories c
   SET metadata = c.metadata
                || jsonb_build_object('scope','platform','cardinality','single')
 WHERE c.dimension = 'seo_facet'
   AND c.parent_id IS NULL
   AND c.deleted_at IS NULL
   AND NOT (c.metadata ? 'scope');

-- ---------------------------------------------------------------------------
-- 3. BACKFILL the fact store from the 13 legacy columns.
--    Idempotent: re-running writes only what is missing.
-- ---------------------------------------------------------------------------
INSERT INTO seo.keyword_facet
  (keyword_id, category_id, organization_id, source, confidence, classifier_version, visibility)
SELECT k.id, cv.id, k.organization_id, 'classifier', k.classification_confidence,
       k.classifier_version, 'public'::platform.visibility
FROM seo.keyword k
CROSS JOIN LATERAL (VALUES
    ('intent_class',          k.intent_class),
    ('fulfillment_mode',      k.fulfillment_mode),
    ('audience_type',         k.audience_type),
    ('funnel_stage',          k.funnel_stage),
    ('transaction_direction', k.transaction_direction),
    ('local_intent',          k.local_intent),
    ('urgency',               k.urgency),
    ('comparison_intent',     k.comparison_intent),
    ('price_sensitivity',     k.price_sensitivity),
    ('query_form',            k.query_form),
    ('specificity',           k.specificity),
    ('brand_presence',        k.brand_presence),
    ('compliance_framing',    k.compliance_framing)
  ) AS f(facet, val)
JOIN platform.categories cd
  ON cd.dimension = 'seo_facet' AND cd.parent_id IS NULL
 AND cd.slug = f.facet AND cd.deleted_at IS NULL
JOIN platform.categories cv
  ON cv.parent_id = cd.id AND cv.deleted_at IS NULL
 AND cv.slug = f.facet || ':' || f.val
WHERE k.deleted_at IS NULL AND f.val IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM seo.keyword_facet kf
    WHERE kf.keyword_id = k.id AND kf.category_id = cv.id AND kf.deleted_at IS NULL);

-- ---------------------------------------------------------------------------
-- 4. READ: the dimension catalogue.  ONE call powers the whole manager UI.
--    Platform dimensions are visible to every authenticated user (the labels
--    agents apply must be visible to the humans they are applied to); site
--    dimensions only to people with access to that site.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_dimension_catalog(p_site_id uuid DEFAULT NULL)
RETURNS TABLE (
  dimension_id uuid, slug text, label text, description text,
  scope text, cardinality text, site_id uuid, is_system boolean,
  value_count bigint, keyword_count bigint, rule_count bigint,
  facet_values jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
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
           cv.position,
           (SELECT count(*) FROM seo.keyword_facet kf
             WHERE kf.category_id = cv.id AND kf.deleted_at IS NULL) AS kw_count
    FROM platform.categories cv
    JOIN dims d ON d.id = cv.parent_id
    WHERE cv.deleted_at IS NULL
  )
  SELECT d.id, d.slug, d.name, d.metadata->>'description',
         COALESCE(d.metadata->>'scope','platform'),
         COALESCE(d.metadata->>'cardinality','single'),
         (d.metadata->>'site_id')::uuid,
         d.is_system,
         COALESCE(count(v.value_id), 0)::bigint,
         COALESCE(sum(v.kw_count), 0)::bigint,
         (SELECT count(*) FROM seo.keyword_class_rule r
           WHERE r.match_facet = d.slug AND r.deleted_at IS NULL
             AND (p_site_id IS NULL OR r.site_id = p_site_id OR r.site_id IS NULL)),
         COALESCE(jsonb_agg(
           jsonb_build_object(
             'value_id', v.value_id, 'slug', v.value_slug, 'key', v.value_key,
             'label', v.value_label, 'description', v.value_description,
             'keyword_count', v.kw_count)
           ORDER BY v.position NULLS LAST, v.value_label
         ) FILTER (WHERE v.value_id IS NOT NULL), '[]'::jsonb)
  FROM dims d
  LEFT JOIN vals v ON v.dim_id = d.id
  GROUP BY d.id, d.slug, d.name, d.metadata, d.is_system
  ORDER BY COALESCE(d.metadata->>'scope','platform') DESC, d.name;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 5. WRITE: create / edit a DIMENSION.
--
--    p_site_id NULL  -> a PLATFORM dimension: a universal fact, super-admin
--                       only.  If every site could redefine facts, no
--                       cross-site learning or benchmarking could exist.
--    p_site_id set   -> a SITE dimension: anyone with access to that site.
--                       THIS is the capability that did not exist.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_dimension_upsert(
  p_slug        text,
  p_label       text,
  p_description text DEFAULT NULL,
  p_site_id     uuid DEFAULT NULL,
  p_cardinality text DEFAULT 'single'
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid  uuid := (SELECT auth.uid());
  v_org  uuid;
  v_id   uuid;
  v_scope text := CASE WHEN p_site_id IS NULL THEN 'platform' ELSE 'site' END;
  v_existing_scope text;
  v_existing_site  uuid;
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

  IF p_site_id IS NULL THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: platform dimensions are facts every site shares, so only super admins create them. Create it on this site instead and it is yours to shape.';
    END IF;
    SELECT o.id INTO v_org FROM iam.organizations o WHERE o.global_readable ORDER BY o.created_at LIMIT 1;
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
    -- A site may never edit a platform dimension, and never another site's.
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
       'scope', v_scope, 'cardinality', p_cardinality,
       'site_id', p_site_id::text,
       'description', NULLIF(btrim(COALESCE(p_description,'')), ''))),
     v_uid, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 6. WRITE: add / edit a VALUE on a dimension.
--    No CHECK constraint to widen -- that wall is gone.  The fact store FKs
--    into this row, so a value the classifier can write is a value that
--    exists, by construction.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.facet_value_upsert(
  p_dimension   text,
  p_value       text,
  p_label       text,
  p_description text DEFAULT NULL,
  p_site_id     uuid DEFAULT NULL,
  p_position    integer DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_id  uuid;
  v_slug text := p_dimension || ':' || p_value;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_value !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'seo_registry_bad_value: "%" must be lowercase letters, digits and underscores, starting with a letter', p_value;
  END IF;
  IF coalesce(btrim(p_label),'') = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a value must have a name';
  END IF;

  SELECT c.id, c.organization_id, COALESCE(c.metadata->>'scope','platform') AS scope,
         (c.metadata->>'site_id')::uuid AS site_id
    INTO v_dim
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_dimension AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_facet: there is no dimension named "%"', p_dimension;
  END IF;

  IF v_dim.scope = 'platform' THEN
    IF NOT public.is_super_admin() THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" is a platform dimension — its values are shared by every site. Only super admins add to it.', p_dimension;
    END IF;
  ELSE
    IF p_site_id IS NULL OR p_site_id IS DISTINCT FROM v_dim.site_id THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to another site', p_dimension;
    END IF;
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  SELECT c.id INTO v_id FROM platform.categories c
   WHERE c.parent_id = v_dim.id AND c.slug = v_slug AND c.deleted_at IS NULL;

  IF FOUND THEN
    UPDATE platform.categories
       SET name = btrim(p_label),
           position = COALESCE(p_position, position),
           metadata = metadata
                      || jsonb_build_object('value', p_value)
                      || CASE WHEN p_description IS NULL THEN '{}'::jsonb
                              ELSE jsonb_build_object('description', btrim(p_description)) END,
           updated_by = v_uid, updated_at = now()
     WHERE id = v_id;
    RETURN v_id;
  END IF;

  INSERT INTO platform.categories
    (dimension, slug, name, parent_id, organization_id, is_system, visibility, position, metadata, created_by, updated_by)
  VALUES
    ('seo_facet', v_slug, btrim(p_label), v_dim.id, v_dim.organization_id,
     v_dim.scope = 'platform', 'internal', p_position,
     jsonb_strip_nulls(jsonb_build_object(
       'value', p_value,
       'description', NULLIF(btrim(COALESCE(p_description,'')), ''))),
     v_uid, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 7. WRITE: assign a facet value to keywords.  THE one write path.
--    p_value NULL clears the keyword's value on that dimension.
--    'single' cardinality is enforced HERE, not by an index -- a multi-select
--    dimension is a legitimate design and an index on the parent would forbid
--    it forever.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.keyword_facet_set(
  p_keyword_ids uuid[],
  p_dimension   text,
  p_value       text DEFAULT NULL,
  p_source      text DEFAULT 'human',
  p_site_id     uuid DEFAULT NULL,
  p_confidence  smallint DEFAULT NULL,
  p_classifier_version text DEFAULT NULL
) RETURNS TABLE (keyword_id uuid, dimension text, value text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, web, pg_temp
AS $fn$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_dim record;
  v_val_id uuid;
  v_card text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_keyword_ids IS NULL OR cardinality(p_keyword_ids) = 0 THEN
    RAISE EXCEPTION 'gsc_no_keywords: choose at least one keyword';
  END IF;
  IF p_source NOT IN ('classifier','rule','human','pack') THEN
    RAISE EXCEPTION 'seo_registry_bad_source: %', p_source;
  END IF;

  SELECT c.id AS id,
         COALESCE(c.metadata->>'scope','platform') AS scope,
         (c.metadata->>'site_id')::uuid AS site_id,
         COALESCE(c.metadata->>'cardinality','single') AS cardinality
    INTO v_dim
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = p_dimension AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_registry_unknown_facet: there is no dimension named "%"', p_dimension;
  END IF;
  v_card := v_dim.cardinality;

  IF v_dim.scope = 'site' THEN
    IF p_site_id IS DISTINCT FROM v_dim.site_id THEN
      RAISE EXCEPTION 'seo_registry_forbidden: "%" belongs to another site', p_dimension;
    END IF;
    PERFORM seo.gsc_assert_site_access(p_site_id);
  ELSIF p_site_id IS NOT NULL THEN
    PERFORM seo.gsc_assert_site_access(p_site_id);
  END IF;

  IF p_value IS NOT NULL THEN
    SELECT c.id INTO v_val_id FROM platform.categories c
     WHERE c.parent_id = v_dim.id AND c.deleted_at IS NULL
       AND c.slug = p_dimension || ':' || p_value;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_registry_unknown_value: "%" is not a value of "%". Add it to the dimension first -- that is a click, not a migration.', p_value, p_dimension;
    END IF;
  END IF;

  UPDATE seo.keyword_facet kf
     SET deleted_at = now(), updated_by = v_uid, updated_at = now()
   WHERE kf.keyword_id = ANY(p_keyword_ids)
     AND kf.deleted_at IS NULL
     AND kf.category_id IN (
       SELECT c.id FROM platform.categories c
        WHERE c.parent_id = v_dim.id AND c.deleted_at IS NULL
          AND (v_card = 'single' OR p_value IS NULL OR c.id = v_val_id));

  IF p_value IS NULL THEN
    RETURN QUERY SELECT u.k, p_dimension, NULL::text FROM unnest(p_keyword_ids) AS u(k);
    RETURN;
  END IF;

  INSERT INTO seo.keyword_facet
    (keyword_id, category_id, organization_id, source, confidence, classifier_version,
     visibility, created_by, updated_by)
  SELECT k.id, v_val_id, k.organization_id, p_source, p_confidence, p_classifier_version,
         'public'::platform.visibility, v_uid, v_uid
  FROM seo.keyword k
  WHERE k.id = ANY(p_keyword_ids) AND k.deleted_at IS NULL;

  RETURN QUERY SELECT u.k, p_dimension, p_value FROM unnest(p_keyword_ids) AS u(k);
END;
$fn$;
-- ---------------------------------------------------------------------------
-- 8. THE RESOLVER, made dimension-agnostic.
--
--    This is the change that turns a user-created dimension from a label into
--    money.  The predicate below used to name all 13 facet COLUMNS by hand in
--    a CASE, which is precisely why a dimension invented this afternoon could
--    never carry value.  It is now one join through the fact store.
--
--    Everything else is unchanged and deliberately so: override still wins,
--    the negative guards still force 'negative', a keyword with no expressed
--    meaning is still honestly 'unvalued', and every row still carries its
--    reasons.  Reproduced in full (not patched in place) because THIS FILE is
--    the current definition of the resolver from here on.
-- ---------------------------------------------------------------------------
-- Keyword Value System — the resolver resolves ONLY what is about to be read.
--
-- WHY (measured on datadestruction.com, 2026-08-21): seo.keyword is a GLOBAL
-- corpus (196k rows) and seo.keyword_value_map matched a site's every pattern
-- rule and geo area against all of it, then its callers threw away everything
-- outside the site's window. With an empty site that cost nothing. The moment a
-- site actually expressed meaning — 22 value rules, 4 geo areas — the map took
-- 23s and the authenticated role's 8s statement timeout killed every read. The
-- workbench showed skeletons forever for exactly the sites using the feature,
-- the worst possible failure shape for a feature whose whole point is that
-- expressing meaning pays off immediately.
--
-- THE FIX, in two halves:
--   1. seo.keyword_value_map gains p_keyword_ids. NULL keeps whole-site
--      behaviour; a set resolves only those keywords. ONE resolver still —
--      this is a filter on the same arithmetic, never a second code path.
--   2. Every reader passes the keyword set it is about to render (its GSC
--      window) and materializes the map once instead of joining the function
--      into a per-row plan.
-- Measured after: review 1.5s, summary 1.3s, band preview 0.9s.
--
-- Also: geo areas and value rules are materialized once rather than re-scanned,
-- and the site's keyword rows are projected once into `site_kw`.

CREATE OR REPLACE FUNCTION seo.keyword_value_map(
  p_site_id uuid,
  p_keyword_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb)
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
WITH RECURSIVE
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id
    WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id
    FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL
      AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id
    FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL
      AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk
  WHERE sk.kw_id IS NOT NULL
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
geo_band_mult AS (
  SELECT sv.value, COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL
  UNION ALL
  SELECT c.slug, COALESCE((c.metadata->>'multiplier')::numeric, 1)
  FROM platform.categories c
  WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active AND sv2.deleted_at IS NULL)
),
site_kw AS MATERIALIZED (
  SELECT k.id, k.normalized_phrase, k.intent_class, k.fulfillment_mode, k.audience_type,
         k.funnel_stage, k.transaction_direction, k.local_intent, k.urgency,
         k.comparison_intent, k.price_sensitivity, k.query_form, k.specificity,
         k.brand_presence, k.compliance_framing
  FROM site_keywords sk
  JOIN seo.keyword k ON k.id = sk.kw_id
  WHERE k.deleted_at IS NULL
),
lineage AS (
  SELECT kt.keyword_id AS kw_id, kt.topic_id, 0 AS depth
  FROM seo.keyword_topic kt
  JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
  WHERE kt.is_primary AND kt.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
topic_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, tp.name AS topic_name,
    COALESCE(stv.weight, 50) AS base_weight,
    (stv.lead_quality = 'negative_value'
      OR stv.service_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM lineage l
  JOIN seo.site_topic_value stv
    ON stv.topic_id = l.topic_id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  JOIN seo.topic tp ON tp.id = stv.topic_id
  ORDER BY l.kw_id, l.depth
),
root_kind AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM lineage l
  JOIN seo.topic t ON t.id = l.topic_id
  WHERE t.parent_id IS NULL
  ORDER BY l.kw_id, l.depth DESC
),
-- THE SEAM (D37).  One row per (keyword, dimension, value) from the fact
-- store, replacing the 13 hardcoded CASE arms that used to name each facet
-- COLUMN by hand.  A dimension a site invented this afternoon matches here
-- through exactly the same code as the 13 platform facts.
kw_facts AS MATERIALIZED (
  SELECT kf.keyword_id AS kw_id,
         cd.slug AS facet,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) AS facet_value
  FROM seo.keyword_facet kf
  JOIN site_keywords sk ON sk.kw_id = kf.keyword_id
  JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
  JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
  WHERE kf.deleted_at IS NULL
),
vrules AS MATERIALIZED (
  SELECT r.id, r.name, r.pattern, r.match_kind, r.match_facet, r.match_facet_value, r.value_multiplier
  FROM seo.keyword_class_rule r
  WHERE r.deleted_at IS NULL AND r.value_multiplier IS NOT NULL AND r.site_id = p_site_id
),
rule_hits AS (
  SELECT k.id AS kw_id, r.id AS rule_id, r.name, r.value_multiplier
  FROM site_kw k
  JOIN vrules r ON (
    (r.pattern IS NOT NULL AND (
         (r.match_kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'exact'       AND k.normalized_phrase = lower(r.pattern))
      OR (r.match_kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(r.pattern)) || '%')
      OR (r.match_kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(r.pattern)))
      OR (r.match_kind = 'word'        AND k.normalized_phrase ~ ('\m' || lower(r.pattern) || '\M'))
    ))
    OR
    (r.match_facet IS NOT NULL AND EXISTS (
       SELECT 1 FROM kw_facts kfa
       WHERE kfa.kw_id = k.id
         AND kfa.facet = r.match_facet
         AND kfa.facet_value IS NOT DISTINCT FROM r.match_facet_value))
  )
),
rule_agg AS (
  SELECT kw_id,
         exp(sum(ln(value_multiplier))) AS mult,
         jsonb_agg(jsonb_build_object('kind','rule','rule_id',rule_id,'name',name,'multiplier',value_multiplier)) AS rule_reasons
  FROM rule_hits GROUP BY kw_id
),
geo_areas AS MATERIALIZED (
  SELECT g.geo_band, g.label, g.match_tokens, COALESCE(gb.mult, 1) AS mult
  FROM seo.site_geo_area g
  LEFT JOIN geo_band_mult gb ON gb.value = g.geo_band
  WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
),
geo_hits AS (
  SELECT DISTINCT ON (k.id) k.id AS kw_id, g.geo_band, g.label AS geo_label, g.mult
  FROM site_kw k
  JOIN geo_areas g ON true
  JOIN LATERAL (
    SELECT 1 FROM jsonb_array_elements_text(g.match_tokens) tok(v)
    WHERE k.normalized_phrase ~ ('\m' || lower(tok.v) || '\M')
    LIMIT 1
  ) m ON true
  ORDER BY k.id, g.mult ASC
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
floor_band AS (
  SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1
),
scored AS (
  SELECT k.id AS kw_id,
    (tb.kw_id IS NOT NULL) AS has_topic,
    (ra.kw_id IS NOT NULL) AS has_rules,
    (gh.kw_id IS NOT NULL) AS has_geo,
    COALESCE(tb.negative_guard, false) AS negative_guard,
    LEAST(100, GREATEST(0,
      COALESCE(tb.base_weight, 50) * COALESCE(ra.mult, 1) * COALESCE(gh.mult, 1))) AS raw_score,
    tb.topic_name, tb.base_weight, ra.rule_reasons,
    gh.geo_band, gh.geo_label, gh.mult AS geo_mult, rk.root_type
  FROM site_kw k
  LEFT JOIN topic_base tb ON tb.kw_id = k.id
  LEFT JOIN rule_agg  ra ON ra.kw_id = k.id
  LEFT JOIN geo_hits  gh ON gh.kw_id = k.id
  LEFT JOIN root_kind rk ON rk.kw_id = k.id
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN NULL
       WHEN s.negative_guard OR s.raw_score = 0 THEN 0
       ELSE round(s.raw_score, 1) END,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       WHEN s.negative_guard OR s.raw_score = 0 THEN 'negative'
       ELSE COALESCE(
         (SELECT b.value FROM bands b WHERE b.min_score <= round(s.raw_score, 1)
          ORDER BY b.min_score DESC LIMIT 1),
         (SELECT value FROM floor_band)) END,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN 'unvalued'
       ELSE 'computed' END,
  CASE WHEN o.kw_id IS NOT NULL THEN jsonb_build_array(jsonb_build_object('kind','override'))
       WHEN NOT (s.has_topic OR s.has_rules OR s.has_geo) THEN '[]'::jsonb
       ELSE
         CASE WHEN s.has_topic
           THEN jsonb_build_array(jsonb_build_object(
             'kind','topic','topic',s.topic_name,'weight',s.base_weight,
             'root',s.root_type,'negative_guard',s.negative_guard))
           ELSE jsonb_build_array(jsonb_build_object('kind','default_base','weight',50)) END
         || COALESCE(s.rule_reasons, '[]'::jsonb)
         || CASE WHEN s.has_geo
           THEN jsonb_build_array(jsonb_build_object(
             'kind','geo','band',s.geo_band,'area',s.geo_label,'multiplier',s.geo_mult))
           ELSE '[]'::jsonb END
  END
FROM scored s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$$;

REVOKE ALL ON FUNCTION seo.keyword_value_map(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.keyword_value_map(uuid, uuid[]) TO authenticated, service_role;

-- The three readers now pass the keyword set they are about to render and
-- materialize the map once. Their bodies are otherwise unchanged; read them
-- live (`\sf seo.gsc_keyword_value_review`) — the DB is the source of truth.
-- Applied 2026-08-21 via Supabase MCP as:
--   seo_value_readers_pass_window_keywords
--   seo_keyword_value_review_no_temp_table   (a STABLE fn may not CREATE TEMP TABLE)

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 9. THE REGISTRY SURFACE, told the truth.
--
--    Three functions were built around the assumption that a facet IS a column
--    with a CHECK.  Each is repaired to read the fact store instead, so the
--    admin screen stops describing a wall that no longer exists.
-- ---------------------------------------------------------------------------

-- 9a. Usage: was a hardcoded 13-column unpivot; now one group-by.
DROP FUNCTION IF EXISTS seo.facet_registry_usage();
CREATE OR REPLACE FUNCTION seo.facet_registry_usage()
RETURNS TABLE (facet text, value_key text, keywords bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  RETURN QUERY
  SELECT cd.slug,
         COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
         count(kf.id)
  FROM platform.categories cd
  JOIN platform.categories cv ON cv.parent_id = cd.id AND cv.deleted_at IS NULL
  LEFT JOIN seo.keyword_facet kf ON kf.category_id = cv.id AND kf.deleted_at IS NULL
  WHERE cd.dimension = 'seo_facet' AND cd.parent_id IS NULL AND cd.deleted_at IS NULL
  GROUP BY cd.slug, cv.slug, cv.metadata
  ORDER BY cd.slug, 3 DESC;
END;
$fn$;

-- 9b. `enforced` used to mean "the CHECK constraint accepts it".  With the
--     fact store FKing into the registry, EVERY registered value is writable
--     by construction, so the flag is now simply true -- and the screen that
--     rendered a widening warning has nothing left to warn about.
CREATE OR REPLACE FUNCTION seo.facet_check_values(p_facet text)
RETURNS text[]
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $$
  SELECT COALESCE(array_agg(COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2))
                            ORDER BY cv.position NULLS LAST, cv.name), '{}')
  FROM platform.categories cd
  JOIN platform.categories cv ON cv.parent_id = cd.id AND cv.deleted_at IS NULL
  WHERE cd.dimension = 'seo_facet' AND cd.parent_id IS NULL
    AND cd.deleted_at IS NULL AND cd.slug = p_facet;
$$;
COMMENT ON FUNCTION seo.facet_check_values(text) IS
  'The values a facet accepts. Was parsed out of seo.keyword''s CHECK constraint text; now read from the registry the fact store FKs into (D37). A registered value is writable by construction.';

DROP FUNCTION IF EXISTS seo.facet_registry_add_value(text,text,text,text);

-- 9c. The old add-a-value path now delegates, so any caller still on it works
--     and no longer hits the widening wall.
CREATE OR REPLACE FUNCTION seo.facet_registry_add_value(
  p_facet text, p_value text, p_label text, p_description text DEFAULT NULL)
RETURNS uuid
LANGUAGE sql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $$
  SELECT seo.facet_value_upsert(p_facet, p_value, p_label, p_description, NULL, NULL);
$$;

-- ---------------------------------------------------------------------------
-- 10. GRANTS.  Reads for any authenticated user (the labels agents apply must
--     be visible to the humans they are applied to); every write is guarded
--     inside its own function by super-admin or site access.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION seo.facet_dimension_catalog(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION seo.facet_dimension_upsert(text,text,text,uuid,text) FROM public, anon;
REVOKE ALL ON FUNCTION seo.facet_value_upsert(text,text,text,text,uuid,integer) FROM public, anon;
REVOKE ALL ON FUNCTION seo.keyword_facet_set(uuid[],text,text,text,uuid,smallint,text) FROM public, anon;
REVOKE ALL ON FUNCTION seo.facet_registry_usage() FROM public, anon;
REVOKE ALL ON FUNCTION seo.facet_registry_add_value(text,text,text,text) FROM public, anon;

GRANT EXECUTE ON FUNCTION seo.facet_dimension_catalog(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_dimension_upsert(text,text,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_value_upsert(text,text,text,text,uuid,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.keyword_facet_set(uuid[],text,text,text,uuid,smallint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_registry_usage() TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_registry_add_value(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.facet_check_values(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 11. THE LAST WALL: keyword_class_rule_match_facet_known.
--
--     A CHECK constraint listed the 13 facet names literally, so a rule could
--     never reference a dimension a site invented -- the authoring surface
--     would have raised 23514 the first time anyone tried.  A CHECK cannot run
--     a subquery, so registry-backed validation has to be a trigger.  Same
--     guarantee (a rule can only name a dimension and value that exist), one
--     that grows with the registry instead of fighting it.
-- ---------------------------------------------------------------------------
ALTER TABLE seo.keyword_class_rule
  DROP CONSTRAINT IF EXISTS keyword_class_rule_match_facet_known;

CREATE OR REPLACE FUNCTION seo.keyword_class_rule_assert_facet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = seo, platform, pg_temp
AS $fn$
DECLARE
  v_dim uuid;
BEGIN
  IF NEW.match_facet IS NULL THEN
    IF NEW.match_facet_value IS NOT NULL THEN
      RAISE EXCEPTION 'seo_rule_facet_value_without_facet: "%" names a value but no dimension', NEW.match_facet_value;
    END IF;
    RETURN NEW;
  END IF;

  SELECT c.id INTO v_dim
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
    AND c.slug = NEW.match_facet AND c.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_rule_unknown_facet: there is no dimension named "%". Create it first — that is a click, not a migration.', NEW.match_facet;
  END IF;

  IF NEW.match_facet_value IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM platform.categories v
        WHERE v.parent_id = v_dim AND v.deleted_at IS NULL
          AND v.slug = NEW.match_facet || ':' || NEW.match_facet_value) THEN
    RAISE EXCEPTION 'seo_rule_unknown_facet_value: "%" is not a value of "%". Allowed: %',
      NEW.match_facet_value, NEW.match_facet,
      array_to_string(seo.facet_check_values(NEW.match_facet), ', ');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS keyword_class_rule_assert_facet ON seo.keyword_class_rule;
CREATE TRIGGER keyword_class_rule_assert_facet
  BEFORE INSERT OR UPDATE OF match_facet, match_facet_value ON seo.keyword_class_rule
  FOR EACH ROW EXECUTE FUNCTION seo.keyword_class_rule_assert_facet();

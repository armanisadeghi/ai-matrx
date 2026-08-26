-- Brand-owned offerings cutover.
--
-- A platform offering template is a normal canonical row owned explicitly by
-- the Matrx System organization. A brand offering is a tenant-owned copy. A
-- site exposes an offering only when the explicit site_offering edge exists.
-- No table in this migration assigns an organization through a default or
-- resolver; every writer supplies organization_id and the validation triggers
-- only verify it.

-- 1. Canonical relations ----------------------------------------------------

DO $do$
BEGIN
  IF to_regclass('web.offering_template') IS NULL THEN
    PERFORM platform.create_entity_table(
      'web', 'offering_template', 'web_offering_template', 'Offering Template',
      ARRAY[
        'name text NOT NULL CHECK (btrim(name) <> '''')',
        'slug text NOT NULL CHECK (btrim(slug) <> '''')',
        'kind text NOT NULL CHECK (kind IN (''product'', ''service''))',
        'description text',
        'aliases jsonb NOT NULL DEFAULT ''[]''::jsonb CHECK (jsonb_typeof(aliases) = ''array'')',
        'industry_id uuid REFERENCES iam.industries(id) ON DELETE SET NULL',
        'status text NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''retired''))',
        'sort integer NOT NULL DEFAULT 0'
      ],
      'system', true, true, 'public', false, false, false, false
    );
  END IF;

  IF to_regclass('web.brand_offering') IS NULL THEN
    PERFORM platform.create_entity_table(
      'web', 'brand_offering', 'web_brand_offering', 'Brand Offering',
      ARRAY[
        'brand_id uuid NOT NULL REFERENCES web.brand(id) ON DELETE CASCADE',
        'template_id uuid REFERENCES web.offering_template(id) ON DELETE SET NULL',
        'name text NOT NULL CHECK (btrim(name) <> '''')',
        'slug text NOT NULL CHECK (btrim(slug) <> '''')',
        'kind text NOT NULL CHECK (kind IN (''product'', ''service''))',
        'description text',
        'status text NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''retired''))',
        'adopted_at timestamptz',
        'sort integer NOT NULL DEFAULT 0'
      ],
      'component', true, true, 'none', false, false, false, false,
      ARRAY['web_brand:brand_id']
    );
  END IF;

  IF to_regclass('web.site_offering') IS NULL THEN
    PERFORM platform.create_entity_table(
      'web', 'site_offering', 'web_site_offering', 'Site Offering',
      ARRAY[
        'site_id uuid NOT NULL REFERENCES web.site(id) ON DELETE CASCADE',
        'brand_offering_id uuid NOT NULL REFERENCES web.brand_offering(id) ON DELETE CASCADE',
        'status text NOT NULL DEFAULT ''active'' CHECK (status IN (''active'', ''inactive''))'
      ],
      'component', true, true, 'none', false, false, false, false,
      ARRAY['web_site:site_id']
    );
  END IF;

  IF to_regclass('seo.site_keyword_offering') IS NULL THEN
    PERFORM platform.create_entity_table(
      'seo', 'site_keyword_offering', 'seo_site_keyword_offering', 'Site Keyword Offering',
      ARRAY[
        'site_id uuid NOT NULL REFERENCES web.site(id) ON DELETE CASCADE',
        'keyword_id uuid NOT NULL REFERENCES seo.keyword(id) ON DELETE CASCADE',
        'brand_offering_id uuid NOT NULL REFERENCES web.brand_offering(id) ON DELETE CASCADE',
        'is_primary boolean NOT NULL DEFAULT false',
        'confidence smallint CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 100)',
        'assigned_by text',
        'notes text'
      ],
      'component', true, true, 'none', false, false, false, false,
      ARRAY['web_site:site_id']
    );
  END IF;

  IF to_regclass('seo.site_offering_value') IS NULL THEN
    PERFORM platform.create_entity_table(
      'seo', 'site_offering_value', 'seo_site_offering_value', 'Site Offering Value',
      ARRAY[
        'site_id uuid NOT NULL REFERENCES web.site(id) ON DELETE CASCADE',
        'brand_offering_id uuid NOT NULL REFERENCES web.brand_offering(id) ON DELETE CASCADE',
        'offering_match text CHECK (offering_match IS NULL OR offering_match IN (''core_offering'', ''adjacent_offering'', ''not_offered'', ''actively_avoided''))',
        'lead_quality text CHECK (lead_quality IS NULL OR lead_quality IN (''high_value'', ''medium_value'', ''low_value'', ''negative_value''))',
        'audience_fit text',
        'capacity_appetite text',
        'brand_fit text',
        'weight numeric CHECK (weight IS NULL OR weight BETWEEN 0 AND 100)',
        'notes text'
      ],
      'component', true, true, 'none', false, false, false, false,
      ARRAY['web_site:site_id']
    );
  END IF;
END
$do$;

ALTER TABLE web.offering_template
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES web.offering_template(id) ON DELETE SET NULL;
ALTER TABLE web.brand_offering
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES web.brand_offering(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offering_template_slug_live_key
  ON web.offering_template (slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS brand_offering_brand_slug_live_key
  ON web.brand_offering (brand_id, slug) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS brand_offering_brand_template_live_key
  ON web.brand_offering (brand_id, template_id)
  WHERE template_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_offering_live_key
  ON web.site_offering (site_id, brand_offering_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_keyword_offering_live_key
  ON seo.site_keyword_offering (site_id, keyword_id, brand_offering_id)
  WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_keyword_offering_primary_live_key
  ON seo.site_keyword_offering (site_id, keyword_id)
  WHERE is_primary AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS site_offering_value_live_key
  ON seo.site_offering_value (site_id, brand_offering_id) WHERE deleted_at IS NULL;

-- 2. Scope validation (validation only; these triggers never assign an org) --

CREATE OR REPLACE FUNCTION web.validate_offering_template_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = web, iam, public, pg_temp
AS $function$
DECLARE
  v_system_org constant uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
BEGIN
  IF NEW.organization_id <> v_system_org THEN
    RAISE EXCEPTION 'offering_template_wrong_org: templates belong to the Matrx System organization';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.offering_template p
    WHERE p.id = NEW.parent_id AND p.organization_id = v_system_org
      AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'offering_template_parent_invalid: parent must be a live system template';
  END IF;
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'offering_template_admin_only: only a super admin can change templates';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS offering_template_scope_guard ON web.offering_template;
CREATE TRIGGER offering_template_scope_guard
BEFORE INSERT OR UPDATE ON web.offering_template
FOR EACH ROW EXECUTE FUNCTION web.validate_offering_template_scope();

CREATE OR REPLACE FUNCTION web.validate_brand_offering_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = web, public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM web.brand b
    WHERE b.id = NEW.brand_id AND b.organization_id = NEW.organization_id
      AND b.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'brand_offering_scope_mismatch: organization must match the live brand';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.brand_offering p
    WHERE p.id = NEW.parent_id AND p.brand_id = NEW.brand_id
      AND p.organization_id = NEW.organization_id AND p.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'brand_offering_parent_mismatch: parent must belong to the same brand';
  END IF;
  IF NEW.template_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.offering_template t
    WHERE t.id = NEW.template_id AND t.kind = NEW.kind AND t.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'brand_offering_template_invalid: template must be live and have the same kind';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS brand_offering_scope_guard ON web.brand_offering;
CREATE TRIGGER brand_offering_scope_guard
BEFORE INSERT OR UPDATE ON web.brand_offering
FOR EACH ROW EXECUTE FUNCTION web.validate_brand_offering_scope();

CREATE OR REPLACE FUNCTION web.validate_site_offering_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = web, public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM web.site s
    JOIN web.brand_offering bo ON bo.id = NEW.brand_offering_id
    WHERE s.id = NEW.site_id AND s.brand_id = bo.brand_id
      AND s.organization_id = NEW.organization_id
      AND bo.organization_id = NEW.organization_id
      AND s.deleted_at IS NULL AND bo.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'site_offering_scope_mismatch: offering must belong to the site brand and organization';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS site_offering_scope_guard ON web.site_offering;
CREATE TRIGGER site_offering_scope_guard
BEFORE INSERT OR UPDATE ON web.site_offering
FOR EACH ROW EXECUTE FUNCTION web.validate_site_offering_scope();

CREATE OR REPLACE FUNCTION seo.validate_site_offering_fact_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, public, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM web.site s
    JOIN web.site_offering so
      ON so.site_id = s.id AND so.brand_offering_id = NEW.brand_offering_id
    JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE s.id = NEW.site_id AND s.organization_id = NEW.organization_id
      AND bo.organization_id = NEW.organization_id
      AND so.status = 'active' AND so.deleted_at IS NULL
      AND bo.status = 'active' AND bo.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'site_offering_unavailable: the site has not selected this offering';
  END IF;
  RETURN NEW;
END
$function$;

DROP TRIGGER IF EXISTS site_keyword_offering_scope_guard ON seo.site_keyword_offering;
CREATE TRIGGER site_keyword_offering_scope_guard
BEFORE INSERT OR UPDATE ON seo.site_keyword_offering
FOR EACH ROW EXECUTE FUNCTION seo.validate_site_offering_fact_scope();
DROP TRIGGER IF EXISTS site_offering_value_scope_guard ON seo.site_offering_value;
CREATE TRIGGER site_offering_value_scope_guard
BEFORE INSERT OR UPDATE ON seo.site_offering_value
FOR EACH ROW EXECUTE FUNCTION seo.validate_site_offering_fact_scope();

-- 3. Shared catalog seed and tenant backfill -------------------------------

INSERT INTO web.offering_template (
  id, organization_id, visibility, name, slug, kind, description, aliases,
  status, sort, metadata, created_at, updated_at, created_by, updated_by
)
SELECT
  t.id,
  '39c38960-d30c-4840-b0c1-c9960de95582'::uuid,
  'public'::platform.visibility,
  t.name,
  t.slug,
  t.node_type,
  t.description,
  t.aliases,
  'active',
  COALESCE((t.metadata->>'sort')::integer, 0),
  t.metadata || jsonb_build_object('migrated_from', 'seo.topic'),
  t.created_at,
  t.updated_at,
  t.created_by,
  t.updated_by
FROM seo.topic t
WHERE t.deleted_at IS NULL AND t.node_type IN ('product', 'service')
ON CONFLICT (id) DO NOTHING;

UPDATE web.offering_template child
SET parent_id = parent.id
FROM seo.topic source
JOIN web.offering_template parent ON parent.id = source.parent_id
WHERE child.id = source.id AND child.parent_id IS DISTINCT FROM parent.id;

WITH RECURSIVE direct_selection AS (
  SELECT DISTINCT spd.site_id, kt.topic_id
  FROM seo.search_performance_daily spd
  JOIN seo.keyword_topic kt ON kt.keyword_id = spd.keyword_id
  JOIN seo.topic t ON t.id = kt.topic_id
  WHERE spd.site_id IS NOT NULL AND spd.keyword_id IS NOT NULL
    AND kt.deleted_at IS NULL AND t.deleted_at IS NULL
    AND t.node_type IN ('product', 'service')
  UNION
  SELECT stv.site_id, stv.topic_id
  FROM seo.site_topic_value stv
  JOIN seo.topic t ON t.id = stv.topic_id
  WHERE stv.deleted_at IS NULL AND t.deleted_at IS NULL
    AND t.node_type IN ('product', 'service')
), selected AS (
  SELECT site_id, topic_id FROM direct_selection
  UNION
  SELECT selected.site_id, parent.id
  FROM selected
  JOIN seo.topic child ON child.id = selected.topic_id
  JOIN seo.topic parent ON parent.id = child.parent_id
  WHERE parent.deleted_at IS NULL AND parent.node_type IN ('product', 'service')
)
INSERT INTO web.brand_offering (
  organization_id, brand_id, template_id, name, slug, kind, description,
  status, adopted_at, sort, metadata, created_by, updated_by
)
SELECT DISTINCT
  s.organization_id, s.brand_id, t.id, t.name, t.slug, t.node_type,
  t.description, 'active', now(), COALESCE((t.metadata->>'sort')::integer, 0),
  jsonb_build_object('migrated_from', 'seo.topic', 'source_topic_id', t.id),
  auth.uid(), auth.uid()
FROM selected x
JOIN web.site s ON s.id = x.site_id AND s.brand_id IS NOT NULL AND s.deleted_at IS NULL
JOIN seo.topic t ON t.id = x.topic_id
ON CONFLICT (brand_id, template_id) WHERE template_id IS NOT NULL AND deleted_at IS NULL
DO NOTHING;

UPDATE web.brand_offering child
SET parent_id = parent.id
FROM web.offering_template source
JOIN web.brand_offering parent ON parent.template_id = source.parent_id
WHERE child.template_id = source.id
  AND parent.brand_id = child.brand_id
  AND child.parent_id IS DISTINCT FROM parent.id
  AND child.deleted_at IS NULL AND parent.deleted_at IS NULL;

WITH RECURSIVE direct_selection AS (
  SELECT DISTINCT spd.site_id, kt.topic_id
  FROM seo.search_performance_daily spd
  JOIN seo.keyword_topic kt ON kt.keyword_id = spd.keyword_id
  JOIN seo.topic t ON t.id = kt.topic_id
  WHERE spd.site_id IS NOT NULL AND spd.keyword_id IS NOT NULL
    AND kt.deleted_at IS NULL AND t.deleted_at IS NULL
    AND t.node_type IN ('product', 'service')
  UNION
  SELECT stv.site_id, stv.topic_id
  FROM seo.site_topic_value stv
  JOIN seo.topic t ON t.id = stv.topic_id
  WHERE stv.deleted_at IS NULL AND t.deleted_at IS NULL
    AND t.node_type IN ('product', 'service')
), selected AS (
  SELECT site_id, topic_id FROM direct_selection
  UNION
  SELECT selected.site_id, parent.id
  FROM selected
  JOIN seo.topic child ON child.id = selected.topic_id
  JOIN seo.topic parent ON parent.id = child.parent_id
  WHERE parent.deleted_at IS NULL AND parent.node_type IN ('product', 'service')
)
INSERT INTO web.site_offering (
  organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
)
SELECT DISTINCT s.organization_id, s.id, bo.id, 'active',
       jsonb_build_object('migrated_from', 'seo.topic'), auth.uid(), auth.uid()
FROM selected x
JOIN web.site s ON s.id = x.site_id AND s.brand_id IS NOT NULL AND s.deleted_at IS NULL
JOIN web.brand_offering bo
  ON bo.brand_id = s.brand_id AND bo.template_id = x.topic_id AND bo.deleted_at IS NULL
ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO seo.site_keyword_offering (
  organization_id, site_id, keyword_id, brand_offering_id, is_primary,
  confidence, assigned_by, notes, metadata, created_by, updated_by
)
SELECT DISTINCT ON (spd.site_id, kt.keyword_id, bo.id)
  s.organization_id, spd.site_id, kt.keyword_id, bo.id, kt.is_primary,
  kt.confidence, kt.assigned_by, kt.notes,
  kt.metadata || jsonb_build_object('migrated_from', 'seo.keyword_topic', 'source_keyword_topic_id', kt.id),
  kt.created_by, kt.updated_by
FROM seo.search_performance_daily spd
JOIN web.site s ON s.id = spd.site_id AND s.brand_id IS NOT NULL AND s.deleted_at IS NULL
JOIN seo.keyword_topic kt ON kt.keyword_id = spd.keyword_id AND kt.deleted_at IS NULL
JOIN web.brand_offering bo
  ON bo.brand_id = s.brand_id AND bo.template_id = kt.topic_id AND bo.deleted_at IS NULL
JOIN web.site_offering so
  ON so.site_id = spd.site_id AND so.brand_offering_id = bo.id AND so.deleted_at IS NULL
WHERE spd.keyword_id IS NOT NULL
ORDER BY spd.site_id, kt.keyword_id, bo.id, kt.updated_at DESC
ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL DO NOTHING;

INSERT INTO seo.site_offering_value (
  organization_id, site_id, brand_offering_id, offering_match, lead_quality,
  audience_fit, capacity_appetite, brand_fit, weight, notes, metadata,
  created_by, updated_by, created_at, updated_at
)
SELECT
  stv.organization_id, stv.site_id, bo.id, stv.offering_match,
  stv.lead_quality, stv.audience_fit, stv.capacity_appetite, stv.brand_fit,
  stv.weight, stv.notes,
  stv.metadata || jsonb_build_object('migrated_from', 'seo.site_topic_value', 'source_site_topic_value_id', stv.id),
  stv.created_by, stv.updated_by, stv.created_at, stv.updated_at
FROM seo.site_topic_value stv
JOIN web.site s ON s.id = stv.site_id AND s.brand_id IS NOT NULL
JOIN web.brand_offering bo
  ON bo.brand_id = s.brand_id AND bo.template_id = stv.topic_id AND bo.deleted_at IS NULL
WHERE stv.deleted_at IS NULL
ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL DO NOTHING;

ALTER TABLE seo.starter_pack_item
  ADD COLUMN IF NOT EXISTS offering_template_id uuid REFERENCES web.offering_template(id) ON DELETE CASCADE;
ALTER TABLE seo.starter_pack_item DROP CONSTRAINT IF EXISTS starter_pack_item_item_kind_check;
ALTER TABLE seo.starter_pack_item ADD CONSTRAINT starter_pack_item_item_kind_check
  CHECK (item_kind IN ('offering_template', 'topic', 'value_band', 'geo_band', 'geo_area', 'meaning'));
ALTER TABLE seo.starter_pack_item DROP CONSTRAINT IF EXISTS starter_pack_item_kind_shape_chk;
ALTER TABLE seo.starter_pack_item ADD CONSTRAINT starter_pack_item_kind_shape_chk CHECK (
  (item_kind = 'offering_template' AND offering_template_id IS NOT NULL AND topic_id IS NULL)
  OR (item_kind = 'topic' AND topic_id IS NOT NULL AND offering_template_id IS NULL)
  OR (item_kind IN ('value_band', 'geo_band') AND value IS NOT NULL AND label IS NOT NULL)
  OR (item_kind = 'geo_area' AND label IS NOT NULL AND geo_band IS NOT NULL)
  OR (item_kind = 'meaning' AND value IS NOT NULL AND label IS NOT NULL
      AND dimension_slug IS NOT NULL AND dimension_scope IN ('platform', 'site')
      AND jsonb_typeof(matchers) = 'array'
      AND (worth_effect IS NULL
           OR (worth_effect = 'add' AND worth_amount IS NOT NULL)
           OR (worth_effect = 'scale' AND worth_amount BETWEEN 0.05 AND 5)
           OR (worth_effect = 'never' AND worth_amount IS NULL)))
);
UPDATE seo.starter_pack_item spi
SET offering_template_id = spi.topic_id, topic_id = NULL,
    item_kind = 'offering_template', updated_at = now()
WHERE spi.item_kind = 'topic'
  AND EXISTS (SELECT 1 FROM web.offering_template ot WHERE ot.id = spi.topic_id)
  AND spi.offering_template_id IS NULL;

-- 4. Canonical offering API -----------------------------------------------

CREATE OR REPLACE FUNCTION web.site_offerings(p_site_id uuid)
RETURNS TABLE (
  id uuid, brand_id uuid, template_id uuid, name text, slug text, kind text,
  parent_id uuid, description text, status text, adopted_at timestamptz,
  sort integer, metadata jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT bo.id, bo.brand_id, bo.template_id, bo.name, bo.slug, bo.kind,
         bo.parent_id, bo.description, bo.status, bo.adopted_at, bo.sort, bo.metadata
  FROM web.site_offering so
  JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
  WHERE so.site_id = p_site_id AND so.status = 'active' AND so.deleted_at IS NULL
    AND bo.status = 'active' AND bo.deleted_at IS NULL
  ORDER BY bo.sort, bo.name, bo.id;
END
$function$;

CREATE OR REPLACE FUNCTION web.offering_templates_for_site(
  p_site_id uuid,
  p_search text DEFAULT NULL
)
RETURNS TABLE (
  id uuid, name text, slug text, kind text, parent_id uuid, description text,
  aliases jsonb, industry_id uuid, sort integer, adopted boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE v_brand_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  SELECT s.brand_id INTO v_brand_id FROM web.site s WHERE s.id = p_site_id;
  RETURN QUERY
  SELECT ot.id, ot.name, ot.slug, ot.kind, ot.parent_id, ot.description,
         ot.aliases, ot.industry_id, ot.sort,
         EXISTS (
           SELECT 1 FROM web.brand_offering bo
           WHERE bo.brand_id = v_brand_id AND bo.template_id = ot.id
             AND bo.deleted_at IS NULL
         )
  FROM web.offering_template ot
  WHERE ot.status = 'active' AND ot.deleted_at IS NULL
    AND (p_search IS NULL OR btrim(p_search) = ''
         OR ot.name ILIKE '%' || p_search || '%'
         OR ot.description ILIKE '%' || p_search || '%')
  ORDER BY ot.sort, ot.name, ot.id;
END
$function$;

CREATE OR REPLACE FUNCTION web.adopt_offering_template(
  p_organization_id uuid,
  p_site_id uuid,
  p_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE
  v_site web.site%ROWTYPE;
  v_node record;
  v_parent_brand_offering_id uuid;
  v_brand_offering_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO STRICT v_site FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  IF v_site.organization_id <> p_organization_id OR v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_adoption_scope_mismatch: explicit organization and site brand are required';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM web.offering_template
    WHERE id = p_template_id AND status = 'active' AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'offering_template_not_found: template is not available';
  END IF;

  FOR v_node IN
    WITH RECURSIVE lineage AS (
      SELECT ot.*, 0 AS depth FROM web.offering_template ot WHERE ot.id = p_template_id
      UNION ALL
      SELECT parent.*, child.depth + 1
      FROM lineage child
      JOIN web.offering_template parent ON parent.id = child.parent_id
      WHERE parent.deleted_at IS NULL AND parent.status = 'active'
    )
    SELECT * FROM lineage ORDER BY depth DESC
  LOOP
    SELECT bo.id INTO v_parent_brand_offering_id
    FROM web.brand_offering bo
    WHERE bo.brand_id = v_site.brand_id AND bo.template_id = v_node.parent_id
      AND bo.deleted_at IS NULL;

    INSERT INTO web.brand_offering AS bo (
      organization_id, brand_id, template_id, parent_id, name, slug, kind,
      description, status, adopted_at, sort, metadata, created_by, updated_by
    ) VALUES (
      p_organization_id, v_site.brand_id, v_node.id, v_parent_brand_offering_id,
      v_node.name, v_node.slug, v_node.kind, v_node.description, 'active', now(),
      v_node.sort, jsonb_build_object('adopted_from_template', v_node.id),
      auth.uid(), auth.uid()
    )
    ON CONFLICT (brand_id, template_id) WHERE template_id IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET status = 'active', updated_at = now(), updated_by = auth.uid()
    RETURNING bo.id INTO v_brand_offering_id;

    INSERT INTO web.site_offering AS so (
      organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
    ) VALUES (
      p_organization_id, p_site_id, v_brand_offering_id, 'active',
      jsonb_build_object('adopted_from_template', v_node.id), auth.uid(), auth.uid()
    )
    ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
    DO UPDATE SET status = 'active', updated_at = now(), updated_by = auth.uid();
  END LOOP;

  SELECT bo.id INTO STRICT v_brand_offering_id
  FROM web.brand_offering bo
  WHERE bo.brand_id = v_site.brand_id AND bo.template_id = p_template_id
    AND bo.deleted_at IS NULL;
  RETURN v_brand_offering_id;
END
$function$;

CREATE OR REPLACE FUNCTION web.save_site_offering(
  p_organization_id uuid,
  p_site_id uuid,
  p_offering_id uuid DEFAULT NULL,
  p_name text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE v_site web.site%ROWTYPE; v_id uuid; v_slug text;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO STRICT v_site FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  IF v_site.organization_id <> p_organization_id OR v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_scope_mismatch: explicit organization and site brand are required';
  END IF;
  IF p_name IS NULL OR btrim(p_name) = '' THEN RAISE EXCEPTION 'offering_name_required'; END IF;
  IF p_kind NOT IN ('product', 'service') THEN RAISE EXCEPTION 'offering_kind_invalid'; END IF;
  v_slug := trim(both '-' from regexp_replace(lower(btrim(p_name)), '[^a-z0-9]+', '-', 'g'));

  IF p_offering_id IS NULL THEN
    INSERT INTO web.brand_offering (
      organization_id, brand_id, parent_id, name, slug, kind, description,
      status, metadata, created_by, updated_by
    ) VALUES (
      p_organization_id, v_site.brand_id, p_parent_id, btrim(p_name), v_slug,
      p_kind, NULLIF(btrim(COALESCE(p_description, '')), ''), 'active', '{}',
      auth.uid(), auth.uid()
    ) RETURNING id INTO v_id;
    INSERT INTO web.site_offering (
      organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
    ) VALUES (p_organization_id, p_site_id, v_id, 'active', '{}', auth.uid(), auth.uid());
  ELSE
    UPDATE web.brand_offering
    SET name = btrim(p_name), slug = v_slug, kind = p_kind,
        description = NULLIF(btrim(COALESCE(p_description, '')), ''),
        parent_id = p_parent_id, updated_at = now(), updated_by = auth.uid()
    WHERE id = p_offering_id AND brand_id = v_site.brand_id
      AND organization_id = p_organization_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'offering_not_found'; END IF;
  END IF;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION seo.set_site_offering_value(
  p_organization_id uuid, p_site_id uuid, p_brand_offering_id uuid,
  p_weight numeric DEFAULT NULL, p_lead_quality text DEFAULT NULL,
  p_offering_match text DEFAULT NULL, p_notes text DEFAULT NULL,
  p_clear boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
DECLARE v_site_org uuid; v_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO STRICT v_site_org FROM web.site WHERE id = p_site_id;
  IF v_site_org <> p_organization_id THEN RAISE EXCEPTION 'offering_value_scope_mismatch'; END IF;
  IF p_clear THEN
    UPDATE seo.site_offering_value SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
    WHERE site_id = p_site_id AND brand_offering_id = p_brand_offering_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  INSERT INTO seo.site_offering_value AS sov (
    organization_id, site_id, brand_offering_id, weight, lead_quality,
    offering_match, notes, metadata, created_by, updated_by
  ) VALUES (
    p_organization_id, p_site_id, p_brand_offering_id, p_weight, p_lead_quality,
    p_offering_match, NULLIF(btrim(COALESCE(p_notes, '')), ''), '{}', auth.uid(), auth.uid()
  )
  ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET weight = EXCLUDED.weight, lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match, notes = EXCLUDED.notes,
    updated_at = now(), updated_by = auth.uid()
  RETURNING sov.id INTO v_id;
  RETURN v_id;
END
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_offering_stats(p_site_id uuid, p_start date, p_end date)
RETURNS TABLE(offering_id uuid, value_band text, keywords bigint, clicks bigint, impressions bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ), win AS MATERIALIZED (
    SELECT spd.keyword_id, sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ), linked AS MATERIALIZED (
    SELECT sko.keyword_id, sko.brand_offering_id,
           COALESCE(w.clicks, 0) AS clicks, COALESCE(w.impressions, 0) AS impressions
    FROM seo.site_keyword_offering sko
    LEFT JOIN win w ON w.keyword_id = sko.keyword_id
    WHERE sko.site_id = p_site_id AND sko.is_primary AND sko.deleted_at IS NULL
  ), vm AS MATERIALIZED (
    SELECT m.keyword_id, m.value_band
    FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(DISTINCT keyword_id) FROM linked)) m
  )
  SELECT l.brand_offering_id, COALESCE(vm.value_band, 'unvalued'), count(*)::bigint,
         sum(l.clicks)::bigint, sum(l.impressions)::bigint
  FROM linked l LEFT JOIN vm ON vm.keyword_id = l.keyword_id
  GROUP BY 1, 2;
END
$function$;

-- Reapply only canonical RLS families; no hand-written policies.
SELECT iam.apply_rls('web', 'offering_template', 'web_offering_template', 'system');
SELECT iam.apply_rls('web', 'brand_offering', 'web_brand_offering', 'component');
SELECT iam.apply_rls('web', 'site_offering', 'web_site_offering', 'component');
SELECT iam.apply_rls('seo', 'site_keyword_offering', 'seo_site_keyword_offering', 'component');
SELECT iam.apply_rls('seo', 'site_offering_value', 'seo_site_offering_value', 'component');

DO $do$
BEGIN
  IF NOT iam.canonical_certify_ok('web', 'offering_template', 'web_offering_template') THEN
    RAISE EXCEPTION 'canonical certification failed: web.offering_template';
  END IF;
  IF NOT iam.canonical_certify_ok('web', 'brand_offering', 'web_brand_offering') THEN
    RAISE EXCEPTION 'canonical certification failed: web.brand_offering';
  END IF;
  IF NOT iam.canonical_certify_ok('web', 'site_offering', 'web_site_offering') THEN
    RAISE EXCEPTION 'canonical certification failed: web.site_offering';
  END IF;
  IF NOT iam.canonical_certify_ok('seo', 'site_keyword_offering', 'seo_site_keyword_offering') THEN
    RAISE EXCEPTION 'canonical certification failed: seo.site_keyword_offering';
  END IF;
  IF NOT iam.canonical_certify_ok('seo', 'site_offering_value', 'seo_site_offering_value') THEN
    RAISE EXCEPTION 'canonical certification failed: seo.site_offering_value';
  END IF;
END
$do$;

GRANT SELECT ON web.offering_template TO authenticated;
GRANT SELECT ON web.brand_offering, web.site_offering TO authenticated;
GRANT SELECT ON seo.site_keyword_offering, seo.site_offering_value TO authenticated;
GRANT EXECUTE ON FUNCTION web.site_offerings(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION web.offering_templates_for_site(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION web.adopt_offering_template(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION web.save_site_offering(uuid, uuid, uuid, text, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_offering_stats(uuid, date, date) TO authenticated;

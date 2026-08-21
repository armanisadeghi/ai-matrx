-- SEO vocabulary registry — the ADMIN read/write path over the platform-governed
-- rows in platform.categories (dimensions 'seo_facet', 'seo_value_band',
-- 'seo_geo_band').
--
-- WHY RPCs AT ALL: these rows are Matrx-System-org, visibility 'internal', and
-- created_by NULL — no human passes platform.categories RLS for them. The
-- vocabulary is deliberately unreachable by ordinary writes; changing it is a
-- platform act, so it goes through a super-admin SECURITY DEFINER path.
--
-- THE CHECK LAW: a facet VALUE is only real if seo.keyword's CHECK constraint
-- accepts it. The registry row is the label; the constraint is the truth. So
-- adding a value REQUIRES widening the matching CHECK in the same change, and
-- this function refuses until that has landed. Removal is not offered at all:
-- values the classifier already wrote are enforced by those constraints.

CREATE OR REPLACE FUNCTION seo.facet_check_values(p_facet text)
RETURNS text[]
LANGUAGE sql STABLE
SET search_path = seo, pg_catalog, pg_temp
AS $$
  SELECT COALESCE(array_agg(m[1] ORDER BY m[1]), '{}')
  FROM pg_constraint c,
       LATERAL regexp_matches(pg_get_constraintdef(c.oid), '''([a-z_]+)''::text', 'g') AS m
  WHERE c.conrelid = 'seo.keyword'::regclass
    AND c.contype = 'c'
    AND c.conname = 'keyword_' || p_facet || '_check';
$$;

CREATE OR REPLACE FUNCTION seo.vocabulary_registry_list(p_dimension text DEFAULT 'seo_facet')
RETURNS TABLE (
  parent_id uuid,
  parent_slug text,
  parent_label text,
  parent_description text,
  value_id uuid,
  value_slug text,
  value_key text,
  value_label text,
  value_description text,
  value_config jsonb,
  enforced boolean,
  sort_order int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  IF p_dimension NOT IN ('seo_facet','seo_value_band','seo_geo_band') THEN
    RAISE EXCEPTION 'seo_registry_bad_dimension: %', p_dimension;
  END IF;

  IF p_dimension = 'seo_facet' THEN
    RETURN QUERY
    SELECT p.id, p.slug, p.name, p.metadata->>'description',
           c.id, c.slug, COALESCE(c.metadata->>'value', c.slug), c.name, c.metadata->>'description',
           c.metadata,
           COALESCE(c.metadata->>'value', c.slug) = ANY (seo.facet_check_values(p.slug)),
           COALESCE(c.position, 0)
    FROM platform.categories p
    JOIN platform.categories c
      ON c.parent_id = p.id AND c.dimension = p.dimension AND c.deleted_at IS NULL
    WHERE p.dimension = p_dimension AND p.parent_id IS NULL AND p.deleted_at IS NULL
    ORDER BY p.name, c.name;
  ELSE
    RETURN QUERY
    SELECT NULL::uuid, p_dimension, NULL::text, NULL::text,
           c.id, c.slug, c.slug, c.name, c.metadata->>'description',
           c.metadata, true, COALESCE(c.position, 0)
    FROM platform.categories c
    WHERE c.dimension = p_dimension AND c.deleted_at IS NULL
    ORDER BY COALESCE(c.position, 0);
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.facet_registry_usage()
RETURNS TABLE (facet text, value_key text, keywords bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $fn$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unauthenticated';
  END IF;
  RETURN QUERY
  SELECT f.facet, f.val, count(*)::bigint
  FROM seo.keyword k
  CROSS JOIN LATERAL (VALUES
    ('intent_class', k.intent_class),
    ('fulfillment_mode', k.fulfillment_mode),
    ('audience_type', k.audience_type),
    ('funnel_stage', k.funnel_stage),
    ('transaction_direction', k.transaction_direction),
    ('local_intent', k.local_intent),
    ('urgency', k.urgency),
    ('comparison_intent', k.comparison_intent),
    ('price_sensitivity', k.price_sensitivity),
    ('query_form', k.query_form),
    ('specificity', k.specificity),
    ('brand_presence', k.brand_presence),
    ('compliance_framing', k.compliance_framing)
  ) f(facet, val)
  WHERE k.deleted_at IS NULL AND f.val IS NOT NULL
  GROUP BY 1, 2;
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.vocabulary_registry_update(
  p_id uuid,
  p_label text,
  p_description text DEFAULT NULL
) RETURNS TABLE (id uuid, dimension text, slug text, name text, description text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_dim text;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'seo_registry_forbidden: the platform vocabulary is edited by super admins only';
  END IF;
  IF btrim(COALESCE(p_label,'')) = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a vocabulary entry must have a name';
  END IF;
  SELECT c.dimension INTO v_dim FROM platform.categories c WHERE c.id = p_id AND c.deleted_at IS NULL;
  IF v_dim IS NULL THEN
    RAISE EXCEPTION 'seo_registry_not_found';
  END IF;
  IF v_dim NOT IN ('seo_facet','seo_value_band','seo_geo_band') THEN
    RAISE EXCEPTION 'seo_registry_bad_dimension: % is not an SEO vocabulary', v_dim;
  END IF;

  RETURN QUERY
  UPDATE platform.categories c
  SET name = btrim(p_label),
      metadata = CASE
        WHEN NULLIF(btrim(COALESCE(p_description,'')), '') IS NULL THEN c.metadata - 'description'
        ELSE c.metadata || jsonb_build_object('description', btrim(p_description)) END,
      updated_at = now(),
      updated_by = auth.uid()
  WHERE c.id = p_id AND c.deleted_at IS NULL
  RETURNING c.id, c.dimension, c.slug, c.name, c.metadata->>'description';
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.facet_registry_add_value(
  p_facet text,
  p_value text,
  p_label text,
  p_description text DEFAULT NULL
) RETURNS TABLE (id uuid, slug text, name text)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
#variable_conflict use_column
DECLARE
  v_parent uuid;
  v_org uuid;
  v_allowed text[];
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'seo_registry_forbidden: the platform vocabulary is edited by super admins only';
  END IF;
  IF btrim(COALESCE(p_label,'')) = '' THEN
    RAISE EXCEPTION 'seo_registry_blank_label: a vocabulary entry must have a name';
  END IF;
  IF p_value !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'seo_registry_bad_value: "%" must be lowercase letters, digits and underscores', p_value;
  END IF;

  SELECT c.id, c.organization_id INTO v_parent, v_org
  FROM platform.categories c
  WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.slug = p_facet AND c.deleted_at IS NULL;
  IF v_parent IS NULL THEN
    RAISE EXCEPTION 'seo_registry_unknown_facet: %', p_facet;
  END IF;

  v_allowed := seo.facet_check_values(p_facet);
  IF NOT (p_value = ANY (v_allowed)) THEN
    RAISE EXCEPTION 'seo_registry_check_not_widened: seo.keyword''s % constraint does not accept "%" yet. Widen keyword_%_check in the same change — a label for a value the classifier can never write is a lie. Currently allowed: %',
      p_facet, p_value, p_facet, array_to_string(v_allowed, ', ');
  END IF;

  IF EXISTS (SELECT 1 FROM platform.categories c
             WHERE c.dimension = 'seo_facet' AND c.slug = p_facet || ':' || p_value AND c.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_registry_duplicate: % already has a "%" value', p_facet, p_value;
  END IF;

  RETURN QUERY
  INSERT INTO platform.categories AS pc
    (organization_id, dimension, name, slug, parent_id, is_system, created_by, updated_by, metadata)
  VALUES (v_org, 'seo_facet', btrim(p_label), p_facet || ':' || p_value, v_parent, true,
          auth.uid(), auth.uid(),
          jsonb_strip_nulls(jsonb_build_object(
            'value', p_value,
            'description', NULLIF(btrim(COALESCE(p_description,'')), ''))))
  RETURNING pc.id, pc.slug, pc.name;
END;
$fn$;

REVOKE ALL ON FUNCTION seo.facet_check_values(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.facet_check_values(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.vocabulary_registry_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.vocabulary_registry_list(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.facet_registry_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.facet_registry_usage() TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.vocabulary_registry_update(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.vocabulary_registry_update(uuid, text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.facet_registry_add_value(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.facet_registry_add_value(text, text, text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

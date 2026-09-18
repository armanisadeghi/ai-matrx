-- Brand-offerings cutover, step 6c: ONE canonical offering worth writer.
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md (D9).
--
-- Mirrors step 6b's placement writer. Offering worth had two write paths
-- after 6b: the signed-in door (seo.set_site_offering_value) and the legacy
-- bridge inside seo.gsc_set_topic_value, which inserted rows itself. The site
-- valuation agent (aidream) needs a third caller with no signed-in user. One
-- body now does the write:
--
-- 1. seo.write_site_offering_value - THE worth writer. Site-scoped, refuses a
--    cross-organization write, requires points (D9: worth is points), merges
--    provenance metadata. Not client-callable: signed-in callers use
--    seo.set_site_offering_value, service jobs call it as service_role.
-- 2. seo.set_site_offering_value becomes: assert editor, write through (1).
-- 3. seo.gsc_set_topic_value's transition bridge writes through (1).
--
-- based-on: seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text) 667ea101d5481f4964832dacd3c778a12f79dbe318ddcf4bd87124c659e10584
-- based-on: seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean) 806cf6ed956e678dcf320d9eb87b85d337992d0dfda2b3113d7e3bdb45116675

CREATE OR REPLACE FUNCTION seo.write_site_offering_value(
  p_organization_id uuid,
  p_site_id uuid,
  p_brand_offering_id uuid,
  p_worth_points numeric DEFAULT NULL,
  p_lead_quality text DEFAULT NULL,
  p_offering_match text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_clear boolean DEFAULT false,
  p_audience_fit text DEFAULT NULL,
  p_capacity_appetite text DEFAULT NULL,
  p_brand_fit text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
DECLARE v_site_org uuid; v_id uuid;
BEGIN
  SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF p_organization_id IS NULL OR v_site_org <> p_organization_id THEN
    RAISE EXCEPTION 'offering_value_scope_mismatch: the organization does not own this site';
  END IF;
  IF p_clear THEN
    UPDATE seo.site_offering_value
    SET deleted_at = now(), updated_at = now(), updated_by = auth.uid(),
        metadata = metadata || COALESCE(p_metadata, '{}'::jsonb)
    WHERE site_id = p_site_id AND brand_offering_id = p_brand_offering_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;
  IF p_worth_points IS NULL THEN
    RAISE EXCEPTION 'offering_worth_points_required: say how many points this offering adds to its keywords';
  END IF;
  INSERT INTO seo.site_offering_value AS sov (
    organization_id, site_id, brand_offering_id, worth_points, lead_quality,
    offering_match, audience_fit, capacity_appetite, brand_fit, notes, metadata,
    created_by, updated_by
  ) VALUES (
    p_organization_id, p_site_id, p_brand_offering_id, p_worth_points, p_lead_quality,
    p_offering_match, p_audience_fit, p_capacity_appetite, p_brand_fit,
    NULLIF(btrim(COALESCE(p_notes, '')), ''), COALESCE(p_metadata, '{}'::jsonb),
    auth.uid(), auth.uid()
  )
  ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET worth_points = EXCLUDED.worth_points, lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match, audience_fit = EXCLUDED.audience_fit,
    capacity_appetite = EXCLUDED.capacity_appetite, brand_fit = EXCLUDED.brand_fit,
    notes = EXCLUDED.notes, metadata = sov.metadata || EXCLUDED.metadata,
    updated_at = now(), updated_by = auth.uid()
  RETURNING sov.id INTO v_id;
  RETURN v_id;
END
$function$;

REVOKE ALL ON FUNCTION seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb) TO service_role;
COMMENT ON FUNCTION seo.write_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text, jsonb) IS
  'THE offering worth writer (brand-offerings cutover, D9: worth is points). Site-scoped; refuses cross-organization writes; the availability trigger refuses an offering the site does not expose. Signed-in callers use seo.set_site_offering_value; service jobs call this as service_role.';

CREATE OR REPLACE FUNCTION seo.set_site_offering_value(
  p_organization_id uuid,
  p_site_id uuid,
  p_brand_offering_id uuid,
  p_worth_points numeric DEFAULT NULL,
  p_lead_quality text DEFAULT NULL,
  p_offering_match text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_clear boolean DEFAULT false,
  p_audience_fit text DEFAULT NULL,
  p_capacity_appetite text DEFAULT NULL,
  p_brand_fit text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  RETURN seo.write_site_offering_value(
    p_organization_id, p_site_id, p_brand_offering_id, p_worth_points, p_lead_quality,
    p_offering_match, p_notes, p_clear, p_audience_fit, p_capacity_appetite, p_brand_fit, NULL);
END
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_topic_value(p_site_id uuid, p_topic_id uuid, p_weight numeric DEFAULT NULL::numeric, p_lead_quality text DEFAULT NULL::text, p_offering_match text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_clear boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_org uuid;
  v_id uuid;
  v_node_type text;
  v_offering uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  SELECT t.node_type INTO v_node_type FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  IF NOT p_clear AND p_weight IS NOT NULL AND (p_weight < 0 OR p_weight > 100) THEN
    RAISE EXCEPTION 'seo_topic_weight_range: worth is 0–100, got %', p_weight;
  END IF;

  -- TRANSITION (brand-offerings cutover): offering worth is read from the
  -- canonical offering value and written through THE worth writer. A legacy
  -- call that leaves worth blank meant "50" to the resolver, so that is what
  -- is written, and the row says so.
  IF v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    PERFORM seo.write_site_offering_value(
      v_org, p_site_id, v_offering, COALESCE(p_weight, 50), p_lead_quality, p_offering_match,
      p_notes, p_clear, NULL, NULL, NULL,
      jsonb_build_object('written_through', 'seo.gsc_set_topic_value',
                         'worth_points_from_resolver_default', p_weight IS NULL));
  END IF;

  IF p_clear THEN
    UPDATE seo.site_topic_value
    SET deleted_at = now(), updated_at = now(), updated_by = (SELECT auth.uid())
    WHERE site_id = p_site_id AND topic_id = p_topic_id AND deleted_at IS NULL
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  INSERT INTO seo.site_topic_value AS stv
    (organization_id, created_by, site_id, topic_id, weight, lead_quality, offering_match, notes)
  VALUES
    (v_org, (SELECT auth.uid()), p_site_id, p_topic_id, p_weight,
     p_lead_quality, p_offering_match, NULLIF(btrim(COALESCE(p_notes, '')), ''))
  ON CONFLICT (site_id, topic_id) DO UPDATE SET
    weight = EXCLUDED.weight,
    lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match,
    notes = EXCLUDED.notes,
    deleted_at = NULL,
    updated_at = now(),
    updated_by = (SELECT auth.uid())
  RETURNING stv.id INTO v_id;

  RETURN v_id;
END;
$function$;

-- Brand-offerings cutover, step 6h: the doors the Offerings screen needs to run
-- entirely on the canonical model.
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- 1. web.brand_offering_catalog(site) - THE Offerings screen read: every live
--    offering the site's BRAND owns (D1), whether THIS site offers it (D2), how
--    many other sites offer it, where it came from (template / changed from
--    template / the brand's own, D6), and this site's worth ruling in points
--    (D9). One read, brand-scoped, site access asserted.
-- 2. web.site_offering_availability_impact(site, offerings[]) - what stopping
--    an offering on this site would take with it, read before the click
--    (destructive actions state their consequence first).
-- 3. web.set_site_offering_availability(org, site, offerings[], available,
--    reason) - THE availability writer, per item or all at once. Stopping keeps
--    the web.site_offering row (status 'inactive', the reason and who in
--    metadata) and soft-deletes this site's placements and worth on it, stamped
--    with the same moment; offering it again restores exactly those rows
--    (a placement only when the keyword has not been placed elsewhere since).
--    Nothing is lost by a round trip. The brand catalog is never touched.
-- 4. web.move_site_offering - hierarchy is the brand's catalog (D3), so a move
--    now needs the offering to belong to the site's brand, not to be offered on
--    this site, and refuses a parent beneath the offering itself (a cycle the
--    scope trigger did not catch).
--
-- based-on: web.move_site_offering(uuid, uuid, uuid, uuid, uuid[]) 97c08d3e045bb3c5f891caa255e99cc4b9c5732a5612f65f04a1d25ddb48caf6

-- 1. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.brand_offering_catalog(p_site_id uuid)
RETURNS TABLE(
  id uuid,
  parent_id uuid,
  name text,
  slug text,
  kind text,
  description text,
  sort integer,
  template_id uuid,
  template_name text,
  changed_from_template boolean,
  adopted_at timestamptz,
  available boolean,
  availability_reason text,
  other_site_count bigint,
  worth_points numeric,
  lead_quality text,
  offering_match text,
  worth_notes text,
  worth_updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE v_brand uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_brand IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT bo.id, bo.parent_id, bo.name, bo.slug, bo.kind, bo.description, bo.sort,
         bo.template_id, ot.name,
         (ot.id IS NOT NULL AND (bo.name IS DISTINCT FROM ot.name
                                 OR bo.description IS DISTINCT FROM ot.description
                                 OR bo.kind IS DISTINCT FROM ot.kind)),
         bo.adopted_at,
         COALESCE(so.status = 'active', false),
         so.metadata #>> '{availability,reason}',
         (SELECT count(*) FROM web.site_offering o
           WHERE o.brand_offering_id = bo.id AND o.site_id <> p_site_id
             AND o.status = 'active' AND o.deleted_at IS NULL),
         sov.worth_points, sov.lead_quality, sov.offering_match, sov.notes, sov.updated_at
  FROM web.brand_offering bo
  LEFT JOIN web.offering_template ot ON ot.id = bo.template_id
  LEFT JOIN web.site_offering so
    ON so.site_id = p_site_id AND so.brand_offering_id = bo.id AND so.deleted_at IS NULL
  LEFT JOIN seo.site_offering_value sov
    ON sov.site_id = p_site_id AND sov.brand_offering_id = bo.id AND sov.deleted_at IS NULL
  WHERE bo.brand_id = v_brand AND bo.status = 'active' AND bo.deleted_at IS NULL
  ORDER BY bo.sort, bo.name, bo.id;
END
$function$;

COMMENT ON FUNCTION web.brand_offering_catalog(uuid) IS
  'The Offerings screen read (brand-offerings cutover): every live offering the site''s brand owns, whether this site offers it, other sites offering it, template provenance, and this site''s worth in points.';

-- 2. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.site_offering_availability_impact(p_site_id uuid, p_offering_ids uuid[])
RETURNS TABLE(
  offering_id uuid,
  offering_name text,
  available boolean,
  placements bigint,
  human_placements bigint,
  has_worth boolean,
  keywords_inheriting_worth bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE v_brand uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  RETURN QUERY
  WITH RECURSIVE picked AS (
    SELECT bo.id, bo.name FROM web.brand_offering bo
    WHERE bo.id = ANY (p_offering_ids) AND bo.brand_id = v_brand AND bo.deleted_at IS NULL
  ), below AS (
    -- Every strict descendant, with the nearest worth-carrying ancestor between
    -- it and the picked offering already known.
    SELECT p.id AS root_id, child.id AS node_id, 1 AS depth,
           EXISTS (SELECT 1 FROM seo.site_offering_value v
                   WHERE v.site_id = p_site_id AND v.brand_offering_id = child.id
                     AND v.deleted_at IS NULL) AS shielded
    FROM picked p
    JOIN web.brand_offering child ON child.parent_id = p.id AND child.deleted_at IS NULL
    UNION ALL
    SELECT b.root_id, child.id, b.depth + 1,
           b.shielded OR EXISTS (SELECT 1 FROM seo.site_offering_value v
                                 WHERE v.site_id = p_site_id AND v.brand_offering_id = child.id
                                   AND v.deleted_at IS NULL)
    FROM below b
    JOIN web.brand_offering child ON child.parent_id = b.node_id AND child.deleted_at IS NULL
    WHERE b.depth < 32
  )
  SELECT p.id, p.name,
    EXISTS (SELECT 1 FROM web.site_offering so WHERE so.site_id = p_site_id
              AND so.brand_offering_id = p.id AND so.status = 'active' AND so.deleted_at IS NULL),
    (SELECT count(*) FROM seo.site_keyword_offering k WHERE k.site_id = p_site_id
       AND k.brand_offering_id = p.id AND k.is_primary AND k.deleted_at IS NULL),
    (SELECT count(*) FROM seo.site_keyword_offering k WHERE k.site_id = p_site_id
       AND k.brand_offering_id = p.id AND k.is_primary AND k.deleted_at IS NULL AND k.assigned_by = 'human'),
    EXISTS (SELECT 1 FROM seo.site_offering_value v WHERE v.site_id = p_site_id
              AND v.brand_offering_id = p.id AND v.deleted_at IS NULL),
    CASE WHEN EXISTS (SELECT 1 FROM seo.site_offering_value v WHERE v.site_id = p_site_id
                        AND v.brand_offering_id = p.id AND v.deleted_at IS NULL)
      THEN (SELECT count(*) FROM below b
            JOIN seo.site_keyword_offering k ON k.site_id = p_site_id AND k.brand_offering_id = b.node_id
             AND k.is_primary AND k.deleted_at IS NULL
            WHERE b.root_id = p.id AND NOT b.shielded)
      ELSE 0 END
  FROM picked p
  ORDER BY p.name;
END
$function$;

COMMENT ON FUNCTION web.site_offering_availability_impact(uuid, uuid[]) IS
  'Read before stopping an offering on a site: its placements here (and how many a person made), whether it carries a worth ruling, and how many keywords beneath it take their worth from it.';

-- 3. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.set_site_offering_availability(
  p_organization_id uuid,
  p_site_id uuid,
  p_offering_ids uuid[],
  p_available boolean,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(
  offering_id uuid,
  changed boolean,
  placements_removed bigint,
  placements_restored bigint,
  worth_removed bigint,
  worth_restored bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_site web.site%ROWTYPE;
  v_id uuid;
  v_row web.site_offering%ROWTYPE;
  v_at timestamptz := clock_timestamp();
  v_stamp text;
  v_reason text := NULLIF(btrim(COALESCE(p_reason, '')), '');
  v_bad uuid[];
  v_pr bigint; v_ps bigint; v_wr bigint; v_ws bigint; v_changed boolean;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO v_site FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF v_site.id IS NULL THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF p_organization_id IS NULL OR v_site.organization_id <> p_organization_id OR v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_availability_scope_mismatch: explicit organization and site brand are required';
  END IF;
  IF p_available IS NULL THEN
    RAISE EXCEPTION 'offering_availability_required: say whether this site offers it';
  END IF;
  IF p_offering_ids IS NULL OR cardinality(p_offering_ids) = 0 THEN
    RAISE EXCEPTION 'offering_availability_none: choose at least one offering';
  END IF;
  SELECT array_agg(x) INTO v_bad FROM unnest(p_offering_ids) x
  WHERE NOT EXISTS (SELECT 1 FROM web.brand_offering bo WHERE bo.id = x
                      AND bo.brand_id = v_site.brand_id AND bo.status = 'active' AND bo.deleted_at IS NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'offering_availability_not_brand: % is not a live offering of this site''s brand', v_bad[1];
  END IF;

  FOR v_id IN SELECT DISTINCT x FROM unnest(p_offering_ids) x LOOP
    v_pr := 0; v_ps := 0; v_wr := 0; v_ws := 0; v_changed := false;
    SELECT * INTO v_row FROM web.site_offering so
    WHERE so.site_id = p_site_id AND so.brand_offering_id = v_id AND so.deleted_at IS NULL;

    IF p_available THEN
      IF v_row.id IS NULL THEN
        INSERT INTO web.site_offering (organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by)
        VALUES (p_organization_id, p_site_id, v_id, 'active',
                jsonb_build_object('availability', jsonb_build_object('at', v_at, 'by', auth.uid(), 'reason', v_reason, 'available', true)),
                auth.uid(), auth.uid());
        v_changed := true;
      ELSIF v_row.status <> 'active' THEN
        v_stamp := v_row.metadata #>> '{availability,at}';
        UPDATE web.site_offering so
        SET status = 'active',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_at, 'by', auth.uid(), 'reason', v_reason, 'available', true,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
        IF v_stamp IS NOT NULL THEN
          -- Restore exactly what stopping this offering took, and nothing a
          -- person has changed since.
          UPDATE seo.site_keyword_offering k
          SET deleted_at = NULL, metadata = k.metadata - 'removed_with_availability',
              updated_at = now(), updated_by = auth.uid()
          WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NOT NULL
            AND k.metadata ->> 'removed_with_availability' = v_stamp
            AND NOT EXISTS (SELECT 1 FROM seo.site_keyword_offering live
                            WHERE live.site_id = k.site_id AND live.keyword_id = k.keyword_id
                              AND live.deleted_at IS NULL
                              AND (live.brand_offering_id = k.brand_offering_id OR (k.is_primary AND live.is_primary)));
          GET DIAGNOSTICS v_ps = ROW_COUNT;
          UPDATE seo.site_offering_value v
          SET deleted_at = NULL, metadata = v.metadata - 'removed_with_availability',
              updated_at = now(), updated_by = auth.uid()
          WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NOT NULL
            AND v.metadata ->> 'removed_with_availability' = v_stamp
            AND NOT EXISTS (SELECT 1 FROM seo.site_offering_value live
                            WHERE live.site_id = v.site_id AND live.brand_offering_id = v.brand_offering_id
                              AND live.deleted_at IS NULL);
          GET DIAGNOSTICS v_ws = ROW_COUNT;
        END IF;
      END IF;
    ELSE
      IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
        UPDATE web.site_offering so
        SET status = 'inactive',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_at, 'by', auth.uid(), 'reason', v_reason, 'available', false,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
        UPDATE seo.site_keyword_offering k
        SET deleted_at = v_at, is_primary = k.is_primary,
            metadata = k.metadata || jsonb_build_object('removed_with_availability', v_at::text),
            updated_at = now(), updated_by = auth.uid()
        WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NULL;
        GET DIAGNOSTICS v_pr = ROW_COUNT;
        UPDATE seo.site_offering_value v
        SET deleted_at = v_at,
            metadata = v.metadata || jsonb_build_object('removed_with_availability', v_at::text),
            updated_at = now(), updated_by = auth.uid()
        WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NULL;
        GET DIAGNOSTICS v_wr = ROW_COUNT;
      END IF;
    END IF;

    RETURN QUERY SELECT v_id, v_changed, v_pr, v_ps, v_wr, v_ws;
  END LOOP;
END
$function$;

COMMENT ON FUNCTION web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) IS
  'THE site availability writer (brand-offerings D2): offer or stop offering brand offerings on one site, one or many. Stopping keeps the row inactive with the reason and removes this site''s placements and worth on it, stamped; offering it again restores exactly those rows. Never touches the brand catalog.';

-- 4. ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION web.move_site_offering(p_organization_id uuid, p_site_id uuid, p_offering_id uuid, p_parent_id uuid DEFAULT NULL::uuid, p_sibling_order uuid[] DEFAULT NULL::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'web', 'seo', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE v_site web.site%ROWTYPE; v_child uuid; v_sort integer := 0;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO STRICT v_site FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  -- D3: the hierarchy is the brand's catalog, so the offering must belong to
  -- this site's brand; whether this site offers it does not matter.
  IF v_site.organization_id <> p_organization_id OR NOT EXISTS (
    SELECT 1 FROM web.brand_offering bo
    WHERE bo.id = p_offering_id AND bo.brand_id = v_site.brand_id AND bo.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'offering_move_scope_mismatch'; END IF;

  IF p_parent_id IS NOT NULL THEN
    IF p_parent_id = p_offering_id OR EXISTS (
      WITH RECURSIVE up AS (
        SELECT bo.id, bo.parent_id, 0 AS depth FROM web.brand_offering bo WHERE bo.id = p_parent_id
        UNION ALL
        SELECT bo.id, bo.parent_id, up.depth + 1 FROM up
        JOIN web.brand_offering bo ON bo.id = up.parent_id
        WHERE up.depth < 64
      )
      SELECT 1 FROM up WHERE up.id = p_offering_id
    ) THEN
      RAISE EXCEPTION 'offering_move_cycle: an offering cannot be placed beneath itself or its own sub-offerings';
    END IF;
  END IF;

  UPDATE web.brand_offering
  SET parent_id = p_parent_id, updated_at = now(), updated_by = auth.uid()
  WHERE id = p_offering_id AND organization_id = p_organization_id;

  IF p_sibling_order IS NOT NULL THEN
    FOREACH v_child IN ARRAY p_sibling_order LOOP
      UPDATE web.brand_offering SET sort = v_sort, updated_at = now(), updated_by = auth.uid()
      WHERE id = v_child AND brand_id = v_site.brand_id
        AND organization_id = p_organization_id AND deleted_at IS NULL;
      v_sort := v_sort + 1;
    END LOOP;
  END IF;
  RETURN p_offering_id;
END
$function$;

-- Client doors ----------------------------------------------------------------

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose)
SELECT d.schema_name, d.function_name, d.identity_args, d.reason, false, NULL
FROM (VALUES
  ('web', 'brand_offering_catalog', 'p_site_id uuid',
   'Offerings screen read; asserts site access and reads only the site''s brand.'),
  ('web', 'site_offering_availability_impact', 'p_site_id uuid, p_offering_ids uuid[]',
   'Consequence preview before stopping an offering on a site; asserts site access.'),
  ('web', 'set_site_offering_availability', 'p_organization_id uuid, p_site_id uuid, p_offering_ids uuid[], p_available boolean, p_reason text',
   'Site availability writer; asserts site editor, explicit organization, same brand.')
) AS d(schema_name, function_name, identity_args, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.client_callable_door x
  WHERE x.schema_name = d.schema_name AND x.function_name = d.function_name
);

REVOKE ALL ON FUNCTION web.brand_offering_catalog(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION web.site_offering_availability_impact(uuid, uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION web.brand_offering_catalog(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.site_offering_availability_impact(uuid, uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) TO authenticated, service_role;

DO $do$
DECLARE r record; v_missing text := '';
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'web.brand_offering_catalog(uuid)',
      'web.site_offering_availability_impact(uuid,uuid[])',
      'web.set_site_offering_availability(uuid,uuid,uuid[],boolean,text)']) AS sig
  LOOP
    IF NOT has_function_privilege('authenticated', r.sig, 'EXECUTE') THEN
      v_missing := v_missing || ' ' || r.sig;
    END IF;
    IF has_function_privilege('anon', r.sig, 'EXECUTE') THEN
      RAISE EXCEPTION 'offering_door_anon: % is executable without an account', r.sig;
    END IF;
  END LOOP;
  IF v_missing <> '' THEN
    RAISE EXCEPTION 'offering_door_grant_did_not_stick:%', v_missing;
  END IF;
END
$do$;

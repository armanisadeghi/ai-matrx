-- Brand-offerings cutover, step 6h3: a reason given for offering something the
-- site already offers is kept (P24, capture the why).
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- Add offering adopts a platform suggestion (web.adopt_offering_template) or
-- creates the brand's own (web.save_site_offering); both already make it
-- available on the site in the same write and neither takes a reason. The
-- screen then records the person's reason through THE availability writer.
-- Until now that call changed nothing when the row was already active, so the
-- reason was silently dropped. It is now written onto the availability row
-- (metadata.availability.reason, with who and when), and `changed` stays false
-- because availability itself did not move. Stopping an offering that is
-- already stopped keeps its reason the same way.
--
-- based-on: web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) 5c0fe5527667995bbb55a2eeee3f3b6cb981e1c18506126a8bcf77c347331be4

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
  -- THE one stamp: the same text goes on the availability row and on every
  -- fact it removes.
  v_stamp text := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00:00"');
  v_removed_at timestamptz;
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
  v_at := v_stamp::timestamptz;

  FOR v_id IN SELECT DISTINCT x FROM unnest(p_offering_ids) x LOOP
    v_pr := 0; v_ps := 0; v_wr := 0; v_ws := 0; v_changed := false;
    v_row := NULL;
    SELECT * INTO v_row FROM web.site_offering so
    WHERE so.site_id = p_site_id AND so.brand_offering_id = v_id AND so.deleted_at IS NULL;

    IF v_row.id IS NOT NULL AND v_reason IS NOT NULL
       AND (v_row.status = 'active') = p_available THEN
      -- Availability does not move; the person's reason is still kept.
      UPDATE web.site_offering so
      SET metadata = so.metadata || jsonb_build_object('availability',
            COALESCE(so.metadata -> 'availability', '{}'::jsonb)
            || jsonb_build_object('reason', v_reason, 'reason_by', auth.uid(), 'reason_at', v_stamp)),
          updated_at = now(), updated_by = auth.uid()
      WHERE so.id = v_row.id;
    ELSIF p_available THEN
      IF v_row.id IS NULL THEN
        INSERT INTO web.site_offering (organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by)
        VALUES (p_organization_id, p_site_id, v_id, 'active',
                jsonb_build_object('availability', jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', true)),
                auth.uid(), auth.uid());
        v_changed := true;
      ELSIF v_row.status <> 'active' THEN
        v_removed_at := (v_row.metadata #>> '{availability,at}')::timestamptz;
        -- Availability first: the fact-scope trigger admits the restores below
        -- only once the offering is active on the site again.
        UPDATE web.site_offering so
        SET status = 'active',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', true,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
        IF v_removed_at IS NOT NULL THEN
          -- Restore exactly what stopping this offering took, and nothing a
          -- person has changed since.
          WITH restored AS (
            UPDATE seo.site_keyword_offering k
            SET deleted_at = NULL, metadata = k.metadata - 'removed_with_availability',
                updated_at = now(), updated_by = auth.uid()
            WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NOT NULL
              AND (k.metadata ->> 'removed_with_availability')::timestamptz = v_removed_at
              AND NOT EXISTS (SELECT 1 FROM seo.site_keyword_offering live
                              WHERE live.site_id = k.site_id AND live.keyword_id = k.keyword_id
                                AND live.deleted_at IS NULL
                                AND (live.brand_offering_id = k.brand_offering_id OR (k.is_primary AND live.is_primary)))
            RETURNING k.is_primary
          )
          SELECT count(*) FILTER (WHERE is_primary) INTO v_ps FROM restored;
          UPDATE seo.site_offering_value v
          SET deleted_at = NULL, metadata = v.metadata - 'removed_with_availability',
              updated_at = now(), updated_by = auth.uid()
          WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NOT NULL
            AND (v.metadata ->> 'removed_with_availability')::timestamptz = v_removed_at
            AND NOT EXISTS (SELECT 1 FROM seo.site_offering_value live
                            WHERE live.site_id = v.site_id AND live.brand_offering_id = v.brand_offering_id
                              AND live.deleted_at IS NULL);
          GET DIAGNOSTICS v_ws = ROW_COUNT;
        END IF;
      END IF;
    ELSE
      IF v_row.id IS NOT NULL AND v_row.status = 'active' THEN
        -- Facts first: the fact-scope trigger admits a write only while the
        -- offering is still available on the site.
        WITH removed AS (
          UPDATE seo.site_keyword_offering k
          SET deleted_at = v_at,
              metadata = k.metadata || jsonb_build_object('removed_with_availability', v_stamp),
              updated_at = now(), updated_by = auth.uid()
          WHERE k.site_id = p_site_id AND k.brand_offering_id = v_id AND k.deleted_at IS NULL
          RETURNING k.is_primary
        )
        SELECT count(*) FILTER (WHERE is_primary) INTO v_pr FROM removed;
        UPDATE seo.site_offering_value v
        SET deleted_at = v_at,
            metadata = v.metadata || jsonb_build_object('removed_with_availability', v_stamp),
            updated_at = now(), updated_by = auth.uid()
        WHERE v.site_id = p_site_id AND v.brand_offering_id = v_id AND v.deleted_at IS NULL;
        GET DIAGNOSTICS v_wr = ROW_COUNT;
        UPDATE web.site_offering so
        SET status = 'inactive',
            metadata = so.metadata || jsonb_build_object('availability',
              jsonb_build_object('at', v_stamp, 'by', auth.uid(), 'reason', v_reason, 'available', false,
                                 'previous', so.metadata -> 'availability')),
            updated_at = now(), updated_by = auth.uid()
        WHERE so.id = v_row.id;
        v_changed := true;
      END IF;
    END IF;

    RETURN QUERY SELECT v_id, v_changed, v_pr, v_ps, v_wr, v_ws;
  END LOOP;
END
$function$;

COMMENT ON FUNCTION web.set_site_offering_availability(uuid, uuid, uuid[], boolean, text) IS
  'THE site availability writer (brand-offerings D2): offer or stop offering brand offerings on one site, one or many. Stopping removes this site''s placements and worth on it under one stamp while the offering is still active, then keeps the row inactive with the reason; offering it again reactivates first and restores exactly the rows carrying that stamp. A reason given when availability does not move is still kept (P24). Counts are primary placements. Never touches the brand catalog.';

DO $do$
BEGIN
  IF NOT has_function_privilege('authenticated', 'web.set_site_offering_availability(uuid,uuid,uuid[],boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'offering_door_grant_did_not_stick: web.set_site_offering_availability';
  END IF;
  IF has_function_privilege('anon', 'web.set_site_offering_availability(uuid,uuid,uuid[],boolean,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'offering_door_anon: web.set_site_offering_availability is executable without an account';
  END IF;
END
$do$;

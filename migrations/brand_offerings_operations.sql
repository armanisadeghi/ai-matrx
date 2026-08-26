-- Brand-offering mutations and keyword placement.
-- Every writer accepts organization_id from the caller and validates it.

CREATE OR REPLACE FUNCTION web.move_site_offering(
  p_organization_id uuid, p_site_id uuid, p_offering_id uuid,
  p_parent_id uuid DEFAULT NULL, p_sibling_order uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
DECLARE v_site web.site%ROWTYPE; v_child uuid; v_sort integer := 0;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO STRICT v_site FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  IF v_site.organization_id <> p_organization_id OR NOT EXISTS (
    SELECT 1 FROM web.site_offering so
    JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE so.site_id = p_site_id AND bo.id = p_offering_id
      AND bo.brand_id = v_site.brand_id AND so.deleted_at IS NULL AND bo.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'offering_move_scope_mismatch'; END IF;

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

CREATE OR REPLACE FUNCTION web.site_offering_delete_impact(p_site_id uuid, p_offering_id uuid)
RETURNS TABLE(
  offering_id uuid, offering_name text, child_count bigint,
  keyword_count bigint, value_count bigint, other_site_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  RETURN QUERY
  SELECT bo.id, bo.name,
    (SELECT count(*) FROM web.brand_offering child WHERE child.parent_id = bo.id AND child.deleted_at IS NULL),
    (SELECT count(*) FROM seo.site_keyword_offering sko WHERE sko.site_id = p_site_id AND sko.brand_offering_id = bo.id AND sko.deleted_at IS NULL),
    (SELECT count(*) FROM seo.site_offering_value sov WHERE sov.site_id = p_site_id AND sov.brand_offering_id = bo.id AND sov.deleted_at IS NULL),
    (SELECT count(*) FROM web.site_offering so WHERE so.site_id <> p_site_id AND so.brand_offering_id = bo.id AND so.deleted_at IS NULL)
  FROM web.site_offering selected
  JOIN web.brand_offering bo ON bo.id = selected.brand_offering_id
  WHERE selected.site_id = p_site_id AND bo.id = p_offering_id
    AND selected.deleted_at IS NULL AND bo.deleted_at IS NULL;
END
$function$;

CREATE OR REPLACE FUNCTION web.remove_site_offering(
  p_organization_id uuid, p_site_id uuid, p_offering_id uuid,
  p_replacement_offering_id uuid DEFAULT NULL
)
RETURNS TABLE(offering_id uuid, offering_name text, keywords_reassigned bigint, brand_offering_retired boolean)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = web, seo, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE v_site web.site%ROWTYPE; v_name text; v_parent_id uuid; v_keyword_count bigint; v_retired boolean := false; v_primary_keywords uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT * INTO STRICT v_site FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  IF v_site.organization_id <> p_organization_id THEN RAISE EXCEPTION 'offering_delete_scope_mismatch'; END IF;
  SELECT bo.name, bo.parent_id INTO STRICT v_name, v_parent_id
  FROM web.site_offering so JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
  WHERE so.site_id = p_site_id AND bo.id = p_offering_id
    AND bo.brand_id = v_site.brand_id AND so.deleted_at IS NULL AND bo.deleted_at IS NULL;
  IF p_replacement_offering_id = p_offering_id THEN RAISE EXCEPTION 'offering_delete_replacement_same'; END IF;
  IF p_replacement_offering_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.site_offering so JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE so.site_id = p_site_id AND bo.id = p_replacement_offering_id
      AND bo.brand_id = v_site.brand_id AND so.deleted_at IS NULL AND bo.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'offering_delete_replacement_unavailable'; END IF;

  SELECT count(*) INTO v_keyword_count FROM seo.site_keyword_offering
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id AND deleted_at IS NULL;
  SELECT array_agg(keyword_id) INTO v_primary_keywords
  FROM seo.site_keyword_offering
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id
    AND is_primary AND deleted_at IS NULL;
  UPDATE seo.site_keyword_offering SET is_primary = false, updated_at = now(), updated_by = auth.uid()
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id
    AND is_primary AND deleted_at IS NULL;
  IF p_replacement_offering_id IS NOT NULL THEN
    INSERT INTO seo.site_keyword_offering AS target (
      organization_id, site_id, keyword_id, brand_offering_id, is_primary,
      confidence, assigned_by, notes, metadata, created_by, updated_by
    )
    SELECT p_organization_id, source.site_id, source.keyword_id, p_replacement_offering_id,
      source.keyword_id = ANY(COALESCE(v_primary_keywords, '{}'::uuid[])),
      source.confidence, source.assigned_by, source.notes,
      source.metadata || jsonb_build_object('reassigned_from_offering', p_offering_id),
      auth.uid(), auth.uid()
    FROM seo.site_keyword_offering source
    WHERE source.site_id = p_site_id AND source.brand_offering_id = p_offering_id
      AND source.deleted_at IS NULL
    ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL
    DO UPDATE SET is_primary = EXCLUDED.is_primary, confidence = EXCLUDED.confidence,
      assigned_by = EXCLUDED.assigned_by, notes = EXCLUDED.notes,
      updated_at = now(), updated_by = auth.uid();
  END IF;
  UPDATE seo.site_keyword_offering SET is_primary = false, deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id AND deleted_at IS NULL;
  UPDATE seo.site_offering_value SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id AND deleted_at IS NULL;
  UPDATE web.site_offering SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
  WHERE site_id = p_site_id AND brand_offering_id = p_offering_id AND deleted_at IS NULL;

  IF NOT EXISTS (SELECT 1 FROM web.site_offering WHERE brand_offering_id = p_offering_id AND deleted_at IS NULL) THEN
    UPDATE web.brand_offering SET parent_id = v_parent_id, updated_at = now(), updated_by = auth.uid()
    WHERE parent_id = p_offering_id AND brand_id = v_site.brand_id AND deleted_at IS NULL;
    UPDATE web.brand_offering SET status = 'retired', deleted_at = now(), updated_at = now(), updated_by = auth.uid()
    WHERE id = p_offering_id AND organization_id = p_organization_id;
    v_retired := true;
  END IF;
  RETURN QUERY SELECT p_offering_id, v_name, v_keyword_count, v_retired;
END
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_keyword_offerings_for(p_site_id uuid, p_keyword_ids uuid[])
RETURNS TABLE(
  keyword_id uuid, offering_id uuid, offering_name text, offering_kind text,
  root_id uuid, root_name text, root_kind text, lineage text,
  assigned_by text, confidence smallint, notes text, has_own_worth boolean,
  worth_from_id uuid, worth_from_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN RETURN; END IF;
  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 2,000 keywords per read';
  END IF;
  RETURN QUERY
  WITH RECURSIVE placed AS (
    SELECT sko.keyword_id AS kid, sko.brand_offering_id AS oid,
      sko.assigned_by AS aby, sko.confidence AS conf, sko.notes AS note
    FROM seo.site_keyword_offering sko
    WHERE sko.site_id = p_site_id AND sko.keyword_id = ANY(p_keyword_ids)
      AND sko.is_primary AND sko.deleted_at IS NULL
  ), chain AS (
    SELECT DISTINCT bo.id AS start_id, bo.id AS node_id, bo.name AS node_name,
      bo.kind AS node_kind, bo.parent_id, 0 AS depth
    FROM web.brand_offering bo WHERE bo.deleted_at IS NULL
      AND bo.id IN (SELECT p.oid FROM placed p)
    UNION ALL
    SELECT c.start_id, bo.id, bo.name, bo.kind, bo.parent_id, c.depth + 1
    FROM chain c JOIN web.brand_offering bo ON bo.id = c.parent_id AND bo.deleted_at IS NULL
    WHERE c.depth < 32
  ), root AS (
    SELECT DISTINCT ON (start_id) start_id, node_id, node_name, node_kind
    FROM chain ORDER BY start_id, depth DESC
  ), path AS (
    SELECT start_id, string_agg(node_name, ' › ' ORDER BY depth DESC) AS lineage
    FROM chain WHERE depth > 0 GROUP BY start_id
  ), worth AS (
    SELECT DISTINCT ON (c.start_id) c.start_id, c.node_id, c.node_name, c.depth
    FROM chain c JOIN seo.site_offering_value sov
      ON sov.brand_offering_id = c.node_id AND sov.site_id = p_site_id AND sov.deleted_at IS NULL
    ORDER BY c.start_id, c.depth
  )
  SELECT p.kid, p.oid, self.node_name, self.node_kind,
    r.node_id, r.node_name, r.node_kind, pa.lineage,
    p.aby, p.conf, p.note, COALESCE(w.depth = 0, false), w.node_id, w.node_name
  FROM placed p JOIN chain self ON self.start_id = p.oid AND self.depth = 0
  LEFT JOIN root r ON r.start_id = p.oid
  LEFT JOIN path pa ON pa.start_id = p.oid
  LEFT JOIN worth w ON w.start_id = p.oid;
END
$function$;

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_offering(
  p_organization_id uuid, p_site_id uuid, p_keyword_ids uuid[],
  p_offering_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE v_site_org uuid; v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO STRICT v_site_org FROM web.site WHERE id = p_site_id;
  IF v_site_org <> p_organization_id THEN RAISE EXCEPTION 'keyword_offering_scope_mismatch'; END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN RAISE EXCEPTION 'gsc_no_keywords'; END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go'; END IF;
  IF p_offering_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.site_offering so JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE so.site_id = p_site_id AND bo.id = p_offering_id
      AND so.status = 'active' AND so.deleted_at IS NULL AND bo.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'site_offering_unavailable: select the offering for this site first'; END IF;

  UPDATE seo.site_keyword_offering SET is_primary = false, updated_at = now(), updated_by = auth.uid()
  WHERE site_id = p_site_id AND keyword_id = ANY(p_keyword_ids) AND is_primary
    AND (p_offering_id IS NULL OR brand_offering_id <> p_offering_id);
  IF p_offering_id IS NOT NULL THEN
    INSERT INTO seo.site_keyword_offering AS sko (
      organization_id, site_id, keyword_id, brand_offering_id, is_primary,
      assigned_by, notes, metadata, created_by, updated_by
    )
    SELECT p_organization_id, p_site_id, kid, p_offering_id, true,
      'human', v_notes, '{}', auth.uid(), auth.uid()
    FROM unnest(p_keyword_ids) kid
    ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL
    DO UPDATE SET is_primary = true, assigned_by = 'human',
      notes = COALESCE(EXCLUDED.notes, sko.notes), updated_at = now(), updated_by = auth.uid();
  END IF;
  RETURN QUERY SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
END
$function$;

REVOKE ALL ON FUNCTION web.move_site_offering(uuid,uuid,uuid,uuid,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION web.site_offering_delete_impact(uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION web.remove_site_offering(uuid,uuid,uuid,uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seo.gsc_keyword_offerings_for(uuid,uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seo.gsc_set_keyword_offering(uuid,uuid,uuid[],uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION web.move_site_offering(uuid,uuid,uuid,uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.site_offering_delete_impact(uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION web.remove_site_offering(uuid,uuid,uuid,uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_offerings_for(uuid,uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_offering(uuid,uuid,uuid[],uuid,text) TO authenticated, service_role;

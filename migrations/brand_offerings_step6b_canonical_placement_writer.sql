-- Brand-offerings cutover, step 6b: ONE canonical placement writer, and the
-- legacy topic writers route offering writes through it.
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- Why now: step 6a moved the value resolver onto the canonical offering model.
-- The deployed screens and agents still write placements and worth through
-- seo.gsc_set_keyword_topic / seo.gsc_set_topic_value (seo.keyword_topic /
-- seo.site_topic_value). Until those callers move, every such write must ALSO
-- land canonically, or a placement a person makes stops changing the score.
--
-- 1. seo.write_site_keyword_offering - THE placement writer. Every placement,
--    human or agent, from a screen or a job, goes through it. It refuses an
--    offering the site has not made available (plan step 7), refuses a
--    cross-organization write, and never lets an agent overwrite a human
--    ruling (P12). Not client-callable: signed-in callers reach it through
--    seo.gsc_set_keyword_offering, service jobs call it as service_role.
-- 2. seo.gsc_set_keyword_offering becomes: assert editor, write through (1),
--    answer with the resolver.
-- 3. seo.fn_site_offering_for_topic - TRANSITION ONLY: maps a legacy seo.topic
--    offering node to this site's brand offering, adopting it (with its
--    offering ancestors) when the site does not expose it yet. Deleted with the
--    legacy topic writers.
-- 4. seo.gsc_set_keyword_topic / seo.gsc_set_topic_value keep their current
--    writes (legacy readers still read them) and additionally write the
--    canonical rows for offering topics. Each is marked TRANSITION in its body.
-- 5. Re-runs the step 6a reconcile for every live site with a brand, catching
--    anything written between the two applies.
--
-- based-on: seo.gsc_set_keyword_offering(uuid, uuid, uuid[], uuid, text) 22b04a21ee567a8bc3440e5683b51f9e71cd79f7adb32e7866fcfa1c2302090b
-- based-on: seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text) cecc01f884d4f25ca4785dfb8556cc790e9f40fb1cd2ec87827d3111c301cef5
-- based-on: seo.gsc_set_topic_value(uuid, uuid, numeric, text, text, text, boolean) 6f19d80249ed756792e265cd488bd2779c2446659ce1a78706593bc041efd1f0

-- 1. THE placement writer -------------------------------------------------------

CREATE OR REPLACE FUNCTION seo.write_site_keyword_offering(
  p_organization_id uuid,
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_offering_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_assigned_by text DEFAULT 'human',
  p_confidence smallint DEFAULT NULL,
  p_placement jsonb DEFAULT NULL
)
RETURNS TABLE(written bigint, removed bigint, human_protected bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_site_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_ids uuid[];
  v_written bigint := 0;
  v_removed bigint := 0;
  v_protected bigint := 0;
BEGIN
  SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF p_organization_id IS NULL OR v_site_org <> p_organization_id THEN
    RAISE EXCEPTION 'keyword_offering_scope_mismatch: that organization does not own this site';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;
  IF p_assigned_by NOT IN ('human', 'agent') THEN
    RAISE EXCEPTION 'keyword_offering_assigner_invalid: a placement is made by a human or an agent, got %', p_assigned_by;
  END IF;
  IF p_offering_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM web.site_offering so
    JOIN web.brand_offering bo ON bo.id = so.brand_offering_id
    WHERE so.site_id = p_site_id AND bo.id = p_offering_id
      AND so.status = 'active' AND so.deleted_at IS NULL
      AND bo.status = 'active' AND bo.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'site_offering_unavailable: select the offering for this site first';
  END IF;

  -- P12: an agent never demotes, re-points or re-confirms a person's ruling.
  IF p_assigned_by = 'human' THEN
    v_ids := ARRAY(SELECT DISTINCT unnest(p_keyword_ids));
  ELSE
    v_ids := ARRAY(
      SELECT DISTINCT k FROM unnest(p_keyword_ids) k
      WHERE NOT EXISTS (
        SELECT 1 FROM seo.site_keyword_offering h
        WHERE h.site_id = p_site_id AND h.keyword_id = k AND h.is_primary
          AND h.deleted_at IS NULL AND h.assigned_by = 'human'));
    v_protected := (SELECT count(DISTINCT k) FROM unnest(p_keyword_ids) k) - COALESCE(array_length(v_ids, 1), 0);
  END IF;

  IF COALESCE(array_length(v_ids, 1), 0) > 0 THEN
    UPDATE seo.site_keyword_offering
    SET is_primary = false, updated_at = now(), updated_by = auth.uid()
    WHERE site_id = p_site_id AND keyword_id = ANY (v_ids) AND is_primary AND deleted_at IS NULL
      AND (p_offering_id IS NULL OR brand_offering_id <> p_offering_id);
    GET DIAGNOSTICS v_removed = ROW_COUNT;

    IF p_offering_id IS NOT NULL THEN
      INSERT INTO seo.site_keyword_offering AS sko (
        organization_id, site_id, keyword_id, brand_offering_id, is_primary,
        confidence, assigned_by, notes, metadata, created_by, updated_by
      )
      SELECT p_organization_id, p_site_id, kid, p_offering_id, true,
             p_confidence, p_assigned_by, v_notes,
             CASE WHEN p_placement IS NULL THEN '{}'::jsonb
                  ELSE jsonb_build_object('placement', p_placement) END,
             auth.uid(), auth.uid()
      FROM unnest(v_ids) kid
      ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL
      DO UPDATE SET
        is_primary = true,
        assigned_by = EXCLUDED.assigned_by,
        confidence = CASE WHEN EXCLUDED.assigned_by = 'agent' THEN EXCLUDED.confidence ELSE sko.confidence END,
        -- A new reason replaces the old one; placing again without a reason
        -- never erases the sentence someone already wrote.
        notes = COALESCE(EXCLUDED.notes, sko.notes),
        metadata = sko.metadata || EXCLUDED.metadata,
        updated_at = now(),
        updated_by = auth.uid();
      GET DIAGNOSTICS v_written = ROW_COUNT;
    END IF;
  END IF;

  RETURN QUERY SELECT v_written, v_removed, v_protected;
END
$function$;

REVOKE ALL ON FUNCTION seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) TO service_role;
COMMENT ON FUNCTION seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) IS
  'THE keyword placement writer (brand-offerings cutover). Site-scoped; refuses unavailable offerings and cross-organization writes; agents never overwrite a human ruling (P12). Signed-in callers use seo.gsc_set_keyword_offering; service jobs call this as service_role.';

-- 2. The signed-in door ---------------------------------------------------------

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_offering(
  p_organization_id uuid, p_site_id uuid, p_keyword_ids uuid[],
  p_offering_id uuid DEFAULT NULL, p_notes text DEFAULT NULL
)
RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  PERFORM 1 FROM seo.write_site_keyword_offering(
    p_organization_id, p_site_id, p_keyword_ids, p_offering_id, p_notes, 'human');
  RETURN QUERY SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
END
$function$;

-- 3. TRANSITION: legacy topic id -> this site's brand offering -----------------

CREATE OR REPLACE FUNCTION seo.fn_site_offering_for_topic(p_site_id uuid, p_topic_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
DECLARE
  v_site web.site%ROWTYPE;
  v_node record;
  v_parent uuid;
  v_bo uuid;
BEGIN
  SELECT * INTO v_site FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'gsc_site_not_found: %', p_site_id USING ERRCODE = 'P0002';
  END IF;
  IF v_site.brand_id IS NULL THEN
    RAISE EXCEPTION 'offering_site_has_no_brand: give this site a brand before placing keywords on its offerings';
  END IF;

  FOR v_node IN
    WITH RECURSIVE lineage AS (
      SELECT t.id, t.parent_id, t.name, t.slug, t.node_type, t.description, t.metadata,
             t.created_by, t.updated_by, 0 AS depth
      FROM seo.topic t
      WHERE t.id = p_topic_id AND t.deleted_at IS NULL AND t.node_type IN ('product', 'service')
      UNION ALL
      SELECT p.id, p.parent_id, p.name, p.slug, p.node_type, p.description, p.metadata,
             p.created_by, p.updated_by, c.depth + 1
      FROM lineage c
      JOIN seo.topic p ON p.id = c.parent_id AND p.deleted_at IS NULL AND p.node_type IN ('product', 'service')
      WHERE c.depth < 32
    )
    SELECT * FROM lineage ORDER BY depth DESC
  LOOP
    v_bo := NULL;
    SELECT bo.id INTO v_bo
    FROM web.brand_offering bo
    WHERE bo.brand_id = v_site.brand_id AND bo.deleted_at IS NULL
      AND (bo.template_id = v_node.id
        OR (bo.template_id IS NULL AND bo.metadata->>'source_topic_id' = v_node.id::text))
    ORDER BY (bo.template_id IS NULL), bo.created_at
    LIMIT 1;

    IF v_bo IS NULL THEN
      INSERT INTO web.brand_offering (
        organization_id, brand_id, template_id, parent_id, name, slug, kind, description,
        status, adopted_at, sort, metadata, created_by, updated_by
      ) VALUES (
        v_site.organization_id, v_site.brand_id,
        (SELECT ot.id FROM web.offering_template ot WHERE ot.id = v_node.id AND ot.deleted_at IS NULL),
        v_parent, v_node.name,
        CASE WHEN EXISTS (
               SELECT 1 FROM web.brand_offering x
               WHERE x.brand_id = v_site.brand_id AND x.slug = v_node.slug AND x.deleted_at IS NULL)
             THEN v_node.slug || '-' || left(v_node.id::text, 8) ELSE v_node.slug END,
        v_node.node_type, v_node.description, 'active', now(),
        COALESCE((v_node.metadata->>'sort')::integer, 0),
        jsonb_build_object('migrated_from', 'seo.topic', 'source_topic_id', v_node.id,
                           'adopted_through', 'legacy topic writer'),
        auth.uid(), auth.uid()
      ) RETURNING id INTO v_bo;
    END IF;

    INSERT INTO web.site_offering AS so (
      organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
    ) VALUES (
      v_site.organization_id, p_site_id, v_bo, 'active',
      jsonb_build_object('adopted_through', 'legacy topic writer'), auth.uid(), auth.uid()
    )
    ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
    DO UPDATE SET status = 'active', updated_at = now(), updated_by = auth.uid()
    WHERE so.status <> 'active';

    v_parent := v_bo;
  END LOOP;

  IF v_bo IS NULL THEN
    RAISE EXCEPTION 'offering_topic_not_found: % is not a live product or service', p_topic_id USING ERRCODE = 'P0002';
  END IF;
  RETURN v_bo;
END
$function$;

REVOKE ALL ON FUNCTION seo.fn_site_offering_for_topic(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.fn_site_offering_for_topic(uuid, uuid) TO service_role;
COMMENT ON FUNCTION seo.fn_site_offering_for_topic(uuid, uuid) IS
  'TRANSITION ONLY (brand-offerings cutover). Maps a legacy seo.topic offering node to the site''s brand offering, adopting it with its offering ancestors when needed. Deleted with the legacy topic writers.';

-- 4a. Legacy placement writer: also writes the canonical placement --------------

CREATE OR REPLACE FUNCTION seo.gsc_set_keyword_topic(p_site_id uuid, p_keyword_ids uuid[], p_topic_id uuid DEFAULT NULL::uuid, p_notes text DEFAULT NULL::text)
 RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
-- The OUT parameter `keyword_id` shadows the column in ON CONFLICT without
-- this — the same pragma gsc_set_keyword_value already carries.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
  v_node_type text;
  v_offering uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  -- The same ceiling `gsc_set_keyword_stamps` carries, said the same way.
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  IF p_topic_id IS NOT NULL THEN
    SELECT t.node_type INTO v_node_type FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
    END IF;
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- TRANSITION (brand-offerings cutover): the value resolver reads the
  -- canonical placement. An offering placement is written through THE
  -- placement writer; a taxonomy placement or a removal takes the keyword off
  -- this site's offerings. Deleted when every caller writes offerings directly.
  IF p_topic_id IS NOT NULL AND v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, v_offering, v_notes, 'human');
  ELSE
    PERFORM 1 FROM seo.write_site_keyword_offering(v_org, p_site_id, p_keyword_ids, NULL, NULL, 'human');
  END IF;

  -- P30: placing a keyword while working a SITE states THAT SITE's opinion.
  -- Demotion (freeing the one-primary-per-scope index before the insert
  -- below) is scoped to this site's own rows only — a site placement can
  -- never demote, and therefore never overwrite, a brand/organization/system
  -- row for the same keyword.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND kt.scope_tier = 'site' AND kt.scope_site_id = p_site_id
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  -- The ON CONFLICT arbiter is uq_keyword_topic_site_scope
  -- (keyword_id, topic_id, scope_site_id) WHERE scope_tier='site' — it can
  -- only ever match another scope_tier='site' row for THIS site, so this
  -- upsert can never touch a higher tier's row even when that tier chose the
  -- exact same topic for the exact same keyword.
  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by,
     notes, scope_tier, scope_site_id)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human',
         v_notes, 'site', p_site_id
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id, scope_site_id) WHERE (scope_tier = 'site')
  DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    -- A new reason replaces the old one; placing again WITHOUT a reason never
    -- erases the sentence someone already wrote.
    notes = COALESCE(EXCLUDED.notes, kt.notes),
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
EXCEPTION
  WHEN unique_violation THEN
    -- The table-wide keyword_id+topic_id constraint (kept for
    -- gsc_topic_delete's cross-tier merge) is the only other unique key that
    -- could still fire here — only when a higher tier already claimed the
    -- exact same topic for this exact keyword. Fail loud rather than let the
    -- upsert silently mutate that tier's row.
    RAISE EXCEPTION 'seo_topic_tier_conflict: keyword % already carries topic % at another tier — place it under a different Offering, or edit that tier''s placement directly', p_keyword_ids, p_topic_id
      USING ERRCODE = '23505';
END;
$function$;

-- 4b. Legacy worth writer: also writes the canonical offering worth -------------

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
  -- canonical offering value. A legacy call that leaves worth blank meant
  -- "50" to the resolver, so that is what is written, and said so.
  IF v_node_type IN ('product', 'service') THEN
    v_offering := seo.fn_site_offering_for_topic(p_site_id, p_topic_id);
    IF p_clear THEN
      UPDATE seo.site_offering_value SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
      WHERE site_id = p_site_id AND brand_offering_id = v_offering AND deleted_at IS NULL;
    ELSE
      INSERT INTO seo.site_offering_value AS sov (
        organization_id, site_id, brand_offering_id, worth_points, lead_quality,
        offering_match, notes, metadata, created_by, updated_by
      ) VALUES (
        v_org, p_site_id, v_offering, COALESCE(p_weight, 50), p_lead_quality, p_offering_match,
        NULLIF(btrim(COALESCE(p_notes, '')), ''),
        jsonb_build_object('written_through', 'seo.gsc_set_topic_value',
                           'worth_points_from_resolver_default', p_weight IS NULL),
        auth.uid(), auth.uid()
      )
      ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
      DO UPDATE SET worth_points = EXCLUDED.worth_points, lead_quality = EXCLUDED.lead_quality,
        offering_match = EXCLUDED.offering_match, notes = EXCLUDED.notes,
        metadata = sov.metadata || EXCLUDED.metadata,
        updated_at = now(), updated_by = auth.uid();
    END IF;
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

-- 5. Catch writes made between the two applies ---------------------------------

DO $do$
DECLARE r record; t record;
  v_sites int := 0; v_off bigint := 0; v_av bigint := 0; v_w bigint := 0; v_d bigint := 0;
  v_val bigint := 0; v_cl bigint := 0; v_sk bigint := 0;
BEGIN
  FOR r IN SELECT s.id FROM web.site s WHERE s.deleted_at IS NULL AND s.brand_id IS NOT NULL ORDER BY s.id LOOP
    SELECT * INTO t FROM seo.fn_reconcile_site_offering_facts(r.id);
    v_sites := v_sites + 1;
    v_off := v_off + t.offerings_created; v_av := v_av + t.availability_created;
    v_w := v_w + t.placements_written; v_d := v_d + t.placements_demoted;
    v_val := v_val + t.worth_written; v_cl := v_cl + t.worth_cleared; v_sk := v_sk + t.placements_skipped_unavailable;
  END LOOP;
  RAISE NOTICE 'offering reconcile (6b catch-up): % sites, % offerings created, % availability rows, % placements written, % demoted, % worth written, % worth cleared, % skipped',
    v_sites, v_off, v_av, v_w, v_d, v_val, v_cl, v_sk;
END
$do$;

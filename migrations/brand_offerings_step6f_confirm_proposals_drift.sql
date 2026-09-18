-- Brand-offerings cutover, step 6f: confirming an AI placement keeps the
-- person's reason, the proposals read and the drift read move to the site's
-- own placements, and the drift read finishes on a large site (D313).
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md.
--
-- 1. seo.write_site_keyword_offering stamps every row it demotes with
--    metadata.demoted = {at, by, replaced_by}. That marker is what "the AI moved
--    this keyword" means on the canonical model; the reconcile's own demotions
--    (another organization's copied rulings) never carry it.
-- 2. seo.gsc_confirm_keyword_offering - Confirm on a site's own placement. The
--    legacy confirm flipped a row shared by every tenant, so a site's reason had
--    no safe home (P24). This one writes only this site's row, keeps the reason
--    in `notes`, and makes the placement the site's own ruling
--    (assigned_by = 'human'), so the assigner never revisits it (P12). The
--    placement's provenance stays in metadata.placement.
-- 3. seo.gsc_offering_proposed_keywords - the unsure AI placements on this
--    site's own offerings, highest demand first (canonical twin of
--    seo.gsc_topic_proposed_keywords, which read every tenant's rows).
-- 4. seo.gsc_offering_placement_drift - an AI placement on this site that moved
--    from one offering to another and that nobody on this site has ruled on.
--    Set-based and bounded by this site's own AI placements: one index probe per
--    candidate, never a per-keyword walk of history.row_versions, which is why
--    seo.gsc_topic_placement_diff never finished for All Green Recycling (D313).
--
-- based-on: seo.write_site_keyword_offering(uuid, uuid, uuid[], uuid, text, text, smallint, jsonb) 886a62057ff18bc66015758a585110bb6fa625598c0052a73b5476e0d89b6296

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
    SET is_primary = false,
        -- WHO MOVED IT, and to what: the drift read's evidence.
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'demoted', jsonb_build_object('at', now(), 'by', p_assigned_by, 'replaced_by', p_offering_id)),
        updated_at = now(), updated_by = auth.uid()
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
        metadata = (sko.metadata - 'demoted') || EXCLUDED.metadata,
        updated_at = now(),
        updated_by = auth.uid();
      GET DIAGNOSTICS v_written = ROW_COUNT;
    END IF;
  END IF;

  RETURN QUERY SELECT v_written, v_removed, v_protected;
END
$function$;

-- 2. Confirm keeps the reason ----------------------------------------------------

CREATE OR REPLACE FUNCTION seo.gsc_confirm_keyword_offering(
  p_organization_id uuid,
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_notes text DEFAULT NULL
)
RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_site_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT s.organization_id INTO v_site_org FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF p_organization_id IS NULL OR v_site_org IS DISTINCT FROM p_organization_id THEN
    RAISE EXCEPTION 'keyword_offering_scope_mismatch: that organization does not own this site';
  END IF;
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  UPDATE seo.site_keyword_offering sko
     SET assigned_by = 'human',
         -- P24: the reason lives on THIS site's placement, and a confirm without
         -- one never erases a reason someone already wrote.
         notes = COALESCE(v_notes, sko.notes),
         metadata = (COALESCE(sko.metadata, '{}'::jsonb) - 'demoted') || jsonb_build_object(
           'placement', COALESCE(sko.metadata->'placement', '{}'::jsonb) || jsonb_build_object(
             'confirmed', true,
             'confirmed_at', now(),
             'confirmed_by', auth.uid(),
             'confirmed_from', sko.assigned_by)),
         updated_at = now(),
         updated_by = auth.uid()
   WHERE sko.site_id = p_site_id
     AND sko.keyword_id = ANY (p_keyword_ids)
     AND sko.is_primary
     AND sko.deleted_at IS NULL;

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
END
$function$;

-- 3. The unsure AI placements on this site -------------------------------------

CREATE OR REPLACE FUNCTION seo.gsc_offering_proposed_keywords(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(keyword_id uuid, phrase text, offering_id uuid, offering_name text, confidence smallint,
              clicks bigint, impressions bigint, value_band text, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  proposed AS MATERIALIZED (
    SELECT w.kw_id, k.normalized_phrase AS phrase, w.clicks, w.impressions,
           sko.brand_offering_id AS oid, bo.name AS oname, sko.confidence AS conf
    FROM win w
    JOIN seo.keyword k ON k.id = w.kw_id AND k.deleted_at IS NULL
    JOIN seo.site_keyword_offering sko
      ON sko.site_id = p_site_id AND sko.keyword_id = w.kw_id
     AND sko.is_primary AND sko.deleted_at IS NULL
    JOIN web.brand_offering bo ON bo.id = sko.brand_offering_id AND bo.deleted_at IS NULL
    WHERE sko.metadata #>> '{placement,confirmed}' = 'false'
      AND sko.assigned_by IS DISTINCT FROM 'human'
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
  ),
  page AS MATERIALIZED (
    SELECT p.* FROM proposed p
    ORDER BY p.clicks DESC, p.impressions DESC, p.phrase
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ),
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(pg.kw_id) FROM page pg)) m
  )
  SELECT p.kw_id, p.phrase, p.oid, p.oname, p.conf, p.clicks, p.impressions,
         COALESCE(vm.band, 'unvalued'),
         (SELECT count(*) FROM proposed)::bigint
  FROM page p
  LEFT JOIN vm ON vm.kw_id = p.kw_id
  ORDER BY p.clicks DESC, p.impressions DESC, p.phrase;
END
$function$;

-- 4. The AI moved a placement nobody here has ruled on (D313) ------------------

CREATE OR REPLACE FUNCTION seo.gsc_offering_placement_drift(p_site_id uuid, p_limit integer DEFAULT 50)
RETURNS TABLE(keyword_id uuid, phrase text, old_offering_id uuid, old_offering_name text,
              new_offering_id uuid, new_offering_name text, confidence smallint, changed_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = seo, web, iam, public, pg_temp
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH moved AS MATERIALIZED (
    SELECT DISTINCT ON (cur.keyword_id)
           cur.keyword_id, cur.brand_offering_id AS new_id, cur.confidence, cur.updated_at,
           prev.brand_offering_id AS old_id
    FROM seo.site_keyword_offering cur
    JOIN seo.site_keyword_offering prev
      ON prev.site_id = p_site_id
     AND prev.keyword_id = cur.keyword_id
     AND prev.deleted_at IS NULL
     AND NOT prev.is_primary
     AND prev.metadata #>> '{demoted,by}' = 'agent'
     AND prev.metadata #>> '{demoted,replaced_by}' = cur.brand_offering_id::text
    WHERE cur.site_id = p_site_id
      AND cur.is_primary
      AND cur.deleted_at IS NULL
      AND cur.assigned_by IS DISTINCT FROM 'human'
      AND NOT EXISTS (
        SELECT 1 FROM seo.site_keyword_offering h
        WHERE h.site_id = p_site_id AND h.keyword_id = cur.keyword_id
          AND h.assigned_by = 'human' AND h.deleted_at IS NULL)
    ORDER BY cur.keyword_id, prev.updated_at DESC
  )
  SELECT m.keyword_id, k.phrase, m.old_id, obo.name, m.new_id, nbo.name, m.confidence, m.updated_at
  FROM moved m
  JOIN seo.keyword k ON k.id = m.keyword_id
  JOIN web.brand_offering nbo ON nbo.id = m.new_id
  LEFT JOIN web.brand_offering obo ON obo.id = m.old_id
  ORDER BY m.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
END
$function$;

-- Client doors: signed-in site members only ------------------------------------

INSERT INTO platform.client_callable_door (schema_name, function_name, identity_args, reason, anonymous_callers, anonymous_purpose, declared_by)
SELECT d.schema_name, d.function_name, d.identity_args, d.reason, false, NULL, 'brand-offerings cutover 6f'
FROM (VALUES
  ('seo', 'gsc_confirm_keyword_offering', 'p_organization_id uuid, p_site_id uuid, p_keyword_ids uuid[], p_notes text',
   'SIGNED-IN door. Confirm the AI''s placement as this site''s own ruling, with the reason. Gated by seo.gsc_assert_site_editor plus an organization check.'),
  ('seo', 'gsc_offering_proposed_keywords', 'p_site_id uuid, p_start date, p_end date, p_search text, p_limit integer, p_offset integer',
   'SIGNED-IN door. The unsure AI placements on this site''s own offerings. Gated by seo.gsc_assert_site_access.'),
  ('seo', 'gsc_offering_placement_drift', 'p_site_id uuid, p_limit integer',
   'SIGNED-IN door. AI placements on this site that moved and nobody here has ruled on. Gated by seo.gsc_assert_site_access.')
) AS d(schema_name, function_name, identity_args, reason)
WHERE NOT EXISTS (
  SELECT 1 FROM platform.client_callable_door x
  WHERE x.schema_name = d.schema_name AND x.function_name = d.function_name
);

GRANT EXECUTE ON FUNCTION seo.gsc_confirm_keyword_offering(uuid, uuid, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_offering_proposed_keywords(uuid, date, date, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_offering_placement_drift(uuid, integer) TO authenticated;

DO $do$
DECLARE r record; v_missing text := '';
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'seo.gsc_confirm_keyword_offering(uuid,uuid,uuid[],text)',
      'seo.gsc_offering_proposed_keywords(uuid,date,date,text,integer,integer)',
      'seo.gsc_offering_placement_drift(uuid,integer)']) AS sig
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

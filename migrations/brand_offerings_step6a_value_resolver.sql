-- Brand-offerings cutover, step 6a: the value resolver reads the canonical offering model.
--
-- Plan of record: docs/db_rebuild/proposals/brand-offerings-cutover.md (D1-D10).
--
-- What this file does, in order:
--   1. D9 - worth is POINTS. `seo.site_offering_value.weight` (constrained 0-100)
--      becomes `worth_points`, unbounded, NOT NULL: the number of points an
--      offering adds to a keyword's score, exactly the `add` term the resolver
--      already consumed from `seo.site_topic_value.weight`
--      (score = (baseline + points + stamp adds) x factors, floored at 0).
--   2. Seeds `web.offering_template` for the platform-authored service/product
--      topics created after the 2026-08-25 seed (all owned by Matrx System).
--   3. Installs `seo.fn_reconcile_site_offering_facts(site)`: brings a site's
--      canonical rows (brand offerings, explicit availability, keyword
--      placements, offering worth) into agreement with the placements and
--      worth still being written to the old tables. The 2026-08-25 backfill ran
--      once and nothing wrote the canonical tables after it. The function is a
--      transition tool: it is retired when every writer writes the canonical
--      tables (step 3 of the cutover) and never runs on a schedule of its own.
--   4. Runs it for every live site that has a brand, and makes `worth_points`
--      NOT NULL.
--   5. Replaces `seo.keyword_value_map`: offering placements and worth come from
--      `seo.site_keyword_offering` / `web.brand_offering` /
--      `seo.site_offering_value`; genuine taxonomy placements
--      (brand/problem/authority/reputation) still come from `seo.keyword_topic`
--      and `seo.site_topic_value`, now resolved on THE ONE LADDER instead of
--      reading every tenant's rows.
--   6. Teaches the three database readers of the resolver's base step that the
--      step is now `kind: 'offering'` for an offering base.
--   7. Replaces `seo.set_site_offering_value` with the D9 shape (points, plus
--      the three judgment columns the valuation agent writes).
--
-- Equivalence proof: scripts/check-offering-resolver-equivalence.ts
--   --dry-run this file (rolled back) and --snapshot / --compare around the apply.
--
-- based-on: seo.keyword_value_map(uuid, uuid[]) 63fc85a8faaced526c3776d0bacb9667e7d577557400f920b74b74b5a49ba290
-- based-on: seo.starter_pack_preview(uuid, uuid, date, date, uuid[], integer) 942abf5dff3f383dfe554883757550bd5a1f15249fe12ed5ba42cf0d0a15813e
-- based-on: seo.gsc_value_worth_preview(uuid, date, date, uuid, text, numeric, integer) 630a68d02bd0566f009df4dbf813e118583c757bc8e225b67268adc240e65bad
-- based-on: seo.gsc_value_combo_preview(uuid, date, date, uuid[], text, numeric, uuid, integer) e12b97125d567447558131804315ebb1fe01310e52c5b104a384600068804f54
-- based-on: seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean) 61c6fda1bd3ef5f7249a2de751792f1fb7acb1dfd02d7b5eb4db8b311c551524

-- 1. D9: worth is points ------------------------------------------------------

DO $do$
DECLARE r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'seo' AND table_name = 'site_offering_value' AND column_name = 'weight'
  ) THEN
    FOR r IN
      SELECT conname FROM pg_constraint
      WHERE conrelid = 'seo.site_offering_value'::regclass AND contype = 'c'
        AND pg_get_constraintdef(oid) ~ '\mweight\M'
    LOOP
      EXECUTE format('ALTER TABLE seo.site_offering_value DROP CONSTRAINT %I', r.conname);
    END LOOP;
    ALTER TABLE seo.site_offering_value RENAME COLUMN weight TO worth_points;
  END IF;
END
$do$;

COMMENT ON COLUMN seo.site_offering_value.worth_points IS
  'Points this offering adds to the score of every keyword placed on it or beneath it for this site (KI-001): score = (baseline + points + stamp adds) x factors, floored at 0. A points value, never a 0-100 weight.';

-- 2. Platform templates for platform-authored offering topics ------------------

INSERT INTO web.offering_template (
  id, organization_id, visibility, name, slug, kind, description, aliases,
  status, sort, metadata, created_at, updated_at, created_by, updated_by
)
SELECT t.id, '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, 'public'::platform.visibility,
       t.name, t.slug, t.node_type, t.description, t.aliases, 'active',
       COALESCE((t.metadata->>'sort')::integer, 0),
       t.metadata || jsonb_build_object('migrated_from', 'seo.topic'),
       t.created_at, t.updated_at, t.created_by, t.updated_by
FROM seo.topic t
WHERE t.deleted_at IS NULL
  AND t.node_type IN ('product', 'service')
  AND t.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
  AND NOT EXISTS (SELECT 1 FROM web.offering_template ot WHERE ot.id = t.id)
  AND NOT EXISTS (
    SELECT 1 FROM web.offering_template ot
    WHERE ot.slug = t.slug AND ot.deleted_at IS NULL
  )
ON CONFLICT (id) DO NOTHING;

UPDATE web.offering_template child
SET parent_id = source.parent_id
FROM seo.topic source
JOIN web.offering_template parent ON parent.id = source.parent_id AND parent.deleted_at IS NULL
WHERE child.id = source.id AND child.parent_id IS DISTINCT FROM source.parent_id;

-- 3. The transition reconcile --------------------------------------------------

CREATE OR REPLACE FUNCTION seo.fn_reconcile_site_offering_facts(p_site_id uuid)
RETURNS TABLE (
  site_id uuid,
  offerings_created bigint,
  availability_created bigint,
  placements_written bigint,
  placements_demoted bigint,
  worth_written bigint,
  worth_cleared bigint,
  placements_skipped_unavailable bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $function$
#variable_conflict use_column
DECLARE
  v_site web.site%ROWTYPE;
  v_offerings bigint := 0;
  v_availability bigint := 0;
  v_written bigint := 0;
  v_demoted bigint := 0;
  v_worth bigint := 0;
  v_cleared bigint := 0;
  v_skipped bigint := 0;
  v_n bigint;
BEGIN
  SELECT * INTO v_site FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL;
  IF NOT FOUND OR v_site.brand_id IS NULL THEN
    RAISE NOTICE 'offering reconcile skipped site %: no live site with a brand', p_site_id;
    RETURN QUERY SELECT p_site_id, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint, 0::bigint;
    RETURN;
  END IF;

  DROP TABLE IF EXISTS _rso_winner;
  DROP TABLE IF EXISTS _rso_selected;
  DROP TABLE IF EXISTS _rso_map;

  -- The site's own answer for every keyword in its corpus: THE ONE LADDER
  -- (site > brand > organization > system, nearest wins, primary rows only),
  -- kept only when the winning topic is an offering.
  CREATE TEMP TABLE _rso_winner ON COMMIT DROP AS
  WITH corpus AS (
    SELECT spd.keyword_id AS kw FROM seo.search_performance_daily spd
    WHERE spd.site_id = v_site.id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id FROM seo.site_keyword_value skv
    WHERE skv.site_id = v_site.id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
    UNION
    SELECT kt.keyword_id FROM seo.keyword_topic kt
    WHERE kt.scope_tier = 'site' AND kt.scope_site_id = v_site.id AND kt.deleted_at IS NULL
  ), ladder AS (
    SELECT DISTINCT ON (kt.keyword_id)
      kt.keyword_id, kt.topic_id, kt.id AS kt_id, kt.scope_tier, kt.confidence,
      kt.assigned_by, kt.notes, kt.metadata, kt.created_by, kt.updated_by
    FROM corpus c
    JOIN seo.keyword_topic kt ON kt.keyword_id = c.kw AND kt.is_primary AND kt.deleted_at IS NULL
    WHERE (kt.scope_tier = 'site' AND kt.scope_site_id = v_site.id)
       OR (kt.scope_tier = 'brand' AND kt.scope_brand_id = v_site.brand_id)
       OR (kt.scope_tier = 'organization' AND kt.organization_id = v_site.organization_id)
       OR kt.scope_tier = 'system'
    ORDER BY kt.keyword_id,
             CASE kt.scope_tier WHEN 'site' THEN 0 WHEN 'brand' THEN 1 WHEN 'organization' THEN 2 ELSE 3 END,
             kt.updated_at DESC, kt.id
  )
  SELECT l.* FROM ladder l
  JOIN seo.topic t ON t.id = l.topic_id AND t.deleted_at IS NULL AND t.node_type IN ('product', 'service');

  -- What the site exposes: its placed offerings, the offerings it has put a
  -- worth on, and the offering ancestors that keep that hierarchy whole.
  CREATE TEMP TABLE _rso_selected ON COMMIT DROP AS
  WITH RECURSIVE direct AS (
    SELECT DISTINCT w.topic_id FROM _rso_winner w
    UNION
    SELECT stv.topic_id FROM seo.site_topic_value stv
    JOIN seo.topic t ON t.id = stv.topic_id AND t.deleted_at IS NULL AND t.node_type IN ('product', 'service')
    WHERE stv.site_id = v_site.id AND stv.deleted_at IS NULL
  ), closure AS (
    SELECT d.topic_id FROM direct d
    UNION
    SELECT p.id FROM closure c
    JOIN seo.topic child ON child.id = c.topic_id
    JOIN seo.topic p ON p.id = child.parent_id AND p.deleted_at IS NULL AND p.node_type IN ('product', 'service')
  )
  SELECT DISTINCT c.topic_id FROM closure c;

  -- Mint the brand offerings that do not exist yet (copy-on-adopt, provenance
  -- stamped). A slug the brand already uses for a different offering gets the
  -- topic id appended rather than silently merging two offerings.
  INSERT INTO web.brand_offering AS bo (
    organization_id, brand_id, template_id, name, slug, kind, description,
    status, adopted_at, sort, metadata, created_by, updated_by
  )
  SELECT v_site.organization_id, v_site.brand_id, ot.id, t.name,
         CASE WHEN EXISTS (
                SELECT 1 FROM web.brand_offering x
                WHERE x.brand_id = v_site.brand_id AND x.slug = t.slug AND x.deleted_at IS NULL)
              THEN t.slug || '-' || left(t.id::text, 8) ELSE t.slug END,
         t.node_type, t.description, 'active', now(),
         COALESCE((t.metadata->>'sort')::integer, 0),
         jsonb_build_object('migrated_from', 'seo.topic', 'source_topic_id', t.id,
                            'reconciled_at', now()),
         t.created_by, t.updated_by
  FROM _rso_selected s
  JOIN seo.topic t ON t.id = s.topic_id
  LEFT JOIN web.offering_template ot ON ot.id = t.id AND ot.deleted_at IS NULL
  WHERE NOT EXISTS (
    SELECT 1 FROM web.brand_offering x
    WHERE x.brand_id = v_site.brand_id AND x.deleted_at IS NULL
      AND (x.template_id = t.id OR (x.template_id IS NULL AND x.metadata->>'source_topic_id' = t.id::text))
  );
  GET DIAGNOSTICS v_offerings = ROW_COUNT;

  CREATE TEMP TABLE _rso_map ON COMMIT DROP AS
  SELECT DISTINCT ON (t.id) t.id AS topic_id, bo.id AS brand_offering_id
  FROM seo.topic t
  JOIN web.brand_offering bo ON bo.brand_id = v_site.brand_id AND bo.deleted_at IS NULL
   AND (bo.template_id = t.id OR (bo.template_id IS NULL AND bo.metadata->>'source_topic_id' = t.id::text))
  WHERE t.id IN (SELECT topic_id FROM _rso_selected)
  ORDER BY t.id, (bo.template_id IS NULL), bo.created_at;

  -- Keep the brand hierarchy aligned with the source hierarchy for offerings
  -- this reconcile created (an existing brand offering's parent is the brand's
  -- own decision and is never moved from here).
  UPDATE web.brand_offering child
  SET parent_id = pm.brand_offering_id
  FROM _rso_map cm
  JOIN seo.topic t ON t.id = cm.topic_id
  JOIN _rso_map pm ON pm.topic_id = t.parent_id
  WHERE child.id = cm.brand_offering_id
    AND child.parent_id IS NULL
    AND child.metadata ? 'reconciled_at'
    AND child.parent_id IS DISTINCT FROM pm.brand_offering_id;

  INSERT INTO web.site_offering (
    organization_id, site_id, brand_offering_id, status, metadata, created_by, updated_by
  )
  SELECT v_site.organization_id, v_site.id, m.brand_offering_id, 'active',
         jsonb_build_object('migrated_from', 'seo.topic', 'reconciled_at', now()),
         auth.uid(), auth.uid()
  FROM _rso_map m
  WHERE NOT EXISTS (
    SELECT 1 FROM web.site_offering so
    WHERE so.site_id = v_site.id AND so.brand_offering_id = m.brand_offering_id AND so.deleted_at IS NULL
  );
  GET DIAGNOSTICS v_availability = ROW_COUNT;

  -- A placement on an offering the site has deliberately switched off is not
  -- written and is counted, never forced.
  SELECT count(*) INTO v_skipped
  FROM _rso_winner w JOIN _rso_map m ON m.topic_id = w.topic_id
  WHERE EXISTS (
    SELECT 1 FROM web.site_offering so
    WHERE so.site_id = v_site.id AND so.brand_offering_id = m.brand_offering_id
      AND so.deleted_at IS NULL AND so.status <> 'active');

  -- Demote every primary placement the ladder no longer backs (another
  -- organization's ruling copied by the first backfill, or a placement since
  -- moved). Demoted, never deleted: the row and its history stay.
  UPDATE seo.site_keyword_offering sko
  SET is_primary = false,
      metadata = sko.metadata || jsonb_build_object(
        'reconciled_out_at', now(),
        'reconciled_out_reason', 'no in-scope placement on the site ladder backs this offering'),
      updated_at = now()
  WHERE sko.site_id = v_site.id AND sko.is_primary AND sko.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM _rso_winner w JOIN _rso_map m ON m.topic_id = w.topic_id
      WHERE w.keyword_id = sko.keyword_id AND m.brand_offering_id = sko.brand_offering_id);
  GET DIAGNOSTICS v_demoted = ROW_COUNT;

  INSERT INTO seo.site_keyword_offering AS sko (
    organization_id, site_id, keyword_id, brand_offering_id, is_primary,
    confidence, assigned_by, notes, metadata, created_by, updated_by
  )
  SELECT v_site.organization_id, v_site.id, w.keyword_id, m.brand_offering_id, true,
         w.confidence, w.assigned_by, w.notes,
         COALESCE(w.metadata, '{}'::jsonb) || jsonb_build_object(
           'migrated_from', 'seo.keyword_topic', 'source_keyword_topic_id', w.kt_id,
           'source_scope_tier', w.scope_tier, 'reconciled_at', now()),
         w.created_by, w.updated_by
  FROM _rso_winner w
  JOIN _rso_map m ON m.topic_id = w.topic_id
  WHERE NOT EXISTS (
    SELECT 1 FROM web.site_offering so
    WHERE so.site_id = v_site.id AND so.brand_offering_id = m.brand_offering_id
      AND so.deleted_at IS NULL AND so.status <> 'active')
  ON CONFLICT (site_id, keyword_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    is_primary = true,
    confidence = EXCLUDED.confidence,
    assigned_by = EXCLUDED.assigned_by,
    notes = EXCLUDED.notes,
    metadata = sko.metadata || EXCLUDED.metadata,
    updated_at = now()
  WHERE NOT sko.is_primary
     OR sko.confidence IS DISTINCT FROM EXCLUDED.confidence
     OR sko.assigned_by IS DISTINCT FROM EXCLUDED.assigned_by
     OR sko.notes IS DISTINCT FROM EXCLUDED.notes
     OR sko.metadata->'placement' IS DISTINCT FROM EXCLUDED.metadata->'placement';
  GET DIAGNOSTICS v_written = ROW_COUNT;

  -- Offering worth: the old row is still the writer of record until the worth
  -- writers move, so a newer old row wins and an older one never overwrites.
  INSERT INTO seo.site_offering_value AS sov (
    organization_id, site_id, brand_offering_id, offering_match, lead_quality,
    audience_fit, capacity_appetite, brand_fit, worth_points, notes, metadata,
    created_by, updated_by, created_at, updated_at
  )
  SELECT v_site.organization_id, v_site.id, m.brand_offering_id, stv.offering_match,
         stv.lead_quality, stv.audience_fit, stv.capacity_appetite, stv.brand_fit,
         COALESCE(stv.weight, 50), stv.notes,
         stv.metadata || jsonb_build_object(
           'migrated_from', 'seo.site_topic_value', 'source_site_topic_value_id', stv.id,
           'worth_points_from_resolver_default', stv.weight IS NULL, 'reconciled_at', now()),
         stv.created_by, stv.updated_by, stv.created_at, stv.updated_at
  FROM seo.site_topic_value stv
  JOIN _rso_map m ON m.topic_id = stv.topic_id
  WHERE stv.site_id = v_site.id AND stv.deleted_at IS NULL
  ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET
    offering_match = EXCLUDED.offering_match,
    lead_quality = EXCLUDED.lead_quality,
    audience_fit = EXCLUDED.audience_fit,
    capacity_appetite = EXCLUDED.capacity_appetite,
    brand_fit = EXCLUDED.brand_fit,
    worth_points = EXCLUDED.worth_points,
    notes = EXCLUDED.notes,
    metadata = sov.metadata || EXCLUDED.metadata,
    updated_at = now()
  WHERE EXCLUDED.updated_at > sov.updated_at
    AND (sov.offering_match IS DISTINCT FROM EXCLUDED.offering_match
      OR sov.lead_quality IS DISTINCT FROM EXCLUDED.lead_quality
      OR sov.audience_fit IS DISTINCT FROM EXCLUDED.audience_fit
      OR sov.capacity_appetite IS DISTINCT FROM EXCLUDED.capacity_appetite
      OR sov.brand_fit IS DISTINCT FROM EXCLUDED.brand_fit
      OR sov.worth_points IS DISTINCT FROM EXCLUDED.worth_points
      OR sov.notes IS DISTINCT FROM EXCLUDED.notes);
  GET DIAGNOSTICS v_worth = ROW_COUNT;

  UPDATE seo.site_offering_value sov
  SET deleted_at = now(), updated_at = now(),
      metadata = sov.metadata || jsonb_build_object('reconciled_out_at', now(),
        'reconciled_out_reason', 'the source worth row was cleared')
  FROM _rso_map m
  WHERE sov.site_id = v_site.id AND sov.brand_offering_id = m.brand_offering_id
    AND sov.deleted_at IS NULL
    AND sov.metadata ? 'source_site_topic_value_id'
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_topic_value stv
      WHERE stv.site_id = v_site.id AND stv.topic_id = m.topic_id AND stv.deleted_at IS NULL)
    AND EXISTS (
      SELECT 1 FROM seo.site_topic_value stv
      WHERE stv.site_id = v_site.id AND stv.topic_id = m.topic_id AND stv.deleted_at IS NOT NULL
        AND stv.updated_at > sov.updated_at);
  GET DIAGNOSTICS v_cleared = ROW_COUNT;

  RETURN QUERY SELECT v_site.id, v_offerings, v_availability, v_written, v_demoted,
                      v_worth, v_cleared, v_skipped;
END
$function$;

REVOKE ALL ON FUNCTION seo.fn_reconcile_site_offering_facts(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION seo.fn_reconcile_site_offering_facts(uuid) TO service_role;
COMMENT ON FUNCTION seo.fn_reconcile_site_offering_facts(uuid) IS
  'TRANSITION ONLY (brand-offerings cutover step 6). Brings one site''s canonical offering rows into agreement with placements and worth still written to seo.keyword_topic / seo.site_topic_value. Retired when every writer writes the canonical tables. Not client-callable.';

-- 4. Reconcile every live site with a brand -----------------------------------

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
  RAISE NOTICE 'offering reconcile: % sites, % offerings created, % availability rows, % placements written, % demoted, % worth written, % worth cleared, % skipped (offering switched off)',
    v_sites, v_off, v_av, v_w, v_d, v_val, v_cl, v_sk;
END
$do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM seo.site_offering_value WHERE worth_points IS NULL) THEN
    RAISE EXCEPTION 'd9_worth_points_null: an offering worth row has no points; refusing to guess one';
  END IF;
END
$do$;
ALTER TABLE seo.site_offering_value ALTER COLUMN worth_points SET NOT NULL;

-- 5. The resolver -------------------------------------------------------------

CREATE OR REPLACE FUNCTION seo.keyword_value_map(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(keyword_id uuid, value_score numeric, value_band text, value_source text, reasons jsonb, computed_score numeric, computed_band text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH RECURSIVE
site AS MATERIALIZED (
  SELECT s.id, s.brand_id, s.organization_id FROM web.site s WHERE s.id = p_site_id
),
site_keywords AS MATERIALIZED (
  SELECT sk.kw_id FROM (
    SELECT unnest(p_keyword_ids) AS kw_id WHERE p_keyword_ids IS NOT NULL
    UNION
    SELECT spd.keyword_id FROM seo.search_performance_daily spd
    WHERE p_keyword_ids IS NULL AND spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
    UNION
    SELECT skv.keyword_id FROM seo.site_keyword_value skv
    WHERE p_keyword_ids IS NULL AND skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.keyword_id IS NOT NULL
  ) sk WHERE sk.kw_id IS NOT NULL
),
bands AS MATERIALIZED (
  SELECT l.value, l.min_score
  FROM seo.fn_value_levels(p_site_id) l
  WHERE l.min_score IS NOT NULL
),
floor_band AS (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
-- OFFERING PLACEMENTS (D4): this site's own placement on an offering its brand
-- owns and the site exposes. The hierarchy walked is the brand's catalog (D3).
offering_lineage AS (
  SELECT sko.keyword_id AS kw_id, sko.brand_offering_id AS node_id, 0 AS depth
  FROM seo.site_keyword_offering sko JOIN site_keywords sk ON sk.kw_id = sko.keyword_id
  WHERE sko.site_id = p_site_id AND sko.is_primary AND sko.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, bo.parent_id, l.depth + 1
  FROM offering_lineage l JOIN web.brand_offering bo ON bo.id = l.node_id AND bo.deleted_at IS NULL
  WHERE bo.parent_id IS NOT NULL AND l.depth < 12
),
offering_placed AS MATERIALIZED (
  SELECT DISTINCT ol.kw_id FROM offering_lineage ol WHERE ol.depth = 0
),
offering_base AS (
  SELECT DISTINCT ON (l.kw_id)
    l.kw_id, bo.id AS base_id, bo.name AS base_name, sov.worth_points AS base_points,
    (sov.lead_quality = 'negative_value' OR sov.offering_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM offering_lineage l
  JOIN seo.site_offering_value sov ON sov.brand_offering_id = l.node_id AND sov.site_id = p_site_id AND sov.deleted_at IS NULL
  JOIN web.brand_offering bo ON bo.id = sov.brand_offering_id
  ORDER BY l.kw_id, l.depth
),
offering_root AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, bo.kind AS root_type
  FROM offering_lineage l JOIN web.brand_offering bo ON bo.id = l.node_id
  WHERE bo.parent_id IS NULL ORDER BY l.kw_id, l.depth DESC
),
-- TAXONOMY PLACEMENTS (D5): what a keyword is ABOUT (brand, problem, authority,
-- reputation), resolved on THE ONE LADDER - site > brand > organization >
-- system, nearest wins, primary rows only. Used only when the site has not
-- placed the keyword on an offering.
taxonomy_winner AS (
  SELECT w.kw_id, w.topic_id FROM (
    SELECT DISTINCT ON (kt.keyword_id) kt.keyword_id AS kw_id, kt.topic_id
    FROM seo.keyword_topic kt
    JOIN site_keywords sk ON sk.kw_id = kt.keyword_id
    CROSS JOIN site
    WHERE kt.is_primary AND kt.deleted_at IS NULL
      AND ((kt.scope_tier = 'site' AND kt.scope_site_id = site.id)
        OR (kt.scope_tier = 'brand' AND site.brand_id IS NOT NULL AND kt.scope_brand_id = site.brand_id)
        OR (kt.scope_tier = 'organization' AND kt.organization_id = site.organization_id)
        OR kt.scope_tier = 'system')
    ORDER BY kt.keyword_id,
             CASE kt.scope_tier WHEN 'site' THEN 0 WHEN 'brand' THEN 1 WHEN 'organization' THEN 2 ELSE 3 END,
             kt.updated_at DESC, kt.id
  ) w
  JOIN seo.topic t ON t.id = w.topic_id AND t.node_type NOT IN ('service', 'product')
  WHERE NOT EXISTS (SELECT 1 FROM offering_placed op WHERE op.kw_id = w.kw_id)
),
taxonomy_lineage AS (
  SELECT w.kw_id, w.topic_id AS node_id, 0 AS depth FROM taxonomy_winner w
  UNION ALL
  SELECT l.kw_id, t.parent_id, l.depth + 1
  FROM taxonomy_lineage l JOIN seo.topic t ON t.id = l.node_id AND t.deleted_at IS NULL
  WHERE t.parent_id IS NOT NULL AND l.depth < 12
),
-- A taxonomy node carries the site's own worth ruling on that node. A taxonomy
-- node that sits beneath an offering inherits that offering's worth for this
-- site, read from the canonical offering value, never from a topic row.
taxonomy_candidates AS (
  SELECT l.kw_id, l.depth, 'topic'::text AS base_kind, tp.id AS base_id, tp.name AS base_name,
         COALESCE(stv.weight, 50) AS base_points,
         (stv.lead_quality = 'negative_value' OR stv.offering_match IN ('not_offered','actively_avoided')) AS negative_guard
  FROM taxonomy_lineage l
  JOIN seo.topic tp ON tp.id = l.node_id AND tp.node_type NOT IN ('service', 'product')
  JOIN seo.site_topic_value stv ON stv.topic_id = tp.id AND stv.site_id = p_site_id AND stv.deleted_at IS NULL
  UNION ALL
  SELECT l.kw_id, l.depth, 'offering'::text, bo.id, bo.name, sov.worth_points,
         (sov.lead_quality = 'negative_value' OR sov.offering_match IN ('not_offered','actively_avoided'))
  FROM taxonomy_lineage l
  JOIN seo.topic tp ON tp.id = l.node_id AND tp.node_type IN ('service', 'product')
  CROSS JOIN site
  JOIN web.brand_offering bo ON bo.brand_id = site.brand_id AND bo.deleted_at IS NULL
   AND (bo.template_id = tp.id OR (bo.template_id IS NULL AND bo.metadata->>'source_topic_id' = tp.id::text))
  JOIN seo.site_offering_value sov ON sov.brand_offering_id = bo.id AND sov.site_id = p_site_id AND sov.deleted_at IS NULL
),
taxonomy_base AS (
  SELECT DISTINCT ON (c.kw_id) c.* FROM taxonomy_candidates c ORDER BY c.kw_id, c.depth
),
taxonomy_root AS (
  SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type AS root_type
  FROM taxonomy_lineage l JOIN seo.topic t ON t.id = l.node_id
  WHERE t.parent_id IS NULL ORDER BY l.kw_id, l.depth DESC
),
worth_base AS (
  SELECT ob.kw_id, 'offering'::text AS base_kind, ob.base_id, ob.base_name, ob.base_points,
         ob.negative_guard, orr.root_type
  FROM offering_base ob LEFT JOIN offering_root orr ON orr.kw_id = ob.kw_id
  UNION ALL
  SELECT tb.kw_id, tb.base_kind, tb.base_id, tb.base_name, tb.base_points, tb.negative_guard, tr.root_type
  FROM taxonomy_base tb LEFT JOIN taxonomy_root tr ON tr.kw_id = tb.kw_id
),
worth AS MATERIALIZED (
  SELECT w.value_id, w.effect, w.amount, w.notes
  FROM seo.site_value_worth w WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
),
effective_stamps AS MATERIALIZED (
  SELECT es.* FROM seo.fn_effective_stamps(
    p_site_id, (SELECT array_agg(sk.kw_id) FROM site_keywords sk)) es
),
combos AS MATERIALIZED (
  SELECT c.id, c.value_ids, c.effect, c.amount, c.label, c.notes,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
                    'value_id', cv.id, 'dimension', cd.slug, 'dimension_label', cd.name,
                    'value', COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)),
                    'value_label', cv.name)
                  ORDER BY cd.slug, cv.slug)
           FROM platform.categories cv
           JOIN platform.categories cd ON cd.id = cv.parent_id
           WHERE cv.id = ANY (c.value_ids)), '[]'::jsonb) AS values_json
  FROM seo.site_value_combo c
  WHERE c.site_id = p_site_id AND c.deleted_at IS NULL AND c.enabled
),
combo_hits AS (
  SELECT es.kw_id, cb.id AS combo_id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json
  FROM combos cb
  JOIN effective_stamps es ON es.value_id = ANY (cb.value_ids)
  GROUP BY es.kw_id, cb.id, cb.label, cb.effect, cb.amount, cb.notes, cb.values_json, cb.value_ids
  HAVING count(DISTINCT es.value_id) = cardinality(cb.value_ids)
),
contrib AS (
  SELECT es.kw_id, w.effect, w.amount, 0 AS kind_rank,
         es.dim_slug AS sort_a, es.value_key AS sort_b,
         jsonb_build_object(
           'kind','stamp','dimension',es.dim_slug,'dimension_label',es.dim_label,
           'value',es.value_key,'value_label',es.value_label,'value_id',es.value_id,
           'effect',w.effect,'amount',w.amount,'source',es.source,'matcher_id',es.matcher_id,
           'nature',es.nature,'as_of',es.as_of,'notes',w.notes) AS reason
  FROM effective_stamps es JOIN worth w ON w.value_id = es.value_id
  UNION ALL
  SELECT ch.kw_id, ch.effect, ch.amount, 1 AS kind_rank,
         COALESCE(ch.label,'') AS sort_a, ch.combo_id::text AS sort_b,
         jsonb_build_object(
           'kind','combo','combo_id',ch.combo_id,'label',ch.label,'values',ch.values_json,
           'effect',ch.effect,'amount',ch.amount,'notes',ch.notes) AS reason
  FROM combo_hits ch
),
per_kw AS (
  SELECT c.kw_id,
         COALESCE(SUM(c.amount) FILTER (WHERE c.effect = 'add'), 0) AS adds,
         COALESCE(exp(SUM(ln(GREATEST(c.amount, 0.0001))) FILTER (WHERE c.effect = 'scale')), 1) AS factor,
         bool_or(c.effect = 'never') AS any_never,
         count(*) FILTER (WHERE c.effect = 'scale') AS n_factors,
         jsonb_agg(c.reason ORDER BY
           CASE c.effect WHEN 'add' THEN 1 WHEN 'scale' THEN 2 ELSE 3 END,
           c.kind_rank, c.sort_a, c.sort_b) AS stamp_reasons
  FROM contrib c GROUP BY c.kw_id
),
overrides AS (
  SELECT skv.keyword_id AS kw_id, skv.value_tier, skv.notes, skv.updated_at
  FROM seo.site_keyword_value skv
  WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL
),
baseline AS (SELECT seo.fn_value_baseline(p_site_id) AS v),
scored AS MATERIALIZED (
  SELECT sk.kw_id,
    (tb.kw_id IS NOT NULL) AS has_base,
    (tb.kw_id IS NOT NULL OR pk.kw_id IS NOT NULL) AS has_meaning,
    COALESCE(tb.negative_guard, false) OR COALESCE(pk.any_never, false) AS is_never,
    (SELECT v FROM baseline) AS baseline,
    COALESCE(tb.base_points, 0) + COALESCE(pk.adds, 0) AS adds_total,
    LEAST(5, GREATEST(0.05, COALESCE(pk.factor, 1))) AS factor_total,
    COALESCE(pk.n_factors, 0) AS n_factors,
    tb.base_kind, tb.base_id, tb.base_name, tb.base_points, tb.negative_guard, tb.root_type,
    COALESCE(pk.stamp_reasons, '[]'::jsonb) AS stamp_reasons
  FROM site_keywords sk
  LEFT JOIN worth_base tb ON tb.kw_id = sk.kw_id
  LEFT JOIN per_kw pk ON pk.kw_id = sk.kw_id
),
final AS (
  SELECT s.*, GREATEST(0, round((s.baseline + s.adds_total) * s.factor_total, 1)) AS raw_score
  FROM scored s
),
-- The machine's answer, worked out for EVERY keyword - the one an override used
-- to suppress. Computing it unconditionally is the whole point: an override
-- that cannot be compared to anything cannot be reviewed.
machine AS (
  SELECT s.*,
    CASE WHEN s.is_never THEN 0 WHEN NOT s.has_meaning THEN NULL ELSE s.raw_score END AS m_score,
    CASE WHEN s.is_never THEN 'negative'
         WHEN NOT s.has_meaning THEN 'unvalued'
         WHEN s.raw_score = 0 THEN 'negative'
         ELSE COALESCE(
           (SELECT b.value FROM bands b WHERE b.min_score <= s.raw_score ORDER BY b.min_score DESC LIMIT 1),
           (SELECT value FROM floor_band)) END AS m_band,
    jsonb_build_array(jsonb_build_object(
      'kind','summary',
      'baseline', s.baseline,
      'adds', round(s.adds_total, 1),
      'total_before_factor', round(s.baseline + s.adds_total, 1),
      'factor', round(s.factor_total, 4),
      'n_factors', s.n_factors,
      'never', s.is_never,
      'has_meaning', s.has_meaning,
      'score', CASE WHEN s.is_never THEN 0 WHEN NOT s.has_meaning THEN NULL ELSE s.raw_score END))
    || CASE WHEN s.has_meaning
         THEN jsonb_build_array(jsonb_build_object('kind','baseline','amount',s.baseline))
         ELSE '[]'::jsonb END
    || CASE
         WHEN s.has_base AND s.base_kind = 'offering' THEN jsonb_build_array(jsonb_build_object(
           'kind','offering','offering',s.base_name,'offering_id',s.base_id,'points',s.base_points,
           'effect','add','amount',s.base_points,'root',s.root_type,
           'negative_guard',COALESCE(s.negative_guard,false)))
         WHEN s.has_base THEN jsonb_build_array(jsonb_build_object(
           'kind','topic','topic',s.base_name,'topic_id',s.base_id,'weight',s.base_points,
           'effect','add','amount',s.base_points,'root',s.root_type,
           'negative_guard',COALESCE(s.negative_guard,false)))
         ELSE '[]'::jsonb END
    || s.stamp_reasons AS chain
  FROM final s
)
SELECT s.kw_id,
  CASE WHEN o.kw_id IS NOT NULL THEN NULL ELSE s.m_score END AS value_score,
  CASE WHEN o.kw_id IS NOT NULL THEN o.value_tier ELSE s.m_band END AS value_band,
  CASE WHEN o.kw_id IS NOT NULL THEN 'override'
       WHEN NOT s.has_meaning AND NOT s.is_never THEN 'unvalued'
       ELSE 'computed' END AS value_source,
  CASE WHEN o.kw_id IS NOT NULL
       THEN jsonb_build_array(jsonb_build_object(
              'kind','override',
              'level', o.value_tier,
              'note', NULLIF(btrim(COALESCE(o.notes, '')), ''),
              'ruled_at', o.updated_at,
              'computed_band', s.m_band,
              'computed_score', s.m_score,
              -- The one thing a reviewer needs: does the human ruling still say
              -- the same thing the working-out does? When this flips to false
              -- the override is worth a second look - it is never overwritten.
              'agrees', (o.value_tier IS NOT DISTINCT FROM s.m_band))) || s.chain
       ELSE s.chain END AS reasons,
  s.m_score AS computed_score,
  s.m_band  AS computed_band
FROM machine s
LEFT JOIN overrides o ON o.kw_id = s.kw_id;
$function$;

-- 6. Readers of the base step learn `kind: 'offering'` -------------------------
--
-- Rewritten from the LIVE body at apply time (so a concurrent change to these
-- functions is kept, not reverted) and refused loudly if the expected text is
-- not there.

DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('seo.gsc_value_worth_preview(uuid, date, date, uuid, text, numeric, integer)'::regprocedure);
  v_new := regexp_replace(v_def, $re$r->>'kind'\s*=\s*'topic'$re$, $rp$r->>'kind' IN ('topic','offering')$rp$, 'g');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'offering_reason_reader_not_found: seo.gsc_value_worth_preview no longer reads kind = topic; re-derive this step';
  END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('seo.gsc_value_combo_preview(uuid, date, date, uuid[], text, numeric, uuid, integer)'::regprocedure);
  v_new := regexp_replace(v_def, $re$r->>'kind'\s*=\s*'topic'$re$, $rp$r->>'kind' IN ('topic','offering')$rp$, 'g');
  IF v_new = v_def THEN
    RAISE EXCEPTION 'offering_reason_reader_not_found: seo.gsc_value_combo_preview no longer reads kind = topic; re-derive this step';
  END IF;
  EXECUTE v_new;

  v_def := pg_get_functiondef('seo.starter_pack_preview(uuid, uuid, date, date, uuid[], integer)'::regprocedure);
  v_new := replace(v_def, $old$(r->>'weight')::numeric from jsonb_array_elements(b.reasons) r
        where r->>'kind' = 'topic' limit 1$old$,
                          $new$(r->>'amount')::numeric from jsonb_array_elements(b.reasons) r
        where r->>'kind' in ('topic', 'offering') limit 1$new$);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'offering_reason_reader_not_found: seo.starter_pack_preview no longer reads the topic base weight; re-derive this step';
  END IF;
  EXECUTE v_new;
END
$do$;

-- 7. The offering worth writer, in the D9 shape --------------------------------

DROP FUNCTION IF EXISTS seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean);

CREATE FUNCTION seo.set_site_offering_value(
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
DECLARE v_site_org uuid; v_id uuid;
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);
  SELECT organization_id INTO STRICT v_site_org FROM web.site WHERE id = p_site_id AND deleted_at IS NULL;
  IF v_site_org <> p_organization_id THEN
    RAISE EXCEPTION 'offering_value_scope_mismatch: the organization does not own this site';
  END IF;
  IF p_clear THEN
    UPDATE seo.site_offering_value SET deleted_at = now(), updated_at = now(), updated_by = auth.uid()
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
    NULLIF(btrim(COALESCE(p_notes, '')), ''), '{}', auth.uid(), auth.uid()
  )
  ON CONFLICT (site_id, brand_offering_id) WHERE deleted_at IS NULL
  DO UPDATE SET worth_points = EXCLUDED.worth_points, lead_quality = EXCLUDED.lead_quality,
    offering_match = EXCLUDED.offering_match, audience_fit = EXCLUDED.audience_fit,
    capacity_appetite = EXCLUDED.capacity_appetite, brand_fit = EXCLUDED.brand_fit,
    notes = EXCLUDED.notes, updated_at = now(), updated_by = auth.uid()
  RETURNING sov.id INTO v_id;
  RETURN v_id;
END
$function$;

UPDATE platform.client_callable_door
SET identity_args = 'p_organization_id uuid, p_site_id uuid, p_brand_offering_id uuid, p_worth_points numeric, p_lead_quality text, p_offering_match text, p_notes text, p_clear boolean, p_audience_fit text, p_capacity_appetite text, p_brand_fit text',
    identity_argtypes = ARRAY['2950','2950','2950','1700','25','25','25','16','25','25','25']::oid[],
    reason = 'SIGNED-IN door (authenticated only). The one offering worth writer (D9, worth is points): written for a signed-in site editor (gsc_assert_site_editor); an anonymous caller can do nothing here.'
WHERE schema_name = 'seo' AND function_name = 'set_site_offering_value';

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM platform.client_callable_door
    WHERE schema_name = 'seo' AND function_name = 'set_site_offering_value'
      AND identity_args LIKE '%p_worth_points numeric%'
  ) THEN
    RAISE EXCEPTION 'offering_value_door_missing: the client door for seo.set_site_offering_value was not re-declared';
  END IF;
END
$do$;

REVOKE ALL ON FUNCTION seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.set_site_offering_value(uuid, uuid, uuid, numeric, text, text, text, boolean, text, text, text) TO authenticated, service_role;

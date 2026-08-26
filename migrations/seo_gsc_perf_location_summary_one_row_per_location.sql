-- WHICH LOCATION — one row per location, not one row per attribution METHOD.
--
-- THE DEFECT (found by the 2026-08-25 surface test, P16/P26): the decomposition
-- listed "Los Angeles" twice — 0 clicks / 188 impressions / 20 queries on one
-- row and 0 / 615 / 3 on another — with nothing on either row saying what made
-- them different. Houston did the same. A reader cannot act on a split they
-- cannot see the reason for, and the panel's own promise ("EVERY ROW OPENS …
-- clicking one filters the keyword list below it") was broken on both halves:
-- the drill-in reads by location_id, so BOTH rows opened the SAME full list,
-- and neither row's numbers matched what it opened.
--
-- It also crashed the console: the list is keyed by `location_id`, so two rows
-- for one location produced React's "Encountered two children with the same
-- key" on 34f968c7-… (Los Angeles) and 5ab92004-… (Houston).
--
-- THE CAUSE: the GROUP BY carried `decided_by` — the attribution METHOD, which
-- is decided per KEYWORD (place_match for one search, nearest_place for the
-- next). Grouping a location by it splits the location.
--
-- THE FIX: real locations aggregate to ONE row and carry no method (NULL —
-- "several, and they are per-keyword"). The two synthetic buckets keep the
-- token that names them, because for those rows the method IS the identity:
-- `unresolved` (a local search nothing could place) and `not_local` (no place
-- named at all). Nothing is hidden — the per-keyword method stays on the
-- Attributed-by column of the drill-in below, which is where it can be read
-- against the keyword it describes and filtered.
--
-- Signature, return columns and every other behaviour are unchanged.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md § C10.

CREATE OR REPLACE FUNCTION seo.gsc_perf_location_summary(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL::date,
  p_compare_end date DEFAULT NULL::date
)
RETURNS TABLE(
  location_id uuid,
  location_name text,
  decided_by text,
  clicks bigint,
  impressions bigint,
  queries bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_queries bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $function$
DECLARE
  v_ids uuid[];
  v_lo date := LEAST(COALESCE(p_compare_start, p_start), p_start);
  v_hi date := GREATEST(COALESCE(p_compare_end, p_end), p_end);
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  -- Only keywords a place was actually detected on: the set attribution can
  -- speak about at all, and the only set that stays inside its own cap.
  SELECT array_agg(DISTINCT spd.keyword_id) INTO v_ids
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
    AND spd.keyword_id IS NOT NULL AND spd.date BETWEEN v_lo AND v_hi
    AND EXISTS (SELECT 1 FROM seo.keyword_place kp
                 WHERE kp.keyword_id = spd.keyword_id AND kp.deleted_at IS NULL);

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN v_lo AND v_hi
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i, spd.keyword_id AS kid
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
  ),
  loc AS MATERIALIZED (
    SELECT * FROM seo.gsc_keyword_locations(p_site_id, v_ids)
  ),
  joined AS (
    SELECT l.*, kl.location_id AS lid, kl.location_name AS lname,
           EXISTS (SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = l.kid AND kp.deleted_at IS NULL) AS is_local
    FROM latest l LEFT JOIN loc kl ON kl.keyword_id = l.kid
  )
  SELECT j.lid,
         COALESCE(j.lname, CASE WHEN j.is_local THEN 'Local — location not resolved' ELSE 'Not location-specific' END),
         -- A real location is not defined by HOW its searches were attributed
         -- (that is per keyword and lives on the drill-in). Only the two
         -- synthetic buckets are named by their method.
         CASE WHEN j.lid IS NOT NULL THEN NULL
              WHEN j.is_local THEN 'unresolved'
              ELSE 'not_local' END,
         COALESCE(SUM(j.c) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(j.i) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(COUNT(DISTINCT j.kid) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(j.c) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
         COALESCE(SUM(j.i) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
         COALESCE(COUNT(DISTINCT j.kid) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint
  FROM joined j
  GROUP BY j.lid,
           COALESCE(j.lname, CASE WHEN j.is_local THEN 'Local — location not resolved' ELSE 'Not location-specific' END),
           CASE WHEN j.lid IS NOT NULL THEN NULL
                WHEN j.is_local THEN 'unresolved'
                ELSE 'not_local' END
  ORDER BY 4 DESC;
END $function$;

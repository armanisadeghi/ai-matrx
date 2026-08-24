-- ============================================================================
-- C10 FIX — SCOPE THE BY-LOCATION READS TO KEYWORDS THAT HAVE A PLACE
-- (2026-08-23, found on live data while building the UI)
--
-- `seo.gsc_perf_location_summary` asked `seo.gsc_keyword_locations` about EVERY
-- keyword with traffic in the window. On datadestruction.com that is 5,860
-- keywords, and the attribution RPC deliberately refuses more than 5,000 — so
-- the decomposition raised `gsc_too_many_keywords` on any real-sized site and
-- the panel never resolved. It looked like slowness; it was a hard error behind
-- a retrying query.
--
-- The right scope was always narrower. Attribution can only ever answer for a
-- keyword that has a DETECTED PLACE, so ask about exactly those: 261 keywords
-- instead of 5,860 on the same site. Keywords with no place still appear in the
-- output — they fall into the "Not location-specific" / unresolved buckets via
-- the LEFT JOIN, exactly as before. Nothing about the answer changes; only the
-- size of the question.
--
-- Both functions are re-declared here in full (idempotent CREATE OR REPLACE)
-- so this file, not a diff in someone's memory, is the record of what runs.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.gsc_perf_location_summary(
  p_site_id uuid, p_start date, p_end date,
  p_compare_start date DEFAULT NULL, p_compare_end date DEFAULT NULL
) RETURNS TABLE(
  location_id uuid, location_name text, decided_by text,
  clicks bigint, impressions bigint, queries bigint,
  cmp_clicks bigint, cmp_impressions bigint, cmp_queries bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $fn$
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
    SELECT l.*, kl.location_id AS lid, kl.location_name AS lname, kl.decided_by AS how,
           EXISTS (SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = l.kid AND kp.deleted_at IS NULL) AS is_local
    FROM latest l LEFT JOIN loc kl ON kl.keyword_id = l.kid
  )
  SELECT j.lid,
         COALESCE(j.lname, CASE WHEN j.is_local THEN 'Local — location not resolved' ELSE 'Not location-specific' END),
         COALESCE(j.how, CASE WHEN j.is_local THEN 'unresolved' ELSE 'not_local' END),
         COALESCE(SUM(j.c) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(j.i) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(COUNT(DISTINCT j.kid) FILTER (WHERE j.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(j.c) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
         COALESCE(SUM(j.i) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint,
         COALESCE(COUNT(DISTINCT j.kid) FILTER (WHERE p_compare_start IS NOT NULL AND j.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint
  FROM joined j
  GROUP BY j.lid, COALESCE(j.lname, CASE WHEN j.is_local THEN 'Local — location not resolved' ELSE 'Not location-specific' END),
           COALESCE(j.how, CASE WHEN j.is_local THEN 'unresolved' ELSE 'not_local' END)
  ORDER BY 4 DESC;
END $fn$;

CREATE OR REPLACE FUNCTION seo.gsc_location_keywords(
  p_site_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_bucket text DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  keyword_id uuid, keyword text, clicks bigint, impressions bigint,
  decided_by text, place_name text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $fn$
DECLARE
  v_ids uuid[];
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_start IS NULL OR p_end IS NULL THEN
    RAISE EXCEPTION 'gsc_window_required: give this read the window it is about.';
  END IF;
  IF p_limit < 1 OR p_limit > 500 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF p_location_id IS NULL AND p_bucket IS NOT NULL
     AND p_bucket NOT IN ('unresolved', 'not_local') THEN
    RAISE EXCEPTION 'gsc_bucket_unknown: % (use unresolved or not_local)', p_bucket;
  END IF;

  SELECT array_agg(DISTINCT spd.keyword_id) INTO v_ids
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
    AND spd.keyword_id IS NOT NULL AND spd.date BETWEEN p_start AND p_end
    AND EXISTS (SELECT 1 FROM seo.keyword_place kp
                 WHERE kp.keyword_id = spd.keyword_id AND kp.deleted_at IS NULL);

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.keyword_id AS kid, spd.query AS q, spd.clicks AS c, spd.impressions AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
  ),
  loc AS MATERIALIZED (
    SELECT * FROM seo.gsc_keyword_locations(p_site_id, v_ids)
  ),
  kept AS (
    SELECT l.kid, l.q, l.c, l.i, kl.decided_by AS how, kl.place_name AS pname
    FROM latest l
    LEFT JOIN loc kl ON kl.keyword_id = l.kid
    WHERE CASE
      WHEN p_location_id IS NOT NULL THEN kl.location_id = p_location_id
      WHEN p_bucket = 'unresolved' THEN kl.location_id IS NULL AND EXISTS (
        SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = l.kid AND kp.deleted_at IS NULL)
      WHEN p_bucket = 'not_local' THEN kl.location_id IS NULL AND NOT EXISTS (
        SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = l.kid AND kp.deleted_at IS NULL)
      ELSE true
    END
  ),
  rolled AS (
    SELECT k.kid,
           (array_agg(k.q ORDER BY k.q))[1] AS q,
           SUM(k.c)::bigint AS c,
           SUM(k.i)::bigint AS i,
           (array_agg(k.how) FILTER (WHERE k.how IS NOT NULL))[1] AS how,
           (array_agg(k.pname) FILTER (WHERE k.pname IS NOT NULL))[1] AS pname
    FROM kept k GROUP BY k.kid
  )
  SELECT r.kid, r.q, r.c, r.i, r.how, r.pname, COUNT(*) OVER ()::bigint
  FROM rolled r
  ORDER BY r.c DESC, r.i DESC, r.q
  LIMIT p_limit OFFSET p_offset;
END $fn$;

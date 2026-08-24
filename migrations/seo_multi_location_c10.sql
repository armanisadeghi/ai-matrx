-- ============================================================================
-- KEYWORD INTELLIGENCE — C10: MULTI-LOCATION LOCAL (2026-08-23)
--
-- Arman (P16): "companies that have multiple locations, the definition of
-- local starts to change. So it's not just about knowing that something's
-- local. It's also about knowing WHICH location that one belongs to."
-- Asked whether it mattered: "Yes. This is a big one."
--
-- WHAT THE LIVE DATA ACTUALLY LOOKS LIKE (checked before designing, 2026-08-23):
-- `web.business_location` rows carry `locality` + `region` but **no latitude or
-- longitude** — every row is null — and several brands have no location rows at
-- all. A design that resolved "which location" by distance would therefore have
-- resolved NOTHING on real data while looking sophisticated. So resolution is a
-- precedence walk that degrades honestly, strongest evidence first:
--
--   1. bound_area      — a geo area (a value of the site's geo dimension) the
--                        user BOUND to a location. A human said so; nothing
--                        outranks it.
--   2. place_match     — the detected place IS the location's city (locality +
--                        region), or its state (region) when the keyword names
--                        only a state.
--   3. nearest_place   — both the place and the location have coordinates and
--                        the place is within `max_attribution_km`. (Dormant
--                        until locations carry coordinates — reported, never
--                        pretended.)
--   4. single_location — the keyword is local at all AND the brand has exactly
--                        one active location. Knob-gated.
--   else                 unresolved — a first-class answer, never a guess.
--
-- Ceilings are knobs (`platform.feature_knob`, feature `seo.multi_location`),
-- never constants. Reads take the keyword set they are about to render
-- (THE SCOPE RULE) and compose THE ACCURACY CONTRACT (winning-run dedup).
-- ============================================================================

-- ── Knobs (seeded directly: feature_knob_set asserts an admin session and a
--     migration runs as the owner, not as a person) ────────────────────────
INSERT INTO platform.feature_knob (feature, key, value, default_value, value_type, label, description, set_by)
VALUES
  ('seo.multi_location', 'max_attribution_km', '75'::jsonb, '75'::jsonb, 'number',
   'Attribution radius (km)',
   'How far a detected place may sit from a business location and still be attributed to it. Only applies when BOTH the place and the location carry coordinates; today no business location does, so this path is dormant and seo.gsc_location_readiness says so.',
   'agent'),
  ('seo.multi_location', 'single_location_fallback', 'true'::jsonb, 'true'::jsonb, 'boolean',
   'Attribute every local keyword when there is only one location',
   'When a brand has exactly one active location, attribute every local keyword to it. Turn this off for a business whose single listed location does not represent where it actually serves.',
   'agent')
ON CONFLICT (feature, key) DO NOTHING;

CREATE OR REPLACE FUNCTION seo.multi_location_knob(p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE
SET search_path TO 'platform', 'pg_temp'
AS $$
  SELECT COALESCE((SELECT (k.value #>> '{}')::numeric FROM platform.feature_knob k
                    WHERE k.feature = 'seo.multi_location' AND k.key = p_key), p_default);
$$;

-- ── A geo area may BIND to business locations ──────────────────────────────
ALTER TABLE seo.site_geo_area ADD COLUMN IF NOT EXISTS location_ids uuid[];
COMMENT ON COLUMN seo.site_geo_area.location_ids IS
  'C10 — the business locations this area serves. A human binding here is the strongest signal for "which location does this keyword belong to"; empty means the resolver falls back to matching the detected place against the location itself.';

-- ── WHICH LOCATION does a keyword belong to? ───────────────────────────────
CREATE OR REPLACE FUNCTION seo.gsc_keyword_locations(p_site_id uuid, p_keyword_ids uuid[] DEFAULT NULL)
RETURNS TABLE(
  keyword_id uuid, location_id uuid, location_name text, locality text, region text,
  decided_by text, place_name text, distance_km numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'platform', 'pg_temp'
AS $fn$
DECLARE
  v_brand uuid;
  v_max_km numeric := seo.multi_location_knob('max_attribution_km', 75);
  v_single boolean := COALESCE((SELECT (k.value #>> '{}') = 'true' FROM platform.feature_knob k
                                 WHERE k.feature='seo.multi_location' AND k.key='single_location_fallback'), true);
  v_only uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NOT NULL AND array_length(p_keyword_ids,1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: ask for the keywords you are showing (max 5000).';
  END IF;
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = p_site_id;

  SELECT l.id INTO v_only FROM web.business_location l
   WHERE l.brand_id = v_brand AND l.deleted_at IS NULL AND COALESCE(l.status,'active') = 'active'
   LIMIT 2;
  IF (SELECT count(*) FROM web.business_location l
       WHERE l.brand_id = v_brand AND l.deleted_at IS NULL AND COALESCE(l.status,'active') = 'active') <> 1 THEN
    v_only := NULL;
  END IF;

  RETURN QUERY
  WITH locs AS (
    SELECT l.id, l.name, l.locality, l.region, l.latitude, l.longitude
    FROM web.business_location l
    WHERE l.brand_id = v_brand AND l.deleted_at IS NULL AND COALESCE(l.status,'active') = 'active'
  ),
  kw AS (
    SELECT DISTINCT kp.keyword_id, kp.place_id
    FROM seo.keyword_place kp
    WHERE kp.deleted_at IS NULL
      AND (p_keyword_ids IS NULL OR kp.keyword_id = ANY(p_keyword_ids))
  ),
  placed AS (
    SELECT kw.keyword_id, gp.id AS place_id, gp.name AS place_name, gp.place_kind,
           gp.state_code, gp.latitude, gp.longitude
    FROM kw JOIN seo.geo_place gp ON gp.id = kw.place_id AND gp.deleted_at IS NULL
  ),
  -- 1. a human bound an area to a location, and this keyword matched that area
  bound AS (
    SELECT DISTINCT p.keyword_id, l.id AS location_id, l.name, l.locality, l.region,
           'bound_area'::text AS decided_by, p.place_name, NULL::numeric AS distance_km, 1 AS rank
    FROM placed p
    JOIN seo.site_geo_area g ON g.site_id = p_site_id AND g.deleted_at IS NULL
                            AND COALESCE(array_length(g.location_ids,1),0) > 0
                            AND p.place_id = ANY(COALESCE(g.place_ids, '{}'::uuid[]))
    JOIN locs l ON l.id = ANY(g.location_ids)
  ),
  -- 2. the detected place IS the location's city (or its state)
  matched AS (
    SELECT p.keyword_id, l.id, l.name, l.locality, l.region,
           CASE WHEN p.place_kind = 'city' THEN 'place_match' ELSE 'state_match' END, p.place_name,
           NULL::numeric, CASE WHEN p.place_kind = 'city' THEN 2 ELSE 3 END
    FROM placed p JOIN locs l ON (
         (p.place_kind = 'city'  AND lower(btrim(l.locality)) = lower(p.place_name)
                                 AND (p.state_code IS NULL OR l.region IS NULL OR upper(l.region) = upper(p.state_code)))
      OR (p.place_kind = 'state' AND upper(btrim(l.region)) = upper(COALESCE(p.state_code, p.place_name))))
  ),
  -- 3. coordinates on both sides, inside the knob's radius (dormant today)
  near AS (
    SELECT p.keyword_id, l.id, l.name, l.locality, l.region, 'nearest_place'::text, p.place_name,
           round(d.km::numeric, 1), 4
    FROM placed p JOIN locs l ON l.latitude IS NOT NULL AND l.longitude IS NOT NULL
                             AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
    CROSS JOIN LATERAL (
      SELECT 6371 * 2 * asin(sqrt(
        power(sin(radians(l.latitude - p.latitude) / 2), 2)
        + cos(radians(p.latitude)) * cos(radians(l.latitude))
        * power(sin(radians(l.longitude - p.longitude) / 2), 2))) AS km) d
    WHERE d.km <= v_max_km
  ),
  -- 4. the brand has exactly one location and the keyword is local at all
  only_one AS (
    SELECT DISTINCT p.keyword_id, l.id, l.name, l.locality, l.region, 'single_location'::text, p.place_name,
           NULL::numeric, 5
    FROM placed p JOIN locs l ON l.id = v_only
    WHERE v_single AND v_only IS NOT NULL
  ),
  all_hits AS (
    SELECT * FROM bound UNION ALL SELECT * FROM matched UNION ALL SELECT * FROM near UNION ALL SELECT * FROM only_one
  )
  SELECT DISTINCT ON (h.keyword_id)
         h.keyword_id, h.location_id, h.name, h.locality, h.region, h.decided_by, h.place_name, h.distance_km
  FROM all_hits h(keyword_id, location_id, name, locality, region, decided_by, place_name, distance_km, rank)
  ORDER BY h.keyword_id, h.rank, h.distance_km NULLS LAST, h.location_id;
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_keyword_locations(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_locations(uuid, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_keyword_locations(uuid, uuid[]) IS
  'C10 — WHICH business location a keyword belongs to, by a precedence walk that degrades honestly: bound_area > place_match > state_match > nearest_place (needs coordinates) > single_location. A keyword with no answer is simply absent — unresolved is a first-class state, never a guess.';

-- ── Traffic decomposed BY LOCATION ─────────────────────────────────────────
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

  SELECT array_agg(DISTINCT spd.keyword_id) INTO v_ids
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id AND spd.dimension_profile = 'query'
    AND spd.keyword_id IS NOT NULL AND spd.date BETWEEN v_lo AND v_hi;

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
REVOKE ALL ON FUNCTION seo.gsc_perf_location_summary(uuid, date, date, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_location_summary(uuid, date, date, date, date) TO authenticated, service_role;

-- ── What is stopping this from working? (the honesty gauge, with doors) ────
CREATE OR REPLACE FUNCTION seo.gsc_location_readiness(p_site_id uuid)
RETURNS TABLE(state text, headline text, detail text, count_value bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $fn$
DECLARE v_brand uuid; v_locs bigint; v_no_city bigint; v_no_coords bigint; v_areas bigint; v_bound bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  SELECT s.brand_id INTO v_brand FROM web.site s WHERE s.id = p_site_id;
  SELECT count(*), count(*) FILTER (WHERE NULLIF(btrim(COALESCE(locality,'')),'') IS NULL AND NULLIF(btrim(COALESCE(region,'')),'') IS NULL),
         count(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL)
    INTO v_locs, v_no_city, v_no_coords
  FROM web.business_location WHERE brand_id = v_brand AND deleted_at IS NULL AND COALESCE(status,'active')='active';
  SELECT count(*), count(*) FILTER (WHERE COALESCE(array_length(location_ids,1),0) > 0)
    INTO v_areas, v_bound
  FROM seo.site_geo_area WHERE site_id = p_site_id AND deleted_at IS NULL;

  IF v_locs = 0 THEN
    RETURN QUERY SELECT 'gap', 'No business locations yet',
      'Add the places this business actually operates from and every local keyword can be attributed to one of them.', 0::bigint;
    RETURN;
  END IF;
  IF v_locs = 1 THEN
    RETURN QUERY SELECT 'ok', 'One location',
      'Every local keyword is attributed to it. Add more locations and the system starts telling you which one each keyword belongs to.', v_locs;
  ELSE
    RETURN QUERY SELECT 'ok', v_locs || ' locations', 'Local keywords are attributed to whichever one their place matches.', v_locs;
  END IF;
  IF v_no_city > 0 THEN
    RETURN QUERY SELECT 'gap', v_no_city || ' location(s) have no city or state',
      'Without a city or state there is nothing for a detected place to match — those locations can never win a keyword.', v_no_city;
  END IF;
  IF v_no_coords = v_locs THEN
    RETURN QUERY SELECT 'inert', 'No location has coordinates',
      'Distance-based attribution is switched off until at least one location carries a latitude and longitude. City and state matching still works.', v_no_coords;
  END IF;
  -- The gap that actually stops attribution today: keywords with traffic that
  -- have never been read for a place. Attribution can only ever see what the
  -- gazetteer detected.
  DECLARE v_windowed bigint; v_placed bigint;
  BEGIN
    SELECT count(DISTINCT spd.keyword_id),
           count(DISTINCT spd.keyword_id) FILTER (WHERE EXISTS (
             SELECT 1 FROM seo.keyword_place kp WHERE kp.keyword_id = spd.keyword_id AND kp.deleted_at IS NULL))
      INTO v_windowed, v_placed
    FROM seo.search_performance_daily spd
    WHERE spd.provider='gsc' AND spd.site_id = p_site_id AND spd.dimension_profile='query'
      AND spd.keyword_id IS NOT NULL AND spd.date >= current_date - 90;
    IF v_windowed > 0 AND v_placed = 0 THEN
      RETURN QUERY SELECT 'inert', 'No keyword has been read for a place yet',
        'Attribution can only see places the gazetteer has detected. Run place detection on this site''s keywords and locations start winning traffic.', v_windowed;
    ELSIF v_windowed > 0 AND v_placed < v_windowed THEN
      RETURN QUERY SELECT 'gap', (v_windowed - v_placed) || ' keyword(s) with traffic carry no detected place',
        'Those keywords can never be attributed to a location until place detection has read them.', (v_windowed - v_placed);
    END IF;
  END;

  IF v_areas > 0 AND v_bound = 0 THEN
    RETURN QUERY SELECT 'gap', v_areas || ' service area(s), none bound to a location',
      'Binding an area to a location is the strongest signal — it beats every guess the system would otherwise make.', v_areas;
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_location_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_location_readiness(uuid) TO authenticated, service_role;

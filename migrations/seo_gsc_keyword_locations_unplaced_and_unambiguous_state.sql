-- C10 — let the ONE attribution read also name what it COULD NOT place, and
-- refuse to coin-flip a state between two branches.
--
-- Two changes to seo.gsc_keyword_locations, applied live 2026-08-24:
--
-- 1. `p_include_unplaced` (default false, so every existing caller is
--    byte-identical). The keyword table needs THREE states, not two: placed on
--    a branch, a local search nothing could place, and a search naming no place
--    at all. Absence alone cannot tell the last two apart, and one dash for
--    both is how the unrouted-revenue work list stays invisible. When true, a
--    keyword that names a place but resolved to no location comes back with
--    `decided_by = 'unresolved'` and a NULL `location_id` — the exact token
--    `explainDecidedBy` / `decidedByChip` already speak.
--
-- 2. A STATE THAT NAMES TWO BRANCHES NAMES NEITHER. Found on All Green
--    Recycling, the first genuinely multi-location brand to reach this ladder:
--    "e-stewards consulting orange county california" was attributed to San
--    Diego, not because that is right but because its uuid sorted ahead of Los
--    Angeles's in the tie-break. Both branches are in CA, so the state match
--    had two equally good answers and the ORDER BY silently picked one. A coin
--    flip rendered as a branch name, under a tooltip explaining it "names the
--    state", is a confident wrong answer — worse than none, because nobody goes
--    looking for it. `state_match` now requires exactly one active location in
--    that state; otherwise the keyword lands in `unresolved`, where it is
--    visible, countable, and fixed by the human act that actually resolves it.
--    City matches, bound areas and distance are untouched: those name one place.
--    Data Destruction (LA/CA + Houston/TX) proves it is targeted, not blanket.
--
-- The two-argument overload is DROPPED rather than left beside the new one:
-- two overloads of one read is a deprecated twin, and PostgREST resolves
-- overloads by argument names, so the pair is also a live ambiguity.

DROP FUNCTION IF EXISTS seo.gsc_keyword_locations(uuid, uuid[]);

CREATE OR REPLACE FUNCTION seo.gsc_keyword_locations(
  p_site_id uuid,
  p_keyword_ids uuid[] DEFAULT NULL::uuid[],
  p_include_unplaced boolean DEFAULT false
)
 RETURNS TABLE(keyword_id uuid, location_id uuid, location_name text, locality text, region text, decided_by text, place_name text, distance_km numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'platform', 'pg_temp'
AS $function$
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
  -- How many branches sit in each state. A state with more than one cannot
  -- name a branch, and this is what says so.
  state_counts AS (
    SELECT upper(btrim(l.region)) AS region_code, count(*) AS n
    FROM locs l WHERE btrim(COALESCE(l.region,'')) <> '' GROUP BY 1
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
  -- 2. the detected place IS the location's city
  matched_city AS (
    SELECT p.keyword_id, l.id, l.name, l.locality, l.region,
           'place_match'::text, p.place_name, NULL::numeric, 2
    FROM placed p JOIN locs l
      ON p.place_kind = 'city'
     AND lower(btrim(l.locality)) = lower(p.place_name)
     AND (p.state_code IS NULL OR l.region IS NULL OR upper(l.region) = upper(p.state_code))
  ),
  -- 3. the detected place is the location's STATE — and only one branch is in it
  matched_state AS (
    SELECT p.keyword_id, l.id, l.name, l.locality, l.region,
           'state_match'::text, p.place_name, NULL::numeric, 3
    FROM placed p
    JOIN locs l ON p.place_kind = 'state'
               AND upper(btrim(l.region)) = upper(COALESCE(p.state_code, p.place_name))
    JOIN state_counts sc ON sc.region_code = upper(btrim(l.region)) AND sc.n = 1
  ),
  -- 4. coordinates on both sides, inside the knob's radius
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
  -- 5. the brand has exactly one location and the keyword is local at all
  only_one AS (
    SELECT DISTINCT p.keyword_id, l.id, l.name, l.locality, l.region, 'single_location'::text, p.place_name,
           NULL::numeric, 5
    FROM placed p JOIN locs l ON l.id = v_only
    WHERE v_single AND v_only IS NOT NULL
  ),
  all_hits AS (
    SELECT * FROM bound
    UNION ALL SELECT * FROM matched_city
    UNION ALL SELECT * FROM matched_state
    UNION ALL SELECT * FROM near
    UNION ALL SELECT * FROM only_one
  ),
  best AS (
    SELECT DISTINCT ON (h.keyword_id)
           h.keyword_id, h.location_id, h.name, h.locality, h.region, h.decided_by, h.place_name, h.distance_km
    FROM all_hits h(keyword_id, location_id, name, locality, region, decided_by, place_name, distance_km, rank)
    ORDER BY h.keyword_id, h.rank, h.distance_km NULLS LAST, h.location_id
  ),
  -- 6. named a place, resolved to nothing. Only when the caller asks.
  unplaced AS (
    SELECT DISTINCT ON (p.keyword_id)
           p.keyword_id, NULL::uuid, NULL::text, NULL::text, NULL::text,
           'unresolved'::text, p.place_name, NULL::numeric
    FROM placed p
    WHERE p_include_unplaced
      AND NOT EXISTS (SELECT 1 FROM best b WHERE b.keyword_id = p.keyword_id)
    ORDER BY p.keyword_id, p.place_name
  )
  SELECT * FROM best
  UNION ALL
  SELECT * FROM unplaced;
END $function$;

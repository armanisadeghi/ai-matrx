-- ============================================================================
-- KEYWORD INTELLIGENCE — C10 follow-on: THE KEYWORDS BEHIND A LOCATION ROW
-- (2026-08-23, matrx-frontend)
--
-- `seo.gsc_perf_location_summary` answers "how much traffic belongs to each
-- location". The row a person then clicks has to open — NO DEAD ENDS — and the
-- honest answer is the keywords that make up that row, including the two
-- explicit buckets the summary itself names ("Local — location not resolved"
-- and "Not location-specific").
--
-- Built as a server read rather than an intersection done in the browser
-- because the client cannot page a filtered set it does not own: the generic
-- `gsc_perf_breakdown` caps at 1,000 rows and has no location filter, so a
-- client-side intersection would have silently truncated a location's keyword
-- list and looked complete. It composes THE ACCURACY CONTRACT (winning-run
-- dedup per date) exactly like its sibling.
-- ============================================================================

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
    AND spd.keyword_id IS NOT NULL AND spd.date BETWEEN p_start AND p_end;

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
REVOKE ALL ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer) IS
  'C10 — the keywords behind ONE row of gsc_perf_location_summary: a business location, or the explicit unresolved / not_location_specific buckets. Paged server-side so a location list is never silently truncated.';

-- ── Every readiness row names its own DOOR ─────────────────────────────────
-- The gauge told a person what was missing; the UI then had to guess which fix
-- each sentence meant by matching on the sentence itself. A door derived from
-- prose breaks the first time the prose is improved, so the row carries the key.
-- (Return type changes, so this is DROP + CREATE, not CREATE OR REPLACE.)
DROP FUNCTION IF EXISTS seo.gsc_location_readiness(uuid);

CREATE FUNCTION seo.gsc_location_readiness(p_site_id uuid)
RETURNS TABLE(state text, headline text, detail text, count_value bigint, door text)
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
      'Add the places this business actually operates from and every local keyword can be attributed to one of them.', 0::bigint, 'add_location';
    RETURN;
  END IF;
  IF v_locs = 1 THEN
    RETURN QUERY SELECT 'ok', 'One location',
      'Every local keyword is attributed to it. Add more locations and the system starts telling you which one each keyword belongs to.', v_locs, 'manage_locations';
  ELSE
    RETURN QUERY SELECT 'ok', to_char(v_locs, 'FM999,999,999') || ' locations', 'Local keywords are attributed to whichever one their place matches.', v_locs, 'manage_locations';
  END IF;
  IF v_no_city > 0 THEN
    RETURN QUERY SELECT 'gap', to_char(v_no_city, 'FM999,999,999') || ' location(s) have no city or state',
      'Without a city or state there is nothing for a detected place to match — those locations can never win a keyword.', v_no_city, 'fill_city_state';
  END IF;
  IF v_no_coords = v_locs THEN
    RETURN QUERY SELECT 'inert', 'No location has coordinates',
      'Distance-based attribution is switched off until at least one location carries a latitude and longitude. City and state matching still works.', v_no_coords, 'add_coordinates';
  END IF;
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
        'Attribution can only see places the gazetteer has detected. Run place detection on this site''s keywords and locations start winning traffic.', v_windowed, 'run_place_detection';
    ELSIF v_windowed > 0 AND v_placed < v_windowed THEN
      RETURN QUERY SELECT 'gap', to_char(v_windowed - v_placed, 'FM999,999,999') || ' keyword(s) with traffic carry no detected place',
        'Those keywords can never be attributed to a location until place detection has read them.', (v_windowed - v_placed), 'run_place_detection';
    END IF;
  END;

  IF v_areas > 0 AND v_bound = 0 THEN
    RETURN QUERY SELECT 'gap', to_char(v_areas, 'FM999,999,999') || ' service area(s), none bound to a location',
      'Binding an area to a location is the strongest signal — it beats every guess the system would otherwise make.', v_areas, 'bind_area';
  END IF;
END $fn$;
REVOKE ALL ON FUNCTION seo.gsc_location_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_location_readiness(uuid) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_location_readiness(uuid) IS
  'C10 — what is stopping location attribution from working, in the reader''s words, each row carrying the machine key for its own fix (door).';

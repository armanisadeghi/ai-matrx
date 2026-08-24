-- ============================================================================
-- C10 — THE KEYWORDS BEHIND A LOCATION ROW BECOME A REAL TABLE
-- (2026-08-24, matrx-frontend)
--
-- P26: "a surface may change which columns SHOW, never whether they sort or
-- filter." The location drill-in rendered its keywords as a hand-rolled <ul>
-- with a Previous/Next pair — the exact shape `check:one-table-law` exists to
-- catch — and it could not have been converted honestly, because the RPC
-- underneath it answered ONE question: page N of this location's keywords,
-- ordered by clicks.
--
-- Sorting a 25-row page in the browser is not sorting a location's 900
-- keywords, it is a lie about them. So the ONE door grows the parameters the
-- canonical table needs (P28 — extend the read, never open a second one):
--
--   p_search      — the table's search box, matched server-side on the phrase
--   p_sort        — keyword | clicks | impressions | decided_by
--   p_sort_dir    — asc | desc
--   p_decided_by  — the Attributed-by column's filter (a set, OR semantics)
--   p_clicks_min / _max, p_impressions_min / _max — the metric columns' number
--                   filters, exactly as `gsc_perf_breakdown` carries them
--
-- Signature changes, so this is DROP + CREATE. Idempotent: re-running it
-- replaces the same function with the same body.
-- ============================================================================

DROP FUNCTION IF EXISTS seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer);
DROP FUNCTION IF EXISTS seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer, text, text, text, text[]);
DROP FUNCTION IF EXISTS seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer, text, text, text, text[], bigint, bigint, bigint, bigint);

CREATE FUNCTION seo.gsc_location_keywords(
  p_site_id uuid,
  p_location_id uuid DEFAULT NULL,
  p_bucket text DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_sort text DEFAULT 'clicks',
  p_sort_dir text DEFAULT 'desc',
  p_decided_by text[] DEFAULT NULL,
  p_clicks_min bigint DEFAULT NULL,
  p_clicks_max bigint DEFAULT NULL,
  p_impressions_min bigint DEFAULT NULL,
  p_impressions_max bigint DEFAULT NULL
) RETURNS TABLE(
  keyword_id uuid, keyword text, clicks bigint, impressions bigint,
  decided_by text, place_name text, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'web', 'pg_temp'
AS $fn$
DECLARE
  v_ids uuid[];
  v_sort text := lower(coalesce(nullif(btrim(p_sort), ''), 'clicks'));
  v_dir text := lower(coalesce(nullif(btrim(p_sort_dir), ''), 'desc'));
  v_search text := nullif(btrim(coalesce(p_search, '')), '');
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
  -- An unknown sort key is a BUG in the caller, not a reason to quietly return
  -- a differently-ordered list that looks sorted.
  IF v_sort NOT IN ('keyword', 'clicks', 'impressions', 'decided_by') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: % (use keyword, clicks, impressions or decided_by)', v_sort;
  END IF;
  IF v_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: % (use asc or desc)', v_dir;
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
  ),
  -- Search and the attributed-by filter narrow the SET, so the count the table
  -- pages against is the count of what the person is actually looking at.
  shown AS (
    SELECT r.* FROM rolled r
    WHERE (v_search IS NULL OR r.q ILIKE '%' || v_search || '%')
      AND (p_decided_by IS NULL OR array_length(p_decided_by, 1) IS NULL
           OR coalesce(r.how, 'unattributed') = ANY (p_decided_by))
      AND (p_clicks_min IS NULL OR r.c >= p_clicks_min)
      AND (p_clicks_max IS NULL OR r.c <= p_clicks_max)
      AND (p_impressions_min IS NULL OR r.i >= p_impressions_min)
      AND (p_impressions_max IS NULL OR r.i <= p_impressions_max)
  )
  SELECT s.kid, s.q, s.c, s.i, s.how, s.pname, COUNT(*) OVER ()::bigint
  FROM shown s
  ORDER BY
    CASE WHEN v_sort = 'clicks'      AND v_dir = 'desc' THEN s.c END DESC,
    CASE WHEN v_sort = 'clicks'      AND v_dir = 'asc'  THEN s.c END ASC,
    CASE WHEN v_sort = 'impressions' AND v_dir = 'desc' THEN s.i END DESC,
    CASE WHEN v_sort = 'impressions' AND v_dir = 'asc'  THEN s.i END ASC,
    CASE WHEN v_sort = 'keyword'     AND v_dir = 'desc' THEN s.q END DESC,
    CASE WHEN v_sort = 'keyword'     AND v_dir = 'asc'  THEN s.q END ASC,
    CASE WHEN v_sort = 'decided_by'  AND v_dir = 'desc' THEN s.how END DESC NULLS LAST,
    CASE WHEN v_sort = 'decided_by'  AND v_dir = 'asc'  THEN s.how END ASC NULLS LAST,
    -- A paginated ORDER BY that can tie is an unstable list: the same keyword
    -- shows on page 2 and page 3 and another is never seen at all. The id
    -- breaks every tie.
    s.kid
  LIMIT p_limit OFFSET p_offset;
END $fn$;

REVOKE ALL ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer, text, text, text, text[], bigint, bigint, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer, text, text, text, text[], bigint, bigint, bigint, bigint) TO authenticated, service_role;
COMMENT ON FUNCTION seo.gsc_location_keywords(uuid, uuid, text, date, date, integer, integer, text, text, text, text[], bigint, bigint, bigint, bigint) IS
  'C10 — the keywords behind ONE row of gsc_perf_location_summary: a business location, or the explicit unresolved / not_location_specific buckets. Search, sort, attributed-by filter and pagination are ALL server-side (P26/P28), so the canonical table never sorts one page and calls it a list.';

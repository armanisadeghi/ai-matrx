-- KI-022 — THE COVERAGE METER, MADE FAST ENOUGH TO EXIST.
--
-- `seo.gsc_dimension_coverage` shipped with the C6 tail and had no reader
-- until now. Wiring one up exposed why that was survivable: measured live on
-- Data Destruction (17 dimensions, 8,263 keywords in a 90-day window) it took
-- **11.4 seconds** and the panel simply spun. A meter whose whole job is trust
-- cannot be one nobody ever sees finish.
--
-- THE COST WAS ONE ARGUMENT. The stamp read was handed an ARRAY of the
-- window's ~8,000 keyword ids — `kf.keyword_id = ANY($1)` inside
-- `gsc_effective_stamps` — which turns an index scan into a scan-and-rank of
-- the whole facet table. Asking that same function for the site's ENTIRE stamp
-- plane costs 1.1s (64,621 rows), and joining the window to it is the same
-- answer:
--
--   11,421 ms  ->  1,600 ms   (identical output, verified row for row on
--                              urgency / audience_type / the site's own
--                              Qualifiers before and after)
--
-- Nothing else changes: the daily de-duplication, THE ABSTAIN RULE
-- (`decided_*` excludes "not clear") and the "every dimension is returned,
-- including the empty ones" contract are untouched. `seo.gsc_stamp_keyword_set`
-- — the predicate behind this meter's `st=<dimension>:__none` door — already
-- asks for the whole plane, which is why the door was fast while the meter
-- was not.
--
-- Idempotent: CREATE OR REPLACE only.
SET search_path TO seo, public;

CREATE OR REPLACE FUNCTION seo.gsc_dimension_coverage(p_site_id uuid, p_start date, p_end date)
 RETURNS TABLE(dimension text, dimension_label text, scope text, nature text, total_clicks bigint, total_keywords bigint, decided_clicks bigint, decided_keywords bigint, stamped_clicks bigint, stamped_keywords bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
BEGIN
  -- THE SCOPE RULE's access half: this reads one site's traffic and one
  -- site's vocabulary, so it asserts that site exactly like every other
  -- gsc_* read. Never widen it to "any site the caller can name".
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_start IS NULL OR p_end IS NULL OR p_start > p_end THEN
    RAISE EXCEPTION 'gsc_window_invalid: the window must start on or before it ends.';
  END IF;

  RETURN QUERY
  WITH winner AS (
    -- One run per day, newest wins — the same de-duplication every other
    -- perf read uses. Summing across re-syncs would inflate BOTH sides of
    -- every share on this screen.
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  kw AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS clicks
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  tot AS (
    SELECT COALESCE(sum(k.clicks), 0)::bigint AS all_clicks,
           count(*)::bigint AS all_keywords
    FROM kw k
  ),
  es AS (
    -- PERFORMANCE (see header): ask for the site's whole stamp plane and join
    -- the window to it, never `= ANY(<8k ids>)`.
    --
    -- DISTINCT because a multi-cardinality dimension stamps a keyword more
    -- than once; coverage asks "does this keyword carry ANY answer here",
    -- so a keyword must contribute its clicks to a dimension exactly once.
    SELECT DISTINCT e.dimension AS dim, e.keyword_id AS kid,
           COALESCE((cv.metadata->>'abstain')::boolean, false) AS is_abstain
    FROM seo.gsc_effective_stamps(p_site_id, NULL) e
    JOIN kw k ON k.kid = e.keyword_id
    JOIN platform.categories cv ON cv.id = e.value_id
  ),
  per_kw AS (
    SELECT e.dim, e.kid, bool_or(NOT e.is_abstain) AS decided
    FROM es e
    GROUP BY 1, 2
  ),
  agg AS (
    SELECT p.dim,
           COALESCE(sum(k.clicks) FILTER (WHERE p.decided), 0)::bigint AS d_clicks,
           count(*) FILTER (WHERE p.decided)::bigint AS d_keywords,
           COALESCE(sum(k.clicks), 0)::bigint AS s_clicks,
           count(*)::bigint AS s_keywords
    FROM per_kw p
    JOIN kw k ON k.kid = p.kid
    GROUP BY 1
  ),
  dims AS (
    SELECT c.slug, c.name,
           COALESCE(c.metadata->>'scope', 'platform') AS dim_scope,
           COALESCE(c.metadata->>'nature', 'intrinsic') AS dim_nature
    FROM platform.categories c
    WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL AND c.deleted_at IS NULL
      AND (
        COALESCE(c.metadata->>'scope', 'platform') = 'platform'
        OR (c.metadata->>'site_id')::uuid = p_site_id
      )
  )
  SELECT d.slug, d.name, d.dim_scope, d.dim_nature,
         t.all_clicks, t.all_keywords,
         COALESCE(a.d_clicks, 0), COALESCE(a.d_keywords, 0),
         COALESCE(a.s_clicks, 0), COALESCE(a.s_keywords, 0)
  FROM dims d
  CROSS JOIN tot t
  LEFT JOIN agg a ON a.dim = d.slug
  ORDER BY COALESCE(a.d_clicks, 0) DESC, COALESCE(a.d_keywords, 0) DESC, d.name;
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.gsc_dimension_coverage(uuid, date, date) TO authenticated;

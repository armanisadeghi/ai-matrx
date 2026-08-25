-- KI-022 — "NOT ANSWERED" IS A FILTER, because a coverage meter without a door
-- is a scoreboard.
--
-- THE GAP. `seo.gsc_dimension_coverage` (C6 tail) says what share of a site's
-- clicks carries a decided answer in each dimension. The honest next question
-- is always the same one — "show me the ones that don't" — and the stamp
-- filter grammar could not express it: `st=<dimension>:<value>` only ever
-- selected keywords that CARRY a value. So the meter could report 3% coverage
-- and then strand the reader with no way to work the other 97%.
--
-- THE SENTINEL. `st=<dimension>:__none` now means "this keyword carries no
-- DECIDED answer in that dimension". One value key, one place: this function
-- is the single predicate behind `gsc_perf_breakdown`, `gsc_perf_summary`,
-- `gsc_perf_timeseries` and `gsc_breakdown_keyword_ids`, so the table, the
-- totals, the chart and "select all matching" all learn it at once and can
-- never disagree. `__none` cannot collide with a real value: every value key
-- is a slug, and `platform.categories` has never minted one starting `__`
-- (verified live before this shipped).
--
-- ABSTAIN IS NOT AN ANSWER — the same ruling the meter already makes. A
-- dimension whose "not clear" value is stamped on a keyword has been LOOKED at
-- and declined, and `decided_*` in the coverage meter excludes it. If this
-- filter counted an abstain as answered, the meter's blank count and the list
-- behind its door would disagree, which is worse than having no door.
--
-- MIXING. Positive pairs stay all-of and combine freely with negative ones:
-- `st=audience_type:consumer|urgency:__none` is "consumer keywords nobody has
-- rated for urgency". With only negative pairs the universe is every keyword
-- this site has Search Console history for, minus the answered ones.
--
-- Idempotent: CREATE OR REPLACE only.
SET search_path TO seo, public;

CREATE OR REPLACE FUNCTION seo.gsc_stamp_keyword_set(p_site_id uuid, p_stamps jsonb)
RETURNS TABLE(kw_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  WITH want AS (
    SELECT DISTINCT NULLIF(btrim(e->>'dimension'),'') AS dim,
                    NULLIF(btrim(e->>'value'),'') AS val
    FROM jsonb_array_elements(COALESCE(p_stamps,'[]'::jsonb)) e
  ),
  want_ok AS (SELECT * FROM want WHERE dim IS NOT NULL AND val IS NOT NULL),
  -- "carries this value" and "carries nothing here" are different questions,
  -- so they are different sets and are answered separately.
  pos AS (SELECT dim, val FROM want_ok WHERE val <> '__none'),
  neg AS (SELECT DISTINCT dim FROM want_ok WHERE val = '__none'),
  n AS (SELECT count(*) AS c FROM pos),
  have AS (
    SELECT es.keyword_id, es.dimension, es.value
    FROM seo.gsc_effective_stamps(p_site_id, NULL) es
    JOIN pos w ON w.dim = es.dimension AND w.val = es.value
  ),
  matched_pos AS (
    SELECT h.keyword_id AS kid
    FROM have h, n
    GROUP BY h.keyword_id, n.c
    HAVING count(DISTINCT h.dimension||':'||h.value) = n.c AND n.c > 0
  ),
  -- Only walked when a `__none` pair is present and no positive pair already
  -- narrowed the set: a "not answered" filter has to subtract from something,
  -- and the something is every keyword this site has history for. Rides
  -- `sperf_site_keyword_scope_idx (site_id, keyword_id)`.
  universe AS (
    SELECT DISTINCT spd.keyword_id AS kid
    FROM seo.search_performance_daily spd
    WHERE spd.site_id = p_site_id
      AND spd.keyword_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM neg)
      AND (SELECT c FROM n) = 0
  ),
  base AS (
    SELECT kid FROM matched_pos
    UNION
    SELECT kid FROM universe
  ),
  -- Abstain is not an answer (see header) — this is the SAME predicate
  -- `gsc_dimension_coverage.decided_*` uses, so the meter's blank count and
  -- this list are one number.
  decided AS (
    SELECT DISTINCT es.keyword_id AS kid, es.dimension AS dim
    FROM seo.gsc_effective_stamps(p_site_id, NULL) es
    JOIN platform.categories cv ON cv.id = es.value_id
    JOIN neg ON neg.dim = es.dimension
    WHERE COALESCE((cv.metadata->>'abstain')::boolean, false) = false
  )
  SELECT b.kid
  FROM base b
  WHERE NOT EXISTS (SELECT 1 FROM decided d WHERE d.kid = b.kid);
$function$;

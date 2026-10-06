-- based-on: seo.gsc_stamp_keyword_set(uuid, jsonb) 56d76cd3c14706353e74a9a4917fd2155db27e1512384b01eecf6367aa030da5
-- KEYWORD TAGS — the tag filter's "Any of".
--
-- `seo.gsc_stamp_keyword_set` is the ONE stamp predicate behind
-- `gsc_perf_breakdown`, `gsc_perf_summary`, `gsc_perf_timeseries` and
-- `gsc_breakdown_keyword_ids`. Every pair it receives is ALL-OF. The keyword
-- table's tag filter also needs ANY-OF ("tagged priority OR saved"), so an
-- element may now carry `"mode": "any"`; the any-elements form ONE any-of
-- group (the keyword carries at least one of them). Plain pairs keep their
-- all-of meaning, and `__none` (KI-022) is unchanged.
--
-- Applied live through the Supabase MCP on 2026-10-05 and verified as
-- admin@admin.com on Data Destruction: All-of a+b = 1, Any-of a|b = 3;
-- Class = Money still 1,222. This file captures those exact bytes, so
-- applying it on live is a no-op. Inverse: migrations/inverse/seo_keyword_tags_any_of_stamp_filter_down.sql
--
-- Idempotent: CREATE OR REPLACE only; signature, owner and grants unchanged.

CREATE OR REPLACE FUNCTION seo.gsc_stamp_keyword_set(p_site_id uuid, p_stamps jsonb)
 RETURNS TABLE(kw_id uuid)
 LANGUAGE sql
 STABLE
 SET search_path TO 'seo', 'platform', 'pg_temp'
AS $function$
  -- Every element is ALL-OF (the keyword must carry it) unless it says
  -- "mode": "any"; the any-elements form ONE any-of group (the keyword must
  -- carry at least one of them). The tag filter's "Any" sends its tags that
  -- way; everything else keeps sending plain pairs and means what it meant.
  WITH want AS (
    SELECT DISTINCT NULLIF(btrim(e->>'dimension'),'') AS dim,
                    NULLIF(btrim(e->>'value'),'') AS val,
                    COALESCE(btrim(e->>'mode'), '') = 'any' AS any_of
    FROM jsonb_array_elements(COALESCE(p_stamps,'[]'::jsonb)) e
  ),
  want_ok AS (SELECT * FROM want WHERE dim IS NOT NULL AND val IS NOT NULL),
  -- "carries this value" and "carries nothing here" are different questions,
  -- so they are different sets and are answered separately.
  pos AS (SELECT dim, val, any_of FROM want_ok WHERE val <> '__none'),
  neg AS (SELECT DISTINCT dim FROM want_ok WHERE val = '__none'),
  n AS (
    SELECT count(DISTINCT dim||':'||val) FILTER (WHERE NOT any_of) AS c_all,
           count(*) FILTER (WHERE any_of) AS c_any
    FROM pos
  ),
  have AS (
    SELECT es.keyword_id, es.dimension, es.value, w.any_of
    FROM seo.gsc_effective_stamps(p_site_id, NULL) es
    JOIN pos w ON w.dim = es.dimension AND w.val = es.value
  ),
  matched_pos AS (
    SELECT h.keyword_id AS kid
    FROM have h, n
    GROUP BY h.keyword_id, n.c_all, n.c_any
    HAVING count(DISTINCT h.dimension||':'||h.value) FILTER (WHERE NOT h.any_of) = n.c_all
       AND (n.c_any = 0 OR count(*) FILTER (WHERE h.any_of) > 0)
       AND n.c_all + n.c_any > 0
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
      AND (SELECT c_all + c_any FROM n) = 0
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

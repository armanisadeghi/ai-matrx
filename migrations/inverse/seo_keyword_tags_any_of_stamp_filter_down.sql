-- chair-step: restores seo.gsc_stamp_keyword_set to the all-of-only body live before seo_keyword_tags_any_of_stamp_filter.sql (elements marked mode any are then read as all-of) — only if that change must be undone.
-- based-on: seo.gsc_stamp_keyword_set(uuid, jsonb) 56d76cd3c14706353e74a9a4917fd2155db27e1512384b01eecf6367aa030da5
-- Inverse of migrations/seo_keyword_tags_any_of_stamp_filter.sql. The body is the live
-- pg_get_functiondef text from before that change (identical to seo_ki022_stamp_blank_filter.sql).
-- No data is written either way.

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

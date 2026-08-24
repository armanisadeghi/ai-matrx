-- The value screen should open on the QUESTIONS, not the answer.
--
-- Arman, 2026-08-25: "It immediately tries to force you to select the level.
-- Isn't that the exact opposite of what we just worked our asses off doing?
-- … it should have [a few] of the most important columns that it tries to get
-- me to quickly answer … because those are the things that are then gonna be
-- used to calculate a score that's gonna give me a level."
--
-- The dimension columns already existed on that screen but were opt-in through
-- `?cols=`, so with no URL the page rendered exactly one editable thing: the
-- LEVEL — the output. This read supplies the default set, so the screen opens
-- with the inputs in front of the person.
--
-- Order, most useful first:
--   1. dimensions this site attached WORTH to — answering them changes the score
--   2. dimensions whose answers are MISSING on the site's demand keywords —
--      the emptiest useful question is the most worth asking
--   3. platform position as the tie-break
-- `traffic_class` is not returned: the screen already renders it as its own
-- column, and offering it twice would be the duplication P22 warns about.

CREATE OR REPLACE FUNCTION seo.gsc_suggested_dimension_columns(
  p_site_id uuid,
  p_limit   int DEFAULT 3
) RETURNS TABLE (
  slug text, label text, has_worth boolean,
  answered bigint, total bigint, why text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH demand AS MATERIALIZED (
    -- The site's keywords that actually earn attention. Bounded on purpose:
    -- this is a screen default, not an audit (THE SCOPE RULE).
    SELECT DISTINCT spd.keyword_id AS kid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date >= current_date - 90
      AND spd.keyword_id IS NOT NULL
  ),
  dims AS (
    SELECT d.id, d.slug, d.name,
           COALESCE(d.position, 999) AS position
    FROM platform.categories d
    WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL AND d.deleted_at IS NULL
      AND d.slug <> 'traffic_class'
      AND (COALESCE(d.metadata->>'scope','platform') = 'platform'
           OR d.metadata->>'site_id' = p_site_id::text)
  ),
  worthy AS (
    SELECT DISTINCT v.parent_id AS dim_id
    FROM seo.site_value_worth w
    JOIN platform.categories v ON v.id = w.value_id
    WHERE w.site_id = p_site_id AND w.deleted_at IS NULL
  ),
  answered AS (
    SELECT v.parent_id AS dim_id, count(DISTINCT kf.keyword_id) AS n
    FROM seo.keyword_facet kf
    JOIN demand ON demand.kid = kf.keyword_id
    JOIN platform.categories v ON v.id = kf.category_id AND v.deleted_at IS NULL
    WHERE kf.deleted_at IS NULL
      AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    GROUP BY v.parent_id
  )
  SELECT d.slug, d.name,
         (w.dim_id IS NOT NULL),
         COALESCE(a.n, 0)::bigint,
         (SELECT count(*) FROM demand)::bigint,
         CASE
           WHEN w.dim_id IS NOT NULL AND COALESCE(a.n,0) = 0
             THEN 'changes the score, and nothing is answered yet'
           WHEN w.dim_id IS NOT NULL THEN 'changes the score here'
           WHEN COALESCE(a.n,0) = 0 THEN 'nothing answered yet'
           ELSE 'partly answered'
         END
  FROM dims d
  LEFT JOIN worthy w ON w.dim_id = d.id
  LEFT JOIN answered a ON a.dim_id = d.id
  ORDER BY (w.dim_id IS NOT NULL) DESC,
           (COALESCE(a.n,0)::numeric / GREATEST((SELECT count(*) FROM demand), 1)) ASC,
           d.position, d.slug
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 3), 8));
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_suggested_dimension_columns(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_suggested_dimension_columns(uuid, int) TO authenticated, service_role;

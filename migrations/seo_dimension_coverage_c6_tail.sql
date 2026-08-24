-- C6 TAIL (I10) — THE DIMENSION COVERAGE METER
--
-- The gap this closes. Since C6 any dimension can be a filter anywhere in
-- Search Console. Nothing said how much of the corpus that dimension actually
-- describes, so "local intent = near me" could narrow 8,415 keywords to 3 and
-- look like an answer about the business when it was an answer about the
-- BACKFILL. A filter is honest; an unclassified corpus is not a finding.
--
-- ONE server read answers it for every dimension at once (the Dimensions
-- screen renders a row each; the filter bar warns inline on the one being
-- filtered). Two honest denominators, both from the SAME window the caller is
-- looking at:
--
--   clicks   — every click the `query` profile recorded in the window. This is
--              the headline, because a dimension that covers 3% of keywords but
--              80% of clicks is doing its job and the reverse is not.
--   keywords — every distinct keyword that drew any row in that window. Quiet
--              second number, exactly the facet-backfill strip's convention.
--
-- ABSTAIN IS NOT COVERAGE. A dimension whose "not clear" answer is stamped on
-- a keyword has been LOOKED at and declined; the filter bar cannot offer that
-- value (it hides abstains), so counting it as covered would promise a filter
-- that cannot be built. `decided_*` excludes abstains and is what the meter
-- and the warning read; `stamped_*` keeps the honest total beside it so the
-- difference ("looked at, could not tell") is visible rather than laundered.
--
-- Every dimension in the site's catalog is returned, including the ones with
-- zero coverage — a dimension missing from the answer would render as absent
-- instead of as empty, which is the failure this whole meter exists to end.
--
-- Idempotent: CREATE OR REPLACE + an ON CONFLICT knob seed.
SET search_path TO seo, public;

CREATE OR REPLACE FUNCTION seo.gsc_dimension_coverage(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE(
  dimension text,
  dimension_label text,
  scope text,
  nature text,
  total_clicks bigint,
  total_keywords bigint,
  decided_clicks bigint,
  decided_keywords bigint,
  stamped_clicks bigint,
  stamped_keywords bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
    -- DISTINCT because a multi-cardinality dimension stamps a keyword more
    -- than once; coverage asks "does this keyword carry ANY answer here",
    -- so a keyword must contribute its clicks to a dimension exactly once.
    SELECT DISTINCT e.dimension AS dim, e.keyword_id AS kid,
           COALESCE((cv.metadata->>'abstain')::boolean, false) AS is_abstain
    FROM seo.gsc_effective_stamps(p_site_id, ARRAY(SELECT k.kid FROM kw k)) e
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

-- ---------------------------------------------------------------------------
-- The warning threshold is a KNOB, not a constant
-- ---------------------------------------------------------------------------
-- LIMITS ARE KNOBS (common-docs/policies/limits-are-knobs-agents-set-them.md):
-- "below this share of clicks, warn the person that the corpus is not
-- classified" is a gate threshold, so it is an admin-turnable row rather than
-- a number compiled into the bundle.
--
-- Agent-set limit (blind approval). Set by the GSC saved-segments session on
-- 2026-08-23. Basis: on Data Destruction's 90-day window the platform
-- dimensions land between 0% and 55% of clicks; 20% is the point below which a
-- filtered slice stops being a statement about the business and starts being a
-- statement about the backfill queue. Review by 2026-11-23 with real
-- multi-site data.
--   window_days — how much history the Dimensions screen measures coverage
--   over when no window is on screen. 90 matches every other "is this feature
--   inert" strip in the value system.
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
VALUES
  ('seo.dimension_coverage', 'low_coverage_click_pct', '20'::jsonb, '20'::jsonb,
   'integer', 'percent', 0, 100,
   'Low dimension coverage threshold',
   'Below this share of the window''s clicks, filtering by a dimension warns that the corpus is not classified yet.',
   'agent',
   'On Data Destruction''s 90-day window, platform dimensions cover between 0% and 55% of clicks. Below 20%, a filtered slice describes the backfill queue more than the business. Re-measure with multi-site data before changing it.',
   '2026-11-23'),
  ('seo.dimension_coverage', 'window_days', '90'::jsonb, '90'::jsonb,
   'integer', 'days', 1, 480,
   'Dimension coverage window',
   'How many days of history the Dimensions screen measures coverage over.',
   'agent',
   'Ninety days matches the established inert-feature coverage strips and smooths weekday seasonality while remaining recent enough to expose an incomplete classification corpus.',
   '2026-11-23')
ON CONFLICT (feature, key) DO NOTHING;

-- CORRECTION to `seo_matcher_match_review.sql`, same session: the first version
-- could not finish inside the 8-second `authenticated` statement timeout, so
-- the review panel showed a loading skeleton forever on any match with real
-- reach. Measured live on Data Destruction: a `contains 'shredding'` match with
-- 2,906 hits never returned.
--
-- WHY IT WAS SLOW. It evaluated EVERY matcher on the dimension against EVERY
-- keyword in the site's scope — ~25 matchers × ~31,000 keywords ≈ 775,000
-- LIKE/regex evaluations — and only then narrowed to the 300 rows it displays.
--
-- NARROW FIRST, THEN ENRICH. The rewrite runs this matcher's own predicate once
-- over the scope, ranks by traffic, cuts to the display limit, and only then
-- asks the expensive questions (who else matches, what holds it, what else the
-- keyword wears) about the handful of rows a human will actually read. Same
-- columns, same semantics, same predicates copied from
-- `fn_evaluate_matchers_internal` — only the order of work changed.
--
-- `total_matches` is still counted over the FULL match set, never the page, so
-- "catches 2,906" stays true while the table shows the top 200.

CREATE OR REPLACE FUNCTION seo.matcher_match_review(
  p_site_id    uuid,
  p_matcher_id uuid,
  p_limit      integer DEFAULT 200
)
RETURNS TABLE(
  keyword_id     uuid,
  phrase         text,
  clicks         bigint,
  impressions    bigint,
  outcome        text,
  holding_value  text,
  holding_source text,
  rivals         text[],
  other_answers  jsonb,
  total_matches  bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_m      record;
  v_window integer := 90;
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 1000);
  v_total  bigint := 0;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  SELECT dm.id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,
         cv.parent_id AS dim_id
    INTO v_m
  FROM seo.dimension_value_matcher dm
  JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
  WHERE dm.id = p_matcher_id AND dm.site_id = p_site_id AND dm.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'seo_matcher_unknown: that match no longer exists on this site.';
  END IF;

  -- ONE pass of this matcher's own predicate over the site's keywords.
  CREATE TEMP TABLE IF NOT EXISTS _mine (kw_id uuid PRIMARY KEY) ON COMMIT DROP;
  TRUNCATE _mine;
  INSERT INTO _mine
  WITH scope AS (
    SELECT DISTINCT x.kw_id FROM (
      SELECT spd.keyword_id AS kw_id FROM seo.search_performance_daily spd
       WHERE spd.site_id = p_site_id AND spd.keyword_id IS NOT NULL
      UNION
      SELECT skv.keyword_id FROM seo.site_keyword_value skv
       WHERE skv.site_id = p_site_id AND skv.deleted_at IS NULL
      UNION
      SELECT kf.keyword_id FROM seo.keyword_facet kf
       WHERE kf.site_id = p_site_id AND kf.deleted_at IS NULL
    ) x WHERE x.kw_id IS NOT NULL
  )
  SELECT k.id
    FROM seo.keyword k JOIN scope s ON s.kw_id = k.id
   WHERE k.deleted_at IS NULL
     AND (
       CASE v_m.kind
         WHEN 'contains'    THEN k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(v_m.pattern) || '%'
         WHEN 'exact'       THEN k.normalized_phrase = v_m.pattern
         WHEN 'starts_with' THEN k.normalized_phrase LIKE seo.gsc_perf_like_escape(v_m.pattern) || '%'
         WHEN 'ends_with'   THEN k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(v_m.pattern)
         WHEN 'word'        THEN k.normalized_phrase ~ ('\m' || v_m.pattern || '\M')
         ELSE false
       END
     );

  -- Place and fact matchers do not read the phrase at all; they resolve through
  -- their own join tables.
  IF v_m.kind = 'place' THEN
    INSERT INTO _mine
    SELECT DISTINCT kp.keyword_id FROM seo.keyword_place kp
     WHERE kp.place_id = v_m.place_id AND kp.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM seo.search_performance_daily spd
                    WHERE spd.site_id = p_site_id AND spd.keyword_id = kp.keyword_id)
    ON CONFLICT DO NOTHING;
  ELSIF v_m.kind = 'fact' THEN
    INSERT INTO _mine
    SELECT DISTINCT kf.keyword_id FROM seo.keyword_facet kf
     WHERE kf.category_id = v_m.fact_value_id AND kf.deleted_at IS NULL
       AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    ON CONFLICT DO NOTHING;
  ELSIF v_m.kind = 'brand_identity' THEN
    -- The brand matcher's reach is whatever `gsc_brand_hits` says today; it has
    -- no pattern of its own to replay.
    INSERT INTO _mine
    SELECT DISTINCT bh.keyword_id FROM seo.gsc_brand_hits(p_site_id) bh
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT count(*) INTO v_total FROM _mine;

  -- Rank by traffic and CUT before doing anything expensive.
  CREATE TEMP TABLE IF NOT EXISTS _top
    (kw_id uuid PRIMARY KEY, clicks bigint, impressions bigint) ON COMMIT DROP;
  TRUNCATE _top;
  INSERT INTO _top
  WITH win AS (
    SELECT DISTINCT ON (spd.date) spd.date, spd.run_id
      FROM seo.search_performance_daily spd
     WHERE spd.site_id = p_site_id AND spd.provider = 'gsc'
       AND spd.dimension_profile = 'query'
       AND spd.date >= current_date - v_window
     ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  perf AS (
    SELECT spd.keyword_id,
           COALESCE(sum(spd.clicks), 0)::bigint AS clicks,
           COALESCE(sum(spd.impressions), 0)::bigint AS impressions
      FROM seo.search_performance_daily spd
      JOIN win w ON w.date = spd.date AND w.run_id = spd.run_id
      JOIN _mine m ON m.kw_id = spd.keyword_id
     WHERE spd.site_id = p_site_id AND spd.provider = 'gsc'
       AND spd.dimension_profile = 'query'
       AND spd.date >= current_date - v_window
     GROUP BY spd.keyword_id
  )
  SELECT m.kw_id, COALESCE(p.clicks, 0), COALESCE(p.impressions, 0)
    FROM _mine m LEFT JOIN perf p ON p.keyword_id = m.kw_id
   ORDER BY COALESCE(p.clicks, 0) DESC, COALESCE(p.impressions, 0) DESC, m.kw_id
   LIMIT v_limit;

  RETURN QUERY
  WITH rival AS (
    -- Only the OTHER matchers on this dimension, and only against the rows on
    -- screen. This is the join that used to cost three quarters of a million
    -- pattern evaluations.
    SELECT t.kw_id, array_agg(DISTINCT cv.name ORDER BY cv.name) AS labels
      FROM _top t
      JOIN seo.keyword k ON k.id = t.kw_id
      JOIN seo.dimension_value_matcher dm ON dm.site_id = p_site_id
       AND dm.deleted_at IS NULL AND dm.enabled AND dm.id <> p_matcher_id
       AND dm.kind IN ('exact','word','contains','starts_with','ends_with')
      JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
       AND cv.parent_id = v_m.dim_id
     WHERE (dm.kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(dm.pattern) || '%')
        OR (dm.kind = 'exact'       AND k.normalized_phrase = dm.pattern)
        OR (dm.kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(dm.pattern) || '%')
        OR (dm.kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(dm.pattern))
        OR (dm.kind = 'word'        AND k.normalized_phrase ~ ('\m' || dm.pattern || '\M'))
     GROUP BY t.kw_id
  ),
  holder AS (
    SELECT kf.keyword_id, cv.name AS value_label, kf.source, kf.pinned, kf.matcher_id
      FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id
      JOIN _top t ON t.kw_id = kf.keyword_id
     WHERE kf.deleted_at IS NULL AND cv.parent_id = v_m.dim_id
       AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
  ),
  others AS (
    SELECT kf.keyword_id,
           jsonb_agg(jsonb_build_object('dimension', cd.name, 'value', cv.name,
                                        'source', kf.source)
                     ORDER BY cd.name) AS answers
      FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
      JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
      JOIN _top t ON t.kw_id = kf.keyword_id
     WHERE kf.deleted_at IS NULL AND cv.parent_id <> v_m.dim_id
       AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
     GROUP BY kf.keyword_id
  )
  SELECT t.kw_id,
         k.phrase,
         t.clicks,
         t.impressions,
         CASE
           WHEN h.keyword_id IS NULL THEN 'unstamped'
           WHEN h.matcher_id = p_matcher_id THEN 'held'
           WHEN h.pinned OR h.source = 'human' THEN 'blocked'
           ELSE 'lost'
         END,
         h.value_label,
         h.source,
         COALESCE(r.labels, '{}'::text[]),
         COALESCE(o.answers, '[]'::jsonb),
         v_total
    FROM _top t
    JOIN seo.keyword k ON k.id = t.kw_id
    LEFT JOIN holder h ON h.keyword_id = t.kw_id
    LEFT JOIN rival r  ON r.kw_id = t.kw_id
    LEFT JOIN others o ON o.keyword_id = t.kw_id
   ORDER BY t.clicks DESC, t.impressions DESC, k.phrase;
END;
$function$;

REVOKE ALL ON FUNCTION seo.matcher_match_review(uuid, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.matcher_match_review(uuid, uuid, integer) TO authenticated;

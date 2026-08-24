-- WHAT DID THAT MATCHER ACTUALLY DO — the read behind the match-review panel.
--
-- ARMAN'S RULING (2026-08-24): *"when you do run the matcher, instead of just
-- giving a count in a toast, you need to get a nice, beautiful, big UI… a table
-- that shows you all the keywords that match, and then use colors to show ones
-- that already have matched other qualifiers so you can understand if you have
-- overlap… and give you a way to undo."*
--
-- A COUNT IS NOT A REVIEW. "19 keywords matched" tells you nothing about
-- WHICH nineteen, whether they were already spoken for, or whether the ones you
-- wanted are missing. On a SINGLE-answer dimension it hides the thing that
-- matters most: a keyword this matcher catches can already be held by a rival
-- matcher, so your rule fired and changed nothing — and the toast said 19.
--
-- THE FOUR OUTCOMES, which are the whole point of the panel:
--   held      — this matcher's answer is the one on the keyword. It worked.
--   lost      — it matches, but another matcher's answer holds the dimension.
--               The engine allows one answer here and picked the other one.
--   blocked   — a person's own ruling (or a pinned answer) holds it. Matchers
--               never overwrite a human, by design.
--   unstamped — it matches and nothing holds the dimension. Only possible if
--               the engine has not run since the matcher changed.
--
-- `rivals` names the other answers on this same dimension whose matchers ALSO
-- catch the keyword, so "why did this one lose" is answerable on the row rather
-- than by opening every other value in turn.
--
-- The match predicates are COPIED FROM `fn_evaluate_matchers_internal` and must
-- stay identical to it. A review that disagrees with the engine is worse than
-- no review — this function only ever REPORTS, it never writes.

CREATE OR REPLACE FUNCTION seo.matcher_match_review(
  p_site_id    uuid,
  p_matcher_id uuid,
  p_limit      integer DEFAULT 300
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
  v_limit  integer := LEAST(GREATEST(COALESCE(p_limit, 300), 1), 2000);
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

  RETURN QUERY
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
  ),
  kw AS (
    SELECT k.id, k.phrase, k.normalized_phrase
      FROM seo.keyword k JOIN scope s ON s.kw_id = k.id
     WHERE k.deleted_at IS NULL
  ),
  -- Every enabled pattern/place/fact matcher on THIS dimension, this matcher
  -- included — one pass answers both "what do I catch" and "who else does".
  dim_matchers AS (
    SELECT dm.id, dm.value_id, dm.kind, dm.pattern, dm.place_id, dm.fact_value_id,
           cv.name AS value_label
      FROM seo.dimension_value_matcher dm
      JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
     WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
       AND cv.parent_id = v_m.dim_id
       AND dm.kind NOT IN ('condition','brand_identity')
  ),
  dim_hits AS (
    SELECT kw.id AS kw_id, m.id AS matcher_id, m.value_label
      FROM kw JOIN dim_matchers m
        ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
             (m.kind = 'contains'    AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
          OR (m.kind = 'exact'       AND kw.normalized_phrase = m.pattern)
          OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
          OR (m.kind = 'ends_with'   AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
          OR (m.kind = 'word'        AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    SELECT kp.keyword_id, m.id, m.value_label
      FROM dim_matchers m
      JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL
      JOIN scope s ON s.kw_id = kp.keyword_id
     WHERE m.kind = 'place'
    UNION ALL
    SELECT kf.keyword_id, m.id, m.value_label
      FROM dim_matchers m
      JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL
                                AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
      JOIN scope s ON s.kw_id = kf.keyword_id
     WHERE m.kind = 'fact'
  ),
  mine AS (SELECT DISTINCT kw_id FROM dim_hits WHERE matcher_id = p_matcher_id),
  rival AS (
    SELECT h.kw_id, array_agg(DISTINCT h.value_label ORDER BY h.value_label) AS labels
      FROM dim_hits h JOIN mine ON mine.kw_id = h.kw_id
     WHERE h.matcher_id <> p_matcher_id
     GROUP BY h.kw_id
  ),
  -- What actually holds this dimension on the keyword right now.
  holder AS (
    SELECT kf.keyword_id, cv.name AS value_label, kf.source, kf.pinned, kf.matcher_id
      FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id
      JOIN mine ON mine.kw_id = kf.keyword_id
     WHERE kf.deleted_at IS NULL AND cv.parent_id = v_m.dim_id
       AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
  ),
  -- Everything the keyword wears on OTHER dimensions: the overlap context that
  -- makes a row judgeable without leaving the panel.
  others AS (
    SELECT kf.keyword_id,
           jsonb_agg(jsonb_build_object('dimension', cd.name, 'value', cv.name,
                                        'source', kf.source)
                     ORDER BY cd.name) AS answers
      FROM seo.keyword_facet kf
      JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
      JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
      JOIN mine ON mine.kw_id = kf.keyword_id
     WHERE kf.deleted_at IS NULL AND cv.parent_id <> v_m.dim_id
       AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
     GROUP BY kf.keyword_id
  ),
  win AS (
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
      JOIN mine ON mine.kw_id = spd.keyword_id
     WHERE spd.site_id = p_site_id AND spd.provider = 'gsc'
       AND spd.dimension_profile = 'query'
       AND spd.date >= current_date - v_window
     GROUP BY spd.keyword_id
  ),
  total AS (SELECT count(*)::bigint AS n FROM mine)
  SELECT k.id,
         k.phrase,
         COALESCE(p.clicks, 0),
         COALESCE(p.impressions, 0),
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
         t.n
    FROM mine
    JOIN seo.keyword k ON k.id = mine.kw_id
    LEFT JOIN perf p   ON p.keyword_id = mine.kw_id
    LEFT JOIN holder h ON h.keyword_id = mine.kw_id
    LEFT JOIN rival r  ON r.kw_id = mine.kw_id
    LEFT JOIN others o ON o.keyword_id = mine.kw_id
    CROSS JOIN total t
   -- Most consequential first: the ones that earn traffic, then the ones that
   -- did not land, then the rest. A review nobody scrolls is a count again.
   ORDER BY COALESCE(p.clicks, 0) DESC, COALESCE(p.impressions, 0) DESC, k.phrase
   LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION seo.matcher_match_review(uuid, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.matcher_match_review(uuid, uuid, integer) TO authenticated;

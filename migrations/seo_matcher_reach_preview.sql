-- WHAT WOULD THIS RULE NOW CATCH — in the site's own numbers, before anyone
-- says yes.
--
-- Applied live 2026-08-24 on project brsgrqvjdzwihsvnfqkf and ledgered.
--
-- The ruling session's whole point is that CORRECTIONS REWRITE THE RULES, and a
-- person cannot approve a rule change they cannot see the size of. Nothing
-- read-only answered "how many keywords does this pattern reach": every
-- existing preview (`gsc_value_rule_preview`, `gsc_value_combo_preview`,
-- `gsc_geo_area_preview`) previews WORTH — what a band becomes — not REACH.
--
-- The predicate here is copied from nothing: it is the same expression
-- `seo.fn_evaluate_matchers` and `seo.gsc_ruling_session_matcher_probe` use, so
-- a preview can never promise what the engine would not do. Read-only.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
CREATE OR REPLACE FUNCTION seo.gsc_matcher_reach_preview(
  p_site_id  uuid,
  p_start    date,
  p_end      date,
  p_kind     text,
  p_pattern  text,
  p_value_id uuid    DEFAULT NULL,
  p_sample   integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_pattern text := lower(btrim(COALESCE(p_pattern, '')));
  v_result  jsonb;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_kind NOT IN ('exact','word','contains','starts_with','ends_with') THEN
    RAISE EXCEPTION 'gsc_bad_matcher_kind: % is not a text matcher kind', p_kind;
  END IF;
  IF v_pattern = '' THEN
    RAISE EXCEPTION 'gsc_empty_pattern: a rule with no text matches everything';
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid,
           SUM(spd.clicks)::bigint AS c,
           SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  hit AS (
    SELECT v.kid, k.normalized_phrase AS phrase, v.c, v.i,
           EXISTS (
             SELECT 1 FROM seo.keyword_facet kf
             WHERE kf.keyword_id = v.kid AND kf.category_id = p_value_id
               AND kf.deleted_at IS NULL
               AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
           ) AS already
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    WHERE (p_kind = 'contains'    AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(v_pattern) || '%')
       OR (p_kind = 'exact'       AND k.normalized_phrase = v_pattern)
       OR (p_kind = 'starts_with' AND k.normalized_phrase LIKE seo.gsc_perf_like_escape(v_pattern) || '%')
       OR (p_kind = 'ends_with'   AND k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(v_pattern))
       OR (p_kind = 'word'        AND k.normalized_phrase ~ ('\m' || v_pattern || '\M'))
  )
  SELECT jsonb_build_object(
    'kind',           p_kind,
    'pattern',        v_pattern,
    'keywords',       COALESCE((SELECT count(*)          FROM hit), 0),
    'clicks',         COALESCE((SELECT sum(c)            FROM hit), 0),
    'impressions',    COALESCE((SELECT sum(i)            FROM hit), 0),
    -- Honest split: a rule that only re-states stamps already on the corpus is
    -- not the win a bare "catches 412 keywords" implies.
    'already_valued', COALESCE((SELECT count(*) FILTER (WHERE already) FROM hit), 0),
    'newly_valued',   COALESCE((SELECT count(*) FILTER (WHERE NOT already) FROM hit), 0),
    'sample',         COALESCE((
      SELECT jsonb_agg(s ORDER BY c DESC)
      FROM (
        SELECT jsonb_build_object(
                 'keyword_id', kid, 'keyword', phrase,
                 'clicks', c, 'impressions', i, 'already_valued', already) AS s,
               c
        FROM hit ORDER BY c DESC, i DESC, kid
        LIMIT GREATEST(LEAST(p_sample, 50), 0)
      ) t), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_matcher_reach_preview(uuid, date, date, text, text, uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_matcher_reach_preview(uuid, date, date, text, text, uuid, integer) TO authenticated;

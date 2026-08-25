-- ============================================================================
-- KI-051 — ONE QUESTION, FIVE KEYWORDS.
--
-- Arman, 2026-08-25: *"imagine if we have a window panel version of this that
-- defaults to, like, five keywords, and it tries to dedupe for words that are
-- in common… a few of them that have a lot of clicks, a few that have a lot of
-- impressions."*
--
-- The ruling session asks everything about ONE keyword. This asks ONE thing
-- about five — the shape that actually gets a corpus answered, because the
-- expensive part of answering is loading the question into your head, not
-- picking the value.
--
-- WHICH QUESTION. The same order the suggested columns use: a dimension that
-- carries worth on this site comes first (answering it moves the score),
-- emptiest-answered first within that. `traffic_class` is excluded — it has its
-- own column and its own screen.
--
-- WHICH FIVE. Demand from BOTH ends, deliberately: the top unanswered keywords
-- by clicks (what earns today) and by impressions (what could). Interleaved, so
-- a site whose clicks all sit in one corner still gets taught about the rest.
-- Then deduped by word overlap — five phrasings of one question teach nothing,
-- which is the same lesson `gsc_ruling_session_queue` learned.
--
-- THE SCOPE RULE: bounded by this site's demand window, never the 196k-row
-- global corpus.
-- ============================================================================

CREATE OR REPLACE FUNCTION seo.gsc_batch_question(
  p_site_id uuid,
  p_dimension text DEFAULT NULL,
  p_size integer DEFAULT 5,
  p_exclude uuid[] DEFAULT NULL,
  p_days integer DEFAULT 90,
  p_word_overlap real DEFAULT 0.60
)
 RETURNS TABLE(
   dimension_slug text, dimension_label text, dimension_why text,
   keyword_id uuid, keyword text, clicks bigint, impressions bigint,
   picked_for text, remaining bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'seo', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_want      integer := GREATEST(LEAST(COALESCE(p_size, 5), 25), 1);
  v_dim_slug  text;
  v_dim_label text;
  v_dim_why   text;
  v_dim_id    uuid;
  v_remaining bigint := 0;
  v_ids       uuid[] := '{}';
  v_phrases   text[] := '{}';
  v_kw        text[] := '{}';
  v_clicks    bigint[] := '{}';
  v_imps      bigint[] := '{}';
  v_why       text[] := '{}';
  r           record;
  v_i         integer;
  v_overlap   real;
  v_alike     boolean;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  -- 1. THE QUESTION. A caller may name one (the person changed the question in
  --    the panel); otherwise take the top suggestion for this site.
  IF p_dimension IS NOT NULL THEN
    SELECT s.slug, s.label, s.why INTO v_dim_slug, v_dim_label, v_dim_why
    FROM seo.gsc_suggested_dimension_columns(p_site_id, 8) s
    WHERE s.slug = p_dimension;
    IF v_dim_slug IS NULL THEN
      SELECT d.slug, d.name, 'you asked for this one'
        INTO v_dim_slug, v_dim_label, v_dim_why
      FROM platform.categories d
      WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL
        AND d.deleted_at IS NULL AND d.slug = p_dimension;
    END IF;
  ELSE
    SELECT s.slug, s.label, s.why INTO v_dim_slug, v_dim_label, v_dim_why
    FROM seo.gsc_suggested_dimension_columns(p_site_id, 1) s LIMIT 1;
  END IF;

  IF v_dim_slug IS NULL THEN
    RETURN;  -- a site with no dimensions at all has nothing to ask
  END IF;

  SELECT d.id INTO v_dim_id
  FROM platform.categories d
  WHERE d.dimension = 'seo_facet' AND d.parent_id IS NULL
    AND d.deleted_at IS NULL AND d.slug = v_dim_slug;

  -- 2. THE FIVE. Unanswered for THIS dimension, taken from both ends of demand.
  FOR r IN
    WITH winner AS (
      SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
      FROM seo.search_performance_daily spd
      WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
        AND spd.dimension_profile = 'query'
        AND spd.date >= current_date - GREATEST(COALESCE(p_days, 90), 1)
      ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
    ),
    vol AS (
      SELECT spd.keyword_id AS kid,
             SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
      FROM seo.search_performance_daily spd
      JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
      WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
        AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
      GROUP BY spd.keyword_id
    ),
    unanswered AS (
      SELECT v.kid, k.normalized_phrase AS phrase, v.c, v.i
      FROM vol v
      JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM seo.keyword_facet kf
        JOIN platform.categories val ON val.id = kf.category_id AND val.deleted_at IS NULL
        WHERE kf.keyword_id = v.kid AND kf.deleted_at IS NULL
          AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
          AND val.parent_id = v_dim_id)
        AND (p_exclude IS NULL OR NOT (v.kid = ANY(p_exclude)))
        AND (v.c > 0 OR v.i > 0)
    ),
    counted AS (SELECT count(*)::bigint AS n FROM unanswered),
    by_clicks AS (
      SELECT u.*, 'clicks'::text AS picked, row_number() OVER (ORDER BY u.c DESC, u.i DESC, u.kid) AS rk
      FROM unanswered u WHERE u.c > 0
    ),
    by_imps AS (
      SELECT u.*, 'impressions'::text AS picked, row_number() OVER (ORDER BY u.i DESC, u.c DESC, u.kid) AS rk
      FROM unanswered u
      WHERE NOT EXISTS (SELECT 1 FROM by_clicks bc WHERE bc.kid = u.kid AND bc.rk <= v_want * 4)
    )
    -- Interleaved: clicks, impressions, clicks, impressions… so neither end of
    -- demand can fill the panel on its own.
    SELECT x.kid, x.phrase, x.c, x.i, x.picked, ct.n
    FROM (
      SELECT bc.kid, bc.phrase, bc.c, bc.i, bc.picked, bc.rk, 0 AS side FROM by_clicks bc
      UNION ALL
      SELECT bi.kid, bi.phrase, bi.c, bi.i, bi.picked, bi.rk, 1 AS side FROM by_imps bi
    ) x CROSS JOIN counted ct
    ORDER BY x.rk, x.side
    LIMIT v_want * 8
  LOOP
    v_remaining := r.n;
    EXIT WHEN COALESCE(array_length(v_ids, 1), 0) >= v_want;
    CONTINUE WHEN r.kid = ANY(COALESCE(v_ids, '{}'::uuid[]));

    v_alike := false;
    FOR v_i IN 1 .. COALESCE(array_length(v_phrases, 1), 0) LOOP
      SELECT COALESCE(
               (SELECT count(*) FROM (
                  SELECT unnest(string_to_array(r.phrase, ' '))
                  INTERSECT
                  SELECT unnest(string_to_array(v_phrases[v_i], ' '))) y)::real
               / NULLIF(GREATEST(
                   array_length(string_to_array(r.phrase, ' '), 1),
                   array_length(string_to_array(v_phrases[v_i], ' '), 1)), 0)::real,
             0)
      INTO v_overlap;
      IF v_overlap >= p_word_overlap THEN
        v_alike := true; EXIT;
      END IF;
    END LOOP;
    CONTINUE WHEN v_alike;

    v_ids     := v_ids     || r.kid;
    v_phrases := v_phrases || r.phrase;
    v_kw      := v_kw      || r.phrase;
    v_clicks  := v_clicks  || r.c;
    v_imps    := v_imps    || r.i;
    v_why     := v_why     || r.picked;
  END LOOP;

  RETURN QUERY
  SELECT v_dim_slug, v_dim_label, v_dim_why,
         v_ids[i], v_kw[i], v_clicks[i], v_imps[i], v_why[i], v_remaining
  FROM generate_subscripts(v_ids, 1) AS i
  ORDER BY i;
END;
$function$;

GRANT EXECUTE ON FUNCTION seo.gsc_batch_question(uuid, text, integer, uuid[], integer, real)
  TO authenticated, service_role;

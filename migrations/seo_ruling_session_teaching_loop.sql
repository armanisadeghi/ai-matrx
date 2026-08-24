-- THE RULING SESSION — server side of the teaching loop.
--
-- Applied live 2026-08-24 on project brsgrqvjdzwihsvnfqkf and ledgered in
-- public._schema_migrations. Idempotent (CREATE OR REPLACE + ON CONFLICT).
--
-- Two READ-ONLY functions plus three knobs. Neither function writes anything:
-- the session's writes are the EXISTING human paths (`gsc_set_keyword_stamps`,
-- `gsc_set_keyword_topic`, `gsc_set_keyword_class`) and its rule changes are
-- EXISTING C9 proposals (`keyword_meaning_suggest`). A session-only writer
-- would be a second set of rules about what a person is allowed to say.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md
--      § THE RULING SESSION

-- ── 1. THE QUEUE — real demand AND diversity, chosen server-side in one read ──
--
-- Asking a person the same question ten times is how a session teaches nothing.
-- Candidates are ranked by demand (clicks, then impressions) and walked
-- greedily: one is kept only when it is unlike everything already kept,
-- measured BOTH by trigram similarity (pg_trgm) and by word overlap — either
-- test alone lets a near-duplicate through ("hard drive shredding" vs "hard
-- drive shredding near me" survives trigrams; an unrelated re-ordering
-- survives word overlap).
CREATE OR REPLACE FUNCTION seo.gsc_ruling_session_queue(
  p_site_id      uuid,
  p_start        date,
  p_end          date,
  p_limit        integer DEFAULT 10,
  p_exclude      uuid[]  DEFAULT NULL,
  p_similarity   real    DEFAULT 0.45,
  p_word_overlap real    DEFAULT 0.60
)
RETURNS TABLE(
  keyword_id       uuid,
  keyword          text,
  clicks           bigint,
  impressions      bigint,
  -- The diversity half of "why this one". The client prepends the demand
  -- numbers, so number formatting lives in exactly one place.
  why_distinct     text,
  closest_kept     text,
  unruled_total    bigint,
  considered       integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'public', 'pg_temp'
AS $function$
DECLARE
  v_want        integer := GREATEST(LEAST(p_limit, 50), 1);
  v_pool        integer := GREATEST(LEAST(p_limit, 50), 1) * 40;
  v_total       bigint  := 0;
  v_considered  integer := 0;
  v_ids         uuid[]  := '{}';
  v_phrases     text[]  := '{}';
  v_clicks      bigint[] := '{}';
  v_imps        bigint[] := '{}';
  v_why         text[]  := '{}';
  v_near        text[]  := '{}';
  r             record;
  v_i           integer;
  v_sim         real;
  v_overlap     real;
  v_worst_sim   real;
  v_worst_label text;
  v_too_alike   boolean;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  FOR r IN
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
    -- UNRULED = no human meaning of any kind reaches it. A keyword a matcher
    -- happened to stamp is still worth asking about; one the person already
    -- ruled is not.
    unruled AS (
      SELECT v.kid, k2.normalized_phrase AS phrase, v.c, v.i
      FROM vol v
      JOIN seo.keyword k2 ON k2.id = v.kid AND k2.deleted_at IS NULL
      WHERE NOT EXISTS (
          SELECT 1 FROM seo.keyword_facet kf
          WHERE kf.keyword_id = v.kid AND kf.deleted_at IS NULL
            AND (kf.site_id = p_site_id OR kf.site_id IS NULL)
            AND (kf.source = 'human' OR kf.pinned))
        AND NOT EXISTS (
          SELECT 1 FROM seo.keyword_topic kt
          WHERE kt.keyword_id = v.kid AND kt.deleted_at IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM seo.site_keyword_value skv
          WHERE skv.keyword_id = v.kid AND skv.site_id = p_site_id
            AND skv.deleted_at IS NULL AND skv.value_tier IS NOT NULL)
    ),
    counted AS (SELECT count(*)::bigint AS n FROM unruled)
    SELECT u.kid, u.phrase, u.c, u.i, ct.n
    FROM unruled u CROSS JOIN counted ct
    WHERE (p_exclude IS NULL OR NOT (u.kid = ANY(p_exclude)))
    ORDER BY u.c DESC, u.i DESC, u.kid
    LIMIT v_pool
  LOOP
    v_total := r.n;
    EXIT WHEN COALESCE(array_length(v_ids, 1), 0) >= v_want;
    v_considered  := v_considered + 1;
    v_too_alike   := false;
    v_worst_sim   := 0;
    v_worst_label := NULL;

    FOR v_i IN 1 .. COALESCE(array_length(v_phrases, 1), 0) LOOP
      v_sim := similarity(r.phrase, v_phrases[v_i]);
      SELECT COALESCE(
               (SELECT count(*) FROM (
                  SELECT unnest(string_to_array(r.phrase, ' '))
                  INTERSECT
                  SELECT unnest(string_to_array(v_phrases[v_i], ' '))) x)::real
               / NULLIF(GREATEST(
                   array_length(string_to_array(r.phrase, ' '), 1),
                   array_length(string_to_array(v_phrases[v_i], ' '), 1)), 0)::real,
             0)
        INTO v_overlap;
      IF GREATEST(v_sim, v_overlap) > v_worst_sim THEN
        v_worst_sim   := GREATEST(v_sim, v_overlap);
        v_worst_label := v_phrases[v_i];
      END IF;
      IF v_sim >= p_similarity OR v_overlap >= p_word_overlap THEN
        v_too_alike := true;
        EXIT;
      END IF;
    END LOOP;

    CONTINUE WHEN v_too_alike;

    v_ids     := v_ids     || r.kid;
    v_phrases := v_phrases || r.phrase;
    v_clicks  := v_clicks  || r.c;
    v_imps    := v_imps    || r.i;
    v_why     := v_why     || (
      CASE
        WHEN v_worst_label IS NULL THEN 'your biggest unruled search'
        WHEN v_worst_sim < 0.20   THEN 'nothing like the ones you just ruled'
        ELSE 'a different question from "' || v_worst_label || '"'
      END);
    v_near    := v_near || COALESCE(v_worst_label, '');
  END LOOP;

  RETURN QUERY
  SELECT v_ids[i], v_phrases[i], v_clicks[i], v_imps[i],
         v_why[i], NULLIF(v_near[i], ''), v_total, v_considered
  FROM generate_subscripts(v_ids, 1) AS i
  ORDER BY i;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_ruling_session_queue(uuid, date, date, integer, uuid[], real, real) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_ruling_session_queue(uuid, date, date, integer, uuid[], real, real) TO authenticated;

-- ── 2. THE PROBE — what THIS SITE'S OWN RULES already know, without writing ──
--
-- The trial asks the site's own matchers FIRST and the AI only where they are
-- silent. `seo.fn_evaluate_matchers` answers the same question but by STAMPING,
-- which is the wrong verb for a proposal a human has not seen yet. Same
-- predicates, read-only, one keyword window at a time (THE SCOPE RULE).
CREATE OR REPLACE FUNCTION seo.gsc_ruling_session_matcher_probe(
  p_site_id     uuid,
  p_keyword_ids uuid[]
)
RETURNS TABLE(
  keyword_id      uuid,
  dimension_slug  text,
  dimension_label text,
  value_id        uuid,
  value_slug      text,
  value_label     text,
  matcher_id      uuid,
  matcher_kind    text,
  matcher_pattern text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'seo', 'platform', 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR cardinality(p_keyword_ids) = 0 THEN RETURN; END IF;
  IF cardinality(p_keyword_ids) > 2000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: ask about the rows you are showing, not the whole site';
  END IF;

  RETURN QUERY
  WITH m AS (
    SELECT dm.id AS matcher_id, dm.value_id, dm.kind, dm.pattern,
           dm.place_id, dm.fact_value_id,
           cd.slug AS dim_slug, cd.name AS dim_label,
           cv.name AS val_label,
           -- values are slugged `dimension:value`; the RPCs take the short half
           CASE WHEN cv.slug LIKE cd.slug || ':%'
                THEN substring(cv.slug FROM length(cd.slug) + 2)
                ELSE cv.slug END AS val_slug
    FROM seo.dimension_value_matcher dm
    JOIN platform.categories cv ON cv.id = dm.value_id AND cv.deleted_at IS NULL
    JOIN platform.categories cd ON cd.id = cv.parent_id AND cd.deleted_at IS NULL
    WHERE dm.site_id = p_site_id AND dm.deleted_at IS NULL AND dm.enabled
      AND dm.kind NOT IN ('condition', 'brand_identity')
  ),
  kw AS (
    SELECT k.id, k.normalized_phrase
    FROM seo.keyword k
    WHERE k.id = ANY(p_keyword_ids) AND k.deleted_at IS NULL
  ),
  hits AS (
    SELECT kw.id AS kid, m.*
    FROM kw JOIN m ON m.kind IN ('exact','word','contains','starts_with','ends_with') AND (
         (m.kind = 'contains'    AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'exact'       AND kw.normalized_phrase = m.pattern)
      OR (m.kind = 'starts_with' AND kw.normalized_phrase LIKE seo.gsc_perf_like_escape(m.pattern) || '%')
      OR (m.kind = 'ends_with'   AND kw.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(m.pattern))
      OR (m.kind = 'word'        AND kw.normalized_phrase ~ ('\m' || m.pattern || '\M')))
    UNION ALL
    SELECT kp.keyword_id, m.*
    FROM m JOIN seo.keyword_place kp ON kp.place_id = m.place_id AND kp.deleted_at IS NULL
    WHERE m.kind = 'place' AND kp.keyword_id = ANY(p_keyword_ids)
    UNION ALL
    SELECT kf.keyword_id, m.*
    FROM m JOIN seo.keyword_facet kf ON kf.category_id = m.fact_value_id AND kf.deleted_at IS NULL
                                     AND (kf.site_id IS NULL OR kf.site_id = p_site_id)
    WHERE m.kind = 'fact' AND kf.keyword_id = ANY(p_keyword_ids)
  )
  -- One answer per keyword per dimension, with the SAME tie-break the writing
  -- engine uses, so the probe can never show what the engine would not do.
  SELECT DISTINCT ON (h.kid, h.dim_slug)
         h.kid, h.dim_slug, h.dim_label, h.value_id, h.val_slug, h.val_label,
         h.matcher_id, h.kind, h.pattern
  FROM hits h
  ORDER BY h.kid, h.dim_slug, h.matcher_id;
END;
$function$;

REVOKE ALL ON FUNCTION seo.gsc_ruling_session_matcher_probe(uuid, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_ruling_session_matcher_probe(uuid, uuid[]) TO authenticated;

-- ── 3. THE KNOBS — limits are knobs, and agents set them ──
INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due)
VALUES
  ('seo_ruling_session', 'rulings_before_trial', '5'::jsonb, '5'::jsonb, 'number', 'rulings', 1, 50,
   'Rulings before the system offers to try',
   'How many keywords a person must rule in a session before "Let the system try the next N" unlocks. Below this the system has too few examples of the person''s reasoning to imitate anything.',
   'agent',
   'Arman, 2026-08-24: "maybe you answer five of these or ten of these, and then you click a button where the AI attempts to do the same thing with twenty of them." Five is the lower end of what he named, chosen so the loop is reachable in a first sitting; raise it if trial accuracy at five proves poor.',
   (now() + interval '90 days')::date),
  ('seo_ruling_session', 'trial_batch_size', '20'::jsonb, '20'::jsonb, 'number', 'keywords', 5, 100,
   'Keywords in one trial batch',
   'How many keywords the system proposes at once in the trial, for the person to correct.',
   'agent',
   'Arman named twenty explicitly. It is also about the largest grid a person can scan and correct without scrolling losing them.',
   (now() + interval '90 days')::date),
  ('seo_ruling_session', 'queue_size', '10'::jsonb, '10'::jsonb, 'number', 'keywords', 3, 50,
   'Keywords fetched per ruling batch',
   'How many diverse, high-demand keywords the session holds at a time before asking the server for more.',
   'agent',
   'Ten covers a full sitting at the five-ruling unlock with room to skip, while keeping the diversity walk cheap (the server scans forty candidates per slot).',
   (now() + interval '90 days')::date)
ON CONFLICT (feature, key) DO NOTHING;

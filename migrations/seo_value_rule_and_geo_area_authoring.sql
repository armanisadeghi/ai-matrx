-- ============================================================================
-- VALUE RULE + GEO AREA AUTHORING  — the preview half, and the safety wall.
--
-- THE DEFECT THIS CLOSES.  The Keyword Value System's most important mechanic
-- is per-business qualifier polarity — Arman: "in electronics recycling / ITAD
-- I can tell you the word free MASSIVELY reduces the value of a keyword".  That
-- lives in seo.keyword_class_rule (value_multiplier) and seo.site_geo_area.
-- Both were authored ONLY by seed migrations and starter-pack adoption: every
-- workbench variant rendered them read-only.  The UI half of the fix ships in
-- features/marketing/seo/value-system/rules/.  This file ships the two things
-- that MUST be server-side:
--
--   1. LIVE MATCH PREVIEW before saving.  Arman's law — "logical things that
--      are wrong are the worst types of things" — makes a blindly-saved rule
--      the worst possible artifact.  So the authoring UI asks the server "what
--      does this rule DO?" and gets back: how many of this site's GSC keywords
--      it matches, what that does to their bands, and ten real examples.
--      Banded SERVER-side: value-system.md law 3 — a band is NEVER re-derived
--      on the client.
--
--      HOW IT STAYS EXACT WITHOUT A SECOND RESOLVER.  These functions do not
--      re-implement seo.keyword_value_map.  They call it, and then do
--      arithmetic over the `reasons` chain it publishes — base weight, each
--      fired rule's multiplier, the geo multiplier — swapping in the proposal
--      and swapping out the row being edited.  Banding then uses the SAME band
--      CTE the resolver uses.  There is still ONE resolver; this is its output
--      re-arithmetic'd, which is exactly what an explainable reason chain is
--      for.
--
--   2. THE REGEX WALL.  seo.keyword_value_map matches `word` patterns and geo
--      tokens by building a regex: `normalized_phrase ~ ('\m' || lower(tok) ||
--      '\M')`.  Until now nothing could type into those columns except us.  The
--      moment a human can, one '(' in a city name raises 42601 inside the
--      resolver and EVERY value read for that site dies — the workbench would
--      show skeletons forever, the exact failure shape THE SCOPE RULE was
--      written about.  Two triggers now refuse an unsafe token at write time
--      with a sentence a person can act on.  Verified live before applying: 0
--      of 76 existing patterns and 0 existing geo tokens are affected.
--
-- SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
-- Additive only: two new functions, one helper, two BEFORE triggers.  No DDL
-- on any table, no drops, no renames.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE REGEX WALL
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.assert_safe_match_token(p_token text, p_what text)
RETURNS void
LANGUAGE plpgsql IMMUTABLE
SET search_path = seo, pg_temp
AS $fn$
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RAISE EXCEPTION 'seo_rule_empty_token: a % cannot be blank.', p_what;
  END IF;
  -- The resolver interpolates this straight into a regex. Letters (incl.
  -- accented), digits, space, and the punctuation that really appears in
  -- brand names and place names only.
  IF p_token ~ '[^[:alnum:][:space:]''\-\./&_]' THEN
    RAISE EXCEPTION
      'seo_rule_unsafe_token: “%” contains a character this % cannot use (%). Letters, numbers, spaces and '' - . / & _ are allowed — these become a whole-word search, so punctuation like ( ) [ ] * + ? | \ would break every value calculation for this site.',
      p_token, p_what,
      (SELECT string_agg(DISTINCT c, ' ')
         FROM regexp_split_to_table(p_token, '') c
        WHERE c ~ '[^[:alnum:][:space:]''\-\./&_]');
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION seo.keyword_class_rule_assert_pattern()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = seo, pg_temp
AS $fn$
BEGIN
  IF NEW.pattern IS NOT NULL THEN
    PERFORM seo.assert_safe_match_token(NEW.pattern, 'rule pattern');
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS keyword_class_rule_assert_pattern ON seo.keyword_class_rule;
CREATE TRIGGER keyword_class_rule_assert_pattern
  BEFORE INSERT OR UPDATE OF pattern ON seo.keyword_class_rule
  FOR EACH ROW EXECUTE FUNCTION seo.keyword_class_rule_assert_pattern();

CREATE OR REPLACE FUNCTION seo.site_geo_area_assert_tokens()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = seo, pg_temp
AS $fn$
DECLARE tok text;
BEGIN
  IF jsonb_typeof(NEW.match_tokens) <> 'array' THEN
    RAISE EXCEPTION 'seo_geo_bad_tokens: the places this area matches must be a list of words.';
  END IF;
  FOR tok IN SELECT jsonb_array_elements_text(NEW.match_tokens) LOOP
    PERFORM seo.assert_safe_match_token(tok, 'place name');
  END LOOP;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS site_geo_area_assert_tokens ON seo.site_geo_area;
CREATE TRIGGER site_geo_area_assert_tokens
  BEFORE INSERT OR UPDATE OF match_tokens ON seo.site_geo_area
  FOR EACH ROW EXECUTE FUNCTION seo.site_geo_area_assert_tokens();

-- ---------------------------------------------------------------------------
-- 2. THE SHARED PREVIEW ENGINE
--
--    Both previews answer the same question in the same shape, so they share
--    one body: given the site's GSC-window keywords with their CURRENT
--    resolution, and a per-keyword proposed (score, matched) pair, band the
--    proposal server-side and summarise the movement.
--
--    p_rows carries ONLY the keywords the proposal touches (matched, or the
--    row being edited fired on them before): kw_id, keyword, clicks,
--    impressions, band, source, score, matched, next_raw.
--      next_raw NULL  -> the keyword stays exactly where it is
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_value_preview_summarize(
  p_site_id         uuid,
  p_window_keywords bigint,
  p_rows            jsonb,   -- ONLY the keywords the proposal touches
  p_sample          integer
)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = seo, platform, pg_temp
AS $fn$
WITH bands AS (
  SELECT sv.value, (sv.config->>'min_score')::numeric AS min_score
  FROM seo.site_vocabulary sv
  WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'value_band' AND sv.active
    AND sv.deleted_at IS NULL AND sv.config ? 'min_score'
  UNION ALL
  SELECT c.slug, (c.metadata->>'min_score')::numeric
  FROM platform.categories c
  WHERE c.dimension = 'seo_value_band' AND c.deleted_at IS NULL AND c.metadata ? 'min_score'
    AND NOT EXISTS (
      SELECT 1 FROM seo.site_vocabulary sv2
      WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'value_band' AND sv2.active
        AND sv2.deleted_at IS NULL AND sv2.config ? 'min_score')
),
r AS (
  SELECT (e->>'kw_id')::uuid AS kw_id, e->>'keyword' AS keyword,
         (e->>'clicks')::bigint AS clicks, (e->>'impressions')::bigint AS impressions,
         e->>'band' AS band, e->>'source' AS source,
         NULLIF(e->>'score','')::numeric AS score,
         COALESCE((e->>'matched')::boolean, false) AS matched,
         NULLIF(e->>'next_raw','')::numeric AS next_raw
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) e
),
joined AS (
  SELECT r.*,
    CASE
      WHEN r.next_raw IS NULL THEN r.band
      WHEN round(r.next_raw, 1) = 0 THEN 'negative'
      ELSE COALESCE(
        (SELECT b.value FROM bands b WHERE b.min_score <= round(r.next_raw, 1)
          ORDER BY b.min_score DESC LIMIT 1),
        (SELECT b.value FROM bands b ORDER BY b.min_score ASC LIMIT 1),
        r.band)
    END AS next_band
  FROM r
)
SELECT jsonb_build_object(
  'window_keywords', COALESCE(p_window_keywords, 0),
  'matched_keywords', (SELECT count(*) FROM joined WHERE matched),
  'matched_clicks', (SELECT COALESCE(sum(clicks),0) FROM joined WHERE matched),
  'matched_impressions', (SELECT COALESCE(sum(impressions),0) FROM joined WHERE matched),
  'moved_keywords', (SELECT count(*) FROM joined WHERE next_band IS DISTINCT FROM band),
  'protected_keywords', (SELECT count(*) FROM joined WHERE matched AND source = 'override'),
  'movements', COALESCE((
    SELECT jsonb_agg(x.m ORDER BY x.n DESC) FROM (
      SELECT count(*) AS n, jsonb_build_object(
        'from_band', band, 'to_band', next_band,
        'keywords', count(*), 'clicks', COALESCE(sum(clicks),0),
        'impressions', COALESCE(sum(impressions),0)) AS m
      FROM joined WHERE next_band IS DISTINCT FROM band
      GROUP BY band, next_band) x), '[]'::jsonb),
  'samples', COALESCE((
    SELECT jsonb_agg(y.s) FROM (
      SELECT jsonb_build_object(
        'keyword_id', kw_id, 'keyword', keyword, 'clicks', clicks,
        'impressions', impressions, 'from_band', band, 'to_band', next_band,
        'from_score', score, 'to_score', round(next_raw, 1),
        'source', source) AS s
      FROM joined WHERE matched
      ORDER BY clicks DESC, impressions DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_sample, 10), 50))) y), '[]'::jsonb)
);
$fn$;

-- ---------------------------------------------------------------------------
-- 3. RULE PREVIEW
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_value_rule_preview(
  p_site_id           uuid,
  p_start             date,
  p_end               date,
  p_multiplier        numeric,
  p_pattern           text DEFAULT NULL,
  p_match_kind        text DEFAULT NULL,
  p_match_facet       text DEFAULT NULL,
  p_match_facet_value text DEFAULT NULL,
  p_rule_id           uuid DEFAULT NULL,
  p_sample            integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
DECLARE
  v_rows jsonb;
  v_window bigint;
  v_dim uuid;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF p_multiplier IS NULL OR p_multiplier <= 0 OR p_multiplier > 100 THEN
    RAISE EXCEPTION 'seo_rule_bad_multiplier: a multiplier must be greater than 0 and at most 100. Zero is impossible on purpose — the score is a product, so ×0 would erase every other reason instead of saying "worth far less". Use a small fraction like 0.05 for "almost worthless".';
  END IF;
  IF p_pattern IS NULL AND p_match_facet IS NULL THEN
    RAISE EXCEPTION 'seo_rule_no_matcher: a rule needs something to match — either a phrase or a fact.';
  END IF;
  IF p_pattern IS NOT NULL THEN
    PERFORM seo.assert_safe_match_token(p_pattern, 'rule pattern');
    IF p_match_kind IS NULL OR p_match_kind NOT IN ('contains','exact','starts_with','ends_with','word') THEN
      RAISE EXCEPTION 'seo_rule_bad_match_kind: choose how the phrase should match (contains, whole word, exact, starts with, ends with).';
    END IF;
  END IF;
  IF p_match_facet IS NOT NULL THEN
    SELECT c.id INTO v_dim FROM platform.categories c
     WHERE c.dimension = 'seo_facet' AND c.parent_id IS NULL
       AND c.slug = p_match_facet AND c.deleted_at IS NULL;
    IF v_dim IS NULL THEN
      RAISE EXCEPTION 'seo_rule_unknown_facet: there is no dimension named "%".', p_match_facet;
    END IF;
    IF p_match_facet_value IS NULL OR NOT EXISTS (
         SELECT 1 FROM platform.categories v
          WHERE v.parent_id = v_dim AND v.deleted_at IS NULL
            AND v.slug = p_match_facet || ':' || p_match_facet_value) THEN
      RAISE EXCEPTION 'seo_rule_unknown_facet_value: "%" is not a value of "%". Allowed: %',
        COALESCE(p_match_facet_value, '(none)'), p_match_facet,
        array_to_string(seo.facet_check_values(p_match_facet), ', ');
    END IF;
  END IF;

  -- THE SCOPE RULE: resolve only the keywords this window is about to reason
  -- over, and hand the summariser ONLY the keywords the proposal touches.
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band, 'unvalued') AS band,
           COALESCE(m.value_source, 'unvalued') AS source,
           m.value_score AS score,
           COALESCE(m.reasons, '[]'::jsonb) AS reasons
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  scoped AS (
    SELECT b.*,
      (CASE
        WHEN p_pattern IS NOT NULL THEN
             (p_match_kind = 'contains'    AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'exact'       AND b.normalized_phrase = lower(p_pattern))
          OR (p_match_kind = 'starts_with' AND b.normalized_phrase LIKE seo.gsc_perf_like_escape(lower(p_pattern)) || '%')
          OR (p_match_kind = 'ends_with'   AND b.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(p_pattern)))
          OR (p_match_kind = 'word'        AND b.normalized_phrase ~ ('\m' || lower(p_pattern) || '\M'))
        ELSE EXISTS (
          SELECT 1 FROM seo.keyword_facet kf
          JOIN platform.categories cv ON cv.id = kf.category_id AND cv.deleted_at IS NULL
          WHERE kf.keyword_id = b.kid AND kf.deleted_at IS NULL
            AND cv.parent_id = v_dim
            AND COALESCE(cv.metadata->>'value', split_part(cv.slug, ':', 2)) = p_match_facet_value)
      END) AS matched,
      -- did the rule being EDITED fire on this keyword before?
      (p_rule_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(b.reasons) r
        WHERE r->>'kind' = 'rule' AND (r->>'rule_id')::uuid = p_rule_id)) AS fired_before
    FROM base b
  ),
  parts AS (
    -- The reason chain, re-arithmetic'd: base weight × other rules × geo —
    -- the resolver's own factors, with the edited rule swapped out.
    SELECT s.*,
      COALESCE((SELECT (r->>'weight')::numeric FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' IN ('topic','default_base') LIMIT 1), 50) AS base_weight,
      COALESCE((SELECT exp(sum(ln((r->>'multiplier')::numeric)))
                  FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'rule'
                   AND (p_rule_id IS NULL OR (r->>'rule_id')::uuid <> p_rule_id)), 1) AS other_rules,
      COALESCE((SELECT (r->>'multiplier')::numeric FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'geo' LIMIT 1), 1) AS geo_mult
    FROM scoped s
    WHERE s.matched OR s.fired_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c,
           'impressions', p.i, 'band', p.band, 'source', p.source, 'score', p.score,
           'matched', p.matched,
           'next_raw', CASE
             -- An expert ruling is never moved by arithmetic, and a keyword
             -- already Negative (guard or excluded geo) stays Negative.
             WHEN p.source = 'override' OR p.band = 'negative' THEN NULL
             ELSE LEAST(100, GREATEST(0,
                    p.base_weight * p.other_rules * p.geo_mult
                    * CASE WHEN p.matched THEN p_multiplier ELSE 1 END))
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 4. GEO AREA PREVIEW
--
--    Geo is recomputed EXACTLY rather than read off the reason chain, because
--    the resolver deliberately takes the LOWEST multiplier among matching
--    areas — so editing the current winner needs the runner-up, which the
--    reason chain does not carry.  A site has a handful of areas; re-matching
--    all of them except the one being edited, plus the proposal, is cheap and
--    is the same arithmetic, never a second opinion.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_geo_area_preview(
  p_site_id  uuid,
  p_start    date,
  p_end      date,
  p_tokens   jsonb,
  p_geo_band text,
  p_area_id  uuid DEFAULT NULL,
  p_sample   integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
DECLARE
  v_rows jsonb;
  v_window bigint;
  v_mult numeric;
  tok text;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  IF jsonb_typeof(COALESCE(p_tokens, 'null'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'seo_geo_bad_tokens: the places this area matches must be a list of words.';
  END IF;
  FOR tok IN SELECT jsonb_array_elements_text(p_tokens) LOOP
    PERFORM seo.assert_safe_match_token(tok, 'place name');
  END LOOP;

  SELECT m.mult INTO v_mult FROM (
    SELECT COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
    FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active
      AND sv.deleted_at IS NULL AND sv.value = p_geo_band
    UNION ALL
    SELECT COALESCE((c.metadata->>'multiplier')::numeric, 1)
    FROM platform.categories c
    WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL AND c.slug = p_geo_band
      AND NOT EXISTS (
        SELECT 1 FROM seo.site_vocabulary sv2
        WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active
          AND sv2.deleted_at IS NULL)
  ) m LIMIT 1;
  IF v_mult IS NULL THEN
    RAISE EXCEPTION 'seo_geo_unknown_band: "%" is not one of this site''s geo bands.', p_geo_band;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  base AS (
    SELECT v.kid, k.normalized_phrase, v.c, v.i,
           COALESCE(m.value_band, 'unvalued') AS band,
           COALESCE(m.value_source, 'unvalued') AS source,
           m.value_score AS score,
           COALESCE(m.reasons, '[]'::jsonb) AS reasons
    FROM vol v
    JOIN seo.keyword k ON k.id = v.kid AND k.deleted_at IS NULL
    LEFT JOIN vm m ON m.keyword_id = v.kid
  ),
  band_mult AS (
    SELECT sv.value, COALESCE((sv.config->>'multiplier')::numeric, 1) AS mult
    FROM seo.site_vocabulary sv
    WHERE sv.site_id = p_site_id AND sv.vocab_kind = 'geo_band' AND sv.active AND sv.deleted_at IS NULL
    UNION ALL
    SELECT c.slug, COALESCE((c.metadata->>'multiplier')::numeric, 1)
    FROM platform.categories c
    WHERE c.dimension = 'seo_geo_band' AND c.deleted_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM seo.site_vocabulary sv2
        WHERE sv2.site_id = p_site_id AND sv2.vocab_kind = 'geo_band' AND sv2.active
          AND sv2.deleted_at IS NULL)
  ),
  others AS (
    SELECT g.match_tokens, COALESCE(bm.mult, 1) AS mult
    FROM seo.site_geo_area g
    LEFT JOIN band_mult bm ON bm.value = g.geo_band
    WHERE g.site_id = p_site_id AND g.deleted_at IS NULL
      AND (p_area_id IS NULL OR g.id <> p_area_id)
      AND jsonb_array_length(g.match_tokens) > 0
  ),
  scoped AS (
    SELECT b.*,
      EXISTS (SELECT 1 FROM jsonb_array_elements_text(p_tokens) t(v)
               WHERE b.normalized_phrase ~ ('\m' || lower(t.v) || '\M')) AS matched,
      (p_area_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM jsonb_array_elements(b.reasons) r WHERE r->>'kind' = 'geo')) AS geo_before
    FROM base b
  ),
  parts AS (
    SELECT s.*,
      COALESCE((SELECT (r->>'weight')::numeric FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' IN ('topic','default_base') LIMIT 1), 50) AS base_weight,
      COALESCE((SELECT exp(sum(ln((r->>'multiplier')::numeric)))
                  FROM jsonb_array_elements(s.reasons) r
                 WHERE r->>'kind' = 'rule'), 1) AS rules_mult,
      (SELECT min(o.mult) FROM others o
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(o.match_tokens) t(v)
                       WHERE s.normalized_phrase ~ ('\m' || lower(t.v) || '\M'))) AS other_mult
    FROM scoped s
    WHERE s.matched OR s.geo_before
  )
  SELECT (SELECT count(*) FROM vol),
         jsonb_agg(jsonb_build_object(
           'kw_id', p.kid, 'keyword', p.normalized_phrase, 'clicks', p.c,
           'impressions', p.i, 'band', p.band, 'source', p.source, 'score', p.score,
           'matched', p.matched,
           'next_raw', CASE
             WHEN p.source = 'override' THEN NULL
             ELSE LEAST(100, GREATEST(0,
                    p.base_weight * p.rules_mult
                    * COALESCE(
                        LEAST(p.other_mult, CASE WHEN p.matched THEN v_mult END),
                        CASE WHEN p.matched THEN v_mult END,
                        p.other_mult, 1)))
           END))
    INTO v_window, v_rows
  FROM parts p;

  RETURN seo.gsc_value_preview_summarize(p_site_id, COALESCE(v_window, 0), COALESCE(v_rows, '[]'::jsonb), p_sample);
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_value_preview_summarize(uuid, bigint, jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_preview_summarize(uuid, bigint, jsonb, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_value_rule_preview(uuid, date, date, numeric, text, text, text, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_rule_preview(uuid, date, date, numeric, text, text, text, text, uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION seo.gsc_geo_area_preview(uuid, date, date, jsonb, text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_geo_area_preview(uuid, date, date, jsonb, text, uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.assert_safe_match_token(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 5. WHAT EACH RULE AND AREA IS ACTUALLY DOING, RIGHT NOW.
--
--    The rule ledger listed 22 rules and said nothing about whether any of
--    them had ever fired.  A rule that matches nothing is indistinguishable
--    from a rule that carries the business — the same class of defect as a
--    tier rendered without its why.  (Measured on datadestruction.com the
--    moment this shipped: 19 of 22 rules fire on 2,037 keywords; ZERO of the
--    4 geo areas fire, because every one of them was adopted from a pack with
--    empty match tokens.  That is the shell the geo editor exists to fill.)
--
--    ONE call, not one per row: the resolver already records every fired rule
--    and the winning geo area in its `reasons` chain, so this reads that chain
--    back rather than re-matching anything.  Live effect is free and exact.
--    Applied 2026-08-22 via Supabase MCP as `seo_value_meaning_usage`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_value_meaning_usage(
  p_site_id uuid,
  p_start   date,
  p_end     date
)
RETURNS TABLE (
  kind text,          -- 'rule' | 'geo_area'
  ref  text,          -- rule id (uuid text) | geo area label
  band text,          -- geo band, for areas
  keywords bigint,
  clicks bigint,
  impressions bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, platform, pg_temp
AS $fn$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  vol AS (
    SELECT spd.keyword_id AS kid, SUM(spd.clicks)::bigint AS c, SUM(spd.impressions)::bigint AS i
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query' AND spd.keyword_id IS NOT NULL
    GROUP BY spd.keyword_id
  ),
  ids AS (SELECT array_agg(kid) AS a FROM vol),
  vm AS (SELECT * FROM seo.keyword_value_map(p_site_id, (SELECT a FROM ids))),
  reasons AS (
    SELECT v.c, v.i, r AS reason
    FROM vol v
    JOIN vm m ON m.keyword_id = v.kid
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(m.reasons, '[]'::jsonb)) r
  )
  SELECT 'rule'::text, reason->>'rule_id', NULL::text,
         count(*)::bigint, COALESCE(sum(c),0)::bigint, COALESCE(sum(i),0)::bigint
  FROM reasons WHERE reason->>'kind' = 'rule'
  GROUP BY reason->>'rule_id'
  UNION ALL
  SELECT 'geo_area'::text, reason->>'area', reason->>'band',
         count(*)::bigint, COALESCE(sum(c),0)::bigint, COALESCE(sum(i),0)::bigint
  FROM reasons WHERE reason->>'kind' = 'geo'
  GROUP BY reason->>'area', reason->>'band';
END;
$fn$;

REVOKE ALL ON FUNCTION seo.gsc_value_meaning_usage(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_value_meaning_usage(uuid, date, date) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

-- Search Console TRAFFIC-CLASS algorithms — the "not all traffic is created
-- equal" layer (Arman's core SEO doctrine, 2026-08-07). Raw totals lie: a
-- site can be "+25%" while money traffic quietly drops 3% under a flood of
-- educational or mismatch impressions. Every read here decomposes GSC facts
-- by TRAFFIC CLASS before comparing periods.
--
-- THE CLASS RESOLVER — seo.gsc_keyword_class_map(site_id) — is the ONE
-- mapping from a keyword to a class for a site. Precedence (user beats
-- machine, machine beats nothing):
--   1. seo.site_keyword_value (the user's/agents' PER-SITE valuation):
--      traffic_class set -> that class VERBATIM (the human's explicit
--      ruling, written by seo.gsc_set_keyword_class — the classification
--      UI's one write path; it exists because no semantic column can
--      express a human "brand" ruling, and a ruling should read as one);
--      otherwise the semantic columns derive it:
--      suppression_reason set, service_match in
--      ('not_offered','actively_avoided'), or lead_quality='negative_value'
--      -> 'mismatch' (traffic that can never serve this business — the
--      "hard drive degausser at a degaussing-service company" case);
--      content_role='money_page' -> 'money';
--      content_role='supporting_content' -> 'educational'.
--   2. BRAND MATCH (class_source='brand_match') — deterministic, zero-AI
--      token matching against the site's own identity: domain minus TLD,
--      web.site.name, the linked web.brand.name, and every entry of
--      web.brand.profile->'brand_aliases' (jsonb text array — the
--      user/agent-authored alias list: key people ("angie sadeghi" for a
--      medical practice), legal names, DBAs, former names, common
--      misspellings; corporate cruft tokens stripped from all sources).
--      Branded traffic "is not real SEO" (Arman) and is
--      pulled out even when intent_class says transactional — "all green
--      recycling near me" is still brand. Placed BELOW site_keyword_value
--      deliberately: an explicit per-site valuation is the user's rescue
--      hatch when a brand collides with a service term. Two match
--      strengths:
--        STRONG — the query literally contains the alias UNSPACED
--        ("allgreenrecycling", "datadestruction.com"): always brand.
--        WEAK — spaced/joined variants ("all green recycling",
--        "allgreen recycling") or the query's tokens covering every alias
--        token ("all green electronics recycling"). Weak matches count
--        ONLY while the alias stays distinctive: an alias whose weak form
--        matches more than 250 corpus keywords is a generic service term
--        wearing a brand name (datadestruction.com's "data destruction"
--        weak-matched 2,738 keywords vs <=41 for every real brand alias,
--        measured live 2026-08-07) and is demoted to STRONG-only —
--        otherwise the brand rung would swallow the site's entire money
--        vocabulary. The 250 threshold is corpus-derived and lives here
--        ONLY. A LEGAL-SUFFIX match also counts as STRONG: the query is
--        EXACTLY the alias tokens plus a legal entity token
--        (inc/llc/ltd/corp/corporation/incorporated), nothing else —
--        "data destruction inc" is the company even though "data
--        destruction" is generic (Arman's ruling 2026-08-07: for a brand
--        that IS the service term, only inc/.com-shaped queries are truly
--        branded); "terminal data destruction ltd" carries an extra token
--        and stays out. STRONG containment is word-boundary-anchored so
--        guardiandatadestruction.com never matches datadestruction.com.
--   3. seo.keyword.intent_class (universal, agent-classified):
--      transactional/commercial_investigation -> 'money';
--      informational -> 'educational'; navigational -> 'brand'.
--   4. 'unclassified' — a FIRST-CLASS bucket, never hidden: it is both the
--      honest answer and the work queue for the classifier agents.
-- Extend the resolver here ONLY — never fork a second class mapping (a
-- future topic-tree cascade via seo.site_topic_value slots in here).
-- Never hand-write per-site brand lists — identity derives from
-- web.site/web.brand rows so every site gets it automatically.
--
-- All functions compose THE ACCURACY CONTRACT from seo_gsc_perf_rpcs.sql
-- (winning-run dedup per (profile,date) before filters; CTR/position
-- weighting rules). GSC facts carry keyword_id at 100% (verified live), so
-- class joins are by keyword_id.

CREATE OR REPLACE FUNCTION seo.gsc_keyword_class_map(p_site_id uuid)
RETURNS TABLE (keyword_id uuid, traffic_class text, class_source text)
LANGUAGE sql STABLE
SET search_path = seo, pg_temp
AS $$
  -- Brand identity aliases, derived (never hand-listed): domain minus
  -- www./m. and TLD, site name, brand name. Each alias carries its token
  -- set, its joined (space-free) form, and its shortest token as a cheap
  -- strpos prefilter probe (the corpus scan must stay ~zero-cost — the
  -- probe cuts 151k expensive checks down to the few thousand rows that
  -- contain the probe at all). Aliases whose joined form is under 5 chars
  -- are dropped as degenerate.
  WITH brand_alias AS MATERIALIZED (
    SELECT array_to_string(nt.toks, '') AS joined,
           nt.toks,
           (SELECT t FROM unnest(nt.toks) t ORDER BY length(t), t LIMIT 1) AS probe
    FROM (
      SELECT split_part(regexp_replace(lower(s.domain), '^(www|m)\.', ''), '.', 1) AS nm
      FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL
      UNION
      SELECT lower(s.name) FROM web.site s WHERE s.id = p_site_id AND s.deleted_at IS NULL
      UNION
      SELECT lower(b.name)
      FROM web.site s JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
      WHERE s.id = p_site_id AND s.deleted_at IS NULL
      UNION
      SELECT lower(al.v)
      FROM web.site s
      JOIN web.brand b ON b.id = s.brand_id AND b.deleted_at IS NULL
      CROSS JOIN LATERAL jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(b.profile->'brand_aliases') = 'array'
             THEN b.profile->'brand_aliases' ELSE '[]'::jsonb END) AS al(v)
      WHERE s.id = p_site_id AND s.deleted_at IS NULL
    ) names
    CROSS JOIN LATERAL (
      SELECT ARRAY(
        SELECT t FROM unnest(regexp_split_to_array(regexp_replace(names.nm, '[^a-z0-9]+', ' ', 'g'), '\s+')) AS t
        WHERE t <> ''
          AND t NOT IN ('inc','llc','ltd','co','corp','corporation','company','the','a','website','site','main','page','homepage','official')
      ) AS toks
    ) nt
    WHERE length(array_to_string(nt.toks, '')) >= 5
  ),
  -- One corpus pass: every (keyword, alias) hit, tagged strong (query
  -- contains the alias literally unspaced) vs weak (spaced/joined variant
  -- or full token coverage).
  brand_hit AS MATERIALIZED (
    -- strong = the alias typed UNSPACED at a word boundary (bare substring
    -- would hand guardiandatadestruction.com to datadestruction.com), OR
    -- the exact name plus a legal entity token and NOTHING else ("data
    -- destruction inc" is the company; "terminal data destruction ltd" is
    -- somebody else's).
    SELECT kw.id AS kid, ba.joined,
           (kw.normalized_phrase ~ ('(^|[^a-z0-9])' || ba.joined || '($|[^a-z0-9])')
            OR (ba.toks <@ string_to_array(kw.normalized_phrase, ' ')
                AND string_to_array(kw.normalized_phrase, ' ')
                    && ARRAY['inc','llc','ltd','corp','corporation','incorporated']
                AND NOT EXISTS (
                  SELECT 1 FROM unnest(string_to_array(kw.normalized_phrase, ' ')) AS qt
                  WHERE qt <> '' AND NOT (qt = ANY(ba.toks))
                    AND NOT (qt = ANY(ARRAY['inc','llc','ltd','corp','corporation','incorporated']))
                ))) AS strong
    FROM seo.keyword kw
    JOIN brand_alias ba
      ON strpos(kw.normalized_phrase, ba.probe) > 0
     AND (position(ba.joined IN translate(kw.normalized_phrase, ' .,''-&/+_:;!?()[]"', '')) > 0
          OR ba.toks <@ string_to_array(kw.normalized_phrase, ' '))
    WHERE kw.deleted_at IS NULL
  ),
  -- THE GENERICITY GUARD (see header): weak matches only count while the
  -- alias stays distinctive in the corpus.
  alias_ok AS MATERIALIZED (
    SELECT bh.joined, count(*) <= 250 AS weak_ok
    FROM brand_hit bh
    GROUP BY bh.joined
  ),
  brand_kw AS MATERIALIZED (
    SELECT DISTINCT bh.kid
    FROM brand_hit bh
    JOIN alias_ok ao ON ao.joined = bh.joined
    WHERE bh.strong OR ao.weak_ok
  )
  SELECT kw.id,
         CASE
           WHEN skv.traffic_class IS NOT NULL THEN skv.traffic_class
           WHEN skv.keyword_id IS NOT NULL AND (
                  skv.suppression_reason IS NOT NULL
                  OR skv.service_match IN ('not_offered', 'actively_avoided')
                  OR skv.lead_quality = 'negative_value'
                ) THEN 'mismatch'
           WHEN skv.content_role = 'money_page' THEN 'money'
           WHEN skv.content_role = 'supporting_content' THEN 'educational'
           WHEN bk.kid IS NOT NULL THEN 'brand'
           WHEN kw.intent_class IN ('transactional', 'commercial_investigation') THEN 'money'
           WHEN kw.intent_class = 'informational' THEN 'educational'
           WHEN kw.intent_class = 'navigational' THEN 'brand'
           ELSE 'unclassified'
         END,
         CASE
           WHEN skv.traffic_class IS NOT NULL THEN 'site_value'
           WHEN skv.keyword_id IS NOT NULL AND (
                  skv.suppression_reason IS NOT NULL
                  OR skv.service_match IN ('not_offered', 'actively_avoided')
                  OR skv.lead_quality = 'negative_value'
                  OR skv.content_role IN ('money_page', 'supporting_content')
                ) THEN 'site_value'
           WHEN bk.kid IS NOT NULL THEN 'brand_match'
           WHEN kw.intent_class IS NOT NULL THEN 'intent_class'
           ELSE 'none'
         END
  FROM seo.keyword kw
  LEFT JOIN seo.site_keyword_value skv
    ON skv.keyword_id = kw.id
   AND skv.site_id = p_site_id
   AND skv.deleted_at IS NULL
  LEFT JOIN brand_kw bk ON bk.kid = kw.id
  WHERE kw.deleted_at IS NULL;
$$;

-- The headline decomposition: current vs compare clicks/impressions PER
-- CLASS, with distinct-query counts. This is the view that catches "money
-- down 3% hidden inside site up 25%".
CREATE OR REPLACE FUNCTION seo.gsc_perf_class_summary(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL,
  p_compare_end date DEFAULT NULL
) RETURNS TABLE (
  traffic_class text,
  clicks bigint,
  impressions bigint,
  queries bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  cmp_queries bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.query AS q
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
  ),
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
  )
  SELECT c.cls,
         COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint,
         COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint,
         COUNT(DISTINCT c.q) FILTER (WHERE c.d BETWEEN p_start AND p_end)::bigint,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint END,
         CASE WHEN p_compare_start IS NOT NULL
              THEN COUNT(DISTINCT c.q) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end)::bigint END
  FROM classed c
  GROUP BY c.cls
  ORDER BY 2 DESC;
END;
$$;

-- Gaining / losing ground, class-aware. dimension='query': one row per
-- query with its class. dimension='page' (query_page profile): one row per
-- page with a per-class click mix (class_mix jsonb: cls -> {clicks, cmp})
-- so "this page is up 40%" is immediately decomposable into WHAT is up.
-- p_class filters to one class's traffic; p_direction picks gainers or
-- losers by clicks delta.
CREATE OR REPLACE FUNCTION seo.gsc_perf_class_movers(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date,
  p_compare_end date,
  p_class text DEFAULT NULL,
  p_direction text DEFAULT 'loss',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  key text,
  page_id uuid,
  keyword_id uuid,
  traffic_class text,
  clicks bigint,
  impressions bigint,
  cmp_clicks bigint,
  cmp_impressions bigint,
  delta_clicks bigint,
  delta_impressions bigint,
  class_mix jsonb,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_profile text;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_dimension NOT IN ('query', 'page') THEN
    RAISE EXCEPTION 'gsc_dimension_unknown: %', p_dimension;
  END IF;
  IF p_direction NOT IN ('gain', 'loss') THEN
    RAISE EXCEPTION 'gsc_direction_unknown: %', p_direction;
  END IF;
  IF p_class IS NOT NULL AND p_class NOT IN ('money', 'educational', 'brand', 'mismatch', 'unclassified') THEN
    RAISE EXCEPTION 'gsc_class_unknown: %', p_class;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  v_profile := CASE p_dimension WHEN 'query' THEN 'query' ELSE 'query_page' END;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(p_compare_start, p_start) AND GREATEST(p_compare_end, p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.page_id AS pid,
           CASE p_dimension
             WHEN 'query' THEN spd.query
             ELSE COALESCE(spd.extras->>'page_url', spd.page_id::text)
           END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
  ),
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
    WHERE l.k IS NOT NULL
      AND (p_class IS NULL OR COALESCE(cm.traffic_class, 'unclassified') = p_class)
  ),
  by_class AS (
    SELECT c.k, c.cls,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           (array_agg(c.kid ORDER BY c.kid) FILTER (WHERE c.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(c.c) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c,
           COALESCE(SUM(c.i) FILTER (WHERE c.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i
    FROM classed c
    GROUP BY c.k, c.cls
  ),
  rolled AS (
    SELECT b.k,
           (array_agg(b.pid ORDER BY b.pid) FILTER (WHERE b.pid IS NOT NULL))[1] AS pid,
           (array_agg(b.kid ORDER BY b.kid) FILTER (WHERE b.kid IS NOT NULL))[1] AS kid,
           -- dominant class by current-period clicks (compare clicks break ties)
           (array_agg(b.cls ORDER BY b.cur_c DESC, b.cmp_c DESC, b.cls ASC))[1] AS dom_cls,
           SUM(b.cur_c)::bigint AS cur_c,
           SUM(b.cur_i)::bigint AS cur_i,
           SUM(b.cmp_c)::bigint AS cmp_c,
           SUM(b.cmp_i)::bigint AS cmp_i,
           jsonb_object_agg(
             b.cls,
             jsonb_build_object('clicks', b.cur_c, 'cmp_clicks', b.cmp_c)
           ) FILTER (WHERE b.cur_c > 0 OR b.cmp_c > 0) AS mix
    FROM by_class b
    GROUP BY b.k
  ),
  moved AS (
    SELECT r.*, (r.cur_c - r.cmp_c) AS d_c, (r.cur_i - r.cmp_i) AS d_i
    FROM rolled r
    WHERE r.cur_c > 0 OR r.cmp_c > 0 OR r.cur_i > 0 OR r.cmp_i > 0
  )
  SELECT m.k,
         m.pid,
         m.kid,
         m.dom_cls,
         m.cur_c,
         m.cur_i,
         m.cmp_c,
         m.cmp_i,
         m.d_c::bigint,
         m.d_i::bigint,
         COALESCE(m.mix, '{}'::jsonb),
         COUNT(*) OVER ()::bigint
  FROM moved m
  WHERE CASE WHEN p_direction = 'gain'
             THEN m.d_c > 0 OR (m.d_c = 0 AND m.d_i > 0)
             ELSE m.d_c < 0 OR (m.d_c = 0 AND m.d_i < 0) END
  ORDER BY
    (CASE WHEN p_direction = 'gain' THEN m.d_c END) DESC NULLS LAST,
    (CASE WHEN p_direction = 'loss' THEN m.d_c END) ASC NULLS LAST,
    ABS(m.d_i) DESC,
    m.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Traffic SHIFTS: queries whose PAGE MIX moved between the compare and
-- current periods. shift_share is the L1/2 distance between the two page
-- share distributions (0 = identical mix, 1 = completely different pages).
-- The verdict (good shift / bad shift) is deliberately NOT computed —
-- the row carries the query's class, both top pages, and the click delta;
-- judging a money->educational shift is the user's call (and later an
-- agent's), not a hardcoded rule.
CREATE OR REPLACE FUNCTION seo.gsc_perf_shifts(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_compare_start date,
  p_compare_end date,
  p_min_clicks int DEFAULT 10,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  query text,
  keyword_id uuid,
  traffic_class text,
  clicks bigint,
  cmp_clicks bigint,
  delta_clicks bigint,
  impressions bigint,
  cmp_impressions bigint,
  cur_top_url text,
  cmp_top_url text,
  top_changed boolean,
  shift_share numeric,
  pages jsonb,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_min_clicks < 1 THEN
    RAISE EXCEPTION 'gsc_min_clicks_out_of_range: %', p_min_clicks;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.date BETWEEN LEAST(p_compare_start, p_start) AND GREATEST(p_compare_end, p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid,
           COALESCE(spd.extras->>'page_url', spd.page_id::text) AS purl,
           spd.query AS q
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.query IS NOT NULL
  ),
  per_qp AS (
    SELECT l.q, l.purl,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           COALESCE(SUM(l.i) FILTER (WHERE l.d BETWEEN p_start AND p_end), 0)::bigint AS cur_i,
           COALESCE(SUM(l.c) FILTER (WHERE l.d BETWEEN p_start AND p_end), 0)::bigint AS cur_c,
           COALESCE(SUM(l.i) FILTER (WHERE l.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_i,
           COALESCE(SUM(l.c) FILTER (WHERE l.d BETWEEN p_compare_start AND p_compare_end), 0)::bigint AS cmp_c
    FROM latest l
    WHERE l.purl IS NOT NULL
    GROUP BY l.q, l.purl
  ),
  q_tot AS (
    SELECT pq.q,
           SUM(pq.cur_i)::bigint AS q_cur_i, SUM(pq.cur_c)::bigint AS q_cur_c,
           SUM(pq.cmp_i)::bigint AS q_cmp_i, SUM(pq.cmp_c)::bigint AS q_cmp_c,
           (array_agg(pq.kid ORDER BY pq.kid) FILTER (WHERE pq.kid IS NOT NULL))[1] AS kid
    FROM per_qp pq
    GROUP BY pq.q
    HAVING GREATEST(SUM(pq.cur_c), SUM(pq.cmp_c)) >= p_min_clicks
      AND SUM(pq.cur_i) > 0 AND SUM(pq.cmp_i) > 0
  ),
  shares AS (
    SELECT pq.q, pq.purl, pq.cur_c, pq.cmp_c, pq.cur_i, pq.cmp_i,
           pq.cur_i::numeric / NULLIF(qt.q_cur_i, 0) AS cur_share,
           pq.cmp_i::numeric / NULLIF(qt.q_cmp_i, 0) AS cmp_share,
           row_number() OVER (PARTITION BY pq.q ORDER BY pq.cur_i DESC, pq.purl ASC) AS cur_rn,
           row_number() OVER (PARTITION BY pq.q ORDER BY pq.cmp_i DESC, pq.purl ASC) AS cmp_rn,
           row_number() OVER (PARTITION BY pq.q ORDER BY GREATEST(pq.cur_i, pq.cmp_i) DESC, pq.purl ASC) AS any_rn
    FROM per_qp pq
    JOIN q_tot qt ON qt.q = pq.q
  ),
  agg AS (
    SELECT s.q,
           SUM(ABS(COALESCE(s.cur_share, 0) - COALESCE(s.cmp_share, 0))) / 2 AS shift,
           (array_agg(s.purl ORDER BY s.cur_rn) FILTER (WHERE s.cur_i > 0))[1] AS cur_top,
           (array_agg(s.purl ORDER BY s.cmp_rn) FILTER (WHERE s.cmp_i > 0))[1] AS cmp_top,
           jsonb_agg(
             jsonb_build_object(
               'url', s.purl,
               'clicks', s.cur_c, 'cmp_clicks', s.cmp_c,
               'share', round(COALESCE(s.cur_share, 0), 4),
               'cmp_share', round(COALESCE(s.cmp_share, 0), 4)
             ) ORDER BY GREATEST(s.cur_i, s.cmp_i) DESC
           ) FILTER (WHERE s.any_rn <= 5) AS pages_json
    FROM shares s
    GROUP BY s.q
  )
  SELECT qt.q,
         qt.kid,
         COALESCE(cm.traffic_class, 'unclassified'),
         qt.q_cur_c,
         qt.q_cmp_c,
         (qt.q_cur_c - qt.q_cmp_c)::bigint,
         qt.q_cur_i,
         qt.q_cmp_i,
         a.cur_top,
         a.cmp_top,
         (a.cur_top IS DISTINCT FROM a.cmp_top),
         round(a.shift, 4),
         COALESCE(a.pages_json, '[]'::jsonb),
         COUNT(*) OVER ()::bigint
  FROM q_tot qt
  JOIN agg a ON a.q = qt.q
  LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = qt.kid
  WHERE a.shift >= 0.15
  ORDER BY a.shift * GREATEST(qt.q_cur_c, qt.q_cmp_c) DESC, qt.q ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- SEO JUICE: pages that have been strong on EDUCATIONAL traffic for a long
-- time (months, not weeks) shown beside their — and the site's — money
-- return. A page with months of sustained educational clicks and ~zero
-- money clicks is giving content away for free: the credibility exists,
-- the funnel to a money page doesn't. Fixed internal windows anchored on
-- p_as_of: recent 90 days vs the prior 90, plus a 6-calendar-month
-- consistency count (months with >= p_month_min_clicks educational clicks).
CREATE OR REPLACE FUNCTION seo.gsc_perf_juice(
  p_site_id uuid,
  p_as_of date DEFAULT NULL,
  p_month_min_clicks int DEFAULT 10,
  p_min_months int DEFAULT 3,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  key text,
  page_id uuid,
  edu_clicks bigint,
  edu_clicks_prior bigint,
  edu_months_active int,
  money_clicks bigint,
  money_clicks_prior bigint,
  money_impressions bigint,
  other_clicks bigint,
  total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_end date := COALESCE(p_as_of, CURRENT_DATE - 2);
  v_recent_start date;
  v_prior_start date;
  v_months_start date;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_month_min_clicks < 1 OR p_min_months < 1 OR p_min_months > 6 THEN
    RAISE EXCEPTION 'gsc_juice_params_out_of_range: month_min_clicks=% min_months=%', p_month_min_clicks, p_min_months;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  v_recent_start := v_end - 89;
  v_prior_start := v_end - 179;
  v_months_start := date_trunc('month', v_end)::date - interval '5 months';

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
      AND spd.date BETWEEN LEAST(v_prior_start, v_months_start::date) AND v_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  latest AS (
    SELECT spd.date AS d, spd.clicks AS c, spd.impressions AS i,
           spd.keyword_id AS kid, spd.page_id AS pid,
           COALESCE(spd.extras->>'page_url', spd.page_id::text) AS purl
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query_page'
  ),
  classed AS (
    SELECT l.*, COALESCE(cm.traffic_class, 'unclassified') AS cls
    FROM latest l
    LEFT JOIN seo.gsc_keyword_class_map(p_site_id) cm ON cm.keyword_id = l.kid
    WHERE l.purl IS NOT NULL
  ),
  monthly_edu AS (
    SELECT c.purl, date_trunc('month', c.d) AS mo, SUM(c.c) AS mc
    FROM classed c
    WHERE c.cls = 'educational' AND c.d >= v_months_start
    GROUP BY c.purl, date_trunc('month', c.d)
  ),
  consistency AS (
    SELECT me.purl, COUNT(*)::int AS months_active
    FROM monthly_edu me
    WHERE me.mc >= p_month_min_clicks
    GROUP BY me.purl
  ),
  per_page AS (
    SELECT c.purl,
           (array_agg(c.pid ORDER BY c.pid) FILTER (WHERE c.pid IS NOT NULL))[1] AS pid,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'educational' AND c.d >= v_recent_start), 0)::bigint AS edu_cur,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'educational' AND c.d BETWEEN v_prior_start AND v_recent_start - 1), 0)::bigint AS edu_prior,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'money' AND c.d >= v_recent_start), 0)::bigint AS money_cur,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls = 'money' AND c.d BETWEEN v_prior_start AND v_recent_start - 1), 0)::bigint AS money_prior,
           COALESCE(SUM(c.i) FILTER (WHERE c.cls = 'money' AND c.d >= v_recent_start), 0)::bigint AS money_imps,
           COALESCE(SUM(c.c) FILTER (WHERE c.cls NOT IN ('educational', 'money') AND c.d >= v_recent_start), 0)::bigint AS other_cur
    FROM classed c
    GROUP BY c.purl
  )
  SELECT pp.purl,
         pp.pid,
         pp.edu_cur,
         pp.edu_prior,
         COALESCE(cy.months_active, 0),
         pp.money_cur,
         pp.money_prior,
         pp.money_imps,
         pp.other_cur,
         COUNT(*) OVER ()::bigint
  FROM per_page pp
  LEFT JOIN consistency cy ON cy.purl = pp.purl
  WHERE COALESCE(cy.months_active, 0) >= p_min_months
    AND pp.edu_cur > 0
  ORDER BY pp.edu_cur DESC, pp.purl ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_keyword_class_map(uuid) TO authenticated;
REVOKE ALL ON FUNCTION seo.gsc_perf_class_summary(uuid, date, date, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seo.gsc_perf_class_movers(uuid, text, date, date, date, date, text, text, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seo.gsc_perf_shifts(uuid, date, date, date, date, int, int, int) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION seo.gsc_perf_juice(uuid, date, int, int, int, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_class_summary(uuid, date, date, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_class_movers(uuid, text, date, date, date, date, text, text, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_shifts(uuid, date, date, date, date, int, int, int) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_juice(uuid, date, int, int, int, int) TO authenticated, service_role;

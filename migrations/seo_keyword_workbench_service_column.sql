-- THE SERVICE COLUMN — the keyword workbench learns what a keyword MAPS TO.
--
-- Arman, 2026-08-24: "What I've lost is my ability to set the service or
-- product or main thing that this relates to. That's gone." And: "when I look
-- at all green electronics recycling, the first thing I wanna know is what
-- service they map to… I wanna know what maps to e-waste recycling, what maps
-- to ITAD, and what maps to data destruction."
--
-- The topic tree is the ONE declared hierarchical exception in the stamp model
-- (P19), and `seo.keyword_topic` is its stamp table. Everything below serves
-- reading, writing, filtering and SORTING that one stamp from the workbench
-- table — the same four gestures every other dimension already had.
--
--  1. `keyword_topic.notes` — P24 for the hierarchical stamp. The reason a
--     person places a keyword under a service is the training material an AI
--     later learns the pattern from, and it had nowhere to live.
--  2. `seo.gsc_keyword_topics_for` — the SERVICE column's data, for the page
--     of keywords on screen (THE SCOPE RULE, ≤2,000 ids). Name, root, full
--     lineage, who placed it, and which ancestor its worth is inherited from.
--  3. `seo.gsc_topic_keyword_set` — every keyword placed anywhere in a
--     topic's subtree. A service filter means the service AND everything
--     under it; a person filtering "ITAD" is not asking for the root node's
--     three direct keywords.
--  4. `seo.gsc_set_keyword_topic` gains `p_notes` — ONE write path for a
--     placement, single or bulk, with the reason on the stamp. The 3-argument
--     form is dropped, not left beside it: two overloads is an ambiguous
--     PostgREST call and a second set of rules.
--  5. `gsc_perf_breakdown` + `gsc_breakdown_keyword_ids` learn the `topic`
--     filter key (a topic uuid, or the literal `none` for "not placed yet")
--     and `gsc_perf_breakdown` learns `p_sort = 'topic'`. A paged table is
--     NEVER filtered or sorted in the browser — that is the lie this whole
--     surface exists to stop.
--
-- Idempotent. `gsc_set_keyword_topic` is dropped-and-created because its
-- signature changes; everything else is CREATE OR REPLACE.
SET search_path TO seo, public;

-- ---------------------------------------------------------------------------
-- 1. The reason rides on the placement (P24)
-- ---------------------------------------------------------------------------
ALTER TABLE seo.keyword_topic ADD COLUMN IF NOT EXISTS notes text;

COMMENT ON COLUMN seo.keyword_topic.notes IS
  'P24 — why this keyword belongs under this topic, in the expert''s own words, captured at the moment of placement.';

-- ---------------------------------------------------------------------------
-- 2. The SERVICE column's data
-- ---------------------------------------------------------------------------
-- One row per keyword that HAS a primary topic. Unplaced keywords are simply
-- absent — the UI says "Not placed yet", which is a sentence and not a blank.
CREATE OR REPLACE FUNCTION seo.gsc_keyword_topics_for(
  p_site_id uuid,
  p_keyword_ids uuid[]
)
RETURNS TABLE(
  keyword_id uuid,
  topic_id uuid,
  topic_name text,
  node_type text,
  root_id uuid,
  root_name text,
  root_type text,
  lineage text,
  assigned_by text,
  confidence smallint,
  notes text,
  has_own_worth boolean,
  worth_from_id uuid,
  worth_from_name text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RETURN;
  END IF;
  -- THE SCOPE RULE. Ask for the rows you are rendering, never the site.
  IF array_length(p_keyword_ids, 1) > 2000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 2,000 keywords per read — ask for the page you are showing.';
  END IF;

  RETURN QUERY
  WITH RECURSIVE placed AS (
    SELECT kt.keyword_id AS kid, kt.topic_id AS tid,
           kt.assigned_by AS aby, kt.confidence AS conf, kt.notes AS note
    FROM seo.keyword_topic kt
    WHERE kt.keyword_id = ANY (p_keyword_ids)
      AND kt.is_primary
      AND kt.deleted_at IS NULL
  ),
  chain AS (
    SELECT DISTINCT t.id AS start_id, t.id AS node_id, t.name AS node_name,
           t.node_type AS node_kind, t.parent_id AS parent_id, 0 AS depth
    FROM seo.topic t
    WHERE t.deleted_at IS NULL
      AND t.id IN (SELECT p.tid FROM placed p)
    UNION ALL
    SELECT c.start_id, t.id, t.name, t.node_type, t.parent_id, c.depth + 1
    FROM chain c
    JOIN seo.topic t ON t.id = c.parent_id AND t.deleted_at IS NULL
    WHERE c.depth < 32
  ),
  -- The TOPMOST ancestor decides money vs authority (mirrors the resolver's
  -- `root_kind`, ORDER BY depth DESC).
  root AS (
    SELECT DISTINCT ON (c.start_id) c.start_id, c.node_id, c.node_name, c.node_kind
    FROM chain c
    ORDER BY c.start_id, c.depth DESC
  ),
  -- Root › … › parent, for showing where a service sits without a novel.
  path AS (
    SELECT c.start_id,
           string_agg(c.node_name, ' › ' ORDER BY c.depth DESC) AS lineage
    FROM chain c
    WHERE c.depth > 0
    GROUP BY c.start_id
  ),
  -- The NEAREST ancestor-or-self carrying this site's worth ruling (mirrors
  -- the resolver's `topic_base`, ORDER BY depth). Showing it is what keeps an
  -- inherited-worth placement from looking like an unvalued one.
  worth AS (
    SELECT DISTINCT ON (c.start_id) c.start_id, c.node_id, c.node_name, c.depth
    FROM chain c
    JOIN seo.site_topic_value stv
      ON stv.topic_id = c.node_id
     AND stv.site_id = p_site_id
     AND stv.deleted_at IS NULL
    ORDER BY c.start_id, c.depth
  )
  SELECT p.kid,
         p.tid,
         self.node_name,
         self.node_kind,
         r.node_id,
         r.node_name,
         r.node_kind,
         pa.lineage,
         p.aby,
         p.conf,
         p.note,
         COALESCE(w.depth = 0, false),
         w.node_id,
         w.node_name
  FROM placed p
  JOIN chain self ON self.start_id = p.tid AND self.depth = 0
  LEFT JOIN root r ON r.start_id = p.tid
  LEFT JOIN path pa ON pa.start_id = p.tid
  LEFT JOIN worth w ON w.start_id = p.tid;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Every keyword under a service — the service AND everything beneath it
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_topic_keyword_set(p_topic_id uuid)
RETURNS TABLE(kw_id uuid)
LANGUAGE sql
STABLE
SET search_path TO 'seo', 'pg_temp'
AS $function$
  WITH RECURSIVE sub AS (
    SELECT t.id, 0 AS depth FROM seo.topic t
    WHERE t.id = p_topic_id AND t.deleted_at IS NULL
    UNION ALL
    SELECT t.id, s.depth + 1
    FROM sub s JOIN seo.topic t ON t.parent_id = s.id AND t.deleted_at IS NULL
    WHERE s.depth < 32
  )
  SELECT DISTINCT kt.keyword_id
  FROM seo.keyword_topic kt
  JOIN sub ON sub.id = kt.topic_id
  WHERE kt.is_primary AND kt.deleted_at IS NULL;
$function$;

-- ---------------------------------------------------------------------------
-- 4. THE ONE PLACEMENT WRITE — now carrying the reason
-- ---------------------------------------------------------------------------
-- Dropped and recreated: an added DEFAULT parameter would leave TWO overloads
-- live and hand PostgREST an ambiguous call. Existing 3-argument callers
-- (the topic tree screen) keep working — the new parameter defaults.
DROP FUNCTION IF EXISTS seo.gsc_set_keyword_topic(uuid, uuid[], uuid);
DROP FUNCTION IF EXISTS seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text);
CREATE FUNCTION seo.gsc_set_keyword_topic(
  p_site_id uuid,
  p_keyword_ids uuid[],
  p_topic_id uuid DEFAULT NULL::uuid,
  p_notes text DEFAULT NULL::text
)
RETURNS TABLE(keyword_id uuid, value_band text, value_source text, value_score numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
-- The OUT parameter `keyword_id` shadows the column in ON CONFLICT without
-- this — the same pragma gsc_set_keyword_value already carries.
#variable_conflict use_column
DECLARE
  v_org uuid;
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  PERFORM seo.gsc_assert_site_editor(p_site_id);

  IF p_keyword_ids IS NULL OR array_length(p_keyword_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'gsc_no_keywords';
  END IF;
  -- The same ceiling `gsc_set_keyword_stamps` carries, said the same way.
  IF array_length(p_keyword_ids, 1) > 5000 THEN
    RAISE EXCEPTION 'gsc_too_many_keywords: up to 5,000 keywords in one go.';
  END IF;

  IF p_topic_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM seo.topic t WHERE t.id = p_topic_id AND t.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'seo_topic_not_found: no topic %', p_topic_id USING ERRCODE = 'P0002';
  END IF;

  SELECT s.organization_id INTO v_org FROM web.site s WHERE s.id = p_site_id;

  -- Demote whatever was primary; the partial unique index allows exactly one.
  UPDATE seo.keyword_topic kt
  SET is_primary = false, updated_at = now(), updated_by = (SELECT auth.uid())
  WHERE kt.keyword_id = ANY (p_keyword_ids) AND kt.is_primary
    AND (p_topic_id IS NULL OR kt.topic_id <> p_topic_id);

  IF p_topic_id IS NULL THEN
    RETURN QUERY
    SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
    FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
    RETURN;
  END IF;

  INSERT INTO seo.keyword_topic AS kt
    (organization_id, created_by, keyword_id, topic_id, is_primary, assigned_by, notes)
  SELECT v_org, (SELECT auth.uid()), kid, p_topic_id, true, 'human', v_notes
  FROM unnest(p_keyword_ids) AS kid
  ON CONFLICT (keyword_id, topic_id) DO UPDATE SET
    is_primary = true,
    deleted_at = NULL,
    assigned_by = 'human',
    -- A new reason replaces the old one; placing again WITHOUT a reason never
    -- erases the sentence someone already wrote.
    notes = COALESCE(EXCLUDED.notes, kt.notes),
    updated_at = now(),
    updated_by = (SELECT auth.uid());

  RETURN QUERY
  SELECT m.keyword_id, m.value_band, m.value_source, m.value_score
  FROM seo.keyword_value_map(p_site_id, p_keyword_ids) m;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5a. gsc_perf_breakdown — the `topic` filter key and `p_sort = 'topic'`
-- ---------------------------------------------------------------------------
-- MERGE NOTE: this is the live C14 body with the topic predicate and the topic
-- sort folded in. Read the live definition before replacing it again — this
-- function has now been replaced four times by four different phases.
CREATE OR REPLACE FUNCTION seo.gsc_perf_breakdown(
  p_site_id uuid,
  p_dimension text,
  p_start date,
  p_end date,
  p_compare_start date DEFAULT NULL::date,
  p_compare_end date DEFAULT NULL::date,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL::text,
  p_sort text DEFAULT 'clicks'::text,
  p_sort_dir text DEFAULT 'desc'::text,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(key text, page_id uuid, keyword_id uuid, clicks bigint, impressions bigint,
              ctr numeric, avg_position numeric, cmp_clicks bigint, cmp_impressions bigint,
              cmp_ctr numeric, cmp_avg_position numeric, total_count bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile(p_dimension, p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_qw text := NULLIF(btrim(p_filters->>'query_word'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_sa text := NULLIF(btrim(p_filters->>'search_appearance'), '');
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  -- THE SERVICE FILTER: a topic uuid (the topic AND its whole subtree), or the
  -- literal `none` for the keywords nobody has placed yet.
  f_tp text := NULLIF(btrim(p_filters->>'topic'), '');
  f_tp_id uuid;
  f_cmin numeric := NULLIF(p_filters->>'clicks_min','')::numeric;
  f_cmax numeric := NULLIF(p_filters->>'clicks_max','')::numeric;
  f_imin numeric := NULLIF(p_filters->>'impressions_min','')::numeric;
  f_imax numeric := NULLIF(p_filters->>'impressions_max','')::numeric;
  f_pmin numeric := NULLIF(p_filters->>'position_min','')::numeric;
  f_pmax numeric := NULLIF(p_filters->>'position_max','')::numeric;
  v_qw_re text := CASE WHEN f_qw IS NOT NULL
    THEN '\m' || regexp_replace(f_qw, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M' END;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF (p_compare_start IS NULL) <> (p_compare_end IS NULL) THEN
    RAISE EXCEPTION 'gsc_compare_bounds_mismatch: set both compare bounds or neither';
  END IF;
  IF p_sort NOT IN ('clicks', 'impressions', 'ctr', 'position', 'key', 'delta_clicks', 'topic') THEN
    RAISE EXCEPTION 'gsc_sort_unknown: %', p_sort;
  END IF;
  IF p_sort_dir NOT IN ('asc', 'desc') THEN
    RAISE EXCEPTION 'gsc_sort_dir_unknown: %', p_sort_dir;
  END IF;
  IF p_limit < 1 OR p_limit > 1000 OR p_offset < 0 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=% offset=%', p_limit, p_offset;
  END IF;
  IF f_tp IS NOT NULL AND f_tp <> 'none' THEN
    BEGIN
      f_tp_id := f_tp::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'gsc_topic_filter_invalid: the service filter takes a topic id or "none".';
    END;
  END IF;

  RETURN QUERY
  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start)
                       AND GREATEST(COALESCE(p_compare_end, p_end), p_end)
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  topic_set AS (
    SELECT s.kw_id FROM seo.gsc_topic_keyword_set(f_tp_id) s WHERE f_tp_id IS NOT NULL
  ),
  latest AS (
    SELECT spd.date AS d,
      spd.clicks AS c,
      spd.impressions AS i,
      spd.average_position AS pos,
      spd.page_id AS pid,
      spd.keyword_id AS kid,
      CASE p_dimension
        WHEN 'query' THEN spd.query
        WHEN 'page' THEN COALESCE(spd.extras->>'page_url', spd.page_id::text)
        WHEN 'country' THEN spd.country
        WHEN 'device' THEN spd.device
        ELSE spd.search_appearance
      END AS k
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN (SELECT min(w2.d) FROM winner w2)
                       AND (SELECT max(w2.d) FROM winner w2)
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (v_qw_re IS NULL OR spd.query ~* v_qw_re)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (f_sa IS NULL OR spd.search_appearance = f_sa)
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_tp IS NULL
           OR (f_tp = 'none'
               AND NOT EXISTS (SELECT 1 FROM seo.keyword_topic kt
                                WHERE kt.keyword_id = spd.keyword_id
                                  AND kt.is_primary AND kt.deleted_at IS NULL))
           OR (f_tp_id IS NOT NULL AND spd.keyword_id IN (SELECT ts.kw_id FROM topic_set ts)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL
                   AND x.date BETWEEN LEAST(COALESCE(p_compare_start, p_start), p_start) AND GREATEST(COALESCE(p_compare_end, p_end), p_end))) vm
             WHERE vm.value_band = ANY(f_lv)))
  ),
  cur AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.d BETWEEN p_start AND p_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  cmp AS (
    SELECT l.k,
           (array_agg(l.pid ORDER BY l.pid) FILTER (WHERE l.pid IS NOT NULL))[1] AS pid,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::bigint AS s_clicks,
           SUM(l.i)::bigint AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE p_compare_start IS NOT NULL AND p_compare_end IS NOT NULL
      AND l.d BETWEEN p_compare_start AND p_compare_end AND l.k IS NOT NULL
    GROUP BY l.k
  ),
  joined AS (
    SELECT COALESCE(cur.k, cmp.k) AS k,
           COALESCE(cur.pid, cmp.pid) AS pid,
           COALESCE(cur.kid, cmp.kid) AS kid,
           COALESCE(cur.s_clicks, 0) AS c_clicks,
           COALESCE(cur.s_imps, 0) AS c_imps,
           cur.s_wpos AS c_wpos,
           COALESCE(cur.s_pos_imps, 0) AS c_pos_imps,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_clicks, 0) END AS m_clicks,
           CASE WHEN p_compare_start IS NOT NULL THEN COALESCE(cmp.s_imps, 0) END AS m_imps,
           cmp.s_wpos AS m_wpos,
           COALESCE(cmp.s_pos_imps, 0) AS m_pos_imps
    FROM cur FULL OUTER JOIN cmp ON cur.k = cmp.k
  ),
  filtered AS (
    SELECT j.*,
           CASE p_sort
             WHEN 'clicks' THEN j.c_clicks::numeric
             WHEN 'impressions' THEN j.c_imps::numeric
             WHEN 'ctr' THEN CASE WHEN j.c_imps > 0 THEN j.c_clicks::numeric / j.c_imps END
             WHEN 'position' THEN CASE WHEN j.c_pos_imps > 0 THEN j.c_wpos / j.c_pos_imps END
             WHEN 'delta_clicks' THEN (j.c_clicks - COALESCE(j.m_clicks, 0))::numeric
           END AS s_val,
           -- Sorting the SERVICE column is a server sort or it is a lie: the
           -- browser only ever holds one page. Resolved only when asked for.
           CASE WHEN p_sort = 'topic' THEN (
             SELECT t.name
             FROM seo.keyword_topic kt
             JOIN seo.topic t ON t.id = kt.topic_id AND t.deleted_at IS NULL
             WHERE kt.keyword_id = j.kid AND kt.is_primary AND kt.deleted_at IS NULL
             LIMIT 1
           ) END AS s_topic
    FROM joined j
    WHERE (v_search IS NULL OR j.k ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (f_cmin IS NULL OR j.c_clicks >= f_cmin)
      AND (f_cmax IS NULL OR j.c_clicks <= f_cmax)
      AND (f_imin IS NULL OR j.c_imps >= f_imin)
      AND (f_imax IS NULL OR j.c_imps <= f_imax)
      AND (f_pmin IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps >= f_pmin))
      AND (f_pmax IS NULL OR (j.c_pos_imps > 0 AND j.c_wpos / j.c_pos_imps <= f_pmax))
  )
  SELECT f.k,
         f.pid,
         f.kid,
         f.c_clicks::bigint,
         f.c_imps::bigint,
         CASE WHEN f.c_imps > 0 THEN round(f.c_clicks::numeric / f.c_imps, 6) END,
         CASE WHEN f.c_pos_imps > 0 THEN round(f.c_wpos / f.c_pos_imps, 2) END,
         f.m_clicks::bigint,
         f.m_imps::bigint,
         CASE WHEN f.m_imps > 0 THEN round(f.m_clicks::numeric / f.m_imps, 6) END,
         CASE WHEN f.m_pos_imps > 0 THEN round(f.m_wpos / f.m_pos_imps, 2) END,
         COUNT(*) OVER ()::bigint
  FROM filtered f
  ORDER BY
    (CASE WHEN p_sort_dir = 'desc' THEN f.s_val END) DESC NULLS LAST,
    (CASE WHEN p_sort_dir = 'asc' THEN f.s_val END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'topic' AND p_sort_dir = 'desc' THEN f.s_topic END) DESC NULLS LAST,
    (CASE WHEN p_sort = 'topic' AND p_sort_dir = 'asc' THEN f.s_topic END) ASC NULLS LAST,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'desc' THEN f.k END) DESC,
    (CASE WHEN p_sort = 'key' AND p_sort_dir = 'asc' THEN f.k END) ASC,
    f.c_clicks DESC,
    f.k ASC
  LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5b. gsc_breakdown_keyword_ids — "everything matching" honours the service
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seo.gsc_breakdown_keyword_ids(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'seo', 'pg_temp'
AS $function$
DECLARE
  v_profile text := seo.gsc_perf_resolve_profile('query', p_filters);
  v_search text := NULLIF(btrim(p_search), '');
  f_qc text := NULLIF(btrim(p_filters->>'query_contains'), '');
  f_qe text := NULLIF(btrim(p_filters->>'query_eq'), '');
  f_qn text := NULLIF(btrim(p_filters->>'query_neq'), '');
  f_qw text := NULLIF(btrim(p_filters->>'query_word'), '');
  f_pc text := NULLIF(btrim(p_filters->>'page_contains'), '');
  f_pe text := NULLIF(btrim(p_filters->>'page_eq'), '');
  f_co text := NULLIF(btrim(p_filters->>'country'), '');
  f_de text := NULLIF(btrim(p_filters->>'device'), '');
  f_st jsonb := CASE WHEN jsonb_typeof(p_filters->'stamps') = 'array' AND jsonb_array_length(p_filters->'stamps') > 0 THEN p_filters->'stamps' END;
  f_lv text[] := CASE WHEN jsonb_typeof(p_filters->'levels') = 'array' AND jsonb_array_length(p_filters->'levels') > 0
                      THEN ARRAY(SELECT jsonb_array_elements_text(p_filters->'levels')) END;
  f_tp text := NULLIF(btrim(p_filters->>'topic'), '');
  f_tp_id uuid;
  f_cmin numeric := NULLIF(p_filters->>'clicks_min','')::numeric;
  f_cmax numeric := NULLIF(p_filters->>'clicks_max','')::numeric;
  f_imin numeric := NULLIF(p_filters->>'impressions_min','')::numeric;
  f_imax numeric := NULLIF(p_filters->>'impressions_max','')::numeric;
  f_pmin numeric := NULLIF(p_filters->>'position_min','')::numeric;
  f_pmax numeric := NULLIF(p_filters->>'position_max','')::numeric;
  v_qw_re text := CASE WHEN f_qw IS NOT NULL
    THEN '\m' || regexp_replace(f_qw, '([.^$*+?()\[\]{}|\\-])', '\\\1', 'g') || '\M' END;
  v_ids uuid[];
  v_matched bigint;
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);
  IF p_limit < 1 OR p_limit > 5000 THEN
    RAISE EXCEPTION 'gsc_pagination_out_of_range: limit=%', p_limit;
  END IF;
  IF f_tp IS NOT NULL AND f_tp <> 'none' THEN
    BEGIN
      f_tp_id := f_tp::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'gsc_topic_filter_invalid: the service filter takes a topic id or "none".';
    END;
  END IF;

  WITH winner AS (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  topic_set AS (
    SELECT s.kw_id FROM seo.gsc_topic_keyword_set(f_tp_id) s WHERE f_tp_id IS NOT NULL
  ),
  latest AS (
    SELECT spd.query AS k, spd.keyword_id AS kid, spd.clicks AS c, spd.impressions AS i,
           spd.average_position AS pos
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc' AND spd.site_id = p_site_id
      AND spd.dimension_profile = v_profile
      AND spd.date BETWEEN p_start AND p_end
      AND spd.keyword_id IS NOT NULL
      AND (f_qc IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(f_qc) || '%')
      AND (f_qe IS NULL OR spd.query = f_qe)
      AND (f_qn IS NULL OR spd.query IS DISTINCT FROM f_qn)
      AND (v_qw_re IS NULL OR spd.query ~* v_qw_re)
      AND (f_pc IS NULL OR spd.extras->>'page_url' ILIKE '%' || seo.gsc_perf_like_escape(f_pc) || '%')
      AND (f_pe IS NULL OR spd.extras->>'page_url' = f_pe OR spd.page_id::text = f_pe)
      AND (f_co IS NULL OR spd.country = f_co)
      AND (f_de IS NULL OR spd.device = f_de)
      AND (v_search IS NULL OR spd.query ILIKE '%' || seo.gsc_perf_like_escape(v_search) || '%')
      AND (f_st IS NULL OR spd.keyword_id IN (SELECT kw_id FROM seo.gsc_stamp_keyword_set(p_site_id, f_st)))
      AND (f_tp IS NULL
           OR (f_tp = 'none'
               AND NOT EXISTS (SELECT 1 FROM seo.keyword_topic kt
                                WHERE kt.keyword_id = spd.keyword_id
                                  AND kt.is_primary AND kt.deleted_at IS NULL))
           OR (f_tp_id IS NOT NULL AND spd.keyword_id IN (SELECT ts.kw_id FROM topic_set ts)))
      AND (f_lv IS NULL OR spd.keyword_id IN (
             SELECT vm.keyword_id FROM seo.keyword_value_map(p_site_id,
               (SELECT array_agg(DISTINCT x.keyword_id) FROM seo.search_performance_daily x
                 WHERE x.provider = 'gsc' AND x.site_id = p_site_id AND x.dimension_profile = v_profile
                   AND x.keyword_id IS NOT NULL AND x.date BETWEEN p_start AND p_end)) vm
             WHERE vm.value_band = ANY(f_lv)))
  ),
  agg AS (
    SELECT l.k,
           (array_agg(l.kid ORDER BY l.kid) FILTER (WHERE l.kid IS NOT NULL))[1] AS kid,
           SUM(l.c)::numeric AS s_clicks,
           SUM(l.i)::numeric AS s_imps,
           SUM(l.pos * l.i) FILTER (WHERE l.pos IS NOT NULL) AS s_wpos,
           COALESCE(SUM(l.i) FILTER (WHERE l.pos IS NOT NULL), 0) AS s_pos_imps
    FROM latest l
    WHERE l.k IS NOT NULL
    GROUP BY l.k
  ),
  kept AS (
    SELECT DISTINCT a.kid AS kid, a.s_clicks AS s_clicks
    FROM agg a
    WHERE a.kid IS NOT NULL
      AND (f_cmin IS NULL OR a.s_clicks >= f_cmin)
      AND (f_cmax IS NULL OR a.s_clicks <= f_cmax)
      AND (f_imin IS NULL OR a.s_imps >= f_imin)
      AND (f_imax IS NULL OR a.s_imps <= f_imax)
      AND (f_pmin IS NULL OR (a.s_pos_imps > 0 AND a.s_wpos / a.s_pos_imps >= f_pmin))
      AND (f_pmax IS NULL OR (a.s_pos_imps > 0 AND a.s_wpos / a.s_pos_imps <= f_pmax))
  )
  SELECT array_agg(k.kid ORDER BY k.s_clicks DESC, k.kid), count(*)
  INTO v_ids, v_matched
  FROM (SELECT kept.kid, kept.s_clicks FROM kept ORDER BY kept.s_clicks DESC, kept.kid LIMIT p_limit) k;

  RETURN jsonb_build_object(
    'keyword_ids', to_jsonb(COALESCE(v_ids, ARRAY[]::uuid[])),
    'returned', COALESCE(v_matched, 0),
    'capped', COALESCE(v_matched, 0) >= p_limit,
    'limit', p_limit);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Grants
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_set_keyword_topic(uuid, uuid[], uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_keyword_topics_for(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_keyword_set(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_perf_breakdown(uuid, text, date, date, date, date, jsonb, text, text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION seo.gsc_breakdown_keyword_ids(uuid, date, date, jsonb, text, integer) TO authenticated;

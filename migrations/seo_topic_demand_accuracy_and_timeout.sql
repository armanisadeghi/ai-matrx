-- Topic demand: canonical query facts, winning runs, and bounded tree stats.
--
-- Incident (2026-08-24): `seo.gsc_topic_stats` timed out twice through
-- PostgREST on All Green Recycling.  The site had 9,179,771 observation rows,
-- and the function began by DISTINCT-scanning every historical row even though
-- only 219 active primary topic links existed platform-wide.  It also mixed the
-- `query` and `query_page` profiles and summed every collection run, so the
-- expensive result was numerically wrong as well.
--
-- Contract restored here:
--   * keyword demand comes only from provider=gsc, dimension_profile=query;
--   * one winning run per (site, date), selected before aggregation;
--   * all-history topic membership starts from the tiny link set and probes the
--     partial `(site_id, keyword_id)` index;
--   * the placement ledger is reconciled to the current canonical demand set,
--     while an actively running claim is preserved until its next refresh.
--
-- Every public signature and return shape stays unchanged.

CREATE OR REPLACE FUNCTION seo.gsc_topic_stats(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE (
  topic_id uuid,
  value_band text,
  keywords bigint,
  clicks bigint,
  impressions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  linked AS MATERIALIZED (
    SELECT kt.keyword_id AS kw_id,
           kt.topic_id AS tid,
           COALESCE(w.clicks, 0) AS clicks,
           COALESCE(w.impressions, 0) AS impressions
    FROM seo.keyword_topic kt
    LEFT JOIN win w ON w.kw_id = kt.keyword_id
    WHERE kt.is_primary
      AND kt.deleted_at IS NULL
      AND EXISTS (
        SELECT 1
        FROM seo.search_performance_daily membership
        WHERE membership.provider = 'gsc'
          AND membership.site_id = p_site_id
          AND membership.dimension_profile = 'query'
          AND membership.keyword_id = kt.keyword_id
      )
  ),
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(
      p_site_id,
      (SELECT array_agg(DISTINCT l.kw_id) FROM linked l)
    ) m
  )
  SELECT l.tid,
         COALESCE(vm.band, 'unvalued'),
         count(*)::bigint,
         sum(l.clicks)::bigint,
         sum(l.impressions)::bigint
  FROM linked l
  LEFT JOIN vm ON vm.kw_id = l.kw_id
  GROUP BY 1, 2;
END;
$$;

COMMENT ON FUNCTION seo.gsc_topic_stats(uuid, date, date) IS
  'Per-topic x value-band decomposition of a site''s query keywords, by PRIMARY topic link. Demand uses one winning GSC query run per date; window drives clicks/impressions only. SECURITY DEFINER + gsc_assert_site_access.';

REVOKE ALL ON FUNCTION seo.gsc_topic_stats(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_stats(uuid, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION seo.gsc_topic_offering_split(
  p_site_id uuid,
  p_start date,
  p_end date
)
RETURNS TABLE (
  bucket text,
  root_type text,
  keywords bigint,
  clicks bigint,
  impressions bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH RECURSIVE
  winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  lineage AS (
    SELECT w.kw_id, kt.topic_id AS tid, 0 AS depth
    FROM win w
    JOIN seo.keyword_topic kt
      ON kt.keyword_id = w.kw_id AND kt.is_primary AND kt.deleted_at IS NULL
    UNION ALL
    SELECT l.kw_id, t.parent_id, l.depth + 1
    FROM lineage l
    JOIN seo.topic t ON t.id = l.tid AND t.deleted_at IS NULL
    WHERE t.parent_id IS NOT NULL AND l.depth < 12
  ),
  roots AS (
    SELECT DISTINCT ON (l.kw_id) l.kw_id, t.node_type
    FROM lineage l
    JOIN seo.topic t ON t.id = l.tid
    WHERE t.parent_id IS NULL
    ORDER BY l.kw_id, l.depth DESC
  )
  SELECT CASE
           WHEN r.node_type IS NULL THEN 'unassigned'
           WHEN r.node_type IN ('service', 'product', 'problem', 'audience', 'brand')
             THEN 'offering'
           ELSE 'authority'
         END AS bucket,
         COALESCE(r.node_type, 'none') AS root_type,
         count(*)::bigint,
         sum(w.clicks)::bigint,
         sum(w.impressions)::bigint
  FROM win w
  LEFT JOIN roots r ON r.kw_id = w.kw_id
  GROUP BY 1, 2;
END;
$$;

COMMENT ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) IS
  'Offering vs authority vs unassigned split over one winning GSC query run per date. Root type is the top ancestor of the PRIMARY topic link. SECURITY DEFINER + gsc_assert_site_access.';

REVOKE ALL ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_offering_split(uuid, date, date) TO authenticated;


CREATE OR REPLACE FUNCTION seo.gsc_topic_unassigned_keywords(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  keyword_id uuid,
  phrase text,
  clicks bigint,
  impressions bigint,
  value_band text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  unplaced AS MATERIALIZED (
    SELECT w.kw_id, k.normalized_phrase AS phrase, w.clicks, w.impressions
    FROM win w
    JOIN seo.keyword k ON k.id = w.kw_id AND k.deleted_at IS NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM seo.keyword_topic kt
      WHERE kt.keyword_id = w.kw_id AND kt.is_primary AND kt.deleted_at IS NULL
    )
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
  ),
  page AS MATERIALIZED (
    SELECT u.* FROM unplaced u
    ORDER BY u.clicks DESC, u.impressions DESC, u.phrase
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ),
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(pg.kw_id) FROM page pg)) m
  )
  SELECT p.kw_id, p.phrase, p.clicks, p.impressions,
         COALESCE(vm.band, 'unvalued'),
         (SELECT count(*) FROM unplaced)::bigint
  FROM page p
  LEFT JOIN vm ON vm.kw_id = p.kw_id
  ORDER BY p.clicks DESC, p.impressions DESC, p.phrase;
END;
$$;

COMMENT ON FUNCTION seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer) IS
  'Demand-ordered query keywords with no PRIMARY topic, using one winning GSC query run per date. SECURITY DEFINER + gsc_assert_site_access.';

REVOKE ALL ON FUNCTION seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_unassigned_keywords(uuid, date, date, text, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION seo.gsc_topic_proposed_keywords(
  p_site_id uuid,
  p_start date,
  p_end date,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  keyword_id uuid,
  phrase text,
  topic_id uuid,
  topic_name text,
  confidence smallint,
  clicks bigint,
  impressions bigint,
  value_band text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
BEGIN
  PERFORM seo.gsc_assert_site_access(p_site_id);

  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN p_start AND p_end
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  win AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  proposed AS MATERIALIZED (
    SELECT w.kw_id, k.normalized_phrase AS phrase, w.clicks, w.impressions,
           kt.topic_id AS tid, t.name AS tname, kt.confidence AS conf
    FROM win w
    JOIN seo.keyword k ON k.id = w.kw_id AND k.deleted_at IS NULL
    JOIN seo.keyword_topic kt
      ON kt.keyword_id = w.kw_id AND kt.is_primary AND kt.deleted_at IS NULL
    JOIN seo.topic t ON t.id = kt.topic_id AND t.deleted_at IS NULL
    WHERE kt.metadata #>> '{placement,confirmed}' = 'false'
      AND (p_search IS NULL OR btrim(p_search) = ''
           OR k.normalized_phrase LIKE '%' || seo.gsc_perf_like_escape(lower(btrim(p_search))) || '%')
  ),
  page AS MATERIALIZED (
    SELECT p.* FROM proposed p
    ORDER BY p.clicks DESC, p.impressions DESC, p.phrase
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
    OFFSET GREATEST(0, COALESCE(p_offset, 0))
  ),
  vm AS MATERIALIZED (
    SELECT m.keyword_id AS kw_id, m.value_band AS band
    FROM seo.keyword_value_map(p_site_id, (SELECT array_agg(pg.kw_id) FROM page pg)) m
  )
  SELECT p.kw_id, p.phrase, p.tid, p.tname, p.conf, p.clicks, p.impressions,
         COALESCE(vm.band, 'unvalued'),
         (SELECT count(*) FROM proposed)::bigint
  FROM page p
  LEFT JOIN vm ON vm.kw_id = p.kw_id
  ORDER BY p.clicks DESC, p.impressions DESC, p.phrase;
END;
$$;

COMMENT ON FUNCTION seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer) IS
  'Unconfirmed agent topic placements over one winning GSC query run per date, demand ordered and page scoped. SECURITY DEFINER + gsc_assert_site_access.';

REVOKE ALL ON FUNCTION seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION seo.gsc_topic_proposed_keywords(uuid, date, date, text, integer, integer) TO authenticated;


CREATE OR REPLACE FUNCTION seo.fn_refresh_topic_placement_queue(
  p_site_id uuid,
  p_window_days integer
)
RETURNS TABLE (
  scanned bigint,
  now_pending bigint,
  now_done bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = seo, web, iam, platform, public, pg_temp
AS $$
DECLARE
  v_as_of date := current_date;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'topicq_bad_site: p_site_id is required';
  END IF;
  IF p_window_days IS NULL OR p_window_days < 1 THEN
    RAISE EXCEPTION 'topicq_bad_window: p_window_days must be >= 1';
  END IF;

  RETURN QUERY
  WITH winner AS MATERIALIZED (
    SELECT DISTINCT ON (spd.date) spd.date AS d, spd.run_id AS rid
    FROM seo.search_performance_daily spd
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.date BETWEEN v_as_of - p_window_days AND v_as_of
    ORDER BY spd.date, spd.created_at DESC, spd.run_id DESC
  ),
  roll AS MATERIALIZED (
    SELECT spd.keyword_id AS kw_id,
           sum(spd.clicks)::bigint AS clicks,
           sum(spd.impressions)::bigint AS impressions
    FROM seo.search_performance_daily spd
    JOIN winner w ON w.d = spd.date AND w.rid = spd.run_id
    WHERE spd.provider = 'gsc'
      AND spd.site_id = p_site_id
      AND spd.dimension_profile = 'query'
      AND spd.keyword_id IS NOT NULL
    GROUP BY 1
  ),
  scored AS MATERIALIZED (
    SELECT r.kw_id,
           r.clicks,
           r.impressions,
           kt.topic_id IS NOT NULL AS placed,
           CASE WHEN kt.topic_id IS NULL THEN NULL
                WHEN kt.assigned_by = 'human' THEN 'human'
                ELSE 'agent' END AS source
    FROM roll r
    JOIN seo.keyword k ON k.id = r.kw_id AND k.deleted_at IS NULL
    LEFT JOIN LATERAL (
      SELECT kt.topic_id, kt.assigned_by
      FROM seo.keyword_topic kt
      WHERE kt.keyword_id = r.kw_id
        AND kt.is_primary
        AND kt.deleted_at IS NULL
      LIMIT 1
    ) kt ON true
  ),
  upserted AS (
    INSERT INTO seo.topic_placement_queue AS q (
      site_id, keyword_id, status, placement_source,
      priority_clicks, priority_impressions,
      demand_window_days, demand_as_of, completed_at
    )
    SELECT p_site_id,
           s.kw_id,
           CASE WHEN s.placed THEN 'done' ELSE 'pending' END,
           s.source,
           s.clicks, s.impressions,
           p_window_days, v_as_of,
           CASE WHEN s.placed THEN now() END
    FROM scored s
    ON CONFLICT (site_id, keyword_id) DO UPDATE SET
      priority_clicks      = excluded.priority_clicks,
      priority_impressions = excluded.priority_impressions,
      demand_window_days   = excluded.demand_window_days,
      demand_as_of         = excluded.demand_as_of,
      placement_source     = excluded.placement_source,
      status = CASE
                 WHEN excluded.status = 'done' THEN 'done'
                 WHEN q.status = 'done' THEN 'pending'
                 ELSE q.status
               END,
      attempts = CASE
                   WHEN q.status = 'done' AND excluded.status <> 'done' THEN 0
                   ELSE q.attempts
                 END,
      completed_at = CASE WHEN excluded.status = 'done' THEN now() ELSE NULL END,
      updated_at = now()
    RETURNING q.status
  ),
  removed AS (
    DELETE FROM seo.topic_placement_queue q
    WHERE q.site_id = p_site_id
      AND q.status <> 'running'
      AND NOT EXISTS (SELECT 1 FROM scored s WHERE s.kw_id = q.keyword_id)
    RETURNING 1
  ),
  removal_barrier AS (
    SELECT count(*) AS removed_count FROM removed
  )
  SELECT (SELECT count(*) FROM scored)::bigint,
         (SELECT count(*) FROM upserted u WHERE u.status = 'pending')::bigint,
         (SELECT count(*) FROM upserted u WHERE u.status = 'done')::bigint
  FROM removal_barrier;
END;
$$;

COMMENT ON FUNCTION seo.fn_refresh_topic_placement_queue(uuid, integer) IS
  'Reconciles the durable topic-placement ledger to canonical winning-run GSC query demand for the requested rolling window. Stale non-running derived rows are removed; active claims survive until the next refresh.';

REVOKE ALL ON FUNCTION seo.fn_refresh_topic_placement_queue(uuid, integer)
  FROM public, anon, authenticated;

NOTIFY pgrst, 'reload schema';

-- The topic-placement refresh stops spending the day's placement budget.
--
-- based-on: seo.fn_refresh_topic_placement_queue(uuid, integer) 92e4925a818767306d5835427888cbb871442e607925eb9df987cf2309a70602
--
-- Incident (2026-09-14, KI-014): the scheduled "SEO — topic placement backfill"
-- reported `ceiling_reached` every night while placing ~10 keywords. The per-site
-- ceiling (`seo.topic_placement.daily_keyword_ceiling`, placements per UTC day)
-- reads `seo.fn_topic_placement_settled_since(site, midnight)`, which counts
-- ledger rows whose `completed_at` is today. This refresh wrote
-- `completed_at = now()` onto EVERY row that was already done, on every refresh,
-- so the first pass of each night turned "placed today" into "every agent
-- placement this site has ever had". Measured: All Green (d0aff5b6…) read 8,300
-- placed today at 04:50 UTC with 0 placed that day, against an 8,000 ceiling, and
-- had claimed nothing for weeks while 3,302 claimable keywords waited.
--
-- Contract restored:
--   * `completed_at` is when the row BECAME done. A refresh that finds a row
--     still done keeps its timestamp; only a pending→done transition stamps now().
--   * The rows already corrupted get back the real placement time from
--     `seo.keyword_topic.created_at`, never later than the stamp they carry.
--
-- Guard: `pnpm check:topic-placement-ceiling` (runs this refresh inside a
-- rolled-back transaction and fails if the day's counter moves).

CREATE OR REPLACE FUNCTION seo.fn_refresh_topic_placement_queue(p_site_id uuid, p_window_days integer)
 RETURNS TABLE(scanned bigint, now_pending bigint, now_done bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'seo', 'web', 'iam', 'platform', 'public', 'pg_temp'
AS $function$
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
      -- A reconciliation is not a settlement: a row that was already done keeps
      -- the moment it became done, so a refresh never consumes the day's ceiling.
      completed_at = CASE
                       WHEN excluded.status <> 'done' THEN NULL
                       WHEN q.status = 'done' THEN coalesce(q.completed_at, now())
                       ELSE now()
                     END,
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
$function$;

-- Repair: every done row gets back the real placement time. `least` so a row the
-- ledger itself settled keeps its (earlier-or-equal) settlement stamp.
UPDATE seo.topic_placement_queue q
   SET completed_at = least(q.completed_at, kt.created_at)
  FROM seo.keyword_topic kt
 WHERE q.status = 'done'
   AND kt.keyword_id = q.keyword_id
   AND kt.is_primary
   AND kt.deleted_at IS NULL
   AND kt.created_at < q.completed_at;

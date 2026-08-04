-- GSC ingestion health, v3 — remove a cry-wolf and a string dependency.
--
-- Two defects in v2, both found by adversarial review:
--
-- 1. `missing_days` regenerated the EXACT alarm that was deleted from
--    `matrx_seo.collection_outcome` in the same change. GSC returns no row
--    for a zero-traffic day, so "distinct dates < calendar days" cannot tell
--    a data gap from a quiet Sunday. v2 moved that same measurement from
--    per-run to full-history and called it a warning — which would have
--    permanently accused every low-traffic site of having gaps and told the
--    user their "charts under-report". Deleting a cry-wolf in one file and
--    re-adding it in the next is worse than never deleting it, because the
--    second one looks reviewed.
--    `missing_days` REMAINS as a reported number (it is genuinely useful when
--    a human is already diagnosing) but it no longer PRODUCES a problem.
--    Nothing here claims a gap it cannot distinguish from silence.
--
-- 2. The nightly dispatcher was located by `title ILIKE '%search console%'`.
--    Renaming the scheduled task would have silently killed that branch —
--    the precise failure class this function exists to catch, reintroduced
--    as a string dependency. Worse, with no scoping, `ORDER BY started_at
--    DESC LIMIT 1` across a title match could surface ANOTHER tenant's
--    error_message on this site's banner. It now pins the task by the stable
--    id seeded in aidream migration 0304, which exactly one row can hold.
--
-- Everything else (dispatcher-history diagnosis, leading-failure count,
-- coalesced last_run_at, stuck-run detection, severity) is v2, unchanged.

DROP FUNCTION IF EXISTS seo.gsc_ingestion_health(uuid);

CREATE OR REPLACE FUNCTION seo.gsc_ingestion_health(p_site_id uuid)
RETURNS TABLE (
  data_first_date date,
  data_last_date date,
  covered_days bigint,
  missing_days int,
  expected_last_date date,
  days_behind int,
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  last_success_at timestamptz,
  consecutive_failures int,
  dispatcher_last_run_at timestamptz,
  dispatcher_last_status text,
  dispatcher_last_error text,
  is_healthy boolean,
  severity text,
  problem text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
DECLARE
  v_lag_days constant int := 2;
  v_stale_threshold constant int := 2;
  v_stuck_run_hours constant int := 6;
  -- The nightly dispatcher, seeded with this fixed id by aidream migration
  -- 0304_seo_gsc_sync_system_task.sql. Pinned by id, never by title.
  v_dispatcher_task constant uuid := 'a7c1e2d3-0000-4e5f-9a00-000000000300';
  v_expected date := (now() AT TIME ZONE 'utc')::date - v_lag_days;
  v_first date;
  v_last date;
  v_days bigint;
  v_missing int;
  v_behind int;
  v_last_run_at timestamptz;
  v_last_status text;
  v_last_error text;
  v_last_success timestamptz;
  v_consec int := 0;
  v_disp_at timestamptz;
  v_disp_status text;
  v_disp_error text;
  v_problem text;
  v_severity text;
BEGIN
  IF NOT iam.has_access('web_site', p_site_id, 'viewer') THEN
    RAISE EXCEPTION 'gsc_health_forbidden: no access to site %', p_site_id;
  END IF;

  SELECT MIN(spd.date), MAX(spd.date), COUNT(DISTINCT spd.date)
    INTO v_first, v_last, v_days
  FROM seo.search_performance_daily spd
  WHERE spd.provider = 'gsc'
    AND spd.site_id = p_site_id
    AND spd.dimension_profile <> 'search_appearance';

  -- Reported, never alarmed on — see the header. A day with no rows is
  -- indistinguishable from a day with no traffic.
  v_missing := CASE
    WHEN v_first IS NULL OR v_last IS NULL THEN NULL
    ELSE GREATEST(0, ((v_last - v_first) + 1) - COALESCE(v_days, 0)::int)
  END;

  SELECT COALESCE(cr.completed_at, cr.started_at, cr.created_at),
         cr.status,
         cr.error->>'message'
    INTO v_last_run_at, v_last_status, v_last_error
  FROM seo.collection_run cr
  WHERE cr.site_id = p_site_id AND cr.capability = 'search_performance'
  ORDER BY cr.created_at DESC
  LIMIT 1;

  SELECT MAX(cr.completed_at) INTO v_last_success
  FROM seo.collection_run cr
  WHERE cr.site_id = p_site_id
    AND cr.capability = 'search_performance'
    AND cr.status = 'completed';

  SELECT COUNT(*) INTO v_consec
  FROM (
    SELECT cr.status,
           bool_or(cr.status <> 'failed') OVER (
             ORDER BY cr.created_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS hit_non_failure
    FROM seo.collection_run cr
    WHERE cr.site_id = p_site_id AND cr.capability = 'search_performance'
    ORDER BY cr.created_at DESC
  ) head
  WHERE NOT head.hit_non_failure;

  SELECT r.started_at, r.status, NULLIF(r.error_message, '')
    INTO v_disp_at, v_disp_status, v_disp_error
  FROM scheduler.sch_run r
  WHERE r.task_id = v_dispatcher_task
  ORDER BY r.started_at DESC NULLS LAST
  LIMIT 1;

  v_behind := CASE WHEN v_last IS NULL THEN NULL ELSE (v_expected - v_last) END;

  IF v_last IS NULL AND v_last_run_at IS NULL THEN
    v_severity := 'info';
    v_problem := 'This site has never ingested Search Console data. Run a sync to backfill.';
  ELSIF v_last IS NULL THEN
    v_severity := 'critical';
    v_problem := 'Collection runs exist but no data landed — every run persisted zero rows.';
  ELSIF v_last_status IN ('running', 'pending')
        AND v_last_run_at < now() - make_interval(hours => v_stuck_run_hours) THEN
    v_severity := 'critical';
    v_problem := format(
      'A collection run has been stuck in %s since %s. It is not in flight — the worker died mid-run.',
      v_last_status, to_char(v_last_run_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'));
  ELSIF v_consec >= 1 THEN
    v_severity := 'critical';
    v_problem := format('The last %s collection run(s) for this site failed: %s',
                        v_consec, COALESCE(v_last_error, 'no error recorded'));
  ELSIF v_disp_status = 'failed'
        AND COALESCE(v_behind, 0) >= v_stale_threshold THEN
    v_severity := 'critical';
    v_problem := format(
      'The nightly Search Console job is failing (last run %s: %s). No collection has been attempted for this site — data is %s days behind.',
      to_char(v_disp_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'),
      COALESCE(v_disp_error, 'no error recorded'), v_behind);
  ELSIF v_behind >= v_stale_threshold THEN
    v_severity := 'critical';
    v_problem := format(
      'Data is %s days behind (latest %s, expected %s). Ingestion has stopped keeping up.',
      v_behind, v_last, v_expected);
  ELSE
    v_severity := NULL;
    v_problem := NULL;
  END IF;

  RETURN QUERY SELECT
    v_first, v_last, COALESCE(v_days, 0), v_missing, v_expected, v_behind,
    v_last_run_at, v_last_status, v_last_error, v_last_success, v_consec,
    v_disp_at, v_disp_status, v_disp_error,
    v_problem IS NULL, v_severity, v_problem;
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_ingestion_health(uuid) TO authenticated;

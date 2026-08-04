-- GSC ingestion health, v2 — diagnose from where the failure ACTUALLY lands.
--
-- v1 (seo_gsc_ingestion_health.sql) asked `seo.collection_run` why ingestion
-- had stopped. That was wrong for the exact outage it was written for: the
-- nightly dispatcher failed while BUILDING each site's request, so it never
-- created a collection_run row at all. The failure lived in
-- `scheduler.sch_run` ("7 site syncs failed", five nights running) — a table
-- v1 never read. Result: on a site 15 days stale, v1 reported
-- `last_run_status = completed`, `consecutive_failures = 0`. It named the
-- symptom while its own diagnostic fields said everything was fine.
--
-- v2 fixes that and four related lies:
--   * reads the nightly dispatcher's own run history, so "the job itself is
--     failing" is reportable even when zero collection runs exist;
--   * `last_run_at` coalesces completed → started → created, because
--     `completed_at` is NULL exactly when a run FAILED (v1 blanked the
--     timestamp at the one moment a human needs it);
--   * `consecutive_failures` counts FAILURES, not non-successes — v1's
--     window counted `running`/`pending` rows as failures (verified: a head
--     of failed,running,failed,pending,completed reported 4);
--   * a run stuck in `running`/`pending` past STUCK_RUN_HOURS is its own
--     problem, not something to wait 3 days to notice as staleness;
--   * a mid-history GAP is detected — v1 computed covered_days and then
--     never compared it to the span, so a site with a 10-day hole and fresh
--     data read as perfectly healthy.
--
-- New `severity` column: a brand-new site that has simply never synced is
-- 'info', not an alarm. v1 rendered it in the same red banner as a five-day
-- outage, directly above the empty state that already said so.
--
-- SECURITY DEFINER on purpose, gated on the SITE via the existing kernel
-- (`iam.has_access('web_site', …, 'viewer')`) — never a new check. It reads
-- scheduler rows the caller cannot see, and exposes exactly one string from
-- them: the dispatcher's error message. Scoped that narrowly on purpose.

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
  -- GSC finalizes ~2 days back; a site is "current" at today-2.
  v_lag_days constant int := 2;
  -- Fires when the freshest data day is >= (lag + threshold) days old, i.e.
  -- at 2 the banner appears once data is 4 calendar days old — one missed
  -- night stays quiet, two do not. This is the literal behavior; do not
  -- describe it as same-day.
  v_stale_threshold constant int := 2;
  -- A collection run still 'running' past this is not in flight, it is dead.
  v_stuck_run_hours constant int := 6;
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

  -- Days with no rows INSIDE the covered span. Fresh data at the head hides
  -- a hole in the middle from every other signal here.
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

  -- Consecutive FAILED runs at the head — stop at the first row that is not
  -- a failure, so an in-flight run never inflates the count.
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

  -- The nightly dispatcher. When it dies before building a request, NO
  -- collection_run exists for any site and this is the only record there is.
  SELECT r.started_at, r.status, NULLIF(r.error_message, '')
    INTO v_disp_at, v_disp_status, v_disp_error
  FROM scheduler.sch_run r
  JOIN scheduler.sch_task t ON t.id = r.task_id
  WHERE t.deleted_at IS NULL
    AND t.title ILIKE '%search console%'
  ORDER BY r.started_at DESC NULLS LAST
  LIMIT 1;

  v_behind := CASE WHEN v_last IS NULL THEN NULL ELSE (v_expected - v_last) END;

  -- Ordered worst-first: name the ROOT cause, not the symptom it produced.
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
    -- The dispatcher itself is failing, so no per-site run was ever created.
    -- THIS is the shape of the 2026-07-30 outage.
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
  ELSIF COALESCE(v_missing, 0) > 0 THEN
    -- Fresh at the head, holed in the middle. Every chart over that window
    -- under-reports and nothing else here would notice.
    v_severity := 'warning';
    v_problem := format(
      '%s day(s) are missing between %s and %s. Charts covering that range under-report.',
      v_missing, v_first, v_last);
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

-- GSC ingestion health, v5 — GOOGLE'S DAY IS PACIFIC.
--
-- v4 and every version before it derived the expected freshest data day from
-- the UTC calendar:
--
--   v_expected := (now() AT TIME ZONE 'utc')::date - v_lag_days;
--
-- Search Console has no UTC option: it buckets days in America/Los_Angeles
-- (with DST). For the 7-8 hours between UTC midnight and Pacific midnight,
-- "UTC today" names a day that has not started in California yet, so
-- v_expected pointed one day into the future of Google's calendar and every
-- site was reported one day staler than it actually was. At a 2-day
-- tolerance that one day is not cosmetic: it moves the whole scale up a
-- notch, so a site one day behind — well inside Google's own documented
-- 2-3 day finalization lag — reads as 2 and is called 'critical' for that
-- third of the day, then quietly heals at 00:00 Pacific. Verified against
-- the live function: at 2026-08-23 03:00Z the old expression gave
-- 2026-08-21, the new one gives 2026-08-20.
--
-- v5 derives the day in Google's own zone:
--
--   v_expected := (now() AT TIME ZONE v_gsc_timezone)::date - v_lag_days;
--
-- This mirrors the ingestion side, which was fixed first: aidream commit
-- 871385cf8 made `gsc_today()` in packages/matrx-seo/matrx_seo/providers/gsc.py
-- the ONE place that conversion happens server-side, documented in
-- aidream/services/seo/FEATURE.md. Reader and writer now agree on what day
-- it is. This is the same convention, not a second one.
--
-- Mirrored in the frontend by features/marketing/search-console/lib/gsc-day.ts
-- (`gscToday`), which SearchConsolePortfolio's freshness badge reads. That
-- helper and this function must stay in step; the header on gsc-day.ts points
-- back here.
--
-- v_lag_days stays 2 deliberately. Google documents a 2-3 day finalization
-- lag, so a site legitimately 3 days behind can still be flagged — that is a
-- product call about tolerance, not this timezone defect, and it is left
-- exactly as v4 set it.
--
-- Nothing else changes from v4: same signature, same columns, same branches,
-- same copy. v4's header (a PAUSED schedule is not a FAILING schedule; an
-- unexplained terminal status is a defect; this site's own run ledger decides
-- whether it was reached) still describes every other clause of this function.

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
  dispatcher_enabled boolean,
  dispatcher_paused_at timestamptz,
  dispatcher_paused_reason text,
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
  -- Printed wherever a terminal status carries no reason. This is a DEFECT
  -- report, not a value: a run that failed without saying why means the
  -- recorder is broken, and the reader must be told that rather than handed
  -- a shrug.
  v_no_reason constant text :=
    'the run recorded no reason, which is itself a defect — whatever ended it did not say why';
  -- Google's Search Console day boundary. Not a preference and not the
  -- viewer's zone: it is the only calendar GSC reports in, and it observes
  -- DST, so the offset must come from the tz database, never a constant.
  v_gsc_timezone constant text := 'America/Los_Angeles';
  v_expected date := (now() AT TIME ZONE v_gsc_timezone)::date - v_lag_days;
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
  v_disp_enabled boolean;
  v_disp_exists boolean := false;
  v_paused_at timestamptz;
  v_paused_reason text;
  v_site_attempted_at timestamptz;
  v_attempt_clause text;
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

  -- Reported, never alarmed on — see the v3 header. A day with no rows is
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

  -- THE SWITCH ITSELF. A schedule that is disabled, soft-deleted, or missing
  -- outright will never produce another run, and no amount of reading its
  -- last run can reveal that.
  SELECT true,
         t.enabled AND t.deleted_at IS NULL,
         (t.metadata #>> '{governance_suspended,at}')::timestamptz,
         t.metadata #>> '{governance_suspended,reason}'
    INTO v_disp_exists, v_disp_enabled, v_paused_at, v_paused_reason
  FROM scheduler.sch_task t
  WHERE t.id = v_dispatcher_task;

  IF NOT v_disp_exists THEN
    v_disp_enabled := false;
  END IF;

  -- Did the last dispatcher pass actually reach THIS site? v3 asserted it had
  -- not, from the dispatcher's status alone, and was wrong.
  --
  -- Scoped to trigger='scheduled': a MANUAL "Sync now" after the pass is not
  -- evidence the pass reached this site, and crediting it to the schedule
  -- would tell the reader the nightly job is doing work it is not doing.
  IF v_disp_at IS NOT NULL THEN
    SELECT MAX(COALESCE(cr.completed_at, cr.started_at, cr.created_at))
      INTO v_site_attempted_at
    FROM seo.collection_run cr
    WHERE cr.site_id = p_site_id
      AND cr.capability = 'search_performance'
      AND cr.trigger = 'scheduled'
      AND cr.created_at >= v_disp_at;
  END IF;

  v_attempt_clause := CASE
    WHEN v_site_attempted_at IS NULL
      THEN 'This site was never reached on that pass'
    ELSE format('This site was collected on that pass (%s), and nothing scheduled has run since',
                to_char(v_site_attempted_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'))
  END;

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
                        v_consec, COALESCE(v_last_error, v_no_reason));
  -- THE SWITCH, ahead of every run-history branch: when the nightly job is
  -- off, no run history explains the staleness and no retry can fix it.
  ELSIF NOT v_disp_enabled THEN
    v_severity := CASE WHEN COALESCE(v_behind, 0) >= v_stale_threshold
                       THEN 'critical' ELSE 'warning' END;
    -- The raw governance reason is machine-shaped ("no exact name+interval
    -- approval in common-docs/…") and means nothing to the expert whose
    -- dashboard this is. It travels in dispatcher_paused_reason for the copy
    -- payload and for agents; the sentence a human reads says what is true
    -- and what happens next.
    v_problem := format(
      'The nightly Search Console sync is switched OFF%s, so no site is being kept current. %s. Data here is %s days behind. Sync now updates this site once; the nightly job stays off until an administrator turns it back on.',
      CASE WHEN v_paused_at IS NULL THEN ''
           ELSE ' (paused ' || to_char(v_paused_at AT TIME ZONE 'utc', 'YYYY-MM-DD') || ')' END,
      v_attempt_clause,
      COALESCE(v_behind, 0));
  ELSIF v_disp_status = 'failed'
        AND COALESCE(v_behind, 0) >= v_stale_threshold THEN
    v_severity := 'critical';
    v_problem := format(
      'The nightly Search Console job is failing (last run %s: %s). %s — data is %s days behind.',
      to_char(v_disp_at AT TIME ZONE 'utc', 'YYYY-MM-DD HH24:MI'),
      COALESCE(v_disp_error, v_no_reason), v_attempt_clause, v_behind);
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
    v_disp_enabled, v_paused_at, v_paused_reason,
    v_problem IS NULL, v_severity, v_problem;
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_ingestion_health(uuid) TO authenticated;

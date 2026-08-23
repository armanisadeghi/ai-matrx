-- GSC ingestion health, v4 — a PAUSED schedule is not a FAILING schedule,
-- and "no error recorded" is a finding, not a footnote.
--
-- Observed live 2026-08-23 on /marketing/search-console?site=38eff4c9-…:
--
--   "Search Console data is not up to date — The nightly Search Console job
--    is failing (last run 2026-08-20 09:15: no error recorded). No collection
--    has been attempted for this site — data is 3 days behind."
--
-- Every clause of that sentence was misleading, and each is a separate defect
-- v4 closes:
--
-- 1. THE JOB WAS NOT FAILING — IT WAS SWITCHED OFF. `scheduler.sch_task`
--    a7c1e2d3-…300 was set enabled=false on 2026-08-20T20:20:45Z by a
--    scheduled-work-governance pass (metadata.governance_suspended), with
--    next_due_at NULL. Nothing has run since 2026-08-19. v3 only ever read
--    the last RUN, so a task that stopped being dispatched at all showed the
--    corpse of its final run forever and named the wrong repair: a reader
--    would go debug an API integration when the actual fix is an approval and
--    a row flip. THE TRUE CURRENT STATUS LAW — a status is derived from live
--    state, and "is this schedule even switched on?" is live state.
--    v4 reads the task row and leads with that when it is off.
--
-- 2. "no error recorded" WAS LITERALLY TRUE AND SHOULD NEVER HAVE BEEN
--    POSSIBLE. That run was force-failed by the lifecycle watchdog 614s after
--    it was claimed (ops.app_log `watchdog_stuck_rows`, max_age_secs=610),
--    which wrote status='failed' and NOTHING else — no finished_at, no
--    error_message, not even a metadata stamp. Root cause fixed in aidream
--    `aidream/db/watchdog_configs.py` (the rule now respects the run's own
--    3-hour claim lease and stamps a reason). Here, v4 stops printing the
--    bare phrase "no error recorded" as though a reasonless failure were an
--    ordinary outcome: an unexplained terminal status is named as the defect
--    it is, so the next reader chases the recorder, not the job.
--
-- 3. "No collection has been attempted for this site" WAS FALSE. The
--    2026-08-20 dispatcher run DID collect this site successfully
--    (seo.collection_run 6c95e6a0, completed 09:15:47) before the watchdog
--    killed the dispatcher mid-way through the NEXT site. v3 inferred "no
--    attempt" from the dispatcher's status alone and never looked at this
--    site's own run ledger. v4 says what actually happened to THIS site.
--
-- New columns (additive): dispatcher_enabled, dispatcher_paused_at,
-- dispatcher_paused_reason — so the surface can name the real repair instead
-- of offering a retry that cannot help.

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

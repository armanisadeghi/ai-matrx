-- GSC ingestion health — the SURFACING layer for silent ingestion failure.
--
-- WHY THIS EXISTS (2026-08-04): GSC ingestion was 100% broken for five days.
-- It was not unrecorded — `scheduler.sch_run` held `status='failed'`,
-- `synced=0`, `7 site syncs failed` every single night. Nothing surfaced it,
-- so nobody looked, and the dashboard cheerfully served one stale day as if
-- it were the whole truth. Recording a failure where no human reads is
-- indistinguishable from not recording it.
--
-- This function answers ONE question the dashboard asks on every load: "is
-- this site's search data actually being kept current, and if not, why?"
-- The dashboard renders a loud banner from it — the layer that turns a
-- five-day outage into a same-day one.
--
-- SECURITY DEFINER on purpose: `seo.collection_run` RLS is
-- `created_by = auth.uid() OR iam.has_access(...)`, which hides a
-- nightly-scheduler-owned run from an org colleague who can legitimately see
-- the site. Health is gated on the SITE instead — the existing kernel
-- (`iam.has_access('web_site', …, 'viewer')`), never a new check: if you can
-- view the site, you can see whether its data is flowing.

CREATE OR REPLACE FUNCTION seo.gsc_ingestion_health(p_site_id uuid)
RETURNS TABLE (
  data_first_date date,
  data_last_date date,
  covered_days bigint,
  expected_last_date date,
  days_behind int,
  last_run_at timestamptz,
  last_run_status text,
  last_run_error text,
  last_success_at timestamptz,
  consecutive_failures int,
  is_healthy boolean,
  problem text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = seo, pg_temp
AS $$
DECLARE
  -- GSC finalizes ~2 days back; a site is "current" at today-2.
  v_lag_days constant int := 2;
  -- One missed night is noise (a run can straddle midnight); two is a signal.
  v_stale_threshold constant int := 3;
  v_expected date := (now() AT TIME ZONE 'utc')::date - v_lag_days;
  v_first date;
  v_last date;
  v_days bigint;
  v_behind int;
  v_last_run_at timestamptz;
  v_last_status text;
  v_last_error text;
  v_last_success timestamptz;
  v_consec int := 0;
  v_problem text;
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

  SELECT cr.completed_at, cr.status, cr.error->>'message'
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

  -- Consecutive failures at the head of the run history.
  SELECT COUNT(*) INTO v_consec
  FROM (
    SELECT cr.status,
           bool_or(cr.status = 'completed') OVER (
             ORDER BY cr.created_at DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
           ) AS hit_success
    FROM seo.collection_run cr
    WHERE cr.site_id = p_site_id AND cr.capability = 'search_performance'
    ORDER BY cr.created_at DESC
  ) head
  WHERE NOT head.hit_success;

  v_behind := CASE WHEN v_last IS NULL THEN NULL ELSE (v_expected - v_last) END;

  -- Ordered worst-first: name the ROOT problem, not the symptom.
  v_problem := CASE
    WHEN v_last IS NULL AND v_last_run_at IS NULL THEN
      'This site has never ingested Search Console data. Run a sync.'
    WHEN v_last IS NULL THEN
      'Collection runs exist but no data landed — every run persisted zero rows.'
    WHEN v_consec >= 1 AND v_last_status = 'failed' THEN
      format('The last %s collection run(s) failed: %s',
             v_consec, COALESCE(v_last_error, 'no error recorded'))
    WHEN v_behind >= v_stale_threshold THEN
      format('Data is %s days behind (latest %s, expected %s). Ingestion has stopped keeping up.',
             v_behind, v_last, v_expected)
    ELSE NULL
  END;

  RETURN QUERY SELECT
    v_first, v_last, COALESCE(v_days, 0), v_expected, v_behind,
    v_last_run_at, v_last_status, v_last_error, v_last_success,
    v_consec, v_problem IS NULL, v_problem;
END;
$$;

GRANT EXECUTE ON FUNCTION seo.gsc_ingestion_health(uuid) TO authenticated;

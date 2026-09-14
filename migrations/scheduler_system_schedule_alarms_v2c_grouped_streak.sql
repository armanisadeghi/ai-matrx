-- ============================================================================
-- SCHEDULE ALARMS v2c — the streak in one grouped pass (2026-09-14)
--
-- v2b read the runs off the index in 9 ms and then spent 730 ms computing
-- the failure streak: `min(rn) FROM recent y WHERE y.task_id = x.task_id`
-- inside a FILTER is a correlated subquery evaluated once per row of the
-- CTE — quadratic in the number of recent runs. The streak and the
-- last-success timestamp are now ONE grouped aggregate per task, and the
-- "succeeded since suspension" EXISTS became a comparison against it.
-- Function body otherwise identical to v2b.
-- ============================================================================

-- based-on: scheduler.system_schedule_alarms(integer) a0d0e7b0abec9514d421db56a2f0dbcb938e428c73544221b45975519533bdac

CREATE OR REPLACE FUNCTION scheduler.system_schedule_alarms(p_overdue_grace_minutes integer DEFAULT NULL)
RETURNS TABLE (
  task_id uuid,
  title text,
  description text,
  tags text[],
  kind text,
  alarm text,
  severity text,
  detail text,
  enabled boolean,
  next_due_at timestamptz,
  last_run_at timestamptz,
  suspended_at timestamptz,
  consecutive_failures integer,
  succeeded_since_suspension boolean,
  last_run_id uuid,
  last_run_status text,
  last_run_error text,
  last_run_finished_at timestamptz,
  failed_streak integer,
  approval text,
  impact jsonb,
  muted_until timestamptz,
  mute_reason text,
  mute_by text,
  mute_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'scheduler', 'public', 'pg_temp'
AS $fn$
DECLARE
  v_grace integer;
  v_streak integer;
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'scheduler_alarms_forbidden: super-admin only'
      USING ERRCODE = '42501';
  END IF;

  -- Thresholds are knobs. A missing knob RAISES: a silent fallback to a
  -- literal here would be exactly the hardcoded ceiling the knob replaced.
  SELECT (COALESCE(k.value, k.default_value) #>> '{}')::integer INTO v_grace
    FROM platform.feature_knob k WHERE k.feature = 'scheduler.alarms' AND k.key = 'overdue_grace_minutes';
  SELECT (COALESCE(k.value, k.default_value) #>> '{}')::integer INTO v_streak
    FROM platform.feature_knob k WHERE k.feature = 'scheduler.alarms' AND k.key = 'failing_streak';
  IF v_grace IS NULL OR v_streak IS NULL THEN
    RAISE EXCEPTION 'scheduler_alarms_knob_missing: scheduler.alarms.overdue_grace_minutes / failing_streak must be seeded in platform.feature_knob'
      USING ERRCODE = 'P0001';
  END IF;
  v_grace := GREATEST(COALESCE(p_overdue_grace_minutes, v_grace), 1);
  v_streak := GREATEST(v_streak, 1);

  RETURN QUERY
  WITH recent AS (
    -- The last 50 TERMINAL runs per live task, newest first, read through
    -- the existing (task_id, due_at DESC) index — 9 ms for the whole fleet.
    -- v2 windowed ALL 234k runs (308 ms, a full sort) and this read happens
    -- on every super-admin tab: that was the class of cost the dock's poll
    -- must never carry. In-flight runs are neither a success nor a failure
    -- and must not break or start a streak.
    SELECT t0.id AS task_id, q.id, q.status, q.error_message, q.at,
           row_number() OVER (PARTITION BY t0.id ORDER BY q.at DESC) AS rn
    FROM scheduler.sch_task t0
    CROSS JOIN LATERAL (
      SELECT r.id, r.status, r.error_message, COALESCE(r.finished_at, r.created_at) AS at
      FROM scheduler.sch_run r
      WHERE r.task_id = t0.id AND r.status IN ('success', 'failed')
      ORDER BY r.due_at DESC
      LIMIT 50
    ) q
    WHERE t0.deleted_at IS NULL
  ),
  last_run AS (
    SELECT * FROM recent WHERE rn = 1
  ),
  per_task AS (
    -- One grouped pass: the failed streak is "newest runs before the first
    -- non-failure", and the last success is what settles whether a suspended
    -- schedule has run fine since the guard switched it off. (v2b computed
    -- the streak with a correlated min() over the CTE per row — quadratic.)
    SELECT q.task_id,
           (COALESCE(min(q.rn) FILTER (WHERE q.status <> 'failed'), 51) - 1)::integer AS failed_streak,
           max(q.at) FILTER (WHERE q.status = 'success') AS last_success_at
    FROM recent q
    GROUP BY q.task_id
  )
  SELECT t.id,
         t.title,
         t.description,
         t.tags,
         t.kind,
         a.alarm,
         a.severity,
         a.detail,
         t.enabled,
         t.next_due_at,
         t.last_run_at,
         s.suspended_at,
         NULLIF(t.metadata->'auto_suspended'->>'consecutive_failures','')::int,
         s.succeeded_since,
         lr.id,
         lr.status,
         NULLIF(lr.error_message, ''),
         lr.at,
         COALESCE(st.failed_streak, 0),
         NULLIF(t.metadata->>'approval', ''),
         CASE WHEN jsonb_typeof(t.metadata->'impact') = 'array' THEN t.metadata->'impact' ELSE NULL END,
         m.muted_until,
         m.mute_reason,
         m.mute_by,
         m.mute_at
  FROM scheduler.sch_task t
  LEFT JOIN last_run lr ON lr.task_id = t.id
  LEFT JOIN per_task st ON st.task_id = t.id
  CROSS JOIN LATERAL (
    SELECT NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz AS suspended_at,
           COALESCE(st.last_success_at > NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz, false) AS succeeded_since
  ) s
  CROSS JOIN LATERAL (
    SELECT NULLIF(t.metadata->'alarm_mute'->>'until','')::timestamptz AS muted_until,
           NULLIF(t.metadata->'alarm_mute'->>'reason','') AS mute_reason,
           NULLIF(t.metadata->'alarm_mute'->>'by','') AS mute_by,
           NULLIF(t.metadata->'alarm_mute'->>'at','')::timestamptz AS mute_at
  ) m
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN t.metadata ? 'auto_suspended' AND NOT t.enabled THEN 'suspended'
             WHEN t.enabled AND t.next_due_at IS NOT NULL
                  AND t.next_due_at < now() - make_interval(mins => v_grace) THEN 'overdue'
             WHEN t.enabled AND COALESCE(st.failed_streak, 0) >= v_streak THEN 'failing'
           END AS alarm
  ) k
  CROSS JOIN LATERAL (
    SELECT k.alarm,
           CASE k.alarm WHEN 'suspended' THEN 'critical' ELSE 'warning' END AS severity,
           CASE k.alarm
             WHEN 'suspended' THEN
               CASE WHEN s.succeeded_since
                 THEN 'The repeat guard switched this off, but a later run succeeded — it is off for no live reason. Re-enabling is safe.'
                 ELSE COALESCE(t.metadata->'auto_suspended'->>'reason',
                               'The repeat guard switched this schedule off. Nothing will run until a human re-enables it.')
               END
             WHEN 'overdue' THEN 'Enabled and due at ' || to_char(t.next_due_at, 'YYYY-MM-DD HH24:MI') ||
                                 ' UTC, but it has not run. The scanner may be down or the trigger is not firing.'
             ELSE COALESCE(st.failed_streak, 0) || ' runs in a row have failed. Last error: ' ||
                  COALESCE(NULLIF(lr.error_message,''), '(the run recorded no error text)')
           END AS detail
  ) a
  WHERE k.alarm IS NOT NULL
    AND t.deleted_at IS NULL
  ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END,
           COALESCE(s.suspended_at, t.next_due_at, t.last_run_at) DESC NULLS LAST;
END $fn$;

REVOKE ALL ON FUNCTION scheduler.system_schedule_alarms(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION scheduler.system_schedule_alarms(integer) TO authenticated, service_role;

COMMENT ON FUNCTION scheduler.system_schedule_alarms(integer) IS
  'Super-admin read of scheduled tasks that need a human: repeat-guard suspended (critical), overdue past the scheduler.alarms.overdue_grace_minutes knob, or failing scheduler.alarms.failing_streak terminal runs in a row. Returns muted rows too (metadata.alarm_mute) with their mute columns — the client hides them from the global dock and lists them on the review page. Carries the failed run, the impact declaration, the approval and whether a run succeeded since the suspension, so every row is a decision, not a title. p_overdue_grace_minutes NULL = the knob.';

NOTIFY pgrst, 'reload schema';

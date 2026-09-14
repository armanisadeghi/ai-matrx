-- ============================================================================
-- SCHEDULE ALARMS v2b — the same read, off the index (2026-09-14)
--
-- v2 (scheduler_system_schedule_alarms_v2_mutes_streaks_impact.sql) computed
-- the per-task failure streak with one window over EVERY terminal run in
-- scheduler.sch_run: 234,539 rows sorted on each call, 308 ms, and the call
-- happens from every super-admin tab on a poll. The body is otherwise
-- unchanged; the only edit is the `recent` CTE, which now takes the newest 50
-- terminal runs PER LIVE TASK through the existing sch_run_task_due_idx
-- (task_id, due_at DESC) — 2.7k buffers and 9 ms for the whole fleet.
-- ============================================================================

-- based-on: scheduler.system_schedule_alarms(integer) 90a467fa20a73a798d39f48208cf438cc44eb6523d705041a26dac93b7fad9d3

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
  streak AS (
    -- How many of the newest terminal runs failed before the first success.
    SELECT x.task_id,
           count(*) FILTER (
             WHERE x.rn < COALESCE(
               (SELECT min(y.rn) FROM recent y WHERE y.task_id = x.task_id AND y.status <> 'failed'),
               51)
           )::integer AS failed_streak
    FROM recent x
    GROUP BY x.task_id
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
  LEFT JOIN streak st ON st.task_id = t.id
  CROSS JOIN LATERAL (
    SELECT NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz AS suspended_at,
           EXISTS (
             SELECT 1 FROM recent q
             WHERE q.task_id = t.id AND q.status = 'success'
               AND q.at > NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz
           ) AS succeeded_since
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

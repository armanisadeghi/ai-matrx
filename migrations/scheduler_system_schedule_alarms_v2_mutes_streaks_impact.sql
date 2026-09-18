-- ============================================================================
-- SCHEDULE ALARMS v2 — an alarm with a way out (Arman, 2026-09-14)
--
-- v1 (2026-08-24) answered "which schedules need a human?" and nothing else.
-- Seventeen days later the global banner it fed had become furniture:
--
--   "It keeps reminding me and telling me that things are off, but some of
--    these things should be off, and there's nothing wrong with the fact
--    that they're off, but it's not giving me an out."
--
-- Three commerce schedules were red for sixteen days because the entire
-- commerce module is unbuilt — the honest state of those rows IS "off", and
-- there was no way to say so. Two SEO schedules were orange because ONE
-- transient run ("lease expired") had failed, with a success right before it.
-- And every row was a title with a link: no reason, no failed run, no page in
-- the product where the damage shows, no action.
--
-- What changes here, all in the ONE read the dock and the review page share:
--
--   MUTE   `sch_task.metadata.alarm_mute = {until, reason, by, at}` — written
--          by a super-admin from the alarm itself (through RLS's
--          platform_admin_all + mergeJsonColumn, no new door). Muted rows are
--          RETURNED with their mute columns so the review page can list them
--          and un-mute; the global dock hides them until `until` passes.
--          A mute is timed, never permanent — silence that never ends is how
--          the next real outage gets missed.
--
--   STREAK `failing` now needs `failed_streak` consecutive terminal failures
--          (knob scheduler.alarms.failing_streak, default 2). One failed run
--          between successes is not an alarm; it is a row on the review page.
--
--   TRUTH  `succeeded_since_suspension`: a schedule the guard switched off
--          whose LATER run succeeded (the commerce rows: suspended 20:01,
--          succeeded 20:17 the same evening) is off for no live reason — the
--          sentence says so and re-enabling is the obvious fix.
--
--   DOORS  `last_run_id` / `last_run_error` (the run that failed opens),
--          `impact` (the pages this job feeds, declared by the job's own
--          registration in aidream under `metadata.impact`), `description`,
--          `approval`, `tags` — everything a person needs to decide, on the
--          row, instead of a title.
--
-- KNOBS, not constants: `scheduler.alarms.overdue_grace_minutes` (90) and
-- `scheduler.alarms.failing_streak` (2) live in platform.feature_knob and the
-- function reads them itself, so no client mirrors a threshold. A NULL
-- `p_overdue_grace_minutes` means "the knob"; the argument survives only so
-- the identity (integer) — and its client_callable_door row — stays put.
-- ============================================================================

-- based-on: scheduler.system_schedule_alarms(integer) 90f7ea2254fc3060124c3db52c2c6687e588a562e449d49ee79e77fa9c18abfb

INSERT INTO platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   allowed_values, label, description, set_by, basis, review_due)
VALUES
  ('scheduler.alarms', 'overdue_grace_minutes', '90', '90', 'integer', 'minutes', 1, 1440, null,
   'Minutes past due before a schedule counts as overdue',
   'An enabled schedule whose due time passed this many minutes ago without a run is reported to super-admins as overdue. Covers a slow scanner tick and a queue that is briefly behind.',
   'agent', 'Carried over from the v1 alarm read (2026-08-24), which hardcoded 90 in the client call. Review against real scanner tick latency once the fleet is under load.',
   date '2026-11-15'),
  ('scheduler.alarms', 'failing_streak', '2', '2', 'integer', 'runs', 1, 10, null,
   'Consecutive failed runs before a schedule is reported as failing',
   'One failed run between successes is noise (a lease that expired during a deploy, a transient provider error). This many terminal failures in a row, with no success between them, reaches the super-admin attention dock. The repeat guard still suspends at its own thresholds.',
   'agent', 'Arman, 2026-09-14: a single transient failure pinned two SEO schedules on the global alarm for a day each. Two is the smallest streak that is not one.',
   date '2026-11-15')
ON CONFLICT (feature, key) DO NOTHING;

-- The RETURNS TABLE shape widened, which Postgres refuses under CREATE OR
-- REPLACE (42P13). Same identity (integer) after the drop, so the
-- client_callable_door row and the client call site stay put.
DROP FUNCTION scheduler.system_schedule_alarms(integer);

CREATE FUNCTION scheduler.system_schedule_alarms(p_overdue_grace_minutes integer DEFAULT NULL)
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
  WITH terminal AS (
    -- The last 50 TERMINAL runs per task, newest first. In-flight runs are
    -- neither a success nor a failure and must not break or start a streak.
    SELECT r.task_id, r.id, r.status, r.error_message,
           COALESCE(r.finished_at, r.created_at) AS at,
           row_number() OVER (PARTITION BY r.task_id ORDER BY COALESCE(r.finished_at, r.created_at) DESC) AS rn
    FROM scheduler.sch_run r
    WHERE r.status IN ('success', 'failed')
  ),
  recent AS (
    SELECT * FROM terminal WHERE rn <= 50
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

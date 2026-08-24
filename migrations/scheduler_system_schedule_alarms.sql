-- ============================================================================
-- THE ALARM NOBODY READS (2026-08-24)
--
-- On 2026-08-23 an APPROVED nightly (`seo_keyword_facet_backfill`) fired once,
-- hit a latent dereference, failed three times in 19 seconds, and the repeat
-- guard auto-suspended it. Everything was recorded correctly — three
-- `ops.system_error` rows, red `sch_run` statuses, a suspension reason naming
-- the exact error. It still sat unread for a day, and the schedule Arman had
-- personally approved was simply OFF.
--
-- Recording is not routing. And the reason no human could have noticed is
-- structural: `scheduler.sch_task` carries only the canonical std_* policies
-- (FOUND_DEFECTS D140), so the scheduling console shows the VIEWER'S OWN
-- schedules — a system task owned by the service role is invisible there.
--
-- This is the read that makes system-schedule health visible WITHOUT weakening
-- RLS: one SECURITY DEFINER function, super-admin gated (the protected-resources
-- pattern), returning only tasks that need a human:
--   suspended  — the repeat guard switched an enabled schedule off
--   overdue    — enabled, due in the past, and the grace window has passed
--   failing    — enabled, and its most recent run failed
-- Nothing else. A health read that lists healthy rows becomes wallpaper.
-- ============================================================================

CREATE OR REPLACE FUNCTION scheduler.system_schedule_alarms(p_overdue_grace_minutes integer DEFAULT 90)
RETURNS TABLE (
  task_id uuid,
  title text,
  alarm text,
  severity text,
  detail text,
  enabled boolean,
  next_due_at timestamptz,
  last_run_at timestamptz,
  suspended_at timestamptz,
  consecutive_failures integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'scheduler', 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'scheduler_alarms_forbidden: super-admin only'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH last_run AS (
    SELECT DISTINCT ON (r.task_id) r.task_id, r.status, r.finished_at, r.error_message
    FROM scheduler.sch_run r
    ORDER BY r.task_id, COALESCE(r.finished_at, r.created_at) DESC
  )
  SELECT t.id,
         t.title,
         a.alarm,
         a.severity,
         a.detail,
         t.enabled,
         t.next_due_at,
         t.last_run_at,
         NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz,
         NULLIF(t.metadata->'auto_suspended'->>'consecutive_failures','')::int
  FROM scheduler.sch_task t
  LEFT JOIN last_run lr ON lr.task_id = t.id
  CROSS JOIN LATERAL (
    SELECT CASE
             WHEN t.metadata ? 'auto_suspended' AND NOT t.enabled THEN 'suspended'
             WHEN t.enabled AND t.next_due_at IS NOT NULL
                  AND t.next_due_at < now() - make_interval(mins => GREATEST(p_overdue_grace_minutes, 1)) THEN 'overdue'
             WHEN t.enabled AND lr.status = 'failed' THEN 'failing'
           END AS alarm
  ) k
  CROSS JOIN LATERAL (
    SELECT k.alarm,
           CASE k.alarm WHEN 'suspended' THEN 'critical' WHEN 'overdue' THEN 'warning' ELSE 'warning' END AS severity,
           CASE k.alarm
             WHEN 'suspended' THEN COALESCE(t.metadata->'auto_suspended'->>'reason',
                                            'The repeat guard switched this schedule off. Nothing will run until a human re-enables it.')
             WHEN 'overdue' THEN 'Enabled and due at ' || to_char(t.next_due_at, 'YYYY-MM-DD HH24:MI') ||
                                 ' UTC, but it has not run. The scanner may be down or the trigger is not firing.'
             ELSE COALESCE(NULLIF(lr.error_message,''), 'The most recent run failed and recorded no error text.')
           END AS detail
  ) a
  WHERE k.alarm IS NOT NULL
    AND t.deleted_at IS NULL
  ORDER BY CASE a.severity WHEN 'critical' THEN 0 ELSE 1 END,
           COALESCE(NULLIF(t.metadata->'auto_suspended'->>'at','')::timestamptz, t.next_due_at, t.last_run_at) DESC NULLS LAST;
END $fn$;

REVOKE ALL ON FUNCTION scheduler.system_schedule_alarms(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION scheduler.system_schedule_alarms(integer) TO authenticated, service_role;

COMMENT ON FUNCTION scheduler.system_schedule_alarms(integer) IS
  'Super-admin read of scheduled tasks that need a human: repeat-guard suspended, overdue past its grace window, or last run failed. Exists because sch_task has no admin RLS clause (D140), so a system schedule is otherwise invisible to the console — an approved nightly was silently off for a day on 2026-08-23.';

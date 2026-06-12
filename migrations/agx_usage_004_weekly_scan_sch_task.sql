-- agx_usage_004_weekly_scan_sch_task.sql
--
-- Seeds the weekly server-side system cron task that runs agent drift detection
-- across all agents, writes/refreshes public.agx_drift_alert rows, and DMs
-- every user with BREAKING drift (fingerprint-deduped — unchanged drift never
-- re-notifies; see agx_usage_001 for the alert lifecycle).
--
-- The runner handler lives in:
--   aidream/services/agent_usage/weekly_scan.py::run_agent_drift_scan
-- registered in aidream/services/scheduling/system_task_runner.py under
-- AGENT_DRIFT_SCAN_TOOL_NAME = 'agent_drift_weekly_scan'.
--
-- DATA seed into the shared sch_* scheduling spine — NOT a schema change.
-- Sanctioned scheduler shape (clone of kg_029_suggestion_expiry_sch_task):
--   * sch_task        kind='tool', surfaces={'server'}, enabled=true
--   * sch_agent_task  carries tool_name + args (the kind='tool' carrier)
--   * sch_trigger     type='cron', '0 13 * * 1' (Mondays 13:00 UTC)
--
-- next_due_at is set ONLY on sch_trigger — the DB trigger
-- sch_trigger_cascade_next_due_at cascades it onto sch_task (scheduler
-- invariant: the DB owns sch_task.next_due_at).
--
-- Operator user 4cf62e4e-2679-484f-b652-034e697418df (platform super_admin)
-- owns the maintenance job. Idempotent: fixed task UUID + ON CONFLICT upserts;
-- the trigger is DELETEd and re-INSERTed so re-runs cannot stack cron triggers.

DO $$
DECLARE
  v_task_id  UUID := 'a9d01f7a-0000-4e5f-9a00-0000000000d1';  -- deterministic, agx_usage_004
  v_operator UUID := '4cf62e4e-2679-484f-b652-034e697418df';
  v_next_due TIMESTAMPTZ;
BEGIN
  -- Next Monday 13:00 UTC strictly after now (date_trunc('week') = Monday 00:00).
  v_next_due := date_trunc('week', now() AT TIME ZONE 'UTC') + interval '13 hours';
  IF v_next_due <= now() THEN
    v_next_due := v_next_due + interval '7 days';
  END IF;

  -- 1. sch_task (kind='tool', server surface only)
  INSERT INTO public.sch_task
    (id, user_id, kind, title, description, queue, surfaces, enabled, tags)
  VALUES
    (v_task_id, v_operator, 'tool',
     'Agent drift weekly scan',
     'Weekly sweep that scans every agent usage surface (shortcuts, apps, '
     'prompt apps, scheduled tasks, surface bindings, SMS lines, workflow '
     'nodes, derived agents, code registry) for drift, upserts '
     'agx_drift_alert rows per (user, agent), and DMs users with breaking '
     'drift. Fingerprint-deduped: unchanged drift never re-notifies.',
     'default', ARRAY['server']::text[], true,
     ARRAY['system', 'agents', 'drift-scan']::text[])
  ON CONFLICT (id) DO UPDATE
    SET enabled     = true,
        surfaces    = ARRAY['server']::text[],
        kind        = 'tool',
        title       = EXCLUDED.title,
        description = EXCLUDED.description,
        updated_at  = now();

  -- 2. sch_agent_task — the kind='tool' carrier (tool_name + args in variables)
  INSERT INTO public.sch_agent_task
    (id, agent_id, prompt, variables, auth_mode, max_runtime_seconds, max_concurrent)
  VALUES
    (v_task_id, NULL,
     'Agent drift weekly scan (system task — no agent prompt)',
     jsonb_build_object('tool_name', 'agent_drift_weekly_scan', 'args', '{}'::jsonb),
     'auto', 1800, 1)
  ON CONFLICT (id) DO UPDATE
    SET variables           = EXCLUDED.variables,
        max_runtime_seconds = EXCLUDED.max_runtime_seconds,
        max_concurrent      = EXCLUDED.max_concurrent;

  -- 3. sch_trigger — weekly cron, Mondays 13:00 UTC. Delete-then-insert so
  --    re-running this migration cannot stack multiple triggers on the task.
  DELETE FROM public.sch_trigger WHERE task_id = v_task_id;
  INSERT INTO public.sch_trigger
    (task_id, user_id, type, config, enabled, next_due_at)
  VALUES
    (v_task_id, v_operator, 'cron',
     jsonb_build_object('expression', '0 13 * * 1', 'tz', 'UTC'),
     true, v_next_due);
END $$;

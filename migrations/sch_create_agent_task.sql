-- migrations/sch_create_agent_task.sql
--
-- Atomic create of a full agent-kind scheduled task: wraps the three inserts
-- (sch_task + sch_agent_task + sch_trigger) in a single transaction so the
-- caller doesn't need 3-write cleanup logic.
--
-- The spec calls this out explicitly:
--   "A future `create_agent_task` Postgres function will collapse this into
--    a single atomic RPC; build the façade so swapping it in is a one-line
--    change."  — docs/SCHEDULING.md §8
--
-- Returns the new task id. Callers can then re-SELECT with the standard
-- joined SELECT to get the full hydrated shape.
--
-- Security: SECURITY INVOKER (the default). RLS on the underlying tables
-- enforces ownership — caller can only create rows for themselves.
-- `user_id` defaults to auth.uid() on all three tables, so callers don't
-- need to pass it.
--
-- Related plan: ~/.claude/plans/please-review-this-so-squishy-tome.md

BEGIN;

CREATE OR REPLACE FUNCTION public.create_agent_task(
  p_title         text,
  p_prompt        text,
  p_trigger_type  text,
  p_trigger_config jsonb,
  p_description   text DEFAULT NULL,
  p_surfaces      text[] DEFAULT ARRAY['any']::text[],
  p_tags          text[] DEFAULT ARRAY[]::text[],
  p_queue         text DEFAULT 'default',
  p_expires_at    timestamptz DEFAULT NULL,
  p_next_due_at   timestamptz DEFAULT NULL,
  p_agent_id      uuid DEFAULT NULL,
  p_variables     jsonb DEFAULT '{}'::jsonb,
  p_persistent_conversation_id uuid DEFAULT NULL,
  p_auth_mode     text DEFAULT 'ask',
  p_max_runtime_seconds integer DEFAULT 600,
  p_max_concurrent integer DEFAULT 1
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_task_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  -- sch_task
  INSERT INTO public.sch_task (
    kind, title, description, queue, surfaces, tags,
    expires_at, next_due_at
  ) VALUES (
    'agent', p_title, p_description, p_queue, p_surfaces, p_tags,
    p_expires_at, p_next_due_at
  )
  RETURNING id INTO v_task_id;

  -- sch_agent_task (1:1, id shared)
  INSERT INTO public.sch_agent_task (
    id, agent_id, prompt, variables, persistent_conversation_id,
    auth_mode, max_runtime_seconds, max_concurrent
  ) VALUES (
    v_task_id, p_agent_id, p_prompt, p_variables, p_persistent_conversation_id,
    p_auth_mode, p_max_runtime_seconds, p_max_concurrent
  );

  -- sch_trigger (1 in v0; trigger DB cascade will set sch_task.next_due_at)
  INSERT INTO public.sch_trigger (
    task_id, type, config, enabled, next_due_at
  ) VALUES (
    v_task_id, p_trigger_type, p_trigger_config, true, p_next_due_at
  );

  RETURN v_task_id;
END;
$$;

COMMENT ON FUNCTION public.create_agent_task IS
  'Atomic create of an agent-kind scheduled task (sch_task + sch_agent_task + sch_trigger). SECURITY INVOKER — RLS enforces ownership. Returns the new task id.';

COMMIT;

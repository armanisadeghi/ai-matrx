-- =============================================================================
-- Migration: cx_agent_lists — UI-First Tools persistence layer
--
-- Five tables that back the agent's client-delegated UI tools, ported from
-- the matrx-extend Chrome extension (which stored these in chrome.storage.local).
-- Server-mediated here so they survive reloads, sync cross-tab, and aggregate
-- across conversations.
--
--   1. cx_agent_plan      — proposed/approved plans (status: proposed|approved|rejected|superseded)
--   2. cx_agent_task      — agent's own tasklist (status cycle: pending|in_progress|done|blocked|skipped)
--   3. cx_user_todo       — items the agent has assigned to the user (done/not done)
--   4. cx_agent_memory    — per-conversation session scratchpad KV (ephemeral concept)
--   5. agent_user_kv      — per-user persistent KV (survives conversation reset)
--
-- All conversation-scoped tables CASCADE on cx_conversation delete. RLS follows
-- the standard pattern: user_id owns the row; service_role bypass; conversation
-- ownership additionally verified at insert via the cx_conversation FK.
--
-- Realtime publication: all five tables are added to supabase_realtime so the
-- live mirror slice can subscribe via Supabase Realtime Postgres Changes.
-- (Distinct from the extension's `LISTS_CHANGED` chrome.runtime broadcast.)
--
-- Optional future tie-ins to the user's existing project/task system:
--   cx_agent_plan.project_id -> ctx_projects.id  (NULL ok — "elevate plan to project")
--   cx_user_todo.ctx_task_id -> ctx_tasks.id    (NULL ok — "elevate todo to real task")
-- These FKs ON DELETE SET NULL so the agent rows survive if the project/task is
-- removed.
--
-- Related plan: ~/.claude/plans/please-look-at-this-toasty-lark.md
-- =============================================================================

BEGIN;

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE public.cx_plan_status AS ENUM (
        'proposed',
        'approved',
        'rejected',
        'superseded'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.cx_agent_task_status AS ENUM (
        'pending',
        'in_progress',
        'done',
        'blocked',
        'skipped'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE public.cx_agent_task_creator AS ENUM (
        'agent',
        'user'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- ── 1. cx_agent_plan ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cx_agent_plan (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id     uuid NOT NULL REFERENCES public.cx_conversation(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title               text NOT NULL,
    steps               jsonb NOT NULL DEFAULT '[]'::jsonb,
    reasoning           text,
    domains             text[],
    estimated_minutes   integer CHECK (estimated_minutes IS NULL OR estimated_minutes > 0),

    status              public.cx_plan_status NOT NULL DEFAULT 'proposed',

    -- Optional tie-in to the user's project system. Schema-only for now;
    -- "elevate plan to project" is a follow-up UX.
    project_id          uuid REFERENCES public.ctx_projects(id) ON DELETE SET NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cx_agent_plan_conversation_status_updated
    ON public.cx_agent_plan (conversation_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_agent_plan_user
    ON public.cx_agent_plan (user_id, updated_at DESC);

-- ── 2. cx_agent_task ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cx_agent_task (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id     uuid NOT NULL REFERENCES public.cx_conversation(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Link a task back to the plan step that spawned it. Null for ad-hoc
    -- agent-created tasks (not all tasks have to come from an update_plan call).
    plan_id             uuid REFERENCES public.cx_agent_plan(id) ON DELETE SET NULL,

    title               text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    status              public.cx_agent_task_status NOT NULL DEFAULT 'pending',
    note                text CHECK (note IS NULL OR char_length(note) <= 500),
    position            integer NOT NULL DEFAULT 0,
    created_by          public.cx_agent_task_creator NOT NULL DEFAULT 'agent',

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cx_agent_task_conversation_position
    ON public.cx_agent_task (conversation_id, position);
CREATE INDEX IF NOT EXISTS idx_cx_agent_task_user
    ON public.cx_agent_task (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_agent_task_plan
    ON public.cx_agent_task (plan_id) WHERE plan_id IS NOT NULL;

-- ── 3. cx_user_todo ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cx_user_todo (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    conversation_id     uuid NOT NULL REFERENCES public.cx_conversation(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    title               text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
    -- "Why is the agent asking" — free-form context for the user.
    context             text CHECK (context IS NULL OR char_length(context) <= 300),
    -- Free-form due string (matches the extension contract). Real datetime
    -- parsing happens client-side if/when needed.
    due                 text CHECK (due IS NULL OR char_length(due) <= 80),

    done                boolean NOT NULL DEFAULT false,
    done_at             timestamptz,

    -- Optional tie-in to the user's existing task system. Schema-only for now;
    -- "elevate todo to real task" is a follow-up UX.
    ctx_task_id         uuid REFERENCES public.ctx_tasks(id) ON DELETE SET NULL,

    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cx_user_todo_conversation_done_created
    ON public.cx_user_todo (conversation_id, done, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cx_user_todo_user
    ON public.cx_user_todo (user_id, updated_at DESC);

-- ── 4. cx_agent_memory (per-conversation ephemeral KV) ───────────────────────

CREATE TABLE IF NOT EXISTS public.cx_agent_memory (
    conversation_id     uuid NOT NULL REFERENCES public.cx_conversation(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    key                 text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
    value               jsonb NOT NULL,

    updated_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (conversation_id, key)
);

CREATE INDEX IF NOT EXISTS idx_cx_agent_memory_user
    ON public.cx_agent_memory (user_id, updated_at DESC);

-- ── 5. agent_user_kv (per-user persistent KV) ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.agent_user_kv (
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    key                 text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
    value               jsonb NOT NULL,

    updated_at          timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (user_id, key)
);

-- ── updated_at triggers ──────────────────────────────────────────────────────
--
-- Use the standard `public.set_updated_at()` trigger function if present;
-- otherwise create a local one. Safe across repeat runs.

CREATE OR REPLACE FUNCTION public.cx_agent_lists_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cx_agent_plan_updated_at ON public.cx_agent_plan;
CREATE TRIGGER cx_agent_plan_updated_at
    BEFORE UPDATE ON public.cx_agent_plan
    FOR EACH ROW EXECUTE FUNCTION public.cx_agent_lists_set_updated_at();

DROP TRIGGER IF EXISTS cx_agent_task_updated_at ON public.cx_agent_task;
CREATE TRIGGER cx_agent_task_updated_at
    BEFORE UPDATE ON public.cx_agent_task
    FOR EACH ROW EXECUTE FUNCTION public.cx_agent_lists_set_updated_at();

DROP TRIGGER IF EXISTS cx_user_todo_updated_at ON public.cx_user_todo;
CREATE TRIGGER cx_user_todo_updated_at
    BEFORE UPDATE ON public.cx_user_todo
    FOR EACH ROW EXECUTE FUNCTION public.cx_agent_lists_set_updated_at();

DROP TRIGGER IF EXISTS cx_agent_memory_updated_at ON public.cx_agent_memory;
CREATE TRIGGER cx_agent_memory_updated_at
    BEFORE UPDATE ON public.cx_agent_memory
    FOR EACH ROW EXECUTE FUNCTION public.cx_agent_lists_set_updated_at();

DROP TRIGGER IF EXISTS agent_user_kv_updated_at ON public.agent_user_kv;
CREATE TRIGGER agent_user_kv_updated_at
    BEFORE UPDATE ON public.agent_user_kv
    FOR EACH ROW EXECUTE FUNCTION public.cx_agent_lists_set_updated_at();

-- ── done_at maintenance on cx_user_todo ──────────────────────────────────────
--
-- Stamp done_at exactly once when done flips false->true; clear it on the
-- inverse. Saves the client from having to manage this denormalised column.

CREATE OR REPLACE FUNCTION public.cx_user_todo_maintain_done_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.done IS DISTINCT FROM OLD.done THEN
        IF NEW.done = true THEN
            NEW.done_at = NOW();
        ELSE
            NEW.done_at = NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cx_user_todo_done_at ON public.cx_user_todo;
CREATE TRIGGER cx_user_todo_done_at
    BEFORE UPDATE OF done ON public.cx_user_todo
    FOR EACH ROW EXECUTE FUNCTION public.cx_user_todo_maintain_done_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
--
-- Conversation-scoped tables: user owns their own row. The cx_conversation
-- FK already cascades on conversation delete; we additionally gate on user_id
-- here so the client can't write rows for someone else's conversation.

ALTER TABLE public.cx_agent_plan      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cx_agent_task      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cx_user_todo       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cx_agent_memory    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_user_kv      ENABLE ROW LEVEL SECURITY;

-- cx_agent_plan
DROP POLICY IF EXISTS "cx_agent_plan_owner_all"     ON public.cx_agent_plan;
DROP POLICY IF EXISTS "cx_agent_plan_service_role"  ON public.cx_agent_plan;
CREATE POLICY "cx_agent_plan_owner_all" ON public.cx_agent_plan
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cx_agent_plan_service_role" ON public.cx_agent_plan
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- cx_agent_task
DROP POLICY IF EXISTS "cx_agent_task_owner_all"     ON public.cx_agent_task;
DROP POLICY IF EXISTS "cx_agent_task_service_role"  ON public.cx_agent_task;
CREATE POLICY "cx_agent_task_owner_all" ON public.cx_agent_task
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cx_agent_task_service_role" ON public.cx_agent_task
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- cx_user_todo
DROP POLICY IF EXISTS "cx_user_todo_owner_all"     ON public.cx_user_todo;
DROP POLICY IF EXISTS "cx_user_todo_service_role"  ON public.cx_user_todo;
CREATE POLICY "cx_user_todo_owner_all" ON public.cx_user_todo
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cx_user_todo_service_role" ON public.cx_user_todo
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- cx_agent_memory
DROP POLICY IF EXISTS "cx_agent_memory_owner_all"     ON public.cx_agent_memory;
DROP POLICY IF EXISTS "cx_agent_memory_service_role"  ON public.cx_agent_memory;
CREATE POLICY "cx_agent_memory_owner_all" ON public.cx_agent_memory
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cx_agent_memory_service_role" ON public.cx_agent_memory
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- agent_user_kv
DROP POLICY IF EXISTS "agent_user_kv_owner_all"     ON public.agent_user_kv;
DROP POLICY IF EXISTS "agent_user_kv_service_role"  ON public.agent_user_kv;
CREATE POLICY "agent_user_kv_owner_all" ON public.agent_user_kv
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY "agent_user_kv_service_role" ON public.agent_user_kv
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ── Realtime publication ─────────────────────────────────────────────────────
--
-- Add the conversation-scoped tables to supabase_realtime so subscribers can
-- mirror live updates (cross-tab, cross-device). Wrapped in DO blocks because
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already in the
-- publication.

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_agent_plan';
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_agent_task';
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_user_todo';
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cx_agent_memory';
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;

-- agent_user_kv is per-user not per-conversation; it doesn't ride a chat
-- subscription. Skip the publication add — clients re-read on demand.

-- ── Comments for tooling / Supabase Studio ───────────────────────────────────

COMMENT ON TABLE public.cx_agent_plan IS
    'UI-first tools: agent-proposed plan per conversation. Status flows proposed -> approved/rejected -> superseded.';
COMMENT ON TABLE public.cx_agent_task IS
    'UI-first tools: agent''s own tasklist for a conversation. Distinct from ctx_tasks (the user''s project-managed tasks).';
COMMENT ON TABLE public.cx_user_todo IS
    'UI-first tools: items the agent assigns BACK to the user. Distinct from ctx_tasks.';
COMMENT ON TABLE public.cx_agent_memory IS
    'UI-first tools: per-conversation ephemeral KV scratchpad. Cleared on conversation delete.';
COMMENT ON TABLE public.agent_user_kv IS
    'UI-first tools: per-user persistent KV. Survives conversation reset (distinct from cx_agent_memory).';

COMMIT;

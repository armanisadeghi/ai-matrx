-- ============================================================
-- Per-Page AI Extraction System — Phase 1
-- ============================================================
-- Four tables that capture the lifecycle of running an AI integration
-- across pages of a document and persisting structured results:
--
--   page_extraction_jobs       Reusable config: agent/shortcut, schema, chunking
--   page_extraction_runs       One execution lifecycle (fan-out parent)
--   page_extraction_page_runs  One agent call (one chunk of pages)
--   page_extraction_results    One row from the parsed JSON array
--
-- All results carry (file_id, source_pages[]) so any surface that knows
-- a (cld_files.id, page_number) pair can render them. The page-number
-- space is shared by processed_document_pages.page_number and
-- file_pages.page_index+1, so no migration is required to bridge the
-- two subsystems.
--
-- Idempotent: rerunnable. Safe to re-apply.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. page_extraction_jobs — reusable integration definition
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_extraction_jobs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  file_id                 uuid NOT NULL REFERENCES public.cld_files(id) ON DELETE CASCADE,
  processed_document_id   uuid REFERENCES public.processed_documents(id) ON DELETE SET NULL,

  name                    text NOT NULL,
  description             text,

  -- One of agent_id or shortcut_id must be present.
  agent_id                uuid REFERENCES public.agx_agent(id) ON DELETE SET NULL,
  shortcut_id             uuid REFERENCES public.agx_shortcut(id) ON DELETE SET NULL,

  -- Maps surface-supplied keys (selection, content, filename, page_numbers, ...)
  -- to the agent's variable names. Example:
  --   { "selection": "page_content", "filename": "document_name" }
  variable_mapping        jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- JSON Schema for ONE result row in the parsed array.
  output_schema           jsonb NOT NULL,

  chunk_size              integer NOT NULL DEFAULT 1 CHECK (chunk_size >= 1),
  chunk_overlap           integer NOT NULL DEFAULT 0 CHECK (chunk_overlap >= 0),

  -- NULL = process every page. Array of 1-based page numbers otherwise.
  scope_pages             integer[],

  -- temperature, reasoning_effort, etc.
  model_overrides         jsonb,

  max_concurrent          integer NOT NULL DEFAULT 3 CHECK (max_concurrent >= 1 AND max_concurrent <= 20),

  owner_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id         uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  project_id              uuid REFERENCES public.ctx_projects(id) ON DELETE SET NULL,

  -- Pointer to the most recent successful run, for "default visible result set"
  latest_run_id           uuid,

  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT page_extraction_jobs_agent_or_shortcut
    CHECK (agent_id IS NOT NULL OR shortcut_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_file
  ON public.page_extraction_jobs(file_id);
CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_owner
  ON public.page_extraction_jobs(owner_id);
CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_org
  ON public.page_extraction_jobs(organization_id)
  WHERE organization_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. page_extraction_runs — one execution lifecycle
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_extraction_runs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id             uuid NOT NULL REFERENCES public.page_extraction_jobs(id) ON DELETE CASCADE,

  status             text NOT NULL DEFAULT 'queued'
                     CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),

  trigger_source     text NOT NULL DEFAULT 'manual_ui'
                     CHECK (trigger_source IN ('manual_ui', 'scheduled', 'api', 'tool_call')),
  triggered_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  chunk_count        integer NOT NULL DEFAULT 0,
  completed_chunks   integer NOT NULL DEFAULT 0,
  failed_chunks      integer NOT NULL DEFAULT 0,
  result_count       integer NOT NULL DEFAULT 0,
  total_cost         numeric(10,4) NOT NULL DEFAULT 0,
  total_tokens       integer NOT NULL DEFAULT 0,

  started_at         timestamptz,
  finished_at        timestamptz,
  error              text,
  metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_extraction_runs_job_started
  ON public.page_extraction_runs(job_id, started_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_page_extraction_runs_status
  ON public.page_extraction_runs(status)
  WHERE status IN ('queued', 'running');

-- FK from job → latest_run_id (set NULL on run delete to avoid cycles).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.page_extraction_jobs'::regclass
       AND conname  = 'page_extraction_jobs_latest_run_fk'
  ) THEN
    ALTER TABLE public.page_extraction_jobs
      ADD CONSTRAINT page_extraction_jobs_latest_run_fk
      FOREIGN KEY (latest_run_id) REFERENCES public.page_extraction_runs(id) ON DELETE SET NULL;
  END IF;
END$$;

-- ------------------------------------------------------------
-- 3. page_extraction_page_runs — one agent call per chunk
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_extraction_page_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.page_extraction_runs(id) ON DELETE CASCADE,

  -- Denormalized for query convenience and Realtime filtering.
  job_id          uuid NOT NULL REFERENCES public.page_extraction_jobs(id) ON DELETE CASCADE,
  file_id         uuid NOT NULL REFERENCES public.cld_files(id) ON DELETE CASCADE,

  chunk_index     integer NOT NULL,
  page_numbers    integer[] NOT NULL,
  page_ids        uuid[],

  status          text NOT NULL DEFAULT 'queued'
                  CHECK (status IN ('queued', 'running', 'completed', 'failed', 'skipped')),

  -- Link to aidream's per-request record (cx_user_request) when available.
  request_id      uuid,

  raw_response    text,
  parsed_payload  jsonb,
  parse_error     text,
  error           text,

  cost            numeric(10,4),
  tokens          integer,
  duration_ms     integer,

  started_at      timestamptz,
  finished_at     timestamptz,

  UNIQUE (run_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_page_extraction_page_runs_run
  ON public.page_extraction_page_runs(run_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_page_extraction_page_runs_file_status
  ON public.page_extraction_page_runs(file_id, status);
CREATE INDEX IF NOT EXISTS idx_page_extraction_page_runs_pages
  ON public.page_extraction_page_runs USING gin (page_numbers);

-- ------------------------------------------------------------
-- 4. page_extraction_results — one row per parsed array item
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.page_extraction_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  run_id          uuid NOT NULL REFERENCES public.page_extraction_runs(id) ON DELETE CASCADE,
  page_run_id     uuid NOT NULL REFERENCES public.page_extraction_page_runs(id) ON DELETE CASCADE,
  job_id          uuid NOT NULL REFERENCES public.page_extraction_jobs(id) ON DELETE CASCADE,
  file_id         uuid NOT NULL REFERENCES public.cld_files(id) ON DELETE CASCADE,

  payload         jsonb NOT NULL,
  source_pages    integer[] NOT NULL,
  canonical_page  integer,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_page_extraction_results_file_page
  ON public.page_extraction_results(file_id, canonical_page);
CREATE INDEX IF NOT EXISTS idx_page_extraction_results_job_run
  ON public.page_extraction_results(job_id, run_id);
CREATE INDEX IF NOT EXISTS idx_page_extraction_results_page_run
  ON public.page_extraction_results(page_run_id);
CREATE INDEX IF NOT EXISTS idx_page_extraction_results_pages_gin
  ON public.page_extraction_results USING gin (source_pages);

-- ------------------------------------------------------------
-- 5. updated_at trigger for jobs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.page_extraction_jobs_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_page_extraction_jobs_updated_at ON public.page_extraction_jobs;
CREATE TRIGGER trg_page_extraction_jobs_updated_at
  BEFORE UPDATE ON public.page_extraction_jobs
  FOR EACH ROW EXECUTE FUNCTION public.page_extraction_jobs_set_updated_at();

-- ------------------------------------------------------------
-- 6. Run rollup trigger — keeps page_extraction_runs counters fresh
--    as page_run rows transition status.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.page_extraction_runs_rollup()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_completed integer;
  v_failed    integer;
  v_total     integer;
  v_results   integer;
  v_cost      numeric(10,4);
  v_tokens    integer;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status = 'completed'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*),
    COALESCE(SUM(cost), 0),
    COALESCE(SUM(tokens), 0)
  INTO v_completed, v_failed, v_total, v_cost, v_tokens
  FROM public.page_extraction_page_runs
  WHERE run_id = NEW.run_id;

  SELECT COUNT(*)
    INTO v_results
    FROM public.page_extraction_results
   WHERE run_id = NEW.run_id;

  UPDATE public.page_extraction_runs
     SET completed_chunks = v_completed,
         failed_chunks    = v_failed,
         result_count     = v_results,
         total_cost       = v_cost,
         total_tokens     = v_tokens
   WHERE id = NEW.run_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_page_extraction_page_runs_rollup ON public.page_extraction_page_runs;
CREATE TRIGGER trg_page_extraction_page_runs_rollup
  AFTER INSERT OR UPDATE ON public.page_extraction_page_runs
  FOR EACH ROW EXECUTE FUNCTION public.page_extraction_runs_rollup();

-- ------------------------------------------------------------
-- 7. RLS — mirror file_analysis pattern.
--    Owner can read/write their own rows; organization members can read
--    rows for orgs they belong to. All write paths flow through the
--    aidream backend using the user's JWT (RLS-bound), so direct writes
--    from the browser are NOT supported for runs/page_runs/results.
-- ------------------------------------------------------------
ALTER TABLE public.page_extraction_jobs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_extraction_runs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_extraction_page_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_extraction_results    ENABLE ROW LEVEL SECURITY;

-- Jobs: owner full access, org members read.
DROP POLICY IF EXISTS page_extraction_jobs_owner_all ON public.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_owner_all
  ON public.page_extraction_jobs
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

DROP POLICY IF EXISTS page_extraction_jobs_org_read ON public.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_org_read
  ON public.page_extraction_jobs
  FOR SELECT
  USING (
    organization_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
       WHERE om.organization_id = page_extraction_jobs.organization_id
         AND om.user_id = auth.uid()
    )
  );

-- Runs / page_runs / results: read for anyone who can read the parent job.
DROP POLICY IF EXISTS page_extraction_runs_read ON public.page_extraction_runs;
CREATE POLICY page_extraction_runs_read
  ON public.page_extraction_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_runs.job_id
         AND (
           j.owner_id = auth.uid()
           OR (
             j.organization_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.organization_members om
                WHERE om.organization_id = j.organization_id
                  AND om.user_id = auth.uid()
             )
           )
         )
    )
  );

-- Writes from JWT context (backend uses user JWT) require owner of job.
DROP POLICY IF EXISTS page_extraction_runs_owner_write ON public.page_extraction_runs;
CREATE POLICY page_extraction_runs_owner_write
  ON public.page_extraction_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_runs.job_id
         AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_runs.job_id
         AND j.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS page_extraction_page_runs_read ON public.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_read
  ON public.page_extraction_page_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_page_runs.job_id
         AND (
           j.owner_id = auth.uid()
           OR (
             j.organization_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.organization_members om
                WHERE om.organization_id = j.organization_id
                  AND om.user_id = auth.uid()
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS page_extraction_page_runs_owner_write ON public.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_owner_write
  ON public.page_extraction_page_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_page_runs.job_id
         AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_page_runs.job_id
         AND j.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS page_extraction_results_read ON public.page_extraction_results;
CREATE POLICY page_extraction_results_read
  ON public.page_extraction_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_results.job_id
         AND (
           j.owner_id = auth.uid()
           OR (
             j.organization_id IS NOT NULL
             AND EXISTS (
               SELECT 1 FROM public.organization_members om
                WHERE om.organization_id = j.organization_id
                  AND om.user_id = auth.uid()
             )
           )
         )
    )
  );

DROP POLICY IF EXISTS page_extraction_results_owner_write ON public.page_extraction_results;
CREATE POLICY page_extraction_results_owner_write
  ON public.page_extraction_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_results.job_id
         AND j.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.page_extraction_jobs j
       WHERE j.id = page_extraction_results.job_id
         AND j.owner_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 8. Enable Realtime publication so the UI can subscribe.
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.page_extraction_runs;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.page_extraction_page_runs;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.page_extraction_results;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END$$;

COMMIT;

-- Richer project fields for PM-tool parity (applied via Supabase MCP, 2026-06-06).
-- Projects gain Status / Priority / Start date / Target date so a project is more
-- than a title — editable inline on the workspace + Manage page.
ALTER TABLE public.ctx_projects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS priority public.task_priority,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS target_date date;

ALTER TABLE public.ctx_projects DROP CONSTRAINT IF EXISTS ctx_projects_status_check;
ALTER TABLE public.ctx_projects ADD CONSTRAINT ctx_projects_status_check
  CHECK (status IN ('planning','active','paused','completed','archived'));

-- Soft-delete column for page_extraction_jobs.
--
-- "When a template is deleted, that does NOT delete the data." Templates
-- and the data they produce have independent lifecycles — a user can wipe
-- a template they no longer need while preserving every extraction result
-- it generated. The Results table query already keys on (job_id, file_id),
-- so the orphan job row stays selectable for historical lookups even after
-- it's archived from the UI.

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_active
  ON public.page_extraction_jobs(file_id, created_at DESC)
  WHERE archived_at IS NULL;

-- Push 2: validation/dedup stage.
--
-- A template is either an `extraction` (the default — per-chunk fan-out
-- that INSERTs result rows) or a `validation` template (runs once over an
-- extraction template's accumulated rows and UPDATEs them — dedup flags,
-- completeness, enrichment). The validation template's output_schema
-- columns with source='validation' define which fields get written back.
--
-- validates_job_id points at the extraction template whose rows this
-- validation template reads and updates. NULL for extraction templates.

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'extraction';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.page_extraction_jobs'::regclass
       AND conname  = 'page_extraction_jobs_kind_check'
  ) THEN
    ALTER TABLE public.page_extraction_jobs
      ADD CONSTRAINT page_extraction_jobs_kind_check
      CHECK (kind IN ('extraction', 'validation'));
  END IF;
END$$;

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS validates_job_id uuid
    REFERENCES public.page_extraction_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_validates
  ON public.page_extraction_jobs(validates_job_id)
  WHERE validates_job_id IS NOT NULL;

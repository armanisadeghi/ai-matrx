-- Add user-driven configuration columns to page_extraction_jobs.
--
-- source_variations  — JSONB array of inputs to send to the agent per chunk.
--                      Values: 'clean_text' | 'raw_text' | 'pdf_page' | future kinds.
--                      A Job's variable_mapping routes each variation key to a
--                      specific agent variable name. Default keeps existing Jobs
--                      working (cleaned text only).
--
-- chunking_strategy  — extension point for future strategies. 'pages' is the
--                      only supported value today (size-based by page count).
--                      'keyword' / 'manual' / 'section' come later.
--
-- is_saved           — distinguishes user-named Jobs (worth listing in pickers)
--                      from ephemeral ones created automatically by the run form.

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS source_variations jsonb NOT NULL DEFAULT '["clean_text"]'::jsonb;

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS chunking_strategy text NOT NULL DEFAULT 'pages';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.page_extraction_jobs'::regclass
       AND conname  = 'page_extraction_jobs_strategy_check'
  ) THEN
    ALTER TABLE public.page_extraction_jobs
      ADD CONSTRAINT page_extraction_jobs_strategy_check
      CHECK (chunking_strategy IN ('pages', 'keyword', 'manual', 'section'));
  END IF;
END$$;

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS is_saved boolean NOT NULL DEFAULT true;

UPDATE public.page_extraction_jobs
   SET is_saved = true
 WHERE is_saved IS NULL;

CREATE INDEX IF NOT EXISTS idx_page_extraction_jobs_saved
  ON public.page_extraction_jobs(owner_id, created_at DESC)
  WHERE is_saved = true;

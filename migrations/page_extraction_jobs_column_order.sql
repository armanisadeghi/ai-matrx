-- Per-dataset column ordering for the extraction review grid
-- (/knowledge/extractions/[id]). Stores an ordered array of column keys.
-- Columns derived from output_schema / inferred rows are arranged to match
-- this order; any key not listed falls back to its natural position. An
-- empty array means "use the natural order" (the default, back-compatible).

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS column_order jsonb NOT NULL DEFAULT '[]'::jsonb;

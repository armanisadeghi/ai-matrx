-- Per-template toggle: when the pdf_page source variation is active, also
-- attach ONE combined PDF of the whole chunk's pages alongside the
-- individual per-page attachments. Gives the agent continuous cross-page
-- context. Default off — per-page attachments alone are the baseline.

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS attach_combined_pdf boolean NOT NULL DEFAULT false;

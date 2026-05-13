-- extra_inputs lets a template consume the result rows of OTHER templates
-- as input variables. Shape:
--
--   [
--     { "name": "medical_findings", "source_job_id": "<uuid>" },
--     { "name": "billing_codes",    "source_job_id": "<uuid>" }
--   ]
--
-- At run time, for each entry the backend fetches every
-- page_extraction_results row for source_job_id and injects them as a
-- JSON array string under the variable named `name`. The chunk's
-- variable_mapping then routes that name to an agent variable, same
-- as any other surface value.
--
-- Per-chunk: when the source template's results carry source_pages, the
-- backend filters to results whose source_pages overlap the current
-- chunk's pages. When source_pages is empty/null, the FULL result set
-- is injected (the user is using the prior template as a doc-wide
-- reference, not a per-page lookup).

ALTER TABLE public.page_extraction_jobs
  ADD COLUMN IF NOT EXISTS extra_inputs jsonb NOT NULL DEFAULT '[]'::jsonb;

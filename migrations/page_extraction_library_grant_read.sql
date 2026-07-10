-- page_extraction_library_grant_read.sql
--
-- Extractions are children of a file / processed document. A reader admitted
-- to the file (owner, share, or Shared Knowledge grant via reachability) must
-- also see its extraction jobs/runs/results — same "access cascades down the
-- knowledge tree" law as pages and chunks. Without this, a grant reader's
-- Source Inspector Extractions tab is silently empty (owner/org-only RLS).
--
-- Additive SELECT policies only; writes stay owner/org. Idempotent.

-- Jobs: readable when the underlying file or processed document is readable.
DROP POLICY IF EXISTS page_extraction_jobs_grant_read ON docproc.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_grant_read
  ON docproc.page_extraction_jobs
  FOR SELECT
  TO authenticated
  USING (
    (file_id IS NOT NULL AND iam.has_access('file', file_id, 'viewer'::permission_level))
    OR (processed_document_id IS NOT NULL
        AND public.can_read_processed_document(processed_document_id, auth.uid()))
  );

-- Children follow the job.
DROP POLICY IF EXISTS page_extraction_runs_grant_read ON docproc.page_extraction_runs;
CREATE POLICY page_extraction_runs_grant_read
  ON docproc.page_extraction_runs
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_runs.job_id
      AND (
        (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
        OR (j.processed_document_id IS NOT NULL
            AND public.can_read_processed_document(j.processed_document_id, auth.uid()))
      )
  ));

DROP POLICY IF EXISTS page_extraction_page_runs_grant_read ON docproc.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_grant_read
  ON docproc.page_extraction_page_runs
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_page_runs.job_id
      AND (
        (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
        OR (j.processed_document_id IS NOT NULL
            AND public.can_read_processed_document(j.processed_document_id, auth.uid()))
      )
  ));

DROP POLICY IF EXISTS page_extraction_results_grant_read ON docproc.page_extraction_results;
CREATE POLICY page_extraction_results_grant_read
  ON docproc.page_extraction_results
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = page_extraction_results.job_id
      AND (
        (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
        OR (j.processed_document_id IS NOT NULL
            AND public.can_read_processed_document(j.processed_document_id, auth.uid()))
      )
  ));

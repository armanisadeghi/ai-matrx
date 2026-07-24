-- library_grant_read_file_babies.sql  (P4 / item 2)
--
-- "A grant on the container confers read on everything inside it." The docproc
-- babies (docs, pages, extraction jobs/runs/results, chunks) already admit
-- grant readers; the files.* babies did not — a grant reader admitted to the
-- AMA PDF could not see its analysis, detector results, page OCR rows,
-- annotations, entities, or RAG-job provenance, so the Analysis tab and
-- realtime channels were silently empty for exactly the audience the library
-- exists for.
--
-- Additive SELECT policies only (writes stay owner/service). Pattern:
-- migrations/page_extraction_library_grant_read.sql. Every policy delegates to
-- the ONE kernel (iam.has_access) — no hand-rolled ladders.
--
-- Also:
--   * public.can_read_extraction_job(job_id): folds the repeated
--     job-readability EXISTS used by 4 page-extraction policies into one
--     STABLE SECURITY DEFINER predicate (planner caches the sub-plan per job).
--   * docproc.derive_runs policy split: the old single FOR ALL policy used
--     `can_read OR can_curate` as its qual, which let any grant READER
--     UPDATE/DELETE derive runs. Reads stay grant-wide; writes narrow to
--     creator/curator (Decision 4: anything that spends money stays
--     owner/curator).
--   * files.structure had RLS DISABLED (0 rows, no policies) — enable it with
--     the same owner+grant read shape so the table is not silently world-open
--     when it gains rows. Writes come from the Python service role (bypasses
--     RLS), so nothing breaks.
--
-- Idempotent.

-- ---------------------------------------------------------------------------
-- 1. One job-readability predicate
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_read_extraction_job(p_job uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, docproc, iam
AS $$
  SELECT EXISTS (
    SELECT 1 FROM docproc.page_extraction_jobs j
    WHERE j.id = p_job
      AND (
        j.owner_id = auth.uid()
        OR (j.file_id IS NOT NULL AND iam.has_access('file', j.file_id, 'viewer'::permission_level))
        OR (j.processed_document_id IS NOT NULL
            AND public.can_read_processed_document(j.processed_document_id, auth.uid()))
      )
  );
$$;

COMMENT ON FUNCTION public.can_read_extraction_job(uuid) IS
  'READ gate for a page-extraction job and its children: owner, or viewer on the underlying file (kernel: iam.has_access, incl. library grants via reachability), or grant reader of the processed document. Read-only — spend/mutation gates are separate (Decision 4).';

REVOKE ALL ON FUNCTION public.can_read_extraction_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_read_extraction_job(uuid) TO authenticated, service_role;

-- Re-point the four existing grant-read policies at the predicate.
DROP POLICY IF EXISTS page_extraction_jobs_grant_read ON docproc.page_extraction_jobs;
CREATE POLICY page_extraction_jobs_grant_read
  ON docproc.page_extraction_jobs
  FOR SELECT
  TO authenticated
  USING (public.can_read_extraction_job(id));

DROP POLICY IF EXISTS page_extraction_runs_grant_read ON docproc.page_extraction_runs;
CREATE POLICY page_extraction_runs_grant_read
  ON docproc.page_extraction_runs
  FOR SELECT
  TO authenticated
  USING (public.can_read_extraction_job(job_id));

DROP POLICY IF EXISTS page_extraction_page_runs_grant_read ON docproc.page_extraction_page_runs;
CREATE POLICY page_extraction_page_runs_grant_read
  ON docproc.page_extraction_page_runs
  FOR SELECT
  TO authenticated
  USING (public.can_read_extraction_job(job_id));

DROP POLICY IF EXISTS page_extraction_results_grant_read ON docproc.page_extraction_results;
CREATE POLICY page_extraction_results_grant_read
  ON docproc.page_extraction_results
  FOR SELECT
  TO authenticated
  USING (public.can_read_extraction_job(job_id));

-- ---------------------------------------------------------------------------
-- 2. files.* babies — additive grant-aware SELECT (file viewer via the kernel)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS file_analysis_grant_read ON files.analysis;
CREATE POLICY file_analysis_grant_read
  ON files.analysis
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

DROP POLICY IF EXISTS file_analysis_result_grant_read ON files.analysis_result;
CREATE POLICY file_analysis_result_grant_read
  ON files.analysis_result
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

DROP POLICY IF EXISTS file_pages_grant_read ON files.pages;
CREATE POLICY file_pages_grant_read
  ON files.pages
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

DROP POLICY IF EXISTS file_page_annotations_grant_read ON files.page_annotations;
CREATE POLICY file_page_annotations_grant_read
  ON files.page_annotations
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

DROP POLICY IF EXISTS file_entities_grant_read ON files.entities;
CREATE POLICY file_entities_grant_read
  ON files.entities
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

DROP POLICY IF EXISTS file_rag_jobs_grant_read ON files.file_rag_jobs;
CREATE POLICY file_rag_jobs_grant_read
  ON files.file_rag_jobs
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

-- files.structure: enable RLS (was disabled, 0 rows) + same read shape.
ALTER TABLE files.structure ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE files.structure IS
  'RLS enabled 2026-07-23 (P4): SELECT = file viewer via iam.has_access; NO authenticated write policies BY DESIGN — writes come from the Python service role only.';
DROP POLICY IF EXISTS file_structure_grant_read ON files.structure;
CREATE POLICY file_structure_grant_read
  ON files.structure
  FOR SELECT
  TO authenticated
  USING (iam.has_access('file', file_id, 'viewer'::permission_level));

-- ---------------------------------------------------------------------------
-- 3. docproc.derive_runs — split the over-wide FOR ALL policy
--    (old: FOR ALL USING (can_read OR can_curate) => grant readers could write)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS derive_runs_owner_or_curator_all ON docproc.derive_runs;

DROP POLICY IF EXISTS derive_runs_read ON docproc.derive_runs;
CREATE POLICY derive_runs_read
  ON docproc.derive_runs
  FOR SELECT
  TO authenticated
  USING (
    public.can_read_processed_document(processed_document_id, auth.uid())
    OR public.can_curate_library_document(processed_document_id, auth.uid())
  );

DROP POLICY IF EXISTS derive_runs_write ON docproc.derive_runs;
CREATE POLICY derive_runs_write
  ON docproc.derive_runs
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.can_curate_library_document(processed_document_id, auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.can_curate_library_document(processed_document_id, auth.uid())
  );

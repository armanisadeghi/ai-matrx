-- based-on: public.page_extraction_clear_job_results(uuid) 75a9a3d2fd7bc18a938f42b7601c6556a98da9081bb954afe83c4d7346f09ad6
-- Delete means archive (Arman, 2026-09-27): "clear this dataset's data" used to
-- DELETE every result, page run and run of the job. It now moves the job's live
-- runs to Trash (deleted_at); the platform.soft_delete_edge cascade
-- (page_extraction_runs -> page_extraction_results, page_extraction_page_runs)
-- stamps their parts, and restoring a run from Trash restores exactly those.
-- Body is the live body with only the three DELETEs replaced. Still SECURITY
-- INVOKER: RLS applies to every statement, and an invisible job rolls it back.

CREATE OR REPLACE FUNCTION public.page_extraction_clear_job_results(p_job_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'docproc', 'public'
AS $function$
BEGIN
  UPDATE docproc.page_extraction_runs
     SET deleted_at = now()
   WHERE job_id = p_job_id
     AND deleted_at IS NULL;

  UPDATE docproc.page_extraction_jobs
     SET latest_run_id = null, updated_at = now()
   WHERE id = p_job_id;

  IF NOT FOUND THEN
    perform platform.refuse_not_found(format('extraction dataset %s is not available to this account — it may not exist, or your access may not reach it', p_job_id));
  END IF;
END;
$function$;

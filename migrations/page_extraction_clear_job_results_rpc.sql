-- page_extraction_clear_job_results — atomic "Clear data" for one extraction job.
--
-- The FE used to issue four sequential statements (delete results → delete
-- page_runs → delete runs → null latest_run_id) with no transaction; any
-- mid-sequence failure stranded the job in a corrupt state (results gone but
-- runs present, or latest_run_id pointing at a deleted run), and a clear
-- racing an active run could orphan late-arriving result rows. One
-- SECURITY INVOKER function = one transaction; RLS stays in force on every
-- statement, and an invisible/missing job row rolls the whole thing back.

create or replace function public.page_extraction_clear_job_results(p_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  delete from page_extraction_results   where job_id = p_job_id;
  delete from page_extraction_page_runs where job_id = p_job_id;
  delete from page_extraction_runs      where job_id = p_job_id;

  update page_extraction_jobs
     set latest_run_id = null,
         updated_at    = now()
   where id = p_job_id;

  if not found then
    -- Job row not visible to the caller — roll back the deletes too.
    raise exception 'page_extraction job % not found', p_job_id
      using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.page_extraction_clear_job_results(uuid) is
  'Atomically clears all results, page runs, and runs for one page-extraction job and nulls latest_run_id. SECURITY INVOKER — RLS applies.';

grant execute on function public.page_extraction_clear_job_results(uuid) to authenticated;

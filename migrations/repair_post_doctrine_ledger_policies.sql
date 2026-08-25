-- Restore the canonical ledger-policy set on three post-doctrine tables.
-- Live verification on 2026-08-25 showed no missing canonical policies; each
-- table carried only the same three legacy platform_admin_* write policies.
-- iam.apply_rls is the one policy authority and removes unexpected policies.

begin;

select iam.apply_rls('platform', 'judge_verdict', 'judge_verdict', 'ledger');
select iam.apply_rls('rag', 'ingest_run', 'rag_ingest_run', 'ledger');
select iam.apply_rls('workflow', 'run_log', 'workflow_run_log', 'ledger');

do $$
declare
  v_failure text;
begin
  select format('%s.%s: %s', schema_name, table_name, detail)
    into v_failure
    from (
      select 'platform'::text as schema_name, 'judge_verdict'::text as table_name, detail
        from iam.verify_canonical('platform', 'judge_verdict', 'judge_verdict')
       where status = 'FAIL'
      union all
      select 'rag', 'ingest_run', detail
        from iam.verify_canonical('rag', 'ingest_run', 'rag_ingest_run')
       where status = 'FAIL'
      union all
      select 'workflow', 'run_log', detail
        from iam.verify_canonical('workflow', 'run_log', 'workflow_run_log')
       where status = 'FAIL'
    ) failures
   limit 1;

  if v_failure is not null then
    raise exception 'canonical policy repair verification failed: %', v_failure;
  end if;
end $$;

commit;

-- chair-step: inverse of perf_watch_w3_d_job_durations.sql — unschedules perf-watch-jobs, drops ops.perf_job_collect and its door row, soft-deletes the job watches (their samples stay as history) and the views member@large twin, and re-pins views@large to its perf_watch_w3_a subject.
set local lock_timeout = '3s';
select cron.unschedule('perf-watch-jobs') where exists (select 1 from cron.job where jobname = 'perf-watch-jobs');
delete from platform.client_callable_door where schema_name = 'ops' and function_name = 'perf_job_collect';
drop function if exists ops.perf_job_collect();
update ops.proof_check set is_active = false, deleted_at = now() where kind = 'perf' and perf_kind = 'job' and deleted_at is null;
update ops.proof_check set is_active = false, deleted_at = now() where slug = 'door:custom.views@member@large';
update ops.proof_check
   set perf_subject = jsonb_build_object('schema', 'custom', 'function', 'views', 'argtypes', 'uuid, uuid', 'table_records', 1000,
                        'args', jsonb_build_object('p_organization_id', '57f2a22b-5875-46c6-80df-437076421c28',
                                                   'p_table_id', '3260bbbe-aaa8-4148-a4d9-7ad880e7976d'))
 where slug = 'door:custom.views@large';

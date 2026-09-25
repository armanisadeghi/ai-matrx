-- inverse of campaign/paritynightly_the_context_parity_guard_is_a_scheduled_system_job_switched_off.sql
-- Soft: the job is switched off and archived, never deleted (its run history stays readable).
set local lock_timeout = '30s';
update scheduler.sch_trigger set enabled = false, deleted_at = now(), updated_at = now()
 where id = 'b7c1e2d3-0000-4e5f-9a00-000000000973' and deleted_at is null;
update scheduler.sch_task set enabled = false, deleted_at = now(), updated_at = now()
 where id = 'a7c1e2d3-0000-4e5f-9a00-000000000973' and deleted_at is null;

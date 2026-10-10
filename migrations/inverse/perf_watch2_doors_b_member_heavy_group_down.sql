-- chair-step: inverse of perf_watch2_doors_b_member_heavy_group.sql — unschedules perf-watch-probe-member-heavy, drops ops.perf_probe_heavy_run(uuid) and archives the two heavy member door watches (samples stay as history); the shared member job then measures them again if they are re-declared without probe_group.
select cron.unschedule(jobid) from cron.job where jobname = 'perf-watch-probe-member-heavy';
drop function if exists ops.perf_probe_heavy_run(uuid);
update ops.proof_check set is_active = false, deleted_at = now()
 where kind = 'perf' and slug in ('door:public.hr_my_context@member', 'door:platform.knob_index@member');

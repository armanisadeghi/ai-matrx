-- chair-step: inverse of perf_watch2_doors_b_heavy_groups.sql — unschedules both heavy jobs, drops ops.perf_probe_heavy_group_run(text, uuid), removes probe_group from the four member doors that carried it (the shared member job then measures them again), archives door:public.get_org_file_list@titanium. Apply perf_watch2_doors_b_member_heavy_group_down.sql afterwards to drop the one-argument function.
select cron.unschedule(jobid) from cron.job where jobname in ('perf-watch-probe-member-heavy', 'perf-watch-probe-admin-heavy');
drop function if exists ops.perf_probe_heavy_group_run(text, uuid);
update ops.proof_check set perf_subject = perf_subject - 'probe_group'
 where kind = 'perf' and slug in ('door:public.agx_list_scope_counts@member', 'door:public.wfx_list_scope_counts@member', 'door:public.hr_my_context@member', 'door:platform.knob_index@member');
update ops.proof_check set is_active = false, deleted_at = now() where kind = 'perf' and slug = 'door:public.get_org_file_list@titanium';

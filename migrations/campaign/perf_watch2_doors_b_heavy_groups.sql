--
-- perf_watch2_doors_b_heavy_groups.sql
--
-- PERF-WATCH-2, DOORS-B (round 2): the heavy probe work is split across TWO groups, one per seat, because the
-- shared member group reached ~72 s of its 75 s cap after DOORS-A and the heavy doors would not fit one run.
--   member_heavy  (member seat test@test.com)  cron :09/:24/:39/:54  hr_my_context@member (3.8 s), knob_index@member
--                 (0.84 s), agx_list_scope_counts@member (~0.5 s), wfx_list_scope_counts@member (~0.3 s)
--   admin_heavy   (admin seat)                 cron :03/:18/:33/:48   door:public.get_org_file_list@titanium
--                 (organization "Titanium" f9cb3e35-..., 4.3 s a call, 114 KB; budget 1000 ms, so red until the fix)
-- ops.perf_probe_heavy_group_run(p_group, p_only_check) supersedes the one-argument ops.perf_probe_heavy_run of the previous file (left in place, unscheduled; a DROP is refused here): a clone, built
-- at apply time, of the live ops.perf_probe_group_run body whose door filter is perf_subject->>'probe_group' = p_group.
-- The shared probe functions are untouched. A door of a heavy group stays out of the shared run because the heavy run
-- measures it every 15 minutes and the shared run only takes a door older than cadence - 60 s (840 s): the heavy runs sit
-- 12-13 minutes before the shared run of the same seat. If one heavy run is skipped (DB under pressure) the shared run
-- measures the door once that quarter.
-- agx_list_scope_counts@member and wfx_list_scope_counts@member are DOORS-A's rows: only perf_subject.probe_group is added.
-- Inverse: migrations/inverse/perf_watch2_doors_b_heavy_groups_down.sql.

do $mig$
declare
  v_def text := pg_get_functiondef('ops.perf_probe_group_run(uuid,text)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'ops.perf_probe_group_run(p_only_check uuid DEFAULT NULL::uuid, p_group text DEFAULT NULL::text)',
    'ops.perf_probe_heavy_group_run(p_group text, p_only_check uuid DEFAULT NULL::uuid)');
  v_new := replace(v_new,
    $q$  if p_group is not null and p_group not in ('admin', 'member') then
    raise exception 'perf_probe_group_run: the group is admin or member, not %', p_group using errcode = '22023';
  end if;
$q$,
    $q$  if p_group is null or p_group not in ('member_heavy', 'admin_heavy') then
    raise exception 'perf_probe_heavy_group_run: the group is member_heavy or admin_heavy, not %', p_group using errcode = '22023';
  end if;
$q$);
  v_new := replace(v_new, '(p_group is null or ops.perf_probe_group(perf_subject) = p_group)', '(perf_subject->>''probe_group'' = p_group)');
  v_new := replace(v_new, '(p_group is null or ops.perf_probe_group(p.perf_subject) = p_group)', '(p.perf_subject->>''probe_group'' = p_group)');
  if position('ops.perf_probe_group(' in v_new) > 0 or position('perf_probe_heavy_group_run(p_group text' in v_new) = 0
     or position('member_heavy'', ''admin_heavy' in v_new) = 0 then
    raise exception 'perf_probe_heavy_run: the live perf_probe_group_run body changed shape; rewrite this clone by hand';
  end if;
  execute v_new;
end
$mig$;

update ops.proof_check
   set perf_subject = perf_subject || '{"probe_group":"member_heavy"}'::jsonb
 where kind = 'perf' and slug in ('door:public.agx_list_scope_counts@member', 'door:public.wfx_list_scope_counts@member');

select ops.perf_watch_declare('door:public.get_org_file_list@titanium', 'door',
  'public.get_org_file_list (big organization "Titanium", admin heavy group)',
  '{"schema":"public","function":"get_org_file_list","argtypes":"uuid, uuid","probe_group":"admin_heavy",
    "args":{"p_org_id":"f9cb3e35-2a65-4f2a-8525-088d6551071c","p_user_id":"87a6e699-3622-4869-8843-d0867456c0dd"}}'::jsonb,
  1000, 'p95', 900, 'PERF-WATCH-2', 'files');

select cron.schedule('perf-watch-probe-member-heavy', '9,24,39,54 * * * *',
  $cmd$SET statement_timeout='90s'; SET lock_timeout='1s'; SELECT ops.perf_probe_heavy_group_run('member_heavy');$cmd$);
select cron.schedule('perf-watch-probe-admin-heavy', '3,18,33,48 * * * *',
  $cmd$SET statement_timeout='90s'; SET lock_timeout='1s'; SELECT ops.perf_probe_heavy_group_run('admin_heavy');$cmd$);

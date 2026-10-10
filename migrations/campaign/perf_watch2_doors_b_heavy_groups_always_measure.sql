-- based-on: ops.perf_probe_heavy_group_run(text, uuid) 68c82493ff029ab1ab3163109a0ed90a5f34848abdc54d09c0434e2650d92cd5
--
-- perf_watch2_doors_b_heavy_groups_always_measure.sql
--
-- PERF-WATCH-2, DOORS-B: the first scheduled heavy runs (04:18 admin_heavy, 04:24 member_heavy) took 0.0 s. The heavy
-- body inherited the shared due-filter (a door only when its last_run_at is older than cadence - 60 s), and the shared
-- admin (04:15) and member (04:22) runs had measured the heavy doors first, so the heavy runs found nothing due and the
-- shared runs kept them (admin 58.5 s, member 57.7 s). A heavy group must OWN its doors: this rebuilds
-- ops.perf_probe_heavy_group_run from the live shared body again with that due-filter replaced by `true`, so the heavy run
-- measures every door of its group each run; the shared run then sees them measured 11-13 minutes earlier (younger
-- than 840 s) and leaves them alone.

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
  -- the due filter, in both the count and the loop: a heavy group owns its doors and measures them every run
  v_new := regexp_replace(v_new,
    '\(p_only_check is not null or p\.last_run_at is null\s+or p\.last_run_at <= now\(\) - make_interval\(secs => greatest\(p\.live_every_seconds - 60, 60\)\)\)',
    'true', 'g');
  if position('ops.perf_probe_group(' in v_new) > 0 or position('last_run_at <=' in v_new) > 0
     or position('perf_probe_heavy_group_run(p_group text' in v_new) = 0
     or position('member_heavy'', ''admin_heavy' in v_new) = 0 then
    raise exception 'perf_probe_heavy_group_run: the live perf_probe_group_run body changed shape; rewrite this clone by hand';
  end if;
  execute v_new;
end
$mig$;

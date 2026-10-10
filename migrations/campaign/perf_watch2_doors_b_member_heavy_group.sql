--
-- perf_watch2_doors_b_member_heavy_group.sql
--
-- PERF-WATCH-2, DOORS-B: a THIRD door-probe group, `member_heavy`, for member-seat doors too slow to share the
-- member group's 75 s wall cap (the member group already averages ~39-45 s). It does NOT touch the shared probe
-- functions (ops.perf_probe_group, ops.perf_probe_group_run, ops.perf_probe_run), which DOORS-A is editing:
--   * ops.perf_probe_heavy_run(p_only_check) is a copy of the LIVE body of ops.perf_probe_group_run, built at apply
--     time, whose door filter is perf_subject->>'probe_group' = 'member_heavy' instead of the seat group. Same seat
--     switch, rolled-back calls, reads-before-writes, empty-answer rule, wall cap, pressure skip and sample writes.
--   * cron `perf-watch-probe-member-heavy` runs it at :06/:21/:36/:51, one minute BEFORE the member job (:07/:22/...).
--     A door it just measured has last_run_at one minute old, and the shared member run only picks a door whose
--     last_run_at is older than cadence - 60 s (840 s), so the shared run leaves these two alone. If one heavy run is
--     skipped (DB under pressure), the shared member run measures them once that quarter, nothing breaks.
--   * the doors: door:public.hr_my_context@member (3.7 s a call, 351 KB) and door:platform.knob_index@member (0.83 s,
--     6 MB), budgets 300 / 1000 ms p95, fixtures pinned as in their admin twins.
-- Inverse: migrations/inverse/perf_watch2_doors_b_member_heavy_group_down.sql.

do $mig$
declare
  v_def text := pg_get_functiondef('ops.perf_probe_group_run(uuid,text)'::regprocedure);
  v_new text;
begin
  v_new := replace(v_def,
    'ops.perf_probe_group_run(p_only_check uuid DEFAULT NULL::uuid, p_group text DEFAULT NULL::text)',
    'ops.perf_probe_heavy_run(p_only_check uuid DEFAULT NULL::uuid)');
  v_new := replace(v_new,
    $q$  if p_group is not null and p_group not in ('admin', 'member') then
    raise exception 'perf_probe_group_run: the group is admin or member, not %', p_group using errcode = '22023';
  end if;
$q$, '');
  v_new := replace(v_new, '(p_group is null or ops.perf_probe_group(perf_subject) = p_group)',
                          $q$(perf_subject->>'probe_group' = 'member_heavy')$q$);
  v_new := replace(v_new, '(p_group is null or ops.perf_probe_group(p.perf_subject) = p_group)',
                          $q$(p.perf_subject->>'probe_group' = 'member_heavy')$q$);
  v_new := replace(v_new, $q$coalesce(p_group, 'all')$q$, $q$'member_heavy'$q$);
  if position('p_group' in v_new) > 0 or position('perf_probe_heavy_run' in v_new) = 0 then
    raise exception 'perf_probe_heavy_run: the live perf_probe_group_run body changed shape; rewrite this clone by hand';
  end if;
  execute v_new;
end
$mig$;

-- (no REVOKE: the runner refuses one here; the body raises 42501 for any caller that is not postgres, as the shared one does.)

select ops.perf_watch_declare('door:public.hr_my_context@member', 'door',
  'public.hr_my_context (HR context of one organization) (member seat, heavy group)',
  '{"schema":"public","function":"hr_my_context","argtypes":"uuid","seat_email":"test@test.com","probe_group":"member_heavy",
    "args":{"p_organization_id":"344cfaa8-2b0c-4971-854a-9694614816f2"}}'::jsonb,
  300, 'p95', 900, 'PERF-WATCH-2', 'hr');
select ops.perf_watch_declare('door:platform.knob_index@member', 'door',
  'platform.knob_index (whole settings index, no feature prefix) (member seat, heavy group)',
  '{"schema":"platform","function":"knob_index","argtypes":"uuid, text, uuid, boolean, jsonb, uuid","seat_email":"test@test.com","probe_group":"member_heavy",
    "args":{"p_organization_id":"884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f","p_user_id":"4060701e-706a-4c76-b3ca-0bbc69fa5a14"}}'::jsonb,
  1000, 'p95', 900, 'PERF-WATCH-2', 'settings');

select cron.schedule('perf-watch-probe-member-heavy', '6,21,36,51 * * * *',
  $cmd$SET statement_timeout='90s'; SET lock_timeout='1s'; SELECT ops.perf_probe_heavy_run();$cmd$);

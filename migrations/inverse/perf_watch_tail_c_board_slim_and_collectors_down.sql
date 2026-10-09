-- chair-step: restores the pre-tail ops.perf_watch_board body (full sample rows, no collectors or vitals sections, p_points up to 500); grants unchanged.
CREATE OR REPLACE FUNCTION ops.perf_watch_board(p_days integer DEFAULT 7, p_points integer DEFAULT 60)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_since timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 90)));
  v_points integer := greatest(2, least(coalesce(p_points, 60), 500));
  v_out jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can read performance watches.' using errcode = '42501';
  end if;

  with w as (
    select c.id, c.slug, c.label, c.owner, c.source_feature, c.is_active, c.live_every_seconds, c.perf_kind,
           c.perf_subject, c.budget_ms, c.budget_stat, c.perf_state, c.perf_state_since, c.perf_baseline_ms,
           c.perf_baseline_pinned, c.perf_last_alert_at, c.metadata
      from ops.proof_check c
     where c.kind = 'perf' and c.deleted_at is null
  ), s as (
    select x.id, x.check_id, x.measured_at, x.source, x.n, x.p50_ms, x.p95_ms, x.max_ms, x.mean_ms, x.calls,
           x.errors, x.bytes, x.release_sha, x.state_after, x.note, x.metadata,
           row_number() over (partition by x.check_id order by x.measured_at desc, x.id) as rn,
           count(*) over (partition by x.check_id) as cnt
      from ops.perf_sample x
      join w on w.id = x.check_id
     where x.deleted_at is null and x.measured_at >= v_since
  ), kept as (
    select s.* from s
     where s.rn = 1
        or coalesce((s.metadata ->> 'perf_marker')::boolean, false)
        or (s.rn - 1) % greatest(1, ceil(s.cnt::numeric / v_points)::integer) = 0
  )
  select jsonb_build_object(
           'watches', coalesce((select jsonb_agg(to_jsonb(w) order by w.slug) from w), '[]'::jsonb),
           'recent', coalesce((select jsonb_agg(to_jsonb(k) - 'rn' - 'cnt' order by k.measured_at desc, k.id) from kept k), '[]'::jsonb),
           'since', v_since,
           'points', v_points)
    into v_out;
  return v_out;
end
$function$;

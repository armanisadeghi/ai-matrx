-- chair-step: the REVOKE withdraws EXECUTE from public/anon on ops.perf_watch_board and ops.perf_watch_history, the two functions this same file creates; both are declared in platform.client_callable_door first. Nothing that existed before is narrowed. Emits no policy.
-- perf_watch_w3_j_board_reads.sql
--
-- PERFORMANCE WATCH, WAVE 3 — THE ADMIN PAGE LOADS IN ONE CALL. /administration/reporting/performance
-- read every sample of the last 7 days through PostgREST, 1,000 rows a page (~20k rows: hundreds of
-- requests in ~2 s). Two platform-admin read doors replace that:
--   ops.perf_watch_board(p_days, p_points) — every perf watch + per watch its newest sample, every marker,
--     and at most p_points evenly spaced samples of the window (the sparkline). One call.
--   ops.perf_watch_history(p_check_id, p_limit) — one watch's samples, newest first. One call.
-- Both refuse anyone who is not a platform admin (42501) before reading. New functions only: no
-- replaced body, no table, no policy.
-- Inverse: migrations/inverse/perf_watch_w3_j_board_reads_down.sql.

create function ops.perf_watch_board(p_days integer default 7, p_points integer default 60)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
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
$fn$;

comment on function ops.perf_watch_board(integer, integer) is
  'Performance watch admin page in one call: every perf watch, and per watch its newest sample, every marker and at most p_points evenly spaced samples of the last p_days. Platform admins only (42501).';

create function ops.perf_watch_history(p_check_id uuid, p_limit integer default 2000)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Only a platform admin can read performance watches.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(to_jsonb(t) order by t.measured_at desc, t.id)
      from (select x.id, x.check_id, x.measured_at, x.source, x.n, x.p50_ms, x.p95_ms, x.max_ms, x.mean_ms,
                   x.calls, x.errors, x.bytes, x.release_sha, x.state_after, x.note, x.metadata
              from ops.perf_sample x
             where x.check_id = p_check_id and x.deleted_at is null
             order by x.measured_at desc, x.id
             limit greatest(1, least(coalesce(p_limit, 2000), 20000))) t), '[]'::jsonb);
end
$fn$;

comment on function ops.perf_watch_history(uuid, integer) is
  'One performance watch''s samples, newest first, in one call (default 2,000, at most 20,000). Platform admins only (42501).';

do $grants$
declare
  f regprocedure;
begin
  foreach f in array array['ops.perf_watch_board(integer, integer)'::regprocedure,
                           'ops.perf_watch_history(uuid, integer)'::regprocedure]
  loop
    insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                               reason, declared_by, gate_predicate, signed_in_callers, anonymous_callers)
    select 'ops', p.proname, pg_get_function_identity_arguments(p.oid),
           (select coalesce(array_agg(t order by o), '{}'::oid[]) from unnest(p.proargtypes) with ordinality u(t, o)),
           'SIGNED-IN door, platform admins only: one-call read for /administration/reporting/performance (performance-watch PLAN §6). The body refuses anyone who is not a platform admin (42501) before reading; read only.',
           'matrx-frontend/migrations/campaign/perf_watch_w3_j_board_reads.sql',
           'public.is_platform_admin()', true, false
      from pg_proc p
     where p.oid = f
       and not exists (select 1 from platform.client_callable_door d
                        where d.schema_name = 'ops' and d.function_name = p.proname
                          and d.identity_args = pg_get_function_identity_arguments(p.oid));
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end
$grants$;

notify pgrst, 'reload schema';

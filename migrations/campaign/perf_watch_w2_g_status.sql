-- chair-step: the REVOKE withdraws EXECUTE from public/anon/authenticated on ops.perf_watch_status(), the function this same file creates (declared server-only in platform.client_callable_door first). Nothing that existed before is narrowed. Emits no policy.
--
-- perf_watch_w2_g_status.sql
--
-- PERFORMANCE WATCH, WAVE 2 — THE server_status LINE. Design: common-docs/systems/architecture/
-- observability/performance-watch/PLAN.md §5 ("server_status gains perf_watch: counts per state and
-- a red sentence when anything is bad"). One read for aidream's server_status tool
-- (aidream/api/mcp/agent_service/server_status_tools.py, _perf_watch_status): active watches per
-- state, each collector's last finish and age against perf.stale_after_cadences × its cadence, the
-- open perf alert rows, and the slugs of every watch in a bad state. The red sentence is built in
-- Python from these facts.
-- Inverse: migrations/inverse/perf_watch_w2_g_status_down.sql.
create or replace function ops.perf_watch_status()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with k as (select ops.perf_knobs() v),
  w as (select * from ops.proof_check where kind = 'perf' and deleted_at is null),
  coll as (
    select 'probe' name, (select max((metadata->>'perf_last_probe_at')::timestamptz) from w where perf_kind = 'door') last_at,
           coalesce((k.v->>'probe_cadence_minutes')::int, 15) cadence,
           exists (select 1 from w where perf_kind = 'door' and is_active) has_watches
      from k
    union all
    select 'statement', (select max(taken_at) from ops.perf_statement_snapshot where deleted_at is null),
           coalesce((k.v->>'statement_cadence_minutes')::int, 60),
           exists (select 1 from w where perf_kind = 'statement' and is_active)
      from k
  )
  select jsonb_build_object(
    'enabled', coalesce(((select v from k)->>'enabled')::boolean, true),
    'watches', (select count(*) from w),
    'states', (select coalesce(jsonb_object_agg(s, n), '{}'::jsonb)
                 from (select coalesce(case when is_active then perf_state else 'paused' end, 'learning') s, count(*) n from w group by 1) x),
    'bad', (select coalesce(jsonb_agg(jsonb_build_object('slug', slug, 'state', perf_state, 'since', perf_state_since,
                                                         'reason', metadata->>'perf_last_reason') order by slug), '[]'::jsonb)
              from w where is_active and perf_state in ('over_budget', 'regressed', 'erroring', 'stale', 'probe_broken')),
    'collectors', (select jsonb_object_agg(c.name, jsonb_build_object(
                       'last_finished_at', c.last_at,
                       'age_minutes', round(extract(epoch from now() - c.last_at) / 60.0, 1),
                       'cadence_minutes', c.cadence,
                       'healthy', not c.has_watches
                                  or (c.last_at is not null and c.last_at >= now() - make_interval(mins => coalesce(((select v from k)->>'stale_after_cadences')::int, 3) * c.cadence))))
                     from coll c),
    'open_alerts', (select count(*) from ops.system_error where kind = 'perf_watch_alert' and resolved_at is null),
    'screen', '/administration/reporting/performance');
$function$;

do $grants$
begin
  insert into platform.client_callable_door (schema_name, function_name, identity_args, identity_argtypes,
                                             reason, declared_by, non_client_lane, signed_in_callers, anonymous_callers)
  select 'ops', 'perf_watch_status', '', '{}'::oid[],
         'Performance watch health in one read (performance-watch PLAN §5): counts per state, collector ages, open alerts. Platform-scoped, no arguments.',
         'matrx-frontend/migrations/campaign/perf_watch_w2_g_status.sql',
         'server_only: aidream''s server_status MCP tool (service role) is the only caller; the admin screen reads the tables through platform_admin_read.',
         false, false
   where not exists (select 1 from platform.client_callable_door d
                      where d.schema_name = 'ops' and d.function_name = 'perf_watch_status' and d.identity_args = '');
  revoke all on function ops.perf_watch_status() from public, anon, authenticated;
  grant execute on function ops.perf_watch_status() to service_role;
end
$grants$;

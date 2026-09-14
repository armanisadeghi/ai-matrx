-- KI-049 follow-up (2026-09-14) — Run history is paged, filtered and findable.
--
-- THE DEFECT. `admin_list_run_history(p_limit integer)` read a fixed 50 rows,
-- newest first, with no filter and no paging. "Keep live cloud browsers
-- connected" (sch_task a7c1e2d3-…402, interval 20s) writes ~4,000 sch_run rows a
-- day (86,555 total when measured), so all 50 rows were that heartbeat, the
-- screen covered ~12 minutes, and no SEO run — nightly classification, topic
-- placement, command runs — could ever be reached. Run history is how a person
-- clicks through every AI call a run made; it was unusable for its purpose.
--
-- THE CLASS FIX (who we followed):
--   * Stripe list APIs / Temporal UI workflow list — cursor paging on a total,
--     stable order: sort_at DESC, execution_kind DESC, execution_id DESC. The
--     ORDER BY ends in the unique pair, so no row is skipped or repeated across
--     pages however many runs share a timestamp.
--   * Temporal UI + GitHub Actions — filter-first: by task/operation, run kind,
--     status group, date range, and a partial run-id search.
--   * Sentry / Datadog / the browser console — high-frequency identical noise is
--     GROUPED, never hidden: the default view shows runs that did AI work plus
--     every SEO command run, and `admin_run_history_facets` returns, per task,
--     how many runs that view leaves out, so the console renders one summary
--     row with the count that expands into exactly those runs.
--   * Page size is a knob (`marketing.run_console` / `run_history_page_size`),
--     resolved here — never a constant in the client.
--
-- Replaces the old signature outright (no legacy twin): its door row goes with it.

drop function if exists public.admin_list_run_history(integer);

delete from platform.client_callable_door
 where schema_name = 'public'
   and function_name = 'admin_list_run_history'
   and identity_args = 'p_limit integer';

-- ── The page-size knob ──────────────────────────────────────────────────────
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value,
   label, description, set_by, basis, review_due, overridable_by,
   override_direction, taxonomy_node_id, propagation)
select
  'marketing.run_console', 'run_history_page_size', '50'::jsonb, '50'::jsonb,
  'integer', 'runs', 10, 200,
  'Runs per page in Run history',
  'How many runs the Run history tab of the SEO run console reads at a time. Load more reads the next page of the same filtered view.',
  'agent',
  'Set 2026-09-14 while fixing the unreachable Run history. 50 rows fill roughly two screens of the dense list and the paged read measured 15 ms (default view) to 90 ms (every run, 233k scheduler rows) on live volume, so a larger page costs little; 200 is the ceiling so one page never renders an unbounded list. Arman has NOT reviewed this number.',
  current_date + 60, '{}'::text[], 'any',
  (select taxonomy_node_id from platform.feature_knob
    where feature = 'seo.rank_tracking' and key = 'max_history_points'),
  'next_load'
on conflict (feature, key) do update
  set label = excluded.label,
      description = excluded.description,
      basis = excluded.basis,
      min_value = excluded.min_value,
      max_value = excluded.max_value,
      unit = excluded.unit,
      updated_at = now();

-- ── The paged, filtered read ────────────────────────────────────────────────
create function public.admin_list_run_history(
  p_cursor_at timestamptz default null,
  p_cursor_kind text default null,
  p_cursor_id uuid default null,
  p_kinds text[] default null,
  p_task_id uuid default null,
  p_operation text default null,
  p_status_groups text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_run_id text default null,
  p_activity text default 'ai'
)
returns table(
  source text,
  execution_kind text,
  execution_id uuid,
  task_id uuid,
  operation text,
  label text,
  detail text,
  sort_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  status text,
  status_group text,
  summary text,
  error_text text,
  ai_call_count bigint,
  total_cost numeric,
  total_tokens bigint,
  has_more boolean
)
language plpgsql
stable
security definer
set search_path to 'public', 'scheduler', 'seo', 'chat', 'platform', 'pg_temp'
as $function$
#variable_conflict use_column
declare
  v_page integer;
  v_run_id text := nullif(lower(btrim(coalesce(p_run_id, ''))), '');
  v_activity text := coalesce(p_activity, 'ai');
begin
  if not public.is_platform_admin() then
    raise exception 'admin_list_run_history: admin only';
  end if;
  if v_activity not in ('ai', 'all') then
    raise exception 'admin_list_run_history: p_activity must be ai or all, got %', v_activity;
  end if;
  if p_kinds is not null and not (p_kinds <@ array['sch_run', 'seo_collection_run']) then
    raise exception 'admin_list_run_history: unknown run kind in %', p_kinds;
  end if;
  if p_status_groups is not null
     and not (p_status_groups <@ array['succeeded', 'failed', 'interrupted', 'running', 'other']) then
    raise exception 'admin_list_run_history: unknown status group in %', p_status_groups;
  end if;
  if not ((p_cursor_at is null and p_cursor_kind is null and p_cursor_id is null)
       or (p_cursor_at is not null and p_cursor_kind is not null and p_cursor_id is not null)) then
    raise exception 'admin_list_run_history: a cursor is all of p_cursor_at, p_cursor_kind, p_cursor_id or none of them';
  end if;
  if v_run_id is not null and v_run_id !~ '^[0-9a-f-]{4,36}$' then
    raise exception 'admin_list_run_history: a run id search needs at least 4 characters of the id (0-9, a-f, -)';
  end if;

  select (platform.knob_resolve('marketing.run_console', 'run_history_page_size', null) #>> '{}')::integer
    into v_page;
  if v_page is null or v_page < 1 then
    raise exception 'admin_list_run_history: knob marketing.run_console/run_history_page_size is missing — seed it (migrations/run_console_run_history_paged_filtered.sql)';
  end if;

  return query
  with ai_runs as (
    select cr.execution_kind as k, cr.execution_id as id,
           count(*)::bigint as n, sum(cr.cost)::numeric as cost,
           sum(cr.total_tokens)::bigint as tokens
      from chat.request cr
     where cr.deleted_at is null
       and cr.execution_id is not null
       and cr.execution_kind in ('sch_run', 'seo_collection_run')
     group by cr.execution_kind, cr.execution_id
  ),
  sch as (
    select 'sch_run'::text as src, 'sch_run'::text as kind, r.id as rid, r.task_id as tid,
           null::text as op, coalesce(t.title, 'Scheduled task') as lbl, r.surface as det,
           coalesce(r.finished_at, r.started_at, r.due_at) as sat,
           r.started_at as sta, r.finished_at as fin, r.status as st,
           r.result_summary as summ, r.error_message as err
      from scheduler.sch_run r
      left join scheduler.sch_task t on t.id = r.task_id
     where (p_kinds is null or 'sch_run' = any(p_kinds))
       and p_operation is null
       and (p_task_id is null or r.task_id = p_task_id)
       and (p_from is null or coalesce(r.finished_at, r.started_at, r.due_at) >= p_from)
       and (p_to is null or coalesce(r.finished_at, r.started_at, r.due_at) < p_to)
       and (v_run_id is null or r.id::text like '%' || v_run_id || '%')
       -- The default view: runs that did AI work. A run-id search or a task
       -- filter the person chose is never narrowed by it.
       and (v_run_id is not null or p_task_id is not null or v_activity = 'all'
            or exists (select 1 from ai_runs a where a.k = 'sch_run' and a.id = r.id))
  ),
  coll as (
    select 'collection_run'::text, 'seo_collection_run'::text, c.id, null::uuid,
           c.operation, coalesce(c.operation, 'SEO command'), c.target_ref,
           coalesce(c.completed_at, c.started_at, c.requested_at),
           c.started_at, c.completed_at, c.status,
           null::text, (c.error ->> 'message')
      from seo.collection_run c
     where c.provider = 'aidream'
       and (p_kinds is null or 'seo_collection_run' = any(p_kinds))
       and p_task_id is null
       and (p_operation is null or c.operation = p_operation)
       and (p_from is null or coalesce(c.completed_at, c.started_at, c.requested_at) >= p_from)
       and (p_to is null or coalesce(c.completed_at, c.started_at, c.requested_at) < p_to)
       and (v_run_id is null or c.id::text like '%' || v_run_id || '%')
  ),
  merged as (
    select m.*,
           case
             when lower(m.st) in ('success', 'succeeded', 'completed', 'complete', 'done') then 'succeeded'
             when lower(m.st) in ('failed', 'error', 'errored') then 'failed'
             when lower(m.st) in ('abandoned', 'cancelled', 'canceled', 'interrupted', 'timed_out', 'timeout', 'expired', 'lease_expired') then 'interrupted'
             when lower(m.st) in ('queued', 'claimed', 'running', 'pending', 'processing', 'in_progress', 'started') then 'running'
             else 'other'
           end as sg
      from (select * from sch union all select * from coll) m
  ),
  page as (
    select g.*
      from merged g
     where (p_status_groups is null or g.sg = any(p_status_groups))
       and (p_cursor_at is null
            or (g.sat, g.kind, g.rid) < (p_cursor_at, p_cursor_kind, p_cursor_id))
     order by g.sat desc, g.kind desc, g.rid desc
     limit v_page + 1
  ),
  numbered as (
    select p.*,
           row_number() over (order by p.sat desc, p.kind desc, p.rid desc) as rn,
           count(*) over () as fetched
      from page p
  )
  select n.src, n.kind, n.rid, n.tid, n.op, n.lbl, n.det, n.sat, n.sta, n.fin,
         case when n.sta is not null and n.fin is not null
              then (extract(epoch from (n.fin - n.sta)) * 1000)::bigint end,
         n.st, n.sg, n.summ, n.err,
         coalesce(a.n, 0)::bigint, coalesce(a.cost, 0)::numeric, coalesce(a.tokens, 0)::bigint,
         (n.fetched > v_page)
    from numbered n
    left join ai_runs a on a.k = n.kind and a.id = n.rid
   where n.rn <= v_page
   order by n.sat desc, n.kind desc, n.rid desc;
end;
$function$;

comment on function public.admin_list_run_history(timestamptz, text, uuid, text[], uuid, text, text[], timestamptz, timestamptz, text, text) is
  'KI-049 Run Console: one page of scheduler.sch_run + seo.collection_run (aidream) runs with AI-call rollups. Stable cursor (sort_at, execution_kind, execution_id), filters by kind/task/operation/status group/date/partial run id; p_activity=ai (default) keeps runs that made AI calls plus every SEO command run. Page size = knob marketing.run_console/run_history_page_size. Admin-gated.';

-- ── What the current view leaves out, per task — the grouped noise ─────────
create function public.admin_run_history_facets(
  p_kinds text[] default null,
  p_status_groups text[] default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table(
  execution_kind text,
  task_id uuid,
  operation text,
  label text,
  run_count bigint,
  ai_run_count bigint,
  quiet_count bigint,
  failed_count bigint,
  last_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public', 'scheduler', 'seo', 'chat', 'pg_temp'
as $function$
#variable_conflict use_column
begin
  if not public.is_platform_admin() then
    raise exception 'admin_run_history_facets: admin only';
  end if;
  if p_kinds is not null and not (p_kinds <@ array['sch_run', 'seo_collection_run']) then
    raise exception 'admin_run_history_facets: unknown run kind in %', p_kinds;
  end if;
  if p_status_groups is not null
     and not (p_status_groups <@ array['succeeded', 'failed', 'interrupted', 'running', 'other']) then
    raise exception 'admin_run_history_facets: unknown status group in %', p_status_groups;
  end if;

  return query
  with ai_runs as (
    select distinct cr.execution_kind as k, cr.execution_id as id
      from chat.request cr
     where cr.deleted_at is null
       and cr.execution_id is not null
       and cr.execution_kind in ('sch_run', 'seo_collection_run')
  ),
  runs as (
    select 'sch_run'::text as kind, r.task_id as tid, null::text as op,
           coalesce(t.title, 'Scheduled task') as lbl,
           coalesce(r.finished_at, r.started_at, r.due_at) as sat, r.status as st,
           (a.id is not null) as has_ai
      from scheduler.sch_run r
      left join scheduler.sch_task t on t.id = r.task_id
      left join ai_runs a on a.k = 'sch_run' and a.id = r.id
     where (p_kinds is null or 'sch_run' = any(p_kinds))
       and (p_from is null or coalesce(r.finished_at, r.started_at, r.due_at) >= p_from)
       and (p_to is null or coalesce(r.finished_at, r.started_at, r.due_at) < p_to)
    union all
    select 'seo_collection_run'::text, null::uuid, c.operation,
           coalesce(c.operation, 'SEO command'),
           coalesce(c.completed_at, c.started_at, c.requested_at), c.status,
           (a.id is not null)
      from seo.collection_run c
      left join ai_runs a on a.k = 'seo_collection_run' and a.id = c.id
     where c.provider = 'aidream'
       and (p_kinds is null or 'seo_collection_run' = any(p_kinds))
       and (p_from is null or coalesce(c.completed_at, c.started_at, c.requested_at) >= p_from)
       and (p_to is null or coalesce(c.completed_at, c.started_at, c.requested_at) < p_to)
  ),
  grouped as (
    select x.*,
           case
             when lower(x.st) in ('success', 'succeeded', 'completed', 'complete', 'done') then 'succeeded'
             when lower(x.st) in ('failed', 'error', 'errored') then 'failed'
             when lower(x.st) in ('abandoned', 'cancelled', 'canceled', 'interrupted', 'timed_out', 'timeout', 'expired', 'lease_expired') then 'interrupted'
             when lower(x.st) in ('queued', 'claimed', 'running', 'pending', 'processing', 'in_progress', 'started') then 'running'
             else 'other'
           end as sg
      from runs x
  )
  select g.kind, g.tid, g.op, max(g.lbl),
         count(*)::bigint,
         count(*) filter (where g.has_ai)::bigint,
         -- Only scheduled runs are left out of the default view; every SEO
         -- command run is always shown, so a command operation never has quiet runs.
         count(*) filter (where not g.has_ai and g.kind = 'sch_run')::bigint,
         count(*) filter (where g.sg in ('failed', 'interrupted'))::bigint,
         max(g.sat)
    from grouped g
   where p_status_groups is null or g.sg = any(p_status_groups)
   group by g.kind, g.tid, g.op
   order by count(*) desc;
end;
$function$;

comment on function public.admin_run_history_facets(text[], text[], timestamptz, timestamptz) is
  'KI-049 Run Console: per task (scheduled) or operation (SEO command) run counts for the Run history filters — total, with AI calls, quiet (left out of the default view), failed/interrupted, latest. Admin-gated.';

-- ── Doors BEFORE the grants (DB-wide guard revokes an undeclared client EXECUTE) ──
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason, anonymous_callers, anonymous_purpose)
values
  ('public', 'admin_list_run_history',
   'p_cursor_at timestamp with time zone, p_cursor_kind text, p_cursor_id uuid, p_kinds text[], p_task_id uuid, p_operation text, p_status_groups text[], p_from timestamp with time zone, p_to timestamp with time zone, p_run_id text, p_activity text',
   'KI-049 run history paging (2026-09-14)',
   'SIGNED-IN door (authenticated only). Run console Run history page read; body refuses anyone who is not a platform admin (public.is_platform_admin()).',
   false, null),
  ('public', 'admin_run_history_facets',
   'p_kinds text[], p_status_groups text[], p_from timestamp with time zone, p_to timestamp with time zone',
   'KI-049 run history paging (2026-09-14)',
   'SIGNED-IN door (authenticated only). Run console Run history filter facets and grouped quiet-run counts; body refuses anyone who is not a platform admin (public.is_platform_admin()).',
   false, null)
on conflict do nothing;

revoke execute on function public.admin_list_run_history(timestamptz, text, uuid, text[], uuid, text, text[], timestamptz, timestamptz, text, text) from public, anon;
revoke execute on function public.admin_run_history_facets(text[], text[], timestamptz, timestamptz) from public, anon;
grant execute on function public.admin_list_run_history(timestamptz, text, uuid, text[], uuid, text, text[], timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.admin_run_history_facets(text[], text[], timestamptz, timestamptz) to authenticated;

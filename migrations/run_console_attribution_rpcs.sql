-- KI-049 — Run Console: run history + per-run AI call detail.
--
-- Arman's requirement: "if we made fifty AI calls, I need to be able to click
-- through them one by one and see what they generated." Two admin-gated
-- SECURITY DEFINER RPCs, same pattern as the other admin reads
-- (public.is_platform_admin() guard, no RLS on the underlying attribution
-- read since chat.request/scheduler.sch_run/seo.collection_run carry no
-- per-caller ownership relevant to an admin console):
--
--   1. admin_list_run_history — recent runs merged from scheduler.sch_run
--      (join sch_task) and seo.collection_run (provider='aidream'), each
--      annotated with the AI-call count/cost/tokens rolled up from
--      chat.request via the execution_kind/execution_id attribution stamped
--      by aidream (KI-049 attribution fix, 2026-08-25: sch_run + seo
--      collection commands now stamp chat.request.execution_kind/
--      execution_id the same way workflow_run already did).
--
--   2. admin_list_run_ai_calls — every chat.request row for one run, joined
--      to chat.request_snapshot for the actual prompt/output TEXT (never
--      persisted to chat.message for these internal/system_run calls —
--      request_snapshot is the only place the generated content survives).
--
-- Idempotent (CREATE OR REPLACE).

create or replace function public.admin_list_run_history(p_limit integer default 50)
returns table(
  source text,
  execution_kind text,
  execution_id uuid,
  label text,
  detail text,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  status text,
  summary text,
  error_text text,
  ai_call_count bigint,
  total_cost numeric,
  total_tokens bigint
)
language plpgsql
stable
security definer
set search_path to 'public', 'scheduler', 'seo', 'chat', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'admin_list_run_history: admin only';
  end if;

  return query
  with sch as (
    select
      'sch_run'::text as source,
      'sch_run'::text as execution_kind,
      r.id as execution_id,
      coalesce(t.title, 'Scheduled task') as label,
      r.surface as detail,
      r.started_at,
      r.finished_at,
      case when r.started_at is not null and r.finished_at is not null
        then (extract(epoch from (r.finished_at - r.started_at)) * 1000)::bigint
        else null end as duration_ms,
      r.status,
      r.result_summary as summary,
      r.error_message as error_text
    from scheduler.sch_run r
    left join scheduler.sch_task t on t.id = r.task_id
    order by coalesce(r.finished_at, r.started_at, r.due_at) desc
    limit p_limit
  ),
  seo_runs as (
    select
      'collection_run'::text as source,
      'seo_collection_run'::text as execution_kind,
      c.id as execution_id,
      coalesce(c.operation, 'SEO command') as label,
      c.target_ref as detail,
      c.started_at,
      c.completed_at as finished_at,
      case when c.started_at is not null and c.completed_at is not null
        then (extract(epoch from (c.completed_at - c.started_at)) * 1000)::bigint
        else null end as duration_ms,
      c.status,
      null::text as summary,
      (c.error ->> 'message') as error_text
    from seo.collection_run c
    where c.provider = 'aidream'
    order by coalesce(c.completed_at, c.started_at, c.requested_at) desc
    limit p_limit
  ),
  merged as (
    select * from sch
    union all
    select * from seo_runs
  ),
  calls as (
    select
      cr.execution_kind,
      cr.execution_id,
      count(*)::bigint as ai_call_count,
      sum(cr.cost)::numeric as total_cost,
      sum(cr.total_tokens)::bigint as total_tokens
    from chat.request cr
    where cr.deleted_at is null
      and cr.execution_kind in ('sch_run', 'seo_collection_run')
    group by cr.execution_kind, cr.execution_id
  )
  select
    m.source, m.execution_kind, m.execution_id, m.label, m.detail,
    m.started_at, m.finished_at, m.duration_ms, m.status, m.summary, m.error_text,
    coalesce(c.ai_call_count, 0) as ai_call_count,
    coalesce(c.total_cost, 0) as total_cost,
    coalesce(c.total_tokens, 0) as total_tokens
  from merged m
  left join calls c
    on c.execution_kind = m.execution_kind and c.execution_id = m.execution_id
  order by coalesce(m.finished_at, m.started_at) desc nulls last
  limit p_limit;
end;
$function$;

comment on function public.admin_list_run_history(integer) is
  'KI-049 Run Console: recent scheduler.sch_run + seo.collection_run rows with AI-call rollups from chat.request. Admin-gated.';

create or replace function public.admin_list_run_ai_calls(
  p_execution_kind text,
  p_execution_id uuid
)
returns table(
  id uuid,
  conversation_id uuid,
  iteration smallint,
  model text,
  status text,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  cost numeric,
  api_duration_ms integer,
  total_duration_ms integer,
  created_at timestamptz,
  prompt_text text,
  output_text text,
  error jsonb
)
language plpgsql
stable
security definer
set search_path to 'public', 'chat', 'pg_temp'
as $function$
begin
  if not public.is_platform_admin() then
    raise exception 'admin_list_run_ai_calls: admin only';
  end if;
  if p_execution_kind is null or p_execution_id is null then
    raise exception 'admin_list_run_ai_calls: execution_kind and execution_id are required';
  end if;

  return query
  select
    r.id,
    r.conversation_id,
    r.iteration,
    coalesce(s.model, s.unified_payload -> 'config' ->> 'model') as model,
    r.status,
    r.input_tokens,
    r.output_tokens,
    r.total_tokens,
    r.cost,
    r.api_duration_ms,
    r.total_duration_ms,
    r.created_at,
    (
      select t.elem -> 'content' -> 0 ->> 'text'
      from jsonb_array_elements(
        coalesce(s.unified_payload -> 'config' -> 'messages', '[]'::jsonb)
      ) with ordinality as t(elem, ord)
      where t.elem ->> 'role' = 'user'
      order by t.ord desc
      limit 1
    ) as prompt_text,
    (
      select t.elem -> 'content' -> 0 ->> 'text'
      from jsonb_array_elements(
        coalesce(s.response_payload -> 'messages', '[]'::jsonb)
      ) as t(elem)
      where t.elem ->> 'role' = 'assistant'
      limit 1
    ) as output_text,
    r.error
  from chat.request r
  left join chat.request_snapshot s on s.cx_request_id = r.id
  where r.execution_kind = p_execution_kind
    and r.execution_id = p_execution_id
    and r.deleted_at is null
  order by r.created_at asc;
end;
$function$;

comment on function public.admin_list_run_ai_calls(text, uuid) is
  'KI-049 Run Console detail: every chat.request row for one attributed run, with prompt/output text recovered from chat.request_snapshot. Admin-gated.';

grant execute on function public.admin_list_run_history(integer) to authenticated;
grant execute on function public.admin_list_run_ai_calls(text, uuid) to authenticated;

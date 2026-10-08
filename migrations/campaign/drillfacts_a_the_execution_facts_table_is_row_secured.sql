-- draft: DRILL-FACTS rehearsal on the clone not finished
-- chair-step: lane DRILL-FACTS — CREATES the server-only table runtime._ai_usage_execution_facts (one row per ledger execution holding every column runtime._ai_usage_calls derives today: Cube's pre-aggregation at execution grain), registers it as System machinery (token ai_usage_execution_facts), revokes it from every client role and switches its row security on, and CREATES the view runtime._ai_usage_calls_live — the CURRENT body of runtime._ai_usage_calls, verbatim, under a new name: the one rules source the facts are filled from. Nothing is replaced, nothing of anybody's data is read into the new table (the fill is its own file), and no live table is locked beyond ACCESS SHARE. Switching row security on fires the event trigger admin_read_follows_rls, whose CREATE POLICY takes ACCESS EXCLUSIVE on 16 auth, 5 storage and 2 realtime relations until COMMIT — so this file is tiny, row security is its LAST statement, and it is applied in the 01:00–04:00 PT window.
-- lane: DRILL-FACTS
-- lock: platform
--
-- WHY. Every usage question that reads runtime._ai_usage_calls (the drill definition
-- ai_usage_executions, the records behind every ai_usage number) re-derives each execution's
-- request-level columns per row: the request's top-billing model and its provider (a GROUP BY over
-- chat.request per row), whether the execution is its request's first (an EXISTS per column), the
-- conversation and person out of the execution's context. Measured on the clone (2026-10-08): a plain
-- GROUP BY model over 30 days, 5.7 s. Those columns change only when the ledger changes, and the ledger
-- is already re-read on a schedule (runtime.ai_usage_hourly_refresh, every 10 minutes for 48 hours and
-- nightly for 35 days). So the derived row is stored once per execution by that same refresh, under the
-- same advisory lock and watermark, and the view reads it (drillfacts_c_…).
--
-- APPLY ORDER: this file, then drillfacts_b_the_execution_facts_are_filled.sql (autocommit, from
-- aidream), then drillfacts_c_usage_is_counted_from_the_execution_facts.sql.
-- INVERSE: migrations/inverse/drillfacts_a_the_execution_facts_table_is_row_secured_down.sql

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. THE RULES, UNDER THEIR OWN NAME — runtime._ai_usage_calls' body as it is on production
--    (drillserver2_a_usage_record_checks_its_ids_without_a_pattern.sql), verbatim. The refresh fills
--    the facts from it, and runtime._ai_usage_calls reads it for the executions the facts have not
--    counted yet (after the watermark). Same security_invoker, no client grant.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create view runtime._ai_usage_calls_live with (security_invoker = true) as
select
  e.id                                                                    as execution_id,
  e.created_at,
  date_trunc('hour', e.created_at, 'UTC')                                 as bucket,
  date_bin('10 minutes', e.created_at, timestamptz '2000-01-01 00:00:00+00') as bucket_10m,
  e.organization_id,
  coalesce(ur.created_by,
           case when pg_input_is_valid((e.context ->> 'user_id'), 'uuid') then (e.context ->> 'user_id')::uuid end) as person_id,
  coalesce(ur.agent_id,
           case when pg_input_is_valid((e.context ->> 'agent_id'), 'uuid') then (e.context ->> 'agent_id')::uuid end) as agent_id,
  -- the request's top model and its provider: the one that billed the most of the request (ties
  -- broken by name, so every read agrees). Scalar subqueries, not a join, so a read that does not
  -- show them (a count, a sum of cost) never computes them.
  (select coalesce(r.provider, 'unknown')
     from chat.request r left join ai.model_definition md on md.id = r.ai_model_id
    where r.user_request_id = ur.id and r.deleted_at is null
    group by coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    order by sum(r.cost) desc nulls last, coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    limit 1)                                                                   as provider,
  (select coalesce(md.name, r.ai_model_id::text, 'unknown')
     from chat.request r left join ai.model_definition md on md.id = r.ai_model_id
    where r.user_request_id = ur.id and r.deleted_at is null
    group by coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    order by sum(r.cost) desc nulls last, coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    limit 1)                                                                   as model,
  coalesce(nullif(ur.source_app, ''), 'aidream')                          as app,
  coalesce(nullif(ur.source_feature, ''), nullif(e.context ->> 'agent_run_label', ''), e.link_kind, e.type) as feature,
  coalesce(ur.origin_class, case e.link_kind when 'sch_run' then 'scheduled' when 'internal_agent_run' then 'child_agent' else 'system' end) as origin,
  case when coalesce(ur.origin_class, '') in ('human', 'api') then 'manual' else 'automated' end as trigger,
  coalesce(e.link_kind, e.type)                                           as source,
  coalesce(e.cost, 0)                                                     as cost,
  1::bigint                                                               as calls,
  (case when e.cost > 0 then 1 else 0 end)::bigint                        as paid_calls,
  (case when ur.id is null then 0
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then 1
        else 0 end)::bigint                                               as requests,
  (case when ur.id is null then coalesce((e.meters ->> 'input_tokens')::bigint, 0)
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then coalesce(ur.total_input_tokens, 0)
        else 0 end)::bigint                                               as tokens_in,
  (case when ur.id is null then coalesce((e.meters ->> 'cached_tokens')::bigint, 0)
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then coalesce(ur.total_cached_tokens, 0)
        else 0 end)::bigint                                               as tokens_cached,
  (case when ur.id is null then coalesce((e.meters ->> 'output_tokens')::bigint, 0)
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then coalesce(ur.total_output_tokens, 0)
        else 0 end)::bigint                                               as tokens_out,
  (case when ur.id is null then 0
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id)))
        then (select count(*) from chat.request r where r.user_request_id = ur.id and r.deleted_at is null and r.cost is null)
        else 0 end)::bigint                                               as unpriced_calls,
  ur.id                                                                   as request_id,
  case when e.link_kind = 'conversation' and pg_input_is_valid(e.link_id, 'uuid') then e.link_id::uuid
       when pg_input_is_valid((e.context ->> 'conversation_id'), 'uuid') then (e.context ->> 'conversation_id')::uuid end as conversation_id,
  ur.metadata -> 'jwt_claims' ->> 'session_id'                            as session_id,
  coalesce(ur.status in ('failed', 'abandoned') or ur.finish_reason = 'max_tokens', false) as got_nothing_back,
  (case when ur.id is null then 0
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then coalesce(ur.iterations, 0)
        else 0 end)::integer                                              as iterations,
  case when e.type = 'conversation' then (select coalesce(md.name, r.ai_model_id::text, 'unknown')
     from chat.request r left join ai.model_definition md on md.id = r.ai_model_id
    where r.user_request_id = ur.id and r.deleted_at is null
    group by coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    order by sum(r.cost) desc nulls last, coalesce(md.name, r.ai_model_id::text, 'unknown'), coalesce(r.provider, 'unknown')
    limit 1) end as call_model,
  ur.id is not null                                                       as has_request,
  ur.finish_reason                                                        as finish_reason,
  (case when ur.id is null then 0
        when not exists (select 1 from runtime.global_execution e2
                          where e2.request_id = e.request_id
                            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id))) then coalesce(ur.total_tool_calls, 0)
        else 0 end)::integer                                              as tool_calls
from runtime.global_execution e
left join chat.user_request ur on ur.id = e.request_id;

revoke all on runtime._ai_usage_calls_live from public, anon, authenticated;
comment on view runtime._ai_usage_calls_live is
  'DRILL-FACTS: the ONE rules source of AI usage at execution grain, computed live from runtime.global_execution + chat.user_request + chat.request (the rules public.admin_spend_breakdown hand-writes: the person is the request''s author else the context user, the model is the one that billed the most of its request, a request''s tokens, iterations, tool calls and request count belong to its first execution). runtime.ai_usage_hourly_refresh stores it into runtime._ai_usage_execution_facts; runtime._ai_usage_calls reads those facts up to the watermark and this view after it. Server-only.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. THE FACTS — one row per execution, every column of the rules view, exactly its types.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create table runtime._ai_usage_execution_facts (
  execution_id     uuid        primary key,
  created_at       timestamptz not null,
  bucket           timestamptz not null,
  bucket_10m       timestamptz not null,
  organization_id  uuid        not null,
  person_id        uuid,
  agent_id         uuid,
  provider         text,
  model            character varying,
  app              text        not null,
  feature          text,
  origin           text        not null,
  trigger          text        not null,
  source           text,
  cost             numeric     not null,
  calls            bigint      not null,
  paid_calls       bigint      not null,
  requests         bigint      not null,
  tokens_in        bigint      not null,
  tokens_cached    bigint      not null,
  tokens_out       bigint      not null,
  unpriced_calls   bigint      not null,
  request_id       uuid,
  conversation_id  uuid,
  session_id       text,
  got_nothing_back boolean     not null,
  iterations       integer     not null,
  call_model       character varying,
  has_request      boolean     not null,
  finish_reason    text,
  tool_calls       integer     not null,
  refreshed_at     timestamptz not null default now()
);
-- the page's questions: a window (platform lane), an organization's window, a person's window,
-- one conversation's executions (a drilled conversation), one request's executions
create index _ai_usage_execution_facts_created_at_idx   on runtime._ai_usage_execution_facts (created_at);
create index _ai_usage_execution_facts_org_at_idx       on runtime._ai_usage_execution_facts (organization_id, created_at);
create index _ai_usage_execution_facts_person_at_idx    on runtime._ai_usage_execution_facts (person_id, created_at);
create index _ai_usage_execution_facts_conv_at_idx      on runtime._ai_usage_execution_facts (conversation_id, created_at) where conversation_id is not null;
create index _ai_usage_execution_facts_request_idx      on runtime._ai_usage_execution_facts (request_id) where request_id is not null;

revoke all on runtime._ai_usage_execution_facts from public, anon, authenticated;
comment on table runtime._ai_usage_execution_facts is
  'DRILL-FACTS: AI usage, one row per ledger execution, every column runtime._ai_usage_calls_live derives (Cube pre-aggregation at execution grain). Written only by runtime.ai_usage_hourly_refresh under its advisory lock (every 10 minutes for 48 hours, nightly for 35 days, and a platform admin''s Recount), in the same transaction as the hourly rollup it is summed into and the watermark that says how far both have counted. Read through runtime._ai_usage_calls (registry token ai_usage_executions) by the drill door''s definer step. Server-only.';

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'ai_usage_execution_facts', 'runtime', '_ai_usage_execution_facts', 'AI usage by execution (counted)', 1, false, false, true,
  'One row per AI usage ledger execution with its derived columns; read through runtime._ai_usage_calls (token ai_usage_executions).',
  false, false, false, 'system', false, 'machinery',
  'A derived copy of runtime._ai_usage_calls_live written only by runtime.ai_usage_hourly_refresh; never written by a person or a client.',
  'table', 'organization',
  'System machinery with no client lane; read only through the drill door''s definer step with each lane''s rule compiled in.',
  'organization', 'standard', 'system',
  'Lane DRILL-FACTS: the AI usage records stored at execution grain so every usage question reads stored rows.',
  false, false, 'runtime._ai_usage_execution_facts'::regclass
)
on conflict (token) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE ONE WRITER — store [p_from, p_to) of the rules view into the facts, cut at p_cut.
--    Called by runtime.ai_usage_hourly_refresh (drillfacts_c_…) inside its advisory lock and by the
--    fill (drillfacts_b_…). An execution is written only when one of its columns changed (most of a
--    48-hour window has not, so the 10-minute schedule rewrites almost nothing); an execution the
--    ledger no longer holds, or holds at another moment, or that lies past the cut, is removed.
--    Takes the rollup's advisory lock itself (re-entrant inside the refresh), so a fill never races
--    a scheduled rebuild. Server-only: no client may execute it.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create function runtime.ai_usage_execution_facts_store(p_from timestamptz, p_to timestamptz, p_cut timestamptz)
returns bigint
language plpgsql
set search_path to 'pg_catalog'
as $function$
declare
  v_n bigint;
begin
  if p_from is null or p_to is null or p_cut is null or p_to <= p_from then
    raise exception 'ai_usage_execution_facts_store: the window must be a non-empty [from, to) range with a cut' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('runtime._ai_usage_hourly', 0));

  delete from runtime._ai_usage_execution_facts f
   where f.created_at >= p_from and f.created_at < p_to
     and (f.created_at >= p_cut
          or not exists (select 1 from runtime.global_execution e where e.id = f.execution_id and e.created_at = f.created_at));

  insert into runtime._ai_usage_execution_facts as f (
         execution_id, created_at, bucket, bucket_10m, organization_id, person_id, agent_id, provider,
         model, app, feature, origin, trigger, source, cost, calls, paid_calls, requests, tokens_in,
         tokens_cached, tokens_out, unpriced_calls, request_id, conversation_id, session_id,
         got_nothing_back, iterations, call_model, has_request, finish_reason, tool_calls,
         refreshed_at)
  select l.execution_id, l.created_at, l.bucket, l.bucket_10m, l.organization_id, l.person_id,
         l.agent_id, l.provider, l.model, l.app, l.feature, l.origin, l.trigger, l.source, l.cost,
         l.calls, l.paid_calls, l.requests, l.tokens_in, l.tokens_cached, l.tokens_out,
         l.unpriced_calls, l.request_id, l.conversation_id, l.session_id, l.got_nothing_back,
         l.iterations, l.call_model, l.has_request, l.finish_reason, l.tool_calls,
         now()
    from runtime._ai_usage_calls_live l
   where l.created_at >= p_from and l.created_at < least(p_to, p_cut)
  on conflict (execution_id) do update
     set (created_at, bucket, bucket_10m, organization_id, person_id, agent_id, provider, model, app,
         feature, origin, trigger, source, cost, calls, paid_calls, requests, tokens_in, tokens_cached,
         tokens_out, unpriced_calls, request_id, conversation_id, session_id, got_nothing_back,
         iterations, call_model, has_request, finish_reason, tool_calls,
         refreshed_at)
       = (excluded.created_at, excluded.bucket, excluded.bucket_10m, excluded.organization_id,
         excluded.person_id, excluded.agent_id, excluded.provider, excluded.model, excluded.app,
         excluded.feature, excluded.origin, excluded.trigger, excluded.source, excluded.cost,
         excluded.calls, excluded.paid_calls, excluded.requests, excluded.tokens_in,
         excluded.tokens_cached, excluded.tokens_out, excluded.unpriced_calls, excluded.request_id,
         excluded.conversation_id, excluded.session_id, excluded.got_nothing_back, excluded.iterations,
         excluded.call_model, excluded.has_request, excluded.finish_reason, excluded.tool_calls,
         excluded.refreshed_at)
   where (f.created_at, f.bucket, f.bucket_10m, f.organization_id, f.person_id, f.agent_id, f.provider,
         f.model, f.app, f.feature, f.origin, f.trigger, f.source, f.cost, f.calls, f.paid_calls,
         f.requests, f.tokens_in, f.tokens_cached, f.tokens_out, f.unpriced_calls, f.request_id,
         f.conversation_id, f.session_id, f.got_nothing_back, f.iterations, f.call_model, f.has_request,
         f.finish_reason, f.tool_calls)
         is distinct from
         (excluded.created_at, excluded.bucket, excluded.bucket_10m, excluded.organization_id,
         excluded.person_id, excluded.agent_id, excluded.provider, excluded.model, excluded.app,
         excluded.feature, excluded.origin, excluded.trigger, excluded.source, excluded.cost,
         excluded.calls, excluded.paid_calls, excluded.requests, excluded.tokens_in,
         excluded.tokens_cached, excluded.tokens_out, excluded.unpriced_calls, excluded.request_id,
         excluded.conversation_id, excluded.session_id, excluded.got_nothing_back, excluded.iterations,
         excluded.call_model, excluded.has_request, excluded.finish_reason, excluded.tool_calls);
  get diagnostics v_n = row_count;
  return v_n;
end
$function$;
revoke all on function runtime.ai_usage_execution_facts_store(timestamptz, timestamptz, timestamptz) from public, anon, authenticated;
comment on function runtime.ai_usage_execution_facts_store(timestamptz, timestamptz, timestamptz) is
  'DRILL-FACTS: stores [p_from, p_to) of runtime._ai_usage_calls_live into runtime._ai_usage_execution_facts, cut at p_cut (writes only changed executions; removes executions gone from the ledger, moved, or past the cut). Returns the executions written. Called by runtime.ai_usage_hourly_refresh and the fill; server-only.';

-- ROW SECURITY ON — last, so the policy hook's auth/storage/realtime locks are held for this one
-- statement to COMMIT.
alter table runtime._ai_usage_execution_facts enable row level security;

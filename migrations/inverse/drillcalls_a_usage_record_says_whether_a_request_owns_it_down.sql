-- chair-step: the inverse of migrations/campaign/drillcalls_a_usage_record_says_whether_a_request_owns_it.sql (lane DRILL-CALLS) — puts back runtime._ai_usage_calls exactly as lane DRILL-LEDGER-RECORDS created it (without has_request). A view cannot lose a column in place, so it is dropped and created again with the same select, grants and comments, and its registry row (token ai_usage_executions) is pointed at the new relation. Nothing depends on the view (no view, no rule); runtime.ai_usage_hourly_refresh reads it by column name. No row of anybody's data is touched.
-- lane: DRILL-CALLS
-- lock: platform
-- based-on: view runtime._ai_usage_calls b629a6d6f246bb9d6ac38bd3a17c11dfc70d2558a310da5a055f50595671a8c3

drop view runtime._ai_usage_calls;

create view runtime._ai_usage_calls with (security_invoker = true) as
select
  e.id                                                                    as execution_id,
  e.created_at,
  date_trunc('hour', e.created_at, 'UTC')                                 as bucket,
  date_bin('10 minutes', e.created_at, timestamptz '2000-01-01 00:00:00+00') as bucket_10m,
  e.organization_id,
  coalesce(ur.created_by,
           case when (e.context ->> 'user_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'user_id')::uuid end) as person_id,
  coalesce(ur.agent_id,
           case when (e.context ->> 'agent_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'agent_id')::uuid end) as agent_id,
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
  case when e.link_kind = 'conversation' and e.link_id ~ '^[0-9a-f-]{36}$' then e.link_id::uuid
       when (e.context ->> 'conversation_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'conversation_id')::uuid end as conversation_id,
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
    limit 1) end as call_model
from runtime.global_execution e
left join chat.user_request ur on ur.id = e.request_id;


revoke all on runtime._ai_usage_calls from public, anon, authenticated;
comment on view runtime._ai_usage_calls is
  'DRILL-LEDGER-RECORDS: the AI usage ledger, one row per execution, by public.admin_spend_breakdown''s rules — the ONE rules source: runtime.ai_usage_hourly_refresh rebuilds runtime._ai_usage_hourly from it, and the drill door reads the records behind an ai_usage number from it (token ai_usage_executions). Same column names as the rollup, including bucket (the UTC hour). Server-only.';
comment on column runtime._ai_usage_calls.model is 'Request-level: the model that billed the most of this execution''s REQUEST ("Request''s top model"), repeated on each of its executions. The model this execution itself billed is call_model.';
comment on column runtime._ai_usage_calls.provider is 'Request-level: the provider of the request''s top model.';
comment on column runtime._ai_usage_calls.call_model is 'The model THIS execution billed: set on the execution that made the request''s model calls (type conversation); empty on a tool, scrape or child run.';
comment on column runtime._ai_usage_calls.requests is 'Request-level: 1 on the request''s first execution over its whole life, else 0.';
comment on column runtime._ai_usage_calls.tokens_in is 'Request-level: the request''s input tokens, on its first execution only ("Request tokens (on its first call)"); an execution without a request carries its own meters.';
comment on column runtime._ai_usage_calls.tokens_cached is 'Request-level: the request''s cached tokens, on its first execution only; an execution without a request carries its own meters.';
comment on column runtime._ai_usage_calls.tokens_out is 'Request-level: the request''s output tokens, on its first execution only; an execution without a request carries its own meters.';
comment on column runtime._ai_usage_calls.unpriced_calls is 'Request-level: the request''s model calls with no price, on its first execution only.';
comment on column runtime._ai_usage_calls.iterations is 'Request-level: the request''s model iterations, on its first execution only.';
comment on column runtime._ai_usage_calls.got_nothing_back is 'Request-level: the request failed, was abandoned, or was cut off at the output limit.';
comment on column runtime._ai_usage_calls.session_id is 'Request-level: the sign-in session of the request (its JWT claims); empty = no session.';
comment on column runtime._ai_usage_calls.bucket_10m is 'The UTC ten-minute bucket of the execution (high cardinality).';
grant select on runtime._ai_usage_calls to service_role;

update platform.entity_types set table_ref = 'runtime._ai_usage_calls'::regclass
 where token = 'ai_usage_executions' and table_ref is distinct from 'runtime._ai_usage_calls'::regclass;

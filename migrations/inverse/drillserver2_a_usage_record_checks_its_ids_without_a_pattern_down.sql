-- chair-step: the inverse of migrations/campaign/drillserver2_a_usage_record_checks_its_ids_without_a_pattern.sql (lane DRILL-SERVER-2) — puts runtime._ai_usage_calls back exactly as lane DRILL-PARITY-LAST left it (the pattern test). Same columns, so a replace is enough. No row of anybody's data is touched.
-- lane: DRILL-SERVER-2
-- lock: platform
-- based-on: view runtime._ai_usage_calls e3258794f0cebf25bd694684a30e17ec8f438b494dc929ee29b2a80dcff4a588
-- (the based-on body is this lane's up file as applied on the nightly copy)

create or replace view runtime._ai_usage_calls with (security_invoker = true) as
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

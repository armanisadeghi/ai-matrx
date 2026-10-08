-- chair-step: the inverse of migrations/campaign/drillfacts_c_usage_is_counted_from_the_execution_facts.sql (lane DRILL-FACTS) — puts back the bodies production held before it: runtime.ai_usage_hourly_refresh summing the hours straight from runtime._ai_usage_calls, and runtime._ai_usage_calls deriving every execution live from the ledger (verbatim, drillserver2_a_usage_record_checks_its_ids_without_a_pattern.sql). The facts table is left as it is (its own inverse drops it). No row of anybody's data is touched.
-- lane: DRILL-FACTS
-- lock: platform

CREATE OR REPLACE FUNCTION runtime.ai_usage_hourly_refresh(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_from  timestamptz := date_trunc('hour', p_from, 'UTC');
  v_to    timestamptz := date_trunc('hour', p_to, 'UTC') + case when p_to = date_trunc('hour', p_to, 'UTC') then interval '0' else interval '1 hour' end;
  v_reach boolean;
  v_cut   timestamptz;
  v_prev  record;
  v_n     bigint;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'ai_usage_hourly_refresh: the window must be a non-empty [from, to) range' using errcode = '22023';
  end if;
  -- ONE REBUILD AT A TIME (drillusage_one_rollup_rebuild_at_a_time.sql): two concurrent rebuilds of
  -- the same hours each deleted before the other committed, and both inserted. The lock queues the
  -- second; the scheduled jobs and a person's Recount wait behind the nightly 35-day rebuild.
  perform pg_advisory_xact_lock(hashtextextended('runtime._ai_usage_hourly', 0));

  -- A rebuild that reaches now makes the rollup exact up to this instant, and says so. It first
  -- reaches back to where the rollup last counted through, so the counted hours stay unbroken (a
  -- 48-hour rebuild after three quiet days rebuilds three days).
  -- A rebuild that does not reach now never counts past covered_to either, so no hour ever holds an
  -- execution the answer's as_of does not cover.
  select covered_from, covered_to into v_prev from runtime._ai_usage_hourly_watermark where singleton;
  v_cut := clock_timestamp();
  v_reach := v_to > v_cut;
  if v_reach then
    if v_prev.covered_to is not null and v_prev.covered_to < v_from then
      v_from := date_trunc('hour', v_prev.covered_to, 'UTC');
    end if;
  else
    v_cut := least(v_to, coalesce(v_prev.covered_to, v_to));
  end if;

  delete from runtime._ai_usage_hourly where bucket >= v_from and bucket < v_to;
  insert into runtime._ai_usage_hourly (
    bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
    cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls, refreshed_at)
  select c.bucket, c.organization_id, c.person_id, c.agent_id, c.provider, c.model, c.app, c.feature, c.origin, c.trigger, c.source,
         sum(c.cost), sum(c.calls), sum(c.paid_calls), sum(c.requests),
         sum(c.tokens_in), sum(c.tokens_cached), sum(c.tokens_out), sum(c.unpriced_calls), now()
    from runtime._ai_usage_calls c
   where c.created_at >= v_from and c.created_at < v_cut
   group by c.bucket, c.organization_id, c.person_id, c.agent_id, c.provider, c.model, c.app, c.feature, c.origin, c.trigger, c.source;
  get diagnostics v_n = row_count;

  if v_reach then
    insert into runtime._ai_usage_hourly_watermark as w (singleton, covered_from, covered_to, refreshed_at)
    values (true, v_from, v_cut, clock_timestamp())
    on conflict (singleton) do update
       set covered_from = case when w.covered_to >= excluded.covered_from then least(w.covered_from, excluded.covered_from)
                               else excluded.covered_from end,
           covered_to   = excluded.covered_to,
           refreshed_at = excluded.refreshed_at;
  end if;
  return v_n;
end
$function$;

create or replace view runtime._ai_usage_calls with (security_invoker = true) as
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

-- chair-step: the inverse of migrations/campaign/drillusage_one_rollup_rebuild_at_a_time.sql (lane DRILL-USAGE-PAGE) — drops the rollup's one-row-per-group index and puts back runtime.ai_usage_hourly_refresh without its advisory lock, exactly as it was. The rebuilt rows stay (they are correct).
-- lane: DRILL-USAGE-PAGE
-- lock: platform
-- based-on: runtime.ai_usage_hourly_refresh(timestamp with time zone, timestamp with time zone) d803afacaa485cc65e5c8045609bf9b791a950f34129c38c5db41150c060e9f3

drop index if exists runtime._ai_usage_hourly_one_row_per_group;

CREATE OR REPLACE FUNCTION runtime.ai_usage_hourly_refresh(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_from timestamptz := date_trunc('hour', p_from, 'UTC');
  v_to   timestamptz := date_trunc('hour', p_to, 'UTC') + case when p_to = date_trunc('hour', p_to, 'UTC') then interval '0' else interval '1 hour' end;
  v_n    bigint;
begin
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'ai_usage_hourly_refresh: the window must be a non-empty [from, to) range' using errcode = '22023';
  end if;
  delete from runtime._ai_usage_hourly where bucket >= v_from and bucket < v_to;
  insert into runtime._ai_usage_hourly (
    bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
    cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls, refreshed_at)
  with g as (
    select
      e.id, e.created_at, coalesce(e.cost, 0) as cost,
      e.organization_id, e.link_kind, e.link_id, e.type, e.request_id, e.context, e.meters,
      case when (e.context ->> 'user_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'user_id')::uuid end as ctx_user_id,
      case when (e.context ->> 'agent_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'agent_id')::uuid end as ctx_agent_id,
      -- the request's FIRST execution over its whole life (not just this window): its head
      (e.request_id is null or not exists (
         select 1 from runtime.global_execution e2
          where e2.request_id = e.request_id
            and (e2.created_at < e.created_at or (e2.created_at = e.created_at and e2.id < e.id)))) as is_request_head
    from runtime.global_execution e
    where e.created_at >= v_from and e.created_at < v_to
  ),
  f as (
    select
      date_trunc('hour', g.created_at, 'UTC') as bucket,
      g.organization_id,
      coalesce(ur.created_by, g.ctx_user_id) as person_id,
      coalesce(ur.agent_id, g.ctx_agent_id) as agent_id,
      m.provider,
      m.model,
      coalesce(nullif(ur.source_app, ''), 'aidream') as app,
      coalesce(nullif(ur.source_feature, ''), nullif(g.context ->> 'agent_run_label', ''), g.link_kind, g.type) as feature,
      coalesce(ur.origin_class, case g.link_kind when 'sch_run' then 'scheduled' when 'internal_agent_run' then 'child_agent' else 'system' end) as origin,
      case when coalesce(ur.origin_class, '') in ('human', 'api') then 'manual' else 'automated' end as trigger,
      coalesce(g.link_kind, g.type) as source,
      g.cost,
      case when ur.id is not null and g.is_request_head then 1 else 0 end as request_head,
      case when ur.id is null then coalesce((g.meters ->> 'input_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_input_tokens, 0) else 0 end as tokens_in,
      case when ur.id is null then coalesce((g.meters ->> 'cached_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_cached_tokens, 0) else 0 end as tokens_cached,
      case when ur.id is null then coalesce((g.meters ->> 'output_tokens')::bigint, 0)
           when g.is_request_head then coalesce(ur.total_output_tokens, 0) else 0 end as tokens_out,
      case when g.is_request_head then coalesce(m.unpriced_calls, 0) else 0 end as unpriced_calls
    from g
    left join chat.user_request ur on ur.id = g.request_id
    left join lateral (
      select x.model, x.provider, x.unpriced_calls
        from (
          select coalesce(md.name, r.ai_model_id::text, 'unknown') as model,
                 coalesce(r.provider, 'unknown') as provider,
                 sum(r.cost) as model_cost,
                 sum(count(*) filter (where r.cost is null)) over () as unpriced_calls
            from chat.request r
            left join ai.model_definition md on md.id = r.ai_model_id
           where r.user_request_id = ur.id and r.deleted_at is null
           group by 1, 2
        ) x
       order by x.model_cost desc nulls last
       limit 1
    ) m on ur.id is not null
  )
  select bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
         sum(cost), count(*), count(*) filter (where cost > 0), sum(request_head),
         sum(tokens_in), sum(tokens_cached), sum(tokens_out), sum(unpriced_calls), now()
    from f
   group by bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source;
  get diagnostics v_n = row_count;
  return v_n;
end
$function$
;

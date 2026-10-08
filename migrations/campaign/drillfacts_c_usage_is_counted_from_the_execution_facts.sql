-- draft: DRILL-FACTS rehearsal on the clone not finished
-- chair-step: lane DRILL-FACTS — USAGE IS COUNTED FROM THE EXECUTION FACTS. REPLACES runtime.ai_usage_hourly_refresh by one added step and one changed source: under its advisory lock and before the hours are rebuilt, it stores every execution of the window into runtime._ai_usage_execution_facts through runtime.ai_usage_execution_facts_store, then sums the hours FROM those facts (the same rows the view used to give it). REPLACES the server-only view runtime._ai_usage_calls (registry token ai_usage_executions) by the same 31 columns, types and order read from the facts for every execution before the watermark (runtime._ai_usage_hourly_watermark.covered_to) and from runtime._ai_usage_calls_live — the rules, verbatim — after it, so the newest executions are still counted live. Then stores the executions the fill could not have seen (the 48 hours before now, which also moves the watermark to now). No schedule is added (the two existing pg_cron jobs keep both current), no client grant, no row of anybody's data is touched; replacing the view takes ACCESS EXCLUSIVE on that one view for the rest of the transaction, so the view is the LAST statement.
-- lane: DRILL-FACTS
-- lock: platform
-- based-on: runtime.ai_usage_hourly_refresh(timestamp with time zone, timestamp with time zone) 587dd03919d7221bf1b7cd41a6f7d48f256e16d5d131cf4ba73ee80b0e202966
-- based-on: view runtime._ai_usage_calls e3258794f0cebf25bd694684a30e17ec8f438b494dc929ee29b2a80dcff4a588
-- (based-on: the bodies on PRODUCTION, read-only, 2026-10-08)
--
-- WHY. runtime._ai_usage_calls re-derived every execution's request-level columns on every read (the
-- request's top-billing model by a GROUP BY over chat.request per row, the first-execution test per
-- column, the conversation and the person out of the context). Measured on the clone (2026-10-08), as
-- the usage page asks: see the PROOF block below. The derived row now changes only when the refresh
-- re-reads the ledger — every 10 minutes for the last 48 hours, nightly at 09:20 UTC for 35 days, and on
-- a platform admin's Recount — exactly the freshness the hourly rollup (ai_usage) already has, and the
-- answer stays live for the executions after the watermark.
-- SAME ANSWER: the facts are written from runtime._ai_usage_calls_live, which is the previous body of
-- runtime._ai_usage_calls verbatim; the hours are the same GROUP BY over the same rows. Parity suite:
-- scripts/campaign-tests/drillfacts_green.sql.
-- APPLY ORDER: drillfacts_a_…, drillfacts_b_… (autocommit, from aidream), then this file.
-- INVERSE: migrations/inverse/drillfacts_c_usage_is_counted_from_the_execution_facts_down.sql

create or replace function runtime.ai_usage_hourly_refresh(p_from timestamp with time zone, p_to timestamp with time zone)
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

  -- THE FACTS FIRST (lane DRILL-FACTS): every execution of [v_from, v_cut) stored at its grain from
  -- the one rules source, under this lock, in this transaction; the hours are then summed FROM them, so
  -- the rollup, the records behind it and runtime._ai_usage_calls are one set of rows.
  perform runtime.ai_usage_execution_facts_store(v_from, v_to, v_cut);

  delete from runtime._ai_usage_hourly where bucket >= v_from and bucket < v_to;
  insert into runtime._ai_usage_hourly (
    bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
    cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls, refreshed_at)
  select c.bucket, c.organization_id, c.person_id, c.agent_id, c.provider, c.model, c.app, c.feature, c.origin, c.trigger, c.source,
         sum(c.cost), sum(c.calls), sum(c.paid_calls), sum(c.requests),
         sum(c.tokens_in), sum(c.tokens_cached), sum(c.tokens_out), sum(c.unpriced_calls), now()
    from runtime._ai_usage_execution_facts c
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


-- the executions the fill could not have seen (or that changed since): the last 48 hours, through the
-- new body, reaching now — so the watermark moves to this transaction's cut and the view below reads
-- facts that hold every execution before it.
select runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now());

-- the facts hold every execution before the watermark (a cheap census of the ledger's count and cost,
-- one snapshot; the last ten minutes are left out, where a ledger row still committing may land after
-- the cut and is stored by the next scheduled refresh)
do $check$
declare v_to timestamptz; r record;
begin
  select covered_to - interval '10 minutes' into v_to from runtime._ai_usage_hourly_watermark where singleton;
  select (select count(*) from runtime._ai_usage_execution_facts where created_at < v_to) as fn,
         (select coalesce(sum(cost), 0) from runtime._ai_usage_execution_facts where created_at < v_to) as fc,
         (select count(*) from runtime.global_execution where created_at < v_to) as ln,
         (select coalesce(sum(coalesce(cost, 0)), 0) from runtime.global_execution where created_at < v_to) as lc
    into r;
  if v_to is null or r.fn <> r.ln or r.fc <> r.lc then
    raise exception 'drillfacts: the facts hold % executions costing % before %, the ledger % costing % — run drillfacts_b_the_execution_facts_are_filled.sql first', r.fn, r.fc, v_to, r.ln, r.lc;
  end if;
end
$check$;

-- THE VIEW: every stored fact, plus the executions after the watermark that are not stored yet, computed
-- live. The facts hold exactly the executions before the watermark (the writer stores [from, cut) and
-- removes what lies past the cut; the watermark only moves forward), so the facts branch carries no
-- bound — a bound read from the watermark row is a parameter the planner cannot estimate (it guessed
-- 1,824 rows for 214,544 on the clone); the live branch skips any execution already stored, so no
-- execution is ever counted twice.
create or replace view runtime._ai_usage_calls with (security_invoker = true) as
select f.execution_id, f.created_at, f.bucket, f.bucket_10m, f.organization_id, f.person_id,
       f.agent_id, f.provider, f.model, f.app, f.feature, f.origin, f.trigger, f.source, f.cost,
       f.calls, f.paid_calls, f.requests, f.tokens_in, f.tokens_cached, f.tokens_out,
       f.unpriced_calls, f.request_id, f.conversation_id, f.session_id, f.got_nothing_back,
       f.iterations, f.call_model, f.has_request, f.finish_reason, f.tool_calls
  from runtime._ai_usage_execution_facts f
union all
select l.execution_id, l.created_at, l.bucket, l.bucket_10m, l.organization_id, l.person_id,
       l.agent_id, l.provider, l.model, l.app, l.feature, l.origin, l.trigger, l.source, l.cost,
       l.calls, l.paid_calls, l.requests, l.tokens_in, l.tokens_cached, l.tokens_out,
       l.unpriced_calls, l.request_id, l.conversation_id, l.session_id, l.got_nothing_back,
       l.iterations, l.call_model, l.has_request, l.finish_reason, l.tool_calls
  from runtime._ai_usage_calls_live l
 where l.created_at >= coalesce((select w.covered_to from runtime._ai_usage_hourly_watermark w where w.singleton), '-infinity'::timestamptz)
   and not exists (select 1 from runtime._ai_usage_execution_facts f2 where f2.execution_id = l.execution_id);

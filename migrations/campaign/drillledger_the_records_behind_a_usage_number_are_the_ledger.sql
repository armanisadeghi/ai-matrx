-- chair-step: lane DRILL-LEDGER-RECORDS (program DRILL-FINISH, decisions 2, 3, 14, 15/26, 16/28, 25) — THE RECORDS BEHIND A USAGE NUMBER ARE THE LEDGER. It CREATES one server-only view runtime._ai_usage_calls (the AI usage ledger one row per execution, registered System machinery as token ai_usage_executions), (the one-row watermark table runtime._ai_usage_hourly_watermark is its own file, drillledger_the_watermark_table_is_row_secured.sql, applied first), three drill settings (drill.usage.stale_after_minutes, drill.chart.top_n, drill.pareto.share_pct) and three helper functions (platform.drill_knob — the resolver of every drill setting incl. drill.finding.<definition>.<finding>.<knob> —, platform._drill_ratio_sql, platform._drill_question_problems), none executable by a client. The records page carries the number's own sums as counted and says any difference (a cost that landed after the count). It takes no lock on auth, storage or realtime. It REPLACES runtime.ai_usage_hourly_refresh (it now aggregates the view — one rules source — and writes the watermark) and seven drill-door bodies of lanes DRILL-STANDARD-DOOR / DRILL-USAGE-PAGE: the validator (ratio measures, records, stale line, built-in Saved views and findings), the resolver and the compiler (the records of a declared definer definition, read definer through the SAME filter compiler and the SAME lane rule; having thresholds; ratio measures), _drill_plan and _drill_run_declared (a `rows` kind), drill_rows and drill_describe; it DROPS AND RECREATES platform.drill_ask with one more column (as_of) and re-grants it to authenticated (its client_callable_door row is keyed by its argument types and stays). No row of anybody's data is written; the ledger is read under ACCESS SHARE only.
-- lane: DRILL-LEDGER-RECORDS
-- lock: platform
-- based-on: runtime.ai_usage_hourly_refresh(timestamp with time zone, timestamp with time zone) d803afacaa485cc65e5c8045609bf9b791a950f34129c38c5db41150c060e9f3
-- based-on: platform.drill_definition_problems(jsonb) 1ecb5f1efac046ab12af376740fdb764fa56fb697bdefa4a320dc4a5fe50c5ef
-- based-on: platform._drill_resolve(uuid, text) 4a22c2cd28a6644c6f223fb0eed74a0a30768ef0a74573ce5cb05490f2ddfb87
-- based-on: platform._drill_compile(uuid, jsonb, jsonb, text) b0b7fba1f210179e05276c3c63a88a56879137e0b586864467614268e934d7a1
-- based-on: platform._drill_plan(uuid, jsonb, jsonb, text) e3f4e3e4a971621ebc69057b383eea54ff2a2e675ad9a4d67accdaf4d428d0e6
-- based-on: platform._drill_run_declared(uuid, text, jsonb, text) 25f13f4b9d31a80850c622f26646977b878c3dded73685b96d768fd60e569be8
-- based-on: platform.drill_rows(uuid, jsonb, jsonb) 7b6eb17035ee0987ba652110a8cd3aea64783a724a15f4ebea7e71b3a5881e03
-- based-on: platform.drill_describe(uuid, jsonb) 76c7133aedb7f198578394d51844007acb574ee206eb6b899ba22b3666783edb
-- based-on: platform.drill_ask(uuid, jsonb, jsonb) 5ec82b60adf50e1627a591b4f4c393b9beb3dbd47642f24ce98461236cb3af90
--
-- WHY. Decision 2: the per-call rules of AI usage (the person, the request's top model, the head-of-request
-- tokens, the feature fallback) lived only inside the rollup's rebuild, so the records behind a usage
-- number could not be read without a second copy of them. Now they are ONE view; the rollup is an
-- aggregate of it, and the records are rows of it — the two cannot disagree by construction.
-- Decision 3 / 14: "See these records" of ai_usage was refused (0A000); it is now read through the
-- declared records relation, definer, with the SAME filter compiler and the SAME lane rule the number
-- used, for a window (required), cut at the number's as_of (decisions 15/26).
-- Decision 25: ratio measures, thresholds (having — before the cut into Other; a group that misses is
-- added into Other so the answer still adds up), built-in Saved views and findings judged by the
-- validator (every question inside must be valid against the definition), as_of on every answer and
-- stale_after_knob on describe.
--
-- Proof: scripts/campaign-tests/drillledger_records_green.sql (clone) and the parity suite
-- scripts/campaign-tests/drillusage_parity_green.sql. Inverse:
-- migrations/inverse/drillledger_the_records_behind_a_usage_number_are_the_ledger_down.sql.

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 1. HOW FAR THE ROLLUP HAS COUNTED — runtime._ai_usage_hourly_watermark is created, registered and
--    row-secured by its own file, drillledger_the_watermark_table_is_row_secured.sql, applied FIRST
--    in the 01:00–04:00 PT window (VERIFY-DRILL-LEDGER-RECORDS F2): a new System table must reach
--    COMMIT with row security on (platform._provision_shape_settled), and switching it on fires the
--    admin-read policy hook that locks auth/storage/realtime. This file therefore creates no table
--    and takes no lock on any of them. The door finds the watermark by name at run time; until it
--    exists an answer's as_of is null and the records are not cut.
-- ─────────────────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 2. ONE RULES SOURCE — the ledger, one row per execution, by admin_spend_breakdown's rules.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- The hourly rollup is rebuilt FROM this view (section 3) and the records behind a usage number
-- are read FROM this view (the drill door's records kind), so the two can never disagree by
-- construction: the same person, the same model, the same head-of-request tokens, the same feature
-- fallback, the same hour. A FLAT select — no CTE, no window function — so a filter on `bucket`
-- or `created_at` reaches runtime.global_execution's own indexes. The head of a request (its
-- earliest execution over its whole life) is the NOT EXISTS form of admin_spend_breakdown's
-- row_number() = 1, asked only for rows that have a request.
--
-- REQUEST-LEVEL COLUMNS are the request's, repeated on each of its executions: `model` and
-- `provider` are the request's top-billing model (so the dimension sums to the ledger), and the
-- head-only columns (requests, tokens_*, unpriced_calls, iterations) are non-zero on the request's
-- first execution only. `call_model` is the model THIS execution billed: set on the execution that
-- made the request's model calls (type conversation), empty on a tool, scrape or child run — a
-- screen never shows a call with a model it did not bill as if it had.
--
-- Server-only: no client grant; read only by runtime.ai_usage_hourly_refresh and the drill door's
-- definer step with each lane's rule compiled in. security_invoker, so a grant made by mistake
-- would still meet the ledger's own row security.
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

insert into platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active,
  notes, is_listed, is_component, is_module, rls_variant, reference_pickable, audit_class,
  audit_class_reason, relation_kind, projects_token, data_class, data_class_reason, default_list_scope,
  origin, type, type_reason, agent_writable, allow_preview, table_ref
)
values (
  'ai_usage_executions', 'runtime', '_ai_usage_calls', 'AI usage by execution', 1, false, false, true,
  'The AI usage ledger one row per execution by the rollup''s rules; the records behind the declared drill definition ai_usage.',
  false, false, false, 'system', false, 'machinery',
  'Projection: a server-only view over runtime.global_execution + chat.user_request + chat.request that the hourly usage rollup is rebuilt from and the drill door reads records from. It owns no rows.',
  'projection', 'global_execution', 'organization',
  'System machinery with no client lane; read only through the drill door''s definer step with each lane''s rule compiled in.',
  'organization', 'standard', 'system',
  'Lane DRILL-LEDGER-RECORDS: the records relation of ai_usage (PROGRESS-DRILL-FINISH decisions 14 and 24).',
  false, false, 'runtime._ai_usage_calls'::regclass
)
on conflict (token) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 3. THE REBUILD aggregates the view (one rules source) and says how far it counted.
-- ─────────────────────────────────────────────────────────────────────────────────────────
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

comment on function runtime.ai_usage_hourly_refresh(timestamptz, timestamptz) is
  'DRILL-LEDGER-RECORDS: rebuilds every UTC hour of [p_from, p_to) of runtime._ai_usage_hourly by aggregating runtime._ai_usage_calls (the one rules source the records are read from). One rebuild at a time (advisory lock). A rebuild that reaches now cuts the ledger at that instant, first reaches back to where the rollup last counted through, and writes runtime._ai_usage_hourly_watermark. Server-only (the two pg_cron jobs, platform.ai_usage_recount, the fill files); returns the rows written.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 4. THE SETTINGS (PROGRESS-DRILL-FINISH decisions 16 and 28) and THE ONE RESOLVER.
-- ─────────────────────────────────────────────────────────────────────────────────────────
-- A drill setting's address is `feature.key` exactly as platform.knob_snapshot keys it; the door
-- resolves any `drill.…` address through platform.drill_knob (a missing setting RAISES, never a
-- silent constant). A finding's thresholds live at drill.finding.<definition>.<finding>.<knob>,
-- seeded by the drill sync from the definition's `findings[].knobs` (their defaults).
insert into platform.feature_knob
  (feature, key, value, default_value, value_type, unit, min_value, max_value, label, description,
   set_by, basis, overridable_by, override_direction, propagation, public_read, ui)
values
  ('drill.usage', 'stale_after_minutes', '20'::jsonb, '20'::jsonb, 'integer', 'minutes', 1, 1440,
   'Usage counted-through age before the screen says the schedule is behind',
   'How old the AI usage rollup''s "as of" may be before the usage screens say, in words, that the schedule is behind (and offer Recount). The rollup is rebuilt every 10 minutes, so 20 minutes is two missed runs. Nothing is recounted silently.',
   'agent', 'PROGRESS-DRILL-FINISH decision 4 (Arman 2026-09-29: "the daily summary table, updated incrementally and in the maintenance window"): the 10-minute job plus one missed run of slack.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill.chart', 'top_n', '10'::jsonb, '10'::jsonb, 'integer', 'series', 1, 50,
   'Series drawn before Other in a drill chart',
   'How many values of the split Dimension a drill chart draws as their own stacked series (the top ones by the Measure over the whole window); every other value is one Other series, so the bars always add up to the total.',
   'agent', 'PROGRESS-DRILL-FINISH decision 5: ten series stay readable in a legend; the rest is one honest Other.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb),
  ('drill.pareto', 'share_pct', '80'::jsonb, '80'::jsonb, 'number', 'percent', 1, 100,
   'Pareto line: the share of the total the marked groups make up',
   'The answer table marks the fewest groups that together make up this share of the total ("these N make 80% of the cost").',
   'agent', 'PROGRESS-DRILL-FINISH decision 8: the Spend Explorer''s 80% cut, now a line an organization can move.',
   '{organization,user}'::text[], 'any', 'next_load', false, '{}'::jsonb)
on conflict (feature, key) do nothing;

create or replace function platform.drill_knob(p_organization_id uuid, p_name text)
returns numeric
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  v_feature text;
  v_key     text;
  v        jsonb;
begin
  -- only the drill settings: a threshold can never read another feature's setting through the door
  if p_name is null or p_name !~ '^drill(\.[a-z0-9_]+){2,}$' then
    raise exception '"%" is not a drill setting: drill.<area>.<name>, or drill.finding.<definition>.<finding>.<threshold>.', coalesce(p_name, '')
      using errcode = '22023';
  end if;
  v_feature := regexp_replace(p_name, '\.[a-z0-9_]+$', '');
  v_key := substring(p_name from '[a-z0-9_]+$');
  v := platform.knob_resolve(v_feature, v_key, p_organization_id, auth.uid());
  if v is null or jsonb_typeof(v) <> 'number' then
    raise exception 'The drill setting "%" is not a number (%).', p_name, coalesce(v::text, 'nothing')
      using errcode = '22023';
  end if;
  return (v #>> '{}')::numeric;
end
$function$;
revoke all on function platform.drill_knob(uuid, text) from public, anon, authenticated;
comment on function platform.drill_knob(uuid, text) is
  'DRILL-LEDGER-RECORDS: THE resolver of a drill setting by its address (feature.key as platform.knob_snapshot keys it): drill.usage.stale_after_minutes, drill.chart.top_n, drill.pareto.share_pct, and a finding''s thresholds drill.finding.<definition>.<finding>.<knob>. Resolved for the organization and the signed-in person through platform.knob_resolve; a missing setting raises. Called by the drill compiler for a question''s having[].knob; clients read the same values from platform.knob_snapshot.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 5. A RATIO MEASURE as SQL: (Σ num) / den, each part a sum or a count over the rows it reads.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function platform._drill_ratio_sql(p_measure jsonb, p_prefix text, p_filter text default null)
returns text
language sql
immutable
set search_path to 'pg_catalog'
as $function$
  select format('((%s)::numeric / nullif((%s)::numeric, 0))',
           (select string_agg(format('coalesce(%s, 0)', platform._drill_agg_sql(x, p_prefix || (x ->> 'col'), null, p_filter)), ' + ')
              from jsonb_array_elements(p_measure -> 'num_parts') x),
           platform._drill_agg_sql(p_measure -> 'den_part', p_prefix || (p_measure -> 'den_part' ->> 'col'), null, p_filter));
$function$;
revoke all on function platform._drill_ratio_sql(jsonb, text, text) from public, anon, authenticated;
comment on function platform._drill_ratio_sql(jsonb, text, text) is
  'DRILL-LEDGER-RECORDS: a ratio Measure (op ratio, num: [measure keys], den: measure key) as an aggregate expression — the sum of the numerator parts over the denominator (null when it is zero). Each part is a sum or a count; the compiler names their source columns.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 6. A QUESTION JUDGED AGAINST A DEFINITION, without asking it — for the definition's own
--    built-in Saved views, findings and first screen (decision 25: every question inside a
--    definition must itself be valid against it). The door still judges every question it is
--    asked; this is the same judgement made at sync and census time.
-- ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function platform._drill_question_problems(p_def jsonb, p_question jsonb, p_where text)
returns text[]
language plpgsql
stable
set search_path to 'pg_catalog'
as $function$
declare
  c_keys   constant text[] := array['by','across','show','where','window','compare','sort','limit','offset','lane','path','columns','having'];
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty'];
  c_grains constant text[] := array['year','quarter','month','week','day','hour'];
  p        text[] := '{}';
  q        jsonb := p_question;
  k        text;
  e        jsonb;
  d        jsonb;
  m        jsonb;
  v_by     text[] := '{}';
  v_show   text[] := '{}';
  v_n      integer;
  v_kinds  integer;
begin
  if q is null or jsonb_typeof(q) <> 'object' then
    return array[format('%s is not a question (a JSON object).', p_where)];
  end if;
  for k in select jsonb_object_keys(q) loop
    if not (k = any (c_keys)) then
      p := p || format('%s: "%s" is not part of a question.', p_where, k);
    end if;
  end loop;

  -- by
  if q ? 'by' and jsonb_typeof(q -> 'by') <> 'array' then
    p := p || format('%s: by is a list of dimension keys.', p_where);
  else
    for e in select x from jsonb_array_elements(coalesce(q -> 'by', p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
      k := e #>> '{}';
      d := (select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) x where x ->> 'key' = split_part(k, ':', 1));
      if d is null then
        p := p || format('%s groups by "%s", which is not a dimension.', p_where, k);
      elsif d ->> 'kind' = 'time' then
        if position(':' in k) > 0 and not (split_part(k, ':', 2) = any (
             coalesce((select array_agg(g) from jsonb_array_elements_text(d -> 'grains') g), array['year','quarter','month','week','day']))) then
          p := p || format('%s cuts %s by "%s", which is not one of its grains.', p_where, d ->> 'key', split_part(k, ':', 2));
        end if;
      elsif position(':' in k) > 0 then
        p := p || format('%s cuts "%s" by a period, but it is not a time.', p_where, d ->> 'key');
      end if;
      if k = any (v_by) then
        p := p || format('%s groups by "%s" twice.', p_where, k);
      end if;
      v_by := v_by || k;
    end loop;
    if cardinality(v_by) > 4 then
      p := p || format('%s groups by more than four dimensions.', p_where);
    end if;
  end if;

  -- across
  if q ? 'across' and jsonb_typeof(q -> 'across') <> 'null' then
    k := q ->> 'across';
    d := (select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) x where x ->> 'key' = split_part(coalesce(k, ''), ':', 1));
    if jsonb_typeof(q -> 'across') <> 'string' or d is null then
      p := p || format('%s pivots across "%s", which is not a dimension.', p_where, coalesce(k, ''));
    elsif d ->> 'cardinality' = 'high' then
      p := p || format('%s pivots across %s, which has too many values to become columns.', p_where, d ->> 'key');
    elsif exists (select 1 from unnest(v_by) b where split_part(b, ':', 1) = d ->> 'key') then
      p := p || format('%s uses "%s" both as a group and as the columns.', p_where, d ->> 'key');
    end if;
  end if;

  -- show
  if q ? 'show' and jsonb_typeof(q -> 'show') <> 'array' then
    p := p || format('%s: show is a list of measure keys.', p_where);
  else
    for e in select x from jsonb_array_elements(coalesce(q -> 'show', p_def -> 'default' -> 'show', '["count"]'::jsonb)) x loop
      if jsonb_typeof(e) = 'string' then
        if not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) y where y ->> 'key' = e #>> '{}') then
          p := p || format('%s shows "%s", which is not a measure.', p_where, e #>> '{}');
        end if;
        v_show := v_show || (e #>> '{}');
      elsif jsonb_typeof(e) = 'object' then
        if not coalesce(e ->> 'op', '') = any (c_ops) then
          p := p || format('%s shows an operation "%s" a question cannot ask.', p_where, coalesce(e ->> 'op', ''));
        end if;
        v_show := v_show || case when e ->> 'op' = 'count' then 'count' else (e ->> 'op') || '_' || coalesce(e ->> 'of', '') end;
      else
        p := p || format('%s: a shown measure is its key, or {"op", "of"}.', p_where);
      end if;
    end loop;
  end if;

  -- where
  if q ? 'where' and jsonb_typeof(q -> 'where') <> 'object' then
    p := p || format('%s: where is an object of dimension key -> value.', p_where);
  else
    for k in select jsonb_object_keys(coalesce(q -> 'where', '{}'::jsonb)) loop
      if not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) y where y ->> 'key' = split_part(k, ':', 1)) then
        p := p || format('%s filters by "%s", which is not a dimension.', p_where, k);
      end if;
    end loop;
  end if;

  -- window
  if q ? 'window' and jsonb_typeof(q -> 'window') <> 'null' then
    e := q -> 'window';
    if jsonb_typeof(e) <> 'object' then
      p := p || format('%s: a window is {"key", "preset"} or {"key", "from", "to"}.', p_where);
    else
      k := coalesce(e ->> 'key', p_def -> 'default' -> 'window' ->> 'key',
                    (select x ->> 'key' from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) x where x ->> 'kind' = 'time' limit 1));
      if not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) y where y ->> 'key' = k and y ->> 'kind' = 'time') then
        p := p || format('%s: a window runs along a time dimension, and "%s" is not one.', p_where, coalesce(k, ''));
      end if;
      if e ? 'preset' and (e ->> 'preset') !~ '^([0-9]{1,4}(h|d)|all)$' then
        p := p || format('%s: "%s" is not a window preset (24h, 7d, 30d, 90d, 365d, all).', p_where, e ->> 'preset');
      end if;
      begin
        perform (e ->> 'from')::timestamptz, (e ->> 'to')::timestamptz;
      exception when others then
        p := p || format('%s: the window''s from and to are not two moments.', p_where);
      end;
    end if;
  end if;

  -- sort
  if q ? 'sort' and jsonb_typeof(q -> 'sort') <> 'null' then
    k := q -> 'sort' ->> 'key';
    if not (coalesce(k, '') = any (v_show) or coalesce(k, '') = any (v_by)
            or exists (select 1 from unnest(v_by) b where split_part(b, ':', 1) = k)) then
      p := p || format('%s sorts by "%s": sort by a measure it shows or a dimension it groups by.', p_where, coalesce(k, ''));
    end if;
    if coalesce(lower(q -> 'sort' ->> 'direction'), 'asc') not in ('asc', 'desc') then
      p := p || format('%s: a sort direction is asc or desc.', p_where);
    end if;
  end if;

  -- limit, lane, path
  if q ? 'limit' and (jsonb_typeof(q -> 'limit') <> 'number' or (q ->> 'limit')::numeric < 1 or (q ->> 'limit')::numeric <> trunc((q ->> 'limit')::numeric)) then
    p := p || format('%s: limit is a whole number of groups, 1 or more.', p_where);
  end if;
  if q ? 'lane' and not coalesce(p_def -> 'lanes', '[]'::jsonb) ? (q ->> 'lane') then
    p := p || format('%s asks in the "%s" lane, which this definition does not offer.', p_where, coalesce(q ->> 'lane', ''));
  end if;
  if q ? 'path' and not exists (select 1 from jsonb_array_elements(coalesce(p_def -> 'paths', '[]')) y where y ->> 'key' = q ->> 'path') then
    p := p || format('%s follows the drill path "%s", which this definition does not have.', p_where, coalesce(q ->> 'path', ''));
  end if;

  -- having: thresholds on the groups, applied before the cut into Other
  if q ? 'having' and jsonb_typeof(q -> 'having') <> 'null' then
    if jsonb_typeof(q -> 'having') <> 'array' then
      p := p || format('%s: having is a list of thresholds.', p_where);
    else
      if cardinality(v_by) = 0 and jsonb_array_length(q -> 'having') > 0 then
        p := p || format('%s: a threshold is on groups, so the question must group by something.', p_where);
      end if;
      for e in select x from jsonb_array_elements(q -> 'having') x loop
        if jsonb_typeof(e) <> 'object' then
          p := p || format('%s: a threshold is {"measure", "op", and one of value / share_of_total / times_median}.', p_where);
          continue;
        end if;
        for k in select jsonb_object_keys(e) loop
          if not (k = any (array['measure','op','value','share_of_total','times_median','median_nonzero','knob'])) then
            p := p || format('%s: "%s" is not part of a threshold.', p_where, k);
          end if;
        end loop;
        m := (select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) x where x ->> 'key' = e ->> 'measure');
        if m is null then
          p := p || format('%s: the threshold''s measure "%s" is not a measure.', p_where, coalesce(e ->> 'measure', ''));
        elsif not (e ->> 'measure' = any (v_show)) then
          p := p || format('%s: the threshold''s measure "%s" must also be shown (a screen shows the number it filters on).', p_where, e ->> 'measure');
        end if;
        if coalesce(e ->> 'op', '') not in ('>=', '>') then
          p := p || format('%s: a threshold''s op is ">=" or ">".', p_where);
        end if;
        v_kinds := (case when e ? 'value' then 1 else 0 end) + (case when e ? 'share_of_total' then 1 else 0 end) + (case when e ? 'times_median' then 1 else 0 end);
        if v_kinds <> 1 then
          p := p || format('%s: a threshold has exactly one of value, share_of_total and times_median.', p_where);
        end if;
        if e ? 'value' and jsonb_typeof(e -> 'value') <> 'number' then
          p := p || format('%s: a threshold''s value is a number.', p_where);
        end if;
        if e ? 'share_of_total' and (jsonb_typeof(e -> 'share_of_total') <> 'number'
                                     or (e ->> 'share_of_total')::numeric <= 0 or (e ->> 'share_of_total')::numeric > 100) then
          p := p || format('%s: share_of_total is a percent of the window''s total, above 0 and at most 100.', p_where);
        end if;
        if e ? 'share_of_total' and m is not null
           and not (m ->> 'op' in ('sum', 'count') and coalesce((m ->> 'additive')::boolean, true)) then
          p := p || format('%s: a share of the total needs a measure that adds up across groups; "%s" does not.', p_where, m ->> 'key');
        end if;
        if e ? 'times_median' and (jsonb_typeof(e -> 'times_median') <> 'number' or (e ->> 'times_median')::numeric <= 0) then
          p := p || format('%s: times_median is a multiple above 0.', p_where);
        end if;
        if e ? 'median_nonzero' and (jsonb_typeof(e -> 'median_nonzero') <> 'boolean' or not (e ? 'times_median')) then
          p := p || format('%s: median_nonzero is true or false, and only beside times_median.', p_where);
        end if;
        if e ? 'knob' and (jsonb_typeof(e -> 'knob') <> 'string' or (e ->> 'knob') !~ '^drill(\.[a-z0-9_]+){2,}$') then
          p := p || format('%s: a threshold''s knob is the address of a drill setting (drill.finding.<definition>.<finding>.<name>).', p_where);
        end if;
      end loop;
    end if;
  end if;
  return p;
end
$function$;
revoke all on function platform._drill_question_problems(jsonb, jsonb, text) from public, anon, authenticated;
comment on function platform._drill_question_problems(jsonb, jsonb, text) is
  'DRILL-LEDGER-RECORDS: judges a question against a definition without asking it (keys, dimensions and grains, the pivot, shown measures, filters, window, sort, limit, lane, path, and having thresholds) — the definition''s built-in Saved views, findings and first screen are judged by platform.drill_definition_problems through it. The door still judges every question it is asked.';

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 7. THE VALIDATOR — ratio measures, records, the stale line, built-in Saved views and findings.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform.drill_definition_problems(p_def jsonb)
 RETURNS text[]
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_ident  constant text := '^[a-z][a-z0-9_]{0,62}$';
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty'];
  c_kinds  constant text[] := array['choice','relation','boolean','text','time'];
  c_grains constant text[] := array['year','quarter','month','week','day','hour'];
  c_lanes  constant text[] := array['mine','organization','platform'];
  p        text[] := '{}';
  v_key    text;
  v_fact   record;
  v_mode   text;
  v_lane   text;
  v_rule   jsonb;
  j        jsonb;
  d        jsonb;
  m        jsonb;
  v_alias  jsonb := '{}'::jsonb;   -- alias -> {schema, table}
  v_col    jsonb;
  v_from   text;
  v_a      text;
  v_c      text;
  v_fk     jsonb;
  v_dims   text[] := '{}';
  v_meas   text[] := '{}';
  v_lvl    text;
  v_x      text;
  v_rec    record;
  v_rcol   jsonb;
  v_wm     regclass;
  v_keys   text[];
  f        jsonb;
  h        jsonb;
  v_fkey   text;
begin
  if p_def is null or jsonb_typeof(p_def) <> 'object' then
    return array['A drill definition is a JSON object.'];
  end if;
  v_key := p_def ->> 'key';
  if v_key is null or v_key !~ c_ident then
    p := p || format('"%s" is not a definition key: a lower-case letter, then letters, digits or underscores.', coalesce(v_key, ''));
  end if;
  if coalesce(btrim(p_def ->> 'label'), '') = '' then
    p := p || 'A definition needs a label a person reads, such as "AI usage".'::text;
  end if;

  select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.is_active
    into v_fact from platform.entity_types e where e.token = p_def ->> 'fact';
  if v_fact.token is null then
    return p || format('The fact "%s" is not a table in the registry; name its registry token.', coalesce(p_def ->> 'fact', ''));
  end if;
  if not v_fact.is_active then
    p := p || format('The table "%s" has been retired.', v_fact.token);
  end if;
  if v_fact.type in ('restricted', 'deprecated') or v_fact.data_class = 'confidential' then
    p := p || format('"%s" is a %s table; it is never offered for drilling.', v_fact.token,
                     case when v_fact.data_class = 'confidential' then 'Confidential' else initcap(v_fact.type) end);
  end if;
  if v_key is not null and v_key <> v_fact.token
     and exists (select 1 from platform.entity_types e where e.token = v_key) then
    p := p || format('"%s" is already the registry token of another table. A definition keyed by a token overrides THAT table; a fact over several tables takes a key of its own.', v_key);
  end if;
  v_alias := jsonb_build_object('', jsonb_build_object('schema', v_fact.schema_name, 'table', v_fact.table_name));

  v_mode := coalesce(p_def ->> 'mode', 'invoker');
  if v_mode not in ('invoker', 'definer') then
    p := p || format('"%s" is not a mode: invoker (the table''s own row security decides, the default) or definer.', v_mode);
  end if;

  -- LANES. A definer definition reads past row security, so it must say, for EVERY lane it
  -- offers, the one rule that narrows it — from a closed vocabulary, never a SQL fragment.
  if jsonb_typeof(p_def -> 'lanes') is distinct from 'array' or jsonb_array_length(p_def -> 'lanes') = 0 then
    p := p || 'A definition lists its lanes: some of mine, organization, platform.'::text;
  else
    for v_lane in select x #>> '{}' from jsonb_array_elements(p_def -> 'lanes') x loop
      if not (v_lane = any (c_lanes)) then
        p := p || format('"%s" is not a lane: mine, organization or platform.', v_lane);
        continue;
      end if;
      if v_mode = 'definer' then
        v_rule := p_def -> 'lane_rules' -> v_lane;
        if v_rule is null or jsonb_typeof(v_rule) <> 'object' then
          p := p || format('This definition reads past row security, and its %s lane names no rule that narrows it. Every lane of a definer definition says how it narrows: mine {"column": <person column>}, organization {"column": <organization column>, "rule": "member" | "admin"}, platform {"rule": "super_admin"}.', v_lane);
        elsif v_lane in ('mine', 'organization') then
          v_col := platform._drill_column(v_fact.schema_name, v_fact.table_name, v_rule ->> 'column');
          if v_col is null or v_col ->> 'cat' <> 'uuid' then
            p := p || format('The %s lane''s column "%s" is not a uuid column of %s.%s.', v_lane, coalesce(v_rule ->> 'column', ''), v_fact.schema_name, v_fact.table_name);
          end if;
          if v_lane = 'organization' and coalesce(v_rule ->> 'rule', '') not in ('member', 'admin') then
            p := p || 'The organization lane''s rule is "member" (any member of the organization) or "admin" (its owners and admins).'::text;
          end if;
        elsif v_lane = 'platform' and coalesce(v_rule ->> 'rule', '') <> 'super_admin' then
          p := p || 'The platform lane''s rule is "super_admin".'::text;
        end if;
      end if;
    end loop;
  end if;
  if v_mode = 'invoker' and p_def ? 'lane_rules' then
    p := p || 'lane_rules belong to a definer definition only; an invoker definition is narrowed by the table''s own row security.'::text;
  end if;
  -- A definition keyed by its fact's own token overrides that table and keeps its row security —
  -- unless the fact is System machinery no client reads at all (a server-only rollup or records
  -- view): there is no row security to keep, so it is asked definer, every lane's rule compiled in.
  if v_mode = 'definer' and v_key = v_fact.token and v_fact.type is distinct from 'system' then
    p := p || 'An override of one table keeps that table''s own row security; only a fact over several tables, or a System fact no client reads, may be a definer definition.'::text;
  end if;
  if v_mode = 'definer' and exists (select 1 from jsonb_object_keys(coalesce(p_def -> 'lane_rules', '{}'::jsonb)) k
                                      where not (k = any (select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'lanes', '[]'::jsonb)) x))) then
    p := p || 'lane_rules names a lane the definition does not offer.'::text;
  end if;

  -- JOINS: a star, many-to-one only, each along a real foreign key.
  for j in select x from jsonb_array_elements(coalesce(p_def -> 'joins', '[]'::jsonb)) x loop
    if coalesce(j ->> 'as', '') !~ c_ident or v_alias ? (j ->> 'as') then
      p := p || format('The join "%s" needs a new name of its own.', coalesce(j ->> 'as', ''));
      continue;
    end if;
    v_from := coalesce(j ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    if not v_alias ? v_a then
      p := p || format('The join "%s" starts from "%s", which is neither the fact nor an earlier join.', j ->> 'as', v_from);
      continue;
    end if;
    v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, j ->> 'token');
    if v_fk is null or v_fk ->> 'token' is distinct from j ->> 'token' then
      p := p || format('The join "%s" must follow a foreign key from %s to the table "%s" names; there is none, so it could fan out.', j ->> 'as', v_from, coalesce(j ->> 'token', ''));
      continue;
    end if;
    select e.type, e.data_class::text into v_x, v_lvl from platform.entity_types e where e.token = j ->> 'token';
    if v_x in ('restricted', 'deprecated') or v_lvl = 'confidential' then
      p := p || format('The join "%s" reaches a %s table, which is never offered for drilling.', j ->> 'as', coalesce(v_lvl, v_x));
    end if;
    -- A definer definition narrows only its FACT by the lane rule; a joined row is read with the
    -- definer's rights, so a definer join may reach only Reference data (the same for everyone).
    if v_mode = 'definer' and v_x is distinct from 'reference' then
      p := p || format('The join "%s" reaches "%s", which is not Reference data. A definition that reads past row security may join only Reference tables, because the lane rule narrows the fact alone.', j ->> 'as', j ->> 'token');
    end if;
    v_alias := v_alias || jsonb_build_object(j ->> 'as', jsonb_build_object('schema', v_fk ->> 'schema', 'table', v_fk ->> 'table'));
  end loop;

  -- DIMENSIONS and MEASURES: every column they read is a real one and may be read.
  for d in select x from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]'::jsonb)) x loop
    if coalesce(d ->> 'key', '') !~ c_ident or (d ->> 'key') = any (v_dims) or d ->> 'key' = 'other' then
      p := p || format('The dimension "%s" needs a key of its own (lower case, letters, digits, underscores).', coalesce(d ->> 'key', ''));
      continue;
    end if;
    v_dims := v_dims || (d ->> 'key');
    if not coalesce(d ->> 'kind', '') = any (c_kinds) then
      p := p || format('The dimension "%s" has no kind: choice, relation, boolean, text or time.', d ->> 'key');
    end if;
    v_from := coalesce(d ->> 'from', '');
    v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
    v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
    v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
    if v_col is null then
      p := p || format('The dimension "%s" reads "%s", which is not a column of the fact or of a join.', d ->> 'key', v_from);
    elsif (v_col ->> 'excluded')::boolean then
      p := p || format('The dimension "%s" reads "%s", a column that is never offered (kept from clients, governed, or a row-access column).', d ->> 'key', v_from);
    elsif (v_col ->> 'array')::boolean or v_col ->> 'cat' = 'other' then
      p := p || format('The dimension "%s" reads "%s" (%s), which cannot be grouped by.', d ->> 'key', v_from, v_col ->> 'type');
    elsif d ->> 'kind' = 'time' and v_col ->> 'cat' <> 'time' then
      p := p || format('The dimension "%s" is a time but "%s" is %s.', d ->> 'key', v_from, v_col ->> 'type');
    end if;
    if d ->> 'kind' = 'time' and d ? 'grains' and exists (
         select 1 from jsonb_array_elements_text(d -> 'grains') g where not (g = any (c_grains))) then
      p := p || format('The dimension "%s" names a grain that is not one of %s.', d ->> 'key', array_to_string(c_grains, ', '));
    end if;
  end loop;

  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x loop
    if coalesce(m ->> 'key', '') !~ c_ident or (m ->> 'key') = any (v_meas) then
      p := p || format('The measure "%s" needs a key of its own.', coalesce(m ->> 'key', ''));
      continue;
    end if;
    v_meas := v_meas || (m ->> 'key');
    if m ->> 'op' = 'ratio' then
      continue;   -- judged below, once every measure key is known
    end if;
    if not coalesce(m ->> 'op', '') = any (c_ops) then
      p := p || format('The measure "%s" has no operation it can use: %s, ratio.', m ->> 'key', array_to_string(c_ops, ', '));
      continue;
    end if;
    if m ->> 'op' = 'count' then
      if m ? 'of' then p := p || format('The measure "%s" counts rows, so it reads no column.', m ->> 'key'); end if;
      continue;
    end if;
    foreach v_from in array array[m ->> 'of', m ->> 'at_grain'] loop
      continue when v_from is null and m ? 'of';
      if v_from is null then
        p := p || format('The measure "%s" (%s) names no column.', m ->> 'key', m ->> 'op');
        continue;
      end if;
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      v_col := case when v_alias ? v_a then platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c) end;
      if v_col is null then
        p := p || format('The measure "%s" reads "%s", which is not a column of the fact or of a join.', m ->> 'key', v_from);
      elsif (v_col ->> 'excluded')::boolean then
        p := p || format('The measure "%s" reads "%s", a column that is never offered.', m ->> 'key', v_from);
      elsif v_from = m ->> 'of' and m ->> 'op' in ('sum', 'avg', 'median') and v_col ->> 'cat' <> 'number' then
        p := p || format('The measure "%s" adds up "%s", which is %s, not a number.', m ->> 'key', v_from, v_col ->> 'type');
      elsif v_from = m ->> 'of' and m ->> 'op' in ('min', 'max') and v_col ->> 'cat' not in ('number', 'time') then
        p := p || format('The measure "%s" takes the %s of "%s", which is neither a number nor a time.', m ->> 'key', m ->> 'op', v_from);
      end if;
    end loop;
  end loop;
  if cardinality(v_meas) = 0 then
    p := p || 'A definition needs at least one measure (a count is enough).'::text;
  end if;
  -- RATIO: (the sum of num) / den, each a measure of this definition that adds up (sum or count).
  for m in select x from jsonb_array_elements(coalesce(p_def -> 'measures', '[]'::jsonb)) x where x ->> 'op' = 'ratio' loop
    if m ? 'of' or m ? 'at_grain' then
      p := p || format('The ratio "%s" is made of other measures (num and den), so it reads no column itself.', m ->> 'key');
    end if;
    if jsonb_typeof(m -> 'num') is distinct from 'array' or jsonb_array_length(m -> 'num') = 0 or jsonb_typeof(m -> 'den') is distinct from 'string' then
      p := p || format('The ratio "%s" names its parts: num (a list of measure keys, added up) and den (one measure key).', m ->> 'key');
      continue;
    end if;
    for v_x in select x #>> '{}' from jsonb_array_elements(m -> 'num') x union all select m ->> 'den' loop
      h := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = v_x);
      if h is null then
        p := p || format('The ratio "%s" names "%s", which is not a measure of this definition.', m ->> 'key', v_x);
      elsif not (h ->> 'op' in ('sum', 'count') and coalesce((h ->> 'additive')::boolean, true)) or h ? 'at_grain' then
        p := p || format('The ratio "%s" is made of "%s", which does not add up (a part is a sum or a count).', m ->> 'key', v_x);
      end if;
    end loop;
  end loop;

  for d in select x from jsonb_array_elements(coalesce(p_def -> 'paths', '[]'::jsonb)) x loop
    for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(d -> 'levels', '[]'::jsonb)) x loop
      if not split_part(v_lvl, ':', 1) = any (v_dims) then
        p := p || format('The drill path "%s" names "%s", which is not a dimension of this definition.', coalesce(d ->> 'key', ''), v_lvl);
      end if;
    end loop;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    if not split_part(v_lvl, ':', 1) = any (v_dims) then
      p := p || format('The first screen groups by "%s", which is not a dimension.', v_lvl);
    end if;
  end loop;
  for v_lvl in select x #>> '{}' from jsonb_array_elements(coalesce(p_def -> 'default' -> 'show', '[]'::jsonb)) x loop
    if not v_lvl = any (v_meas) then
      p := p || format('The first screen shows "%s", which is not a measure.', v_lvl);
    end if;
  end loop;
  if p_def ? 'default' then
    p := p || platform._drill_question_problems(p_def, p_def -> 'default', 'The first screen');
  end if;

  -- RECORDS (decision 14): the relation the records behind a definer definition's numbers are read
  -- from — the same filter compiler and the same lane rule, so every column the definition reads
  -- must be a column of it too, of the same kind.
  if p_def ? 'records' then
    if jsonb_typeof(p_def -> 'records') <> 'object' or jsonb_typeof(p_def -> 'records' -> 'columns') is distinct from 'array'
       or jsonb_array_length(p_def -> 'records' -> 'columns') = 0 then
      p := p || 'records is {"fact": <registry token of the records relation>, "columns": [the columns a record shows]}.'::text;
    else
      if v_mode <> 'definer' then
        p := p || 'records belong to a definer definition only; an invoker definition''s records are its own rows, read as the person.'::text;
      end if;
      select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.is_active
        into v_rec from platform.entity_types e where e.token = p_def -> 'records' ->> 'fact';
      if v_rec.token is null or not v_rec.is_active then
        p := p || format('The records relation "%s" is not an active table in the registry.', coalesce(p_def -> 'records' ->> 'fact', ''));
      elsif v_rec.type in ('restricted', 'deprecated') or v_rec.data_class = 'confidential' then
        p := p || format('The records relation "%s" is a %s table; it is never offered.', v_rec.token, coalesce(v_rec.data_class, v_rec.type));
      else
        for v_from in
          select x ->> 'from' from jsonb_array_elements(coalesce(p_def -> 'dimensions', '[]')) x
          union select x ->> 'of' from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) x where x ? 'of'
          union select x ->> 'at_grain' from jsonb_array_elements(coalesce(p_def -> 'measures', '[]')) x where x ? 'at_grain'
          union select e.x ->> 'column' from jsonb_each(coalesce(p_def -> 'lane_rules', '{}')) e(k, x) where e.x ? 'column'
          union select x ->> 'from' from jsonb_array_elements(coalesce(p_def -> 'joins', '[]')) x
        loop
          continue when v_from is null or position('.' in v_from) > 0;   -- a joined column is read from its join
          v_col := platform._drill_column(v_fact.schema_name, v_fact.table_name, v_from);
          v_rcol := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_from);
          if v_rcol is null then
            p := p || format('The records relation "%s" has no column "%s", which this definition reads; one filter must serve the number and its records.', v_rec.token, v_from);
          elsif v_col is not null and v_col ->> 'cat' is distinct from v_rcol ->> 'cat' then
            p := p || format('"%s" is %s on the fact but %s on the records relation "%s".', v_from, v_col ->> 'type', v_rcol ->> 'type', v_rec.token);
          end if;
        end loop;
        v_keys := '{}';
        for v_x in select x #>> '{}' from jsonb_array_elements(p_def -> 'records' -> 'columns') x loop
          v_rcol := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_x);
          if v_x !~ c_ident or v_rcol is null then
            p := p || format('The records relation "%s" has no column "%s".', v_rec.token, v_x);
          elsif (v_rcol ->> 'excluded')::boolean then
            p := p || format('The record column "%s" is never offered (kept from clients, governed, or a row-access column).', v_x);
          end if;
          if v_x = any (v_keys) then
            p := p || format('The record column "%s" is listed twice.', v_x);
          end if;
          v_keys := v_keys || v_x;
        end loop;
        if p_def -> 'records' ? 'labels' and (jsonb_typeof(p_def -> 'records' -> 'labels') <> 'object'
             or exists (select 1 from jsonb_each(p_def -> 'records' -> 'labels') l
                         where not (l.key = any (v_keys)) or jsonb_typeof(l.value) <> 'string' or btrim(l.value #>> '{}') = '')) then
          p := p || 'records.labels names, for columns it lists, the words a person reads ({"model": "Request''s top model"}).'::text;
        end if;
        v_wm := to_regclass(format('%I.%I', v_fact.schema_name, v_fact.table_name || '_watermark'));
        if v_wm is not null and platform._drill_column(v_rec.schema_name, v_rec.table_name, 'created_at') ->> 'cat' is distinct from 'time' then
          p := p || format('The fact "%s" says how far it has counted, so its records relation "%s" needs a created_at moment to be cut at the same instant.', v_fact.token, v_rec.token);
        end if;
      end if;
    end if;
  end if;

  -- THE STALE LINE (decision 25): the setting that says when the fact's "as of" is old.
  if p_def ? 'stale_after_knob' and jsonb_typeof(p_def -> 'stale_after_knob') <> 'null' then
    if jsonb_typeof(p_def -> 'stale_after_knob') <> 'string' or (p_def ->> 'stale_after_knob') !~ '^drill(\.[a-z0-9_]+){2,}$' then
      p := p || 'stale_after_knob is the address of a drill setting, such as drill.usage.stale_after_minutes.'::text;
    end if;
    if to_regclass(format('%I.%I', v_fact.schema_name, v_fact.table_name || '_watermark')) is null then
      p := p || format('The fact "%s" keeps no record of how far it has counted (%s.%s_watermark), so a stale line has nothing to measure.', v_fact.token, v_fact.schema_name, v_fact.table_name);
    end if;
  end if;

  -- BUILT-IN SAVED VIEWS (decision 6): every question inside must be valid against the definition.
  if p_def ? 'views' then
    if jsonb_typeof(p_def -> 'views') <> 'array' then
      p := p || 'views is a list of {key, label, question}.'::text;
    else
      v_keys := '{}';
      for f in select x from jsonb_array_elements(p_def -> 'views') x loop
        if coalesce(f ->> 'key', '') !~ c_ident or (f ->> 'key') = any (v_keys) then
          p := p || format('The Saved view "%s" needs a key of its own.', coalesce(f ->> 'key', ''));
          continue;
        end if;
        v_keys := v_keys || (f ->> 'key');
        if coalesce(btrim(f ->> 'label'), '') = '' then
          p := p || format('The Saved view "%s" needs a label a person reads.', f ->> 'key');
        end if;
        p := p || platform._drill_question_problems(p_def, f -> 'question', format('The Saved view "%s"', f ->> 'key'));
      end loop;
    end if;
  end if;

  -- FINDINGS (decisions 7, 13, 25, 28): a question with thresholds whose lines are settings at
  -- drill.finding.<definition>.<finding>.<knob>; each threshold that names a knob uses its default.
  if p_def ? 'findings' then
    if jsonb_typeof(p_def -> 'findings') <> 'array' then
      p := p || 'findings is a list of {key, label, question, knobs}.'::text;
    else
      v_keys := '{}';
      for f in select x from jsonb_array_elements(p_def -> 'findings') x loop
        if coalesce(f ->> 'key', '') !~ c_ident or (f ->> 'key') = any (v_keys) then
          p := p || format('The finding "%s" needs a key of its own.', coalesce(f ->> 'key', ''));
          continue;
        end if;
        v_keys := v_keys || (f ->> 'key');
        v_fkey := format('drill.finding.%s.%s.', v_key, f ->> 'key');
        if coalesce(btrim(f ->> 'label'), '') = '' then
          p := p || format('The finding "%s" needs a label a person reads.', f ->> 'key');
        end if;
        if f ? 'rule' then
          p := p || format('The finding "%s": its rule is its question''s having thresholds, not a separate rule.', f ->> 'key');
        end if;
        p := p || platform._drill_question_problems(p_def, f -> 'question', format('The finding "%s"', f ->> 'key'));
        if not (f -> 'question' ? 'having') or jsonb_typeof(f -> 'question' -> 'having') <> 'array' or jsonb_array_length(f -> 'question' -> 'having') = 0 then
          p := p || format('The finding "%s" names no threshold (having), so it would list every group.', f ->> 'key');
        end if;
        if jsonb_typeof(coalesce(f -> 'knobs', '{}'::jsonb)) <> 'object' then
          p := p || format('The finding "%s": knobs is an object of name -> {default, label, unit}.', f ->> 'key');
          continue;
        end if;
        for v_x, h in select key, value from jsonb_each(coalesce(f -> 'knobs', '{}'::jsonb)) loop
          if v_x !~ c_ident or jsonb_typeof(h) <> 'object' or jsonb_typeof(h -> 'default') <> 'number'
             or coalesce(btrim(h ->> 'label'), '') = '' or jsonb_typeof(h -> 'unit') <> 'string' then
            p := p || format('The finding "%s": its setting "%s" needs a name, a number default, a label and a unit.', f ->> 'key', v_x);
          end if;
          if not exists (select 1 from jsonb_array_elements(coalesce(f -> 'question' -> 'having', '[]'::jsonb)) y where y ->> 'knob' = v_fkey || v_x) then
            p := p || format('The finding "%s" declares the setting "%s" but no threshold reads it (%s).', f ->> 'key', v_x, v_fkey || v_x);
          end if;
        end loop;
        for h in select y from jsonb_array_elements(case when jsonb_typeof(f -> 'question' -> 'having') = 'array' then f -> 'question' -> 'having' else '[]'::jsonb end) y where y ? 'knob' loop
          v_x := h ->> 'knob';
          if left(v_x, length(v_fkey)) <> v_fkey or not (coalesce(f -> 'knobs', '{}'::jsonb) ? substr(v_x, length(v_fkey) + 1)) then
            p := p || format('The finding "%s" reads the setting "%s", which is not one of its own (%s<name> for a name under knobs).', f ->> 'key', v_x, v_fkey);
          elsif coalesce(h -> 'value', h -> 'share_of_total', h -> 'times_median') is distinct from (f -> 'knobs' -> substr(v_x, length(v_fkey) + 1) -> 'default') then
            p := p || format('The finding "%s": the threshold reading "%s" writes %s, but the setting''s default is %s.', f ->> 'key', v_x,
                             coalesce(h -> 'value', h -> 'share_of_total', h -> 'times_median', 'null'::jsonb), f -> 'knobs' -> substr(v_x, length(v_fkey) + 1) -> 'default');
          end if;
        end loop;
      end loop;
    end if;
  end if;
  return p;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 8. THE RESOLVER — the records relation, re-read column by column; the watermark; a definer
--    definition over a System fact of its own token; Saved views, findings, stale line pass through.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._drill_resolve(p_organization_id uuid, p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_grains constant jsonb := '["year","quarter","month","week","day"]';
  v_decl   jsonb;
  v_prob   text[];
  v_et     record;
  v_fact   text;
  v_dims   jsonb := '[]';
  v_meas   jsonb := '[]';
  v_paths  jsonb := '[]';
  v_cols   jsonb := '{}';
  v_joins  jsonb := '[]';
  v_alias  jsonb;
  v_lanes  jsonb;
  v_lcols  jsonb := '{}';
  v_pk     text[];
  a        record;
  v_col    jsonb;
  v_fk     jsonb;
  v_label  text;
  v_nd     numeric;
  v_max    integer;
  v_vals   jsonb;
  v_first_choice text;
  v_first_time   text;
  v_first_sum    text;
  v_detail jsonb := '[]';
  j        jsonb;
  d        jsonb;
  v_from   text;
  v_a      text;
  v_c      text;
  v_def    jsonb;
  v_mode   text := 'invoker';
  v_hide   jsonb;
  v_rls    boolean;
  v_nostats text[] := '{}';
  v_rec    record;
  v_rcols  jsonb;
  v_rpk    text[];
  v_rx     jsonb;
  v_records jsonb;
  v_wm     regclass;
begin
  if p_token is null or p_token !~ '^[a-z][a-z0-9_.]{0,62}$' then
    raise exception 'There is no table or definition called "%".', coalesce(p_token, '')
      using errcode = '22023', hint = 'Name a standard table by its registry token ("agent", "ai_model") or a declared definition by its key.';
  end if;

  v_decl := platform.drill_declared(p_token);
  if v_decl is not null then
    v_prob := platform.drill_definition_problems(v_decl);
    if cardinality(v_prob) > 0 then
      raise exception 'The declared definition "%" is not sound, so nothing was counted: %', p_token, array_to_string(v_prob, ' ')
        using errcode = '42P17', hint = 'Fix its *.drill.ts file and run the drill sync; the census check:drill-definitions-declare-lanes names the same problems.';
    end if;
    v_fact := v_decl ->> 'fact';
    v_mode := coalesce(v_decl ->> 'mode', 'invoker');
  else
    v_fact := p_token;
  end if;

  select e.token, e.schema_name, e.table_name, e.type, e.data_class::text as data_class, e.label,
         e.title_column, e.is_active, e.client_excluded_columns, e.governed_columns
    into v_et from platform.entity_types e where e.token = v_fact;
  if v_et.token is null or not v_et.is_active then
    raise exception 'There is no table or definition called "%".', p_token
      using errcode = '42704', hint = 'Name a standard table by its registry token or a declared definition by its key.';
  end if;
  if v_decl is null and (v_et.type in ('restricted', 'deprecated', 'system') or v_et.data_class = 'confidential') then
    raise exception 'The % table "%" is not offered for drilling by inference.', coalesce(nullif(v_et.data_class, 'organization'), v_et.type), p_token
      using errcode = '42501',
            hint = 'Restricted, deprecated and confidential tables are never offered; a System table only through a declared definition that names what it shows (a *.drill.ts file).';
  end if;
  -- A table this seat holds no SELECT on is not described (the answer would only be a refusal) —
  -- unless it is the fact of a DECLARED definer definition: that one is read by the definer step
  -- with every lane's rule compiled in (the validator refused it otherwise), so a server-only
  -- table such as a rollup may be its fact (lane DRILL-USAGE-PAGE). Its records are still read
  -- as the seat, and platform._drill_plan refuses them in words when the seat cannot read them.
  if v_mode <> 'definer'
     and not has_table_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), 'select') then
    raise exception 'You cannot read the % table, so it cannot be counted or grouped for you.', coalesce(v_et.label, p_token)
      using errcode = '42501', hint = 'It is read only by the platform itself.';
  end if;
  select c.relrowsecurity into v_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = v_et.schema_name and c.relname = v_et.table_name;

  select coalesce(array_agg(att.attname::text order by array_position(k.conkey, att.attnum)), '{}')
    into v_pk
    from pg_constraint k
    join pg_attribute att on att.attrelid = k.conrelid and att.attnum = any (k.conkey)
   where k.conrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass and k.contype = 'p';

  v_alias := jsonb_build_object('', jsonb_build_object('schema', v_et.schema_name, 'table', v_et.table_name, 'alias', 't'));
  v_max := coalesce((platform.knob_resolve('drill', 'text_dimension_max_distinct', p_organization_id, auth.uid()) #>> '{}')::integer, 200);

  if v_decl is null or (v_decl ->> 'key' = v_fact and v_mode <> 'definer') then
    -- ── INFERENCE (d.3): the catalogue and the registry say what each column is. ──────────
    for a in
      select att.attname::text as col, att.attnum
        from pg_attribute att
       where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
         and att.attnum > 0 and not att.attisdropped
       order by att.attnum
    loop
      v_col := platform._drill_column(v_et.schema_name, v_et.table_name, a.col);
      continue when (v_col ->> 'excluded')::boolean or (v_col ->> 'array')::boolean
                    or v_col ->> 'cat' = 'other' or a.col = 'deleted_at';
      -- column privileges: a column this seat may not select is not offered
      continue when not has_column_privilege(custom.caller_role(), format('%I.%I', v_et.schema_name, v_et.table_name), a.col, 'select');
      continue when a.col = any (v_pk) and cardinality(v_pk) = 1 and v_col ->> 'cat' = 'uuid';
      v_label := case a.col when 'created_at' then 'Added' when 'updated_at' then 'Last changed'
                            when 'created_by' then 'Added by' when 'updated_by' then 'Last changed by'
                            when 'organization_id' then 'Organization'
                            else initcap(regexp_replace(regexp_replace(a.col, '_id$', ''), '_', ' ', 'g')) end;
      v_cols := v_cols || jsonb_build_object(a.col, v_col || jsonb_build_object('alias', 't'));

      if v_col ->> 'cat' = 'uuid' then
        v_fk := platform._drill_fk(v_et.schema_name, v_et.table_name, a.col, null);
        if v_fk is not null then
          v_cols := jsonb_set(v_cols, array[a.col, 'fk'], v_fk);
        end if;
        if a.col = 'organization_id' then
          v_lcols := v_lcols || jsonb_build_object('organization', a.col);
        end if;
        if a.col in ('created_by', 'user_id', 'owner_id') and not v_lcols ? 'mine'
           and (v_fk is null or v_fk ->> 'schema' in ('iam', 'auth')) then
          v_lcols := v_lcols || jsonb_build_object('mine', a.col);
        end if;
        if v_fk is not null or a.col in ('created_by', 'updated_by', 'user_id', 'owner_id') then
          v_dims := v_dims || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'relation',
            'relation', jsonb_strip_nulls(jsonb_build_object(
              'token', coalesce(v_fk ->> 'token', case when a.col in ('created_by','updated_by','user_id','owner_id') then 'user' end),
              'person', case when (v_fk ->> 'schema') in ('iam', 'auth') or v_fk is null then true end)))));
          v_detail := v_detail || to_jsonb(a.col);
        end if;
      elsif v_col ->> 'cat' = 'bool' then
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'boolean', 'cardinality', 'low'));
      elsif v_col ->> 'cat' = 'enum' then
        select jsonb_agg(jsonb_build_object('value', en.enumlabel, 'label', en.enumlabel) order by en.enumsortorder)
          into v_vals from pg_enum en
         where en.enumtypid = (select att.atttypid from pg_attribute att
                                where att.attrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass and att.attname = a.col);
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'choice', 'cardinality', 'low', 'choices', coalesce(v_vals, '[]')));
        v_first_choice := coalesce(v_first_choice, a.col);
        v_detail := v_detail || to_jsonb(a.col);
      elsif v_col ->> 'cat' = 'text' then
        -- a CHECK (col = ANY (ARRAY[...])) list is a choice
        select jsonb_agg(jsonb_build_object('value', m[1], 'label', m[1]))
          into v_vals
          from pg_constraint k
          cross join lateral regexp_matches(pg_get_constraintdef(k.oid), '''((?:[^'']|'''')*)''::(?:text|character varying)', 'g') m
         where k.conrelid = format('%I.%I', v_et.schema_name, v_et.table_name)::regclass
           and k.contype = 'c' and k.conkey = array[a.attnum]
           and pg_get_constraintdef(k.oid) ~* ('^CHECK \(\(\(?' || a.col || '\)? = ANY \(ARRAY\[');
        if v_vals is not null then
          v_dims := v_dims || jsonb_build_array(jsonb_build_object(
            'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'choice', 'cardinality', 'low', 'choices', v_vals));
          v_first_choice := coalesce(v_first_choice, a.col);
          v_detail := v_detail || to_jsonb(a.col);
        else
          -- free text is a dimension only while the planner's own statistics say it is a category
          select case when s.n_distinct >= 0 then s.n_distinct
                      else -s.n_distinct * greatest(c.reltuples, 0) end
            into v_nd
            from pg_stats s
            join pg_namespace n on n.nspname = s.schemaname
            join pg_class c on c.relnamespace = n.oid and c.relname = s.tablename
           where s.schemaname = v_et.schema_name and s.tablename = v_et.table_name and s.attname = a.col;
          if v_nd is null then
            v_nostats := v_nostats || a.col;
          end if;
          if v_nd is not null and v_nd >= 1 and v_nd <= v_max
             and not exists (select 1 from pg_stats s2 where s2.schemaname = v_et.schema_name
                               and s2.tablename = v_et.table_name and s2.attname = a.col and s2.n_distinct <= -0.5) then
            v_dims := v_dims || jsonb_build_array(jsonb_build_object(
              'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'text',
              'cardinality', case when v_nd <= 24 then 'low' else 'medium' end));
            v_detail := v_detail || to_jsonb(a.col);
          elsif a.col = v_et.title_column then
            v_detail := v_detail || to_jsonb(a.col);
          end if;
        end if;
      elsif v_col ->> 'cat' = 'time' then
        v_dims := v_dims || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label, 'from', a.col, 'kind', 'time', 'grains', c_grains));
        v_paths := v_paths || jsonb_build_array(jsonb_build_object(
          'key', a.col, 'label', v_label || ' by period',
          'levels', (select jsonb_agg(a.col || ':' || (g #>> '{}')) from jsonb_array_elements(c_grains) g)));
        v_first_time := case when a.col = 'created_at' then a.col else coalesce(v_first_time, a.col) end;
        v_detail := v_detail || to_jsonb(a.col);
      elsif v_col ->> 'cat' = 'number' and a.col !~ '(_id|_ids)$' and not (a.col = any (v_pk)) then
        v_meas := v_meas
          || jsonb_build_array(jsonb_build_object('key', 'sum_' || a.col, 'label', 'Total ' || lower(v_label), 'op', 'sum', 'of', a.col, 'additive', true))
          || jsonb_build_array(jsonb_build_object('key', 'avg_' || a.col, 'label', 'Average ' || lower(v_label), 'op', 'avg', 'of', a.col, 'additive', false))
          || jsonb_build_array(jsonb_build_object('key', 'min_' || a.col, 'label', 'Lowest ' || lower(v_label), 'op', 'min', 'of', a.col, 'additive', false))
          || jsonb_build_array(jsonb_build_object('key', 'max_' || a.col, 'label', 'Highest ' || lower(v_label), 'op', 'max', 'of', a.col, 'additive', false));
        if a.col !~ '(^version$|order|position|sort|rank|index|priority|_count$|attempts|rating)' then
          v_first_sum := coalesce(v_first_sum, 'sum_' || a.col);
        end if;
        v_detail := v_detail || to_jsonb(a.col);
      end if;
    end loop;
    v_meas := jsonb_build_array(jsonb_build_object(
      'key', 'count', 'label', 'Number of ' || regexp_replace(lower(coalesce(nullif(v_et.label, ''), v_et.table_name)), '([^s])$', '\1s'),
      'op', 'count', 'unit', 'count', 'additive', true)) || v_meas;
    v_lanes := jsonb_build_array('organization')
               || case when v_lcols ? 'mine' then '["mine"]'::jsonb else '[]'::jsonb end
               || '["platform"]'::jsonb;
    if v_et.title_column is not null and not v_detail ? v_et.title_column
       and v_cols ? v_et.title_column then
      v_detail := to_jsonb(v_et.title_column) || v_detail;
    end if;
    v_def := jsonb_build_object(
      'key', v_fact,
      'label', coalesce(nullif(v_et.label, ''), initcap(replace(v_et.table_name, '_', ' '))),
      'grain', 'one row per ' || lower(coalesce(nullif(v_et.label, ''), v_et.table_name)),
      'lanes', v_lanes,
      'dimensions', v_dims,
      'measures', v_meas,
      'paths', v_paths,
      'detail', jsonb_build_object('columns', (select coalesce(jsonb_agg(x), '[]') from (select x from jsonb_array_elements(v_detail) x limit 12) s)),
      'default', jsonb_strip_nulls(jsonb_build_object(
        'by', case when v_first_choice is not null then jsonb_build_array(v_first_choice)
                   when v_first_time is not null then jsonb_build_array(v_first_time || ':month')
                   else '[]'::jsonb end,
        'show', case when v_first_sum is not null then jsonb_build_array('count', v_first_sum) else '["count"]'::jsonb end,
        'sort', jsonb_build_object('key', 'count', 'direction', 'desc'),
        'path', v_first_time)),
      'inferred', (select coalesce(jsonb_agg(x -> 'key'), '[]') from jsonb_array_elements(v_dims || v_meas) x));
  end if;

  if v_decl is not null then
    -- ── DECLARED: an override of the inferred table, or a fact over several ─────────────
    -- a fact over several tables, or a definer definition over a System fact no client reads (its
    -- own token): nothing is inferred; the declaration says every Dimension and Measure
    if v_decl ->> 'key' <> v_fact or v_mode = 'definer' then
      v_def := jsonb_build_object('key', v_decl ->> 'key', 'dimensions', '[]'::jsonb, 'measures', '[]'::jsonb,
                                  'paths', '[]'::jsonb, 'inferred', '[]'::jsonb);
      v_cols := '{}';
      v_lcols := coalesce(v_decl -> 'lane_columns', '{}');
    else
      v_lcols := v_lcols || coalesce(v_decl -> 'lane_columns', '{}');
    end if;
    for j in select x from jsonb_array_elements(coalesce(v_decl -> 'joins', '[]'::jsonb)) x loop
      v_from := j ->> 'from';
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, j ->> 'token');
      v_joins := v_joins || jsonb_build_array(jsonb_build_object(
        'alias', 'j' || jsonb_array_length(v_joins), 'schema', v_fk ->> 'schema', 'table', v_fk ->> 'table',
        'on_alias', v_alias -> v_a ->> 'alias', 'on_column', v_c, 'to', v_fk ->> 'to'));
      v_alias := v_alias || jsonb_build_object(j ->> 'as', jsonb_build_object(
        'schema', v_fk ->> 'schema', 'table', v_fk ->> 'table', 'alias', 'j' || (jsonb_array_length(v_joins) - 1)));
    end loop;
    -- every column a declared dimension or measure reads, with its alias and type
    for v_from in
      select x ->> 'from' from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) x
      union select x ->> 'of' from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) x where x ? 'of'
      union select x ->> 'at_grain' from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) x where x ? 'at_grain'
      union select x #>> '{}' from jsonb_array_elements(coalesce(v_decl -> 'detail' -> 'columns', '[]')) x
      union select x #>> '{}' from jsonb_each(coalesce(v_decl -> 'lane_columns', '{}')) e(k, x)
      union select e.x ->> 'column' from jsonb_each(coalesce(v_decl -> 'lane_rules', '{}')) e(k, x) where e.x ? 'column'
    loop
      continue when v_from is null or v_cols ? v_from;
      v_a := case when position('.' in v_from) > 0 then split_part(v_from, '.', 1) else '' end;
      v_c := case when position('.' in v_from) > 0 then split_part(v_from, '.', 2) else v_from end;
      continue when not v_alias ? v_a;
      v_col := platform._drill_column(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c);
      continue when v_col is null;
      if v_mode = 'invoker' and not has_column_privilege(custom.caller_role(),
           format('%I.%I', v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table'), v_c, 'select') then
        raise exception 'This definition reads a column you cannot read (%), so it cannot be asked by you.', v_from
          using errcode = '42501';
      end if;
      v_fk := platform._drill_fk(v_alias -> v_a ->> 'schema', v_alias -> v_a ->> 'table', v_c, null);
      if v_fk is null and v_a <> '' and exists (
           select 1 from jsonb_array_elements(v_joins) jj
            where jj ->> 'alias' = v_alias -> v_a ->> 'alias' and jj ->> 'to' = v_c) then
        -- the join target's own key: the relation is that row itself
        select jsonb_build_object('schema', e.schema_name, 'table', e.table_name, 'to', v_c,
                                  'token', e.token, 'title', e.title_column)
          into v_fk from platform.entity_types e
         where e.schema_name = v_alias -> v_a ->> 'schema' and e.table_name = v_alias -> v_a ->> 'table';
      end if;
      v_cols := v_cols || jsonb_build_object(v_from, v_col || jsonb_build_object('alias', v_alias -> v_a ->> 'alias')
                                             || case when v_fk is not null then jsonb_build_object('fk', v_fk) else '{}'::jsonb end);
    end loop;
    v_hide := coalesce(v_decl -> 'hide', '[]');
    v_def := v_def || jsonb_strip_nulls(jsonb_build_object(
      'label', v_decl ->> 'label', 'grain', v_decl ->> 'grain', 'lanes', v_decl -> 'lanes',
      'detail', v_decl -> 'detail', 'default', v_decl -> 'default',
      -- the definition's built-in Saved views and findings (read-only; "Save a copy" makes a person's own)
      'views', v_decl -> 'views', 'findings', v_decl -> 'findings',
      -- what a record of this definition shows (the relation itself stays the door's)
      'records', case when v_decl ? 'records' then jsonb_strip_nulls(jsonb_build_object(
                   'fact', v_decl -> 'records' ->> 'fact', 'columns', v_decl -> 'records' -> 'columns',
                   'labels', v_decl -> 'records' -> 'labels')) end));

    -- THE RECORDS RELATION (decision 14): every column the definition reads, re-read from it, so the
    -- SAME compiler, the same filter and the same lane rule serve the number and its records.
    if v_decl ? 'records' then
      select e.schema_name, e.table_name, e.token into v_rec
        from platform.entity_types e where e.token = v_decl -> 'records' ->> 'fact' and e.is_active;
      if v_rec.token is null then
        raise exception 'The records of "%" are declared in "%", which is not in the registry.', v_decl ->> 'key', v_decl -> 'records' ->> 'fact'
          using errcode = '42P17';
      end if;
      v_rcols := '{}';
      for v_from, v_col in select key, value from jsonb_each(v_cols) loop
        if v_col ->> 'alias' = 't' then
          v_rx := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_col ->> 'column');
          if v_rx is null then
            raise exception 'The records relation of "%" has no column "%" (the validator names this too).', v_decl ->> 'key', v_col ->> 'column'
              using errcode = '42P17';
          end if;
          v_rcols := v_rcols || jsonb_build_object(v_from, v_rx || jsonb_build_object('alias', 't'));
        else
          v_rcols := v_rcols || jsonb_build_object(v_from, v_col);
        end if;
      end loop;
      for v_from in select x #>> '{}' from jsonb_array_elements(v_decl -> 'records' -> 'columns') x union select 'created_at' loop
        continue when v_rcols ? v_from;
        v_rx := platform._drill_column(v_rec.schema_name, v_rec.table_name, v_from);
        continue when v_rx is null or (v_rx ->> 'excluded')::boolean;
        v_rcols := v_rcols || jsonb_build_object(v_from, v_rx || jsonb_build_object('alias', 't'));
      end loop;
      select coalesce(array_agg(att.attname::text order by array_position(k.conkey, att.attnum)), '{}')
        into v_rpk
        from pg_constraint k
        join pg_attribute att on att.attrelid = k.conrelid and att.attnum = any (k.conkey)
       where k.conrelid = format('%I.%I', v_rec.schema_name, v_rec.table_name)::regclass and k.contype = 'p';
      v_records := jsonb_build_object(
        'fact', jsonb_build_object('schema', v_rec.schema_name, 'table', v_rec.table_name, 'token', v_rec.token,
                                   'pk', to_jsonb(v_rpk),
                                   'deleted', (platform._drill_column(v_rec.schema_name, v_rec.table_name, 'deleted_at') is not null)),
        'cols', v_rcols,
        'columns', v_decl -> 'records' -> 'columns');
    end if;
    v_def := jsonb_set(v_def, '{dimensions}',
      (select coalesce(jsonb_agg(x order by o), '[]') from (
         select x, o from jsonb_array_elements(v_def -> 'dimensions') with ordinality e(x, o)
          where not exists (select 1 from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) y where y ->> 'key' = x ->> 'key')
            and not v_hide ? (x ->> 'key')
         union all
         select x, 1000 + o from jsonb_array_elements(coalesce(v_decl -> 'dimensions', '[]')) with ordinality e(x, o)) s));
    v_def := jsonb_set(v_def, '{measures}',
      (select coalesce(jsonb_agg(x order by o), '[]') from (
         select x, o from jsonb_array_elements(v_def -> 'measures') with ordinality e(x, o)
          where not exists (select 1 from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) y where y ->> 'key' = x ->> 'key')
            and not v_hide ? (x ->> 'key')
         union all
         select x, 1000 + o from jsonb_array_elements(coalesce(v_decl -> 'measures', '[]')) with ordinality e(x, o)) s));
    if v_decl ? 'paths' then
      v_def := jsonb_set(v_def, '{paths}', v_decl -> 'paths');
    end if;
  end if;

  -- how far a definer fact has counted: <schema>.<table>_watermark (covered_to), when it keeps one
  if v_mode = 'definer' then
    v_wm := to_regclass(format('%I.%I', v_et.schema_name, v_et.table_name || '_watermark'));
  end if;

  return v_def || jsonb_build_object(
    'source', jsonb_build_object('kind', 'entity', 'token', coalesce(v_decl ->> 'key', v_fact)),
    'mode', v_mode,
    'stale_after_knob', v_decl -> 'stale_after_knob',
    '_c', jsonb_build_object(
      'fact', jsonb_build_object('schema', v_et.schema_name, 'table', v_et.table_name, 'token', v_et.token,
                                 'pk', to_jsonb(v_pk), 'title', v_et.title_column, 'rls', v_rls,
                                 'deleted', (platform._drill_column(v_et.schema_name, v_et.table_name, 'deleted_at') is not null)),
      'joins', v_joins,
      'cols', v_cols,
      'lane_cols', v_lcols,
      'lane_rules', coalesce(v_decl -> 'lane_rules', '{}'))
      || case when v_records is not null then jsonb_build_object('records', v_records) else '{}'::jsonb end
      || case when v_wm is not null then jsonb_build_object('watermark', v_wm::text) else '{}'::jsonb end)
    || case when cardinality(v_nostats) > 0 then jsonb_build_object('says', jsonb_build_array(format(
         '%s text column%s (%s) %s no statistics yet, so %s not offered as a dimension; the next routine analysis of the table decides.',
         cardinality(v_nostats), case when cardinality(v_nostats) = 1 then '' else 's' end, array_to_string(v_nostats, ', '),
         case when cardinality(v_nostats) = 1 then 'has' else 'have' end,
         case when cardinality(v_nostats) = 1 then 'it is' else 'they are' end))) else '{}'::jsonb end;
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 9. THE COMPILER — records of a definer definition; having; ratio.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._drill_compile(p_organization_id uuid, p_def jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_ops    constant text[] := array['count','count_distinct','sum','avg','min','max','median','filled','empty'];
  c_steps  constant jsonb := '{"hour":"1 hour","day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q        jsonb := coalesce(p_question, '{}'::jsonb);
  v_c      jsonb := p_def -> '_c';
  v_cols   jsonb;
  k        text;
  v_lane   text;
  v_mode   text := coalesce(p_def ->> 'mode', 'invoker');
  v_me     uuid := auth.uid();
  v_cal    jsonb;
  v_tz     text;
  v_ws     text;
  v_shift  integer;
  v_params jsonb := '{}'::jsonb;
  v_from   text;
  v_preds  text[] := '{}';
  v_w      jsonb := '[]'::jsonb;         -- bound where values, by position
  v_by     jsonb := '[]'::jsonb;         -- [{key, dim, grain, col}]
  v_ax     jsonb;                        -- the across entry
  v_show   jsonb := '[]'::jsonb;         -- [{key, op, col, grain_col, cat}]
  v_sort   jsonb;
  v_cap    integer;
  v_acap   integer;
  v_cmp    jsonb;
  v_win    jsonb;
  v_time_default boolean := false;
  e        jsonb;
  d        jsonb;
  m        jsonb;
  v_col    jsonb;
  v_ref    text;
  v_x      text;
  v_i      integer;
  v_n      integer;
  v_sel    text[];
  v_gk     text[];
  v_sets   text;
  v_meas   text[];
  v_zero   jsonb := '{}'::jsonb;
  v_delta  text[] := '{}';
  v_grp    text;
  v_order  text;
  v_sql    text;
  v_rel    jsonb := '[]'::jsonb;
  v_rank_dir text;
  v_rank_expr text;
  v_has_by boolean;
  v_has_ax boolean;
  v_rows_cols text[];
  v_pk     jsonb;
  v_fact   jsonb;                        -- the relation read: the fact, or the records relation
  v_records boolean := false;           -- the records of a definer definition, read by the definer step
  v_asof   timestamptz;
  v_parts  jsonb;
  v_part   jsonb;
  v_j      integer;
  v_hv     jsonb := '[]'::jsonb;         -- the thresholds' numbers, bound
  v_hsel   text[] := '{}';               -- per-group values the thresholds read (bg)
  v_hok    text[] := '{}';               -- the thresholds, as predicates (bh)
  v_hmed   text[] := '{}';               -- the medians they compare with (bm)
  v_hsays  text[] := '{}';
  v_page   text;
  v_sum    text[];
begin
  -- the columns this definition may read: key -> {alias, column, type, cat, fk?}
  v_cols := coalesce(v_c -> 'cols', '{}'::jsonb);
  v_fact := v_c -> 'fact';
  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): the same question, the same lane rule and the
  -- same filter, read from the declared records relation, whose columns carry the fact's names.
  if p_kind = 'rows' and v_mode = 'definer' and v_c ? 'records' then
    v_records := true;
    v_cols := v_c -> 'records' -> 'cols';
    v_fact := v_c -> 'records' -> 'fact';
  end if;

  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','across','show','where','window','compare','sort','limit','offset','lane','path','columns','having'])) then
      raise exception '"%" is not part of a question.', k
        using errcode = '22023', hint = 'A question has: by, across, show, where, window, compare, sort, limit, lane, having (and for records: offset, columns).';
    end if;
  end loop;
  if (q ? 'by') and jsonb_typeof(q -> 'by') <> 'array' then
    raise exception 'by is a list of dimension keys, outermost first.' using errcode = '22023';
  end if;
  if (q ? 'show') and jsonb_typeof(q -> 'show') <> 'array' then
    raise exception 'show is a list of measure keys.' using errcode = '22023';
  end if;
  if (q ? 'where') and jsonb_typeof(q -> 'where') <> 'object' then
    raise exception 'where is an object of dimension key -> value.' using errcode = '22023',
      hint = 'A value is an equality, null is "not set", a list is any of them, and {"from": …, "to": …} is a half-open range.';
  end if;

  -- ── THE LANE ────────────────────────────────────────────────────────────────────────────
  v_lane := coalesce(nullif(q ->> 'lane', ''), case when p_def -> 'lanes' ? 'organization' then 'organization'
                                                    else p_def -> 'lanes' ->> 0 end);
  if not (p_def -> 'lanes' ? v_lane) then
    raise exception '"%" cannot be asked in the % lane.', p_def ->> 'label', v_lane
      using errcode = '22023', hint = format('It offers: %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(p_def -> 'lanes') x));
  end if;
  if v_lane = 'platform' and not public.is_platform_admin() then
    raise exception 'Everything on the platform is counted only inside the admin apps, by a platform admin.'
      using errcode = '42501', hint = 'Ask in your organization''s lane, or your own.';
  end if;
  if v_lane = 'mine' and public.is_platform_admin() then
    raise exception 'Inside the admin apps an admin never counts as herself.'
      using errcode = '22023', hint = 'Ask in the platform lane, or in one organization''s.';
  end if;
  if v_lane = 'mine' and v_me is null then
    raise exception 'Your own lane needs a signed-in person.' using errcode = '42501';
  end if;
  v_params := v_params || jsonb_build_object('org', p_organization_id, 'me', v_me);

  if v_mode = 'definer' then
    e := p_def -> '_c' -> 'lane_rules' -> v_lane;
    if e is null then
      raise exception 'The % lane of "%" names no rule, so it is not answered.', v_lane, p_def ->> 'key' using errcode = '42P17';
    end if;
    if v_lane = 'organization' and e ->> 'rule' = 'admin'
       and not (p_organization_id in (select iam.my_admin_orgs())) then
      raise exception 'Only an owner or admin of this organization sees its % counted here.', lower(p_def ->> 'label')
        using errcode = '42501';
    end if;
    if v_lane in ('mine', 'organization') then
      v_col := v_cols -> (e ->> 'column');
      v_preds := v_preds || format('%I.%I = ($1->>%L)::uuid', v_col ->> 'alias', v_col ->> 'column',
                                   case when v_lane = 'mine' then 'me' else 'org' end);
    end if;
  else
    if v_lane = 'organization' and v_c -> 'lane_cols' ? 'organization' then
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'organization');
      v_preds := v_preds || format('%I.%I = ($1->>''org'')::uuid', v_col ->> 'alias', v_col ->> 'column');
    elsif v_lane = 'mine' then
      if not (v_c -> 'lane_cols' ? 'mine') then
        raise exception '"%" has no column that says whose a row is, so it has no lane of your own.', p_def ->> 'label' using errcode = '22023';
      end if;
      v_col := v_cols -> (v_c -> 'lane_cols' ->> 'mine');
      v_preds := v_preds || format('%I.%I = ($1->>''me'')::uuid', v_col ->> 'alias', v_col ->> 'column');
    end if;
  end if;
  if (v_fact ->> 'deleted')::boolean then
    v_preds := v_preds || 't.deleted_at is null'::text;
  end if;

  -- ── THE CALENDAR (only when a time is cut) ───────────────────────────────────────────────
  v_cal := custom.agg_calendar(p_organization_id);
  v_tz := v_cal ->> 'time_zone';
  v_ws := v_cal ->> 'week_start';
  v_shift := (8 - coalesce(array_position(array['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], v_ws), 1)) % 7;
  v_params := v_params || jsonb_build_object('tz', v_tz);

  -- ── FROM: the fact and its star ──────────────────────────────────────────────────────────
  v_from := format('%I.%I t', v_fact ->> 'schema', v_fact ->> 'table');
  for e in select x from jsonb_array_elements(coalesce(v_c -> 'joins', '[]'::jsonb)) x loop
    v_from := v_from || format(' left join %I.%I %I on %I.%I = %I.%I',
                               e ->> 'schema', e ->> 'table', e ->> 'alias',
                               e ->> 'alias', e ->> 'to', e ->> 'on_alias', e ->> 'on_column');
  end loop;

  -- ── WHERE: every value bound, cast to the column's own type ──────────────────────────────
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to filter by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    v_col := v_cols -> (d ->> 'from');
    v_ref := format('%I.%I', v_col ->> 'alias', v_col ->> 'column');
    if position(':' in k) > 0 then
      -- a bucket a person clicked: that one period, from its label to the next
      v_x := split_part(k, ':', 2);
      if d ->> 'kind' <> 'time' or not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a time dimension, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      begin
        e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                                'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      exception when others then
        raise exception '"%" is not a period label (such as 2026-09-01T00:00:00-07:00).', e #>> '{}' using errcode = '22023';
      end;
    end if;
    v_i := jsonb_array_length(v_w);
    if jsonb_typeof(e) = 'null' then
      v_preds := v_preds || format('%s is null', v_ref);
    elsif jsonb_typeof(e) = 'array' then
      if jsonb_array_length(e) > 1000 then
        raise exception 'A filter lists at most 1000 values; this one lists %.', jsonb_array_length(e) using errcode = '22023';
      end if;
      perform platform._drill_assert_values(e, v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('(%1$s = any ((select array_agg(x) from jsonb_array_elements_text($1->''w''->%2$s) x)::%3$s[]) or (%1$s is null and ($1->''w''->%2$s) @> ''[null]''))',
                                   v_ref, v_i, v_col ->> 'type');
    elsif jsonb_typeof(e) = 'object' then
      if exists (select 1 from jsonb_object_keys(e) x where x not in ('from', 'to')) or not (e ? 'from' or e ? 'to') then
        raise exception 'A range is {"from": …, "to": …}: from is included, to is not.' using errcode = '22023';
      end if;
      if v_col ->> 'cat' = 'time' then
        begin
          e := jsonb_strip_nulls(jsonb_build_object('from', (e ->> 'from')::timestamptz, 'to', (e ->> 'to')::timestamptz));
        exception when others then
          raise exception 'The range on % is not two moments.', d ->> 'label' using errcode = '22023';
        end;
        v_x := platform._drill_moment_sql(v_ref, v_col ->> 'type');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::timestamptz', v_x, v_i); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::timestamptz', v_x, v_i); end if;
      else
        perform platform._drill_assert_values(jsonb_build_array(e -> 'from', e -> 'to'), v_col ->> 'type', d ->> 'label');
        v_w := v_w || jsonb_build_array(e);
        if e ? 'from' then v_preds := v_preds || format('%s >= ($1->''w''->%s->>''from'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
        if e ? 'to' then v_preds := v_preds || format('%s < ($1->''w''->%s->>''to'')::%s', v_ref, v_i, v_col ->> 'type'); end if;
      end if;
    else
      perform platform._drill_assert_values(jsonb_build_array(e), v_col ->> 'type', d ->> 'label');
      v_w := v_w || jsonb_build_array(e);
      v_preds := v_preds || format('%s = ($1->''w''->>%s)::%s', v_ref, v_i, v_col ->> 'type');
    end if;
  end loop;

  -- ── THE WINDOW and THE COMPARISON ────────────────────────────────────────────────────────
  v_win := q -> 'window';
  if v_win is not null and jsonb_typeof(v_win) = 'object' then
    k := coalesce(v_win ->> 'key', p_def -> 'default' -> 'window' ->> 'key',
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A window runs along a time dimension, and "%" is not one.', coalesce(k, '') using errcode = '22023';
    end if;
    if v_win ? 'preset' then
      v_x := v_win ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' and v_x <> 'all' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d, 365d or all.', v_x using errcode = '22023';
      end if;
      v_win := case when v_x = 'all' then jsonb_build_object('key', k)
                    else jsonb_build_object('key', k,
                           'from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval,
                           'to', now()) end;
    end if;
    v_win := v_win || jsonb_build_object('key', k);
  else
    v_win := null;
  end if;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    e := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if e ->> 'against' in ('prev', 'previous') then e := e || '{"against":"previous_period"}'; end if;
    if e ->> 'against' in ('yoy') then e := e || '{"against":"same_period_last_year"}'; end if;
    k := coalesce(e ->> 'key', v_win ->> 'key',
                  (select split_part(x #>> '{}', ':', 1) from jsonb_array_elements(coalesce(q -> 'by', '[]')) x
                    where exists (select 1 from jsonb_array_elements(p_def -> 'dimensions') y
                                   where y ->> 'key' = split_part(x #>> '{}', ':', 1) and y ->> 'kind' = 'time') limit 1),
                  (select x ->> 'key' from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1));
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = k and x ->> 'kind' = 'time');
    if d is null then
      raise exception 'A comparison runs along a time dimension, and this definition has none called "%".', coalesce(k, '') using errcode = '22023';
    end if;
    e := e || jsonb_build_object('key', 'created_at');   -- custom.agg_compare_windows judges the key's shape only
    if v_win ? 'from' and not (e ? 'from' or e ? 'to' or e ? 'period') then
      e := e || jsonb_build_object('from', v_win ->> 'from', 'to', coalesce(v_win ->> 'to', now()::text));
    end if;
    v_cmp := custom.agg_compare_windows(p_organization_id, e,
               (select jsonb_build_object('key', 'created_at', 'by', split_part(x #>> '{}', ':', 2))
                  from jsonb_array_elements(coalesce(q -> 'by', '[]')) x where position(':' in x #>> '{}') > 0 limit 1));
    v_cmp := v_cmp || jsonb_build_object('key', k);
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    v_params := v_params || jsonb_build_object(
      'wf', (v_cmp -> 'window' ->> 'from')::timestamptz, 'wt', (v_cmp -> 'window' ->> 'to')::timestamptz,
      'pf', (v_cmp -> 'prior_window' ->> 'from')::timestamptz, 'pt', (v_cmp -> 'prior_window' ->> 'to')::timestamptz,
      'cmp', v_cmp);
    v_preds := v_preds || format('((sd.side = ''w'' and %1$s >= ($1->>''wf'')::timestamptz and %1$s < ($1->>''wt'')::timestamptz) or (sd.side = ''p'' and %1$s >= ($1->>''pf'')::timestamptz and %1$s < ($1->>''pt'')::timestamptz))', v_x);
    v_from := v_from || ' cross join lateral (values (''w''::text), (''p''::text)) sd(side)';
  elsif v_win ? 'from' or v_win ? 'to' then
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = v_win ->> 'key');
    v_col := v_cols -> (d ->> 'from');
    v_x := platform._drill_moment_sql(format('%I.%I', v_col ->> 'alias', v_col ->> 'column'), v_col ->> 'type');
    begin
      v_params := v_params || jsonb_strip_nulls(jsonb_build_object('wf', (v_win ->> 'from')::timestamptz, 'wt', (v_win ->> 'to')::timestamptz));
    exception when others then
      raise exception 'A window is {"from": …, "to": …} as two moments, or a preset.' using errcode = '22023';
    end;
    if v_params ? 'wf' then v_preds := v_preds || format('%s >= ($1->>''wf'')::timestamptz', v_x); end if;
    if v_params ? 'wt' then v_preds := v_preds || format('%s < ($1->>''wt'')::timestamptz', v_x); end if;
  end if;
  v_params := v_params || jsonb_build_object('w', v_w);

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- RECORDS ("see these records"): the same FROM and WHERE, an explicit column list.
  -- ════════════════════════════════════════════════════════════════════════════════════════
  if p_kind = 'rows' then
    if v_cmp is not null then
      raise exception 'The records behind a number are asked without a comparison.' using errcode = '22023';
    end if;
    if v_records then
      -- a definer fact's records are listed for a window, and never past what its number counted
      if not (v_params ? 'wf') then
        raise exception 'The records behind "%" are listed for a window: give it a start (from), or a preset such as 30d.', p_def ->> 'label'
          using errcode = '22023', hint = 'Every usage number is asked for a window; its records are asked for the same one.';
      end if;
      if v_c ? 'watermark' then
        execute format('select max(covered_to) from %s', v_c ->> 'watermark') into v_asof;
        if v_asof is null then
          raise exception 'The summary behind "%" has not been counted yet, so its records are not listed.', p_def ->> 'label'
            using errcode = '0A000', hint = 'Recount it; the records are listed up to the moment the summary counted through.';
        end if;
        v_col := v_cols -> 'created_at';
        v_params := v_params || jsonb_build_object('asof', v_asof);
        v_preds := v_preds || format('%I.%I < ($1->>''asof'')::timestamptz', v_col ->> 'alias', v_col ->> 'column');
      end if;
      if q ? 'columns' and exists (select 1 from jsonb_array_elements(q -> 'columns') x
                                    where not (v_c -> 'records' -> 'columns') ? coalesce(x ->> 'from', x #>> '{}')) then
        raise exception 'A record of "%" shows only its declared columns: %.', p_def ->> 'label',
          (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(v_c -> 'records' -> 'columns') x)
          using errcode = '22023';
      end if;
    end if;
    v_cap := custom.page_size(p_organization_id, 'platform.drill_rows', (q ->> 'limit')::integer, 50);
    if coalesce((q ->> 'offset')::integer, 0) < 0 then
      raise exception 'An offset is 0 or more.' using errcode = '22023';
    end if;
    v_params := v_params || jsonb_build_object('limit', v_cap, 'offset', coalesce((q ->> 'offset')::integer, 0));
    v_rows_cols := '{}';
    for k in select coalesce(x ->> 'from', x #>> '{}') from jsonb_array_elements(
               coalesce(q -> 'columns', case when v_records then v_c -> 'records' -> 'columns' end,
                        p_def -> 'detail' -> 'columns', '[]'::jsonb)) x loop
      -- a detail column is a column key, or a dimension's key
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'There is no column "%" these records can show.', k using errcode = '22023';
      end if;
      v_rows_cols := v_rows_cols || format('%L, %I.%I', k, v_col ->> 'alias', v_col ->> 'column');
    end loop;
    if jsonb_array_length(v_fact -> 'pk') = 1 then
      v_rows_cols := array[format('''id'', t.%I', v_fact -> 'pk' ->> 0)] || v_rows_cols;
    elsif jsonb_array_length(v_fact -> 'pk') > 1 then
      v_rows_cols := array[format('''id'', jsonb_build_object(%s)',
                     (select string_agg(format('%L, t.%I', x #>> '{}', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x))] || v_rows_cols;
    end if;
    -- order: the asked column, or the first time, then the key so pages never overlap
    v_order := '';
    if q ? 'sort' then
      k := q -> 'sort' ->> 'key';
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = k), k);
      v_col := v_cols -> v_x;
      if v_col is null then
        raise exception 'These records cannot be sorted by "%".', coalesce(k, '') using errcode = '22023';
      end if;
      v_order := format('%I.%I %s nulls last', v_col ->> 'alias', v_col ->> 'column',
                        case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end);
    else
      -- (records of a definer fact: newest first in the order the relation's own index reads, so a
      -- page reads only the latest rows)
      select format(case when v_records then '%I.%I desc' else '%I.%I desc nulls last' end,
                    v_cols -> (x ->> 'from') ->> 'alias', v_cols -> (x ->> 'from') ->> 'column')
        into v_order from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'kind' = 'time' limit 1;
    end if;
    v_order := concat_ws(', ', nullif(v_order, ''),
                 (select string_agg(format('t.%I', x #>> '{}'), ', ') from jsonb_array_elements(v_fact -> 'pk') x));
    if v_records and jsonb_array_length(v_fact -> 'pk') = 0 then
      -- a view has no key: its record columns, in their declared order, make the order total
      v_order := concat_ws(', ', nullif(v_order, ''),
                   (select string_agg(format('%I.%I desc', v_cols -> (x #>> '{}') ->> 'alias', v_cols -> (x #>> '{}') ->> 'column'), ', ' order by o)
                      from jsonb_array_elements(v_c -> 'records' -> 'columns') with ordinality z(x, o)));
    end if;
    v_sql := format($q$select count(*) over () as total, jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer$q$,
                    array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                    coalesce(nullif(v_order, ''), '1'));
    if v_records then
      -- one page, without counting the whole window for it (the total is count_sql's), and the
      -- window's sums of every Measure that adds up, over the SAME filter (the seat guard's sum)
      v_page := format($q$select coalesce(jsonb_agg(y.r), '[]'::jsonb) from (select jsonb_build_object(%s) as r from %s where %s order by %s limit ($1->>'limit')::integer offset ($1->>'offset')::integer) y$q$,
                       array_to_string(v_rows_cols, ', '), v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'),
                       coalesce(nullif(v_order, ''), '1'));
      v_sum := '{}';
      for m in select x from jsonb_array_elements(p_def -> 'measures') x loop
        if m ->> 'op' = 'count' and coalesce((m ->> 'additive')::boolean, true) then
          v_sum := v_sum || format('%L, count(*)', m ->> 'key');
        elsif m ->> 'op' = 'sum' and coalesce((m ->> 'additive')::boolean, true) and v_cols ? (m ->> 'of') then
          v_sum := v_sum || format('%L, sum(%I.%I)', m ->> 'key', v_cols -> (m ->> 'of') ->> 'alias', v_cols -> (m ->> 'of') ->> 'column');
        elsif m ->> 'op' = 'ratio' then
          v_sum := v_sum || format('%L, ((%s)::numeric / nullif((%s)::numeric, 0))', m ->> 'key',
            (select string_agg(case when pm ->> 'op' = 'count' then 'count(*)'
                                    else format('coalesce(sum(%I.%I), 0)', v_cols -> (pm ->> 'of') ->> 'alias', v_cols -> (pm ->> 'of') ->> 'column') end, ' + ')
               from jsonb_array_elements(m -> 'num') nk
               join lateral (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = nk #>> '{}') pmx(pm) on true),
            (select case when pm ->> 'op' = 'count' then 'count(*)'
                         else format('sum(%I.%I)', v_cols -> (pm ->> 'of') ->> 'alias', v_cols -> (pm ->> 'of') ->> 'column') end
               from jsonb_array_elements(p_def -> 'measures') pm where pm ->> 'key' = m ->> 'den'));
        end if;
      end loop;
      return jsonb_build_object(
        'page_sql', v_page,
        'sum_sql', format('select jsonb_build_object(%s) from %s where %s',
                          coalesce(nullif(array_to_string(v_sum, ', '), ''), '''count'', count(*)'), v_from,
                          coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
        'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset', 'as_of', v_asof,
        'columns', coalesce(q -> 'columns', v_c -> 'records' -> 'columns'));
    end if;
    return jsonb_build_object(
      'sql', format('select coalesce(max(x.total), 0)::bigint as total, coalesce(jsonb_agg(x.r order by x.n), ''[]''::jsonb) as rows from (select row_number() over () as n, y.* from (%s) y) x', v_sql),
      'count_sql', format('select count(*)::bigint from %s where %s', v_from, coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true')),
      'params', v_params, 'lane', v_lane, 'limit', v_cap, 'offset', v_params -> 'offset');
  end if;

  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- THE ANSWER
  -- ════════════════════════════════════════════════════════════════════════════════════════
  -- BY: dimension keys, `time:grain` for a period, outermost first.
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', p_def -> 'default' -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to group by.', k using errcode = '22023',
        hint = format('Dimensions: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'dimensions') x));
    end if;
    if d ->> 'kind' = 'time' then
      v_x := coalesce(nullif(split_part(k, ':', 2), ''), 'month');
      if not (c_steps ? v_x) or not (coalesce(d -> 'grains', '["year","quarter","month","week","day"]') ? v_x) then
        raise exception '% is not cut by "%".', d ->> 'label', v_x using errcode = '22023',
          hint = format('It is cut by %s.', (select string_agg(x #>> '{}', ', ') from jsonb_array_elements(coalesce(d -> 'grains', '["year","quarter","month","week","day"]')) x));
      end if;
      k := (d ->> 'key') || ':' || v_x;
    elsif position(':' in k) > 0 then
      raise exception '% is not a time, so it has no periods.', d ->> 'label' using errcode = '22023';
    else
      v_x := null;
    end if;
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k) then
      raise exception '"%" is asked twice.', k using errcode = '22023';
    end if;
    v_by := v_by || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from'))));
  end loop;
  if jsonb_array_length(v_by) > 4 then
    raise exception 'A question groups by at most four dimensions at once.' using errcode = '22023',
      hint = 'Drill into one group to go deeper.';
  end if;

  -- ACROSS: one dimension becomes the columns of a pivot.
  if q ? 'across' and jsonb_typeof(q -> 'across') = 'string' then
    k := q ->> 'across';
    d := (select x from jsonb_array_elements(p_def -> 'dimensions') x where x ->> 'key' = split_part(k, ':', 1));
    if d is null then
      raise exception 'There is no dimension "%" to pivot across.', k using errcode = '22023';
    end if;
    if d ->> 'cardinality' = 'high' then
      raise exception '% has too many values to become columns.', d ->> 'label' using errcode = '22023', hint = 'Group by it instead.';
    end if;
    v_x := case when d ->> 'kind' = 'time' then coalesce(nullif(split_part(k, ':', 2), ''), 'month') end;
    if v_x is not null and not (c_steps ? v_x) then
      raise exception '"%" is not a grain.', v_x using errcode = '22023';
    end if;
    k := (d ->> 'key') || coalesce(':' || v_x, '');
    if exists (select 1 from jsonb_array_elements(v_by) y where y ->> 'key' = k or y -> 'dim' ->> 'key' = d ->> 'key') then
      raise exception '"%" cannot be both a group and the columns.', k using errcode = '22023';
    end if;
    v_ax := jsonb_strip_nulls(jsonb_build_object('key', k, 'dim', d, 'grain', v_x, 'col', v_cols -> (d ->> 'from')));
  end if;
  v_has_by := jsonb_array_length(v_by) > 0;
  v_has_ax := v_ax is not null;

  -- SHOW: measure keys, or {op, of} over a column this definition reads.
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', p_def -> 'default' -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'string' then
      m := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = e #>> '{}');
      if m is null then
        raise exception 'There is no measure "%".', e #>> '{}' using errcode = '22023',
          hint = format('Measures: %s.', (select string_agg(x ->> 'key', ', ') from jsonb_array_elements(p_def -> 'measures') x));
      end if;
    elsif jsonb_typeof(e) = 'object' then
      if not coalesce(e ->> 'op', '') = any (c_ops) then
        raise exception '"%" is not a measure operation.', coalesce(e ->> 'op', '') using errcode = '22023',
          hint = format('Operations: %s.', array_to_string(c_ops, ', '));
      end if;
      v_x := coalesce((select y ->> 'from' from jsonb_array_elements(p_def -> 'dimensions') y where y ->> 'key' = e ->> 'of'), e ->> 'of');
      if e ->> 'op' <> 'count' and not (v_cols ? coalesce(v_x, '')) then
        raise exception 'There is no column "%" to measure.', coalesce(e ->> 'of', '') using errcode = '22023';
      end if;
      if e ->> 'op' in ('sum', 'avg', 'median') and v_cols -> v_x ->> 'cat' <> 'number' then
        raise exception '"%" is not a number, so it cannot be added up.', e ->> 'of' using errcode = '22023';
      end if;
      m := jsonb_strip_nulls(jsonb_build_object('key', case when e ->> 'op' = 'count' then 'count' else (e ->> 'op') || '_' || (e ->> 'of') end,
                                                'op', e ->> 'op', 'of', v_x));
    else
      raise exception 'A measure is its key, or {"op": …, "of": …}.' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = m ->> 'key') then
      continue;
    end if;
    if m ->> 'op' = 'ratio' then
      -- a ratio of this definition's own Measures (validated: each part a sum or a count)
      v_parts := '[]'::jsonb;
      v_j := 0;
      for v_x in select x #>> '{}' from jsonb_array_elements(m -> 'num') x loop
        v_j := v_j + 1;
        v_part := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = v_x);
        v_parts := v_parts || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('op', v_part ->> 'op', 'of', v_part ->> 'of', 'col', '_' || v_j)));
      end loop;
      v_part := (select x from jsonb_array_elements(p_def -> 'measures') x where x ->> 'key' = m ->> 'den');
      v_show := v_show || jsonb_build_array(jsonb_build_object(
        'key', m ->> 'key', 'op', 'ratio', 'cat', 'number', 'num_parts', v_parts,
        'den_part', jsonb_strip_nulls(jsonb_build_object('op', v_part ->> 'op', 'of', v_part ->> 'of', 'col', '_d'))));
      continue;
    end if;
    v_show := v_show || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'key', m ->> 'key', 'op', m ->> 'op', 'of', m ->> 'of', 'at_grain', m ->> 'at_grain',
      'cat', v_cols -> (m ->> 'of') ->> 'cat')));
  end loop;
  if jsonb_array_length(v_show) = 0 then
    v_show := '[{"key":"count","op":"count"}]';
  end if;

  -- SORT: a shown measure, or a grouped dimension. A time first dimension keeps its latest
  -- periods and reads in calendar order.
  if q ? 'sort' and jsonb_typeof(q -> 'sort') = 'object' then
    k := q -> 'sort' ->> 'key';
    if exists (select 1 from jsonb_array_elements(v_show) y where y ->> 'key' = k) then
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'desc')) = 'asc' then 'asc' else 'desc' end;
      v_sort := jsonb_build_object('measure', k);
    else
      v_i := (select o - 1 from jsonb_array_elements(v_by) with ordinality z(y, o)
               where y ->> 'key' = k or y -> 'dim' ->> 'key' = k limit 1);
      if v_i is null then
        raise exception 'The answer cannot be sorted by "%": sort by a measure it shows or a dimension it groups by.', coalesce(k, '')
          using errcode = '22023';
      end if;
      v_rank_dir := case when lower(coalesce(q -> 'sort' ->> 'direction', 'asc')) = 'desc' then 'desc' else 'asc' end;
      v_sort := jsonb_build_object('by', v_i);
    end if;
  elsif v_has_by and v_by -> 0 ->> 'grain' is not null then
    v_sort := jsonb_build_object('by', 0);
    v_rank_dir := 'desc';
    v_time_default := true;
  else
    v_sort := jsonb_build_object('measure', v_show -> 0 ->> 'key');
    v_rank_dir := 'desc';
  end if;

  v_cap := custom.page_size(p_organization_id, 'platform.drill_ask', (q ->> 'limit')::integer,
             coalesce((platform.knob_resolve('drill', 'groups_per_level', p_organization_id, v_me) #>> '{}')::integer, 100));
  v_acap := greatest(1, coalesce((platform.knob_resolve('drill', 'pivot_columns', p_organization_id, v_me) #>> '{}')::integer, 24));
  v_params := v_params || jsonb_build_object('cap', v_cap, 'acap', v_acap);

  -- ── src: one row per fact row that passes, with its group values ────────────────────────
  v_sel := array[case when v_cmp is not null then 'sd.side' else '''w''::text' end || ' as side'];
  v_gk := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_ref := format('%I.%I', e -> 'col' ->> 'alias', e -> 'col' ->> 'column');
    if e ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, e -> 'col' ->> 'type'), e ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as ps%s', v_x, v_i);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws),
          'pps_' || (e ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, e ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as d%s', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (e ->> 'grain'), 'pps_' || (e ->> 'grain')),
                   e ->> 'grain'), v_i);
      else
        v_sel := v_sel || format('%s as d%s', v_x, v_i);
      end if;
    else
      v_sel := v_sel || format('%s as d%s', v_ref, v_i);
    end if;
    v_gk := v_gk || format('s.d%s', v_i);
  end loop;
  if v_has_ax then
    v_ref := format('%I.%I', v_ax -> 'col' ->> 'alias', v_ax -> 'col' ->> 'column');
    if v_ax ? 'grain' then
      v_x := platform._drill_period_sql(platform._drill_local_sql(v_ref, v_ax -> 'col' ->> 'type'), v_ax ->> 'grain', v_shift);
      v_sel := v_sel || format('%s as aps', v_x);
      if v_cmp is not null then
        v_params := v_params || jsonb_build_object('wps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'wf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws),
          'pps_' || (v_ax ->> 'grain'),
          custom.agg_period_start((v_params ->> 'pf')::timestamptz at time zone v_tz, v_ax ->> 'grain', v_ws));
        v_sel := v_sel || format('%s as ax', platform._drill_ordinal_sql(v_x,
                   format('(case sd.side when ''w'' then ($1->>%L) else ($1->>%L) end)::timestamp', 'wps_' || (v_ax ->> 'grain'), 'pps_' || (v_ax ->> 'grain')),
                   v_ax ->> 'grain'));
      else
        v_sel := v_sel || format('%s as ax', v_x);
      end if;
    else
      v_sel := v_sel || format('%s as ax', v_ref);
    end if;
  end if;
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ->> 'op' = 'ratio' then
      for v_part in select x from jsonb_array_elements(m -> 'num_parts') x union all select m -> 'den_part' loop
        if v_part ->> 'op' <> 'count' then
          v_col := v_cols -> (v_part ->> 'of');
          v_sel := v_sel || format('%I.%I as m%s%s', v_col ->> 'alias', v_col ->> 'column', v_i, v_part ->> 'col');
        end if;
      end loop;
      continue;
    end if;
    if m ->> 'op' <> 'count' then
      v_col := v_cols -> (m ->> 'of');
      v_sel := v_sel || format('%I.%I as m%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
    if m ? 'at_grain' then
      v_col := v_cols -> (m ->> 'at_grain');
      v_sel := v_sel || format('%I.%I as g%s', v_col ->> 'alias', v_col ->> 'column', v_i);
    end if;
  end loop;

  -- the sort's own aggregate over src (the ranking of groups)
  if v_sort ? 'measure' then
    v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = v_sort ->> 'measure');
    v_rank_expr := case when v_show -> (v_i - 1) ->> 'op' = 'ratio'
                     then platform._drill_ratio_sql(v_show -> (v_i - 1), 's.m' || v_i, case when v_cmp is not null then 's.side = ''w''' end)
                     else platform._drill_agg_sql(v_show -> (v_i - 1), 's.m' || v_i, null,
                            case when v_cmp is not null then 's.side = ''w''' end) end;
  end if;

  -- ── HAVING: thresholds on the groups (decision 25), judged on the current window and applied
  --    BEFORE the cut into Other: a group that misses one is added into Other with the groups past
  --    the cap, so the answer still adds up to its total and says how many groups met the rule.
  if q ? 'having' and jsonb_typeof(q -> 'having') <> 'null' then
    if jsonb_typeof(q -> 'having') <> 'array' then
      raise exception 'having is a list of thresholds.' using errcode = '22023';
    end if;
    if jsonb_array_length(q -> 'having') > 0 and not v_has_by then
      raise exception 'A threshold is on groups, so the question must group by something.' using errcode = '22023';
    end if;
    v_j := 0;
    for e in select x from jsonb_array_elements(q -> 'having') x loop
      v_j := v_j + 1;
      v_i := (select o from jsonb_array_elements(v_show) with ordinality z(y, o) where y ->> 'key' = e ->> 'measure');
      if v_i is null then
        raise exception 'A threshold''s measure "%" must also be shown.', coalesce(e ->> 'measure', '') using errcode = '22023';
      end if;
      m := v_show -> (v_i - 1);
      if m ? 'at_grain' then
        raise exception 'A threshold cannot read "%", which is counted once per %.', m ->> 'key', m ->> 'at_grain' using errcode = '22023';
      end if;
      if coalesce(e ->> 'op', '') not in ('>=', '>') then
        raise exception 'A threshold''s op is ">=" or ">".' using errcode = '22023';
      end if;
      if (case when e ? 'value' then 1 else 0 end) + (case when e ? 'share_of_total' then 1 else 0 end) + (case when e ? 'times_median' then 1 else 0 end) <> 1 then
        raise exception 'A threshold has exactly one of value, share_of_total and times_median.' using errcode = '22023';
      end if;
      -- the line: a setting when the threshold names one (organizations decide), else its own number
      begin
        v_x := case when e ? 'knob' then platform.drill_knob(p_organization_id, e ->> 'knob')::text
                    else coalesce(e ->> 'value', e ->> 'share_of_total', e ->> 'times_median') end;
        perform v_x::numeric;
      exception when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'A threshold''s line is a number.' using errcode = '22023';
      end;
      v_hv := v_hv || to_jsonb(v_x::numeric);
      v_hsel := v_hsel || format('%s as hv%s',
        case when m ->> 'op' = 'ratio' then platform._drill_ratio_sql(m, 's.m' || v_i, 's.side = ''w''')
             else platform._drill_agg_sql(m, 's.m' || v_i, null, 's.side = ''w''') end, v_j);
      if e ? 'share_of_total' then
        if not (m ->> 'op' in ('sum', 'count')) or not coalesce(((select y from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key') ->> 'additive')::boolean, m ->> 'op' in ('sum', 'count')) then
          raise exception 'A share of the total needs a measure that adds up across groups; "%" does not.', m ->> 'key' using errcode = '22023';
        end if;
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric / 100 * sum(bg.hv%1$s) over ()', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s%% of the total', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' else 'more than' end, trim_scale(v_x::numeric));
      elsif e ? 'times_median' then
        v_hmed := v_hmed || format('percentile_cont(0.5) within group (order by hv%1$s) filter (where hv%1$s is not null%2$s) as md%1$s',
                                   v_j, case when coalesce((e ->> 'median_nonzero')::boolean, false) then format(' and hv%s > 0', v_j) else '' end);
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric * bm.md%1$s', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s × the median group%s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' else 'more than' end, trim_scale(v_x::numeric),
                                     case when coalesce((e ->> 'median_nonzero')::boolean, false) then ' above zero' else '' end);
      else
        v_hok := v_hok || format('bg.hv%1$s %2$s ($1->''hv''->>%3$s)::numeric', v_j, e ->> 'op', v_j - 1);
        v_hsays := v_hsays || format('%s %s %s', lower(coalesce((select y ->> 'label' from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = m ->> 'key'), m ->> 'key')),
                                     case e ->> 'op' when '>=' then 'at least' else 'more than' end, trim_scale(v_x::numeric));
      end if;
    end loop;
    v_params := v_params || jsonb_build_object('hv', v_hv);
  end if;

  -- ── the statement ─────────────────────────────────────────────────────────────────────────
  v_sql := format('with src as (select %s from %s where %s)', array_to_string(v_sel, ', '), v_from,
                  coalesce(nullif(array_to_string(v_preds, ' and '), ''), 'true'));
  -- s2: the group key as one jsonb value (hashable), the across value likewise
  v_sql := v_sql || format(', s2 as (select s.*, %s as gk0, %s as av0 from src s)',
             case when v_has_by then 'jsonb_build_array(' || array_to_string(v_gk, ', ') || ')' else '''[]''::jsonb' end,
             case when v_has_ax then 'coalesce(to_jsonb(s.ax), ''null''::jsonb)' else 'null::jsonb' end);
  -- the ranking of groups: by the current window's value; a group only the prior window has
  -- ranks after every current one. Ties break on the key, so top-N is the same on every call.
  v_sql := v_sql || format(', bg as (select s.gk0 as gk, %s as sv, count(*) filter (where s.side = ''w'') as c, count(*) as c_all%s from s2 s group by s.gk0)',
             case when v_sort ? 'measure' then v_rank_expr else 'null::numeric' end,
             case when cardinality(v_hsel) > 0 then ', ' || array_to_string(v_hsel, ', ') else '' end);
  -- bh: which groups meet every threshold (all of them when the question names none)
  if cardinality(v_hmed) > 0 then
    v_sql := v_sql || format(', bm as (select %s from bg)', array_to_string(v_hmed, ', '));
  end if;
  v_sql := v_sql || format(', bh as (select bg.*, %s as ok from bg%s)',
             case when cardinality(v_hok) > 0 then format('(bg.c > 0 and coalesce(%s, false))', array_to_string(v_hok, ' and ')) else 'true' end,
             case when cardinality(v_hmed) > 0 then ' cross join bm' else '' end);
  v_sql := v_sql || format(', br as (select gk, ok, row_number() over (order by (not ok), %s, gk) as rn, count(*) filter (where c > 0 and ok) over () as n, count(*) filter (where c > 0) over () as n_all from bh)',
             case when v_sort ? 'measure' then format('sv %s nulls last, c desc, c_all desc', v_rank_dir)
                  else format('(gk->%s) %s nulls last', v_sort ->> 'by', v_rank_dir) end);
  if v_has_ax then
    v_sql := v_sql || ', ag as (select s.av0 as av, count(*) filter (where s.side = ''w'') as c, count(*) as c_all from s2 s group by s.av0)';
    v_sql := v_sql || format(', ar as (select av, row_number() over (order by %s, c desc, c_all desc, av) as arn, count(*) filter (where c > 0) over () as n from ag)',
               case when v_ax ? 'grain' then 'av asc' else 'c desc' end);
  end if;
  -- tg: fold every group past the cap into Other, every across value past its cap into one column
  v_sql := v_sql || format(', tg as (select s.*, br.rn, case when br.rn <= ($1->>''cap'')::integer and br.ok then br.gk end as gk, (br.rn > ($1->>''cap'')::integer or not br.ok) as is_other%s from s2 s join br on br.gk = s.gk0%s)',
             case when v_has_ax then ', ar.arn, case when ar.arn <= ($1->>''acap'')::integer then ar.av else ''{"other":true}''::jsonb end as av' else '' end,
             case when v_has_ax then ' join ar on ar.av = s.av0' else '' end);
  -- tg2: at_grain flags, one per grouping-set shape, on the FOLDED keys
  v_sel := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    continue when not (m ? 'at_grain');
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk%s, t.g%s order by t.m%s nulls last) = 1) as f%s_c',
                             case when v_has_ax then ', t.av' else '' end, v_i, v_i, v_i);
    if v_has_ax then
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.is_other, t.gk, t.g%s order by t.m%s nulls last) = 1) as f%s_g', v_i, v_i, v_i);
      v_sel := v_sel || format('(row_number() over (partition by t.side, t.av, t.g%s order by t.m%s nulls last) = 1) as f%s_a', v_i, v_i, v_i);
    end if;
    v_sel := v_sel || format('(row_number() over (partition by t.side, t.g%s order by t.m%s nulls last) = 1) as f%s_t', v_i, v_i, v_i);
  end loop;
  v_sql := v_sql || format(', tg2 as (select t.*%s from tg t)',
             case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end);

  -- the grouping sets, and each measure chosen per set
  v_sets := case
    when v_has_by and v_has_ax then '(side, is_other, gk, av), (side, is_other, gk), (side, av), (side)'
    when v_has_by then '(side, is_other, gk), (side)'
    when v_has_ax then '(side, av), (side)'
    else '(side)' end;
  v_meas := '{}';
  v_i := 0;
  for m in select x from jsonb_array_elements(v_show) x loop
    v_i := v_i + 1;
    if m ? 'at_grain' then
      v_x := format('case %s else %s end',
        case
          when v_has_by and v_has_ax then format('when grouping(gk) = 0 and grouping(av) = 0 then %s when grouping(gk) = 0 then %s when grouping(av) = 0 then %s',
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_g'),
                                                platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_a'))
          when v_has_by then format('when grouping(gk) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          when v_has_ax then format('when grouping(av) = 0 then %s', platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_c'))
          else 'when false then null' end,
        platform._drill_agg_sql(m, 'm' || v_i, 'f' || v_i || '_t'));
    elsif m ->> 'op' = 'ratio' then
      v_x := platform._drill_ratio_sql(m, 'm' || v_i, null);
    else
      v_x := platform._drill_agg_sql(m, 'm' || v_i, null);
    end if;
    v_meas := v_meas || format('%L, (%s)', m ->> 'key', v_x);
    v_zero := v_zero || jsonb_build_object(m ->> 'key',
                case when m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') then to_jsonb(0) else 'null'::jsonb end);
    if coalesce(m ->> 'cat', 'number') = 'number' or m ->> 'op' in ('count', 'count_distinct', 'filled', 'empty') then
      v_delta := v_delta || format($d$%1$L, jsonb_build_object('current', (c.measures->>%1$L)::numeric, 'prior', (p.measures->>%1$L)::numeric,
                                 'change', (c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric,
                                 'change_pct', case when (p.measures->>%1$L)::numeric is null or (c.measures->>%1$L)::numeric is null or (p.measures->>%1$L)::numeric = 0 then null
                                                    else round(((c.measures->>%1$L)::numeric - (p.measures->>%1$L)::numeric) / abs((p.measures->>%1$L)::numeric) * 100, 1) end)$d$,
                                 m ->> 'key');
    end if;
  end loop;
  v_params := v_params || jsonb_build_object('zero', v_zero);

  -- the time labels of each group (the period start, read as the store's label)
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    if e ? 'grain' then
      v_sel := v_sel || format('min(case when not is_other then ps%s end) as lbl%s', v_i, v_i);
    end if;
  end loop;
  if v_has_ax and v_ax ? 'grain' then
    v_sel := v_sel || 'min(case when av <> ''{"other":true}''::jsonb then aps end) as albl'::text;
  end if;
  v_sql := v_sql || format(', agg as (select side, %s as gg, %s as ga, %s as is_other, %s as gk, %s as av, min(rn) as rn, %s as arn%s, jsonb_build_object(%s) as measures, count(*)::bigint as row_count from tg2 group by grouping sets (%s))',
    case when v_has_by then 'grouping(gk)' else '1' end,
    case when v_has_ax then 'grouping(av)' else '1' end,
    case when v_has_by then 'is_other' else 'false' end,
    case when v_has_by then 'gk' else 'null::jsonb' end,
    case when v_has_ax then 'av' else 'null::jsonb' end,
    case when v_has_ax then 'min(arn)' else 'null::bigint' end,
    case when cardinality(v_sel) > 0 then ', ' || array_to_string(v_sel, ', ') else '' end,
    array_to_string(v_meas, ', '), v_sets);

  -- groups: each asked key -> its value (a period as its label); Other and totals carry none;
  -- a pivot cell and a column total carry the across key.
  v_sel := '{}';
  v_i := 0;
  for e in select x from jsonb_array_elements(v_by) x loop
    v_i := v_i + 1;
    v_sel := v_sel || format('%L, %s', e ->> 'key',
      case when e ? 'grain' then platform._drill_label_sql('X.lbl' || v_i) else format('X.gk->%s', v_i - 1) end);
  end loop;
  v_grp := format('(case when X.gg = 0 and not X.is_other then jsonb_build_object(%s) else ''{}''::jsonb end)%s',
    case when cardinality(v_sel) > 0 then array_to_string(v_sel, ', ') else '' end,
    case when v_has_ax then format(' || (case when X.ga = 0 then jsonb_build_object(%L, %s) else ''{}''::jsonb end)', v_ax ->> 'key',
           case when v_ax ? 'grain' then format('case when X.av = ''{"other":true}''::jsonb then X.av else to_jsonb(%s) end', platform._drill_label_sql('X.albl'))
                else 'X.av' end)
         else '' end);

  v_order := format('case when %1$s.gg = 1 then 2 when %1$s.is_other then 1 else 0 end, %2$s, %1$s.ga desc, %1$s.arn nulls first',
                    'Y', case when v_time_default then 'Y.rn desc' else 'Y.rn' end);

  if v_cmp is null then
    v_sql := v_sql || format($q$ select row_number() over (order by %s) as ord,
        case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
        %s as groups, Y.measures, Y.row_count,
        null::jsonb as prior_groups, null::jsonb as prior_measures, null::bigint as prior_row_count, null::jsonb as delta, null::jsonb as compare,
        (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
      from agg Y$q$,
      v_order, replace(v_grp, 'X.', 'Y.'),
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  else
    -- the same question over both windows, matched by the group (a period by its position)
    v_sql := v_sql || format($q$, cur as (select * from agg where side = 'w'), pri as (select * from agg where side = 'p'),
      j as (select coalesce(c.gg, p.gg) as gg, coalesce(c.ga, p.ga) as ga, coalesce(c.is_other, p.is_other) as is_other,
                   coalesce(c.rn, p.rn) as rn, coalesce(c.arn, p.arn) as arn,
                   case when c.side is not null then %s end as groups, coalesce(c.measures, $1->'zero') as measures, coalesce(c.row_count, 0) as row_count,
                   case when p.side is not null then %s end as prior_groups, coalesce(p.measures, $1->'zero') as prior_measures, coalesce(p.row_count, 0) as prior_row_count,
                   jsonb_build_object(%s) as delta,
                   ($1->'cmp') || jsonb_build_object('position', %s) as compare
              from cur c full join pri p
                on c.gg = p.gg and c.ga = p.ga and c.is_other is not distinct from p.is_other
               and c.gk is not distinct from p.gk and c.av is not distinct from p.av)
      select row_number() over (order by %s) as ord,
             case when Y.gg = 1 then 'total' when Y.is_other then 'other' else 'group' end as kind,
             Y.groups, Y.measures, Y.row_count, Y.prior_groups, Y.prior_measures, Y.prior_row_count, Y.delta, Y.compare,
             (select max(n) from br)::bigint as distinct_groups, %s as distinct_across, (select max(n_all) from br)::bigint as distinct_all
        from j Y$q$,
      replace(v_grp, 'X.', 'c.'), replace(v_grp, 'X.', 'p.'),
      replace(replace(array_to_string(v_delta, ', '), 'c.measures', 'coalesce(c.measures, $1->''zero'')'), 'p.measures', 'coalesce(p.measures, $1->''zero'')'),
      coalesce((select format('coalesce(c.gk, p.gk)->%s', o - 1) from jsonb_array_elements(v_by) with ordinality z(y, o) where y ? 'grain' limit 1), 'null'),
      v_order,
      case when v_has_ax then '(select max(n) from ar)::bigint' else 'null::bigint' end);
  end if;

  -- relation dimensions of this answer: their targets, so labels are read as the seat
  for e in select x from jsonb_array_elements(v_by || coalesce(jsonb_build_array(v_ax), '[]')) x loop
    continue when e is null or e -> 'dim' ->> 'kind' <> 'relation' or not (e -> 'col' ? 'fk');
    continue when e -> 'col' -> 'fk' ->> 'title' is null;
    v_rel := v_rel || jsonb_build_array(jsonb_build_object('key', e ->> 'key',
               'schema', e -> 'col' -> 'fk' ->> 'schema', 'table', e -> 'col' -> 'fk' ->> 'table',
               'to', e -> 'col' -> 'fk' ->> 'to', 'title', e -> 'col' -> 'fk' ->> 'title',
               'uuid', (platform._drill_column(e -> 'col' -> 'fk' ->> 'schema', e -> 'col' -> 'fk' ->> 'table', e -> 'col' -> 'fk' ->> 'to') ->> 'cat') = 'uuid'));
  end loop;

  return jsonb_build_object(
    'sql', v_sql, 'params', v_params, 'lane', v_lane, 'cap', v_cap, 'acap', v_acap, 'zero', v_zero,
    'by', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_by) x),
    'across', v_ax ->> 'key',
    'show', (select coalesce(jsonb_agg(x ->> 'key'), '[]') from jsonb_array_elements(v_show) x),
    'relations', v_rel,
    'sort_label', case when v_sort ? 'measure' then (select coalesce(y ->> 'label', y ->> 'key') from jsonb_array_elements(p_def -> 'measures') y where y ->> 'key' = v_sort ->> 'measure')
                       else v_by -> (v_sort ->> 'by')::integer -> 'dim' ->> 'label' end,
    'time_first', v_time_default,
    'compare', v_cmp,
    'having_says', case when cardinality(v_hsays) > 0 then array_to_string(v_hsays, ' and ') end);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 10. THE SIGNED-IN STEPS — records are routed to the definer step; every answer says as of.
-- ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION platform._drill_plan(p_organization_id uuid, p_source jsonb, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  c_steps constant jsonb := '{"day":"1 day","week":"7 days","month":"1 month","quarter":"3 months","year":"1 year"}';
  q       jsonb := coalesce(p_question, '{}'::jsonb);
  v_def   jsonb;
  v_plan  jsonb;
  v_kind  text := p_source ->> 'kind';
  v_d2    boolean := to_regprocedure('custom.table_dimensions(uuid,uuid)') is not null;
  v_gb    jsonb := '[]';
  v_bk    jsonb;
  v_meas  jsonb := '[]';
  v_filt  jsonb := '{}';
  v_cmp   jsonb;
  e       jsonb;
  k       text;
  v_x     text;
  v_tz    text;
begin
  if p_kind not in ('describe', 'ask', 'rows') then
    raise exception '"%" is not something the drill doors do.', p_kind using errcode = '22023';
  end if;
  perform custom.assert_client_may_reach(p_organization_id, 'platform.drill_' || p_kind);
  if p_source is null or jsonb_typeof(p_source) <> 'object' or v_kind not in ('table', 'entity') then
    raise exception 'A source is {"kind": "table", "id": <a custom Table>} or {"kind": "entity", "token": <a standard table or a declared definition>}.'
      using errcode = '22023';
  end if;

  if v_kind = 'entity' then
    v_def := platform._drill_resolve(p_organization_id, p_source ->> 'token');
    if p_kind = 'describe' then
      return jsonb_build_object('def', v_def - '_c');
    end if;
    if v_def ->> 'mode' = 'definer' and p_kind = 'ask' then
      -- the answer is computed by platform._drill_run_declared, which re-resolves by key
      return jsonb_build_object('def', v_def - '_c', 'mode', 'definer');
    end if;
    -- A declared definer definition that names its RECORDS relation (decision 14) has its records
    -- read by platform._drill_run_declared: definer, the SAME filter compiler and the SAME lane rule
    -- the ask used, re-resolved by key.
    if p_kind = 'rows' and v_def ->> 'mode' = 'definer' and v_def -> '_c' ? 'records' then
      return jsonb_build_object('def', v_def - '_c', 'mode', 'definer', 'records', true);
    end if;
    -- Otherwise "see these records" is read as the seat. A declared definer fact the seat cannot read
    -- at all (a server-only rollup, lane DRILL-USAGE-PAGE) with no records relation has no records to
    -- open; say so in words rather than a permission error.
    if p_kind = 'rows' and v_def ->> 'mode' = 'definer'
       and not has_table_privilege(custom.caller_role(),
             format('%I.%I', v_def -> '_c' -> 'fact' ->> 'schema', v_def -> '_c' -> 'fact' ->> 'table'), 'select') then
      raise exception '"%" is counted from a summary only the platform reads, so its records cannot be listed here.', v_def ->> 'label'
        using errcode = '0A000',
              hint = coalesce(v_def -> 'detail' ->> 'open', 'Open the records from the screen that owns them.');
    end if;
    return platform._drill_compile(p_organization_id, v_def, q, p_kind)
           || jsonb_build_object('def', v_def - '_c', 'mode', v_def ->> 'mode');
  end if;

  -- ── A CUSTOM TABLE: the question, as custom.record_aggregate's arguments ─────────────────
  if (p_source ->> 'id') !~ '^[0-9a-fA-F-]{36}$' then
    raise exception 'A custom Table is named by its id.' using errcode = '22023';
  end if;
  if p_kind = 'describe' then
    return jsonb_build_object('d2', v_d2);
  end if;
  for k in select jsonb_object_keys(q) loop
    if not (k = any (array['by','show','where','window','compare','sort','limit','offset','lane','across','columns','path'])) then
      raise exception '"%" is not part of a question.', k using errcode = '22023';
    end if;
  end loop;
  if coalesce(q ->> 'lane', 'organization') <> 'organization' then
    raise exception 'A custom Table is counted in its organization''s lane; the other lanes come with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
  end if;
  if q ? 'across' and jsonb_typeof(q -> 'across') <> 'null' then
    raise exception 'A custom Table does not pivot yet; that comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000',
      hint = 'Group by both dimensions instead.';
  end if;
  v_tz := custom.agg_calendar(p_organization_id) ->> 'time_zone';

  -- where (+ a clicked period) + window -> the store's own flat filter
  for k, e in select key, value from jsonb_each(coalesce(q -> 'where', '{}'::jsonb)) loop
    if jsonb_typeof(e) = 'array' then
      raise exception 'A custom Table''s filter takes one value per column; a list comes with lane DRILL-CUSTOM-PARITY.' using errcode = '0A000';
    end if;
    if position(':' in k) > 0 then
      v_x := split_part(k, ':', 2);
      if not (c_steps ? v_x) or jsonb_typeof(e) <> 'string' then
        raise exception '"%" is a period filter: a date column, a grain, and the period''s label.', k using errcode = '22023';
      end if;
      e := jsonb_build_object('from', (e #>> '{}')::timestamptz,
                              'to', (((e #>> '{}')::timestamptz at time zone v_tz) + (c_steps ->> v_x)::interval) at time zone v_tz);
      k := split_part(k, ':', 1);
    end if;
    v_filt := v_filt || jsonb_build_object(k, e);
  end loop;
  if jsonb_typeof(q -> 'window') = 'object' and (q -> 'window') ? 'key' then
    e := q -> 'window';
    if e ? 'preset' then
      v_x := e ->> 'preset';
      if v_x !~ '^[0-9]{1,4}(h|d)$' then
        raise exception '"%" is not a window: 24h, 7d, 30d, 90d or 365d.', v_x using errcode = '22023';
      end if;
      e := jsonb_build_object('from', now() - (left(v_x, -1) || case right(v_x, 1) when 'h' then ' hours' else ' days' end)::interval, 'to', now());
    end if;
    v_filt := v_filt || jsonb_build_object(q -> 'window' ->> 'key', jsonb_strip_nulls(jsonb_build_object('from', e -> 'from', 'to', e -> 'to')));
  end if;

  -- by -> groups + at most one period
  for e in select x from jsonb_array_elements(coalesce(q -> 'by', '[]'::jsonb)) x loop
    k := e #>> '{}';
    if position(':' in k) > 0 then
      if v_bk is not null then
        raise exception 'A custom Table is cut by one period at a time.' using errcode = '0A000';
      end if;
      v_bk := jsonb_build_object('key', split_part(k, ':', 1), 'by', split_part(k, ':', 2));
    else
      v_gb := v_gb || to_jsonb(k);
    end if;
  end loop;

  -- show -> the store's measures ({op, key}); a named Measure passes once D2 reads names
  for e in select x from jsonb_array_elements(coalesce(q -> 'show', '["count"]'::jsonb)) x loop
    if jsonb_typeof(e) = 'object' then
      v_meas := v_meas || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'op', case e ->> 'op' when 'count_distinct' then 'unique' else e ->> 'op' end,
        'key', coalesce(e ->> 'of', e ->> 'key'))));
    elsif e #>> '{}' = 'count' then
      v_meas := v_meas || '[{"op":"count"}]'::jsonb;
    elsif (e #>> '{}') ~ '^(sum|avg|min|max|median|filled|empty|unique)_[a-zA-Z_][a-zA-Z0-9_]*$' then
      v_meas := v_meas || jsonb_build_array(jsonb_build_object(
        'op', split_part(e #>> '{}', '_', 1), 'key', substr(e #>> '{}', length(split_part(e #>> '{}', '_', 1)) + 2)));
    elsif v_d2 then
      v_meas := v_meas || jsonb_build_array(e);
    else
      raise exception 'There is no measure "%" on this table yet.', e #>> '{}' using errcode = '22023',
        hint = 'Name it as op_field (sum_amount), or count.';
    end if;
  end loop;

  if q ? 'compare' and jsonb_typeof(q -> 'compare') <> 'null' then
    v_cmp := case when jsonb_typeof(q -> 'compare') = 'string' then jsonb_build_object('against', q ->> 'compare') else q -> 'compare' end;
    if v_cmp ->> 'against' in ('prev', 'previous') then v_cmp := v_cmp || '{"against":"previous_period"}'; end if;
    if v_cmp ->> 'against' = 'yoy' then v_cmp := v_cmp || '{"against":"same_period_last_year"}'; end if;
    if not v_cmp ? 'key' and q -> 'window' ? 'key' then
      v_cmp := v_cmp || jsonb_build_object('key', q -> 'window' ->> 'key');
    end if;
  end if;

  if q ? 'sort' and not (q -> 'sort' ->> 'key' = 'count'
                         or (q -> 'sort' ->> 'key') = any (select x #>> '{}' from jsonb_array_elements(coalesce(q -> 'by', '[]')) x)) then
    raise exception 'A custom Table ranks its groups by their count until lane DRILL-CUSTOM-PARITY; sort by count or by a grouped column.'
      using errcode = '0A000';
  end if;

  return jsonb_build_object('delegate', jsonb_strip_nulls(jsonb_build_object(
    'group_by', v_gb, 'measures', v_meas, 'bucket', v_bk, 'filter', v_filt,
    'limit', coalesce((q ->> 'limit')::integer, 200), 'compare', v_cmp)),
    'sort', q -> 'sort', 'by', coalesce(q -> 'by', '[]'), 'lane', 'organization',
    'columns', q -> 'columns', 'offset', coalesce((q ->> 'offset')::integer, 0));
end
$function$;

CREATE OR REPLACE FUNCTION platform._drill_run_declared(p_organization_id uuid, p_key text, p_question jsonb, p_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_def  jsonb;
  v_plan jsonb;
  v_rows jsonb;
  v_n    bigint;
  v_asof timestamptz;
  v_sums jsonb;
  v_off  integer;
  v_cnt  jsonb;
  v_keys jsonb;
  v_set  jsonb := '{}'::jsonb;
  v_part text[] := '{}';
  v_says text;
  m      jsonb;
  v_d    numeric;
begin
  perform custom.assert_client_may_reach(p_organization_id, case when p_kind = 'rows' then 'platform.drill_rows' else 'platform.drill_ask' end);
  if p_kind not in ('ask', 'count', 'rows') then
    raise exception 'A declared fact is answered (ask), counted (count) or listed (rows) here.' using errcode = '22023';
  end if;
  -- re-resolved by KEY, validated again (platform.drill_definition_problems), never taken from a caller
  v_def := platform._drill_resolve(p_organization_id, p_key);
  if v_def ->> 'mode' is distinct from 'definer' then
    raise exception '"%" is read through the table''s own row security; ask platform.drill_ask.', p_key using errcode = '22023';
  end if;
  -- AS OF: how far the fact has counted (its <table>_watermark), so every answer says its moment
  if v_def -> '_c' ? 'watermark' then
    execute format('select max(covered_to) from %s', v_def -> '_c' ->> 'watermark') into v_asof;
  end if;
  if p_kind = 'rows' then
    -- THE RECORDS of a definer definition (decision 14): the declared records relation, the SAME
    -- compiler, filter and lane rule as the number; a window is required; cut at the same as_of.
    if not (v_def -> '_c' ? 'records') then
      raise exception '"%" declares no records relation, so its records are read as you.', p_key using errcode = '22023';
    end if;
    v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'rows');
    execute v_plan ->> 'count_sql' into v_n using v_plan -> 'params';
    execute v_plan ->> 'page_sql' into v_rows using v_plan -> 'params';
    v_off := (v_plan ->> 'offset')::integer;
    if v_off = 0 then
      -- the window's sums over the same filter, once (the first page): what these records add up to
      execute v_plan ->> 'sum_sql' into v_sums using v_plan -> 'params';
      -- AND THE NUMBER'S OWN SUMS for the same filter, as counted (decision 14 as amended by
      -- VERIFY-DRILL-LEDGER-RECORDS F1): a cost can land on a counted row after the count, so the
      -- records (the ledger now) and the number (the count as of as_of) are equal as of the count
      -- and any difference is SAID, measure by measure, never left for a person to discover.
      select coalesce(jsonb_agg(x -> 'key'), '[]'::jsonb) into v_keys
        from jsonb_array_elements(v_def -> 'measures') x
       where x ->> 'op' in ('sum', 'count') and coalesce((x ->> 'additive')::boolean, true) and v_sums ? (x ->> 'key');
      if jsonb_array_length(v_keys) > 0 then
        v_cnt := platform._drill_compile(p_organization_id, v_def,
                   (coalesce(p_question, '{}'::jsonb) - 'limit' - 'offset' - 'sort' - 'columns' - 'having')
                   || jsonb_build_object('by', '[]'::jsonb, 'show', v_keys), 'ask');
        execute format('select x.measures from (%s) x where x.kind = ''total'' limit 1', v_cnt ->> 'sql')
          into v_cnt using v_cnt -> 'params';
        for m in select x from jsonb_array_elements(v_def -> 'measures') x where v_keys ? (x ->> 'key') loop
          v_d := coalesce((v_sums ->> (m ->> 'key'))::numeric, 0) - coalesce((v_cnt ->> (m ->> 'key'))::numeric, 0);
          continue when v_d = 0;
          v_set := v_set || jsonb_build_object(m ->> 'key', jsonb_build_object(
                     'counted', v_cnt -> (m ->> 'key'), 'now', v_sums -> (m ->> 'key'), 'difference', v_d));
          v_part := v_part || (case when m ->> 'unit' = 'usd'
                                    then '$' || to_char(abs(v_d), 'FM999,999,999,990.00')
                                    else to_char(abs(v_d), 'FM999,999,999,999,990') || ' ' || lower(coalesce(m ->> 'label', m ->> 'key')) end
                               || case when v_d > 0 then ' more has landed' else ' has come off' end);
        end loop;
        if cardinality(v_part) > 0 then
          v_says := format('%s since the count at %s UTC. These records show the ledger now; the number shows the count until the next recount.',
                           array_to_string(v_part, '; '), to_char((v_plan ->> 'as_of')::timestamptz at time zone 'UTC', 'HH24:MI'));
        end if;
      end if;
    end if;
    -- (a record's empty value stays null: only the page's own absent keys are left out)
    return jsonb_build_object('total', v_n, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
                              'columns', v_plan -> 'columns', 'as_of', v_plan -> 'as_of')
      || case when v_off + jsonb_array_length(v_rows) < v_n
              then jsonb_build_object('next_offset', v_off + jsonb_array_length(v_rows)) else '{}'::jsonb end
      || case when v_sums is not null then jsonb_build_object('measures', v_sums) else '{}'::jsonb end
      || case when v_cnt is not null then jsonb_build_object('counted', v_cnt) else '{}'::jsonb end
      || case when v_set <> '{}'::jsonb then jsonb_build_object('settling', v_set, 'says', v_says) else '{}'::jsonb end;
  end if;
  if p_kind = 'count' then
    v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'rows');
    execute v_plan ->> 'count_sql' into v_n using v_plan -> 'params';
    return jsonb_build_object('total', v_n);
  end if;
  v_plan := platform._drill_compile(p_organization_id, v_def, p_question, 'ask');
  execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
    into v_rows using v_plan -> 'params';
  return (v_plan - 'sql' - 'params') || jsonb_build_object('rows', v_rows, 'def', v_def - '_c', 'mode', 'definer', 'as_of', v_asof);
end
$function$;

-- ─────────────────────────────────────────────────────────────────────────────────────────
-- 11. THE DOORS — drill_ask gains a column (as_of), so it is dropped and made again, and re-granted.
-- ─────────────────────────────────────────────────────────────────────────────────────────
drop function platform.drill_ask(uuid, jsonb, jsonb);
CREATE FUNCTION platform.drill_ask(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(kind text, groups jsonb, measures jsonb, row_count bigint, prior_groups jsonb, prior_measures jsonb, prior_row_count bigint, delta jsonb, compare jsonb, distinct_groups bigint, labels jsonb, says text, as_of timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan  jsonb;
  v_rows  jsonb := '[]'::jsonb;
  v_lab   jsonb := '{}'::jsonb;
  v_one   jsonb;
  v_says  text[] := '{}';
  v_ids   text[];
  v_d     jsonb;
  v_rel   jsonb;
  r       jsonb;
  v_cap   integer;
  v_n     bigint;
  v_na    bigint;
  v_limit integer;
  v_by    jsonb;
  k       text;
  v_asof  timestamptz;
  v_nall  bigint;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_ask');
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'ask');

  if v_plan ? 'delegate' then
    -- ── A CUSTOM TABLE: the store's own door, as the seat ────────────────────────────────
    v_d := v_plan -> 'delegate';
    v_limit := (v_d ->> 'limit')::integer;
    select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_rows
      from custom.record_aggregate(
             p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
             p_group_by => v_d -> 'group_by', p_measures => coalesce(v_d -> 'measures', '[]'::jsonb),
             p_bucket => v_d -> 'bucket', p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
             p_limit => v_limit, p_compare => v_d -> 'compare') x;
    -- the period's group key is `<key>_<grain>` in the store and `<key>:<grain>` in the contract
    if v_d ? 'bucket' then
      k := (v_d -> 'bucket' ->> 'key') || '_' || (v_d -> 'bucket' ->> 'by');
      select coalesce(jsonb_agg(x
               || jsonb_build_object('groups', case when (x -> 'groups') ? k then ((x -> 'groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'groups') -> k) else x -> 'groups' end)
               || jsonb_build_object('prior_groups', case when (x -> 'prior_groups') ? k then ((x -> 'prior_groups') - k) || jsonb_build_object((v_d -> 'bucket' ->> 'key') || ':' || (v_d -> 'bucket' ->> 'by'), (x -> 'prior_groups') -> k) else x -> 'prior_groups' end)),
             '[]'::jsonb)
        into v_rows from jsonb_array_elements(v_rows) x;
    end if;
    if (select count(*) filter (where (x ->> 'row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit
       or (select count(*) filter (where (x ->> 'prior_row_count')::bigint > 0) from jsonb_array_elements(v_rows) x) >= v_limit then
      v_says := v_says || format('Only the first %s groups (the largest by count) are shown; this table does not add up the rest yet.', v_limit);
    end if;
    return query
      select case when jsonb_array_length(v_d -> 'group_by') = 0 and not (v_d ? 'bucket') then 'total' else 'group' end,
             nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
             nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'),
             (x ->> 'prior_row_count')::bigint, nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'), null::bigint, '{}'::jsonb,
             case when o = 1 and cardinality(v_says) > 0 then array_to_string(v_says, ' ') end,
             null::timestamptz
        from jsonb_array_elements(v_rows) with ordinality z(x, o)
       order by case when v_plan -> 'sort' ->> 'key' is null or v_plan -> 'sort' ->> 'key' = 'count'
                     then case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'desc')) = 'asc' then (x ->> 'row_count')::numeric else -(x ->> 'row_count')::numeric end end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then null else x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end,
                case when lower(coalesce(v_plan -> 'sort' ->> 'direction', 'asc')) = 'desc' then x -> 'groups' -> (v_plan -> 'sort' ->> 'key') end desc,
                o;
    return;
  end if;

  -- ── A STANDARD SOURCE ──────────────────────────────────────────────────────────────────
  if v_plan ->> 'mode' = 'definer' then
    v_plan := platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'ask');
    v_rows := v_plan -> 'rows';
    -- as of: the moment the summary counted through (null = counted live from the table)
    v_asof := (v_plan ->> 'as_of')::timestamptz;
  else
    -- AS THE SEAT: the table's own row security decides which rows are counted.
    execute format('select coalesce(jsonb_agg(to_jsonb(x) order by x.ord), ''[]''::jsonb) from (%s) x', v_plan ->> 'sql')
      into v_rows using v_plan -> 'params';
  end if;

  -- labels of relation groups, read as the seat through the target's own row security
  for v_rel in select x from jsonb_array_elements(coalesce(v_plan -> 'relations', '[]'::jsonb)) x loop
    select array_agg(distinct g) into v_ids
      from jsonb_array_elements(v_rows) x
      cross join lateral (values (x -> 'groups' ->> (v_rel ->> 'key')), (x -> 'prior_groups' ->> (v_rel ->> 'key'))) v(g)
     where g is not null;
    continue when v_ids is null;
    begin
      execute format('select coalesce(jsonb_object_agg(x.id, x.t), ''{}''::jsonb) from (select %I::text as id, %I::text as t from %I.%I where %I %s) x',
                     v_rel ->> 'to', v_rel ->> 'title', v_rel ->> 'schema', v_rel ->> 'table', v_rel ->> 'to',
                     case when (v_rel ->> 'uuid')::boolean then '= any ($1::uuid[])' else '::text = any ($1)' end)
        into v_one using v_ids;
      v_lab := v_lab || jsonb_build_object(v_rel ->> 'key', v_one);
    exception when insufficient_privilege then
      v_says := v_says || format('The names behind %s could not be read for you, so they show as ids.', v_rel ->> 'key');
    end;
  end loop;

  -- an answer always carries its total row, even when no row passed the filter
  if not exists (select 1 from jsonb_array_elements(v_rows) x where x ->> 'kind' = 'total' and coalesce(x -> 'groups', '{}'::jsonb) = '{}'::jsonb) then
    v_rows := v_rows || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'kind', 'total', 'groups', '{}'::jsonb, 'measures', v_plan -> 'zero', 'row_count', 0,
      'prior_groups', case when v_plan -> 'compare' is not null and jsonb_typeof(v_plan -> 'compare') = 'object' then '{}'::jsonb end,
      'prior_measures', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'zero' end,
      'prior_row_count', case when jsonb_typeof(v_plan -> 'compare') = 'object' then 0 end,
      'compare', case when jsonb_typeof(v_plan -> 'compare') = 'object' then v_plan -> 'compare' end,
      'distinct_groups', 0)));
  end if;
  v_cap := (v_plan ->> 'cap')::integer;
  select max((x ->> 'distinct_groups')::bigint), max((x ->> 'distinct_across')::bigint), max((x ->> 'distinct_all')::bigint) into v_n, v_na, v_nall
    from jsonb_array_elements(v_rows) x;
  -- thresholds (having): how many groups met them, in words; the rest are in Other
  if v_plan ->> 'having_says' is not null then
    if coalesce(v_n, 0) = 0 then
      v_says := v_says || format('No group meets the rule (%s).', v_plan ->> 'having_says');
    else
      v_says := v_says || format('%s of %s groups meet the rule (%s); the rest are added together in Other.',
                                 v_n, coalesce(v_nall, v_n), v_plan ->> 'having_says');
    end if;
  end if;
  if v_n > v_cap then
    if coalesce((v_plan ->> 'time_first')::boolean, false) then
      v_says := v_says || format('Showing the latest %s of %s periods; the %s earlier ones are added together in Other. Ask by a coarser period or a shorter window to see them one by one.',
                                 v_cap, v_n, v_n - v_cap);
    else
      v_says := v_says || format('Showing the top %s of %s groups by %s; the other %s are added together in Other. Up to %s groups are shown at once (the setting "Groups shown before Other").',
                                 v_cap, v_n, lower(coalesce(v_plan ->> 'sort_label', 'count')), v_n - v_cap, v_cap);
    end if;
  end if;
  if v_na > (v_plan ->> 'acap')::integer then
    v_says := v_says || format('Showing %s of %s columns; the other %s are added together in one Other column (the setting "Pivot columns before Other").',
                               v_plan ->> 'acap', v_na, v_na - (v_plan ->> 'acap')::integer);
  end if;

  return query
    select x ->> 'kind', nullif(x -> 'groups', 'null'), nullif(x -> 'measures', 'null'), (x ->> 'row_count')::bigint,
           nullif(x -> 'prior_groups', 'null'), nullif(x -> 'prior_measures', 'null'), (x ->> 'prior_row_count')::bigint,
           nullif(x -> 'delta', 'null'), nullif(x -> 'compare', 'null'),
           (x ->> 'distinct_groups')::bigint,
           coalesce((select jsonb_object_agg(l.key, l.value -> (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key))
                       from jsonb_each(v_lab) l
                      where coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ? l.key
                        and l.value ? (coalesce(nullif(x -> 'groups', 'null'), x -> 'prior_groups') ->> l.key)), '{}'::jsonb),
           case when x ->> 'kind' = 'total' and coalesce(nullif(x -> 'groups', 'null'), '{}'::jsonb) = '{}'::jsonb and cardinality(v_says) > 0
                then array_to_string(v_says, ' ') end,
           v_asof
      from jsonb_array_elements(v_rows) with ordinality z(x, o)
     order by o;
end
$function$;
comment on function platform.drill_ask(uuid, jsonb, jsonb) is
  'DRILL-STANDARD-DOOR: the one read contract — grouped, bucketed (day..year in the organization''s calendar), compared, pivoted — for a custom Table (custom.record_aggregate, as the seat) or a standard table (SECURITY INVOKER: the table''s own row security decides every row counted). Groups past the cap fold into one Other row and the total row says so. DRILL-LEDGER-RECORDS: thresholds (having) are applied before the cut into Other and said in words; every row carries as_of (the moment a summary fact counted through; null = counted live).';
grant execute on function platform.drill_ask(uuid, jsonb, jsonb) to authenticated;

CREATE OR REPLACE FUNCTION platform.drill_rows(p_organization_id uuid, p_source jsonb, p_question jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v_plan  jsonb;
  v_total bigint;
  v_rows  jsonb;
  v_n     bigint;
  v_says  text[] := '{}';
  v_d     jsonb;
  v_page  jsonb;
  v_off   integer;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_rows');
  v_plan := platform._drill_plan(p_organization_id, p_source, p_question, 'rows');

  -- THE RECORDS OF A DEFINER DEFINITION (decision 14): its declared records relation, read by the
  -- definer step with the SAME filter compiler and the SAME lane rule the number was counted with,
  -- for a window, cut at the number's as_of.
  if coalesce((v_plan ->> 'records')::boolean, false) then
    return platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question, 'rows');
  end if;

  if v_plan ? 'delegate' then
    -- the SAME filter custom.record_aggregate counted with (custom.record_filter_sql), as the seat
    v_d := v_plan -> 'delegate';
    v_page := custom.read_records_page(
      p_organization_id => p_organization_id, p_table_id => (p_source ->> 'id')::uuid,
      p_filter => coalesce(v_d -> 'filter', '{}'::jsonb),
      p_sort => case when v_plan -> 'sort' ->> 'key' is not null and v_plan -> 'sort' ->> 'key' <> 'count'
                     then jsonb_build_array(jsonb_build_object('field', v_plan -> 'sort' ->> 'key', 'direction', coalesce(v_plan -> 'sort' ->> 'direction', 'asc')))
                     else '[]'::jsonb end,
      p_limit => coalesce((p_question ->> 'limit')::integer, 50), p_offset => (v_plan ->> 'offset')::integer);
    v_total := (v_page ->> 'total')::bigint;
    v_off := coalesce((v_page ->> 'offset')::integer, 0);
    return v_page || jsonb_build_object('next_offset',
      case when v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) < v_total
           then v_off + jsonb_array_length(coalesce(v_page -> 'rows', '[]'::jsonb)) end, 'as_of', null);
  end if;

  -- AS THE SEAT, ALWAYS — even for a declared definer fact: "see these records" opens only rows
  -- the seat may open, and says so when the number counted more.
  execute v_plan ->> 'sql' into v_total, v_rows using v_plan -> 'params';
  if jsonb_array_length(v_rows) = 0 and (v_plan ->> 'offset')::integer > 0 then
    execute v_plan ->> 'count_sql' into v_total using v_plan -> 'params';
  end if;
  if v_plan ->> 'mode' = 'definer' then
    v_n := (platform._drill_run_declared(p_organization_id, p_source ->> 'token', p_question - 'limit' - 'offset' - 'sort' - 'columns', 'count') ->> 'total')::bigint;
    if v_n > v_total then
      v_says := v_says || format('%s of the %s counted are records you can open; the rest belong to other people in this organization.', v_total, v_n);
    end if;
  end if;
  v_off := (v_plan ->> 'offset')::integer;
  return jsonb_strip_nulls(jsonb_build_object(
    'total', v_total, 'limit', (v_plan ->> 'limit')::integer, 'offset', v_off, 'rows', v_rows,
    'next_offset', case when v_off + jsonb_array_length(v_rows) < v_total then v_off + jsonb_array_length(v_rows) end,
    'columns', v_plan -> 'def' -> 'detail' -> 'columns',
    'says', case when cardinality(v_says) > 0 then array_to_string(v_says, ' ') end))
    || jsonb_build_object('as_of', null);   -- read live from the table: no summary moment
end
$function$;

CREATE OR REPLACE FUNCTION platform.drill_describe(p_organization_id uuid, p_source jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog'
AS $function$
declare
  v jsonb;
begin
  perform custom.assert_entity_door(p_organization_id, 'platform.drill_describe');
  v := platform._drill_plan(p_organization_id, p_source, null, 'describe');
  if p_source ->> 'kind' = 'table' then
    if not coalesce((v ->> 'd2')::boolean, false) then
      raise exception 'A custom Table says its own dimensions and measures once lane DRILL-CUSTOM-PARITY''s door (custom.table_dimensions) is on this database.'
        using errcode = '0A000', hint = 'Until then ask it directly: its columns are its dimensions, and count / sum_<column> its measures.';
    end if;
    execute 'select custom.table_dimensions($1, $2)' into v using p_organization_id, (p_source ->> 'id')::uuid;
    return v || jsonb_build_object('source', jsonb_build_object('kind', 'table', 'id', p_source ->> 'id'),
                                   'stale_after_knob', null);
  end if;
  return v -> 'def';
end
$function$;

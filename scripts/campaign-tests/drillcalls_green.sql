-- DRILL-CALLS — AI usage by execution, AI model calls, the Spend page's findings, the CX usage views
-- and the ledger-vs-calls reconciliation. (migrations/campaign/drillcalls_*.sql and the declared
-- definitions ai_usage_executions / ai_calls / ai_usage in aidream apps/shared/records/scripts/
-- drill-definitions; PROGRESS-DRILL-FINISH decisions 12, 13, 24, 29.)
--
--   psql "<clone dsn>" [-v days=28] [-v plant=noknob|nohasrequest] -f scripts/campaign-tests/drillcalls_green.sql
--
-- THE ORACLES: public.admin_spend_breakdown (the Spend page's seven signals) and
-- chat.cx_usage_analytics (the CX usage tab), both asked for the SAME window as the drill door —
-- the last `days` whole UTC days (default 28) — with the Spend page's own settings as thresholds.
-- A finding's groups and money must equal its signal's; a CX Saved view's rows must equal the
-- analytics' rows, to the cent. The only differences allowed are named and MEASURED here:
--   (1) head-of-request edge: the ledger view counts a request's tokens / iterations / unpriced
--       calls on its first execution over its WHOLE life (the one rules source, decision 24); the
--       Spend page on its first execution INSIDE the window. They can disagree only on a request
--       that has an execution before the window starts — each such request is listed.
--   (2) bursts: the Spend page also splits a burst by manual/automated; a drill question groups by
--       at most four Dimensions (person, agent, feature, ten minutes). The drill groups must equal
--       the Spend rule without that split, exactly; the Spend count differs only by the person +
--       agent + feature combinations that mixed manual and automated requests in one ten minutes.
--   (3) latency: the analytics print 0 for a model with no recorded latency; the door says none.
-- `plant=noknob` moves every finding setting to a line nobody meets inside the rolled-back
-- transaction -> the finding parity checks go RED (the lines are read from the settings, not the
-- file). `plant=nohasrequest` rewrites the view so has_request is always true -> context-heavy
-- and bursts parity go RED (the filter carries the oracle's "request_id IS NOT NULL").
--
-- THE CLONE ONLY (never production): the seats are simulated with request.jwt.claims and
-- `set local role authenticated`, exactly as PostgREST sets them. Nothing is kept: rolled back.

\set ON_ERROR_STOP 1
\if :{?days}
\else
\set days 28
\endif
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '1500s';
set local client_min_messages = warning;
create temp table dcr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dcr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dcr to authenticated;
grant usage on sequence dcr_n_seq to authenticated;

create temp table dcw on commit drop as
  select date_trunc('day', now(), 'UTC') - make_interval(days => :days) as w0, date_trunc('day', now(), 'UTC') as w1;
grant select on dcw to authenticated;
select set_config('dc.plant', :'plant', true) as plant;

-- the Spend page's own settings: the oracle's thresholds, and the findings' seeded defaults
create temp table dck on commit drop as
  select jsonb_object_agg(key, value) as t from platform.feature_knob where feature = 'platform.spend_explorer'
     and key in ('context_heavy_tokens', 'iteration_heavy', 'spike_multiplier', 'hog_share_pct', 'repeat_burst');

do $$
begin
  if current_setting('dc.plant') = 'noknob' then
    update platform.feature_knob set value = '1000000000'
     where feature like 'drill.finding.ai_usage%' and key in ('context_heavy_tokens', 'iteration_heavy', 'spike_multiplier', 'repeat_burst');
    update platform.feature_knob set value = '100' where feature = 'drill.finding.ai_usage_executions.hogs' and key = 'hog_share_pct';
  elsif current_setting('dc.plant') = 'nohasrequest' then
    if position('(ur.id IS NOT NULL) AS has_request' in pg_get_viewdef('runtime._ai_usage_calls'::regclass, false)) = 0 then
      raise exception 'plant nohasrequest did not apply';
    end if;
    execute 'create or replace view runtime._ai_usage_calls with (security_invoker = true) as '
         || replace(pg_get_viewdef('runtime._ai_usage_calls'::regclass, false), '(ur.id IS NOT NULL) AS has_request', 'true AS has_request');
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- O. THE ORACLES, asked as admin@admin.com inside the admin apps
-- ════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
create temp table dco on commit drop as
  select public.admin_spend_breakdown(w.w0, w.w1, 'UTC', '{}', (select t from dck)) as j from dcw w;
create temp table dcx on commit drop as
  select chat.cx_usage_analytics(w.w0, w.w1 - interval '1 microsecond') as j from dcw w;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- V. THE VIEWS
-- ════════════════════════════════════════════════════════════════════════════════════════════
select pg_temp.chk('V1 runtime._ai_calls is one row per model call that was not deleted (the window)',
  (select count(*) from runtime._ai_calls c, dcw where c.created_at >= dcw.w0 and c.created_at < dcw.w1)
  = (select count(*) from chat.request r, dcw where r.deleted_at is null and r.created_at >= dcw.w0 and r.created_at < dcw.w1)
  and (select count(distinct call_id) from runtime._ai_calls c, dcw where c.created_at >= dcw.w0 and c.created_at < dcw.w1)
  = (select count(*) from chat.request r, dcw where r.deleted_at is null and r.created_at >= dcw.w0 and r.created_at < dcw.w1));
select pg_temp.chk('V2 has_request is true exactly for the executions a request owns',
  not exists (select 1 from runtime._ai_usage_calls c, dcw where c.created_at >= dcw.w0 and c.created_at < dcw.w1
               and c.has_request is distinct from (c.request_id is not null)));
select pg_temp.chk('V3 neither view is readable by a client (no grant to anon or authenticated)',
  not has_table_privilege('authenticated', 'runtime._ai_calls', 'select') and not has_table_privilege('anon', 'runtime._ai_calls', 'select')
  and not has_table_privilege('authenticated', 'runtime._ai_usage_calls', 'select'));
select pg_temp.chk('V4 registry: ai_calls and ai_usage_executions are System machinery',
  (select count(*) from platform.entity_types where token in ('ai_calls', 'ai_usage_executions') and type = 'system' and is_active) = 2);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- F. THE FINDINGS against the Spend page's signals (platform lane, admin@admin.com)
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dcf (definition text, finding text, kind text, groups jsonb, measures jsonb, distinct_groups bigint, says text) on commit drop;
grant all on dcf to authenticated;
create temp table dcd (definition text, d jsonb) on commit drop;
grant all on dcd to authenticated;
set local role authenticated;
do $$
declare
  c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_def text; f jsonb; v_w jsonb;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.dcw;
  foreach v_def in array array['ai_usage_executions', 'ai_usage', 'ai_calls'] loop
    insert into pg_temp.dcd values (v_def, platform.drill_describe(c_aimatrx, jsonb_build_object('kind', 'entity', 'token', v_def)));
  end loop;
  foreach v_def in array array['ai_usage_executions', 'ai_usage'] loop
    for f in select x from pg_temp.dcd d, jsonb_array_elements(d.d -> 'findings') x where d.definition = v_def loop
      insert into pg_temp.dcf
      select v_def, f ->> 'key', a.kind, a.groups, a.measures, a.distinct_groups, a.says
        from platform.drill_ask(c_aimatrx, jsonb_build_object('kind', 'entity', 'token', v_def),
               (f -> 'question') || jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1000)) a;
    end loop;
  end loop;
end $$;
reset role;

create temp view dcfs as
  select definition, finding,
         count(*) filter (where kind = 'group') as n,
         coalesce(sum((measures ->> 'cost')::numeric) filter (where kind = 'group'), 0) as cost,
         max(distinct_groups) as distinct_groups,
         sum((measures ->> 'cost')::numeric) filter (where kind in ('group', 'other')) as parts,
         max((measures ->> 'cost')::numeric) filter (where kind = 'total') as total
    from pg_temp.dcf group by 1, 2;

select pg_temp.chk('F0 describe: ai_usage_executions offers six findings, two Saved views and its records; ai_usage the spike finding; every finding''s groups + Other = its total',
  (select jsonb_array_length(d -> 'findings') from pg_temp.dcd where definition = 'ai_usage_executions') = 6
  and (select jsonb_array_length(d -> 'views') from pg_temp.dcd where definition = 'ai_usage_executions') >= 2
  and (select d -> 'records' ->> 'fact' from pg_temp.dcd where definition = 'ai_usage_executions') = 'ai_usage_executions'
  and (select count(*) from pg_temp.dcd, jsonb_array_elements(d -> 'findings') x where definition = 'ai_usage' and x ->> 'key' = 'spikes') = 1
  and not exists (select 1 from dcfs where parts is distinct from total and not (parts is null and total = 0)),
  (select string_agg(format('%s.%s %s groups $%s', definition, finding, n, round(cost, 2)), '; ' order by definition, finding) from dcfs));

-- the settings are the Spend page's values
select pg_temp.chk('K1 the six finding settings are seeded with the Spend page''s values',
  (select count(*) from platform.feature_knob k, pg_temp.dck s
    where (k.feature, k.key) in (('drill.finding.ai_usage_executions.hogs', 'hog_share_pct'),
                                 ('drill.finding.ai_usage_executions.context_heavy', 'context_heavy_tokens'),
                                 ('drill.finding.ai_usage_executions.looped', 'iteration_heavy'),
                                 ('drill.finding.ai_usage_executions.bursts', 'repeat_burst'),
                                 ('drill.finding.ai_usage.spikes', 'spike_multiplier'))
      and k.default_value = s.t -> k.key) = 5
  or current_setting('dc.plant') = 'noknob',
  (select string_agg(format('%s.%s=%s', feature, key, value), ', ') from platform.feature_knob where feature like 'drill.finding.ai_usage%'));

-- got nothing back, hogs: the same groups, the same money
select pg_temp.chk('F1 "Spent and got nothing back" = Spend''s failed_spend (requests, money)',
  (select n from dcfs where finding = 'got_nothing_back') = (select (j -> 'signals' -> 'failed_spend' ->> 'n')::bigint from dco)
  and (select cost from dcfs where finding = 'got_nothing_back') = (select (j -> 'signals' -> 'failed_spend' ->> 'cost')::numeric from dco),
  format('drill %s / $%s vs Spend %s / $%s', (select n from dcfs where finding = 'got_nothing_back'), (select cost from dcfs where finding = 'got_nothing_back'),
         (select j -> 'signals' -> 'failed_spend' ->> 'n' from dco), (select j -> 'signals' -> 'failed_spend' ->> 'cost' from dco)));
select pg_temp.chk('F2 "Conversations that ate the window" = Spend''s conversation_hogs (conversations, money; the share is of the whole window)',
  (select n from dcfs where finding = 'hogs') = (select (j -> 'signals' -> 'conversation_hogs' ->> 'n')::bigint from dco)
  and (select cost from dcfs where finding = 'hogs') = (select (j -> 'signals' -> 'conversation_hogs' ->> 'cost')::numeric from dco),
  format('drill %s / $%s vs Spend %s / $%s', (select n from dcfs where finding = 'hogs'), (select cost from dcfs where finding = 'hogs'),
         (select j -> 'signals' -> 'conversation_hogs' ->> 'n' from dco), (select j -> 'signals' -> 'conversation_hogs' ->> 'cost' from dco)));

-- the per-request signals: the Spend rule with its in-window head, rebuilt here and anchored to the
-- oracle's own numbers; the drill groups equal it except requests with an execution before the window
create temp table dch on commit drop as
  with g as (
    select e.id, e.created_at, coalesce(e.cost, 0) as cost, e.request_id,
           (e.request_id is null or row_number() over (partition by e.request_id order by e.created_at, e.id) = 1) as head
      from runtime.global_execution e, dcw where e.created_at >= dcw.w0 and e.created_at < dcw.w1
  )
  select g.request_id, sum(g.cost) as cost,
         max(case when g.head then coalesce(ur.iterations, 0) else 0 end) as iterations,
         sum(case when g.head then (select count(*) from chat.request r where r.user_request_id = ur.id and r.deleted_at is null and r.cost is null) else 0 end) as unpriced,
         bool_or(exists (select 1 from runtime.global_execution e0, dcw where e0.request_id = g.request_id and e0.created_at < dcw.w0)) as straddles
    from g join chat.user_request ur on ur.id = g.request_id
   group by g.request_id;
create temp table dcg on commit drop as
  select finding, (groups ->> 'request')::uuid as request_id, (measures ->> 'cost')::numeric as cost,
         (measures ->> 'iterations')::numeric as iterations, (measures ->> 'unpriced_calls')::numeric as unpriced
    from pg_temp.dcf where definition = 'ai_usage_executions' and kind = 'group' and finding in ('looped', 'unpriced');

select pg_temp.chk('F3 "Requests that looped" = Spend''s iteration_heavy: the rebuilt rule = the oracle, and the drill''s requests = it except requests that started before the window (each listed)',
  (select count(*) from dch where iterations >= (select (t ->> 'iteration_heavy')::int from dck)) = (select (j -> 'signals' -> 'iteration_heavy' ->> 'n')::bigint from dco)
  and (select sum(cost) from dch where iterations >= (select (t ->> 'iteration_heavy')::int from dck)) = (select (j -> 'signals' -> 'iteration_heavy' ->> 'cost')::numeric from dco)
  and not exists (
    (select request_id from dch where iterations >= (select (t ->> 'iteration_heavy')::int from dck) and not straddles
     except select request_id from dcg where finding = 'looped')
    union all
    (select request_id from dcg where finding = 'looped' except select request_id from dch where iterations >= (select (t ->> 'iteration_heavy')::int from dck)))
  and not exists (select 1 from dcg g join dch h using (request_id) where g.finding = 'looped' and g.cost <> h.cost),
  format('drill %s / $%s vs Spend %s / $%s; requests that started before the window and differ: %s',
    (select n from dcfs where finding = 'looped'), (select cost from dcfs where finding = 'looped'),
    (select j -> 'signals' -> 'iteration_heavy' ->> 'n' from dco), (select j -> 'signals' -> 'iteration_heavy' ->> 'cost' from dco),
    (select count(*) from (select request_id from dch where iterations >= (select (t ->> 'iteration_heavy')::int from dck) and straddles
                            except select request_id from dcg where finding = 'looped') x)));

select pg_temp.chk('F4 "Model calls with no price" = Spend''s unpriced: the rebuilt rule = the oracle (calls, requests), and the drill''s requests and their calls = it except requests that started before the window',
  (select sum(unpriced) from dch) = (select (j -> 'signals' -> 'unpriced' ->> 'n')::numeric from dco)
  and (select count(*) from dch where unpriced > 0) = (select (j -> 'signals' -> 'unpriced' ->> 'requests')::bigint from dco)
  and not exists (
    (select request_id, unpriced from dch where unpriced > 0 and not straddles
     except select request_id, unpriced from dcg where finding = 'unpriced')
    union all
    (select g.request_id, g.unpriced from dcg g join dch h using (request_id) where g.finding = 'unpriced' and not h.straddles
     except select request_id, unpriced from dch where unpriced > 0)),
  format('drill %s calls in %s requests vs Spend %s in %s', (select sum(unpriced) from dcg where finding = 'unpriced'), (select count(*) from dcg where finding = 'unpriced'),
    (select j -> 'signals' -> 'unpriced' ->> 'n' from dco), (select j -> 'signals' -> 'unpriced' ->> 'requests' from dco)));

-- context-heavy: per conversation over the executions a request owns
create temp table dcc on commit drop as
  with g as (
    select e.id, e.created_at, coalesce(e.cost, 0) as cost, e.request_id,
           case when e.link_kind = 'conversation' and e.link_id ~ '^[0-9a-f-]{36}$' then e.link_id::uuid
                when (e.context ->> 'conversation_id') ~ '^[0-9a-f-]{36}$' then (e.context ->> 'conversation_id')::uuid end as conversation_id,
           row_number() over (partition by e.request_id order by e.created_at, e.id) = 1 as head
      from runtime.global_execution e, dcw where e.created_at >= dcw.w0 and e.created_at < dcw.w1 and e.request_id is not null
  )
  select g.conversation_id, sum(g.cost) as cost,
         case when sum(case when g.head then coalesce(ur.iterations, 0) else 0 end) > 0
              then (sum(case when g.head then coalesce(ur.total_input_tokens, 0) + coalesce(ur.total_cached_tokens, 0) else 0 end))::numeric
                   / sum(case when g.head then coalesce(ur.iterations, 0) else 0 end) else 0 end as avg_context,
         bool_or(exists (select 1 from runtime.global_execution e0, dcw where e0.request_id = g.request_id and e0.created_at < dcw.w0)) as straddles
    from g join chat.user_request ur on ur.id = g.request_id
   where g.conversation_id is not null
   group by g.conversation_id;
select pg_temp.chk('F5 "Context-heavy conversations" = Spend''s context_heavy (conversations, money), except conversations holding a request that started before the window',
  (select count(*) from dcc where avg_context >= (select (t ->> 'context_heavy_tokens')::numeric from dck)) = (select (j -> 'signals' -> 'context_heavy' ->> 'n')::bigint from dco)
  and (select sum(cost) from dcc where avg_context >= (select (t ->> 'context_heavy_tokens')::numeric from dck)) = (select (j -> 'signals' -> 'context_heavy' ->> 'cost')::numeric from dco)
  and not exists (
    (select conversation_id from dcc where avg_context >= (select (t ->> 'context_heavy_tokens')::numeric from dck) and not straddles
     except select (groups ->> 'conversation')::uuid from pg_temp.dcf where finding = 'context_heavy' and kind = 'group')
    union all
    (select (groups ->> 'conversation')::uuid from pg_temp.dcf f where finding = 'context_heavy' and kind = 'group'
     except select conversation_id from dcc where avg_context >= (select (t ->> 'context_heavy_tokens')::numeric from dck) or straddles)),
  format('drill %s / $%s vs Spend %s / $%s', (select n from dcfs where finding = 'context_heavy'), (select cost from dcfs where finding = 'context_heavy'),
         (select j -> 'signals' -> 'context_heavy' ->> 'n' from dco), (select j -> 'signals' -> 'context_heavy' ->> 'cost' from dco)));

-- bursts: the drill groups = the Spend rule without the manual/automated split, exactly; Spend's own
-- count differs only by the combinations that mixed the two in one ten minutes
create temp table dcb on commit drop as
  select c.person_id, c.agent_id, c.feature, c.trigger, c.bucket_10m, c.request_id, c.cost
    from runtime._ai_usage_calls c, dcw where c.created_at >= dcw.w0 and c.created_at < dcw.w1 and c.request_id is not null;
select pg_temp.chk('F6 "Repeat bursts": the drill groups = the Spend rule by person + agent + feature + ten minutes (groups and money); Spend''s split by manual/automated = its oracle, and the gap is only the groups that mixed the two',
  (select count(*) from (select 1 from dcb group by person_id, agent_id, feature, trigger, bucket_10m
                          having count(distinct request_id) >= (select (t ->> 'repeat_burst')::int from dck)) x)
    = (select (j -> 'signals' -> 'repeat_bursts' ->> 'n')::bigint from dco)
  and (select sum(cost) from (select sum(cost) cost from dcb group by person_id, agent_id, feature, trigger, bucket_10m
                               having count(distinct request_id) >= (select (t ->> 'repeat_burst')::int from dck)) x)
    = (select (j -> 'signals' -> 'repeat_bursts' ->> 'cost')::numeric from dco)
  and (select count(*) from (select 1 from dcb group by person_id, agent_id, feature, bucket_10m
                              having count(distinct request_id) >= (select (t ->> 'repeat_burst')::int from dck)) x) = (select n from dcfs where finding = 'bursts')
  and (select sum(cost) from (select sum(cost) cost from dcb group by person_id, agent_id, feature, bucket_10m
                               having count(distinct request_id) >= (select (t ->> 'repeat_burst')::int from dck)) x) = (select cost from dcfs where finding = 'bursts'),
  format('drill %s / $%s; Spend (split by manual/automated) %s / $%s; groups that mixed the two: %s',
    (select n from dcfs where finding = 'bursts'), (select cost from dcfs where finding = 'bursts'),
    (select j -> 'signals' -> 'repeat_bursts' ->> 'n' from dco), (select j -> 'signals' -> 'repeat_bursts' ->> 'cost' from dco),
    (select count(*) from (select 1 from dcb group by person_id, agent_id, feature, bucket_10m
                            having count(distinct request_id) >= (select (t ->> 'repeat_burst')::int from dck) and count(distinct trigger) > 1) x)));

select pg_temp.chk('F7 "Hours that spiked" (ai_usage by hour) = Spend''s spike_hours (hours, money; × the median hour above zero)',
  (select n from dcfs where definition = 'ai_usage' and finding = 'spikes') = (select (j -> 'signals' -> 'spike_hours' ->> 'n')::bigint from dco)
  and (select cost from dcfs where definition = 'ai_usage' and finding = 'spikes') = (select (j -> 'signals' -> 'spike_hours' ->> 'cost')::numeric from dco),
  format('drill %s / $%s vs Spend %s / $%s (median hour $%s)', (select n from dcfs where finding = 'spikes'), (select cost from dcfs where finding = 'spikes'),
         (select j -> 'signals' -> 'spike_hours' ->> 'n' from dco), (select j -> 'signals' -> 'spike_hours' ->> 'cost' from dco),
         (select j -> 'signals' -> 'spike_hours' ->> 'median_hour' from dco)));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- X. THE CX USAGE TAB = ai_calls' built-in Saved views, to the cent
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dcv (view_key text, kind text, groups jsonb, measures jsonb) on commit drop;
grant all on dcv to authenticated;
set local role authenticated;
do $$
declare c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'; v jsonb; v_w jsonb;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.dcw;
  for v in select x from pg_temp.dcd d, jsonb_array_elements(d.d -> 'views') x where d.definition = 'ai_calls' loop
    insert into pg_temp.dcv
    select v ->> 'key', a.kind, a.groups, a.measures
      from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_calls"}', (v -> 'question') || jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1000)) a;
  end loop;
end $$;
reset role;

create temp table dcxm on commit drop as select x.* from dco, dcx, jsonb_to_recordset(dcx.j -> 'by_model')
  x(model_name text, provider text, count bigint, total_cost numeric, total_input_tokens bigint, total_output_tokens bigint, total_cached_tokens bigint, total_tokens bigint, avg_duration_ms numeric);
select pg_temp.chk('X1 Usage by model: every (model, provider) row = cx_usage_analytics.by_model (calls, cost to the cent, the four token sums; latency to the millisecond, "none" where cx prints 0)',
  not exists (
    select model_name, provider, count, total_cost, total_input_tokens, total_output_tokens, total_cached_tokens, total_tokens, round(avg_duration_ms, 3) from dcxm
    except
    select groups ->> 'model', groups ->> 'provider', (measures ->> 'calls')::bigint, (measures ->> 'cost')::numeric, (measures ->> 'tokens_in')::bigint,
           (measures ->> 'tokens_out')::bigint, (measures ->> 'tokens_cached')::bigint, (measures ->> 'tokens_total')::bigint, round(coalesce((measures ->> 'latency')::numeric, 0), 3)
      from dcv where view_key = 'cx_by_model' and kind = 'group')
  and (select count(*) from dcv where view_key = 'cx_by_model' and kind = 'group') = (select count(*) from dcxm)
  and not exists (select 1 from dcv where view_key = 'cx_by_model' and kind = 'other'),
  format('%s models; cost $%s vs $%s', (select count(*) from dcxm), (select sum(total_cost) from dcxm),
         (select (measures ->> 'cost') from dcv where view_key = 'cx_by_model' and kind = 'total')));
select pg_temp.chk('X2 Cost by provider = cx_usage_analytics.by_provider (calls, cost, tokens)',
  not exists (
    select x.provider, x.count, x.total_cost, x.total_tokens from dcx, jsonb_to_recordset(dcx.j -> 'by_provider') x(provider text, count bigint, total_cost numeric, total_tokens bigint)
    except
    select groups ->> 'provider', (measures ->> 'calls')::bigint, (measures ->> 'cost')::numeric, (measures ->> 'tokens_total')::bigint from dcv where view_key = 'cx_by_provider' and kind = 'group')
  and (select count(*) from dcv where view_key = 'cx_by_provider' and kind = 'group') = (select jsonb_array_length(j -> 'by_provider') from dcx));
select pg_temp.chk('X3 Daily cost and tokens = cx_usage_analytics.by_day (UTC days; calls, cost, input, output, cached)',
  not exists (
    select x.date, x.count, x.cost, x.input_tokens, x.output_tokens, x.cached_tokens from dcx, jsonb_to_recordset(dcx.j -> 'by_day') x(date text, count bigint, cost numeric, input_tokens bigint, output_tokens bigint, cached_tokens bigint)
    except
    select left(groups ->> 'at', 10), (measures ->> 'calls')::bigint, (measures ->> 'cost')::numeric, (measures ->> 'tokens_in')::bigint, (measures ->> 'tokens_out')::bigint, (measures ->> 'tokens_cached')::bigint
      from dcv where view_key = 'cx_by_day' and kind = 'group')
  and (select count(*) from dcv where view_key = 'cx_by_day' and kind = 'group') = (select jsonb_array_length(j -> 'by_day') from dcx),
  (select string_agg(groups ->> 'at', ', ' order by groups ->> 'at') from (select groups from dcv where view_key = 'cx_by_day' and kind = 'group' limit 2) s));
select pg_temp.chk('X4 Cost by origin = cx_usage_analytics.by_origin (calls, cost, the four token sums)',
  not exists (
    select x.origin_class, x.count, x.total_cost, x.total_input_tokens, x.total_output_tokens, x.total_cached_tokens, x.total_tokens
      from dcx, jsonb_to_recordset(dcx.j -> 'by_origin') x(origin_class text, count bigint, total_cost numeric, total_input_tokens bigint, total_output_tokens bigint, total_cached_tokens bigint, total_tokens bigint)
    except
    select groups ->> 'origin', (measures ->> 'calls')::bigint, (measures ->> 'cost')::numeric, (measures ->> 'tokens_in')::bigint, (measures ->> 'tokens_out')::bigint,
           (measures ->> 'tokens_cached')::bigint, (measures ->> 'tokens_total')::bigint from dcv where view_key = 'cx_by_origin' and kind = 'group')
  and (select count(*) from dcv where view_key = 'cx_by_origin' and kind = 'group') = (select jsonb_array_length(j -> 'by_origin') from dcx));
select pg_temp.chk('X5 the header: total calls = cx total_requests, total cost = the sum of by_model; each model''s cost share = its cost / the answer''s total row',
  (select (measures ->> 'calls')::bigint from dcv where view_key = 'cx_cost_share' and kind = 'total') = (select (j ->> 'total_requests')::bigint from dcx)
  and (select (measures ->> 'cost')::numeric from dcv where view_key = 'cx_cost_share' and kind = 'total') = (select sum(total_cost) from dcxm)
  and not exists (select 1 from dcv v join dcxm m on m.model_name = v.groups ->> 'model' and m.provider = v.groups ->> 'provider'
                   where v.view_key = 'cx_cost_share' and v.kind = 'group'
                     and round((v.measures ->> 'cost')::numeric / nullif((select (measures ->> 'cost')::numeric from dcv where view_key = 'cx_cost_share' and kind = 'total'), 0), 6)
                         <> round(m.total_cost / nullif((select sum(total_cost) from dcxm), 0), 6)),
  format('%s calls, $%s', (select j ->> 'total_requests' from dcx), (select sum(total_cost) from dcxm)));
select pg_temp.chk('X6 Latency by model: the average = cx''s avg_duration_ms where cx recorded one; a model cx prints 0 for has no latency here (said, not zero)',
  not exists (select 1 from dcv v join dcxm m on m.model_name = v.groups ->> 'model' and m.provider = v.groups ->> 'provider'
               where v.view_key = 'cx_latency' and v.kind = 'group'
                 and round(coalesce((v.measures ->> 'latency')::numeric, 0), 3) <> round(m.avg_duration_ms, 3)),
  format('%s models with no latency recorded', (select count(*) from dcv where view_key = 'cx_latency' and kind = 'group' and measures ->> 'latency' is null)));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- R. THE RECONCILIATION (decision 29): ledger spend vs model-call cost, the same window — a pair of
--    asks, the difference named part by part and each part measured against the base tables
-- ════════════════════════════════════════════════════════════════════════════════════════════
create temp table dcrl (side text, kind text, groups jsonb, measures jsonb) on commit drop;
grant all on dcrl to authenticated;
set local role authenticated;
do $$
declare c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'; v_w jsonb;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.dcw;
  insert into pg_temp.dcrl select 'ledger', a.kind, a.groups, a.measures
    from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_usage_executions"}',
           (select x -> 'question' from pg_temp.dcd d, jsonb_array_elements(d.d -> 'views') x where d.definition = 'ai_usage_executions' and x ->> 'key' = 'reconcile_ledger')
           || jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1000)) a;
  insert into pg_temp.dcrl select 'calls', a.kind, a.groups, a.measures
    from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_calls"}',
           (select x -> 'question' from pg_temp.dcd d, jsonb_array_elements(d.d -> 'views') x where d.definition = 'ai_calls' and x ->> 'key' = 'reconcile_calls')
           || jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1000)) a;
end $$;
reset role;
create temp table dcrp on commit drop as select
  (select (measures ->> 'cost')::numeric from dcrl where side = 'ledger' and kind = 'total') as ledger,
  (select (measures ->> 'cost')::numeric from dcrl where side = 'calls' and kind = 'total') as calls,
  (select coalesce(sum((measures ->> 'cost')::numeric), 0) from dcrl where side = 'ledger' and kind = 'group' and (groups ->> 'has_request')::boolean is not true) as no_request,
  (select coalesce(sum((measures ->> 'cost')::numeric), 0) from dcrl where side = 'ledger' and kind = 'group' and (groups ->> 'has_request')::boolean and groups ->> 'source' is distinct from 'conversation') as request_not_model,
  (select coalesce(sum((measures ->> 'cost')::numeric), 0) from dcrl where side = 'ledger' and kind = 'group' and (groups ->> 'has_request')::boolean and groups ->> 'source' = 'conversation') as request_model,
  (select coalesce(sum((measures ->> 'cost')::numeric), 0) from dcrl where side = 'calls' and kind = 'group' and (groups ->> 'request_in_ledger')::boolean) as calls_in_ledger,
  (select coalesce(sum((measures ->> 'cost')::numeric), 0) from dcrl where side = 'calls' and kind = 'group' and (groups ->> 'request_in_ledger')::boolean is not true) as calls_not_in_ledger;
select pg_temp.chk('R1 the pair adds up: ledger − calls = (spend no request owns) + (a request''s non-model executions) + (model executions − the calls of requests in the ledger) − (calls whose request is not in the ledger)',
  ledger - calls = no_request + request_not_model + (request_model - calls_in_ledger) - calls_not_in_ledger
  and ledger = no_request + request_not_model + request_model and calls = calls_in_ledger + calls_not_in_ledger,
  format('ledger $%s − calls $%s = $%s: no request $%s + request, not a model call $%s + model executions vs their calls $%s − calls outside the ledger $%s',
         round(ledger, 2), round(calls, 2), round(ledger - calls, 2), round(no_request, 2), round(request_not_model, 2), round(request_model - calls_in_ledger, 2), round(calls_not_in_ledger, 2)))
  from dcrp;
select pg_temp.chk('R2 each part is measured, not asserted: the pair''s parts = the base tables (ledger rows no request owns; calls whose request owns no ledger row; the two totals)',
  (select no_request from dcrp) = (select coalesce(sum(e.cost), 0) from runtime.global_execution e, dcw
                                    where e.created_at >= dcw.w0 and e.created_at < dcw.w1 and not exists (select 1 from chat.user_request ur where ur.id = e.request_id))
  and (select calls_not_in_ledger from dcrp) = (select coalesce(sum(r.cost), 0) from chat.request r, dcw where r.deleted_at is null and r.created_at >= dcw.w0 and r.created_at < dcw.w1
                                                  and not exists (select 1 from runtime.global_execution e where e.request_id = r.user_request_id))
  and (select ledger from dcrp) = (select coalesce(sum(e.cost), 0) from runtime.global_execution e, dcw where e.created_at >= dcw.w0 and e.created_at < dcw.w1)
  and (select calls from dcrp) = (select coalesce(sum(r.cost), 0) from chat.request r, dcw where r.deleted_at is null and r.created_at >= dcw.w0 and r.created_at < dcw.w1));

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- S. THE SEATS: the organization and mine lanes count only their rows; the platform lane is refused
--    outside it. Both new definitions, at the same window.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_org uuid; v_mine_org uuid; v_member_org uuid; v_w jsonb; v_state text; v_def text;
  v_ask numeric; v_rows numeric; v_calls numeric; v_crows numeric;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.dcw;
  select c.organization_id into v_org from runtime._ai_calls c
    join iam.organization_member m on m.organization_id = c.organization_id and m.user_id = c_admin and m.role in ('owner', 'admin'), pg_temp.dcw w
   where c.created_at >= w.w0 and c.created_at < w.w1 group by 1 order by count(*) desc limit 1;
  select c.organization_id into v_mine_org from runtime._ai_calls c, pg_temp.dcw w
   where c.person_id = c_test and c.created_at >= w.w0 and c.created_at < w.w1 group by 1 order by count(*) desc limit 1;
  select m.organization_id into v_member_org from iam.organization_member m
   where m.user_id = c_test and m.role not in ('owner', 'admin') order by m.organization_id limit 1;

  -- organization: admin@admin.com as an owner OUTSIDE the admin apps
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  select (a.measures ->> 'cost')::numeric into v_ask from platform.drill_ask(v_org, '{"kind":"entity","token":"ai_usage_executions"}',
    jsonb_build_object('lane', 'organization', 'show', '["cost"]'::jsonb, 'by', '["source"]'::jsonb, 'window', v_w)) a where a.kind = 'total';
  select (a.measures ->> 'cost')::numeric into v_calls from platform.drill_ask(v_org, '{"kind":"entity","token":"ai_calls"}',
    jsonb_build_object('lane', 'organization', 'show', '["cost"]'::jsonb, 'by', '["model"]'::jsonb, 'window', v_w)) a where a.kind = 'total';
  execute 'reset role';
  select coalesce(sum(cost), 0) into v_rows from runtime._ai_usage_calls c, pg_temp.dcw w where c.organization_id = v_org and c.created_at >= w.w0 and c.created_at < w.w1;
  select coalesce(sum(cost), 0) into v_crows from runtime._ai_calls c, pg_temp.dcw w where c.organization_id = v_org and c.created_at >= w.w0 and c.created_at < w.w1;
  perform pg_temp.chk('S1 organization lane (admin@admin.com as owner, outside the admin apps): both definitions count exactly that organization''s rows',
    v_ask = v_rows and v_calls = v_crows, format('org %s: executions $%s = $%s; calls $%s = $%s', v_org, v_ask, v_rows, v_calls, v_crows));

  -- mine: test@test.com
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select coalesce((a.measures ->> 'calls')::numeric, 0) into v_ask from platform.drill_ask(coalesce(v_mine_org, c_aimatrx), '{"kind":"entity","token":"ai_usage_executions"}',
    jsonb_build_object('lane', 'mine', 'show', '["calls"]'::jsonb, 'by', '["source"]'::jsonb, 'window', v_w)) a where a.kind = 'total';
  select coalesce((a.measures ->> 'calls')::numeric, 0) into v_calls from platform.drill_ask(coalesce(v_mine_org, c_aimatrx), '{"kind":"entity","token":"ai_calls"}',
    jsonb_build_object('lane', 'mine', 'show', '["calls"]'::jsonb, 'by', '["model"]'::jsonb, 'window', v_w)) a where a.kind = 'total';
  begin
    perform platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_calls"}', jsonb_build_object('lane', 'platform', 'window', v_w));
    v_state := 'answered';
  exception when insufficient_privilege then v_state := '42501';
  end;
  begin
    perform platform.drill_ask(v_member_org, '{"kind":"entity","token":"ai_usage_executions"}', jsonb_build_object('lane', 'organization', 'window', v_w));
    v_def := 'answered';
  exception when insufficient_privilege then v_def := '42501';
  end;
  execute 'reset role';
  select count(*) into v_rows from runtime._ai_usage_calls c, pg_temp.dcw w where c.person_id = c_test and c.created_at >= w.w0 and c.created_at < w.w1;
  select count(*) into v_crows from runtime._ai_calls c, pg_temp.dcw w where c.person_id = c_test and c.created_at >= w.w0 and c.created_at < w.w1;
  perform pg_temp.chk('S2 mine lane (test@test.com): both definitions count exactly her own rows',
    v_ask = v_rows and v_calls = v_crows, format('executions %s = %s; calls %s = %s', v_ask, v_rows, v_calls, v_crows));
  perform pg_temp.chk('S3 the platform lane is refused to test@test.com (42501); an organization where she is a member, not an admin, is refused (42501)',
    v_state = '42501' and (v_def = '42501' or v_member_org is null), format('platform %s, member org %s', v_state, v_def));
end $$;

-- the settings decide: moving one line moves its finding
do $$
declare c_aimatrx constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b'; v_w jsonb; v_n bigint; f jsonb;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.dcw;
  update platform.feature_knob set value = '3' where feature = 'drill.finding.ai_usage_executions.looped' and key = 'iteration_heavy';
  select x into f from pg_temp.dcd d, jsonb_array_elements(d.d -> 'findings') x where d.definition = 'ai_usage_executions' and x ->> 'key' = 'looped';
  perform set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_aimatrx, '{"kind":"entity","token":"ai_usage_executions"}',
    (f -> 'question') || jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1000)) a where a.kind = 'group';
  execute 'reset role';
  perform pg_temp.chk('K2 the looped line is its setting: at 3 model calls more requests loop than at the Spend page''s value',
    v_n > (select n from dcfs where finding = 'looped'), format('%s at 3 vs %s', v_n, (select n from dcfs where finding = 'looped')));
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(detail, 400) as detail from pg_temp.dcr order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.dcr;
rollback;

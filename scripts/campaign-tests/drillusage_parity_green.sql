-- DRILL-USAGE-PAGE — the parity suite for the usage definition (ai_usage) and its hourly rollup
-- (migrations/campaign/drillusage_usage_is_counted_from_an_hourly_rollup.sql).
--
-- THE ORACLE is public.admin_spend_breakdown, the Spend Explorer's own RPC. For the same window
-- the rollup and the drill door must give the same money, the same executions and the same
-- groups on every cut the two share — to the cent, never "close".
--
--   psql "<dsn>" -v def="$(cat ai_usage.json)" -f scripts/campaign-tests/drillusage_parity_green.sql
--
-- `def`, when given, is the declared definition's JSON (the *.drill.ts file compiled by tsx): the
-- suite plants platform.drill_def__ai_usage() INSIDE this rolled-back transaction, so it can run
-- before the sync file is applied. Without it the live definition is used.
-- `plant=nolane` removes the platform lane's admin check inside the transaction -> L1 goes RED.
--
-- Everything is rolled back: the window is rebuilt into the rollup first (so the rollup is exact
-- for the window regardless of the cron's last run), the oracle is read as admin@admin.com with
-- the admin lane open, and each lane guard is asked from its own seat (test@test.com).
--
-- Requests and tokens: the rollup counts a request ONCE over its life, at its first execution;
-- the oracle counts it once per WINDOW. They differ exactly by the requests whose first
-- execution is before the window start and which have executions inside it (straddlers) — R1/R2
-- assert that identity exactly, so the difference is explained, not tolerated.

\set ON_ERROR_STOP 1
\if :{?def}
\else
\set def ''
\endif
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table dur (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dur(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
select set_config('du.def', :'def', true) is not null as def_set, set_config('du.plant', :'plant', true) as plant;

do $$
declare v text := current_setting('du.def'); b text; w text;
begin
  if coalesce(v, '') <> '' then
    execute 'create or replace function platform.drill_def__ai_usage() returns jsonb language sql immutable '
         || 'set search_path to ''pg_catalog'' as ' || quote_literal('select ' || quote_literal(v) || '::jsonb');
  end if;
  if current_setting('du.plant') = 'nolane' then
    b := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(b, $x$if v_lane = 'platform' and not public.is_platform_admin() then$x$, 'if false then');
    if w = b then raise exception 'plant nolane did not apply'; end if;
    execute w;
  end if;
end $$;

-- The window: the last 30 whole UTC hours × 24 before the current hour, aligned to hours.
create temp table duw on commit drop as
  select date_trunc('hour', now(), 'UTC') - interval '30 days' as w0, date_trunc('hour', now(), 'UTC') as w1;
select runtime.ai_usage_hourly_refresh((select w0 from duw), (select w1 from duw));

-- THE ORACLE, as admin@admin.com with the admin lane open.
create temp table dus (j jsonb) on commit drop;
grant all on dus, duw, dur to authenticated;
grant usage on sequence dur_n_seq to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
insert into dus select public.admin_spend_breakdown((select w0 from duw), (select w1 from duw), 'UTC', '{}'::jsonb,
  '{"context_heavy_tokens":200000,"iteration_heavy":10,"spike_multiplier":3,"hog_share_pct":5,"repeat_burst":5}'::jsonb);

-- THE ROLLUP over the window.
create temp table dur_roll on commit drop as
  select * from runtime._ai_usage_hourly h, duw where h.bucket >= duw.w0 and h.bucket < duw.w1;

-- T. Totals.
select pg_temp.chk('T1 cost: rollup = oracle to the cent',
  (select sum(cost) from dur_roll) = (select (j -> 'totals' ->> 'cost')::numeric from dus),
  format('rollup %s oracle %s', (select sum(cost) from dur_roll), (select j -> 'totals' ->> 'cost' from dus)));
select pg_temp.chk('T2 executions: rollup calls = oracle executions',
  (select sum(calls) from dur_roll) = (select (j -> 'totals' ->> 'executions')::bigint from dus),
  format('rollup %s oracle %s', (select sum(calls) from dur_roll), (select j -> 'totals' ->> 'executions' from dus)));
select pg_temp.chk('T3 paid executions equal',
  (select sum(paid_calls) from dur_roll) = (select (j -> 'totals' ->> 'paid_executions')::bigint from dus));
select pg_temp.chk('T4 manual and automated cost equal',
  (select sum(cost) filter (where trigger = 'manual') from dur_roll) is not distinct from (select nullif((j -> 'totals' ->> 'manual_cost')::numeric, 0) from dus)
  and (select coalesce(sum(cost) filter (where trigger = 'automated'), 0) from dur_roll) = (select (j -> 'totals' ->> 'automated_cost')::numeric from dus));

-- R. Requests and tokens: equal once the straddlers are accounted for, exactly.
create temp table dustr on commit drop as
  select ur.id, ur.total_input_tokens, ur.total_output_tokens, ur.total_cached_tokens
    from chat.user_request ur
   where exists (select 1 from runtime.global_execution e, duw where e.request_id = ur.id and e.created_at >= duw.w0 and e.created_at < duw.w1)
     and exists (select 1 from runtime.global_execution e, duw where e.request_id = ur.id and e.created_at < duw.w0);
select pg_temp.chk('R1 requests: oracle = rollup + requests straddling the window start',
  (select (j -> 'totals' ->> 'requests')::bigint from dus) = (select sum(requests) from dur_roll) + (select count(*) from dustr),
  format('oracle %s rollup %s straddlers %s', (select j -> 'totals' ->> 'requests' from dus), (select sum(requests) from dur_roll), (select count(*) from dustr)));
select pg_temp.chk('R2 tokens in/out/cached: oracle = rollup + the straddlers'' tokens',
  (select (j -> 'totals' ->> 'tokens_in')::bigint from dus) = (select sum(tokens_in) from dur_roll) + (select coalesce(sum(total_input_tokens), 0) from dustr)
  and (select (j -> 'totals' ->> 'tokens_out')::bigint from dus) = (select sum(tokens_out) from dur_roll) + (select coalesce(sum(total_output_tokens), 0) from dustr)
  and (select (j -> 'totals' ->> 'tokens_cached')::bigint from dus) = (select sum(tokens_cached) from dur_roll) + (select coalesce(sum(total_cached_tokens), 0) from dustr));

-- D. Every shared cut: each group the oracle lists has the rollup's cost and executions; the
-- oracle's "other" equals the rollup's groups past its list; the number of groups is the same.
do $$
declare
  v_dim record; v_bad text[] := '{}'; v_n integer := 0; v_diff integer; v_other numeric; v_distinct bigint;
begin
  for v_dim in select * from (values
      ('organization', 'organization_id::text'), ('user', 'person_id::text'), ('agent', 'agent_id::text'),
      ('app', 'app'), ('feature', 'feature'), ('origin', 'origin'), ('trigger', 'trigger'),
      ('source', 'source'), ('model', 'model'), ('day', 'to_char(bucket at time zone ''UTC'', ''YYYY-MM-DD'')')) d(name, expr)
  loop
    execute format($q$
      with r as (select coalesce(%s, '(none)') as key, sum(cost) as cost, sum(calls) as n from pg_temp.dur_roll group by 1),
           o as (select x ->> 'key' as key, (x ->> 'cost')::numeric as cost, (x ->> 'n')::bigint as n
                   from pg_temp.dus, jsonb_array_elements(dus.j -> 'dimensions' -> %L -> 'rows') x)
      select (select count(*) from o left join r using (key) where r.key is null or r.cost <> o.cost or r.n <> o.n),
             (select coalesce(sum(r.cost), 0) from r where r.key not in (select key from o)),
             (select count(*) from r)
    $q$, v_dim.expr, v_dim.name) into v_diff, v_other, v_distinct;
    v_n := v_n + 1;
    if v_diff > 0 then v_bad := v_bad || format('%s: %s groups differ', v_dim.name, v_diff); end if;
    if v_dim.name <> 'day' and v_other <> (select (j -> 'dimensions' -> v_dim.name ->> 'other_cost')::numeric from pg_temp.dus) then
      v_bad := v_bad || format('%s: other %s vs %s', v_dim.name, v_other, (select j -> 'dimensions' -> v_dim.name ->> 'other_cost' from pg_temp.dus));
    end if;
    if v_dim.name <> 'day' and v_distinct <> (select (j -> 'dimensions' -> v_dim.name ->> 'distinct')::bigint from pg_temp.dus) then
      v_bad := v_bad || format('%s: %s groups vs %s', v_dim.name, v_distinct, (select j -> 'dimensions' -> v_dim.name ->> 'distinct' from pg_temp.dus));
    end if;
  end loop;
  perform pg_temp.chk(format('D1 %s shared cuts: every group''s cost and executions, Other and the group count equal', v_n),
                      cardinality(v_bad) = 0, array_to_string(v_bad, '; '));
end $$;

-- A. THE DOOR: platform.drill_ask of ai_usage, as the admin inside the admin apps, = the oracle.
do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx (admin is an admin there)
  v_src jsonb := '{"kind":"entity","token":"ai_usage"}';
  v_w jsonb; v_total numeric; v_calls numeric; v_bad integer; v_rows jsonb; v_other numeric; v_n integer;
begin
  select jsonb_build_object('key', 'at', 'from', w0, 'to', w1) into v_w from pg_temp.duw;
  execute 'set local role authenticated';
  select (measures ->> 'cost')::numeric, (measures ->> 'calls')::numeric into v_total, v_calls
    from platform.drill_ask(c_org, v_src, jsonb_build_object('by', '[]'::jsonb, 'show', '["cost","calls"]'::jsonb, 'lane', 'platform', 'window', v_w))
   where kind = 'total';
  perform pg_temp.chk('A1 the door''s total cost and calls = the oracle''s',
    v_total = (select (j -> 'totals' ->> 'cost')::numeric from pg_temp.dus) and v_calls = (select (j -> 'totals' ->> 'executions')::numeric from pg_temp.dus),
    format('door %s / %s', v_total, v_calls));
  -- by model: every group the door shows equals the oracle's model row; groups + Other = total
  select jsonb_agg(to_jsonb(a)) into v_rows
    from platform.drill_ask(c_org, v_src, jsonb_build_object('by', '["model"]'::jsonb, 'show', '["cost","calls"]'::jsonb, 'lane', 'platform', 'window', v_w)) a;
  select count(*) into v_bad
    from jsonb_array_elements(v_rows) x
    join pg_temp.dus on true
    left join lateral (select y from jsonb_array_elements(dus.j -> 'dimensions' -> 'model' -> 'rows') y
                        where y ->> 'key' = coalesce(x -> 'groups' ->> 'model', '(none)')) o on true
   where x ->> 'kind' = 'group' and (o.y is null or (o.y ->> 'cost')::numeric <> (x -> 'measures' ->> 'cost')::numeric
                                    or (o.y ->> 'n')::numeric <> (x -> 'measures' ->> 'calls')::numeric);
  select coalesce(sum((x -> 'measures' ->> 'cost')::numeric) filter (where x ->> 'kind' in ('group', 'other')), 0) into v_other from jsonb_array_elements(v_rows) x;
  perform pg_temp.chk('A2 by model: every group = the oracle''s model row, and the groups + Other add up to the total',
    v_bad = 0 and v_other = v_total, format('%s groups differ; groups+other %s total %s', v_bad, v_other, v_total));
  -- by provider then month: the door answers what the oracle cannot (no provider, no month there)
  select count(*) into v_n
    from platform.drill_ask(c_org, v_src, jsonb_build_object('by', '["provider","at:month"]'::jsonb, 'show', '["cost"]'::jsonb, 'lane', 'platform')) a
   where kind = 'group';
  perform pg_temp.chk('A3 provider × month over all time answers (the oracle is capped at 92 days and has neither)', v_n > 0, format('%s groups', v_n));
  -- the records behind a number (lane DRILL-LEDGER-RECORDS): refused in words without a window,
  -- and with one they add up to the number (the ledger's own executions, the same lane rule)
  begin
    perform platform.drill_rows(c_org, v_src, jsonb_build_object('lane', 'platform'));
    perform pg_temp.chk('A4 see these records refuses in words without a window', false, 'answered');
  exception when sqlstate '22023' then
    perform pg_temp.chk('A4 see these records: refused in words without a window (22023), and with the window its sums = the door''s total',
      (platform.drill_rows(c_org, v_src, jsonb_build_object('lane', 'platform', 'window', v_w, 'limit', 1)) -> 'measures' ->> 'cost')::numeric = v_total,
      sqlerrm);
  end;
  -- the names door
  perform pg_temp.chk('A5 names door answers the admin',
    (platform.ai_usage_names(c_org, '{"organization":["5dc930e9-bd65-44a1-8369-af773f6e1a5b"]}') -> 'organization' ->> '5dc930e9-bd65-44a1-8369-af773f6e1a5b') is not null);
  execute 'reset role';
end $$;

-- L. THE LANES, from test@test.com's seat (not a platform admin; not an admin of AI Matrx).
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_src jsonb := '{"kind":"entity","token":"ai_usage"}';
  v_org uuid; v_mine numeric; v_state text; v_admin_org uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';
  select x into v_org from iam.my_orgs() x limit 1;
  begin
    perform platform.drill_ask(v_org, v_src, '{"lane":"platform","show":["cost"]}');
    perform pg_temp.chk('L1 platform lane refused to a non-admin', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('L1 platform lane refused to a non-admin (42501)', true);
  end;
  begin
    perform platform.ai_usage_names(v_org, '{}');
    perform pg_temp.chk('L2 names door refused to a non-admin', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('L2 names door refused to a non-admin (42501)', true);
  end;
  select x into v_org from iam.my_orgs() x where x not in (select iam.my_admin_orgs()) limit 1;
  if v_org is not null then
    begin
      perform platform.drill_ask(v_org, v_src, '{"lane":"organization","show":["cost"]}');
      perform pg_temp.chk('L3 organization lane refused to a member who is not its admin', false, 'answered');
    exception when insufficient_privilege then
      perform pg_temp.chk('L3 organization lane refused to a member who is not its admin (42501)', true);
    end;
  else
    perform pg_temp.chk('L3 organization lane: she administers every organization she is in (not measured)', true, 'not measured');
  end if;
  perform set_config('request.headers', '{}', true);
  select x into v_org from iam.my_orgs() x limit 1;
  select (measures ->> 'cost')::numeric into v_mine
    from platform.drill_ask(v_org, v_src, '{"lane":"mine","show":["cost"]}') where kind = 'total';
  execute 'reset role';
  perform pg_temp.chk('L4 mine lane = exactly her own rollup rows',
    coalesce(v_mine, 0) = (select coalesce(sum(cost), 0) from runtime._ai_usage_hourly where person_id = c_me),
    format('door %s', v_mine));
  select x into v_admin_org from iam.memberships m, lateral (select m.container_id) s(x)
   where m.user_id = c_me and m.container_type = 'organization' and m.role in ('owner', 'admin') and m.deleted_at is null limit 1;
  if v_admin_org is not null then
    execute 'set local role authenticated';
    select (measures ->> 'cost')::numeric into v_mine
      from platform.drill_ask(v_admin_org, v_src, '{"lane":"organization","show":["cost"]}') where kind = 'total';
    execute 'reset role';
    perform pg_temp.chk('L5 organization lane (her own organization, as its admin) = exactly that organization''s rows',
      coalesce(v_mine, 0) = (select coalesce(sum(cost), 0) from runtime._ai_usage_hourly where organization_id = v_admin_org),
      format('door %s org %s', v_mine, v_admin_org));
  end if;
end $$;

-- C. One row per group: the unique index stands and two rebuilds of one window store each group once.
select runtime.ai_usage_hourly_refresh(now() - interval '2 days', now());
select runtime.ai_usage_hourly_refresh(now() - interval '2 days', now());
select pg_temp.chk('C1 the rollup stores each group once (unique index present, no duplicate after two rebuilds)',
  to_regclass('runtime._ai_usage_hourly_one_row_per_group') is not null
  and not exists (select 1 from runtime._ai_usage_hourly
                   group by bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source
                  having count(*) > 1));

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.dur order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.dur;
rollback;

-- DRILL-SERVER-2 — the acquisition page and the tool re-fetch report counted on the database.
-- (migrations/campaign/drillserver2_the_first_touch_lookups_are_indexed.sql,
--  migrations/campaign/drillserver2_a_new_identity_is_counted_from_one_view.sql,
--  migrations/campaign/drillserver2_a_tool_call_says_whether_it_repeated.sql,
--  migrations/campaign/drillserver2_drill_declares_tool_refetch_and_user_acquisition.sql)
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillserver2_green.sql
--
-- A. USER ACQUISITION — the door's total people, cost and requests over 30 days = a hand count from
--    auth.users, users.guest_executions and runtime._ai_usage_hourly (not through the view); the
--    traffic groups add up to the total; the count passes the old page's silent cap (50,000 guests).
-- T. TOOL RE-FETCH — the door's calls, repeats and same-data repeats over 30 days = chat.tool_call and
--    chat.vw_tool_refetch counted by hand; over all time every tool's calls, repeats, repeat rate,
--    same-data rate and median gap = chat.vw_tool_refetch_summary.
-- L. LANES — a person who is not a platform admin is refused (42501), and so is the admin outside the
--    admin apps.
-- Each check runs in its own block: a failure is recorded, never an abort, so a red run lists them all.

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table ds2 (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.ds2(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on ds2 to authenticated;
grant usage on sequence ds2_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('matrx.admin_lane', 'on', true);
select set_config('ds2.from', (now() - interval '30 days')::text, true), set_config('ds2.to', now()::text, true);

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- A. USER ACQUISITION
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_src constant jsonb := '{"kind":"entity","token":"user_acquisition"}';
  v_from timestamptz := current_setting('ds2.from')::timestamptz;
  v_to   timestamptz := current_setting('ds2.to')::timestamptz;
  v_w jsonb := jsonb_build_object('key', 'created_at', 'from', current_setting('ds2.from'), 'to', current_setting('ds2.to'));
  v_total jsonb; a jsonb;
  v_accounts bigint; v_visitors bigint; v_cost numeric; v_req bigint;
begin
  -- the hand count, from the base tables
  select count(*) into v_accounts from auth.users u where u.created_at >= v_from and u.created_at < v_to;
  select count(*) into v_visitors
    from users.guest_executions v
   where v.auth_user_id is null and v.converted_to_user_id is null
     and v.metadata ->> 'acquisition_user_id' is null
     and coalesce(v.created_at, v.first_execution_at) >= v_from and coalesce(v.created_at, v.first_execution_at) < v_to
     and not exists (select 1 from users.guest_executions o
                      where o.fingerprint = v.metadata ->> 'guest_fingerprint' and o.fingerprint <> v.fingerprint);
  select coalesce(sum(h.cost), 0), coalesce(sum(h.requests), 0) into v_cost, v_req
    from runtime._ai_usage_hourly h
   where h.person_id in (select u.id from auth.users u where u.created_at >= v_from and u.created_at < v_to);

  execute 'set local role authenticated';
  select to_jsonb(t) -> 'measures' into v_total
    from platform.drill_ask(null, c_src, jsonb_build_object('show', '["people","cost","requests"]'::jsonb, 'lane', 'platform', 'window', v_w)) t
   where t.kind = 'total';
  perform pg_temp.chk('A1 30 days: people = accounts first seen + visitors no account claims (hand count from auth.users and users.guest_executions)',
    (v_total ->> 'people')::bigint = v_accounts + v_visitors, format('door %s; hand %s accounts + %s visitors', v_total ->> 'people', v_accounts, v_visitors));
  perform pg_temp.chk('A2 30 days: cost and requests = those people''s AI usage in runtime._ai_usage_hourly',
    round((v_total ->> 'cost')::numeric, 6) = round(v_cost, 6) and (v_total ->> 'requests')::bigint = v_req,
    format('door %s / %s; hand %s / %s', v_total ->> 'cost', v_total ->> 'requests', v_cost, v_req));
  perform pg_temp.chk('A3 30 days: more identities than the old page''s silent cap of 50,000 guests (nothing capped)',
    (v_total ->> 'people')::bigint > 50000, v_total ->> 'people');

  select jsonb_agg(to_jsonb(t)) into a
    from platform.drill_ask(null, c_src, jsonb_build_object('by', '["traffic_kind"]'::jsonb, 'show', '["people","cost"]'::jsonb, 'lane', 'platform', 'window', v_w)) t;
  perform pg_temp.chk('A4 by traffic: the groups add up to the total',
    (select sum((e -> 'measures' ->> 'people')::bigint) from jsonb_array_elements(a) e where e ->> 'kind' in ('group', 'other')) = (v_total ->> 'people')::bigint,
    a::text);
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- T. TOOL RE-FETCH
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_src constant jsonb := '{"kind":"entity","token":"tool_refetch"}';
  v_from timestamptz := current_setting('ds2.from')::timestamptz;
  v_to   timestamptz := current_setting('ds2.to')::timestamptz;
  v_w jsonb := jsonb_build_object('key', 'at', 'from', current_setting('ds2.from'), 'to', current_setting('ds2.to'));
  v_all jsonb := jsonb_build_object('key', 'at', 'from', '2000-01-01T00:00:00Z', 'to', current_setting('ds2.to'));
  v_total jsonb; a jsonb; v_bad int;
  v_calls bigint; v_rep bigint; v_same bigint;
begin
  select count(*) into v_calls from chat.tool_call tc
   where tc.deleted_at is null and tc.tool_type = any (array['local', 'agent', 'external'])
     and tc.created_at >= v_from and tc.created_at < v_to;
  select count(*), count(*) filter (where r.same_data) into v_rep, v_same
    from chat.vw_tool_refetch r where r.repeat_at >= v_from and r.repeat_at < v_to;

  execute 'set local role authenticated';
  select to_jsonb(t) -> 'measures' into v_total
    from platform.drill_ask(null, c_src, jsonb_build_object('show', '["calls","repeats","same_data_repeats","repeat_rate"]'::jsonb, 'lane', 'platform', 'window', v_w)) t
   where t.kind = 'total';
  perform pg_temp.chk('T1 30 days: calls, repeats and same-data repeats = chat.tool_call and chat.vw_tool_refetch counted by hand',
    (v_total ->> 'calls')::bigint = v_calls and (v_total ->> 'repeats')::bigint = v_rep and (v_total ->> 'same_data_repeats')::bigint = v_same,
    format('door %s; hand %s / %s / %s', v_total, v_calls, v_rep, v_same));
  perform pg_temp.chk('T2 30 days: repeat share = repeats / calls',
    round((v_total ->> 'repeat_rate')::numeric, 6) = round(v_rep::numeric / nullif(v_calls, 0), 6), v_total ->> 'repeat_rate');

  select jsonb_agg(to_jsonb(t)) into a
    from platform.drill_ask(null, c_src, jsonb_build_object('by', '["tool"]'::jsonb, 'limit', 1000, 'lane', 'platform', 'window', v_all,
           'show', '["calls","repeats","repeat_rate","same_data_rate","median_gap_calls","chars_refetched_same_data"]'::jsonb)) t where t.kind = 'group';
  execute 'reset role';
  select count(*) into v_bad
    from chat.vw_tool_refetch_summary s
    left join lateral (select e -> 'measures' m from jsonb_array_elements(a) e where e -> 'groups' ->> 'tool' = s.tool_name) d on true
   where d.m is null
      or (d.m ->> 'calls')::bigint <> s.total_calls
      or (d.m ->> 'repeats')::bigint <> s.repeats
      or round((d.m ->> 'repeat_rate')::numeric, 4) <> s.repeat_rate
      or round((d.m ->> 'same_data_rate')::numeric, 4) <> s.same_data_rate
      or (d.m ->> 'chars_refetched_same_data')::bigint <> s.chars_refetched_same_data
      or round((d.m ->> 'median_gap_calls')::numeric, 3) is distinct from round(s.median_gap_calls::numeric, 3);
  perform pg_temp.chk('T3 all time, by tool: calls, repeats, repeat and same-data rates, characters and median gap = chat.vw_tool_refetch_summary for every tool',
    v_bad = 0 and jsonb_array_length(a) = (select count(*) from chat.vw_tool_refetch_summary),
    format('%s of %s tools differ; door groups %s', v_bad, (select count(*) from chat.vw_tool_refetch_summary), jsonb_array_length(a)));
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- L. LANES — test@test.com (not a platform admin) inside the admin apps, and admin outside them.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  k text;
  c_test uuid := (select id from auth.users where email = 'test@test.com');
begin
  foreach k in array array['user_acquisition', 'tool_refetch'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
    perform set_config('matrx.admin_lane', 'on', true);
    execute 'set local role authenticated';
    begin
      perform platform.drill_ask(null, jsonb_build_object('kind', 'entity', 'token', k), '{"lane":"platform"}');
      perform pg_temp.chk(format('L1 %s: test@test.com (not a platform admin) is refused', k), false, 'answered');
    exception when insufficient_privilege then
      perform pg_temp.chk(format('L1 %s: test@test.com (not a platform admin) is refused (42501)', k), true);
    end;
    begin
      perform platform.drill_rows(null::uuid, jsonb_build_object('kind', 'entity', 'token', k), ('{"lane":"platform","window":{"key":"' || case k when 'tool_refetch' then 'at' else 'created_at' end || '","preset":"7d"}}')::jsonb);
      perform pg_temp.chk(format('L2 %s: test@test.com cannot list the records', k), false, 'answered');
    exception when insufficient_privilege then
      perform pg_temp.chk(format('L2 %s: test@test.com cannot list the records (42501)', k), true);
    end;
    execute 'reset role';
    perform set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
    perform set_config('matrx.admin_lane', 'off', true);
    execute 'set local role authenticated';
    begin
      perform platform.drill_ask(null, jsonb_build_object('kind', 'entity', 'token', k), '{"lane":"platform"}');
      perform pg_temp.chk(format('L3 %s: the admin outside the admin apps is refused', k), false, 'answered');
    exception when insufficient_privilege then
      perform pg_temp.chk(format('L3 %s: the admin outside the admin apps is refused (42501)', k), true);
    end;
    execute 'reset role';
    perform set_config('matrx.admin_lane', 'on', true);
  end loop;
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.ds2 order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.ds2;
rollback;

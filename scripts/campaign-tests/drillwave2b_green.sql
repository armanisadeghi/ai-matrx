-- DRILL-WAVE2-B — user requests (cx_requests), system errors (system_errors) and the Users roster
-- (account_roster) counted by the drill door. (migrations/campaign/drillwave2b_*.sql and the declared
-- definitions in aidream apps/shared/records/scripts/drill-definitions.)
--
--   psql "<clone dsn>" -f scripts/campaign-tests/drillwave2b_green.sql
--
-- Measured 2026-10-07 on the clone: R1-R3, E1-E2, A1-A2, L1 all PASS (run through the Supabase MCP; the drill
-- counts live rows only (deleted_at is null) and an account with no signup moment is outside a signup window).
-- THE ORACLES are hand SQL on the same tables: chat.user_request, ops.system_error and
-- billing.user_effective_plan over users._acquisition_facts. Every drill total, and every group of
-- a grouped answer, must equal its hand count. The lane rules are proven by a non-admin (test@test.com),
-- who must be refused the platform lane (42501) on all three definitions.
-- THE CLONE ONLY (never production): seats are simulated with request.jwt.claims and
-- `set local role authenticated`, exactly as PostgREST sets them. Nothing is kept: rolled back.

\set ON_ERROR_STOP 1
begin isolation level repeatable read;
set local statement_timeout = '900s';
set local client_min_messages = warning;
create temp table dwr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dwr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dwr to authenticated;
grant usage on sequence dwr_n_seq to authenticated;

do $$
declare
  c_org   constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  v_w jsonb := jsonb_build_object('key', 'at', 'from', '2000-01-01T00:00:00Z', 'to', to_char(now() + interval '1 day', 'YYYY-MM-DD"T"00:00:00"Z"'));
  v_wa jsonb := jsonb_build_object('key', 'created_at', 'from', '2000-01-01T00:00:00Z', 'to', to_char(now() + interval '1 day', 'YYYY-MM-DD"T"00:00:00"Z"'));
  v_hi timestamptz := date_trunc('day', now() + interval '1 day');
  v_ask numeric; v_hand numeric; v_n int; v_state text; v_def text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
  execute 'set local role authenticated';

  -- ── cx_requests ──
  select (a.measures ->> 'requests')::numeric into v_ask from platform.drill_ask(c_org, '{"kind":"entity","token":"cx_requests"}',
    jsonb_build_object('lane', 'platform', 'by', '["status"]'::jsonb, 'show', '["requests"]'::jsonb, 'window', v_w, 'limit', 1000)) a where a.kind = 'total';
  execute 'reset role';
  select count(*) into v_hand from chat.user_request where created_at < v_hi and deleted_at is null;
  perform pg_temp.chk('R1 cx_requests total = every chat.user_request row', v_ask = v_hand, format('%s vs %s', v_ask, v_hand));

  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_org, '{"kind":"entity","token":"cx_requests"}',
    jsonb_build_object('lane', 'platform', 'by', '["status"]'::jsonb, 'show', '["requests","failed","cost","tokens_total","tool_calls"]'::jsonb, 'window', v_w, 'limit', 1000)) a
   where a.kind = 'group'
     and not exists (select 1 from chat.user_request r where r.deleted_at is null and r.status is not distinct from (a.groups ->> 'status')
        having count(*) = (a.measures ->> 'requests')::bigint
           and coalesce(sum(r.total_cost), 0) = coalesce((a.measures ->> 'cost')::numeric, 0)
           and coalesce(sum(r.total_tokens), 0) = coalesce((a.measures ->> 'tokens_total')::numeric, 0)
           and coalesce(sum(r.total_tool_calls), 0) = coalesce((a.measures ->> 'tool_calls')::numeric, 0));
  execute 'reset role';
  perform pg_temp.chk('R2 every status group: requests, cost, tokens and tool calls = hand sums', v_n = 0, format('%s groups differ', v_n));

  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_org, '{"kind":"entity","token":"cx_requests"}',
    jsonb_build_object('lane', 'platform', 'by', '["conversation"]'::jsonb, 'show', '["requests","cost","started","last_activity"]'::jsonb, 'window', v_w, 'limit', 25, 'sort', '{"key":"cost","direction":"desc"}'::jsonb)) a
   where a.kind = 'group'
     and not exists (select 1 from chat.user_request r where r.deleted_at is null and r.conversation_id::text is not distinct from (a.groups ->> 'conversation')
        having count(*) = (a.measures ->> 'requests')::bigint
           and sum(r.total_cost) = (a.measures ->> 'cost')::numeric
           and max(r.created_at) = (a.measures ->> 'last_activity')::timestamptz);
  execute 'reset role';
  perform pg_temp.chk('R3 the 25 costliest conversations: requests, cost and last activity = hand', v_n = 0, format('%s differ', v_n));

  -- ── system_errors ──
  execute 'set local role authenticated';
  select (a.measures ->> 'errors')::numeric into v_ask from platform.drill_ask(c_org, '{"kind":"entity","token":"system_errors"}',
    jsonb_build_object('lane', 'platform', 'by', '["source_app"]'::jsonb, 'show', '["errors","open"]'::jsonb, 'window', v_w, 'limit', 1000)) a where a.kind = 'total';
  execute 'reset role';
  select count(*) into v_hand from ops.system_error where occurred_at < v_hi;
  perform pg_temp.chk('E1 system_errors total = every ops.system_error row', v_ask = v_hand, format('%s vs %s', v_ask, v_hand));

  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_org, '{"kind":"entity","token":"system_errors"}',
    jsonb_build_object('lane', 'platform', 'by', '["source_app"]'::jsonb, 'show', '["errors","open","resolved"]'::jsonb, 'window', v_w, 'limit', 1000)) a
   where a.kind = 'group'
     and not exists (select 1 from ops.system_error e where e.source_app is not distinct from (a.groups ->> 'source_app')
        having count(*) = (a.measures ->> 'errors')::bigint
           and count(*) filter (where e.resolved_at is null) = (a.measures ->> 'open')::bigint
           and count(*) filter (where e.resolved_at is not null) = (a.measures ->> 'resolved')::bigint);
  execute 'reset role';
  perform pg_temp.chk('E2 every app group: errors, open and resolved = hand counts', v_n = 0, format('%s groups differ', v_n));

  -- ── account_roster ──
  execute 'set local role authenticated';
  select (a.measures ->> 'accounts')::numeric into v_ask from platform.drill_ask(c_org, '{"kind":"entity","token":"account_roster"}',
    jsonb_build_object('lane', 'platform', 'by', '["plan"]'::jsonb, 'show', '["accounts","cost","requests"]'::jsonb, 'window', v_wa, 'limit', 1000)) a where a.kind = 'total';
  execute 'reset role';
  select count(*) into v_hand from users._acquisition_facts where person_id is not null and created_at is not null;
  perform pg_temp.chk('A1 account_roster total = every account of the acquisition facts', v_ask = v_hand, format('%s vs %s', v_ask, v_hand));

  execute 'set local role authenticated';
  select count(*) into v_n from platform.drill_ask(c_org, '{"kind":"entity","token":"account_roster"}',
    jsonb_build_object('lane', 'platform', 'by', '["plan"]'::jsonb, 'show', '["accounts","cost","requests"]'::jsonb, 'window', v_wa, 'limit', 1000)) a
   where a.kind = 'group'
     and not exists (select 1 from users._acquisition_facts f
          left join billing.plan p on p.plan_key = billing.user_effective_plan(f.person_id)
         where f.person_id is not null and coalesce(p.name, billing.user_effective_plan(f.person_id), 'No plan') = (a.groups ->> 'plan')
        having count(*) = (a.measures ->> 'accounts')::bigint and sum(f.cost) = (a.measures ->> 'cost')::numeric and sum(f.requests) = (a.measures ->> 'requests')::numeric);
  execute 'reset role';
  perform pg_temp.chk('A2 every plan group: accounts, cost and requests = hand (billing.user_effective_plan)', v_n = 0, format('%s plans differ', v_n));

  -- ── lanes: a non-admin is refused the platform lane on all three ──
  perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
  v_def := '';
  foreach v_state in array array['cx_requests', 'system_errors', 'account_roster'] loop
    execute 'set local role authenticated';
    begin
      perform platform.drill_ask(c_org, jsonb_build_object('kind', 'entity', 'token', v_state), jsonb_build_object('lane', 'platform', 'window', v_w));
      v_def := v_def || v_state || ':answered ';
    exception when insufficient_privilege then v_def := v_def || v_state || ':42501 ';
    end;
    execute 'reset role';
  end loop;
  perform pg_temp.chk('L1 test@test.com is refused the platform lane on all three definitions (42501)', v_def = 'cx_requests:42501 system_errors:42501 account_roster:42501 ', v_def);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(detail, 300) as detail from pg_temp.dwr order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.dwr;
rollback;

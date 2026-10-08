-- DRILL-FACTS — usage is counted from stored execution facts and gives the SAME answers, row for row.
-- (migrations/campaign/drillfacts_a_the_execution_facts_table_is_row_secured.sql,
--  drillfacts_b_the_execution_facts_are_filled.sql, drillfacts_c_usage_is_counted_from_the_execution_facts.sql)
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), AFTER the three up files,
-- everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillfacts_green.sql
--   psql … -v plant=fact   moves one stored execution's cost by a cent → F and V go RED
--   psql … -v plant=tail   the view forgets the executions after the watermark → L goes RED
--   psql … -v quick=1      the page's questions only, platform seat
--   psql … -v compiler=migrations/campaign/drillcompileperf_a_drill_counts_its_groups_before_it_ranks_them.sql
--                          a third pass, timed only: the facts with that compiler installed inside this
--                          transaction (lane DRILL-COMPILE-PERF's pending rewrite; never kept)
--
-- F. FACTS — the facts before the watermark equal runtime._ai_usage_calls_live (the rules, verbatim the
--    old view) row for row, every column, over the whole ledger and over the nightly's 35 days.
-- V. VIEW — runtime._ai_usage_calls (facts + live tail) equals the rules row for row, whole ledger.
-- R. ROLLUP — runtime._ai_usage_hourly rebuilt by the new body (summed from the facts) equals the rollup
--    the OLD body builds (installed from the inverse inside this transaction), group for group, 35 days.
-- L. LIVE TAIL — an execution written after the watermark is counted at once; after the next scheduled
--    refresh it is a stored fact; the watermark moved.
-- E. EQUIVALENCE — the usage page's questions (by person, day, conversation, model, provider, agent,
--    feature; 30 and 90 days; everyone and one person) and a matrix of other questions over ai_usage_executions
--    and ai_usage, plus the records behind them (drill_rows), from every lane's own seat (platform:
--    admin@admin.com inside the admin apps; organization: admin@admin.com as an owner; mine: test@test.com):
--    the answer with the facts installed equals the answer with the old view (inverse installed inside this
--    transaction), every row in order as text; a refusal must be the same refusal.
-- T. TIME — each question's milliseconds in both passes (each asked twice, the second timed), and the
--    refresh's 48-hour and 35-day runtime under both bodies (printed, not judged).
--
-- Each check is recorded, never an abort, so a red run lists them all.

\set ON_ERROR_STOP 1
\if :{?plant}
\else
\set plant none
\endif
\if :{?quick}
\else
\set quick 0
\endif
\if :{?compiler}
\set third 1
\else
\set third 0
\endif

set transaction_timeout = 0;
begin isolation level read committed;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local client_min_messages = warning;
select set_config('dfx.plant', :'plant', true) \g /dev/null
select set_config('dfx.quick', :'quick', true) \g /dev/null

create temp table dfx_q (n serial primary key, def text, seat text, label text, door text, q jsonb) on commit drop;
create temp table dfx_a (pass int, n int, a text, ms numeric, primary key (pass, n)) on commit drop;
create temp table dfx_seat (seat text primary key, sub uuid, admin_lane boolean, org uuid, lane text) on commit drop;
create temp table dfx_r (n serial, name text, ok boolean, detail text) on commit drop;
create temp table dfx_t (what text, body text, ms numeric) on commit drop;
grant all on dfx_q, dfx_a, dfx_seat, dfx_r, dfx_t to authenticated;
grant usage on sequence dfx_r_n_seq to authenticated;

create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dfx_r(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

-- ── the refresh, NEW body: 48 hours (twice: cold, then the steady 10-minute case) and 35 days ─────────
create or replace function pg_temp.dfx_time_refresh(p_body text) returns void language plpgsql as $$
declare t0 timestamptz;
begin
  t0 := clock_timestamp(); perform runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now());
  insert into pg_temp.dfx_t values ('refresh 48h (first)', p_body, round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now());
  insert into pg_temp.dfx_t values ('refresh 48h (steady)', p_body, round(extract(epoch from clock_timestamp() - t0) * 1000));
  t0 := clock_timestamp(); perform runtime.ai_usage_hourly_refresh(now() - interval '35 days', now());
  insert into pg_temp.dfx_t values ('refresh 35d', p_body, round(extract(epoch from clock_timestamp() - t0) * 1000));
end $$;
select pg_temp.dfx_time_refresh('new (facts)');

-- PLANTS
do $$
begin
  if current_setting('dfx.plant') = 'fact' then
    update runtime._ai_usage_execution_facts set cost = cost + 0.01
     where execution_id = (select execution_id from runtime._ai_usage_execution_facts
                            where created_at > now() - interval '20 days' and created_at < now() - interval '3 days' order by execution_id limit 1);
  end if;
end $$;

-- ── F / V / R ───────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_to timestamptz := (select covered_to from runtime._ai_usage_hourly_watermark where singleton);
  v_d bigint; v_e bigint; v_n bigint; v_m bigint;
begin
  -- F: whole ledger before the watermark
  select count(*) into v_d from (
    select execution_id, created_at, bucket, bucket_10m, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
           cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls, request_id, conversation_id, session_id,
           got_nothing_back, iterations, call_model, has_request, finish_reason, tool_calls
      from runtime._ai_usage_execution_facts where created_at < v_to
    except all
    select * from runtime._ai_usage_calls_live where created_at < v_to) x;
  select count(*) into v_e from (
    select * from runtime._ai_usage_calls_live where created_at < v_to
    except all
    select execution_id, created_at, bucket, bucket_10m, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
           cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls, request_id, conversation_id, session_id,
           got_nothing_back, iterations, call_model, has_request, finish_reason, tool_calls
      from runtime._ai_usage_execution_facts where created_at < v_to) x;
  select count(*) into v_n from runtime._ai_usage_calls_live where created_at < v_to;
  perform pg_temp.chk('F the facts equal the rules row for row, every column, the whole ledger before the watermark',
                      v_d = 0 and v_e = 0 and v_n > 0, format('%s executions; %s only in the facts, %s only in the rules', v_n, v_d, v_e));
  select count(*) into v_n from runtime._ai_usage_calls_live where created_at >= now() - interval '35 days' and created_at < v_to;
  select count(*) into v_d from (
    select execution_id, cost, model, provider, person_id, conversation_id, requests, tokens_in from runtime._ai_usage_execution_facts
     where created_at >= now() - interval '35 days' and created_at < v_to
    except all
    select execution_id, cost, model, provider, person_id, conversation_id, requests, tokens_in from runtime._ai_usage_calls_live
     where created_at >= now() - interval '35 days' and created_at < v_to) x;
  perform pg_temp.chk('F the nightly''s 35 days: the facts equal the rules', v_d = 0 and v_n > 0, format('%s executions, %s differ', v_n, v_d));

  -- V: the view (facts + live tail) is the rules, whole ledger
  select count(*) into v_d from (select * from runtime._ai_usage_calls except all select * from runtime._ai_usage_calls_live) x;
  select count(*) into v_e from (select * from runtime._ai_usage_calls_live except all select * from runtime._ai_usage_calls) x;
  select count(*) into v_n from runtime._ai_usage_calls;
  select count(*) into v_m from runtime.global_execution;
  perform pg_temp.chk('V runtime._ai_usage_calls equals the rules row for row (facts before the watermark, live after)',
                      v_d = 0 and v_e = 0 and v_n = v_m, format('%s rows, ledger %s; %s only in the view, %s only in the rules', v_n, v_m, v_d, v_e));
  perform pg_temp.chk('V the view reads the facts (its plan scans runtime._ai_usage_execution_facts)',
                      pg_get_viewdef('runtime._ai_usage_calls'::regclass) like '%_ai_usage_execution_facts%');
  perform pg_temp.chk('V the view keeps no client grant',
                      not has_table_privilege('authenticated', 'runtime._ai_usage_calls', 'select')
                      and not has_table_privilege('anon', 'runtime._ai_usage_calls', 'select')
                      and not has_table_privilege('authenticated', 'runtime._ai_usage_execution_facts', 'select')
                      and (select relrowsecurity from pg_class where oid = 'runtime._ai_usage_execution_facts'::regclass));
end $$;

-- R: the rollup the new body built (35 days, above) vs the rollup the OLD body builds
create temp table dfx_roll_new on commit drop as
  select bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
         cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls
    from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '35 days', 'UTC');
create temp table dfx_wm_new on commit drop as select * from runtime._ai_usage_hourly_watermark;
-- the fact plant has been judged by F and V: put the cent back (the up file's own census would refuse it)
update runtime._ai_usage_execution_facts f set cost = l.cost
  from runtime._ai_usage_calls_live l
 where current_setting('dfx.plant') = 'fact' and l.execution_id = f.execution_id and l.cost <> f.cost;

-- ── the questions ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid; v_mine uuid; v_busy uuid;
begin
  select h.organization_id into v_org
    from runtime._ai_usage_hourly h
    join iam.organization_member m on m.organization_id = h.organization_id and m.user_id = c_admin and m.role in ('owner', 'admin')
   where h.bucket > now() - interval '30 days'
   group by 1 having count(distinct h.person_id) > 1 order by sum(h.cost) desc limit 1;
  select h.organization_id into v_mine
    from runtime._ai_usage_hourly h where h.person_id = c_test and h.bucket > now() - interval '30 days'
   group by 1 order by sum(h.calls) desc limit 1;
  insert into dfx_seat values
    ('platform', c_admin, true, null, 'platform'),
    ('organization', c_admin, false, v_org, 'organization'),
    ('mine', c_test, false, v_mine, 'mine');
  select h.person_id into v_busy from runtime._ai_usage_hourly h
   where h.bucket > now() - interval '30 days' and h.person_id is not null group by 1 order by sum(h.calls) desc limit 1;
  perform set_config('dfx.busy', v_busy::text, true);
end $$;

do $$
declare
  s text; d text; st record;
  v_quick boolean := current_setting('dfx.quick') = '1';
  v_busy text := current_setting('dfx.busy');
  w jsonb;
begin
  -- the usage page's questions: every seat, 30 and 90 days, each cut; "one person" = the busiest person
  -- in the platform lane (a where) and the person's own lane (mine)
  for st in select * from dfx_seat where seat = 'platform' or not v_quick loop
    foreach d in array array['30d', '90d'] loop
      w := jsonb_build_object('key', 'at', 'preset', d);
      foreach s in array array['person', 'at:day', 'conversation', 'model', 'provider', 'agent', 'feature'] loop
        insert into dfx_q (def, seat, label, door, q) values
          ('ai_usage_executions', st.seat, format('page %s %s', s, d), 'ask', jsonb_build_object('by', jsonb_build_array(s), 'window', w, 'lane', st.lane));
        if st.seat = 'platform' then
          insert into dfx_q (def, seat, label, door, q) values
            ('ai_usage_executions', st.seat, format('page one person: %s %s', s, d), 'ask',
             jsonb_build_object('by', jsonb_build_array(s), 'where', jsonb_build_object('person', v_busy), 'window', w, 'lane', st.lane));
        end if;
      end loop;
      insert into dfx_q (def, seat, label, door, q) values
        ('ai_usage_executions', st.seat, format('page conversation level %s', d), 'ask', jsonb_build_object('by', '["conversation"]'::jsonb,
          'show', '["cost","calls","tokens_in","tokens_out","started","last_activity","duration"]'::jsonb, 'window', w, 'lane', st.lane)),
        ('ai_usage_executions', st.seat, format('page records %s', d), 'rows', jsonb_build_object('window', w, 'lane', st.lane, 'limit', 50)),
        ('ai_usage', st.seat, format('page ai_usage records %s', d), 'rows', jsonb_build_object('window', w, 'lane', st.lane, 'limit', 50)),
        ('ai_usage', st.seat, format('page ai_usage by model %s', d), 'ask', jsonb_build_object('by', '["model"]'::jsonb, 'window', w, 'lane', st.lane));
    end loop;
  end loop;
  if not v_quick then
    for st in select * from dfx_seat loop
      w := '{"key":"at","preset":"7d"}'::jsonb;
      insert into dfx_q (def, seat, label, door, q)
      select 'ai_usage_executions', st.seat, x.label, 'ask', x.q || jsonb_build_object('lane', st.lane, 'window', coalesce(x.q -> 'window', w))
        from (values
          ('total, every Measure', '{"by":[],"show":["cost","calls","requests","distinct_requests","conversations","people","tokens_in","tokens_out","tokens_cached","tokens_total","tool_calls","last_activity","duration","started","iterations","unpriced_calls","context_per_call","cost_per_request"]}'::jsonb),
          ('session, every Measure limit 5', '{"by":["session"],"show":["cost","calls","requests","distinct_requests","people","tokens_total","tool_calls","duration"],"limit":5}'),
          ('call_model limit 3', '{"by":["call_model"],"limit":3}'),
          ('origin x trigger pivot', '{"by":["origin"],"across":"trigger"}'),
          ('source, app', '{"by":["source","app"],"limit":10}'),
          ('bucket_10m limit 6', '{"by":["bucket_10m"],"limit":6}'),
          ('got_nothing_back / has_request', '{"by":["got_nothing_back","has_request"]}'),
          ('finish_reason', '{"by":["finish_reason"]}'),
          ('request limit 5 by cost', '{"by":["request"],"limit":5,"sort":{"key":"cost","direction":"desc"}}'),
          ('hour compare', '{"by":["at:hour"],"compare":"previous_period","limit":6}'),
          ('model where provider not set', '{"by":["model"],"where":{"provider":null}}'),
          ('person having cost share >= 2% 90d', '{"by":["person"],"having":[{"measure":"cost","op":">=","share_of_total":2}],"window":{"key":"at","preset":"90d"}}'),
          ('week x provider 90d', '{"by":["at:week","provider"],"window":{"key":"at","preset":"90d"}}'),
          ('no window by person limit 4', '{"by":["person"],"limit":4,"window":null}')
        ) x(label, q);
      insert into dfx_q (def, seat, label, door, q)
      select 'ai_usage', st.seat, x.label, x.door, x.q || jsonb_build_object('lane', st.lane, 'window', coalesce(x.q -> 'window', '{"key":"at","preset":"30d"}'::jsonb))
        from (values
          ('records where model', 'rows', '{"limit":50,"where":{"origin":"human"}}'::jsonb),
          ('person x origin pivot', 'ask', '{"by":["person"],"across":"origin","limit":5}'),
          ('day every Measure', 'ask', '{"by":["at:day"]}')
        ) x(label, door, q);
    end loop;
  end if;
  update dfx_q set q = q - 'window' where q -> 'window' = 'null'::jsonb;
end $$;

-- ── one pass: every question from its own seat, asked twice, the second timed ─────────────────────────
create or replace function pg_temp.dfx_pass(p_pass int) returns void language plpgsql as $$
declare
  r record; st record; t0 timestamptz; v text; i int;
begin
  for r in select * from pg_temp.dfx_q order by n loop
    select * into st from pg_temp.dfx_seat where seat = r.seat;
    perform set_config('request.jwt.claims', json_build_object('sub', st.sub, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', case when st.admin_lane then '{"x-matrx-admin-lane":"1"}' else '{}' end, true);
    perform set_config('matrx.admin_lane', case when st.admin_lane then 'on' else 'off' end, true);
    execute 'set local role authenticated';
    for i in 1 .. 2 loop
      t0 := clock_timestamp();
      begin
        if r.door = 'rows' then
          v := (platform.drill_rows(st.org, jsonb_build_object('kind', 'entity', 'token', r.def), r.q))::text;
        else
          select coalesce(jsonb_agg(to_jsonb(a) - 'as_of' order by a.o), '[]'::jsonb)::text into v
            from platform.drill_ask(st.org, jsonb_build_object('kind', 'entity', 'token', r.def), r.q)
                 with ordinality a(kind, groups, measures, row_count, prior_groups, prior_measures, prior_row_count, delta, compare, distinct_groups, labels, says, as_of, o);
        end if;
      exception when others then
        v := 'REFUSED ' || sqlstate || ': ' || sqlerrm;
      end;
    end loop;
    insert into pg_temp.dfx_a values (p_pass, r.n, v, round(extract(epoch from clock_timestamp() - t0) * 1000));
    execute 'reset role';
  end loop;
end $$;

select pg_temp.dfx_pass(1);

-- ── the OLD bodies, inside this transaction only ───────────────────────────────────────────────────────
\i migrations/inverse/drillfacts_c_usage_is_counted_from_the_execution_facts_down.sql
-- the old body rebuilds the same 35 days; the watermark is put back to the new body's so the answers'
-- as_of and the records' cut are the same instant in both passes
select pg_temp.dfx_time_refresh('old (view)');
create temp table dfx_roll_old on commit drop as
  select bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
         cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls
    from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '35 days', 'UTC');
do $$
declare v_d bigint; v_e bigint; v_n bigint;
begin
  select count(*) into v_d from (select * from dfx_roll_new where bucket < (select covered_to from dfx_wm_new) - interval '1 hour'
                                 except all select * from dfx_roll_old where bucket < (select covered_to from dfx_wm_new) - interval '1 hour') x;
  select count(*) into v_e from (select * from dfx_roll_old where bucket < (select covered_to from dfx_wm_new) - interval '1 hour'
                                 except all select * from dfx_roll_new where bucket < (select covered_to from dfx_wm_new) - interval '1 hour') x;
  select count(*) into v_n from dfx_roll_new;
  perform pg_temp.chk('R the rollup summed from the facts equals the rollup the old body sums from the view (35 days)',
                      v_d = 0 and v_e = 0 and v_n > 0, format('%s groups; %s only new, %s only old', v_n, v_d, v_e));
end $$;
update runtime._ai_usage_hourly_watermark w set covered_from = n.covered_from, covered_to = n.covered_to, refreshed_at = n.refreshed_at
  from dfx_wm_new n where w.singleton;
-- the old body rebuilt hours up to its own later cut; put the new body's hours back so pass 2 reads the same rollup
delete from runtime._ai_usage_hourly where bucket >= date_trunc('hour', now() - interval '35 days', 'UTC');
insert into runtime._ai_usage_hourly (bucket, organization_id, person_id, agent_id, provider, model, app, feature, origin, trigger, source,
       cost, calls, paid_calls, requests, tokens_in, tokens_cached, tokens_out, unpriced_calls)
select * from dfx_roll_new;

select pg_temp.dfx_pass(2);

-- ── E. equivalence ───────────────────────────────────────────────────────────────────────────────────
insert into dfx_r (name, ok, detail)
select format('E %s · %s · %s', q.def, q.seat, q.label), a1.a is not distinct from a2.a,
       case when a1.a is distinct from a2.a then format('facts: %s … | old view: %s …', left(a1.a, 400), left(a2.a, 400)) end
  from dfx_q q join dfx_a a1 on a1.pass = 1 and a1.n = q.n join dfx_a a2 on a2.pass = 2 and a2.n = q.n
 order by q.n;
insert into dfx_r (name, ok, detail)
select 'E the matrix answers (not every question refused)', count(*) filter (where a1.a not like 'REFUSED%') > count(*) * 0.8,
       format('%s questions, %s answered, %s refused (the same way in both passes)', count(*), count(*) filter (where a1.a not like 'REFUSED%'), count(*) filter (where a1.a like 'REFUSED%'))
  from dfx_a a1 where a1.pass = 1;

-- ── back on the NEW bodies ─────────────────────────────────────────────────────────────────────────────
\i migrations/campaign/drillfacts_c_usage_is_counted_from_the_execution_facts.sql
\if :third
\i :compiler
select pg_temp.dfx_pass(3);
\endif

-- ── L. live tail ───────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  if current_setting('dfx.plant') = 'tail' then   -- PLANT: the view forgets the executions after the watermark
    execute 'create or replace view runtime._ai_usage_calls with (security_invoker = true) as '
         || replace(pg_get_viewdef('runtime._ai_usage_calls'::regclass), 'l.created_at >= COALESCE(', 'false AND l.created_at >= COALESCE(');
  end if;
end $$;
do $$
declare v_id uuid := gen_random_uuid(); v_src runtime.global_execution; v_wm timestamptz; v_n int;
begin
  select * into v_src from runtime.global_execution
   where request_id is not null and coalesce(link_kind, '') <> 'batch_work_item' order by created_at desc limit 1;
  v_src.id := v_id; v_src.created_at := clock_timestamp();
  insert into runtime.global_execution select v_src.*;
  select count(*) into v_n from runtime._ai_usage_calls where execution_id = v_id;
  perform pg_temp.chk('L an execution written after the watermark is counted at once (live tail)', v_n = 1, format('%s row(s)', v_n));
  select count(*) into v_n from runtime._ai_usage_execution_facts where execution_id = v_id;
  perform pg_temp.chk('L … and is not a stored fact yet', v_n = 0);
  select covered_to into v_wm from runtime._ai_usage_hourly_watermark;
  perform runtime.ai_usage_hourly_refresh(now() - interval '48 hours', now() + interval '1 second');
  select count(*) into v_n from runtime._ai_usage_execution_facts where execution_id = v_id;
  perform pg_temp.chk('L after the scheduled 48-hour refresh it is a stored fact, counted once by the view, and the watermark moved',
                      v_n = 1 and (select count(*) from runtime._ai_usage_calls where execution_id = v_id) = 1
                      and (select covered_to from runtime._ai_usage_hourly_watermark) > v_wm);
end $$;

-- ── T. time ──────────────────────────────────────────────────────────────────────────────────────────
\pset footer off
select what, max(ms) filter (where body = 'old (view)') as old_ms, max(ms) filter (where body = 'new (facts)') as new_ms
  from dfx_t group by what order by what;
select q.def, q.seat, q.label, a2.ms as old_ms, a1.ms as new_ms, a3.ms as new_with_compiler_ms,
       case when a3.a is null then null when a3.a is not distinct from a1.a then 'same' else 'DIFFERS' end as compiler_answer
  from dfx_q q join dfx_a a1 on a1.pass = 1 and a1.n = q.n join dfx_a a2 on a2.pass = 2 and a2.n = q.n
  left join dfx_a a3 on a3.pass = 3 and a3.n = q.n
 where q.label like 'page%' order by q.n;
select format('all questions: old %s ms (slowest %s), facts %s ms (slowest %s), facts + compiler %s ms (slowest %s)',
              sum(a2.ms), max(a2.ms), sum(a1.ms), max(a1.ms), sum(a3.ms), max(a3.ms)) as time
  from dfx_a a1 join dfx_a a2 on a2.pass = 2 and a2.n = a1.n left join dfx_a a3 on a3.pass = 3 and a3.n = a1.n where a1.pass = 1;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from dfx_r where not ok or name not like 'E %·%' order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from dfx_r;
rollback;

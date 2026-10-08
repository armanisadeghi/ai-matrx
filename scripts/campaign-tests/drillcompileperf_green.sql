-- DRILL-COMPILE-PERF — the aggregate-first compiler gives the SAME answer as the row-by-row one, row for row.
-- (migrations/campaign/drillcompileperf_a_drill_counts_its_groups_before_it_ranks_them.sql)
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), AFTER the up file, everything
-- rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillcompileperf_green.sql
--   psql … -v other=<file>   installs <file> for the second pass instead of the inverse (default: the inverse,
--                            which puts back the row-by-row platform._drill_compile — "v1" — inside this
--                            transaction only)
--   psql … -v plant=sum      makes the fine path re-add a sum as the largest fine row's sum (max) → E goes RED
--   psql … -v quick=1        the page's questions and one seat only (a smoke run)
--
-- E. EQUIVALENCE — a matrix of questions over every declared definition (ai_usage, ai_usage_executions,
--    ai_calls, kg_cost, workflow_runs, tool_refetch, user_acquisition, agents_by_model) and three standard
--    tables read as the seat (agent, task, ai_model — enum, date and inexact-number columns): no grouping, every
--    Dimension alone, time grains (latest periods kept), two and three levels, pivots (a Dimension and a
--    period across), comparisons, thresholds (value, share of the total, × the median), every Measure
--    shown at once (ratios, percentiles, spans, run rates, distinct counts), sorts by each Measure and by
--    a Dimension, limits that force Other, ad hoc operations, a where — in every lane the definition
--    offers, each from its own seat (platform: admin@admin.com inside the admin apps; organization:
--    admin@admin.com as an owner outside them; mine: test@test.com). Each answer (every row, in order, as
--    text) from the installed compiler must equal the answer from the other one; a refusal must be the
--    same refusal (SQLSTATE and words).
-- T. TIME — each pass's milliseconds for the usage page's questions (printed, not judged).
--
-- Each check is recorded, never an abort, so a red run lists them all.

\set ON_ERROR_STOP 1
\if :{?other}
\else
\set other migrations/inverse/drillcompileperf_a_drill_counts_its_groups_before_it_ranks_them_down.sql
\endif
\if :{?plant}
\else
\set plant none
\endif
\if :{?quick}
\else
\set quick 0
\endif

set transaction_timeout = 0;
begin isolation level repeatable read;
set local statement_timeout = 0;
set local transaction_timeout = 0;
set local client_min_messages = warning;
select set_config('dcp.plant', :'plant', true) \g /dev/null
select set_config('dcp.quick', :'quick', true) \g /dev/null

create temp table dcp_q (n serial primary key, def text, seat text, label text, q jsonb) on commit drop;
create temp table dcp_a (pass int, n int, a text, ms numeric, primary key (pass, n)) on commit drop;
create temp table dcp_seat (seat text primary key, sub uuid, admin_lane boolean, org uuid, lane text) on commit drop;
create temp table dcp_r (n serial, name text, ok boolean, detail text) on commit drop;
grant all on dcp_q, dcp_a, dcp_seat, dcp_r to authenticated;
grant usage on sequence dcp_r_n_seq to authenticated;

-- ── the seats ────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  v_org uuid; v_mine uuid;
begin
  select h.organization_id into v_org
    from runtime._ai_usage_hourly h
    join iam.organization_member m on m.organization_id = h.organization_id and m.user_id = c_admin and m.role in ('owner', 'admin')
   where h.bucket > now() - interval '30 days'
   group by 1 having count(distinct h.person_id) > 1 order by sum(h.cost) desc limit 1;
  select h.organization_id into v_mine
    from runtime._ai_usage_hourly h
   where h.person_id = c_test and h.bucket > now() - interval '30 days'
   group by 1 order by sum(h.calls) desc limit 1;
  insert into dcp_seat values
    ('platform', c_admin, true, null, 'platform'),
    ('organization', c_admin, false, v_org, 'organization'),
    ('mine', c_test, false, v_mine, 'mine');
end $$;

-- ── the questions ────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  k      text;
  d      jsonb;
  v_t    text;          -- the time Dimension
  v_dims text[];        -- every other Dimension
  v_low  text[];        -- the ones a pivot may take
  v_meas text[];
  v_num  text[];        -- Measures a threshold may read (a number, counted per row)
  v_add  text[];        -- and the ones that add up
  d1 text; d2 text; d3 text; lo text;
  w      jsonb;
  w90    jsonb;
  v_all  jsonb;
  v_of   text;          -- a summed column, for ad hoc operations
  v_tcol text;
  s      text;
  qs     jsonb;
  qx     jsonb;
  v_quick boolean := current_setting('dcp.quick') = '1';
  v_lanes jsonb;
begin
  foreach k in array array['ai_usage_executions','ai_usage','ai_calls','kg_cost','workflow_runs','tool_refetch','user_acquisition','agents_by_model','agent','task','ai_model'] loop
    continue when v_quick and k <> 'ai_usage_executions';
    d := platform._drill_resolve(null, k);
    v_lanes := d -> 'lanes';
    v_t := (select x ->> 'key' from jsonb_array_elements(d -> 'dimensions') x where x ->> 'kind' = 'time'
             order by x ->> 'key' in ('at', 'created_at') desc limit 1);
    v_tcol := (select x ->> 'from' from jsonb_array_elements(d -> 'dimensions') x where x ->> 'key' = v_t);
    select array_agg(x ->> 'key' order by o) into v_dims from jsonb_array_elements(d -> 'dimensions') with ordinality z(x, o) where x ->> 'kind' <> 'time';
    select array_agg(x ->> 'key' order by o) into v_low from jsonb_array_elements(d -> 'dimensions') with ordinality z(x, o)
     where x ->> 'kind' in ('choice', 'boolean') and coalesce(x ->> 'cardinality', 'low') <> 'high';
    select array_agg(x ->> 'key' order by o) into v_meas from jsonb_array_elements(d -> 'measures') with ordinality z(x, o);
    select array_agg(x ->> 'key' order by o) into v_num from jsonb_array_elements(d -> 'measures') with ordinality z(x, o)
     where coalesce(x ->> 'unit', '') <> 'time' and not (x ? 'at_grain');
    select array_agg(x ->> 'key' order by o) into v_add from jsonb_array_elements(d -> 'measures') with ordinality z(x, o)
     where (x ->> 'op' in ('sum', 'count', 'sum_of')) and coalesce((x ->> 'additive')::boolean, true) and not (x ? 'at_grain');
    v_of := (select x ->> 'of' from jsonb_array_elements(d -> 'measures') x where x ->> 'op' = 'sum' limit 1);
    d1 := coalesce((select y #>> '{}' from jsonb_array_elements(d -> 'default' -> 'by') y where position(':' in y #>> '{}') = 0 and y #>> '{}' <> v_t limit 1),
                   case when 'person' = any (v_dims) then 'person' end, v_dims[1]);
    d2 := coalesce((select y from unnest(v_low) y where y <> d1 limit 1), (select y from unnest(v_dims) y where y <> d1 limit 1));
    d3 := (select y from unnest(v_dims) y where y not in (d1, d2) and y not in ('model', 'provider', 'call_model') limit 1);
    lo := coalesce((select y from unnest(v_low) y where y not in (d1) limit 1), d2);
    -- the heavy views are asked over a week; the rest over 30 days
    w := jsonb_build_object('key', v_t, 'preset', case when k in ('ai_usage_executions', 'ai_calls') then '7d' when d ->> 'mode' = 'invoker' then '365d' else '30d' end);
    w90 := jsonb_build_object('key', v_t, 'preset', case when d ->> 'mode' = 'invoker' then '3650d' else '90d' end);
    v_all := to_jsonb(v_meas);
    qs := '[]'::jsonb;
    -- the usage page's questions (by person, conversation, model, day; 30 and 90 days; a level's Measures)
    if k = 'ai_usage_executions' then
      foreach s in array array['person', 'conversation', 'model', 'at:day'] loop
        qs := qs || jsonb_build_array(
          jsonb_build_object('label', 'page ' || s || ' 30d', 'q', jsonb_build_object('by', jsonb_build_array(s), 'window', jsonb_build_object('key', 'at', 'preset', '30d'))),
          jsonb_build_object('label', 'page ' || s || ' 90d', 'q', jsonb_build_object('by', jsonb_build_array(s), 'window', jsonb_build_object('key', 'at', 'preset', '90d'))));
      end loop;
      qs := qs || jsonb_build_array(
        jsonb_build_object('label', 'page conversation level 30d', 'q', jsonb_build_object('by', '["conversation"]'::jsonb,
          'show', '["cost","calls","tokens_in","tokens_out","started","last_activity","duration"]'::jsonb, 'window', jsonb_build_object('key', 'at', 'preset', '30d'))),
        jsonb_build_object('label', 'page by_conversation view 30d', 'q', jsonb_build_object('by', '["conversation"]'::jsonb,
          'show', '["cost","distinct_requests","cost_per_request","iterations","context_per_call"]'::jsonb, 'sort', '{"key":"cost","direction":"desc"}'::jsonb,
          'window', jsonb_build_object('key', 'at', 'preset', '30d'))));
    end if;
    if not v_quick then
      qs := qs || jsonb_build_array(
        jsonb_build_object('label', 'total, every Measure', 'q', jsonb_build_object('by', '[]'::jsonb, 'show', v_all, 'window', w)),
        jsonb_build_object('label', 'default question', 'q', jsonb_build_object('window', w)),
        jsonb_build_object('label', 'no window, by d1', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'limit', 4)),
        jsonb_build_object('label', 'd1 every Measure limit 5', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', v_all, 'limit', 5, 'window', w)),
        jsonb_build_object('label', 'd1 every Measure 90d limit 3', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', v_all, 'limit', 3, 'window', w90)),
        jsonb_build_object('label', 'day every Measure', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':day'), 'show', v_all, 'window', w)),
        jsonb_build_object('label', 'week limit 2 (latest kept)', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':week'), 'limit', 2, 'window', w90)),
        jsonb_build_object('label', 'month', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':month'), 'show', v_all, 'window', w90)),
        jsonb_build_object('label', 'hour limit 6', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':hour'), 'limit', 6, 'window', w)),
        jsonb_build_object('label', 'week sorted asc', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':week'), 'sort', jsonb_build_object('key', v_t, 'direction', 'asc'), 'limit', 3, 'window', w90)),
        jsonb_build_object('label', 'd1,d2 limit 7', 'q', jsonb_build_object('by', jsonb_build_array(d1, d2), 'show', to_jsonb(v_meas[1:3]), 'limit', 7, 'window', w)),
        jsonb_build_object('label', 'day,d1 limit 20', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':day', d1), 'limit', 20, 'window', w)),
        jsonb_build_object('label', 'd2,week', 'q', jsonb_build_object('by', jsonb_build_array(d2, v_t || ':week'), 'show', v_all, 'limit', 10, 'window', w90)),
        jsonb_build_object('label', 'd1,d2,d3 limit 10', 'q', jsonb_build_object('by', jsonb_build_array(d1, d2, coalesce(d3, v_t || ':week')), 'limit', 10, 'window', w)),
        jsonb_build_object('label', 'pivot d1 x lo', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'across', lo, 'show', v_all, 'limit', 4, 'window', w)),
        jsonb_build_object('label', 'pivot week x lo', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':week'), 'across', lo, 'window', w90)),
        jsonb_build_object('label', 'pivot total x lo', 'q', jsonb_build_object('by', '[]'::jsonb, 'across', lo, 'show', v_all, 'window', w)),
        jsonb_build_object('label', 'pivot d1 x day', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'across', v_t || ':day', 'limit', 3, 'window', w)),
        jsonb_build_object('label', 'compare d1', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', v_all, 'limit', 4, 'compare', 'previous_period', 'window', w)),
        jsonb_build_object('label', 'compare day', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':day'), 'compare', 'previous_period', 'window', w)),
        jsonb_build_object('label', 'compare total', 'q', jsonb_build_object('by', '[]'::jsonb, 'show', v_all, 'compare', 'previous_period', 'window', w)),
        jsonb_build_object('label', 'compare pivot d1 x lo', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'across', lo, 'limit', 3, 'compare', 'previous_period', 'window', w)),
        jsonb_build_object('label', 'compare week,d2 limit 5', 'q', jsonb_build_object('by', jsonb_build_array(v_t || ':week', d2), 'show', v_all, 'limit', 5, 'compare', 'previous_period', 'window', w90)),
        jsonb_build_object('label', 'sort d1 desc', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'sort', jsonb_build_object('key', d1, 'direction', 'desc'), 'limit', 3, 'window', w)),
        jsonb_build_object('label', 'where d2 not set', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'where', jsonb_build_object(d2, null), 'window', w)),
        jsonb_build_object('label', 'ad hoc operations', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'limit', 3, 'window', w, 'show',
          jsonb_build_array(jsonb_build_object('op', 'count'), jsonb_build_object('op', 'avg', 'of', v_of), jsonb_build_object('op', 'median', 'of', v_of),
                            jsonb_build_object('op', 'filled', 'of', v_of), jsonb_build_object('op', 'empty', 'of', v_of), jsonb_build_object('op', 'min', 'of', v_of),
                            jsonb_build_object('op', 'max', 'of', v_of), jsonb_build_object('op', 'sum', 'of', v_of), jsonb_build_object('op', 'count_distinct', 'of', d2),
                            jsonb_build_object('op', 'span', 'of', v_tcol)))),
        jsonb_build_object('label', 'ad hoc without median', 'q', jsonb_build_object('by', jsonb_build_array(d2), 'limit', 2, 'window', w, 'show',
          jsonb_build_array(jsonb_build_object('op', 'avg', 'of', v_of), jsonb_build_object('op', 'empty', 'of', v_of), jsonb_build_object('op', 'count_distinct', 'of', d1),
                            jsonb_build_object('op', 'count')))));
      foreach s in array v_dims loop
        qs := qs || jsonb_build_array(jsonb_build_object('label', 'by ' || s || ' limit 3', 'q',
                jsonb_build_object('by', jsonb_build_array(s), 'show', v_all, 'limit', 3, 'window', w)));
      end loop;
      foreach s in array v_meas loop
        qs := qs || jsonb_build_array(
          jsonb_build_object('label', 'sort ' || s || ' asc', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', v_all, 'limit', 3,
            'sort', jsonb_build_object('key', s, 'direction', 'asc'), 'window', w)),
          jsonb_build_object('label', 'alone ' || s || ' by d2', 'q', jsonb_build_object('by', jsonb_build_array(d2), 'show', jsonb_build_array(s), 'limit', 2, 'window', w)));
      end loop;
      foreach s in array coalesce(v_num, '{}') loop
        qs := qs || jsonb_build_array(
          jsonb_build_object('label', 'having ' || s || ' >= value', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', jsonb_build_array(s, v_meas[1]), 'limit', 4,
            'having', jsonb_build_array(jsonb_build_object('measure', s, 'op', '>=', 'value', 1)), 'window', w)),
          jsonb_build_object('label', 'having ' || s || ' > 0.5 x median', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', v_all, 'limit', 3,
            'having', jsonb_build_array(jsonb_build_object('measure', s, 'op', '>', 'times_median', 0.5, 'median_nonzero', true)), 'window', w)));
      end loop;
      foreach s in array coalesce(v_add, '{}') loop
        qs := qs || jsonb_build_array(
          jsonb_build_object('label', 'having ' || s || ' share >= 2%', 'q', jsonb_build_object('by', jsonb_build_array(d1), 'show', jsonb_build_array(s), 'limit', 3,
            'having', jsonb_build_array(jsonb_build_object('measure', s, 'op', '>=', 'share_of_total', 2)), 'window', w90)));
      end loop;
    end if;
    for qx in select y from jsonb_array_elements(qs) y loop
      insert into dcp_q (def, seat, label, q)
      select k, st.seat, qx ->> 'label', (qx -> 'q') || jsonb_build_object('lane', st.lane)
        from dcp_seat st
       where v_lanes ? st.lane
         and (st.seat = 'platform' or (not v_quick and (qx ->> 'label' like 'page%' or qx ->> 'label' in
               ('total, every Measure', 'd1 every Measure limit 5', 'day every Measure', 'pivot d1 x lo', 'compare d1', 'ad hoc operations', 'having ' || coalesce(v_add[1], '') || ' share >= 2%'))));
    end loop;
  end loop;
end $$;

-- ── one pass: every question from its own seat ───────────────────────────────────────────────────────
create or replace function pg_temp.dcp_pass(p_pass int) returns void language plpgsql as $$
declare
  r record; st record; t0 timestamptz; v text;
begin
  for r in select * from pg_temp.dcp_q order by n loop
    select * into st from pg_temp.dcp_seat where seat = r.seat;
    perform set_config('request.jwt.claims', json_build_object('sub', st.sub, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', case when st.admin_lane then '{"x-matrx-admin-lane":"1"}' else '{}' end, true);
    perform set_config('matrx.admin_lane', case when st.admin_lane then 'on' else 'off' end, true);
    execute 'set local role authenticated';
    t0 := clock_timestamp();
    begin
      select coalesce(jsonb_agg(to_jsonb(a) order by a.o), '[]'::jsonb)::text into v
        from platform.drill_ask(st.org, jsonb_build_object('kind', 'entity', 'token', r.def), r.q)
             with ordinality a(kind, groups, measures, row_count, prior_groups, prior_measures, prior_row_count, delta, compare, distinct_groups, labels, says, as_of, o);
    exception when others then
      v := 'REFUSED ' || sqlstate || ': ' || sqlerrm;
    end;
    insert into pg_temp.dcp_a values (p_pass, r.n, v, round(extract(epoch from clock_timestamp() - t0) * 1000));
    execute 'reset role';
  end loop;
end $$;

-- PLANT (sum): the fine path re-adds a sum as the largest of its fine rows' sums
do $$
begin
  if current_setting('dcp.plant') = 'sum' then
    execute replace(pg_get_functiondef('platform._drill_fine_agg_sql(jsonb,text,text,text,text)'::regprocedure),
                    $p$format('(sum(%s)%s)', p_col, w.once)$p$, $p$format('(max(%s)%s)', p_col, w.once)$p$);
  end if;
end $$;

select pg_temp.dcp_pass(1);
-- the other compiler, inside this transaction only
\i :other
select pg_temp.dcp_pass(2);

-- ── E. equivalence ───────────────────────────────────────────────────────────────────────────────────
insert into dcp_r (name, ok, detail)
select format('E %s · %s · %s', q.def, q.seat, q.label), a1.a is not distinct from a2.a,
       case when a1.a is distinct from a2.a then format('installed: %s … | other: %s …', left(a1.a, 600), left(a2.a, 600)) end
  from dcp_q q join dcp_a a1 on a1.pass = 1 and a1.n = q.n join dcp_a a2 on a2.pass = 2 and a2.n = q.n
 order by q.n;
insert into dcp_r (name, ok, detail)
select 'E the matrix answers (not every question refused)', count(*) filter (where a1.a not like 'REFUSED%') > count(*) * 0.8,
       format('%s questions, %s answered, %s refused (the same way in both passes)', count(*), count(*) filter (where a1.a not like 'REFUSED%'), count(*) filter (where a1.a like 'REFUSED%'))
  from dcp_a a1 where a1.pass = 1;

-- ── T. time ──────────────────────────────────────────────────────────────────────────────────────────
select q.def, q.seat, q.label, a1.ms as installed_ms, a2.ms as other_ms
  from dcp_q q join dcp_a a1 on a1.pass = 1 and a1.n = q.n join dcp_a a2 on a2.pass = 2 and a2.n = q.n
 where q.label like 'page%' order by q.n;
select format('all questions: installed %s ms, other %s ms', sum(a1.ms), sum(a2.ms)) as time
  from dcp_a a1 join dcp_a a2 on a2.pass = 2 and a2.n = a1.n where a1.pass = 1;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from dcp_r where not ok or name not like 'E %·%' order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from dcp_r;
rollback;

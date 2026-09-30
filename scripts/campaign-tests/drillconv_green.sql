-- DRILL-CONVERSIONS — parity and seat suite for the declared definitions kg_cost and workflow_runs
-- (migrations/campaign/drillconv_a_workflow_run_is_counted_from_one_view.sql,
--  migrations/campaign/drillconversions_drill_declares_kg_cost_and_workflow_runs.sql).
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillconv_green.sql
--   psql … -v plant=nolane -f …   removes the platform lane's admin check inside the transaction → S-lane checks go RED
--
-- K. KG COST PARITY — THE ORACLE is public.fn_kg_cost_unit_economics(days), the old "Unit economics"
--    section's own RPC, read as admin@admin.com in the same snapshot (the same now()), so the preset
--    window "Nd" (now() − N days → now()) is the oracle's window (started_at >= now() − N days).
--    Every number the old section printed is compared to the door's answer, rounded as the oracle
--    rounds (6 places; percent 1 place).
-- W. WORKFLOW RUNS — the oracle is workflow.run itself, read AS THE SEAT (its own row security), with
--    the runs list's rules (features/workflow-runtime/discovery/runs.ts) written out independently of
--    the view: duration = completed − (started, else created), failed = errored or failed, archived
--    runs left out.
-- S. SEATS — ask total = the seat's plain count; a non-member refused; the platform lane refused
--    outside the admin apps and to a non-admin; the mine lane = the person's own runs.

\set ON_ERROR_STOP 1
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table dcr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dcr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dcr to authenticated;
grant usage on sequence dcr_n_seq to authenticated;
select set_config('dc.plant', :'plant', true) as plant;

do $$
declare b text; w text;
begin
  if current_setting('dc.plant') = 'nolane' then
    b := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(b, $x$if v_lane = 'platform' and not public.is_platform_admin() then$x$, 'if false then');
    if w = b then raise exception 'plant nolane did not apply'; end if;
    execute w;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- K. KG COST: the door = the old unit-economics RPC, for 7, 30 and 90 days.
-- ════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);

do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx (the admin's own; calendar only)
  c_src constant jsonb := '{"kind":"entity","token":"kg_cost"}';
  v_days int; o jsonb; a jsonb; v_bad text[]; v_n int; v_total jsonb; x jsonb; y jsonb;
  v_hits numeric; v_calls numeric;
begin
  execute 'set local role authenticated';
  foreach v_days in array array[7, 30, 90] loop
    v_bad := '{}';
    o := public.fn_kg_cost_unit_economics(v_days);

    -- K1 window totals: runs, cost, embedding saved, inexact-cost runs, the 30-day projection's input
    select to_jsonb(t) -> 'measures' into v_total
      from platform.drill_ask(c_org, c_src, jsonb_build_object('show', '["runs","cost","embedding_saved"]'::jsonb, 'lane', 'platform',
                                                             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t
     where t.kind = 'total';
    if (v_total ->> 'runs')::bigint <> (o -> 'totals' ->> 'runs')::bigint then v_bad := v_bad || format('runs %s vs %s', v_total ->> 'runs', o -> 'totals' ->> 'runs'); end if;
    if round((v_total ->> 'cost')::numeric, 6) <> (o -> 'totals' ->> 'total_cost_usd')::numeric then v_bad := v_bad || format('cost %s vs %s', v_total ->> 'cost', o -> 'totals' ->> 'total_cost_usd'); end if;
    if round((v_total ->> 'embedding_saved')::numeric, 6) <> (o -> 'totals' ->> 'embedding_cost_saved_usd')::numeric then v_bad := v_bad || 'embedding saved'; end if;
    if round((v_total ->> 'cost')::numeric * 30.0 / v_days, 4) <> (o -> 'totals' ->> 'projected_monthly_usd')::numeric then v_bad := v_bad || 'projection from the total'; end if;
    select coalesce(sum((t.measures ->> 'runs')::bigint), 0) into v_n
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["cost_is_exact"]'::jsonb, 'show', '["runs"]'::jsonb, 'lane', 'platform',
                                                             'where', '{"cost_is_exact": false}'::jsonb,
                                                             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'total';
    if v_n <> (o -> 'totals' ->> 'inexact_cost_runs')::bigint then v_bad := v_bad || format('inexact %s vs %s', v_n, o -> 'totals' ->> 'inexact_cost_runs'); end if;
    perform pg_temp.chk(format('K1 %sd totals: runs, cost, embedding saved, inexact-cost runs = the oracle (projection = cost × 30 / days)', v_days),
                        cardinality(v_bad) = 0, array_to_string(v_bad, '; '));

    -- K2 the per-source-kind table: every group's runs, cost parts, cache hits and calls; same groups
    v_bad := '{}';
    select jsonb_agg(to_jsonb(t)) into a
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["source_kind"]'::jsonb, 'limit', 100, 'lane', 'platform',
             'show', '["runs","cost","embedding_cost","extraction_cost","cleanup_cost","enrichment_cost","cache_hits","embedding_calls"]'::jsonb,
             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'group';
    if jsonb_array_length(coalesce(a, '[]')) <> jsonb_array_length(o -> 'by_source_kind') then
      v_bad := v_bad || format('%s groups vs %s', jsonb_array_length(coalesce(a, '[]')), jsonb_array_length(o -> 'by_source_kind'));
    end if;
    for y in select e from jsonb_array_elements(o -> 'by_source_kind') e loop
      select e -> 'measures' into x from jsonb_array_elements(coalesce(a, '[]')) e where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind';
      if x is null
         or (x ->> 'runs')::bigint <> (y ->> 'runs')::bigint
         or round((x ->> 'cost')::numeric, 6) <> (y ->> 'total_cost_usd')::numeric
         or round((x ->> 'embedding_cost')::numeric, 6) <> (y ->> 'embedding_cost_usd')::numeric
         or round((x ->> 'extraction_cost')::numeric, 6) <> (y ->> 'extraction_cost_usd')::numeric
         or round((x ->> 'cleanup_cost')::numeric, 6) <> (y ->> 'cleanup_cost_usd')::numeric
         or round((x ->> 'enrichment_cost')::numeric, 6) <> (y ->> 'enrichment_cost_usd')::numeric
         or (x ->> 'cache_hits')::numeric <> (y ->> 'embedding_cache_hits')::numeric
         or (x ->> 'embedding_calls')::numeric <> (y ->> 'embedding_calls')::numeric
         -- the cache-hit rate is hits ÷ (hits + calls) of these two answered numbers
         or (case when (x ->> 'cache_hits')::numeric + (x ->> 'embedding_calls')::numeric > 0
                  then round(100.0 * (x ->> 'cache_hits')::numeric / ((x ->> 'cache_hits')::numeric + (x ->> 'embedding_calls')::numeric), 1) else 0 end)
            <> (y ->> 'cache_hit_pct')::numeric then
        v_bad := v_bad || format('%s: %s vs %s', y ->> 'source_kind', x, y);
      end if;
    end loop;
    perform pg_temp.chk(format('K2 %sd by source kind: runs, cost, the four cost parts, cache hits, embedding calls and the hit rate of every group = the oracle', v_days),
                        cardinality(v_bad) = 0, left(array_to_string(v_bad, '; '), 600));

    -- K3 successes / errors / skips / stuck running per source kind = by source kind × status
    v_bad := '{}';
    select jsonb_agg(to_jsonb(t)) into a
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["source_kind","status"]'::jsonb, 'show', '["runs"]'::jsonb, 'limit', 100, 'lane', 'platform',
             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'group';
    for y in select e from jsonb_array_elements(o -> 'by_source_kind') e loop
      if (select coalesce(sum((e -> 'measures' ->> 'runs')::bigint), 0) from jsonb_array_elements(coalesce(a, '[]')) e
           where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind' and e -> 'groups' ->> 'status' = 'success') <> (y ->> 'successes')::bigint
      or (select coalesce(sum((e -> 'measures' ->> 'runs')::bigint), 0) from jsonb_array_elements(coalesce(a, '[]')) e
           where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind' and e -> 'groups' ->> 'status' = 'error') <> (y ->> 'errors')::bigint
      or (select coalesce(sum((e -> 'measures' ->> 'runs')::bigint), 0) from jsonb_array_elements(coalesce(a, '[]')) e
           where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind' and e -> 'groups' ->> 'status' = 'skipped') <> (y ->> 'skips')::bigint
      or (select coalesce(sum((e -> 'measures' ->> 'runs')::bigint), 0) from jsonb_array_elements(coalesce(a, '[]')) e
           where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind' and e -> 'groups' ->> 'status' = 'running') <> (y ->> 'stuck_running')::bigint then
        v_bad := v_bad || (y ->> 'source_kind');
      end if;
    end loop;
    perform pg_temp.chk(format('K3 %sd successes, errors, skips and stuck running of every source kind = by source kind × status', v_days),
                        cardinality(v_bad) = 0, array_to_string(v_bad, '; '));

    -- K4 what a SUCCESSFUL run costs: median (p50), costliest, cost per 1,000 characters
    v_bad := '{}';
    select jsonb_agg(to_jsonb(t)) into a
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["source_kind"]'::jsonb, 'limit', 100, 'lane', 'platform',
             'show', '["median_cost","max_cost","cost_per_char"]'::jsonb, 'where', '{"status":"success"}'::jsonb,
             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'group';
    for y in select e from jsonb_array_elements(o -> 'by_source_kind') e loop
      select e -> 'measures' into x from jsonb_array_elements(coalesce(a, '[]')) e where e -> 'groups' ->> 'source_kind' = y ->> 'source_kind';
      if (y ->> 'successes')::bigint = 0 then
        if x is not null then v_bad := v_bad || format('%s: a group with no successful run', y ->> 'source_kind'); end if;
        continue;
      end if;
      if x is null
         or round((x ->> 'median_cost')::numeric, 6) <> (y ->> 'p50_cost_usd')::numeric
         or round((x ->> 'max_cost')::numeric, 6) <> (y ->> 'max_cost_usd')::numeric
         or round(coalesce((x ->> 'cost_per_char')::numeric, 0) * 1000, 6) <> (y ->> 'cost_per_1k_chars_usd')::numeric then
        v_bad := v_bad || format('%s: %s vs p50 %s max %s per1k %s', y ->> 'source_kind', x, y ->> 'p50_cost_usd', y ->> 'max_cost_usd', y ->> 'cost_per_1k_chars_usd');
      end if;
    end loop;
    perform pg_temp.chk(format('K4 %sd successful runs: median = p50, costliest = max, cost per character × 1,000 = cost per 1k characters (every source kind)', v_days),
                        cardinality(v_bad) = 0, left(array_to_string(v_bad, '; '), 600));

    -- K5 enrichment: runs with / without (every status), average cost with / without (successful), the multiplier
    select jsonb_object_agg(t.groups ->> 'enrich_ran', t.measures) into a
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["enrich_ran"]'::jsonb, 'show', '["runs"]'::jsonb, 'lane', 'platform',
             'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'group';
    select jsonb_object_agg(t.groups ->> 'enrich_ran', t.measures) into x
      from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["enrich_ran"]'::jsonb, 'show', '["avg_cost"]'::jsonb, 'lane', 'platform',
             'where', '{"status":"success"}'::jsonb, 'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) t where t.kind = 'group';
    perform pg_temp.chk(format('K5 %sd enrichment: runs with/without, average successful cost with/without, and their quotient = the multiplier', v_days),
      coalesce((a -> 'true' ->> 'runs')::bigint, 0) = (o -> 'enrichment' ->> 'runs_with_enrich')::bigint
      and coalesce((a -> 'false' ->> 'runs')::bigint, 0) = (o -> 'enrichment' ->> 'runs_without_enrich')::bigint
      and round(coalesce((x -> 'true' ->> 'avg_cost')::numeric, 0), 6) = (o -> 'enrichment' ->> 'avg_cost_with_enrich_usd')::numeric
      and round(coalesce((x -> 'false' ->> 'avg_cost')::numeric, 0), 6) = (o -> 'enrichment' ->> 'avg_cost_without_enrich_usd')::numeric
      and (case when coalesce((x -> 'true' ->> 'avg_cost')::numeric, 0) > 0 and coalesce((x -> 'false' ->> 'avg_cost')::numeric, 0) > 0
                then round((x -> 'true' ->> 'avg_cost')::numeric / (x -> 'false' ->> 'avg_cost')::numeric, 1) end)
          is not distinct from (o -> 'enrichment' ->> 'multiplier')::numeric,
      format('door %s / %s; oracle %s', a, x, o -> 'enrichment'));
  end loop;

  -- K6 the recent runs: the records, newest first, are the oracle's 50 (it reads all time)
  a := platform.drill_rows(c_org, c_src, '{"lane":"platform","sort":{"key":"at","direction":"desc"},"limit":50}');
  perform pg_temp.chk('K6 the records, newest first, are the oracle''s 50 recent runs in the same order (and carry their columns)',
    (select array_agg(e ->> 'id' order by i) from jsonb_array_elements(a -> 'rows') with ordinality r(e, i))
      = (select array_agg(e ->> 'id' order by i) from jsonb_array_elements(o -> 'recent_runs') with ordinality r(e, i))
    and (select bool_and(e ? 'total_cost_usd' and e ? 'status' and e ? 'source_kind' and e ? 'duration_ms') from jsonb_array_elements(a -> 'rows') e),
    format('%s rows', jsonb_array_length(a -> 'rows')));

  -- K7 every built-in Saved view of kg_cost answers (describe lists them; each asked through the door)
  v_bad := '{}';
  for y in select e from jsonb_array_elements(platform.drill_describe(c_org, c_src) -> 'views') e loop
    begin
      perform count(*) from platform.drill_ask(c_org, c_src, (y -> 'question') || '{"lane":"platform"}');
    exception when others then v_bad := v_bad || format('%s: %s', y ->> 'key', sqlerrm);
    end;
  end loop;
  perform pg_temp.chk('K7 describe lists kg_cost''s five built-in Saved views and each answers',
    cardinality(v_bad) = 0 and jsonb_array_length(platform.drill_describe(c_org, c_src) -> 'views') = 5, array_to_string(v_bad, '; '));
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- W. WORKFLOW RUNS, as the admin inside the admin apps (platform lane): = workflow.run as the seat.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  c_src constant jsonb := '{"kind":"entity","token":"workflow_runs"}';
  v_w jsonb := jsonb_build_object('key', 'at', 'from', now() - interval '90 days', 'to', now());
  a jsonb; v_bad int; v_total jsonb;
begin
  execute 'set local role authenticated';
  create temp table dcw on commit drop as
    select r.id, r.definition_id, r.status, r.created_by, r.completed_at is not null as finished,
           case when r.completed_at is not null and r.completed_at >= coalesce(r.started_at, r.created_at)
                then (extract(epoch from r.completed_at - coalesce(r.started_at, r.created_at)) * 1000)::bigint end as ms   -- whole milliseconds
      from workflow.run r
     where r.deleted_at is null and r.created_at >= now() - interval '90 days' and r.created_at < now();
  select to_jsonb(t) -> 'measures' into v_total
    from platform.drill_ask(c_org, c_src, jsonb_build_object('show', '["runs","failures","finished"]'::jsonb, 'lane', 'platform', 'window', v_w)) t where t.kind = 'total';
  perform pg_temp.chk('W1 platform lane, 90 days: runs, failures and finished runs = the admin''s plain count of workflow.run (archived left out)',
    (v_total ->> 'runs')::bigint = (select count(*) from dcw)
    and (v_total ->> 'failures')::bigint = (select count(*) from dcw where status in ('errored', 'failed'))
    and (v_total ->> 'finished')::bigint = (select count(*) from dcw where finished),
    format('door %s; plain %s runs', v_total, (select count(*) from dcw)));

  -- W2 by workflow: every group's runs, failures and median / average duration = the runs list's rules over workflow.run
  select jsonb_agg(to_jsonb(t)) into a
    from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["workflow"]'::jsonb, 'limit', 1000, 'lane', 'platform',
           'show', '["runs","failures","duration_median","duration_avg"]'::jsonb, 'window', v_w)) t where t.kind = 'group';
  select count(*) into v_bad
    from (select definition_id, count(*) n, count(*) filter (where status in ('errored', 'failed')) f,
                 percentile_cont(0.5) within group (order by ms) med, avg(ms) av
            from dcw group by 1) o
    left join lateral (select e -> 'measures' m from jsonb_array_elements(a) e where e -> 'groups' ->> 'workflow' = o.definition_id::text) d on true
   where d.m is null or (d.m ->> 'runs')::bigint <> o.n or (d.m ->> 'failures')::bigint <> o.f
      or round((d.m ->> 'duration_median')::numeric, 3) is distinct from round(o.med::numeric, 3)
      or round((d.m ->> 'duration_avg')::numeric, 3) is distinct from round(o.av::numeric, 3);
  perform pg_temp.chk('W2 by workflow: runs, failures, median and average duration of every workflow = workflow.run with the runs list''s duration rule',
    v_bad = 0 and jsonb_array_length(a) = (select count(distinct definition_id) from dcw), format('%s workflows differ of %s', v_bad, jsonb_array_length(a)));

  -- W3 how runs start: the groups add up to the total, and child runs = runs with a parent
  select jsonb_agg(to_jsonb(t)) into a
    from platform.drill_ask(c_org, c_src, jsonb_build_object('by', '["trigger"]'::jsonb, 'show', '["runs"]'::jsonb, 'lane', 'platform', 'window', v_w)) t;
  perform pg_temp.chk('W3 how it started: groups add up to the total, and "Started by another run" = runs with a parent run',
    (select sum((e -> 'measures' ->> 'runs')::bigint) from jsonb_array_elements(a) e where e ->> 'kind' in ('group', 'other')) = (v_total ->> 'runs')::bigint
    and coalesce((select (e -> 'measures' ->> 'runs')::bigint from jsonb_array_elements(a) e where e -> 'groups' ->> 'trigger' = 'child'), 0)
        = (select count(*) from workflow.run r where r.deleted_at is null and r.parent_run_id is not null and r.created_at >= now() - interval '90 days' and r.created_at < now()),
    a::text);

  -- W4 every built-in Saved view answers
  v_bad := 0;
  for a in select e from jsonb_array_elements(platform.drill_describe(c_org, c_src) -> 'views') e loop
    begin
      perform count(*) from platform.drill_ask(c_org, c_src, (a -> 'question') || '{"lane":"platform"}');
      v_bad := v_bad + 1;
    exception when others then raise warning 'view % refused: %', a ->> 'key', sqlerrm;
    end;
  end loop;
  perform pg_temp.chk('W4 describe lists workflow_runs'' five built-in Saved views and each answers', v_bad = 5, v_bad::text);

  -- W5 COST (decision 27), against the ledger directly — not through workflow._run_cost:
  -- runs that made a request = runs some chat.user_request names; cost = the ledger's cost of those
  -- requests' executions; requests = those requests. Only a minority of runs carry any request.
  select to_jsonb(t) -> 'measures' into v_total
    from platform.drill_ask(c_org, c_src, jsonb_build_object('show', '["runs","runs_with_requests","requests","cost"]'::jsonb, 'lane', 'platform', 'window', v_w)) t where t.kind = 'total';
  perform pg_temp.chk('W5 90 days: runs that made a request, requests and cost = the ledger read directly (and runs that made a request are a minority)',
    (v_total ->> 'runs_with_requests')::bigint = (select count(distinct d.id) from dcw d join chat.user_request ur on ur.workflow_run_id = d.id)
    and (v_total ->> 'requests')::bigint = (select count(*) from dcw d join chat.user_request ur on ur.workflow_run_id = d.id)
    and (v_total ->> 'cost')::numeric = (select coalesce(sum(e.cost), 0) from dcw d join chat.user_request ur on ur.workflow_run_id = d.id join runtime.global_execution e on e.request_id = ur.id)
    and (v_total ->> 'runs_with_requests')::bigint * 2 < (v_total ->> 'runs')::bigint,
    format('door %s', v_total));
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- S. SEATS.
-- ════════════════════════════════════════════════════════════════════════════════════════════
-- S1–S2: test@test.com (not a platform admin), organization lane of kg_cost in every organization she belongs to.
do $$
declare
  c_me constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';
  c_src constant jsonb := '{"kind":"entity","token":"kg_cost"}';
  v_org uuid; v_bad text[] := '{}'; v_n int := 0; v_door bigint; v_plain bigint; v_outsider uuid;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_me, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  for v_org in select x from iam.my_orgs() x loop
    v_n := v_n + 1;
    select (measures ->> 'runs')::bigint into v_door
      from platform.drill_ask(v_org, c_src, '{"lane":"organization","show":["runs"],"window":{"key":"at","preset":"90d"}}') where kind = 'total';
    select count(*) into v_plain from rag.ingest_run r where r.organization_id = v_org and r.started_at >= now() - interval '90 days' and r.started_at < now();
    if v_door is distinct from v_plain then v_bad := v_bad || format('%s: door %s plain %s', v_org, v_door, v_plain); end if;
  end loop;
  perform pg_temp.chk(format('S1 kg_cost organization lane, test@test.com, all %s of her organizations: ask total = her plain count of rag.ingest_run', v_n),
                      cardinality(v_bad) = 0 and v_n > 0, array_to_string(v_bad, '; '));
  create temp table dc_mine on commit drop as select x as id from iam.my_orgs() x;
  execute 'reset role';
  select o.id into v_outsider from iam.organizations o where o.id not in (select id from dc_mine)
     and exists (select 1 from rag.ingest_run r where r.organization_id = o.id) limit 1;
  execute 'set local role authenticated';
  begin
    perform platform.drill_ask(v_outsider, c_src, '{"lane":"organization","show":["runs"]}');
    perform pg_temp.chk('S2 kg_cost: an organization she is not in is refused', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('S2 kg_cost: an organization she is not in is refused (42501)', true);
  end;
  begin
    perform platform.drill_ask(v_org, c_src, '{"lane":"platform","show":["runs"]}');
    perform pg_temp.chk('S3 kg_cost: the platform lane is refused to a non-admin', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('S3 kg_cost: the platform lane is refused to a non-admin (42501)', true);
  end;
  -- workflow_runs, mine lane: her own runs = her plain count; platform refused; no organization lane
  begin
    perform platform.drill_ask(v_org, '{"kind":"entity","token":"workflow_runs"}', '{"lane":"platform","show":["runs"]}');
    perform pg_temp.chk('S4 workflow_runs: the platform lane is refused to a non-admin', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('S4 workflow_runs: the platform lane is refused to a non-admin (42501)', true);
  end;
  select (measures ->> 'runs')::bigint into v_door
    from platform.drill_ask(v_org, '{"kind":"entity","token":"workflow_runs"}', '{"lane":"mine","show":["runs"]}') where kind = 'total';
  select count(*) into v_plain from workflow.run r where r.created_by = c_me and r.deleted_at is null;
  perform pg_temp.chk('S5 workflow_runs mine lane, test@test.com: ask total = her plain count of her own runs', v_door = v_plain,
                      format('door %s plain %s', v_door, v_plain));
  begin
    perform platform.drill_ask(v_org, '{"kind":"entity","token":"workflow_runs"}', '{"lane":"organization","show":["runs"]}');
    perform pg_temp.chk('S6 workflow_runs: the organization lane is not offered', false, 'answered');
  exception when others then
    perform pg_temp.chk('S6 workflow_runs: the organization lane is not offered (refused in words)', true, sqlstate || ' ' || sqlerrm);
  end;
  execute 'reset role';
end $$;

-- S7–S9: admin@admin.com OUTSIDE the admin apps: platform lane refused on both; mine lane = his own runs.
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  v_door bigint; v_plain bigint; v_f bigint; v_pf bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
  perform set_config('request.headers', '{}', true);
  execute 'set local role authenticated';
  begin
    perform platform.drill_ask(c_org, '{"kind":"entity","token":"kg_cost"}', '{"lane":"platform","show":["runs"]}');
    perform pg_temp.chk('S7 kg_cost: the platform lane is refused outside the admin apps', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('S7 kg_cost: the platform lane is refused outside the admin apps (42501)', true);
  end;
  begin
    perform platform.drill_ask(c_org, '{"kind":"entity","token":"workflow_runs"}', '{"lane":"platform","show":["runs"]}');
    perform pg_temp.chk('S8 workflow_runs: the platform lane is refused outside the admin apps', false, 'answered');
  exception when insufficient_privilege then
    perform pg_temp.chk('S8 workflow_runs: the platform lane is refused outside the admin apps (42501)', true);
  end;
  select (measures ->> 'runs')::bigint, (measures ->> 'failures')::bigint into v_door, v_f
    from platform.drill_ask(c_org, '{"kind":"entity","token":"workflow_runs"}', '{"lane":"mine","show":["runs","failures"]}') where kind = 'total';
  select count(*), count(*) filter (where status in ('errored', 'failed')) into v_plain, v_pf
    from workflow.run r where r.created_by = c_admin and r.deleted_at is null;
  perform pg_temp.chk('S9 workflow_runs mine lane, admin@admin.com as a person: ask total and failures = his plain count of his own runs',
                      v_door = v_plain and v_f = v_pf and v_plain > 0, format('door %s/%s plain %s/%s', v_door, v_f, v_plain, v_pf));
  execute 'reset role';
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.dcr order by n;
select format('%s passed, %s failed', count(*) filter (where ok), count(*) filter (where not ok)) as summary from pg_temp.dcr;
rollback;

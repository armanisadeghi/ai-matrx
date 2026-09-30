-- DRILL-GAPS — the percentile, scaled-ratio and run-rate Measures (and what the six KG gaps needed),
-- kg_cost's parity with the old unit-economics section, workflow_runs' organization lane, the
-- door's relation words for a view's column, and the validator's refusals.
-- (migrations/campaign/drillgaps_a_measure_can_be_a_percentile_a_scaled_ratio_or_a_run_rate.sql,
--  migrations/campaign/drillgaps_drill_declares_kg_cost_and_workflow_runs.sql)
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillgaps_green.sql
--   psql … -v plant=adminrule   drops the organization lane's owner/admin check inside the transaction → W2 goes RED
--   psql … -v plant=nopercentile makes every percentile read nothing → G1 and G6 go RED
--
-- G. KG COST PARITY — the oracle is public.fn_kg_cost_unit_economics(days), read as admin@admin.com in
--    the same snapshot (the same now()), so the preset window "Nd" (now() − N days → now()) is the
--    oracle's window. Every one of the six gaps is compared at 7, 30 and 90 days, rounded as the oracle
--    rounds; Other and the total are checked against the rows themselves (none of the three is additive).
-- D. THE DOOR — values bound (the compiled statement carries $1->'k', never the numbers); a run rate
--    without a window refused in words; the validator names each malformed declaration.
-- W. WORKFLOW RUNS' ORGANIZATION LANE (rule admin) — an owner's total = the organization's runs; a
--    plain member of the same organization refused (42501); no other organization's run counted.
-- L. WORDS — a view's relation column (workflow_runs.workflow) comes back with the workflow's name.
--
-- Each check runs in its own block: a failure is recorded, never an abort, so a red run lists them all.

\set ON_ERROR_STOP 1
\if :{?plant}
\else
\set plant none
\endif

begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table dgr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dgr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dgr to authenticated;
grant usage on sequence dgr_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;
select set_config('dg.plant', :'plant', true) as plant;

do $$
declare b text; w text;
begin
  if current_setting('dg.plant') = 'adminrule' then
    b := pg_get_functiondef('platform._drill_compile(uuid,jsonb,jsonb,text)'::regprocedure);
    w := replace(b, $x$and not (p_organization_id in (select iam.my_admin_orgs())) then$x$, 'and false then');
    if w = b then raise exception 'plant adminrule did not apply'; end if;
    execute w;
  elsif current_setting('dg.plant') = 'nopercentile' then
    b := pg_get_functiondef('platform._drill_agg_sql(jsonb,text,text,text)'::regprocedure);
    w := replace(b, $x$format('percentile_cont(%s) within group (order by %s)',$x$, $x$format('percentile_cont(%s) within group (order by %s) filter (where false) + 0 * count(*)',$x$);
    if w = b then raise exception 'plant nopercentile did not apply'; end if;
    execute w;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- G. KG COST: the six gaps = the old unit-economics RPC, for 7, 30 and 90 days.
-- ════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);

do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx (calendar only)
  c_src constant jsonb := '{"kind":"entity","token":"kg_cost"}';
  v_days int; o jsonb; v_bad text[]; x jsonb; y jsonb; t jsonb; v_n int; v_since timestamptz;
  v_p90 numeric; v_cost numeric; v_ids jsonb; v_old jsonb; v_msg text;
begin
  execute 'set local role authenticated';
  foreach v_days in array array[7, 30, 90] loop
    o := public.fn_kg_cost_unit_economics(v_days);
    v_since := now() - make_interval(days => v_days);

    -- G1 p90 of successful runs, per source kind (a percentile Measure)
    begin
      v_bad := '{}'; v_n := 0;
      for x in select k from jsonb_array_elements(o -> 'by_source_kind') k loop
        continue when (select count(*) from rag.ingest_run r where r.started_at >= v_since and r.source_kind = x ->> 'source_kind' and r.status = 'success') = 0;
        select to_jsonb(a) into y from platform.drill_ask(c_org, c_src, jsonb_build_object(
                 'by', '["source_kind"]'::jsonb, 'show', '["p90_cost"]'::jsonb, 'lane', 'platform', 'limit', 100,
                 'where', jsonb_build_object('status', 'success', 'source_kind', x ->> 'source_kind'),
                 'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) a where a.kind = 'group';
        v_n := v_n + 1;
        if round(coalesce((y -> 'measures' ->> 'p90_cost')::numeric, 0), 6) <> (x ->> 'p90_cost_usd')::numeric then
          v_bad := v_bad || format('%s %s vs %s', x ->> 'source_kind', y -> 'measures' ->> 'p90_cost', x ->> 'p90_cost_usd');
        end if;
      end loop;
      perform pg_temp.chk(format('G1 %sd p90 of successful runs per source kind (%s kinds) = the oracle', v_days, v_n), v_n > 0 and cardinality(v_bad) = 0, array_to_string(v_bad, '; '));
    exception when others then perform pg_temp.chk(format('G1 %sd p90 per source kind', v_days), false, sqlerrm);
    end;

    -- G2 cost per 1,000 characters of successful runs (a ratio × a bound scale)
    begin
      v_bad := '{}'; v_n := 0;
      for x in select k from jsonb_array_elements(o -> 'by_source_kind') k loop
        select to_jsonb(a) into y from platform.drill_ask(c_org, c_src, jsonb_build_object(
                 'by', '["source_kind"]'::jsonb, 'show', '["cost_per_1k_chars"]'::jsonb, 'lane', 'platform', 'limit', 100,
                 'where', jsonb_build_object('status', 'success', 'source_kind', x ->> 'source_kind'),
                 'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) a where a.kind = 'total';
        v_n := v_n + 1;
        if round(coalesce((y -> 'measures' ->> 'cost_per_1k_chars')::numeric, 0), 6) <> (x ->> 'cost_per_1k_chars_usd')::numeric then
          v_bad := v_bad || format('%s %s vs %s', x ->> 'source_kind', y -> 'measures' ->> 'cost_per_1k_chars', x ->> 'cost_per_1k_chars_usd');
        end if;
      end loop;
      perform pg_temp.chk(format('G2 %sd cost per 1,000 characters per source kind (%s kinds) = the oracle', v_days, v_n), v_n > 0 and cardinality(v_bad) = 0, array_to_string(v_bad, '; '));
    exception when others then perform pg_temp.chk(format('G2 %sd cost per 1,000 characters', v_days), false, sqlerrm);
    end;

    -- G3 cache-hit rate hits ÷ (hits + calls) per source kind, every status (a ratio over a list)
    begin
      v_bad := '{}'; v_n := 0;
      for y in select to_jsonb(a) from platform.drill_ask(c_org, c_src, jsonb_build_object(
                 'by', '["source_kind"]'::jsonb, 'show', '["cache_hit_rate"]'::jsonb, 'lane', 'platform', 'limit', 100,
                 'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) a where a.kind = 'group' loop
        x := (select k from jsonb_array_elements(o -> 'by_source_kind') k where k ->> 'source_kind' = y -> 'groups' ->> 'source_kind');
        v_n := v_n + 1;
        if round(100 * coalesce((y -> 'measures' ->> 'cache_hit_rate')::numeric, 0), 1) <> (x ->> 'cache_hit_pct')::numeric then
          v_bad := v_bad || format('%s %s vs %s%%', x ->> 'source_kind', y -> 'measures' ->> 'cache_hit_rate', x ->> 'cache_hit_pct');
        end if;
      end loop;
      perform pg_temp.chk(format('G3 %sd cache-hit rate per source kind (%s kinds) = the oracle', v_days, v_n),
                          v_n = jsonb_array_length(o -> 'by_source_kind') and cardinality(v_bad) = 0, array_to_string(v_bad, '; '));
    exception when others then perform pg_temp.chk(format('G3 %sd cache-hit rate', v_days), false, sqlerrm);
    end;

    -- G4 the enrichment multiplier: one number over the window (a ratio of two narrowed averages)
    begin
      select to_jsonb(a) into y from platform.drill_ask(c_org, c_src, jsonb_build_object(
               'show', '["enrichment_multiplier","avg_cost_enriched","avg_cost_plain"]'::jsonb, 'lane', 'platform',
               'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) a where a.kind = 'total';
      perform pg_temp.chk(format('G4 %sd enrichment multiplier = the oracle (%s)', v_days, coalesce(o -> 'enrichment' ->> 'multiplier', 'none')),
        case when o -> 'enrichment' ->> 'multiplier' is null
             then coalesce((y -> 'measures' ->> 'enrichment_multiplier')::numeric, 0) = 0
             else round((y -> 'measures' ->> 'enrichment_multiplier')::numeric, 1) = (o -> 'enrichment' ->> 'multiplier')::numeric end
        and round(coalesce((y -> 'measures' ->> 'avg_cost_enriched')::numeric, 0), 6) = (o -> 'enrichment' ->> 'avg_cost_with_enrich_usd')::numeric
        and round(coalesce((y -> 'measures' ->> 'avg_cost_plain')::numeric, 0), 6) = (o -> 'enrichment' ->> 'avg_cost_without_enrich_usd')::numeric,
        format('door %s (%s / %s)', y -> 'measures' ->> 'enrichment_multiplier', y -> 'measures' ->> 'avg_cost_enriched', y -> 'measures' ->> 'avg_cost_plain'));
    exception when others then perform pg_temp.chk(format('G4 %sd enrichment multiplier', v_days), false, sqlerrm);
    end;

    -- G5 the monthly projection and at 10× the load (run rates over the window)
    begin
      select to_jsonb(a) into y from platform.drill_ask(c_org, c_src, jsonb_build_object(
               'show', '["cost","monthly_projection","monthly_projection_10x"]'::jsonb, 'lane', 'platform',
               'window', jsonb_build_object('key', 'at', 'preset', v_days || 'd'))) a where a.kind = 'total';
      perform pg_temp.chk(format('G5 %sd projected monthly and at 10× = the oracle', v_days),
        round((y -> 'measures' ->> 'monthly_projection')::numeric, 4) = (o -> 'totals' ->> 'projected_monthly_usd')::numeric
        and round((y -> 'measures' ->> 'monthly_projection_10x')::numeric, 4) = (o -> 'totals' ->> 'projected_monthly_10x_usd')::numeric,
        format('door %s / %s vs %s / %s', y -> 'measures' ->> 'monthly_projection', y -> 'measures' ->> 'monthly_projection_10x',
               o -> 'totals' ->> 'projected_monthly_usd', o -> 'totals' ->> 'projected_monthly_10x_usd'));
    exception when others then perform pg_temp.chk(format('G5 %sd projection', v_days), false, sqlerrm);
    end;
  end loop;

  -- G6 Other and the total recompute each non-additive Measure FROM THEIR OWN ROWS (30 days, the
  --    top 2 kinds shown, the rest in Other): p90, cost per 1,000 characters, cache-hit rate, the rate
  begin
    v_since := now() - interval '30 days';
    v_bad := '{}';
    for y in select to_jsonb(a) from platform.drill_ask(c_org, c_src, jsonb_build_object(
               'by', '["source_kind"]'::jsonb, 'show', '["cost","p90_cost","cost_per_1k_chars","cache_hit_rate","monthly_projection"]'::jsonb,
               'lane', 'platform', 'limit', 2, 'sort', '{"key":"cost","direction":"desc"}'::jsonb,
               'window', '{"key":"at","preset":"30d"}'::jsonb)) a where a.kind in ('other', 'total') loop
      select jsonb_build_object(
               'p90', percentile_cont(0.9) within group (order by r.total_cost_usd),
               'k', 1000 * sum(r.total_cost_usd)::numeric / nullif(sum(r.chars_in), 0),
               'hit', sum(r.embedding_cache_hits)::numeric / nullif(sum(r.embedding_cache_hits) + sum(r.embedding_calls), 0),
               'rate', coalesce(sum(r.total_cost_usd), 0) * 30 / 30.0)
        into t
        from rag.ingest_run r
       where r.started_at >= v_since
         and (y ->> 'kind' = 'total' or r.source_kind not in (
               select b.groups ->> 'source_kind' from platform.drill_ask(c_org, c_src, jsonb_build_object(
                        'by', '["source_kind"]'::jsonb, 'show', '["cost"]'::jsonb, 'lane', 'platform', 'limit', 2,
                        'sort', '{"key":"cost","direction":"desc"}'::jsonb, 'window', '{"key":"at","preset":"30d"}'::jsonb)) b where b.kind = 'group'));
      if round((y -> 'measures' ->> 'p90_cost')::numeric, 9) is distinct from round((t ->> 'p90')::numeric, 9)
         or round((y -> 'measures' ->> 'cost_per_1k_chars')::numeric, 9) is distinct from round((t ->> 'k')::numeric, 9)
         or round((y -> 'measures' ->> 'cache_hit_rate')::numeric, 9) is distinct from round((t ->> 'hit')::numeric, 9)
         or round((y -> 'measures' ->> 'monthly_projection')::numeric, 6) is distinct from round((t ->> 'rate')::numeric, 6) then
        v_bad := v_bad || format('%s: door %s, rows %s', y ->> 'kind', y -> 'measures', t);
      end if;
    end loop;
    perform pg_temp.chk('G6 Other and the total recompute p90, cost per 1,000 characters, cache-hit rate and the run rate from their own rows', cardinality(v_bad) = 0, array_to_string(v_bad, ' | '));
  exception when others then perform pg_temp.chk('G6 Other and the total', false, sqlerrm);
  end;

  -- G7 the recent runs: the definition's own rows, newest first = the old section's 50 recent runs
  begin
    o := public.fn_kg_cost_unit_economics(90);
    x := platform.drill_rows(c_org, c_src, '{"lane":"platform","limit":50,"window":{"key":"at","preset":"90d"}}');
    select jsonb_agg(r -> 'id' order by n) into v_ids from jsonb_array_elements(x -> 'rows') with ordinality z(r, n);
    select jsonb_agg(r -> 'id' order by n) into v_old from jsonb_array_elements(o -> 'recent_runs') with ordinality z(r, n);
    perform pg_temp.chk('G7 the records are the old section''s 50 recent runs, in order, with the declared record columns',
      platform.drill_describe(c_org, c_src) -> 'records' ->> 'fact' = 'rag_ingest_run' and v_ids = v_old and (x -> 'rows' -> 0) ? 'total_cost_usd' and (x -> 'rows' -> 0) ? 'skip_reason' and not ((x -> 'rows' -> 0) ? 'embedding_model'),
      format('%s of %s ids equal; first row keys %s', (select count(*) from jsonb_array_elements(v_ids) with ordinality a(i, n)
                                                        join jsonb_array_elements(v_old) with ordinality b(i, n) using (n) where a.i = b.i),
             jsonb_array_length(coalesce(v_old, '[]')), (select string_agg(k, ',') from jsonb_object_keys(x -> 'rows' -> 0) k)));
  exception when others then perform pg_temp.chk('G7 the recent runs', false, sqlerrm);
  end;

  -- D1 values are bound: the compiled statement reads p, the scale and per from $1->'k', never text
  begin
    x := platform._drill_plan(c_org, c_src, '{"show":["p90_cost","cost_per_1k_chars","monthly_projection_10x"],"lane":"platform","window":{"key":"at","preset":"30d"}}', 'ask');
    perform pg_temp.chk('D1 percentile p, the ratio''s scale and the rate''s per × scale are bound parameters ($1->''k''), not text in the statement',
      x -> 'params' -> 'k' @> '[0.9, 1000, 25920000]'::jsonb
      and position('percentile_cont(($1->''k''->>' in x ->> 'sql') > 0
      and position('0.9' in x ->> 'sql') = 0 and position('1000' in x ->> 'sql') = 0 and position('25920000' in x ->> 'sql') = 0,
      format('k = %s', x -> 'params' -> 'k'));
  exception when others then perform pg_temp.chk('D1 bound values', false, sqlerrm);
  end;

  -- D2 a run rate without a window is refused in words (22023)
  begin
    perform platform.drill_ask(c_org, c_src, '{"show":["monthly_projection"],"lane":"platform","window":{"key":"at","preset":"all"}}');
    perform pg_temp.chk('D2 a run rate without a window is refused (22023)', false, 'answered');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform pg_temp.chk('D2 a run rate without a window is refused (22023)', sqlstate = '22023' and v_msg ~ 'run rate', format('%s %s', sqlstate, v_msg));
  end;
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- D3–D9. THE VALIDATOR names every malformed declaration (and passes kg_cost / workflow_runs).
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  base jsonb := platform.drill_def__kg_cost();
  v_p text[];
  function_exists boolean;
  procedure_note text;
  m jsonb;
  f record;
begin
  for f in select * from (values
      ('D3 a percentile''s p must be a fraction below 1', '{"key":"bad_p","label":"Bad","op":"percentile","of":"total_cost_usd","p":1.5}'::jsonb, 'p, a fraction'),
      ('D4 a run rate''s per is day or month', '{"key":"bad_per","label":"Bad","op":"rate","of":"total_cost_usd","per":"week"}'::jsonb, 'names per: day'),
      ('D5 a scale belongs to a ratio or a run rate', '{"key":"bad_scale","label":"Bad","op":"sum","of":"total_cost_usd","scale":1000}'::jsonb, 'scale is a number above 0'),
      ('D6 a Measure is never narrowed by a time', '{"key":"bad_where","label":"Bad","op":"sum","of":"total_cost_usd","where":{"at":"2026-09-01"}}'::jsonb, 'not a dimension that is not a time'),
      ('D7 a ratio made of itself is refused', '{"key":"bad_cycle","label":"Bad","op":"ratio","num":["bad_cycle"],"den":"runs"}'::jsonb, 'more than three deep')
    ) as t(name, measure, expect) loop
    begin
      v_p := platform.drill_definition_problems(jsonb_set(base, '{measures}', (base -> 'measures') || jsonb_build_array(f.measure)));
      perform pg_temp.chk(f.name, exists (select 1 from unnest(v_p) x where x ~ f.expect), array_to_string(v_p, ' | '));
    exception when others then perform pg_temp.chk(f.name, false, sqlerrm);
    end;
  end loop;
  begin
    v_p := platform.drill_definition_problems(jsonb_set(base, '{records,fact}', '"workflow_run_facts"'));
    perform pg_temp.chk('D8 an invoker definition''s records are its own rows (another fact refused)',
      exists (select 1 from unnest(v_p) x where x ~ 'definer definition only; an invoker definition''s records are its own rows'), array_to_string(v_p, ' | '));
  exception when others then perform pg_temp.chk('D8 invoker records', false, sqlerrm);
  end;
  begin
    v_p := platform.drill_definition_problems(base) || platform.drill_definition_problems(platform.drill_def__workflow_runs());
    perform pg_temp.chk('D9 kg_cost and workflow_runs as declared are sound', cardinality(v_p) = 0, array_to_string(v_p, ' | '));
  exception when others then perform pg_temp.chk('D9 sound definitions', false, sqlerrm);
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- W. WORKFLOW RUNS' ORGANIZATION LANE (rule admin), and L. the words of a view's relation column.
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_admin constant uuid := '87a6e699-3622-4869-8843-d0867456c0dd';   -- admin@admin.com
  c_test  constant uuid := '4060701e-706a-4c76-b3ca-0bbc69fa5a14';   -- test@test.com
  c_src   constant jsonb := '{"kind":"entity","token":"workflow_runs"}';
  v_org  uuid;   -- an organization admin@admin.com owns and test@test.com is only a member of
  v_own  uuid;   -- an organization test@test.com owns, with runs
  v_want bigint; v_got bigint; v_groups jsonb; v_state text; y jsonb; v_names bigint; v_rows bigint;
begin
  select m.organization_id into v_org
    from iam.organization_member m
    join iam.organization_member t on t.organization_id = m.organization_id and t.user_id = c_test and t.role not in ('owner', 'admin')
   where m.user_id = c_admin and m.role in ('owner', 'admin')
     and exists (select 1 from workflow._run_facts r where r.organization_id = m.organization_id and r.created_at >= now() - interval '90 days')
   order by (select count(*) from workflow._run_facts r where r.organization_id = m.organization_id) desc limit 1;
  select m.organization_id into v_own from iam.organization_member m
   where m.user_id = c_test and m.role in ('owner', 'admin')
     and exists (select 1 from workflow._run_facts r where r.organization_id = m.organization_id)
   order by m.organization_id limit 1;

  -- W1 an owner (admin@admin.com OUTSIDE the admin apps) counts her organization's runs: all of them, only them
  begin
    select count(*) into v_want from workflow._run_facts r where r.organization_id = v_org and r.created_at >= now() - interval '90 days';
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{}', true);
    execute 'set local role authenticated';
    select (a.measures ->> 'runs')::bigint into v_got from platform.drill_ask(v_org, c_src,
             '{"show":["runs"],"lane":"organization","window":{"key":"at","preset":"90d"}}') a where a.kind = 'total';
    select jsonb_agg(distinct a.groups ->> 'organization') into v_groups from platform.drill_ask(v_org, c_src,
             '{"by":["organization"],"show":["runs"],"lane":"organization","window":{"key":"at","preset":"90d"}}') a where a.kind = 'group';
    execute 'reset role';
    perform pg_temp.chk('W1 an organization''s owner counts every run of her organization (= its runs)', v_want > 0 and v_got = v_want, format('%s vs %s in %s', v_got, v_want, v_org));
    perform pg_temp.chk('W3 no other organization''s run is counted in the organization lane', v_groups = jsonb_build_array(v_org::text), v_groups::text);
  exception when others then
    execute 'reset role';
    perform pg_temp.chk('W1/W3 the owner''s organization lane', false, sqlerrm);
  end;

  -- W2 a plain member of the SAME organization is refused (42501), in words
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{}', true);
    execute 'set local role authenticated';
    begin
      perform platform.drill_ask(v_org, c_src, '{"show":["runs"],"lane":"organization","window":{"key":"at","preset":"90d"}}');
      v_state := 'answered';
    exception when insufficient_privilege then v_state := '42501';
    end;
    execute 'reset role';
    perform pg_temp.chk('W2 a plain member of that organization is refused its runs (42501)', v_state = '42501', format('%s in %s', v_state, v_org));
  exception when others then
    execute 'reset role';
    perform pg_temp.chk('W2 a plain member refused', false, sqlerrm);
  end;

  -- W4 test@test.com as the owner of her own organization: its runs, exactly
  begin
    select count(*) into v_want from workflow._run_facts r where r.organization_id = v_own;
    perform set_config('request.jwt.claims', json_build_object('sub', c_test, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select (a.measures ->> 'runs')::bigint into v_got from platform.drill_ask(v_own, c_src,
             '{"show":["runs"],"lane":"organization","window":{"key":"at","preset":"all"}}') a where a.kind = 'total';
    execute 'reset role';
    perform pg_temp.chk('W4 test@test.com, owner of her own organization, counts its runs', v_got = v_want and v_want > 0, format('%s vs %s in %s', v_got, v_want, v_own));
  exception when others then
    execute 'reset role';
    perform pg_temp.chk('W4 her own organization', false, sqlerrm);
  end;

  -- L1 the platform lane's workflow groups come back with the workflows' names (a view's column, named by its relation token)
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', c_admin, 'role', 'authenticated')::text, true);
    perform set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);
    execute 'set local role authenticated';
    select count(*), count(*) filter (where a.labels ->> 'workflow' = (select d.name from workflow.definition d where d.id = (a.groups ->> 'workflow')::uuid))
      into v_rows, v_names
      from platform.drill_ask('5dc930e9-bd65-44a1-8369-af773f6e1a5b', c_src, '{"by":["workflow"],"show":["runs"],"lane":"platform","limit":20,"window":{"key":"at","preset":"30d"}}') a
     where a.kind = 'group' and a.groups ->> 'workflow' is not null;
    execute 'reset role';
    perform pg_temp.chk('L1 a workflow group reads the workflow''s name (labels), not its id', v_rows > 0 and v_names = v_rows, format('%s of %s named', v_names, v_rows));
  exception when others then
    execute 'reset role';
    perform pg_temp.chk('L1 workflow names', false, sqlerrm);
  end;
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, detail from pg_temp.dgr order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.dgr;
rollback;

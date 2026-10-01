-- DRILL-PARITY-LAST — what the old users usage page and the Spend page's costliest requests did better,
-- adopted into the door: a sum of Measures (total tokens), a moment Measure (last activity), choice
-- colours as chart tokens, and the records' finish reason and tool calls.
-- (migrations/campaign/drillparity_a_measure_can_add_measures_and_say_a_moment.sql,
--  migrations/campaign/drillparity_a_usage_record_says_its_finish_reason_and_tool_calls.sql,
--  and the ai_usage / ai_usage_executions definitions synced from aidream's *.drill.ts)
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillparity_green.sql
--   psql … -v plant=nosumof   makes a sum_of add only its first part → A1 and E1 go RED
--
-- V. THE VALIDATOR — a sum_of and a moment pass inside a real definition; each malformed one is named.
-- A. AI USAGE (the hourly rollup) — total tokens = input + cached + output on every group, Other and the
--    total; the latest active hour = the rollup's own max(bucket) per person, recomputed for the total;
--    a threshold on a moment refused; a share of the total may read a sum_of.
-- E. AI USAGE BY EXECUTION — total tokens again; tool calls of a request = chat.user_request.total_tool_calls;
--    last active = max(created_at); the records carry finish_reason and tool_calls equal to the request's.
-- C. COLOURS — describe carries each origin's chart token.
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
create temp table dpr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dpr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dpr to authenticated;
grant usage on sequence dpr_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;
select set_config('dp.plant', :'plant', true) as plant;

do $$
declare b text; w text;
begin
  if current_setting('dp.plant') = 'nosumof' then
    b := pg_get_functiondef('platform._drill_measure_plan(jsonb,text,integer)'::regprocedure);
    w := replace(b, $x$format('((%s)::numeric)', array_to_string(v_num, ' + '))$x$, $x$format('((%s)::numeric)', v_num[1])$x$);
    if w = b then raise exception 'plant nosumof did not apply'; end if;
    execute w;
  end if;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- V. THE VALIDATOR
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  base jsonb := platform.drill_def__ai_usage();
  good jsonb;
  v_p text[];
  f record;
begin
  -- V1 a sum_of of three additive sums and a moment (max of the hour) are sound inside the real definition
  good := jsonb_set(base, '{measures}', (
    select jsonb_agg(x) from jsonb_array_elements(base -> 'measures') x where x ->> 'key' not in ('v_total', 'v_last'))
    || '[{"key":"v_total","label":"Total","op":"sum_of","parts":["tokens_in","tokens_cached","tokens_out"],"unit":"tokens","additive":true},
         {"key":"v_last","label":"Last","op":"max","of":"bucket","unit":"time","additive":false}]'::jsonb);
  begin
    v_p := platform.drill_definition_problems(good);
    perform pg_temp.chk('V1 a sum_of and a moment are sound in ai_usage', cardinality(v_p) = 0, array_to_string(v_p, ' | '));
  exception when others then
    perform pg_temp.chk('V1 a sum_of and a moment are sound in ai_usage', false, sqlerrm);
  end;

  for f in select * from (values
      ('V2 a sum_of names at least two parts', '{"key":"bad","label":"Bad","op":"sum_of","parts":["tokens_in"]}'::jsonb, 'at least two measure keys'),
      ('V3 a sum_of part must add up', '{"key":"bad","label":"Bad","op":"sum_of","parts":["tokens_in","people"]}'::jsonb, 'does not add up'),
      ('V4 a sum_of part must be a measure', '{"key":"bad","label":"Bad","op":"sum_of","parts":["tokens_in","nope"]}'::jsonb, 'not a measure of this definition'),
      ('V5 unit time is only a max or min, never added up', '{"key":"bad","label":"Bad","op":"sum","of":"cost","unit":"time","additive":true}'::jsonb, 'is a moment'),
      ('V6 the max of a time says unit time', '{"key":"bad","label":"Bad","op":"max","of":"bucket","unit":"count"}'::jsonb, 'its unit is "time"'),
      ('V7 a moment reads a time column', '{"key":"bad","label":"Bad","op":"max","of":"cost","unit":"time"}'::jsonb, 'is a moment, but')
    ) t(name, measure, says) loop
    begin
      v_p := platform.drill_definition_problems(jsonb_set(base, '{measures}', (base -> 'measures') || jsonb_build_array(f.measure)));
      perform pg_temp.chk(f.name, exists (select 1 from unnest(v_p) x where x like '%' || f.says || '%'), array_to_string(v_p, ' | '));
    exception when others then
      perform pg_temp.chk(f.name, false, sqlerrm);
    end;
  end loop;

  -- V8 a choice colour is a chart token, never a raw colour
  begin
    v_p := platform.drill_definition_problems(jsonb_set(base, '{dimensions}', (
      select jsonb_agg(case when d ->> 'key' = 'origin'
                            then jsonb_set(d, '{choices}', '[{"value":"human","label":"Human","color":"#ff0000"}]'::jsonb) else d end)
        from jsonb_array_elements(base -> 'dimensions') d)));
    perform pg_temp.chk('V8 a choice colour is a chart token', exists (select 1 from unnest(v_p) x where x like '%chart token%'), array_to_string(v_p, ' | '));
  exception when others then
    perform pg_temp.chk('V8 a choice colour is a chart token', false, sqlerrm);
  end;

  -- V9 the live definitions are sound
  begin
    v_p := platform.drill_definition_problems(platform.drill_def__ai_usage()) || platform.drill_definition_problems(platform.drill_def__ai_usage_executions());
    perform pg_temp.chk('V9 ai_usage and ai_usage_executions are sound', cardinality(v_p) = 0, array_to_string(v_p, ' | '));
  exception when others then
    perform pg_temp.chk('V9 ai_usage and ai_usage_executions are sound', false, sqlerrm);
  end;
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- A. AI USAGE (hourly rollup), as admin@admin.com in the platform lane
-- ════════════════════════════════════════════════════════════════════════════════════════════
select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);

do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx (calendar only)
  c_src constant jsonb := '{"kind":"entity","token":"ai_usage"}';
  r record; v_bad text[] := '{}'; v_n int := 0; v_top uuid; v_last timestamptz; v_want timestamptz;
  v_tot timestamptz; v_max timestamptz; v_msg text; v_got numeric;
begin
  execute 'set local role authenticated';
  -- A1 total tokens = input + cached + output on every row (groups, Other, total)
  begin
    for r in select a.kind, a.groups, a.measures from platform.drill_ask(c_org, c_src,
        '{"by":["person"],"show":["tokens_total","tokens_in","tokens_cached","tokens_out","last_activity"],"lane":"platform","limit":5,"window":{"key":"at","preset":"30d"}}') a loop
      v_n := v_n + 1;
      if (r.measures ->> 'tokens_total')::numeric is distinct from
         coalesce((r.measures ->> 'tokens_in')::numeric, 0) + coalesce((r.measures ->> 'tokens_cached')::numeric, 0) + coalesce((r.measures ->> 'tokens_out')::numeric, 0) then
        v_bad := v_bad || format('%s %s: %s', r.kind, r.groups, r.measures);
      end if;
      if r.kind = 'group' and v_top is null then v_top := (r.groups ->> 'person')::uuid; v_last := (r.measures ->> 'last_activity')::timestamptz; end if;
      if r.kind = 'total' then v_tot := (r.measures ->> 'last_activity')::timestamptz; end if;
      if r.kind <> 'total' then v_max := greatest(v_max, (r.measures ->> 'last_activity')::timestamptz); end if;
    end loop;
    perform pg_temp.chk('A1 total tokens = input + cached + output on every row', v_n >= 3 and cardinality(v_bad) = 0 and v_top is not null,
                        format('%s rows; %s', v_n, array_to_string(v_bad, ' | ')));
  exception when others then
    perform pg_temp.chk('A1 total tokens = input + cached + output on every row', false, sqlerrm);
  end;

  -- A2 the top person's latest active hour = the rollup's own max(bucket) for them; the total's = the latest of every row
  begin
    execute 'reset role';
    select max(h.bucket) into v_want from runtime._ai_usage_hourly h where h.person_id = v_top and h.bucket >= now() - interval '30 days';
    execute 'set local role authenticated';
    perform pg_temp.chk('A2 latest active hour = the rollup''s max(bucket) for the person', v_last is not null and v_last = v_want, format('%s vs %s (%s)', v_last, v_want, v_top));
    perform pg_temp.chk('A3 the total''s latest active hour is recomputed (= the latest of its groups and Other)', v_tot is not null and v_tot = v_max, format('%s vs %s', v_tot, v_max));
  exception when others then
    execute 'set local role authenticated';
    perform pg_temp.chk('A2/A3 latest active hour', false, sqlerrm);
  end;

  -- A4 a threshold on a moment is refused in words
  begin
    perform platform.drill_ask(c_org, c_src, '{"by":["person"],"show":["last_activity"],"lane":"platform","window":{"key":"at","preset":"7d"},"having":[{"measure":"last_activity","op":">","value":1}]}');
    perform pg_temp.chk('A4 a threshold on a moment is refused (22023)', false, 'answered');
  exception when others then
    get stacked diagnostics v_msg = message_text;
    perform pg_temp.chk('A4 a threshold on a moment is refused (22023)', sqlstate = '22023' and v_msg ~ 'moment', format('%s %s', sqlstate, v_msg));
  end;

  -- A5 a share of the total may read a sum_of (it adds up)
  begin
    select count(*) into v_n from platform.drill_ask(c_org, c_src,
      '{"by":["person"],"show":["tokens_total"],"lane":"platform","window":{"key":"at","preset":"30d"},"having":[{"measure":"tokens_total","op":">=","share_of_total":1}]}') a where a.kind = 'group';
    perform pg_temp.chk('A5 a share of the total reads a sum_of', v_n >= 1, format('%s groups', v_n));
  exception when others then
    perform pg_temp.chk('A5 a share of the total reads a sum_of', false, sqlerrm);
  end;
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- E. AI USAGE BY EXECUTION
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';
  c_src constant jsonb := '{"kind":"entity","token":"ai_usage_executions"}';
  r record; v_bad text[] := '{}'; v_n int := 0; v_req uuid; v_tools bigint; v_want bigint;
  v_last timestamptz; v_want_t timestamptz; v_person uuid; v_page jsonb; v_fr text; v_rows int;
begin
  execute 'set local role authenticated';
  -- E1 total tokens again (a sum_of on the live view)
  begin
    for r in select a.kind, a.groups, a.measures from platform.drill_ask(c_org, c_src,
        '{"by":["source"],"show":["tokens_total","tokens_in","tokens_cached","tokens_out"],"lane":"platform","limit":4,"window":{"key":"at","preset":"7d"}}') a loop
      v_n := v_n + 1;
      if (r.measures ->> 'tokens_total')::numeric is distinct from
         coalesce((r.measures ->> 'tokens_in')::numeric, 0) + coalesce((r.measures ->> 'tokens_cached')::numeric, 0) + coalesce((r.measures ->> 'tokens_out')::numeric, 0) then
        v_bad := v_bad || format('%s %s: %s', r.kind, r.groups, r.measures);
      end if;
    end loop;
    perform pg_temp.chk('E1 total tokens = input + cached + output (by execution)', v_n >= 3 and cardinality(v_bad) = 0, format('%s rows; %s', v_n, array_to_string(v_bad, ' | ')));
  exception when others then
    perform pg_temp.chk('E1 total tokens = input + cached + output (by execution)', false, sqlerrm);
  end;

  -- E2 the costliest request with tool calls: its tool calls = the request's own total_tool_calls
  begin
    execute 'reset role';
    select ur.id, ur.total_tool_calls into v_req, v_want
      from chat.user_request ur
     where ur.created_at >= now() - interval '6 days' and coalesce(ur.total_tool_calls, 0) > 0
       and exists (select 1 from runtime.global_execution e where e.request_id = ur.id)
       and not exists (select 1 from runtime.global_execution e where e.request_id = ur.id and e.created_at < now() - interval '6 days 23 hours')
     order by ur.total_cost desc nulls last limit 1;
    execute 'set local role authenticated';
    select (a.measures ->> 'tool_calls')::bigint into v_tools from platform.drill_ask(c_org, c_src,
      jsonb_build_object('by', '["request"]'::jsonb, 'show', '["cost","tool_calls"]'::jsonb, 'lane', 'platform',
                         'where', jsonb_build_object('request', v_req), 'window', '{"key":"at","preset":"7d"}'::jsonb)) a where a.kind = 'group';
    perform pg_temp.chk('E2 a request''s tool calls = chat.user_request.total_tool_calls', v_req is not null and v_tools = v_want, format('%s: %s vs %s', v_req, v_tools, v_want));
  exception when others then
    execute 'set local role authenticated';
    perform pg_temp.chk('E2 a request''s tool calls', false, sqlerrm);
  end;

  -- E3 the records of that request carry its finish reason, and their tool calls add up to the request's
  --    (the records page's own window sums — a request can hold more executions than one page)
  begin
    v_page := platform.drill_rows(c_org, c_src, jsonb_build_object('lane', 'platform', 'where', jsonb_build_object('request', v_req),
                                                                   'window', '{"key":"at","preset":"7d"}'::jsonb, 'limit', 50));
    execute 'reset role';
    select ur.finish_reason into v_fr from chat.user_request ur where ur.id = v_req;
    execute 'set local role authenticated';
    select count(*) into v_rows from jsonb_array_elements(v_page -> 'rows') x
     where (x ->> 'finish_reason') is not distinct from v_fr;
    perform pg_temp.chk('E3 the records carry the request''s finish reason and its tool calls',
      jsonb_array_length(v_page -> 'rows') > 0 and v_rows = jsonb_array_length(v_page -> 'rows')
      and (v_page -> 'measures' ->> 'tool_calls')::bigint = v_want
      and exists (select 1 from jsonb_array_elements(v_page -> 'rows') x where x ? 'tool_calls'),
      format('%s rows, %s with finish %s; the records'' tool calls add up to %s vs %s', jsonb_array_length(v_page -> 'rows'), v_rows, v_fr,
             v_page -> 'measures' ->> 'tool_calls', v_want));
  exception when others then
    execute 'set local role authenticated';
    perform pg_temp.chk('E3 the records carry finish reason and tool calls', false, sqlerrm);
  end;

  -- E4 last active = the view's own max(created_at) for the costliest person of the window
  begin
    select (a.groups ->> 'person')::uuid, (a.measures ->> 'last_activity')::timestamptz into v_person, v_last
      from platform.drill_ask(c_org, c_src, '{"by":["person"],"show":["cost","last_activity"],"lane":"platform","limit":1,"window":{"key":"at","preset":"7d"}}') a
     where a.kind = 'group' limit 1;
    execute 'reset role';
    select max(c.created_at) into v_want_t from runtime._ai_usage_calls c where c.person_id = v_person and c.created_at >= now() - interval '7 days';
    execute 'set local role authenticated';
    perform pg_temp.chk('E4 last active = max(created_at) for the person', v_last is not null and v_last = v_want_t, format('%s vs %s (%s)', v_last, v_want_t, v_person));
  exception when others then
    execute 'set local role authenticated';
    perform pg_temp.chk('E4 last active', false, sqlerrm);
  end;
  execute 'reset role';
end $$;

-- ════════════════════════════════════════════════════════════════════════════════════════════
-- C. COLOURS — the origin choices carry the old page's colours as chart tokens
-- ════════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v jsonb;
begin
  v := (select d -> 'choices' from jsonb_array_elements(platform.drill_def__ai_usage() -> 'dimensions') d where d ->> 'key' = 'origin');
  perform pg_temp.chk('C1 every origin choice keeps a chart token (human = chart-1, unknown = chart-other)',
    (select bool_and(c ? 'color') from jsonb_array_elements(v) c)
    and (select c ->> 'color' from jsonb_array_elements(v) c where c ->> 'value' = 'human') = '--matrx-chart-1'
    and (select c ->> 'color' from jsonb_array_elements(v) c where c ->> 'value' = 'unknown') = '--matrx-chart-other',
    v::text);
exception when others then
  perform pg_temp.chk('C1 origin colours', false, sqlerrm);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(detail, 300) as detail from pg_temp.dpr order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.dpr;
rollback;

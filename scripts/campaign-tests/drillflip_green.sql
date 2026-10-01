-- DRILL-FLIP-FIXES — a threshold can be "at most" (VERIFY-DRILL-FINAL L1: the old users usage page
-- filtered any number column both ways). migrations/campaign/drillflip_a_threshold_can_be_at_most.sql.
--
-- RUN ON THE NIGHTLY COPY ONLY (common-docs/operations/clone/CURRENT.md), everything rolled back:
--   psql "$CLONE_DATABASE_URL" -X -f scripts/campaign-tests/drillflip_green.sql
-- Before the file is applied H1–H4 and V1 are RED (the door refuses "<=" and "<"); after, all green.
--
-- H. AI USAGE BY PERSON, 30 days, as admin@admin.com in the platform lane: "cost at most X" keeps
--    exactly the groups at or under X (the rest fold into Other, so groups + Other = the total) and says
--    "at most"; "less than" is strict; ">=" still answers as before.
-- V. THE VALIDATOR — a Saved view with "<=" is sound; an op outside the four is named.

\set ON_ERROR_STOP 1
begin isolation level repeatable read;
set local statement_timeout = '600s';
set local client_min_messages = warning;
create temp table dfr (n serial, name text, ok boolean, detail text) on commit drop;
create or replace function pg_temp.chk(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into pg_temp.dfr(name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;
grant all on dfr to authenticated;
grant usage on sequence dfr_n_seq to authenticated;
grant execute on function pg_temp.chk(text, boolean, text) to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', '87a6e699-3622-4869-8843-d0867456c0dd', 'role', 'authenticated')::text, true);
select set_config('request.headers', '{"x-matrx-admin-lane":"1"}', true);

do $$
declare
  c_org constant uuid := '5dc930e9-bd65-44a1-8369-af773f6e1a5b';   -- AI Matrx (calendar only)
  c_src constant jsonb := '{"kind":"entity","token":"ai_usage"}';
  c_q   constant jsonb := '{"by":["person"],"show":["cost"],"lane":"platform","limit":200,"window":{"key":"at","preset":"30d"}}';
  r record; v_line numeric; v_bad text[]; v_n int; v_sum numeric; v_total numeric; v_says text; v_all int; v_kept int;
begin
  execute 'set local role authenticated';
  -- the line: the median person's 30-day cost, so some people fall on each side
  select percentile_disc(0.5) within group (order by (a.measures ->> 'cost')::numeric), count(*)
    into v_line, v_all
    from platform.drill_ask(c_org, c_src, c_q) a where a.kind = 'group';

  -- H1 at most: every group shown is <= the line; groups + Other = the total
  begin
    v_bad := '{}'; v_n := 0; v_sum := 0;
    for r in select a.kind, a.groups, a.measures, a.says from platform.drill_ask(c_org, c_src,
        c_q || jsonb_build_object('having', jsonb_build_array(jsonb_build_object('measure', 'cost', 'op', '<=', 'value', v_line)))) a loop
      if r.kind = 'group' then
        v_n := v_n + 1;
        if (r.measures ->> 'cost')::numeric > v_line then v_bad := v_bad || format('%s %s', r.groups, r.measures ->> 'cost'); end if;
      end if;
      if r.kind in ('group', 'other') then v_sum := v_sum + coalesce((r.measures ->> 'cost')::numeric, 0); end if;
      if r.kind = 'total' then v_total := (r.measures ->> 'cost')::numeric; v_says := coalesce(v_says, r.says); end if;
    end loop;
    v_kept := v_n;
    perform pg_temp.chk('H1 cost at most the median person keeps only those groups, and groups + Other = total',
      v_n >= 1 and v_n < v_all and cardinality(v_bad) = 0 and abs(v_sum - v_total) < 0.000001,
      format('line %s; %s of %s groups; bad %s; sum %s total %s', v_line, v_n, v_all, array_to_string(v_bad, ' | '), v_sum, v_total));
    perform pg_temp.chk('H2 the answer says "at most"', v_says ilike '%at most%', v_says);
  exception when others then
    perform pg_temp.chk('H1 at most', false, sqlerrm);
  end;

  -- H3 less than is strict: no group equals the line
  begin
    select count(*) filter (where (a.measures ->> 'cost')::numeric >= v_line), count(*) filter (where a.kind = 'group')
      into v_n, v_all
      from platform.drill_ask(c_org, c_src,
        c_q || jsonb_build_object('having', jsonb_build_array(jsonb_build_object('measure', 'cost', 'op', '<', 'value', v_line)))) a where a.kind = 'group';
    perform pg_temp.chk('H3 less than the line is strict', v_n = 0 and v_all < v_kept, format('%s at or over the line of %s groups (at most kept %s)', v_n, v_all, v_kept));
  exception when others then
    perform pg_temp.chk('H3 less than', false, sqlerrm);
  end;

  -- H4 at least still answers (regression)
  begin
    select count(*) filter (where (a.measures ->> 'cost')::numeric < v_line), count(*)
      into v_n, v_all
      from platform.drill_ask(c_org, c_src,
        c_q || jsonb_build_object('having', jsonb_build_array(jsonb_build_object('measure', 'cost', 'op', '>=', 'value', v_line)))) a where a.kind = 'group';
    perform pg_temp.chk('H4 at least still keeps only the groups at or over the line', v_n = 0 and v_all >= 1, format('%s under; %s groups', v_n, v_all));
  exception when others then
    perform pg_temp.chk('H4 at least', false, sqlerrm);
  end;

  -- H5 an op outside the four is refused in words
  begin
    perform platform.drill_ask(c_org, c_src, c_q || '{"having":[{"measure":"cost","op":"!=","value":1}]}'::jsonb);
    perform pg_temp.chk('H5 "!=" is refused', false, 'answered');
  exception when others then
    perform pg_temp.chk('H5 "!=" is refused, naming the four ops', sqlerrm ilike '%"<="%', sqlerrm);
  end;
  execute 'reset role';
end $$;

-- V. THE VALIDATOR
do $$
declare
  base jsonb := platform.drill_def__ai_usage();
  v_p text[];
begin
  v_p := platform.drill_definition_problems(jsonb_set(base, '{views}', coalesce(base -> 'views', '[]'::jsonb)
    || '[{"key":"v_cheap","label":"Cheap people","question":{"by":["person"],"show":["cost"],"having":[{"measure":"cost","op":"<=","value":5}]}}]'::jsonb));
  perform pg_temp.chk('V1 a Saved view with "<=" is sound', cardinality(v_p) = 0, array_to_string(v_p, ' | '));
  v_p := platform.drill_definition_problems(jsonb_set(base, '{views}', coalesce(base -> 'views', '[]'::jsonb)
    || '[{"key":"v_bad","label":"Bad","question":{"by":["person"],"show":["cost"],"having":[{"measure":"cost","op":"=","value":5}]}}]'::jsonb));
  perform pg_temp.chk('V2 a view with "=" is named', array_to_string(v_p, ' ') ilike '%"<="%', array_to_string(v_p, ' | '));
exception when others then
  perform pg_temp.chk('V validator', false, sqlerrm);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end as result, name, left(detail, 300) as detail from pg_temp.dfr order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from pg_temp.dfr;
rollback;

-- AP3-PHASEB-U1 parity: the drill's ANALYTICS branch (no "scope" in the question) answers exactly as before U1.
-- Run before and after the U1 migrations; every line must match.
--   plan:<user>:<source>:<kind>  md5 of the compiled SQL, count SQL, parameter names and the rest of the plan
--                               (parameter VALUES are left out: a declared usage window carries now()).
--   res:<user>:<source>:<kind>   md5 of the answer itself (drill_ask / drill_rows), as that person.
-- Sources: the five Table-API tokens, four other entity tokens and the six declared definitions; questions: the
-- default question, the person's own lane, and a records page. Organization: admin's Workspace (both are members).
-- Read-only; rolled back. Run as postgres (Supabase MCP execute_sql). The MCP stops a call at 60 s, so the run is
-- split: set ap3.user (admin|test) and ap3.kinds (plan|res) on the line below and run the four combinations.
begin;
select set_config('ap3.user', 'admin', true), set_config('ap3.kinds', 'plan', true);
create function pg_temp.m(p_org uuid, p_src jsonb, p_q jsonb, p_kind text) returns text language plpgsql as $f$
declare v jsonb;
begin
  if p_kind = 'plan_ask' or p_kind = 'plan_rows' then
    v := platform._drill_plan(p_org, p_src, p_q, substr(p_kind, 6));
    return md5(coalesce(v ->> 'sql', '') || '|' || coalesce(v ->> 'count_sql', '') || '|'
               || coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(v -> 'params', '{}'::jsonb)) k), '')
               || '|' || (v - 'params' - 'sql' - 'count_sql')::text);
  elsif p_kind = 'res_ask' then
    return (select md5(coalesce(string_agg(x::text, '|'), '')) from platform.drill_ask(p_org, p_src, p_q) x);
  else
    return md5(platform.drill_rows(p_org, p_src, p_q)::text);
  end if;
exception when others then
  return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 60);
end $f$;
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
grant execute on function pg_temp.m(uuid, jsonb, jsonb, text) to authenticated;
set local role authenticated;
set local statement_timeout = '600s';
select set_config('request.headers', '{}', true);
do $d$
declare u text; s jsonb; q record;
begin
  foreach u in array case current_setting('ap3.user') when 'admin' then array['87a6e699-3622-4869-8843-d0867456c0dd']
                                                       else array['4060701e-706a-4c76-b3ca-0bbc69fa5a14'] end loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    for s in select jsonb_build_object('kind', 'entity', 'token', t) from unnest(array['party','crm_deal','project','task','hr_employee',
               'note','workflow','agent','calendar_event','agents_by_model','ai_calls','ai_usage','ai_usage_executions','kg_cost','workflow_runs']) t loop
      for q in select * from (values ('d', '{}'::jsonb), ('mine', '{"lane":"mine"}'::jsonb), ('page', '{"limit":20,"offset":0}'::jsonb)) x(n, q) loop
        if current_setting('ap3.kinds') = 'plan' then
          insert into _r values
            ('plan:' || left(u, 4) || ':' || (s ->> 'token') || ':ask:' || q.n,  pg_temp.m('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', s, q.q, 'plan_ask')),
            ('plan:' || left(u, 4) || ':' || (s ->> 'token') || ':rows:' || q.n, pg_temp.m('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', s, q.q, 'plan_rows'));
        elsif q.n <> 'mine' and s ->> 'token' in ('party','crm_deal','project','task','hr_employee','note','agents_by_model','workflow_runs') then
          insert into _r values
            ('res:'  || left(u, 4) || ':' || (s ->> 'token') || ':ask:' || q.n,  pg_temp.m('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', s, q.q, 'res_ask')),
            ('res:'  || left(u, 4) || ':' || (s ->> 'token') || ':rows:' || q.n, pg_temp.m('884d1ce8-7b49-4fba-a2f3-0f7dd7c83d4f', s, q.q, 'res_rows'));
        end if;
      end loop;
    end loop;
  end loop;
end $d$;
reset role;
select md5(string_agg(k || '=' || v, ';' order by k)) as all_md5,
       count(*) as n, count(*) filter (where v like 'ERR%') as errors,
       string_agg(k || '=' || left(v, 12), ' ' order by k) as lines
  from _r;
rollback;

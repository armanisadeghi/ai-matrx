-- AP3-PHASEB-U4 parity: the Table API's existing question shapes (the drill compiler's API branch with an OBJECT
-- `where` and a single `sort` object) answer exactly as before U4. Run before and after the U4 migration; the
-- all_md5 line must match (rows written by other lanes in between move the res: half -- rerun both back to back).
--   plan:<user>:<token>:<q>  md5 of the compiled SQL, count SQL, parameter names and the rest of the plan
--   res:<user>:<token>:<q>   md5 of platform.drill_rows itself, as that person
-- 5 Table-API tokens x 3 questions (a default page; an object where with a range + single sort; a cursor page),
-- admin@admin.com and test@test.com. Read-only; rolled back. Run as postgres (Supabase MCP execute_sql).
-- 2026-10-06: before U4 and after all four U4 migrations, all_md5 = 62bcc22244a1386d33223c1fd2595e71 (60 lines, 0 errors).
begin;
create function pg_temp.m(p_src jsonb, p_q jsonb, p_kind text) returns text language plpgsql as $f$
declare v jsonb;
begin
  if p_kind = 'plan' then
    perform set_config('mx.api_fast', '1', true);
    v := platform._drill_plan(null, p_src, p_q, 'rows');
    return md5(coalesce(v ->> 'sql', '') || '|' || coalesce(v ->> 'count_sql', '') || '|'
               || coalesce((select string_agg(k, ',' order by k) from jsonb_object_keys(coalesce(v -> 'params', '{}'::jsonb)) k), '')
               || '|' || (v - 'params' - 'sql' - 'count_sql')::text);
  end if;
  return md5(platform.drill_rows(null, p_src, p_q)::text);
exception when others then
  return 'ERR ' || sqlstate || ' ' || left(sqlerrm, 60);
end $f$;
create temp table _r(k text, v text) on commit drop;
grant all on _r to authenticated;
grant execute on function pg_temp.m(jsonb, jsonb, text) to authenticated;
set local role authenticated;
set local statement_timeout = '300s';
select set_config('request.headers', '{}', true);
do $d$
declare u text; t text; q record; k text;
begin
  foreach u in array array['87a6e699-3622-4869-8843-d0867456c0dd', '4060701e-706a-4c76-b3ca-0bbc69fa5a14'] loop
    perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
    foreach t in array array['party', 'crm_deal', 'project', 'task', 'hr_employee'] loop
      for q in select * from (values
          ('page',   '{"scope":"all","limit":20}'::jsonb),
          ('where',  '{"scope":"all","limit":20,"sort":{"key":"created_at","direction":"asc"},"where":{"created_at":{"gte":"2020-01-01T00:00:00Z","lt":"2030-01-01T00:00:00Z"}}}'::jsonb),
          ('cursor', '{"scope":"mine","limit":20,"cursor":{"v":"2026-10-03T00:00:00+00:00","id":"00000000-0000-0000-0000-000000000000"}}'::jsonb)) x(n, q) loop
        foreach k in array array['plan', 'res'] loop
          insert into _r values (k || ':' || left(u, 4) || ':' || t || ':' || q.n,
            pg_temp.m(jsonb_build_object('kind', 'entity', 'token', t, 'api', true), q.q, k));
        end loop;
      end loop;
    end loop;
  end loop;
end $d$;
reset role;
select md5(string_agg(k || '=' || v, ';' order by k)) as all_md5,
       md5(string_agg(k || '=' || v, ';' order by k) filter (where k like 'plan:%')) as plan_md5,
       md5(string_agg(k || '=' || v, ';' order by k) filter (where k like 'res:%')) as res_md5,
       count(*) as n, count(*) filter (where v like 'ERR%') as errors,
       string_agg(k || '=' || v, ' ' order by k) filter (where v like 'ERR%') as err_lines
  from _r;
rollback;

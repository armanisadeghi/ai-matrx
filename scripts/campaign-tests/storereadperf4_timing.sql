-- LANE STORE-READ-PERF-4 — THE TIMING GATE (warm, server side, one door call per statement).
-- Run it on the dev clone, READ COMMITTED, outside any transaction that has written:
--   cd matrx-frontend && psql "<clone DSN>" -v ON_ERROR_STOP=1 -f scripts/campaign-tests/storereadperf4_timing.sql
-- Each call is its own statement inside a DO block: under READ COMMITTED every statement takes a
-- new snapshot, and the statement memos name the snapshot, so no call reuses another's answers.
-- Budgets (chair, 2026-09-29): custom.context_tree <= 100 ms for admin@admin.com; custom.data_home
-- <= 400 ms for both seats. Prints each median and GREEN / RED.
\set ON_ERROR_STOP on
\set QUIET on
\set suite 'storereadperf4_timing.sql'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif
create temp table if not exists perf4_timing (seat text, door text, ms numeric, budget numeric);
truncate perf4_timing;
grant all on perf4_timing to authenticated;
do $$
declare s record; o uuid[]; t0 timestamptz; n int; i int; lab text; b numeric;
begin
  for s in select id, email from auth.users where email in ('admin@admin.com', 'test@test.com') order by email loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, false);
    select array_agg(m.organization_id) into o
      from iam.organization_member m join iam.organizations x on x.id = m.organization_id and x.archived_at is null
     where m.user_id = s.id;
    foreach lab in array array['context_tree', 'data_home'] loop
      continue when lab = 'data_home' and to_regproc('custom.data_home') is null;
      b := case when lab = 'context_tree' and s.email = 'admin@admin.com' then 100
                when lab = 'data_home' then 400 end;
      for i in 1 .. 4 loop
        t0 := clock_timestamp();
        if lab = 'context_tree' then n := length(custom.context_tree(o)::text);
        else execute 'select length(custom.data_home()::text)' into n;
        end if;
        if i > 1 then
          insert into perf4_timing values (s.email, lab, extract(epoch from clock_timestamp() - t0) * 1000, b);
        end if;
      end loop;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', false);
end $$;
select seat, door, round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as median_ms, max(budget) as budget_ms,
       case when max(budget) is null then 'measured'
            when percentile_cont(0.5) within group (order by ms) <= max(budget) then 'GREEN' else 'RED' end as verdict
  from perf4_timing group by 1, 2 order by 2, 1;
select bool_and(percentile_ok) as all_green from (
  select coalesce(percentile_cont(0.5) within group (order by ms) <= max(budget), true) as percentile_ok
    from perf4_timing group by seat, door) z \gset
\if :all_green
\echo 'GREEN'
\else
\echo 'RED'
\endif

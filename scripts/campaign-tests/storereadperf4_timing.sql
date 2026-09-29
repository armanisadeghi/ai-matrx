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
-- NOTHING IS WRITTEN (not even a temporary table): a transaction that has written turns every statement
-- memo off, which is the slow path by design, so the times are kept in a transaction-local setting.
do $$
declare s record; o uuid[]; t0 timestamptz; n int; i int; lab text; b numeric; acc text := '';
begin
  for s in select id, email from auth.users where email in ('admin@admin.com', 'test@test.com') order by email loop
    perform set_config('request.jwt.claims', json_build_object('sub', s.id, 'role', 'authenticated')::text, true);
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
          acc := acc || format('%s|%s|%s|%s;', s.email, lab, extract(epoch from clock_timestamp() - t0) * 1000, coalesce(b::text, ''));
        end if;
      end loop;
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);
  if pg_current_xact_id_if_assigned() is not null then
    raise exception 'the timing transaction wrote something, so it measured the no-memo path';
  end if;
  perform set_config('perf4.times', acc, false);
end $$;
with t as (
  select split_part(x, '|', 1) as seat, split_part(x, '|', 2) as door, split_part(x, '|', 3)::numeric as ms,
         nullif(split_part(x, '|', 4), '')::numeric as budget
    from unnest(string_to_array(rtrim(current_setting('perf4.times'), ';'), ';')) x
)
select seat, door, round(percentile_cont(0.5) within group (order by ms)::numeric, 1) as median_ms, max(budget) as budget_ms,
       case when max(budget) is null then 'measured'
            when percentile_cont(0.5) within group (order by ms) <= max(budget) then 'GREEN' else 'RED' end as verdict
  from t group by 1, 2 order by 2, 1;
with t as (
  select split_part(x, '|', 1) as seat, split_part(x, '|', 2) as door, split_part(x, '|', 3)::numeric as ms,
         nullif(split_part(x, '|', 4), '')::numeric as budget
    from unnest(string_to_array(rtrim(current_setting('perf4.times'), ';'), ';')) x
)
select bool_and(ok) as all_green from (
  select coalesce(percentile_cont(0.5) within group (order by ms) <= max(budget), true) as ok from t group by seat, door) z \gset
\if :all_green
\echo 'GREEN'
\else
\echo 'RED'
\endif

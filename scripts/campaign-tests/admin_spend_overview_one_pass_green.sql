-- admin_spend_overview: the 30-day chart in one pass — THE GREEN SUITE for
-- migrations/admin_spend_overview_by_day_one_pass_2026_09_25.sql.
--
--   A1  the function's by_day equals the reference (the pre-2026-09-25 per-day LATERAL formulation,
--       inlined here) in four time zones — including two with DST and one with a half-hour offset.
--   A2  one call reads under 150 000 shared buffers (540 269 before the fix: 30 full scans of
--       runtime.global_execution for the chart alone).
--
-- RUN IT on the clone or a branch, in one rolled-back transaction. Statements are separated by
-- `---` lines so a driver can send them one at a time; psql reads them as comments.
-- ITS RED: before the migration A1 is GREEN (same answer) and A2 fails.

begin;
---
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from auth.users where email = 'admin@admin.com'), 'role', 'authenticated')::text, true);
---
set local role authenticated;
---
set local statement_timeout = '180s';
---
do $a1$
declare v_tz text; v_got jsonb; v_want jsonb; v_today timestamptz;
begin
  foreach v_tz in array array['UTC', 'America/Los_Angeles', 'Asia/Kolkata', 'Australia/Lord_Howe'] loop
    v_got := public.admin_spend_overview(v_tz) -> 'by_day';
    v_today := date_trunc('day', now() at time zone v_tz) at time zone v_tz;
    select coalesce(jsonb_agg(x order by x->>'day'), '[]'::jsonb) into v_want
    from (
      select jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'),
                                'cost', coalesce(s.cost, 0), 'runs', coalesce(s.runs, 0)) as x
      from generate_series((v_today - interval '29 days') at time zone v_tz,
                           v_today at time zone v_tz, interval '1 day') as d(day)
      left join lateral (
        select sum(g.cost) as cost, count(*) as runs from runtime.global_execution g
        where g.created_at >= d.day at time zone v_tz
          and g.created_at <  (d.day + interval '1 day') at time zone v_tz) s on true) q;
    if v_got is distinct from v_want then
      raise exception 'A1 RED (%): by_day differs from the reference. got % want %', v_tz, left(v_got::text, 400), left(v_want::text, 400);
    end if;
  end loop;
  raise notice 'A1 GREEN: by_day equals the per-day reference in 4 time zones';
end $a1$;
---
do $a2$
declare v_plan json; v_buf bigint;
begin
  execute 'explain (analyze, buffers, format json) select public.admin_spend_overview(''America/Los_Angeles'')' into v_plan;
  v_buf := (v_plan -> 0 -> 'Plan' ->> 'Shared Hit Blocks')::bigint + (v_plan -> 0 -> 'Plan' ->> 'Shared Read Blocks')::bigint;
  if v_buf >= 150000 then
    raise exception 'A2 RED: one admin_spend_overview call read % shared buffers', v_buf;
  end if;
  raise notice 'A2 GREEN: one call read % shared buffers in % ms', v_buf, round((v_plan -> 0 ->> 'Execution Time')::numeric);
end $a2$;
---
rollback;

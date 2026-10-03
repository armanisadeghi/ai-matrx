-- VISION-REACH W5 — EVERY COMMON FORMULA QUESTION OVER 5,000 VISITS ANSWERS IN UNDER 2 SECONDS,
-- FROM A MEMBER'S SEAT, WITH THE RIGHT ANSWER.
--
-- Runs on the formula-speed ledger (_visionreach_w5_formula_speed_fixture.sql, the newest Table
-- whose slug starts vr5_speed_ledger_) as test@test.com, a member of Cedar Ridge Physical Therapy,
-- through the doors a person's screen calls: custom.record_aggregate (filter, group, measure,
-- date period), custom.read_records_page (the grid's page, filtered on a formula) and
-- custom.record_aggregate_as_of (a total as it stood). Before W5 the non-arithmetic shapes took
-- 24–94 s, a date period 23 s, min/max of a date died on `invalid input syntax for type numeric`,
-- and the first as-of total 10–13 s. Each question's answer is checked against the fixture's own
-- arithmetic (the rows are generated from g = 1..5000, so every count below is fixed), and each
-- must take under 2 s; one slow or wrong answer is RED, named.
--
-- Clone only. Read-only work in a rolled-back transaction.

\set ON_ERROR_STOP on
\timing off
\set suite 'visionreach_w5_formula_speed.sql'
\set requires 'function:custom._fxc_apply'
\set expect 'clone'
\i scripts/campaign-tests/_preamble.sql
\if :matrx_skip
\quit
\endif

begin;
set local statement_timeout = '600s';

do $t$
declare
  c_org  constant uuid := '0a54df90-eab8-4d07-ab29-81a45fb41e04';
  c_test constant text := '{"sub":"4060701e-706a-4c76-b3ca-0bbc69fa5a14","role":"authenticated"}';
  c_bar  constant numeric := 2000;   -- milliseconds
  v_t uuid; v0 timestamptz; v_ms numeric; v_rows jsonb; v_got text; c record;
  v_t0 timestamptz := clock_timestamp();
  v_fail text[] := '{}';
begin
  select r.id into v_t from custom.record r
   where r.organization_id = c_org and r.table_id = custom.table_kernel_id() and r.deleted_at is null
     and r.data ->> 'slug' like 'vr5_speed_ledger_%'
   order by r.created_at desc limit 1;
  if v_t is null then
    raise exception 'RED — no formula-speed ledger on this clone; run _visionreach_w5_formula_speed_fixture.sql first';
  end if;
  perform set_config('request.jwt.claims', c_test, true);
  perform set_config('role', 'authenticated', true);

  for c in select * from (values
    -- kind, label, group, measures, bucket, filter, expected (text of the answer that matters)
    ('agg',  'sum of an arithmetic formula',     '[]', '[{"op":"sum","key":"expected_total"}]', null, null, '1749180'),
    ('agg',  'filter on an IF formula',          '[]', '[{"op":"count"}]', null, '{"copay_tier": "High copay"}', '2142'),
    ('agg',  'filter on a & / UPPER formula',    '[]', '[{"op":"count"}]', null, '{"visit_label": "Dr. Hollis Vance — NO-SHOW"}', '417'),
    ('agg',  'filter on a DATEDIFF formula',     '[]', '[{"op":"count"}]', null, '{"days_in_care": 20}', '125'),
    ('agg',  'filter on AND with comparisons',   '[]', '[{"op":"count"}]', null, '{"needs_call": true}', '595'),
    ('agg',  'filter on a Rule-node join',       '[]', '[{"op":"count"}]', null, '{"front_desk_line": "Jonah Pell, DPT — No-show"}', '416'),
    ('agg',  'group by an IF formula',           '["copay_tier"]', '[{"op":"count"}]', null, null, '2858'),
    ('agg',  'earliest/latest of a DATE formula','[]', '[{"op":"min","key":"follow_up_due"},{"op":"max","key":"follow_up_due"}]', null, null, '2026-07-15|2026-10-14'),
    ('agg',  'earliest/latest of a TEXT formula','[]', '[{"op":"min","key":"visit_label"}]', null, null, 'Dr. Amara Quist — CANCELLED'),
    ('agg',  'sum of a MONTH formula',           '[]', '[{"op":"sum","key":"visit_month"}]', null, null, '39916'),
    ('agg',  'month periods of a DATE formula',  '[]', '[{"op":"count"}]', '{"key":"follow_up_due","by":"month"}', null, '1690'),
    ('grid', 'grid page filtered on an IF',      null, null, null, '{"copay_tier": "High copay"}', '2142'),
    ('grid', 'grid page filtered on a & formula',null, null, null, '{"visit_label": "Dr. Hollis Vance — NO-SHOW"}', '417'),
    ('grid', 'grid page filtered on a Rule join',null, null, null, '{"front_desk_line": "Jonah Pell, DPT — No-show"}', '416'),
    ('asof', 'as-of total of copay',             null, null, null, null, '174985')
  ) v(kind, label, grp, meas, bucket, filt, expected) loop
    begin
      v0 := clock_timestamp();
      if c.kind = 'agg' then
        select jsonb_agg(to_jsonb(x) order by x.row_count desc) into v_rows
          from custom.record_aggregate(c_org, v_t, c.grp::jsonb, c.meas::jsonb, c.bucket::jsonb, c.filt::jsonb) x;
        v_ms := round(extract(epoch from clock_timestamp() - v0) * 1000);
        v_got := case
          when c.label like 'earliest/latest of a DATE%' then (v_rows -> 0 -> 'measures' ->> 'min_follow_up_due') || '|' || (v_rows -> 0 -> 'measures' ->> 'max_follow_up_due')
          when c.label like 'earliest/latest of a TEXT%' then v_rows -> 0 -> 'measures' ->> 'min_visit_label'
          when c.meas like '%"count"%' then trunc((v_rows -> 0 -> 'measures' ->> 'count')::numeric)::text
          else trunc((select e.value::text::numeric from jsonb_each(v_rows -> 0 -> 'measures') e limit 1))::text end;
      elsif c.kind = 'grid' then
        v_rows := custom.read_records_page(c_org, v_t, c.filt::jsonb, null, null, null, false, 50, 0);
        v_ms := round(extract(epoch from clock_timestamp() - v0) * 1000);
        v_got := v_rows ->> 'total';
      else
        select jsonb_agg(to_jsonb(x)) into v_rows from custom.record_aggregate_as_of(c_org, v_t, v_t0, 'sum', 'copay') x;
        v_ms := round(extract(epoch from clock_timestamp() - v0) * 1000);
        v_got := trunc((v_rows -> 0 ->> 'result')::numeric)::text;
      end if;
      raise notice '% ms | % | %', lpad(v_ms::text, 6), rpad(c.label, 34), v_got;
      if v_got is distinct from c.expected then
        v_fail := v_fail || format('%s answered %s, the ledger says %s', c.label, coalesce(v_got, 'nothing'), c.expected);
      end if;
      if v_ms > c_bar then
        v_fail := v_fail || format('%s took %s ms (bar %s ms)', c.label, v_ms, c_bar);
      end if;
    exception when others then
      v_fail := v_fail || format('%s died: %s', c.label, sqlerrm);
      raise notice '% ms | % | ERROR %', lpad(round(extract(epoch from clock_timestamp() - v0) * 1000)::text, 6), rpad(c.label, 34), sqlerrm;
    end;
  end loop;
  if cardinality(v_fail) > 0 then
    raise exception E'RED — % question(s) slow or wrong:\n  %', cardinality(v_fail), array_to_string(v_fail, E'\n  ');
  end if;
  raise notice 'GREEN — every common formula question over 5,000 visits answered right, each under % ms, as a member.', c_bar;
end
$t$;

rollback;

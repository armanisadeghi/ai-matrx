-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 ROUND-4 BLOCKER S6 — THE PAY-PERIOD ROLLUP WAS CREATED EMPTY AND NEVER REFRESHED, SO EVERY
--    HOUR CATEGORY RENDERED 0.00 WHILE THE INTERVALS UNDERNEATH HELD REAL HOURS.
--
-- `hr._enroll_pay_period_rows` (hr_l3_28, mine) creates each `hr.pay_period_employment` row at
-- enrollment time with `total_hours = 0.00`, `total_amount = null`, `calc = '{}'` and
-- `engine_key = 'hr.pay_period_enrollment'` — placeholders, correctly, because at enrollment there
-- is nothing yet to total. `hr.recompute_apply` then writes `hr.work_interval` and `hr.workweek`
-- and **never goes back to the rollup**. Verified live before this migration: every ppe row in the
-- database read `total_hours 0.00, calc {}, engine_key hr.pay_period_enrollment` while the same
-- employment's current intervals summed to real hours.
--
-- Nothing errors. The row exists, the read door finds it, and it reports zero — the same
-- silent-failure shape as the NULL pay periods in hr_l3_32 and the missing `subject_name` in
-- hr_l3_41. A timecard that says 0.00 is not a broken page anybody reports; it is a number a
-- manager approves.
--
-- THE RULING (coordinator, this batch): `hr.recompute_apply` refreshes the affected rollup rows in
-- the SAME TRANSACTION as the interval writes — totals by category from the current intervals of
-- that period + employment, and `engine_key` flips from the enrollment placeholder to the real
-- engine. ONE writer. There is never a second rollup path.
--
-- Authority: coordinator ruling round 4 (S6); SPEC-TIME §5.1 (grains), §14 D8 (row vs header).
--
-- Applied live as `hr_l3_44_recompute_refreshes_period_rollups`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ONE WRITER, IN ONE FUNCTION. The arithmetic lives in `hr._ppe_rollup_refresh` and
--    `hr.recompute_apply` calls it. It is not inlined at two call sites and it is emphatically not
--    a second rollup job: nothing else in the schema may write these three columns. The ruling's
--    "never a second rollup path" is the point — two writers of one total is how a rollup and its
--    own detail rows start disagreeing.
-- 2. EVERY AFFECTED PERIOD, NOT JUST THE WEEK'S OWN. Since hr_l3_32 a single workweek's days can
--    land in TWO pay periods. Recomputing that week must refresh BOTH rollups or the straddled
--    half stays stale at zero — the identical defect, just harder to see. The loop refreshes every
--    distinct period id carried by the week's current intervals, plus the call's own `v_period`.
-- 3. THE ROLLUP SUMS THE WHOLE PERIOD, NOT THIS WEEK. A pay period spans several workweeks; a
--    rollup that only counted the week just recomputed would be wrong the moment a second week
--    existed. The refresh re-derives from ALL current intervals of that period + employment, so it
--    is a recomputation of the total rather than an increment — which also makes it idempotent and
--    self-healing after any correction, void or supersede.
-- 4. `total_hours` IS THE SUM OF THE CATEGORIES IT SITS ABOVE. Not "worked only", not "paid only".
--    A total that does not equal the breakdown printed beneath it is the bug this migration
--    closes, so the invariant is total = sum(totals_by_category), and it is asserted, not assumed.
--    It matches what `hr.timesheet_get` already sums for its own period display total, so the two
--    surfaces cannot disagree either.
-- 5. A MISSING AMOUNT POISONS THE WHOLE TOTAL — DELIBERATELY. If ANY current interval in the
--    period has `amount is null` (a rule was advisory, or a fact was missing), `total_amount` is
--    NULL and `calc.amounts_incomplete` is true. A partial sum presented as the total is money
--    that is wrong and looks right, which is worse than an absent figure the surface must flag.
-- 6. REFRESH ONLY — RECOMPUTE NEVER CREATES A ROLLUP ROW. Enrollment owns creation. If a period
--    has no ppe row for this employment, recompute reports it in
--    `pay_period_rollups_missing` rather than fabricating a row with a state machine nobody
--    started. Reported, so it is visible, instead of skipped, which is how this defect began.
-- 7. THE SAME INTERVAL PREDICATE AS THE APPROVAL GRID. `hr.timesheet_period_grid` counts an
--    interval into a period when `pay_period_id` matches OR the id is null and the work date falls
--    inside the period. hr_l3_32 means the null case should no longer occur (the conformance gate
--    asserts zero), but if one ever reappears the rollup and the grid must count it identically —
--    a rollup that disagrees with the grid above it is the defect wearing a different hat.

-- ── 1. the rollup arithmetic — the only writer of these columns (decision 1) ─────────────────
create or replace function hr._ppe_rollup_refresh(
  p_pay_period_id  uuid,
  p_employment_id  uuid,
  p_engine_key     text default 'hr.time_engine',
  p_engine_version text default 'unversioned',
  p_batch          uuid default null)
returns jsonb
language plpgsql volatile security definer set search_path to 'hr','public'
as $fn$
declare
  v_per      hr.pay_period%rowtype;
  v_cat      jsonb;
  v_total    numeric;
  v_amount   numeric;
  v_incomplete boolean;
  v_worked   numeric;
  v_ot       numeric;
  v_dt       numeric;
  v_prem     integer;
  v_n        integer;
  v_hit      integer;
begin
  if p_pay_period_id is null or p_employment_id is null then
    return jsonb_build_object('refreshed', false, 'reason', 'arguments_required');
  end if;

  select * into v_per from hr.pay_period where id = p_pay_period_id;
  if not found then
    return jsonb_build_object('refreshed', false, 'reason', 'pay_period_not_found',
                              'pay_period_id', p_pay_period_id);
  end if;

  -- decision 3 + decision 7: every current interval of THIS period for THIS employment
  with iv as (
    select wi.hours, wi.amount, wi.hours_category, wi.interval_kind, wi.is_overtime,
           coalesce(ec.code, '') ec_code
      from hr.work_interval wi
      left join hr.earning_code ec on ec.id = wi.earning_code_id
     where wi.employment_id = p_employment_id
       and wi.is_current
       and (wi.pay_period_id = p_pay_period_id
            or (wi.pay_period_id is null
                and wi.local_work_date between v_per.period_start_on and v_per.period_end_on))
  )
  select
    (select jsonb_object_agg(c.cat, c.h)
       from (select hours_category cat, sum(hours) h from iv group by 1) c),
    coalesce((select sum(hours) from iv), 0),
    (select sum(amount) from iv),
    coalesce((select bool_or(amount is null) from iv), false),
    coalesce((select sum(hours) filter (where hours_category = 'worked') from iv), 0),
    coalesce((select sum(hours) filter (where is_overtime and ec_code <> 'DT') from iv), 0),
    coalesce((select sum(hours) filter (where ec_code = 'DT') from iv), 0),
    coalesce((select count(*) filter (where interval_kind = 'premium_only') from iv), 0),
    coalesce((select count(*) from iv), 0)
  into v_cat, v_total, v_amount, v_incomplete, v_worked, v_ot, v_dt, v_prem, v_n;

  v_cat := coalesce(v_cat, '{}'::jsonb);

  -- decision 4: the printed total IS the sum of the printed breakdown, and we check rather than trust
  if abs(v_total - coalesce((select sum((value #>> '{}')::numeric)
                               from jsonb_each(v_cat)), 0)) > 0.0001 then
    raise exception 'hr_l3_44: rollup total % does not equal the sum of its categories %',
      v_total, v_cat;
  end if;

  perform hr.arm_write();
  update hr.pay_period_employment ppe
     set total_hours    = v_total,
         -- decision 5: absent, never a partial sum dressed as a total
         total_amount   = case when v_incomplete then null else v_amount end,
         engine_key     = p_engine_key,
         engine_version = p_engine_version,
         computed_at    = now(),
         calc = jsonb_build_object(
           'totals_by_category',  v_cat,
           'hours_worked',        v_worked,
           'hours_overtime',      v_ot,
           'hours_doubletime',    v_dt,
           'premium_line_count',  v_prem,
           'interval_count',      v_n,
           'amounts_incomplete',  v_incomplete,
           'amounts_note', case when v_incomplete then
              'total_amount is absent because at least one interval in this period has no amount '
              || '(an advisory rule, or a missing fact). It is not zero and must never render as zero.'
             end,
           'recompute_batch_id',  p_batch,
           'source',              'hr.recompute_apply')
   where ppe.pay_period_id = p_pay_period_id
     and ppe.employment_id = p_employment_id;

  get diagnostics v_hit = row_count;

  if v_hit = 0 then
    -- decision 6: enrollment owns creation; recompute reports, never fabricates
    return jsonb_build_object('refreshed', false, 'reason', 'no_rollup_row',
      'pay_period_id', p_pay_period_id, 'employment_id', p_employment_id,
      'detail', 'this employment is not enrolled in that pay period; run hr.pay_period_generate / enrollment first');
  end if;

  return jsonb_build_object('refreshed', true, 'pay_period_id', p_pay_period_id,
    'total_hours', v_total, 'totals_by_category', v_cat,
    'total_amount', case when v_incomplete then null else v_amount end,
    'amounts_incomplete', v_incomplete, 'interval_count', v_n);
end
$fn$;

revoke execute on function hr._ppe_rollup_refresh(uuid,uuid,text,text,uuid) from public, anon;

-- ── 2. wire it into recompute, in the same transaction as the interval writes ────────────────
do $mig$
declare
  v_def text;
  v_anchor text := '  ---------------------------------------------------------------- 8. the answer';
  v_block text;
begin
  v_def := pg_get_functiondef(
    'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure);

  if position('_ppe_rollup_refresh' in v_def) > 0 then
    raise notice 'hr_l3_44: recompute already refreshes the rollups; nothing to wire';
    return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_44: could not find section 8 in recompute_apply; refusing to guess';
  end if;

  v_block :=
    '  ------------------------------------------------- 7b. the pay-period rollups (hr_l3_44, S6)' || E'\n' ||
    '  -- Same transaction as the interval writes, by ruling. Every period this week touches --' || E'\n' ||
    '  -- a straddling week has two (hr_l3_32) -- plus this call''s own period.' || E'\n' ||
    '  for v_rollup_pid in' || E'\n' ||
    '    select distinct w.pay_period_id' || E'\n' ||
    '      from hr.work_interval w' || E'\n' ||
    '     where w.workweek_id = v_ww_id and w.is_current and w.pay_period_id is not null' || E'\n' ||
    '    union' || E'\n' ||
    '    select v_period where v_period is not null' || E'\n' ||
    '  loop' || E'\n' ||
    '    v_rollup := hr._ppe_rollup_refresh(v_rollup_pid, p_employment_id,' || E'\n' ||
    '                                       v_engine_k, v_engine_v, v_batch);' || E'\n' ||
    '    if coalesce((v_rollup ->> ''refreshed'')::boolean, false) then' || E'\n' ||
    '      v_rollups_done := v_rollups_done || jsonb_build_array(v_rollup);' || E'\n' ||
    '    else' || E'\n' ||
    '      v_rollups_missing := v_rollups_missing || jsonb_build_array(v_rollup);' || E'\n' ||
    '    end if;' || E'\n' ||
    '  end loop;' || E'\n' || E'\n';

  v_def := replace(v_def, v_anchor, v_block || v_anchor);

  -- the three locals the block needs, declared next to the batch id it reports
  v_def := replace(v_def,
    '  v_engine_k  text :=',
    '  v_rollup_pid uuid;' || E'\n' ||
    '  v_rollup     jsonb;' || E'\n' ||
    '  v_rollups_done    jsonb := ''[]''::jsonb;' || E'\n' ||
    '  v_rollups_missing jsonb := ''[]''::jsonb;' || E'\n' ||
    '  v_engine_k  text :=');

  -- and report them, so a missing rollup row is visible instead of silent (decision 6)
  v_def := replace(v_def,
    '    ''intervals_written'', cardinality(v_new_ids),',
    '    ''pay_period_rollups_refreshed'', v_rollups_done,' || E'\n' ||
    '    ''pay_period_rollups_missing'', v_rollups_missing,' || E'\n' ||
    '    ''intervals_written'', cardinality(v_new_ids),');

  execute v_def;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'hr.recompute_apply(uuid,jsonb,jsonb,jsonb,text)'::regprocedure;

  if position('hr._ppe_rollup_refresh(v_rollup_pid, p_employment_id' in v_src) = 0 then
    raise exception 'hr_l3_44: recompute does not call the rollup refresher';
  end if;
  if position('pay_period_rollups_refreshed' in v_src) = 0
     or position('pay_period_rollups_missing' in v_src) = 0 then
    raise exception 'hr_l3_44: recompute does not report what it refreshed';
  end if;
  -- decision 2: the loop must consider every period the week touches, not just v_period
  if position('where w.workweek_id = v_ww_id and w.is_current and w.pay_period_id is not null' in v_src) = 0 then
    raise exception 'hr_l3_44: the rollup loop does not cover a straddling week''s second period';
  end if;

  -- decision 1: exactly one writer of the rollup columns
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.prokind = 'f'
       and p.proname <> '_ppe_rollup_refresh'
       and p.prosrc ~ 'update\s+hr\.pay_period_employment[^;]*\btotal_hours\s*=') then
    raise exception 'hr_l3_44: a second writer of pay_period_employment.total_hours exists';
  end if;
end
$chk$;

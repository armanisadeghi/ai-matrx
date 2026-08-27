-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round-12 P4, both halves.
--
-- ── P4a: "Multiple rates" on a single-rate week ─────────────────────────────────────────────
-- `hr.timesheet_get` derived `multiple_rates` as `count(*) > 1` over `(position_assignment_id,
-- rate)` across worked intervals. §5.3 means multiple PAY rates. Measured live, that count is wrong
-- in TWO independent ways:
--
--   CAOT  one assignment, $26 base -> rates 26.00 (REG), 39.00 (OT x1.5), 52.00 (DT x2) = 3 groups.
--         The multiplier rates are counted as pay rates.
--   MULTI two assignments, BOTH at $24.00 -> 4 groups (2 assignments x 2 codes).
--         Two assignments at the SAME rate are counted as multiple rates.
--
-- Both weeks carry the engine's own `calc.multi_rate = false`, and it is right both times. RULED:
-- read the stored flag; do not re-derive.
--
-- ── P4b: FIX's rollup reads OT 0.00 against its workweek's 2.00 ─────────────────────────────
-- Hypothesis verified before acting, and CONFIRMED. All five of FIX's current intervals are
-- `REG` / `is_overtime = false` / rate 26.00, summing to 42 hours, while `hr.workweek` carries
-- `hours_regular 40.00, hours_overtime 2.00`. The workweek was split; the intervals were not.
-- `engine_key = 'ot_engine'`, `computed_at 16:17:46`, matching the queue drain — the pre-fix
-- engine's signature exactly. The refresher is NOT buggy: it faithfully summed un-split inputs.
--
-- Authority: coordinator ruling (round-12 P4); SPEC-TIME §5.3.
--
-- Applied live as `hr_l3_58_multi_rate_reads_stored_and_rollup_discloses_split`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ONE TRUTH: THE DOOR READS `calc.multi_rate`. No second derivation, so nothing can drift.
-- 2. A MISSING FLAG READS AS UNKNOWN, NOT AS FALSE. All 9 live workweeks carry the key today, but
--    `coalesce(..., false)` would mean a future engine that stopped writing it silently flattened
--    every week to "single rate" — the same silent-failure shape this whole finding is. An absent
--    key projects `null`, and check 24 goes red the moment one appears.
-- 3. `rate_components` IS SCOPED TO PAY RATES TOO — slightly beyond the letter of the ruling, and
--    flagged as such. It is the field immediately beside the flag, it feeds the same §5.3 sentence,
--    and it had the identical defect: the breakdown behind a REGULAR-rate weighted average listed
--    the 1.5x and 2x lines as though they were pay rates. Verified in the negative on both fixtures
--    (multiplier rows no longer appear); no genuine multi-rate week exists in this database, so the
--    positive case is unverified and says so here rather than being claimed.
-- 4. 🚨 THE REFRESHER DISCLOSES RATHER THAN CONTRADICTS. The coordinator offered a conditional
--    assertion or a `split_pending` marker and left the shape to me. The marker, because the
--    problem with the current row is not that it is wrong — the number IS the interval sum, which
--    is the standing law — but that it silently contradicts the page beside it. A conditional
--    assertion would keep the gate green and leave the contradiction invisible; the marker makes
--    the row say what happened to it.
-- 5. THE NUMBER STAYS THE INTERVAL SUM. hr_l3_44's law is unchanged: the rollup totals the current
--    intervals, always. `split_pending` sits beside it explaining why those inputs are behind the
--    workweek, and names the workweek, its overtime, and the engine that computed it.
-- 6. THE GATE ALLOWS DISCLOSED DISAGREEMENT AND NOTHING ELSE. Check 23 fires when a workweek claims
--    overtime, the rollup carries none, and no marker explains it — so legacy un-split data passes
--    while a genuine refresher bug goes red. That is the distinction the coordinator asked for,
--    without the gate quietly excusing the whole class.
-- 7. 🚨 THE DATA REPAIR IS NOT MINE TO MAKE, AND I DID NOT FAKE IT. Re-draining FIX needs an engine
--    at HEAD to decide WHICH hours are overtime, at what earning code and rate — that is rule
--    resolution, not arithmetic. Hand-authoring the split from the SQL lane would be me inventing
--    the engine's answer and stamping it as computed. FIX's row now carries `split_pending`, so the
--    stale state is disclosed instead of silently wrong, and the re-drain is owed to the engine
--    lane. Reported plainly rather than quietly left.

-- ── 1. P4a: the door reads the stored flag (decisions 1–3) ──────────────────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr.timesheet_get(uuid,uuid)'::regprocedure);

  if position('calc ->> ''multi_rate''' in v_def) > 0 then
    raise notice 'hr_l3_58: timesheet_get already reads the stored flag';
  else
    if position('''multiple_rates'', coalesce(rc.n, 0) > 1,' in v_def) = 0 then
      raise exception 'hr_l3_58: the multiple_rates derivation has moved; refusing to guess';
    end if;
    -- decision 2: absent means unknown, never false
    v_def := replace(v_def,
      '''multiple_rates'', coalesce(rc.n, 0) > 1,',
      '-- hr_l3_58 P4a: §5.3 means multiple PAY rates. The old count(*) over (assignment, rate)' || E'\n' ||
      '      -- counted the OT/DT multiplier rates as pay rates, and counted two assignments at the' || E'\n' ||
      '      -- SAME rate as two rates. The engine already decides this and stores it.' || E'\n' ||
      '      ''multiple_rates'', case when ww.calc ? ''multi_rate''' || E'\n' ||
      '                              then (ww.calc ->> ''multi_rate'')::boolean end,');

    -- decision 3: a component behind a REGULAR-rate average must itself be a pay rate
    if position('and wi.hours_category = ''worked''' in v_def) = 0 then
      raise exception 'hr_l3_58: the rate_components lateral has moved; refusing to guess';
    end if;
    v_def := replace(v_def,
      'and wi.hours_category = ''worked''',
      'and wi.hours_category = ''worked''' || E'\n' ||
      '                 and not wi.is_overtime   -- hr_l3_58: pay rates only, never the multipliers');

    execute v_def;
  end if;
end
$mig$;

-- ── 2. P4b: the refresher discloses an un-split workweek (decisions 4–5) ────────────────────
do $mig$
declare v_def text;
begin
  v_def := pg_get_functiondef('hr._ppe_rollup_refresh(uuid,uuid,text,text,uuid)'::regprocedure);

  if position('split_pending' in v_def) > 0 then
    raise notice 'hr_l3_58: the refresher already discloses a pending split';
    return;
  end if;

  if position('  v_prem    ' in v_def) = 0
     or position('           ''recompute_batch_id'',  p_batch,' in v_def) = 0 then
    raise exception 'hr_l3_58: _ppe_rollup_refresh does not match what this migration expects';
  end if;

  v_def := replace(v_def, '  v_prem    ', '  v_split   jsonb;' || E'\n' || '  v_prem    ');

  -- computed just before the update, from the workweeks this period's intervals belong to
  v_def := replace(v_def,
    '  perform hr.arm_write();' || E'\n' || '  update hr.pay_period_employment ppe',
    '  -- hr_l3_58 decision 4: a workweek whose computed overtime was never split onto its' || E'\n' ||
    '  -- intervals leaves this rollup summing un-split inputs. The number below is still the' || E'\n' ||
    '  -- interval sum -- that law does not move -- but the row must SAY that its inputs are' || E'\n' ||
    '  -- behind the workweek, rather than quietly contradicting the page beside it.' || E'\n' ||
    '  select jsonb_agg(jsonb_build_object(' || E'\n' ||
    '           ''workweek_id'', w.id,' || E'\n' ||
    '           ''workweek_hours_overtime'', w.hours_overtime,' || E'\n' ||
    '           ''intervals_carrying_overtime'', 0,' || E'\n' ||
    '           ''engine_key'', w.engine_key,' || E'\n' ||
    '           ''computed_at'', w.computed_at))' || E'\n' ||
    '    into v_split' || E'\n' ||
    '    from hr.workweek w' || E'\n' ||
    '   where w.employment_id = p_employment_id' || E'\n' ||
    '     and coalesce(w.hours_overtime, 0) > 0' || E'\n' ||
    '     and exists (select 1 from hr.work_interval wi' || E'\n' ||
    '                  where wi.workweek_id = w.id and wi.is_current' || E'\n' ||
    '                    and wi.pay_period_id = p_pay_period_id)' || E'\n' ||
    '     and not exists (select 1 from hr.work_interval wi' || E'\n' ||
    '                      where wi.workweek_id = w.id and wi.is_current and wi.is_overtime);' || E'\n\n' ||
    '  perform hr.arm_write();' || E'\n' || '  update hr.pay_period_employment ppe');

  v_def := replace(v_def,
    '           ''recompute_batch_id'',  p_batch,',
    '           ''split_pending'',       v_split,' || E'\n' ||
    '           ''split_pending_note'', case when v_split is not null then' || E'\n' ||
    '              ''The workweek(s) named here carry computed overtime that was never split onto ''' || E'\n' ||
    '              || ''their intervals, so the hours above sum un-split inputs and read 0 overtime. ''' || E'\n' ||
    '              || ''The totals are a true sum of the current intervals; they are behind the ''' || E'\n' ||
    '              || ''workweek until it is re-drained through the current engine.''' || E'\n' ||
    '             end,' || E'\n' ||
    '           ''recompute_batch_id'',  p_batch,');

  execute v_def;
end
$mig$;

-- ── 3. re-refresh the affected rollups so the marker lands (decision 7) ──────────────────────
do $repair$
declare r record; v_n int := 0;
begin
  for r in
    select distinct ppe.pay_period_id pid, ppe.employment_id eid
      from hr.pay_period_employment ppe
     where exists (select 1 from hr.work_interval wi
                    where wi.employment_id = ppe.employment_id and wi.is_current
                      and wi.pay_period_id = ppe.pay_period_id)
  loop
    perform hr._ppe_rollup_refresh(r.pid, r.eid);
    v_n := v_n + 1;
  end loop;
  raise notice 'hr_l3_58: % rollup(s) re-refreshed', v_n;
end
$repair$;

-- ── 4. the gate: disclosed disagreement passes, silent disagreement does not (decision 6) ────
-- hr_l3_59 later changes this function's OUT columns, and CREATE OR REPLACE cannot change a
-- return type. Dropping first keeps THIS file replayable against a database that already carries
-- the later shape; the migrations then converge when 59 runs after it, as they do in order.
drop function if exists hr.rollup_overtime_undisclosed();

create or replace function hr.rollup_overtime_undisclosed()
returns table(pay_period_id uuid, employment_id uuid, workweek_overtime numeric,
              rollup_overtime numeric, has_marker boolean)
language sql stable security definer set search_path to 'hr','public'
as $fn$
  select ppe.pay_period_id, ppe.employment_id,
         (select sum(w.hours_overtime) from hr.workweek w
           where w.employment_id = ppe.employment_id
             and coalesce(w.hours_overtime,0) > 0
             and exists (select 1 from hr.work_interval wi
                          where wi.workweek_id = w.id and wi.is_current
                            and wi.pay_period_id = ppe.pay_period_id)),
         coalesce((ppe.calc ->> 'hours_overtime')::numeric, 0),
         (ppe.calc -> 'split_pending') is not null
    from hr.pay_period_employment ppe
   where ppe.engine_key is distinct from 'hr.pay_period_enrollment'
     and coalesce((ppe.calc ->> 'hours_overtime')::numeric, 0) = 0
     and (ppe.calc -> 'split_pending') is null
     and exists (select 1 from hr.workweek w
                  where w.employment_id = ppe.employment_id
                    and coalesce(w.hours_overtime,0) > 0
                    and exists (select 1 from hr.work_interval wi
                                 where wi.workweek_id = w.id and wi.is_current
                                   and wi.pay_period_id = ppe.pay_period_id));
$fn$;

revoke execute on function hr.rollup_overtime_undisclosed() from public, anon;

do $mig$
declare
  v_def text;
  v_anchor text := 'stay readable.'');' || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  if position('rollup_overtime_agrees_or_discloses' in v_def) > 0 then
    raise notice 'hr_l3_58: the checks are already wired'; return;
  end if;
  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_58: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'stay readable.'');
  return next;

  ---------------------------------------------------------------- 23. a rollup may disagree, but never silently
  check_key := ''rollup_overtime_agrees_or_discloses'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''pay_period_id'', d.pay_period_id, ''employment_id'', d.employment_id,
           ''workweek_overtime'', d.workweek_overtime, ''rollup_overtime'', d.rollup_overtime)), ''[]''::jsonb)
    into v_bad
    from hr.rollup_overtime_undisclosed() d;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''A pay-period rollup reading 0 overtime beneath a workweek that computed some is ''
      || ''EXPECTED for data drained by an engine that split the workweek but not its intervals -- ''
      || ''and it is only acceptable when the row SAYS so. The rollup total stays the true sum of ''
      || ''the current intervals (hr_l3_44); calc.split_pending names the workweek, its overtime ''
      || ''and the engine that computed it. Undisclosed disagreement is a refresher defect.'');
  return next;

  ---------------------------------------------------------------- 24. the multi-rate flag is the engine''s
  check_key := ''workweek_carries_multi_rate_flag'';
  select coalesce(jsonb_agg(jsonb_build_object(''workweek_id'', w.id, ''engine_key'', w.engine_key)), ''[]''::jsonb)
    into v_bad
    from hr.workweek w
   where not (w.calc ? ''multi_rate'');
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''hr.timesheet_get reads calc.multi_rate rather than re-deriving it: the old count over ''
      || ''(assignment, rate) counted OT/DT multiplier rates as pay rates, and counted two ''
      || ''assignments at the SAME rate as two rates. A workweek missing the key projects null ''
      || ''(unknown) rather than false, and this check catches an engine that stopped writing it ''
      || ''before every week silently flattens to "single rate".'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── 5. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text; v_fail jsonb; v_n int;
begin
  select prosrc into v_src from pg_proc where oid = 'hr.timesheet_get(uuid,uuid)'::regprocedure;
  if position('coalesce(rc.n, 0) > 1' in v_src) > 0 then
    raise exception 'hr_l3_58: the re-derivation survives';
  end if;
  if position('ww.calc ? ''multi_rate''' in v_src) = 0 then
    raise exception 'hr_l3_58: the door does not read the stored flag';
  end if;
  if position('and not wi.is_overtime' in v_src) = 0 then
    raise exception 'hr_l3_58: rate_components still lists multiplier rates';
  end if;

  -- decision 4: FIX's row must now disclose rather than contradict silently
  if not exists (select 1 from hr.pay_period_employment
                  where employment_id = 'd94e52a2-02bb-410e-a76e-725aa508e1f3'
                    and calc -> 'split_pending' is not null) then
    raise exception 'hr_l3_58: FIX''s rollup does not disclose its pending split';
  end if;
  -- decision 5: and the number is still the interval sum
  if (select (calc ->> 'total_hours_exact')::numeric from hr.pay_period_employment
       where employment_id = 'd94e52a2-02bb-410e-a76e-725aa508e1f3'
         and calc -> 'split_pending' is not null)
     <> (select sum(hours) from hr.work_interval
          where employment_id = 'd94e52a2-02bb-410e-a76e-725aa508e1f3' and is_current) then
    raise exception 'hr_l3_58: the rollup stopped being the interval sum';
  end if;

  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 24 then
    raise exception 'hr_l3_58: expected at least 24 checks, found %', v_n;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_58: the gate is red on arrival: %', v_fail::text;
  end if;
end
$chk$;

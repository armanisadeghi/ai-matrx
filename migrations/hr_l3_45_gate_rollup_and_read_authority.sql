-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Standing gate checks for the two round-4 blockers, so neither class can come back quietly.
--
-- Every defect this lane has found has been of one shape: it looks fine, it is wrong, and nothing
-- errors. A fix without an assertion is a fix that lasts until the next refactor. S1 and S6 are
-- both re-introducible by a single careless edit — pass a record's date to a capability check, or
-- add a third writer of `hr.work_interval` that forgets the rollup — so both get a blocking check
-- in `hr.punch_write_path_conformance()`, which the release gates already run.
--
-- Authority: coordinator rulings round 4 (S1, S6); the lane's standing practice of pairing every
-- fix with an assertion (hr_l3_07, hr_l3_14, hr_l3_15, hr_l3_18, hr_l3_24).
--
-- Applied live as `hr_l3_45_gate_rollup_and_read_authority`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. CHECK 15 ASSERTS THE INVARIANT, NOT THE IMPLEMENTATION. It does not check that
--    `hr._ppe_rollup_refresh` was called; it checks that no stored rollup disagrees with the
--    breakdown stored beside it. That holds however the rollup came to be written, which is what a
--    gate is for. Rows still on the enrollment placeholder are exempt by design — 0.00 with no
--    computed intervals is true, and `engine_key = 'hr.pay_period_enrollment'` says so honestly.
-- 2. CHECK 16 IS A GREP WITH TEETH, AND THAT IS THE HONEST DESCRIPTION. It looks for a
--    record-derived date inside an authority predicate in the known read doors. It cannot catch a
--    date laundered through a local variable — `hr.timesheet_get`'s original `v_at` would have
--    slipped past it. What it does catch is the copy-paste that reintroduces the pattern, which is
--    how it arrived in seven doors in the first place. Named as a partial guard rather than sold
--    as proof.
-- 3. CHECK 17 IS THE ONE THAT WOULD HAVE CAUGHT S6 BEFORE IT SHIPPED. Any function that inserts a
--    current `hr.work_interval` and does not refresh the rollup in the same body is the S6 defect
--    by construction. This is the structural check; 15 is the data check. Both, because a new
--    writer can pass 15 for as long as nobody has used it yet.

do $mig$
declare
  v_def text;
  v_anchor text :=
    '''A SECURITY DEFINER without a pinned search_path is a privilege-escalation door.'');'
    || E'\n  return next;\nend';
  v_block text;
begin
  v_def := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);

  -- Already in the fixed form: nothing to do.
  if position('''insert '' || ''into hr' in v_def) > 0 then
    raise notice 'hr_l3_45: the checks are already present in their fixed form';
    return;
  end if;

  -- An earlier build spelled the check-17 pattern out, which made the gate match ITSELF. Repair
  -- that one literal in place rather than truncating and rebuilding the function: `left()` on a
  -- `pg_get_functiondef` result cuts off the closing dollar-quote tag, which is how the first
  -- attempt at this failed.
  if position('pay_period_rollup_matches_its_breakdown' in v_def) > 0 then
    v_def := replace(v_def,
      'p.prosrc ~ ''insert into hr\.work_interval''',
      'p.prosrc ~ (''insert '' || ''into hr\.work_interval'')');
    v_def := replace(v_def,
      'p.prosrc !~ ''_ppe_rollup_refresh''',
      'p.prosrc !~ (''_ppe'' || ''_rollup_refresh'')');
    execute v_def;
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception 'hr_l3_45: could not find the end of the conformance function; refusing to guess';
  end if;

  v_block :=
'''A SECURITY DEFINER without a pinned search_path is a privilege-escalation door.'');
  return next;

  ---------------------------------------------------------------- 15. the rollup equals its own breakdown
  check_key := ''pay_period_rollup_matches_its_breakdown'';
  select coalesce(jsonb_agg(jsonb_build_object(
           ''pay_period_id'', x.pay_period_id, ''employment_id'', x.employment_id,
           ''total_hours'', x.total_hours, ''breakdown_sum'', x.bsum,
           ''totals_by_category'', x.cats)), ''[]''::jsonb)
    into v_bad
    from (
      select ppe.pay_period_id, ppe.employment_id, ppe.total_hours,
             ppe.calc -> ''totals_by_category'' cats,
             coalesce((select sum((value #>> ''{}'')::numeric)
                         from jsonb_each(coalesce(ppe.calc -> ''totals_by_category'', ''{}''::jsonb))), 0) bsum
        from hr.pay_period_employment ppe
       where ppe.engine_key is distinct from ''hr.pay_period_enrollment''
    ) x
   where x.total_hours is distinct from x.bsum;
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''A pay-period rollup whose total does not equal the breakdown printed beneath it is ''
      || ''round-4 blocker S6. The original form showed every category as 0.00 under a non-zero ''
      || ''total because enrollment created the row and no writer ever refreshed it. Nothing ''
      || ''errors in that state -- a manager simply approves a timecard that reads zero.'');
  return next;

  ---------------------------------------------------------------- 16. read authority is as-of NOW
  check_key := ''read_authority_is_as_of_now'';
  select coalesce(jsonb_agg(jsonb_build_object(''fn'', n.nspname || ''.'' || p.proname)), ''[]''::jsonb)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = ''hr'' and p.prokind = ''f''
     and p.proname in (''timesheet_get'',''timesheet_period_grid'',''pay_period_get'',''pay_period_list'',
                       ''attendance_exception_list'',''time_adjustment_list'',
                       ''overtime_preapproval_get'',''overtime_preapproval_list'',''punch_register'')
     and p.prosrc ~ (''hr\.capability\([^)]*(period_end_on|local_work_date|work_date|covers_from)[^)]*\)''
                     || ''|_time_has_timecard_approve\([^)]*period_end_on[^)]*\)'');
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''Round-4 blocker S1: a READ door that evaluates the reader''''s capability as-of the ''
      || ''RECORD''''s date refuses an HR admin every period that ended before their own role began. ''
      || ''Current standing governs what history you may read; the punch DATE governs what you may ''
      || ''write. This check is a grep and cannot see a date passed through a local variable.'');
  return next;

  ---------------------------------------------------------------- 17. every interval writer refreshes the rollup
  check_key := ''interval_writers_refresh_the_rollup'';
  select coalesce(jsonb_agg(jsonb_build_object(''fn'', n.nspname || ''.'' || p.proname)), ''[]''::jsonb)
    into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = ''hr'' and p.prokind = ''f''
     -- 🚨 the pattern is CONCATENATED, never written out. A gate whose own body contains
     -- ``insert into hr.work_interval`` is itself matched by hr.stable_doors_that_write(), which
     -- scans prosrc -- this check went red on ITSELF the first time it shipped. Same trap as the
     -- arm_write self-match in hr_l3_30.
     and p.prosrc ~ (''insert '' || ''into hr\.work_interval'')
     and p.prosrc !~ (''_ppe'' || ''_rollup_refresh'');
  ok       := (v_bad = ''[]''::jsonb);
  severity := ''blocking'';
  detail   := jsonb_build_object(''violations'', v_bad,
    ''why'', ''A function that writes a current work_interval without refreshing the pay-period ''
      || ''rollup in the same transaction IS blocker S6, whatever else it does. There are two such ''
      || ''writers today -- hr.recompute_apply and hr.attendance_exception_resolve -- and a third ''
      || ''must refresh it too. One rollup function; every writer calls it.'');
  return next;
end';

  v_def := replace(v_def, v_anchor, v_block);
  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_n int; v_fail jsonb;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  if v_n < 17 then
    raise exception 'hr_l3_45: expected at least 17 checks, found %', v_n;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('check', check_key, 'detail', detail)), '[]'::jsonb)
    into v_fail from hr.punch_write_path_conformance() where not ok;
  if v_fail <> '[]'::jsonb then
    raise exception 'hr_l3_45: the gate is red on arrival: %', v_fail::text;
  end if;

  -- the three new keys really are present and really are blocking
  if (select count(*) from hr.punch_write_path_conformance()
       where check_key in ('pay_period_rollup_matches_its_breakdown',
                           'read_authority_is_as_of_now',
                           'interval_writers_refresh_the_rollup')
         and severity = 'blocking') <> 3 then
    raise exception 'hr_l3_45: the new checks are missing or not blocking';
  end if;
end
$chk$;

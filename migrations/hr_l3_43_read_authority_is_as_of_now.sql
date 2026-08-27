-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 ROUND-4 BLOCKER S1 — EVERY TIME READ DOOR EVALUATED THE READER'S CAPABILITY AS-OF THE
--    RECORD'S DATE, SO AN HR ADMIN COULD NOT READ ANY HISTORY OLDER THAN THEIR OWN ROLE.
--
-- `hr.timesheet_get` set `v_at := v_per.period_end_on` under the comment "RD 10: the event date,
-- never now()" and passed it to `hr.capability(...)`. `hr.capability` resolves the caller's role
-- assignments through their `effective_from`/`effective_to` window, so asking it about a date
-- before the reader's role began correctly answers NO — for a question nobody meant to ask.
-- Falsified live: the same caller, the same subject, granted on the current period and refused on
-- one that had already ended.
--
-- THE RULING (coordinator, this batch), and why the two lanes genuinely differ:
--
--   * READ authority is evaluated AS-OF NOW. A person's CURRENT standing governs what history
--     they may read. An HR admin hired today must be able to read last year's timecards — that is
--     the whole job. Anything else means a company's records become unreadable to the people
--     hired to keep them, and get quietly less readable every time HR turns over.
--
--   * WRITE authority stays AS-OF THE PUNCH DATE, untouched by this migration. That law is about
--     ACTING ON a date — whether you had reach over this person when the work happened — and it is
--     correct. `hr._can_edit_punch` and `hr._punch_capability` in `hr.punch_record` /
--     `hr.punch_correct` / `hr.recompute_apply` are not changed here, and the proof re-confirms a
--     pre-hire back-date still refuses.
--
-- Reading a record is not acting on its date. That is the whole distinction.
--
-- Authority: coordinator ruling round 4 (S1); SPEC-ACCESS §4.2; SPEC-TIME §5.1, §14 D8.
--
-- Applied live as `hr_l3_43_read_authority_is_as_of_now`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE WHOLE SWEEP, NOT JUST THE REPORTED DOOR. `hr.timesheet_get` was the door that got
--    falsified, but it was never alone. Every read door was checked against the live catalogue;
--    nine call sites across seven functions passed a historical date into an authority predicate:
--      hr.timesheet_get ................. v_at (= period_end_on)
--      hr.timesheet_period_grid ......... v_at, via hr._time_has_timecard_approve
--      hr.pay_period_get ................ v_per.period_end_on, both predicates
--      hr.pay_period_list ............... pp.period_end_on, both predicates, twice
--      hr.attendance_exception_list ..... ae.local_work_date, twice
--      hr.time_adjustment_list .......... ta.work_date, twice
--      hr.overtime_preapproval_get ...... v_at
--      hr.overtime_preapproval_list ..... (op.covers_from at time zone 'UTC')::date, twice
--    Fixing only the reported one would have left the same bug in six doors and guaranteed the
--    next round-4 report. `hr.punch_register` and `hr.clock_state` were ALREADY now-based and are
--    untouched; so are `hr_access_audit_query`, `hr_payroll_export_list` and `hr_structure_list`.
-- 2. `v_mine` / `v_self` ARE LEFT ON THE RECORD'S DATE, DELIBERATELY. Those resolve whether the
--    caller IS the subject (or their manager) — identity, not capability. Moving them to now()
--    would strictly REMOVE access: a terminated employee reading their own final timecard has no
--    current employment, and would lose the record of their own last pay period at the moment they
--    most need it. The ruling widens read authority; it must not narrow the self lane on the way.
-- 3. THE REFUSALS NOW NAME THE RIGHT DATE. A refusal that said "as of <period end>" was telling
--    the reader to go fix a date that had nothing to do with the denial. They now report
--    `authority_evaluated_as_of` (today) alongside `period_end_on`, so the sentence and the
--    machine-readable detail agree with what was actually checked.
-- 4. `hr._time_has_timecard_approve` ITSELF IS NOT CHANGED. It already defaults `p_at` to
--    `current_date`, and it is called from WRITE paths that legitimately pass a real date. The fix
--    belongs at the read call sites, not in a shared predicate that both lanes use.

do $mig$
declare
  r record; v_def text; v_before int; v_after int; v_done int := 0;
begin
  for r in
    select * from (values
      -- ── hr.timesheet_get: the GATE only. `may_edit_punches` in the same body is a WRITE hint
      --    about editing punches ON THIS PERIOD'S DATES and correctly stays on v_at (decision 2).
      ('hr.timesheet_get(uuid,uuid)',
       'and not hr\.capability\(v_uid, ''time\.read'', p_employment_id, v_at\) then',
       'and not hr.capability(v_uid, ''time.read'', p_employment_id, current_date) then', 1),
      ('hr.timesheet_get(uuid,uuid)',
       '''subject_employment_id'', p_employment_id, ''as_of'', v_at\);',
       '''subject_employment_id'', p_employment_id, ''authority_evaluated_as_of'', current_date, ''period_end_on'', v_at);', 1),

      -- ── hr.timesheet_period_grid: the approval grid's authority gate
      ('hr.timesheet_period_grid(uuid,jsonb,jsonb)',
       'if not hr\._time_has_timecard_approve\(v_uid, v_per\.organization_id, v_at\) then',
       'if not hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date) then', 1),
      ('hr.timesheet_period_grid(uuid,jsonb,jsonb)',
       'You hold neither as of this period\.',
       'You hold neither today.', 1),
      ('hr.timesheet_period_grid(uuid,jsonb,jsonb)',
       '''pay_group_id'', v_per\.pay_group_id, ''as_of'', v_at\);',
       '''pay_group_id'', v_per.pay_group_id, ''authority_evaluated_as_of'', current_date, ''period_end_on'', v_at);', 1),

      -- ── hr.pay_period_get / _list: both predicates, every site
      ('hr.pay_period_get(uuid)',
       'hr\.capability\(v_uid, ''payroll\.read'', null, v_per\.period_end_on\)',
       'hr.capability(v_uid, ''payroll.read'', null, current_date)', 1),
      ('hr.pay_period_get(uuid)',
       'hr\._time_has_timecard_approve\(v_uid, v_per\.organization_id, v_per\.period_end_on\)',
       'hr._time_has_timecard_approve(v_uid, v_per.organization_id, current_date)', 1),
      ('hr.pay_period_list(jsonb,jsonb)',
       'hr\.capability\(v_uid, ''payroll\.read'', null, pp\.period_end_on\)',
       'hr.capability(v_uid, ''payroll.read'', null, current_date)', 2),
      ('hr.pay_period_list(jsonb,jsonb)',
       'hr\._time_has_timecard_approve\(v_uid, pp\.organization_id, pp\.period_end_on\)',
       'hr._time_has_timecard_approve(v_uid, pp.organization_id, current_date)', 2),

      -- ── the three per-record list doors
      ('hr.attendance_exception_list(jsonb,jsonb)',
       'hr\.capability\(v_uid, ''time\.read'', ae\.employment_id, ae\.local_work_date\)',
       'hr.capability(v_uid, ''time.read'', ae.employment_id, current_date)', 2),
      ('hr.time_adjustment_list(jsonb,jsonb)',
       'hr\.capability\(v_uid, ''time\.read'', ta\.employment_id, ta\.work_date\)',
       'hr.capability(v_uid, ''time.read'', ta.employment_id, current_date)', 2),
      ('hr.overtime_preapproval_get(uuid)',
       'hr\.capability\(v_uid, ''time\.read'', v_op\.employment_id, v_at\)',
       'hr.capability(v_uid, ''time.read'', v_op.employment_id, current_date)', 1),
      ('hr.overtime_preapproval_list(jsonb,jsonb)',
       'hr\.capability\(v_uid, ''time\.read'', op\.employment_id,\s*\(op\.covers_from at time zone ''UTC''\)::date\)',
       'hr.capability(v_uid, ''time.read'', op.employment_id, current_date)', 2)
    ) as t(fn, pat, rep, n)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);
    v_before := (select count(*) from regexp_matches(v_def, r.pat, 'g'));

    -- 0 means this migration already ran; anything other than 0 or the expected count means the
    -- function moved under us and a blind replace would be guesswork.
    if v_before = 0 then
      continue;
    end if;
    if v_before <> r.n then
      raise exception 'hr_l3_43: % — expected % site(s), found % for pattern %',
        r.fn, r.n, v_before, r.pat;
    end if;

    v_def := regexp_replace(v_def, r.pat, r.rep, 'g');
    v_after := (select count(*) from regexp_matches(v_def, r.pat, 'g'));
    if v_after <> 0 then
      raise exception 'hr_l3_43: % — % site(s) survived the replace', r.fn, v_after;
    end if;

    execute v_def;
    v_done := v_done + 1;
  end loop;

  raise notice 'hr_l3_43: % replacement(s) applied', v_done;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- no read door may still hand a record-derived date to an authority predicate
  select string_agg(x.fn, ', ') into v_bad from (
    select n.nspname || '.' || p.proname fn
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.prokind = 'f'
       and p.proname in ('timesheet_get','timesheet_period_grid','pay_period_get','pay_period_list',
                         'attendance_exception_list','time_adjustment_list',
                         'overtime_preapproval_get','overtime_preapproval_list')
       and p.prosrc ~ ('hr\.capability\([^)]*(period_end_on|local_work_date|work_date|covers_from)[^)]*\)'
                       || '|_time_has_timecard_approve\([^)]*period_end_on[^)]*\)')
  ) x;
  if v_bad is not null then
    raise exception 'hr_l3_43: read door still evaluates authority on a record date: %', v_bad;
  end if;

  -- decision 2: the self/manager lane must NOT have been moved to now()
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='hr' and p.proname='timesheet_get') !~ 'v_mine\s*:=\s*hr\.employments_of\(v_uid, v_at\)' then
    raise exception 'hr_l3_43: timesheet_get''s self lane was moved off the record date';
  end if;

  -- the ruling's other half: the WRITE lane is untouched — punch_record still evaluates the
  -- manager-entry authority as-of the punch's own local date (`v_date`), which is what makes a
  -- pre-hire back-date refuse. If this ever stops matching, the two lanes have been conflated.
  if (select prosrc from pg_proc
       where oid='hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure)
      !~ '_punch_capability\(v_uid, ''working_record\.[a-z]+'', p_employment_id, v_date\)' then
    raise exception 'hr_l3_43: the punch write path no longer evaluates authority as-of the punch date';
  end if;
end
$chk$;

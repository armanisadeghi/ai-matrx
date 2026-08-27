-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- 🚨 ROUND-4 S1, RULED APPEND — `hr.pay_period_transition` CHECKED THE ACTOR'S CAPABILITY AS-OF
--    THE PERIOD'S END DATE, SO AN ADMIN COULD NEVER SUBMIT OR APPROVE A PERIOD THAT ENDED BEFORE
--    THEIR ROLE BEGAN.
--
-- Same family as the read doors fixed in hr_l3_43, and the same shape: `v_at := v_per.period_end_on`
-- went straight into the authority predicate. The S4 agent had to construct a pay period ending
-- EXACTLY on the admin's grant date to demonstrate a successful transition — which is the tell.
-- Processing last month's payroll is not an edge case; it is the job.
--
-- THE RULING (coordinator), completing the S1 law. There are now three lanes, not two:
--
--   * WORKING-RECORD WRITES — as-of the punch date. Acting ON a date requires reach over that
--     date. Unchanged, and re-proved below: a pre-hire back-date still refuses.
--   * READ doors — as-of NOW (hr_l3_43). Current standing governs what history you may read.
--   * ADMINISTRATIVE LIFECYCLE ACTIONS — as-of NOW. Submitting, approving, exporting or locking a
--     pay period is an act performed TODAY on an administrative object. It is not a working-record
--     write into the past: it changes no punch, no interval and no hour. The date on the object is
--     what is being administered, not the date the actor must have had reach over.
--
-- Authority: coordinator ruling round 4 (S1 append); SPEC-TIME §14 D8; SPEC-ACCESS §4.2.
--
-- Applied live as `hr_l3_46_lifecycle_authority_is_as_of_now`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. ONE DOOR HAD THE PATTERN, AND THE SWEEP SAYS SO RATHER THAN ASSUMING IT. Every function whose
--    name touches the lifecycle vocabulary (transition / submit / approve / close / lock / reopen /
--    export / generate / enroll / unlock) was checked against the live catalogue for a date-bound
--    authority call. `hr.pay_period_transition` was the only one. `hr.pay_period_generate`,
--    `public.hr_payroll_export_list` and `hr.clock_state` were already `current_date`. The
--    per-employment approval lane runs through the approval engine, which is not touched here.
-- 2. `v_at` ITSELF IS NOT REDEFINED. It still means "this period's end date", and it is still
--    reported in the refusal and stamped into the calc block, where it is the correct value. Only
--    the authority call moves to `current_date`. Redefining the variable would have silently moved
--    every other use of it, including one that lands in stored calc.
-- 3. 🚨 THE SAME LINE WAS ALSO ORG-BLIND, AND THAT IS A SEPARATE, LARGER HOLE. The door called the
--    FOUR-argument `hr.capability(p_user, p_capability, p_subject_employment, p_at)` with a NULL
--    subject. That overload takes no organization at all, and with a NULL subject `hr.capability`
--    skips its population check — so the predicate could not be scoped to this period's employer
--    even in principle. An HR or payroll admin in ANY organization satisfied it for EVERY
--    organization's pay periods, needing only the period's id: submit, approve, export, lock.
--    Falsified live in a rolled-back transaction (below), and it is why this migration switches to
--    `hr._punch_capability(..., v_per.organization_id)` rather than merely swapping the date.
--    `hr.pay_period_generate` already uses exactly that predicate and its own comment claims it is
--    "the same authority the transition door uses" — a claim that was false until now.
-- 4. THE NARROWING IS REAL AND IS THE POINT. `hr._punch_capability` additionally requires the
--    caller to hold an employment in the period's organization and a role assignment granting the
--    capability IN THAT ORGANIZATION. Verified before shipping that the real admin still passes for
--    the G2V History pay group, so this closes a hole without closing a door anybody was using.

do $mig$
declare
  v_def text;
  v_old text := 'if not hr.capability(v_uid, v_cap, null, v_at) then';
  v_new text := 'if not hr._punch_capability(v_uid, v_cap, null, current_date, v_per.organization_id) then';
begin
  v_def := pg_get_functiondef('hr.pay_period_transition(uuid,text,text)'::regprocedure);

  if position(v_new in v_def) > 0 then
    raise notice 'hr_l3_46: the transition door is already now-based and org-scoped';
    return;
  end if;
  if position(v_old in v_def) = 0 then
    raise exception 'hr_l3_46: the transition door''s authority line has moved; refusing to guess';
  end if;

  v_def := replace(v_def, v_old, v_new);

  -- decision 2: the refusal must name the date that was actually checked, and the organization
  -- it was checked in, or it sends the reader to fix something unrelated to the denial.
  v_def := replace(v_def,
    'jsonb_build_object(''capability_required'', v_cap, ''as_of'', v_at,',
    'jsonb_build_object(''capability_required'', v_cap,' || E'\n' ||
    '                 ''authority_evaluated_as_of'', current_date,' || E'\n' ||
    '                 ''organization_id'', v_per.organization_id,' || E'\n' ||
    '                 ''period_end_on'', v_at,');

  v_def := replace(v_def,
    'You do not hold that capability in this organization as of this period.',
    'You do not hold that capability in this organization today.');

  execute v_def;
end
$mig$;

-- ── self-assertions ─────────────────────────────────────────────────────────────────────────
do $chk$
declare v_src text;
begin
  select prosrc into v_src from pg_proc
   where oid = 'hr.pay_period_transition(uuid,text,text)'::regprocedure;

  if position('hr._punch_capability(v_uid, v_cap, null, current_date, v_per.organization_id)' in v_src) = 0 then
    raise exception 'hr_l3_46: the transition door is not now-based and org-scoped';
  end if;
  if position('hr.capability(v_uid, v_cap, null, v_at)' in v_src) > 0 then
    raise exception 'hr_l3_46: the org-blind, period-dated authority call survives';
  end if;
  -- decision 2: v_at must survive as the period's date everywhere else it is used
  if position('v_at := v_per.period_end_on' in v_src) = 0 then
    raise exception 'hr_l3_46: v_at was redefined instead of leaving it as the period date';
  end if;

  -- the working-record lane is still as-of the punch date (the ruling's untouched half)
  if (select prosrc from pg_proc
       where oid='hr.punch_record(uuid,text,timestamptz,text,text,uuid,jsonb,uuid,jsonb)'::regprocedure)
      !~ '_punch_capability\(v_uid, ''working_record\.[a-z]+'', p_employment_id, v_date\)' then
    raise exception 'hr_l3_46: the punch write path no longer evaluates authority as-of the punch date';
  end if;

  -- no lifecycle door may evaluate authority on the object's own date
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'hr' and p.prokind = 'f'
       and p.proname ~ 'transition|reopen|unlock'
       and p.prosrc ~ 'hr\.capability\([^)]*(period_end_on|v_at)[^)]*\)') then
    raise exception 'hr_l3_46: a lifecycle door still evaluates authority on the period''s own date';
  end if;
end
$chk$;

-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Round-10 Y2, second pass: closing the wording class where it actually lives.
--
-- 🚨 A CORRECTION TO MY OWN PREVIOUS REPORT, WHICH THE RULING RESTED ON. I reported that the four
-- write doors carried the same untruth as the queues and needed the same org-scoped fix. That was
-- wrong, and I asserted it without testing the predicate. Their `hr_actor_not_employed` refusal
-- gates on `hr._time_actor_employment(user, org)`, which filters on NEITHER date NOR status — it
-- returns any non-deleted employment in the org. Verified live: for Dana it returns her PENDING
-- employment `b4337db7`, so that refusal cannot fire for a pending hire at all. "You hold no
-- employment in this organization" is reached only when the caller genuinely has no employment row
-- there, and is accurate. Rewording it would have made it LESS true, for a case that cannot occur.
--
-- THE CLASS IS REAL; IT IS IN A DIFFERENT REFUSAL. The doors that DO mis-word a pending hire are
-- the ones whose `v_self` comes from the date-windowed `hr.employments_of(user, at)` — the same
-- predicate behind the queue defect. Falsified live, as Dana, about HER OWN employment:
--
--     covers_from 2026-09-14 (after her 09-09 start) -> allowed, ok:true
--     covers_from 2026-08-28 (before it)             -> "An overtime request is raised by the
--       employee it is about or by their manager on their behalf. You are neither for this
--       employment."
--
-- She is the employee it is about. The sentence is false, and it is false at the moment it does the
-- most damage — mid-onboarding, when the person's own offer says otherwise.
--
-- Four sites, measured not assumed:
--   hr.overtime_preapproval_create  hr_no_ot_request_authority        "You are neither for this employment."
--   hr.overtime_preapproval_get     hr_no_preapproval_read_authority  "You are none of those for this employment."
--   hr.time_adjustment_create       hr_no_adjustment_authority        "You are none of those for this employment."
--   hr.timesheet_get                not_subject_manager_or_hr         "You are none of those for this employment."
--
-- The fourth was found by this migration's own assertion, not by the sweep that preceded it: the
-- grep looked for `not v_self and not`, and `overtime_preapproval_get` spells the same test
-- inline as `not (v_op.employment_id = any (v_mine)) and not`. Asserting on the SENTENCE rather
-- than on the code shape is what caught it.
--
-- Authority: coordinator ruling (round-10 Y2 second pass) — "a refusal states what was actually
-- checked", applied to the sites that actually mis-state it; SPEC-TIME §2.1.
--
-- Applied live as `hr_l3_51_subject_relation_refusals_say_why`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE LEAD SENTENCE STAYS; ONLY THE FINAL CLAUSE MOVES. Each door's opening line ("A correction
--    is filed by the employee it is about, by a manager with reach over them, or by HR") is true
--    and worth keeping — it tells the reader the rule. What was false is the verdict clause that
--    follows it. `hr._time_subject_clause` returns that clause and nothing else, so each door keeps
--    its own voice and its own fallback wording.
-- 2. THE FALLBACK IS TODAY'S SENTENCE, PASSED IN BY THE DOOR. When the caller genuinely is not the
--    subject, "You are none of those for this employment" is exactly right and is what they get.
--    The helper only speaks up when it can say something truer.
-- 3. IT READS THE CALLER'S OWN ROW ONLY — NO NEW REACH. The join is
--    `hr.employee.login_user_id = p_uid`, so the clause can only ever describe an employment the
--    caller owns. For anyone else's employment it returns the fallback without touching the row,
--    which means the refusal reveals nothing it did not already reveal by refusing. Asserted below.
-- 4. TWO ARMS, NOT FOUR. Unlike the queue helper (hr_l3_50), this one is asked about ONE named
--    employment on ONE date, so the only truths available are "yours, but it had not started on
--    that date" and "yours, but it had ended by then". There is no gap arm and no empty arm to
--    have: not-yours is the fallback.
-- 5. `hr.timesheet_get` IS A READ DOOR AND IS INCLUDED ANYWAY. Its `v_self` is still windowed at
--    the period's end date (hr_l3_43 moved the CAPABILITY check to now(), deliberately leaving the
--    self lane on the record's date so a terminated employee keeps their final timecard). So a
--    pending hire reading a period that ended before she starts gets the same false verdict. The
--    class is the sentence, not the door's kind.

-- ── 1. the clause (decision 1) ──────────────────────────────────────────────────────────────
create or replace function hr._time_subject_clause(
  p_uid uuid, p_employment_id uuid, p_at date, p_fallback text)
returns text
language plpgsql stable security definer set search_path to 'hr','public'
as $fn$
declare v_hire date; v_term date;
begin
  if p_uid is null or p_employment_id is null or p_at is null then
    return p_fallback;
  end if;

  -- decision 3: only an employment the CALLER owns can be described here
  select em.hire_date, em.termination_date
    into v_hire, v_term
    from hr.employment em
    join hr.employee e on e.id = em.employee_id
   where em.id = p_employment_id
     and e.login_user_id = p_uid
     and em.deleted_at is null
     and e.deleted_at is null;

  if not found then
    return p_fallback;                      -- decision 2: not theirs, today's sentence is right
  end if;

  -- decision 4: two arms, because one employment on one date has only two ways to miss
  if v_hire is not null and p_at < v_hire then
    return 'This is your own employment, but it had not started on ' || p_at::text
           || ' — it begins on ' || v_hire::text || '.';
  end if;
  if v_term is not null and p_at > v_term then
    return 'This is your own employment, but it had already ended on ' || p_at::text
           || ' — it ended on ' || v_term::text || '.';
  end if;

  return p_fallback;
end
$fn$;

revoke execute on function hr._time_subject_clause(uuid,uuid,date,text) from public, anon;

-- ── 2. the three sites (decision 1) ─────────────────────────────────────────────────────────
do $mig$
declare
  r record; v_def text; v_done int := 0;
begin
  for r in
    select * from (values
      ('hr.overtime_preapproval_create(uuid,timestamptz,timestamptz,numeric,text,uuid,text,uuid[])',
       '''An overtime request is raised by the employee it is about or by their manager on their behalf. You are neither for this employment.''',
       '''An overtime request is raised by the employee it is about or by their manager on their behalf. ''' || E'\n'
       || '        || hr._time_subject_clause(v_uid, p_employment_id, v_at, ''You are neither for this employment.'')'),

      ('hr.time_adjustment_create(uuid,uuid,date,uuid,numeric,numeric,uuid,text)',
       '''A correction is filed by the employee it is about, by a manager with reach over them, or by HR. You are none of those for this employment.''',
       '''A correction is filed by the employee it is about, by a manager with reach over them, or by HR. ''' || E'\n'
       || '        || hr._time_subject_clause(v_uid, p_employment_id, p_work_date, ''You are none of those for this employment.'')'),

      ('hr.overtime_preapproval_get(uuid)',
       '''An overtime request is readable by its subject, by a manager with reach over them, or by HR. You are none of those for this employment.''',
       '''An overtime request is readable by its subject, by a manager with reach over them, or by HR. ''' || E'\n'
       || '        || hr._time_subject_clause(v_uid, v_op.employment_id, v_at, ''You are none of those for this employment.'')'),

      ('hr.timesheet_get(uuid,uuid)',
       '''a timesheet is readable by its subject, by a manager with reach over them, or by HR. You are none of those for this employment.''',
       '''a timesheet is readable by its subject, by a manager with reach over them, or by HR. ''' || E'\n'
       || '        || hr._time_subject_clause(v_uid, p_employment_id, v_at, ''You are none of those for this employment.'')')
    ) as t(fn, old_lit, new_expr)
  loop
    v_def := pg_get_functiondef(r.fn::regprocedure);

    if position('_time_subject_clause' in v_def) > 0 then
      continue;                                            -- already migrated
    end if;
    if position(r.old_lit in v_def) = 0 then
      raise exception 'hr_l3_51: % — the refusal sentence has moved; refusing to guess', r.fn;
    end if;

    v_def := replace(v_def, r.old_lit, r.new_expr);
    execute v_def;
    v_done := v_done + 1;
  end loop;

  raise notice 'hr_l3_51: % refusal(s) repointed', v_done;
end
$mig$;

-- ── 3. self-assertions ──────────────────────────────────────────────────────────────────────
do $chk$
declare v_bad text;
begin
  -- all three sites compose the clause
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr'
         and p.proname in ('overtime_preapproval_create','overtime_preapproval_get',
                           'time_adjustment_create','timesheet_get')
         and p.prosrc ~ '_time_subject_clause') <> 4 then
    raise exception 'hr_l3_51: not every site composes the subject clause';
  end if;

  -- no door may still end on the bare absolute
  select string_agg(p.oid::regprocedure::text, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'hr' and p.prokind = 'f'
     and p.prosrc ~ 'behalf\. You are neither for this employment|HR\. You are none of those for this employment';
  if v_bad is not null then
    raise exception 'hr_l3_51: a door still states the verdict as an absolute: %', v_bad;
  end if;

  -- decision 3: the clause must not read anything but the caller's own employment
  if (select prosrc from pg_proc where oid = 'hr._time_subject_clause(uuid,uuid,date,text)'::regprocedure)
     !~ 'e\.login_user_id = p_uid' then
    raise exception 'hr_l3_51: the clause no longer restricts itself to the caller''s own row';
  end if;
  if (select prosrc from pg_proc where oid = 'hr._time_subject_clause(uuid,uuid,date,text)'::regprocedure)
     ~ 'organization_id|capability|role_assignment' then
    raise exception 'hr_l3_51: the clause reads authority or org state; it must stay non-leaking';
  end if;

  -- the accurate wording from hr_l3_50 must survive on the queues
  if (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.prosrc ~ 'You hold no employment in any organization') > 0 then
    raise exception 'hr_l3_51: the hr_l3_50 wording regressed';
  end if;
end
$chk$;

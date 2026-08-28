-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- The Leave lane's L5-A1 measured as the third member of the program's unapprovable-class family,
-- after `hr.timecards_without_an_approver()` (check 26) and `hr.pay_changes_without_an_approver()`
-- (check 28). Same shape, same gate, so the three read alike.
--
-- 🚨 A CLASS CHECK OVER AN EMPTY TABLE PROVES NOTHING, AND MUST SAY SO. `hr.leave_request` holds
-- ZERO rows and `hr.leave_policy` holds zero policies, so this function returns `[]` today for the
-- uninteresting reason. It is shipped anyway — the check earns its keep the moment the Leave lane
-- writes its first request — but nobody should read the green as evidence that leave routing works.
-- The evidence for that is in this migration's proof run, which put synthetic requests through
-- `hr.can_approve` against real manager edges, not in the count.
--
-- Authority: coordinator ruling (assess L5-A1); the sibling shape of checks 26 and 28.
--
-- Applied live as `hr_l3_68_leave_requests_without_an_approver`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. THE CANDIDATE SET IS "ANYBODY WITH STANDING IN THE ORG", IDENTICAL TO ITS TWO SIBLINGS.
--    Every employee login plus every org member. A narrower set would report holes that a real
--    approver could close; a wider one would credit approvers who cannot see the org at all.
-- 2. `state` IS NOT FILTERED. A leave request nobody can approve is the same defect in `draft` as
--    in `submitted` — filtering to submitted rows would hide the case where a request becomes
--    unapprovable BEFORE anybody tries, which is the case that strands a person quietly.
-- 3. THE SHAPE COLUMN NAMES THE RUNG THAT FAILED, not just that one did. `leave_approve` is in the
--    `auto_record` split, so a managed subject should resolve at RULE 2b and a top-of-chart subject
--    at RULE 3; recording which population a violation belongs to is what tells the next reader
--    whether the reporting-line rung or the top-of-chart fallback is the broken one.

begin;

create or replace function hr.leave_requests_without_an_approver()
returns table(leave_request_id uuid, employment_id uuid, subject text,
              organization_id uuid, has_manager boolean, shape text)
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
begin
  return query
  with req as (
    select lr.id, lr.employment_id, lr.organization_id
      from hr.leave_request lr
      join hr.employment em on em.id = lr.employment_id and em.deleted_at is null
  ),
  cand as (
    select r.id as req_id, u.uid
      from req r
      cross join lateral (
        select e2.login_user_id as uid
          from hr.employment em2
          join hr.employee e2 on e2.id = em2.employee_id
         where em2.organization_id = r.organization_id
           and e2.login_user_id is not null
        union
        select om.user_id
          from iam.organization_member om
         where om.organization_id = r.organization_id
      ) u
  )
  select r.id,
         r.employment_id,
         sub.display_name,
         r.organization_id,
         (select count(*) > 0 from hr.manager_chain(r.employment_id, current_date)),
         case when (select count(*) > 0 from hr.manager_chain(r.employment_id, current_date))
              then 'managed_subject_reporting_line_rung_yielded_nobody'
              else 'top_of_chart_fallback_yielded_nobody' end
    from req r
    join hr.employment em on em.id = r.employment_id
    join hr.employee  sub on sub.id = em.employee_id
   where not exists (
           select 1 from cand k
            where k.req_id = r.id
              and hr.can_approve(k.uid, 'leave_approve', 'hr.leave_request', r.id)
         )
   order by sub.display_name;
end
$fn$;

revoke all on function hr.leave_requests_without_an_approver() from public;
revoke all on function hr.leave_requests_without_an_approver() from anon;

-- ── check 29, the third sibling ─────────────────────────────────────────────────────────────
do $mig$
declare
  v_def text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new text;
begin
  v_def := regexp_replace(v_def, E'\\n  -{10,} 29\\. .*(?=\\nend\\n)', '', '');

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 29. a leave request nobody can approve\n'
  || E'  check_key := ''every_leave_request_has_an_approver'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''subject'', t.subject, ''leave_request_id'', t.leave_request_id,\n'
  || E'           ''has_manager'', t.has_manager, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from hr.leave_requests_without_an_approver() t;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''leave_requests_in_existence'', (select count(*) from hr.leave_request),\n'
  || E'    ''why'', ''The third member of the unapprovable-class family, after checks 26 and 28. ''\n'
  || E'      || ''leave_approve sits in the auto_record split, so a managed subject should resolve at ''\n'
  || E'      || ''RULE 2b (the reporting line) and a top-of-chart subject at RULE 3 (the owner), and ''\n'
  || E'      || ''a sole proprietor''''s own leave is auto_record rather than blocked -- SPEC-ACCESS ''\n'
  || E'      || ''T-22. Measured 2026-08-27 against real manager edges with the org''''s leave ''\n'
  || E'      || ''authority rows removed, all three populations resolved an approver, so no seeding ''\n'
  || E'      || ''was owed. 🚨 READ THE COUNT BESIDE THIS: hr.leave_request is EMPTY, so a green here ''\n'
  || E'      || ''is not evidence that leave routing works -- it is evidence that nothing has been ''\n'
  || E'      || ''requested yet. The check earns its keep on the Leave lane''''s first write.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'(?=\\nend\\n)', v_new, '');
  execute v_def;
end
$mig$;

do $chk$
declare v_n integer; v_29 boolean;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select ok into v_29 from hr.punch_write_path_conformance()
   where check_key = 'every_leave_request_has_an_approver';
  if v_n <> 29 then
    raise exception 'hr_l3_68: expected 29 checks, found %', v_n;
  end if;
  if v_29 is null or not v_29 then
    raise exception 'hr_l3_68: check 29 missing or failing';
  end if;
  if (select count(*) from hr.punch_write_path_conformance() where not ok) <> 0 then
    raise exception 'hr_l3_68: a sibling check regressed';
  end if;
end
$chk$;

commit;

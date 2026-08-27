-- HR domain L3 — register item HRB-015, lane l3-punch-kiosk (BUILDER SQL-1).
--
-- Two conformance checks, one for the defect this lane just fixed and one for a defect it
-- deliberately does NOT fix.
--
--   27. `directory_names_use_the_one_rule` — the suppression helper is the only way a person's
--       name reaches a viewer through the directory and the chart. hr_l3_64 routed the sixth
--       caller; this stops a seventh from being written.
--   28. `every_pay_change_has_an_approver` — the sibling of check 26 for the `require_second_actor`
--       actions, which the reporting-line rung deliberately does not reach. RED-by-data today,
--       carried on a dated allowlist, owned by the workflow/access lane.
--
-- Authority: coordinator ruling (round 18, both items); SPEC-ACCESS §1.3b rule ladder and §4.2;
-- the precedent of check 26 (hr_l3_61) for a class this lane makes visible rather than decides.
--
-- Applied live as `hr_l3_65_gate_directory_names_and_pay_change_approvers`. Idempotent.
--
-- ── RECORDED TECHNICAL DECISIONS ────────────────────────────────────────────────────────────
-- 1. 🚨 CHECK 28 IS REPORTED, NOT FIXED, AND THE REASON IS A LAW. Seeding who may approve a pay
--    change is an approval-engine decision ("the approval engine is the only approval engine"),
--    and SPEC-ACCESS §1.1's activation section — the one the index calls "the activation
--    bootstrap" — enumerates exactly what activation creates (employer profile, first location,
--    department, the nominee's employee + employment, the first `hr_owner` role assignment, one
--    `basis='activation'` audit row) and does NOT include a single `hr.approval_authority` row.
--    The live `public.hr_activate_employer` matches that list item for item. So there was nothing
--    to "build the spec" INTO: the bootstrap already is the spec, and adding founding authority
--    rows would have been this lane inventing an access policy no document states.
-- 2. IT IS ALSO NOT A DEADLOCK, WHICH CHANGES WHAT THE RIGHT FIX IS. `public.hr_authority_grant`
--    gates on `hr.capability(uid,'authority.grant',…) OR iam.organization_member.role = 'owner'`
--    — an explicit owner arm. So the org owner of a fresh org can always grant the missing
--    authority, and the honest description is an UNSEEDED org, not a jammed one. A lane that
--    "fixed" this by seeding would have been papering over a first-run experience problem with a
--    permanent grant.
-- 3. WHY THE MANAGER RUNG DOES NOT RESCUE IT, MEASURED RATHER THAN ASSUMED. hr_c4_20 added
--    `hr.can_approve` RULE 2b (the reporting line) on 2026-08-27 and closed check 26. RULE 2b is
--    gated on `coalesce(v_mode,'require_second_actor') = 'auto_record'`, so it reaches
--    timecard/leave/swap and deliberately never reaches `pay_change_approve` /
--    `termination_approve` / `offer_approve`. That narrowing is correct — a manager should not
--    approve their report's pay alone — and it is precisely why this half stayed open when the
--    other half closed.
-- 4. THE ALLOWLIST IS DATED AND PRINTED, NEVER SILENT. Two live compensation rows have zero
--    eligible approvers among every user with standing in their org, both of the shape
--    `managed_subject_no_authority_row`. They ride an allowlist so the check is GREEN on what is
--    already known and BLOCKING the moment a third appears. The six top-of-chart rows in the same
--    org each resolve exactly one approver through RULE 3, which is what makes the two stand out
--    as a shape rather than as an empty database.
-- 5. CHECK 27 ASSERTS THE POSITIVE AND THE NEGATIVE. Presence of the helper call alone would pass
--    a door that called it and then projected the raw column beside it; absence of the raw column
--    alone would pass a door that projected nothing. Both arms, on both doors.

begin;

-- ── the diagnostic behind check 28 ──────────────────────────────────────────────────────────
create or replace function hr.pay_changes_without_an_approver()
returns table(compensation_id uuid, employment_id uuid, subject text,
              organization_id uuid, has_manager boolean, shape text)
language plpgsql
stable
security definer
set search_path = hr, public
as $fn$
begin
  return query
  with comp as (
    select c.id, c.employment_id, em.organization_id
      from hr.compensation c
      join hr.employment em on em.id = c.employment_id and em.deleted_at is null
     where c.deleted_at is null
  ),
  cand as (
    -- every user with any standing in the org: an employee login, or an org member
    select co.id as comp_id, u.uid
      from comp co
      cross join lateral (
        select e2.login_user_id as uid
          from hr.employment em2
          join hr.employee e2 on e2.id = em2.employee_id
         where em2.organization_id = co.organization_id
           and e2.login_user_id is not null
        union
        select om.user_id
          from iam.organization_member om
         where om.organization_id = co.organization_id
      ) u
  )
  select co.id,
         co.employment_id,
         sub.display_name,
         co.organization_id,
         (select count(*) > 0 from hr.manager_chain(co.employment_id, current_date)),
         case when (select count(*) > 0 from hr.manager_chain(co.employment_id, current_date))
              then 'managed_subject_no_authority_row'
              else 'top_of_chart_unreachable' end
    from comp co
    join hr.employment em on em.id = co.employment_id
    join hr.employee  sub on sub.id = em.employee_id
   where not exists (
           select 1 from cand k
            where k.comp_id = co.id
              and hr.can_approve(k.uid, 'pay_change_approve', 'hr.compensation', co.id)
         )
   order by sub.display_name;
end
$fn$;

revoke all on function hr.pay_changes_without_an_approver() from public;
revoke all on function hr.pay_changes_without_an_approver() from anon;

-- ── append checks 27 and 28 to the conformance function ─────────────────────────────────────
do $mig$
declare
  v_def  text := pg_get_functiondef('hr.punch_write_path_conformance()'::regprocedure);
  v_new  text;
begin
  -- Remove-all-then-insert-one. A guard that only ADDS is how hr_l3_59 accumulated four copies of
  -- one line: the replay harness commits, so every re-run appended again. Default flags on purpose
  -- — `.` must span newlines here, which the 'n' flag would forbid.
  if position('directory_names_use_the_one_rule' in v_def) > 0 then
    v_def := regexp_replace(v_def, E'\\n  -{10,} 27\\. .*(?=\\nend\\n)', '', '');
  end if;

  v_new := E'\n'
  || E'  ---------------------------------------------------------------- 27. one suppression rule, all callers\n'
  || E'  check_key := ''directory_names_use_the_one_rule'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(''door'', d.door, ''problem'', d.problem)\n'
  || E'           order by d.door), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from (\n'
  || E'      select ''public.hr_directory_list''::text as door, ''projects the raw manager name''::text as problem\n'
  || E'       where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                      where n.nspname = ''public'' and p.proname = ''hr_directory_list''\n'
  || E'                        and position(''mgr.'' || ''display_name'' in p.prosrc) > 0)\n'
  || E'      union all\n'
  || E'      select ''public.hr_directory_list'', ''does not call the suppression helper''\n'
  || E'       where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                          where n.nspname = ''public'' and p.proname = ''hr_directory_list''\n'
  || E'                            and p.prosrc like ''%_employee_display_name%'')\n'
  || E'      union all\n'
  || E'      select ''public.hr_org_chart'', ''does not call the suppression helper''\n'
  || E'       where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace\n'
  || E'                          where n.nspname = ''public'' and p.proname = ''hr_org_chart''\n'
  || E'                            and p.prosrc like ''%_subject_display_name%'')\n'
  || E'    ) d;\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''why'', ''hr_directory_list suppressed an opted-out person''''s own ROW in its WHERE clause and ''\n'
  || E'      || ''then printed that same person''''s full name one column over, as manager_name, to any ''\n'
  || E'      || ''peer -- a raw hr.employee.display_name read with no viewer in it. The row-level ''\n'
  || E'      || ''suppression is what hid it: anyone testing "is the opted-out employee hidden?" gets a ''\n'
  || E'      || ''correct YES. The helper already answered NULL for that viewer; the door was not ''\n'
  || E'      || ''asking it. Six callers, one rule -- and the rule lives in hr._employee_display_name ''\n'
  || E'      || ''with hr._subject_display_name delegating, so an employment-keyed and an ''\n'
  || E'      || ''employee-keyed caller can never disagree about one person.'');\n'
  || E'  return next;\n'
  || E'\n'
  || E'  ---------------------------------------------------------------- 28. a pay change nobody can approve\n'
  || E'  check_key := ''every_pay_change_has_an_approver'';\n'
  || E'  select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'           ''subject'', t.subject, ''compensation_id'', t.compensation_id,\n'
  || E'           ''has_manager'', t.has_manager, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)\n'
  || E'    into v_bad\n'
  || E'    from hr.pay_changes_without_an_approver() t\n'
  || E'   where t.compensation_id not in (\n'
  || E'           -- KNOWN 2026-08-27, owned by the workflow/access lane. Re-date only with a fix.\n'
  || E'           ''eeb61ea4-d194-4f73-b88e-e5c1626708e0''::uuid,\n'
  || E'           ''a2b5f2b9-ec20-4f97-b362-f6763b8eb62a''::uuid);\n'
  || E'  ok       := (v_bad = ''[]''::jsonb);\n'
  || E'  severity := ''blocking'';\n'
  || E'  detail   := jsonb_build_object(\n'
  || E'    ''violations'', v_bad,\n'
  || E'    ''known_2026_08_27'', (select coalesce(jsonb_agg(jsonb_build_object(\n'
  || E'          ''subject'', t.subject, ''shape'', t.shape) order by t.subject), ''[]''::jsonb)\n'
  || E'        from hr.pay_changes_without_an_approver() t),\n'
  || E'    ''why'', ''hr_c4_20 closed check 26 by adding hr.can_approve RULE 2b, the reporting-line ''\n'
  || E'      || ''rung. RULE 2b is gated on sole_authority_mode = auto_record, so it reaches ''\n'
  || E'      || ''timecard/leave/swap and deliberately never reaches pay_change_approve, ''\n'
  || E'      || ''termination_approve or offer_approve -- correctly, since a manager must not approve ''\n'
  || E'      || ''their own report''''s pay alone. That leaves a managed subject failing RULE 2 (no ''\n'
  || E'      || ''authority row exists in ANY org: hr.approval_authority is empty database-wide), ''\n'
  || E'      || ''RULE 2b (wrong mode) and RULE 3 (gated on top-of-chart), so nobody can act. It is ''\n'
  || E'      || ''NOT a deadlock: hr_authority_grant admits iam.organization_member.role = owner ''\n'
  || E'      || ''explicitly, so the org owner can always grant the missing authority. And it is not ''\n'
  || E'      || ''an activation bug: SPEC-ACCESS 1.1 enumerates what activation creates and no ''\n'
  || E'      || ''approval_authority row is in that list, which hr_activate_employer matches exactly. ''\n'
  || E'      || ''Whether a fresh org should be SEEDED with founding authorities is an approval-engine ''\n'
  || E'      || ''policy decision no spec states, so it is surfaced here rather than invented here.'');\n'
  || E'  return next;\n';

  v_def := regexp_replace(v_def, E'\\nend\\n(\\s*\\$function\\$)?\\s*$', v_new || E'\nend\n\\1', 'n');
  execute v_def;
end
$mig$;

-- ── prove the gate installed and still runs ─────────────────────────────────────────────────
do $chk$
declare v_n integer; v_fail integer; v_27 boolean; v_28 boolean;
begin
  select count(*) into v_n from hr.punch_write_path_conformance();
  select count(*) into v_fail from hr.punch_write_path_conformance() where not ok;
  select ok into v_27 from hr.punch_write_path_conformance()
   where check_key = 'directory_names_use_the_one_rule';
  select ok into v_28 from hr.punch_write_path_conformance()
   where check_key = 'every_pay_change_has_an_approver';

  if v_27 is null or v_28 is null then
    raise exception 'hr_l3_65: check 27/28 did not install (27=%, 28=%)', v_27, v_28;
  end if;
  if not v_27 then
    raise exception 'hr_l3_65: check 27 is failing — the directory does not route through the one rule';
  end if;
  if not v_28 then
    raise exception 'hr_l3_65: check 28 is failing — a pay change outside the dated allowlist has no approver';
  end if;
  raise notice 'hr_l3_65: % checks, % failing', v_n, v_fail;
end
$chk$;

commit;

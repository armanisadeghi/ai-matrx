-- hr_l1_59_the_tenant_guard_binds_without_an_employment.sql
--
-- 🚨 P0, LIVE CROSS-TENANT READ. ANY HR ADMIN OF ANY ORG COULD READ ANY OTHER ORG'S PEOPLE WHOSE
-- EMPLOYMENT WAS NOT CURRENT — every future-dated new hire, and every terminated ex-employee.
--
-- Reproduced on production as `priya` (hr_admin in "Write Target Sandbox" and NOWHERE else),
-- over real HTTPS PostgREST with a real minted token:
--   POST /rest/v1/rpc/hr_employee_profile {"p_employee_id":"32204298-…"}   (org 319fad99, Probe Two)
--     → granted:true, viewer:"hr_admin", comp_visibility:"full", 10 tabs,
--       header.legal_name:"G2T-Owen Fitzgerald", employee_number, party_id
--   POST /rest/v1/rpc/hr_employment_history  → granted:true — hire date, employment_id, job title,
--       department, location, timezone, FTE, reporting lines, external identities
--   POST /rest/v1/rpc/hr_pending_changes     → granted:true — the pending position row
-- and in the browser, /hr/people/32204298-…/personal rendered a foreign employee's full HR-admin
-- profile underneath a "Write Target Sandbox" header.
--
-- THE MECHANISM, IN ONE SENTENCE: `hr._l1_viewer` sets
--   v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;
-- which is NULL for anyone whose employment has not STARTED yet or has already ENDED, and then
-- asked `hr.capability(p_user, 'identity.read', v_emp, p_at)` — WITHOUT the organization it was
-- already holding in `v_org`. Inside `hr.capability` BOTH tenant predicates are gated on that
-- argument:
--     and (v_org is null or ra.organization_id = v_org)
--     and (p_subject_employment is null or hr.population_contains(...))
-- so with the subject NULL and the org unpassed they are BOTH vacuously true, and the question
-- silently degrades from "does this user hold identity.read over THIS PERSON, IN THIS EMPLOYER"
-- to "does this user hold identity.read ANYWHERE". `hr.capability` has had a `p_organization_id`
-- parameter for exactly this since the previous tenant fix; that fix closed the path where the
-- subject's employment EXISTS (it resolves v_org from the employment row) and left untouched the
-- one where it does not. A guard that is switched off by its own missing argument is not a guard.
--
-- 🚨 THE FIX IS STRICTLY TENANT-NARROWING AND CANNOT REMOVE LEGITIMATE ACCESS. Passing the org
-- only ever adds `ra.organization_id = v_org` to arm 2. An admin's own role assignment IS in the
-- org they administer, so nothing changes for them; the only grants it removes are ones that came
-- from a role in a DIFFERENT tenant. THE MUST-NOT-BREAK CASE IS EXPLICIT: an org's own HR admin
-- reading their own not-yet-started new hire is a real product path (you onboard someone before
-- day one), it stays GRANTED, and it is falsified as case 3 in
-- scripts/hr/hr_l1_59_prehire_tenant_guard_falsification.py.
--
-- THE CLASS, NOT THE ONE DOOR. Every caller of `hr.capability` in the database was read. Ten call
-- sites across nine functions passed a subject that can be NULL while holding an organization they
-- did not pass; all are corrected here. `hr_employment_history` and `hr_pending_changes` needed no
-- edit of their own — they gate on `hr._l1_viewer`, so they are fixed by the first function below.
--
-- Substitutions are made against `pg_get_functiondef` with an EXACT occurrence count asserted per
-- anchor, so each body is provably byte-identical except for the intended edit.
--
-- Applied live 2026-08-29 and double-ledgered. Falsified 42/42 through PostgREST with real tokens.

do $mig$
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_l1_viewer')
     ~ 'THE TENANT GUARD BINDS WITHOUT AN EMPLOYMENT' then
    raise notice 'hr_l1_59: already applied';
    return;
  end if;

  create or replace function pg_temp._swap(p_fn text, p_old text, p_new text, p_expect int)
  returns void language plpgsql as $swap$
  declare v_def text; v_cnt int;
  begin
    v_def := pg_get_functiondef(p_fn::regprocedure);
    v_cnt := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
    if v_cnt <> p_expect then
      raise exception 'hr_l1_59: % — expected % occurrence(s) of the anchor, found %. REFUSING to '
                      'guess at a body that has moved underneath this migration.',
                      p_fn, p_expect, v_cnt;
    end if;
    execute replace(v_def, p_old, p_new);
  end $swap$;

  ---------------------------------------------------------------------------------------------
  -- 1. hr._l1_viewer — THE LEAK ITSELF. Fixes hr_employee_profile, hr_employment_history and
  --    hr_pending_changes at once, because all three gate on this viewer's `kind`.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;',
    E'  -- 🚨 THE TENANT GUARD BINDS WITHOUT AN EMPLOYMENT. v_emp is NULL for a prehire and for a\n'
    || E'  -- terminated ex-employee, so every capability question below passes v_org EXPLICITLY.\n'
    || E'  -- hr.capability gates both of its tenant predicates on its\n'
    || E'  -- arguments, so a NULL subject with an unpassed org makes them vacuously true and asks\n'
    || E'  -- only "does this user hold the capability ANYWHERE" — which let any org''s HR admin read\n'
    || E'  -- any other org''s not-yet-started hires (P0, hr_l1_59). Do not drop the fifth argument.\n'
    || E'  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;', 1);
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'hr.capability(p_user, ''identity.read'', v_emp, p_at)',
    E'hr.capability(p_user, ''identity.read'', v_emp, p_at, v_org)', 1);
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'hr.capability(p_user, ''working_record.write'', v_emp, p_at)',
    E'hr.capability(p_user, ''working_record.write'', v_emp, p_at, v_org)', 1);
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'hr.capability(p_user, ''directory.read'', v_emp, p_at)',
    E'hr.capability(p_user, ''directory.read'', v_emp, p_at, v_org)', 1);

  ---------------------------------------------------------------------------------------------
  -- 2. public.hr_employee_profile — the SAME NULL v_emp, five more times. This is what returned
  --    comp_visibility:"full" and a `compensation` tab on a foreign prehire: `comp.read` was
  --    answered by a role held in a different tenant. No compensation ROW ever crossed (they are
  --    keyed by employment_id, which is null here) — but the flag and the tab did.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('public.hr_employee_profile(uuid,date)',
    E', v_emp, v_on)', E', v_emp, v_on, v_org)', 5);

  ---------------------------------------------------------------------------------------------
  -- 3. hr._l1_write_gate — the same shape on the WRITE side. `p_org` is already required (it
  --    raises when null) and a create-shaped write legitimately has no subject employment yet.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr._l1_write_gate(uuid,text,uuid,text,text,text)',
    E'hr.capability(v_uid, p_capability, p_subject_employment, current_date)',
    E'hr.capability(v_uid, p_capability, p_subject_employment, current_date, p_org)', 1);

  ---------------------------------------------------------------------------------------------
  -- 4. hr._door_verdict — v_subject is `null::uuid` for every audited token with no subject
  --    mapping, and v_org is resolved from the row several statements earlier.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr._door_verdict(uuid,text,uuid,boolean)',
    E'hr.capability(p_user, v_cap, v_subject)',
    E'hr.capability(p_user, v_cap, v_subject, current_date, v_org)', 1);

  ---------------------------------------------------------------------------------------------
  -- 5. public.hr_authority_grant — v_holder_emp is NULL whenever the holder is a ROLE rather than
  --    an employment or a position, which is the branch that granted approval authority.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap(
    'public.hr_authority_grant(text,text,text,text,uuid,uuid[],jsonb,integer,date,date,text,uuid)',
    E'hr.capability(v_uid, ''authority.grant'', v_holder_emp)',
    E'hr.capability(v_uid, ''authority.grant'', v_holder_emp, current_date, v_org)', 1);

  ---------------------------------------------------------------------------------------------
  -- 6-9. the time & payroll rung: every one of these asks an ORG-WIDE question with a NULL
  --      subject while holding the organization in a local. hr._punch_capability already carries
  --      a hand-written wrapper for exactly this defect; these are the sites that never got one.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr._time_has_timecard_approve(uuid,uuid,date)',
    E'hr.capability(p_user, ''time.read'', null, v_at)',
    E'hr.capability(p_user, ''time.read'', null, v_at, p_organization_id)', 1);
  perform pg_temp._swap('hr.pay_period_get(uuid)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date, v_per.organization_id)', 1);
  perform pg_temp._swap('hr.pay_period_list(jsonb,jsonb)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date, pp.organization_id)', 2);
  perform pg_temp._swap('hr.timecard_attestation_sweep(uuid,boolean)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date)',
    E'hr.capability(v_uid, ''payroll.read'', null, current_date, v_per.organization_id)', 1);

  ---------------------------------------------------------------------------------------------
  -- 10. hr.access_explain — the DIAGNOSTIC that explains a verdict. Left unpassed it explains a
  --     verdict the real doors no longer reach, which is the one bug an explainer must never have.
  ---------------------------------------------------------------------------------------------
  perform pg_temp._swap('hr.access_explain(uuid,text,uuid)',
    E'hr.capability(p_user,''working_record.read'', case when p_token=''hr_employment'' then p_id else null end)',
    E'hr.capability(p_user,''working_record.read'', case when p_token=''hr_employment'' then p_id else null end, current_date, v_org)', 1);
end $mig$;

---------------------------------------------------------------------------------------------
-- The contracts. A re-emit of any of these functions that drops the organization argument
-- reopens a P0 cross-tenant read, and `hr.function_contracts_broken()` is the gate that says so.
---------------------------------------------------------------------------------------------
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr', '_l1_viewer', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['THE TENANT GUARD BINDS WITHOUT AN EMPLOYMENT',
         '''identity.read'', v_emp, p_at, v_org)',
         '''working_record.write'', v_emp, p_at, v_org)',
         '''directory.read'', v_emp, p_at, v_org)'],
   array['''identity.read'', v_emp, p_at)',
         '''working_record.write'', v_emp, p_at)',
         '''directory.read'', v_emp, p_at)'],
   'P0 cross-tenant read. v_emp is NULL for a prehire and for a terminated ex-employee, and '
   || 'hr.capability gates BOTH of its tenant predicates on its arguments — so a NULL subject with '
   || 'an unpassed organization asks only "does this user hold the capability ANYWHERE". Any org''s '
   || 'HR admin read any other org''s not-yet-started hires through hr_employee_profile, '
   || 'hr_employment_history and hr_pending_changes, all three of which gate on this viewer. '
   || 'Dropping the fifth argument reopens it.'),

  ('public', 'hr_employee_profile', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''comp.read'', v_emp, v_on, v_org)',
         '''incident.read'', v_emp, v_on, v_org)',
         '''corrective_action.issue'', v_emp, v_on, v_org)'],
   array['''comp.read'', v_emp, v_on)',
         '''incident.read'', v_emp, v_on)',
         '''corrective_action.issue'', v_emp, v_on)'],
   'Same P0: with v_emp NULL (prehire / terminated) these five capability questions were answered '
   || 'by roles held in OTHER tenants, which is how a foreign prehire came back with '
   || 'comp_visibility "full", a compensation tab and a relations tab.'),

  ('hr', '_l1_write_gate', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['p_subject_employment, current_date, p_org)'],
   array['p_subject_employment, current_date)'],
   'The write half of the same class: a create-shaped write has no subject employment, so without '
   || 'p_org the gate asked whether the caller holds the capability in ANY tenant.'),

  ('hr', '_door_verdict', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['hr.capability(p_user, v_cap, v_subject, current_date, v_org)'],
   array['hr.capability(p_user, v_cap, v_subject)'],
   'v_subject is null::uuid for every audited token with no subject mapping; v_org is resolved '
   || 'from the row before any early return, so there is never a reason not to pass it.'),

  ('public', 'hr_authority_grant', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''authority.grant'', v_holder_emp, current_date, v_org)'],
   array['''authority.grant'', v_holder_emp)'],
   'v_holder_emp is NULL when the holder is a ROLE, so approval authority could be granted into a '
   || 'tenant on the strength of authority.grant held in a different one.'),

  ('hr', '_time_has_timecard_approve', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''time.read'', null, v_at, p_organization_id)'],
   array['''time.read'', null, v_at)'],
   'An org-wide question with a NULL subject while holding p_organization_id unused.'),

  ('hr', 'pay_period_get', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''payroll.read'', null, current_date, v_per.organization_id)'],
   array['''payroll.read'', null, current_date)'],
   'payroll.read held in ANY tenant opened a pay period in EVERY tenant; this door has no other '
   || 'organization check in front of it.'),

  ('hr', 'pay_period_list', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''payroll.read'', null, current_date, pp.organization_id)'],
   array['''payroll.read'', null, current_date)'],
   'Same question, per row, for a caller employed in more than one organization.'),

  ('hr', 'timecard_attestation_sweep', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''payroll.read'', null, current_date, v_per.organization_id)'],
   array['''payroll.read'', null, current_date)'],
   'A WRITE sweep gated on payroll.read held anywhere.'),

  ('hr', 'access_explain', 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql',
   array['''working_record.read'', case when p_token=''hr_employment'' then p_id else null end, current_date, v_org)'],
   array['''working_record.read'', case when p_token=''hr_employment'' then p_id else null end)'],
   'The explainer must answer the same question the doors ask, or it explains a verdict nothing '
   || 'reaches.')
on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_not_contain = excluded.must_not_contain,
      reason = excluded.reason, is_active = true;

do $verify$
declare v_broken int; v_bad text;
begin
  select count(*), string_agg(qname || ' / ' || clause || ' / ' || missing_or_present, '; ')
    into v_broken, v_bad
    from hr.function_contracts_broken()
   where home_migration = 'hr_l1_59_the_tenant_guard_binds_without_an_employment.sql';
  if v_broken > 0 then
    raise exception 'hr_l1_59: % contract clause(s) still broken after apply: %', v_broken, v_bad;
  end if;
end $verify$;

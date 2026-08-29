-- hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql
--
-- 🚨 THE FOURTH RULING: THE WRITE GATE NEVER ASKED THE POPULATION IT HAD JUST REFUSED THE READ FOR.
--
-- hr_l1_61 closed the population half of the subject doors by resolving the subject's NEAREST
-- EMPLOYMENT SPELL — but it added that fallback to `hr._l1_viewer` ONLY. Every write door kept
-- `v_emp := (hr.employment_as_of(…, current_date)).id`, which is NULL for a prehire and for a
-- terminated ex-employee, and handed that raw NULL to `hr._l1_write_gate` → `hr.capability`,
-- which skips `population_contains` outright on a NULL subject. Same admin, same second, same
-- subject, opposite answers — reproduced identically twice by an independent re-verifier:
--
--   subject (all three in Operations)      read      write gate
--   Nadia Okafor        (active)           peer      GATE REFUSED   ← positive control
--   Mari36 Okonkwo      (prehire)          peer      GATE PASSED    ← the defect
--   G2offb Offboardme   (terminated)       peer      GATE PASSED    ← the defect
--
-- The tenant was never unbound here (`p_org` is required and non-null on every path), so this is
-- NOT the cross-tenant leak of hr_l1_59. It is hr_l1_61's population half, open on writes.
--
-- AND IT IS A CLASS, NOT TWO FUNCTIONS. Of the 24 callers of `hr._l1_write_gate`, ten handed the
-- gate a subject it could not scope against: three resolved with the un-fallback'd
-- `hr.employment_as_of`, seven passed a literal `null` while a real subject sat one column away.
-- Only two were proven end-to-end; the remaining eight are the same code shape, and shipping a
-- fix for the two that were executed is how a class defect comes back. `hr_employee_create` is
-- left alone on purpose: its NULL is deliberate and documented — there is no subject yet.
--
-- 🚨 AND THE PER-INSTANCE WORKFLOW DOOR WAS THE SAME HALF-FIX ONE RUNG UP. hr_l1_62 scoped the
-- queue LIST; `hr._wf_instance_visible` kept the org-rung NULL subject, so both items a
-- department-scoped admin's queue correctly WITHHELD stayed fully readable by uuid — granted:true,
-- the subject's name, and the change diff. The contracts encoded the half-fix exactly: `hr.wf_inbox`
-- carries the "SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE" pin; the door carried none.
--
-- THE FIX IS THE PATTERN hr_l1_61/62 ESTABLISHED, EXTENDED — NEVER A SECOND COPY OF THE RULE:
--   • `hr.subject_employment_as_of` is now the ONE implementation of the nearest-spell rule. It is
--     lifted OUT of `hr._l1_viewer` (which now calls it) so that eleven call sites cannot drift.
--   • `hr._l1_subject_write_gate` resolves an EMPLOYEE-keyed door's subject through that resolver
--     and then calls the SAME `hr._l1_write_gate`. Nothing about the population rule is re-derived.
--   • The EMPLOYMENT-keyed doors (incidents, restricted notes) already had the subject in hand;
--     they pass it, exactly as hr_l1_62 passed `i.subject_employment_id`.
--   • `hr._wf_instance_visible` passes `inst.subject_employment_id` to the same predicate the queue
--     list asks. The four identity standings above it (filed / subject / routed / decided) are
--     untouched; only the capability arm narrows.
--
--   org-scoped grant        → population_contains('org') is true → EVERY write and read UNCHANGED
--   department-scoped grant → writes and instance reads bounded by the department, prehires and
--                             leavers included (hr_l1_61's v_pop_at carries straight through)
--   incident with NO subject→ nothing to evaluate → stays on the org rung, still writable
--   instance with NO subject→ nothing to evaluate → stays on the affordance rung, still visible
--
-- 🚨 THE TWO ASYMMETRIES ARE DELIBERATE AND THEY POINT OPPOSITE WAYS, WHICH IS CORRECT.
-- A SUBJECT door whose population cannot be established fails CLOSED: the cost of being wrong is
-- disclosure, and every employee definitionally has a spell (`hr_employee_create` writes the
-- employee and the employment in one act), so an unresolvable subject is a data defect, not a
-- flow — measured 0 such employees before shipping. A WORK ITEM or an INCIDENT with no subject at
-- all has no population to be wrong about, and failing it closed would strand it where nobody but
-- an org-scoped admin could ever pick it up — `unactionable_no_reach` rebuilt on purpose. That is
-- hr_l1_62's ruling and it is not revisited here.
--
-- Also closed, both latent and both reported by the re-verifier as hardening rather than leaks:
--   (a) an employee with ZERO live employment rows left the subject NULL even after the fallback,
--       unbinding the population on READS too. The three capability rungs in `hr._l1_viewer` are
--       now guarded on `v_emp`, and the employee-keyed write doors refuse. 0 such employees today.
--   (b) the fallback picked the nearest spell with NO organization filter, and `hr.capability` then
--       treats that spell's org as authoritative. The resolver now filters by, and then asserts,
--       the employee's own employer. 0 rows where employment.organization_id disagrees today.
--
-- Applied live 2026-08-29 and double-ledgered. Falsified three ways through PostgREST.

---------------------------------------------------------------------------------------------
-- 1. THE ONE IMPLEMENTATION OF THE NEAREST-SPELL RULE
---------------------------------------------------------------------------------------------
create or replace function hr.subject_employment_as_of(
  p_employee_id uuid, p_at date default current_date, p_organization_id uuid default null)
returns uuid
language plpgsql stable security definer set search_path = hr, public
as $fn$
declare v_emp uuid; v_org uuid;
begin
  if p_employee_id is null then return null; end if;

  -- the live spell resolves through the ONE definition of "employed on this date"
  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;

  -- 🚨 AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP (hr_l1_61's rule, now living exactly once).
  -- Nobody is employed TODAY for a prehire or an ex-employee, but the record still says WHICH
  -- JOB: the earliest FUTURE spell is the one a prehire is about to start, the latest PAST spell
  -- is the one an ex-employee last held. Resolving it gives hr.capability a real subject to scope
  -- against instead of a blank cheque. This block was inlined in hr._l1_viewer and NOWHERE else,
  -- which is precisely how ten write doors stayed open after hr_l1_61 — it is lifted here so that
  -- every door asks one rule. Copying it back into a caller reopens the class.
  if v_emp is null then
    select em.id into v_emp
      from hr.employment em
     where em.employee_id = p_employee_id and em.deleted_at is null
       and (p_organization_id is null or em.organization_id = p_organization_id)
     order by (em.hire_date > p_at) desc,
              case when em.hire_date > p_at then em.hire_date end asc nulls last,
              em.hire_date desc
     limit 1;
  end if;

  -- 🚨 THE RESOLVED SPELL MUST BELONG TO THE EMPLOYEE'S OWN EMPLOYER, ASSERTED AND NOT ASSUMED.
  -- hr.capability treats the SUBJECT's employment organization as authoritative and overrides the
  -- organization the door passed it. No constraint ties hr.employment.organization_id to
  -- hr.employee.organization_id, so a single mismatched row would silently move the tenant the
  -- capability is evaluated in. Fail closed instead. (0 such rows measured before shipping.)
  if v_emp is not null and p_organization_id is not null then
    select em.organization_id into v_org from hr.employment em where em.id = v_emp;
    if v_org is distinct from p_organization_id then return null; end if;
  end if;

  return v_emp;
end $fn$;

comment on function hr.subject_employment_as_of(uuid, date, uuid) is
  'hr_l1_64: the ONE resolution of "which employment is this person''s record about as of a date" '
  '— the live spell, else the nearest one (intended future, else last held), asserted to the '
  'employee''s own employer. Every subject door, read and write, resolves through this and only '
  'this; a NULL subject makes hr.capability skip population_contains entirely.';

---------------------------------------------------------------------------------------------
-- 2. THE EMPLOYEE-KEYED WRITE GATE: RESOLVE, FAIL CLOSED, THEN ASK THE SAME GATE
---------------------------------------------------------------------------------------------
create or replace function hr._l1_subject_write_gate(
  p_org uuid, p_capability text, p_employee_id uuid, p_token text, p_action text,
  p_purpose text default 'operational',
  out gate jsonb, out subject_employment uuid)
language plpgsql volatile security definer set search_path = hr, public
as $fn$
declare v_audit uuid;
begin
  if p_org is null then
    raise exception 'hr write: organization_id is required' using errcode = '22023';
  end if;

  -- 🚨 THE WRITE GATE ASKS THE POPULATION THE READ WAS ALREADY REFUSED FOR (hr_l1_64).
  -- This function exists so that the resolution and the refusal happen in ONE place for every
  -- employee-keyed door. It adds no rule of its own: the nearest spell comes from
  -- hr.subject_employment_as_of and the decision comes from hr._l1_write_gate, unchanged.
  subject_employment := hr.subject_employment_as_of(p_employee_id, current_date, p_org);

  -- an employee with no spell at all cannot be scoped against, and a scope that cannot be
  -- evaluated is not a scope. Fail closed — hr_employee_create writes the employee and the
  -- employment in the same act, so reaching here means the data is broken, not the flow.
  if subject_employment is null then
    v_audit := hr._record_access_audit(
      p_organization_id => p_org, p_action => 'denied', p_target_token => p_token,
      p_purpose => coalesce(p_purpose, 'operational'), p_basis => 'refused', p_granted => false,
      p_row_count => 0, p_sensitivity_tier => 'internal',
      p_denial_reason => 'unresolvable_subject:' || p_capability);
    gate := jsonb_build_object('ok', false, 'reason', 'forbidden',
      'detail', 'That person has no employment record in this employer, so no scope can be '
             || 'evaluated against them.',
      'capability', p_capability, 'audit_id', v_audit);
    return;
  end if;

  gate := hr._l1_write_gate(p_org, p_capability, subject_employment, p_token, p_action,
                            coalesce(p_purpose, 'operational'));
end $fn$;

comment on function hr._l1_subject_write_gate(uuid, text, uuid, text, text, text) is
  'hr_l1_64: the employee-keyed write gate. Resolves the subject through '
  'hr.subject_employment_as_of, refuses when even the nearest spell does not exist, then defers '
  'to hr._l1_write_gate. Passing a raw NULL subject to that gate makes hr.capability skip '
  'population_contains, which is the defect this closes.';

---------------------------------------------------------------------------------------------
-- 3. THE SWAPS
---------------------------------------------------------------------------------------------
do $mig$
begin
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'hr' and p.proname = '_wf_instance_visible')
     ~ 'SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE' then
    raise notice 'hr_l1_64: already applied';
    return;
  end if;

  create or replace function pg_temp._swap(p_fn text, p_old text, p_new text, p_expect int)
  returns void language plpgsql as $swap$
  declare v_def text; v_cnt int;
  begin
    v_def := pg_get_functiondef(p_fn::regprocedure);
    v_cnt := (length(v_def) - length(replace(v_def, p_old, ''))) / length(p_old);
    if v_cnt <> p_expect then
      raise exception 'hr_l1_64: % — expected % occurrence(s) of the anchor, found %. REFUSING to '
                      'guess at a body that has moved underneath this migration.',
                      p_fn, p_expect, v_cnt;
    end if;
    execute replace(v_def, p_old, p_new);
  end $swap$;

  ------------------------------------------------------------------ hr._l1_viewer (the read side)
  -- the resolution now comes from the shared resolver, org-asserted (latent (b))
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'\n  v_emp := (hr.employment_as_of(p_employee_id, p_at)).id;\n',
    E'\n  v_emp := hr.subject_employment_as_of(p_employee_id, p_at, v_org);\n', 1);

  -- the inline fallback is retired: it now lives in hr.subject_employment_as_of, which every
  -- write door calls too. Leaving a copy here is exactly how the write half stayed open.
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'\n  if v_emp is null then\n'
    || E'    select em.id into v_emp\n'
    || E'      from hr.employment em\n'
    || E'     where em.employee_id = p_employee_id and em.deleted_at is null\n'
    || E'     order by (em.hire_date > p_at) desc,\n'
    || E'              case when em.hire_date > p_at then em.hire_date end asc nulls last,\n'
    || E'              em.hire_date desc\n'
    || E'     limit 1;\n'
    || E'  end if;\n',
    E'\n  -- 🚨 THE FALLBACK ITSELF NOW LIVES IN hr.subject_employment_as_of (hr_l1_64), because it\n'
    || E'  -- was inlined HERE and nowhere else — which is why ten write doors kept handing\n'
    || E'  -- hr.capability a NULL subject and skipping population_contains entirely for months\n'
    || E'  -- after hr_l1_61 "closed" it. One rule, one implementation, every door.\n', 1);

  -- 🚨 latent (a): an employee with NO spell at all leaves v_emp NULL even after the fallback,
  -- and a NULL subject makes hr.capability skip its population clause. Guard the three
  -- capability rungs on v_emp so an unestablished population refuses instead of granting.
  -- The org owner/admin rung below is untouched: that authority is not population-scoped.
  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'\n  elsif hr.capability(p_user, ''identity.read'', v_emp, p_at, v_org)\n'
    || E'        or hr.capability(p_user, ''working_record.write'', v_emp, p_at, v_org) then\n',
    E'\n  -- 🚨 AN UNRESOLVABLE SUBJECT REFUSES, IT DOES NOT FALL THROUGH (hr_l1_64, latent (a)).\n'
    || E'  elsif v_emp is not null\n'
    || E'        and (hr.capability(p_user, ''identity.read'', v_emp, p_at, v_org)\n'
    || E'             or hr.capability(p_user, ''working_record.write'', v_emp, p_at, v_org)) then\n',
    1);

  perform pg_temp._swap('hr._l1_viewer(uuid,uuid,date)',
    E'\n  elsif hr.capability(p_user, ''directory.read'', v_emp, p_at, v_org) or v_org_role is not null then\n',
    E'\n  elsif (v_emp is not null and hr.capability(p_user, ''directory.read'', v_emp, p_at, v_org))\n'
    || E'        or v_org_role is not null then\n', 1);

  ------------------------------------------------------------------ the EMPLOYEE-keyed write doors
  perform pg_temp._swap('public.hr_employee_update(uuid,jsonb,integer)',
    E'\n  v_emp := (hr.employment_as_of(p_employee_id, current_date)).id;\n',
    E'\n  -- 🚨 THE WRITE GATE ASKS THE POPULATION IT JUST REFUSED THE READ FOR (hr_l1_64).\n'
    || E'  -- hr.employment_as_of is NULL for a prehire and for an ex-employee, and hr.capability\n'
    || E'  -- skips population_contains outright on a NULL subject — so a department-scoped admin\n'
    || E'  -- REFUSED the read of this person was granted the WRITE in the same second. Resolved\n'
    || E'  -- and gated below through the one resolver the viewer uses.\n', 1);

  perform pg_temp._swap('public.hr_employee_update(uuid,jsonb,integer)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''identity.write'', v_emp, ''hr_employee'', ''update'');\n',
    E'\n  select g.gate, g.subject_employment into v_gate, v_emp\n'
    || E'    from hr._l1_subject_write_gate(v_org, ''identity.write'', p_employee_id,\n'
    || E'                                   ''hr_employee'', ''update'') g;\n', 1);

  perform pg_temp._swap('public.hr_employee_invite(uuid,text,timestamp with time zone)',
    E'\n  v_emp := (hr.employment_as_of(p_employee_id, current_date)).id;\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''identity.write'', v_emp, ''hr_employee'', ''invite'', ''login'');\n',
    E'\n  -- 🚨 THE WRITE GATE ASKS THE POPULATION IT JUST REFUSED THE READ FOR (hr_l1_64): an\n'
    || E'  -- invite to a prehire IS the ordinary case here, and it was the case with no scope.\n'
    || E'  select g.gate, g.subject_employment into v_gate, v_emp\n'
    || E'    from hr._l1_subject_write_gate(v_org, ''identity.write'', p_employee_id,\n'
    || E'                                   ''hr_employee'', ''invite'', ''login'') g;\n', 1);

  perform pg_temp._swap('public.hr_emergency_contact_upsert(jsonb)',
    E'\n  v_emp := (hr.employment_as_of(v_employee, current_date)).id;\n',
    E'\n  -- 🚨 resolved and gated below through hr._l1_subject_write_gate (hr_l1_64).\n', 1);

  perform pg_temp._swap('public.hr_emergency_contact_upsert(jsonb)',
    E'\n    v_gate := hr._l1_write_gate(v_org, ''identity.write'', v_emp, ''hr_emergency_contact'', ''update'');\n',
    E'\n    select g.gate, g.subject_employment into v_gate, v_emp\n'
    || E'      from hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,\n'
    || E'                                     ''hr_emergency_contact'', ''update'') g;\n', 1);

  perform pg_temp._swap('public.hr_emergency_contact_remove(uuid)',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_employee uuid; v_self boolean; v_gate jsonb;\n',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_employee uuid; v_self boolean; v_gate jsonb;\n'
    || E'        v_subject uuid;\n', 1);

  perform pg_temp._swap('public.hr_emergency_contact_remove(uuid)',
    E'\n    v_gate := hr._l1_write_gate(v_org, ''identity.write'', null, ''hr_emergency_contact'', ''delete'');\n',
    E'\n    -- 🚨 THE SUBJECT WAS ONE COLUMN AWAY AND THE GATE WAS HANDED A LITERAL NULL (hr_l1_64).\n'
    || E'    select g.gate, g.subject_employment into v_gate, v_subject\n'
    || E'      from hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,\n'
    || E'                                     ''hr_emergency_contact'', ''delete'') g;\n', 1);

  perform pg_temp._swap('public.hr_external_identity_upsert(jsonb)',
    E'\n  v_org uuid; v_gate jsonb; v_id uuid;\n',
    E'\n  v_org uuid; v_gate jsonb; v_id uuid; v_subject uuid;\n', 1);

  perform pg_temp._swap('public.hr_external_identity_upsert(jsonb)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''identity.write'', null, ''hr_external_identity'', ''update'');\n',
    E'\n  -- 🚨 THE SUBJECT WAS ONE COLUMN AWAY AND THE GATE WAS HANDED A LITERAL NULL (hr_l1_64).\n'
    || E'  select g.gate, g.subject_employment into v_gate, v_subject\n'
    || E'    from hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,\n'
    || E'                                   ''hr_external_identity'', ''update'') g;\n', 1);

  ------------------------------------------------------------ the EMPLOYMENT-keyed write doors
  -- These already hold an employment id. They pass it — exactly the one-argument change hr_l1_62
  -- made to the queue. An incident with no subject has no population to evaluate and stays on the
  -- org rung, which is hr_l1_62's stranding rule and is not revisited.
  perform pg_temp._swap('public.hr_incident_create(jsonb)',
    E'\n  v_gate jsonb; v_id uuid; v_kind text := p_payload ->> ''incident_kind'';\n',
    E'\n  v_gate jsonb; v_id uuid; v_kind text := p_payload ->> ''incident_kind'';\n'
    || E'  v_subject uuid := nullif(p_payload ->> ''subject_employment_id'','''')::uuid;\n', 1);

  perform pg_temp._swap('public.hr_incident_create(jsonb)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', null, ''hr_incident'', ''create'',\n'
    || E'                              ''incident_intake'');\n',
    E'\n  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). The reporter\n'
    || E'  -- lane below is UNCHANGED: an ordinary employee still files a report about anyone.\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', v_subject, ''hr_incident'', ''create'',\n'
    || E'                              ''incident_intake'');\n', 1);

  perform pg_temp._swap('public.hr_incident_advance(uuid,text,jsonb)',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_cur text;\n',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_cur text; v_subject uuid;\n', 1);

  perform pg_temp._swap('public.hr_incident_advance(uuid,text,jsonb)',
    E'\n  select i.organization_id, i.state into v_org, v_cur from hr.incident i\n',
    E'\n  select i.organization_id, i.state, i.subject_employment_id into v_org, v_cur, v_subject\n'
    || E'    from hr.incident i\n', 1);

  perform pg_temp._swap('public.hr_incident_advance(uuid,text,jsonb)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', null, ''hr_incident'', ''update'',\n'
    || E'                              ''investigation'');\n',
    E'\n  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64).\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', v_subject, ''hr_incident'', ''update'',\n'
    || E'                              ''investigation'');\n', 1);

  perform pg_temp._swap('public.hr_incident_assign(uuid,uuid,text)',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_excluded boolean; v_login uuid;\n',
    E'\ndeclare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_excluded boolean; v_login uuid;\n'
    || E'        v_subject uuid;\n', 1);

  perform pg_temp._swap('public.hr_incident_assign(uuid,uuid,text)',
    E'\n  select i.organization_id into v_org from hr.incident i\n',
    E'\n  select i.organization_id, i.subject_employment_id into v_org, v_subject from hr.incident i\n',
    1);

  perform pg_temp._swap('public.hr_incident_assign(uuid,uuid,text)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', null, ''hr_incident'', ''update'',\n'
    || E'                              ''investigation'');\n',
    E'\n  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). The population\n'
    || E'  -- question is about the SUBJECT of the case, never about the assignee being routed to it.\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', v_subject, ''hr_incident'', ''update'',\n'
    || E'                              ''investigation'');\n', 1);

  perform pg_temp._swap('public.hr_incident_party_add(jsonb)',
    E'\n  v_org uuid; v_gate jsonb; v_id uuid; v_role text := p_payload ->> ''party_role'';\n',
    E'\n  v_org uuid; v_gate jsonb; v_id uuid; v_role text := p_payload ->> ''party_role'';\n'
    || E'  v_subject uuid;\n', 1);

  perform pg_temp._swap('public.hr_incident_party_add(jsonb)',
    E'\n  select i.organization_id into v_org from hr.incident i\n',
    E'\n  select i.organization_id, i.subject_employment_id into v_org, v_subject from hr.incident i\n',
    1);

  perform pg_temp._swap('public.hr_incident_party_add(jsonb)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', null, ''hr_incident_party'', ''create'',\n'
    || E'                              ''investigation'');\n',
    E'\n  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64) — the subject\n'
    || E'  -- of the case, not the party being added, who may be a witness from anywhere.\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', v_subject, ''hr_incident_party'', ''create'',\n'
    || E'                              ''investigation'');\n', 1);

  perform pg_temp._swap('public.hr_restricted_note_add(jsonb)',
    E'\n  v_subject uuid := (p_payload ->> ''subject_id'')::uuid;\n',
    E'\n  v_subject uuid := (p_payload ->> ''subject_id'')::uuid; v_subject_emp uuid;\n', 1);

  perform pg_temp._swap('public.hr_restricted_note_add(jsonb)',
    E'\n  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', null, ''hr_restricted_note'', ''create'',\n'
    || E'                              ''investigation'');\n',
    E'\n  -- 🚨 THE NOTE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). The subject is\n'
    || E'  -- polymorphic, so it is resolved to an employment where one exists — through the ONE\n'
    || E'  -- resolver, never a second copy of the rule. A subject_token with no person behind it has\n'
    || E'  -- no population to evaluate and stays on the org rung (hr_l1_62''s stranding ruling).\n'
    || E'  v_subject_emp := case\n'
    || E'    when v_subject_token = ''hr_incident''\n'
    || E'      then (select i.subject_employment_id from hr.incident i where i.id = v_subject)\n'
    || E'    when v_subject_token = ''hr_employment'' then v_subject\n'
    || E'    when v_subject_token = ''hr_employee''\n'
    || E'      then hr.subject_employment_as_of(v_subject, current_date, v_org)\n'
    || E'    else null end;\n'
    || E'  v_gate := hr._l1_write_gate(v_org, ''incident.investigate'', v_subject_emp, ''hr_restricted_note'',\n'
    || E'                              ''create'', ''investigation'');\n', 1);

  ------------------------------------------------------ the PER-INSTANCE workflow door (DEFECT 1B)
  perform pg_temp._swap('hr._wf_instance_visible(uuid,uuid)',
    E'\n      or hr.capability(p_user, ''workflow.view_queue'', null, current_date, inst.organization_id);\n',
    E'\n      -- 🚨 SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE (hr_l1_62, extended to the\n'
    || E'      -- PER-INSTANCE door by hr_l1_64). hr_l1_62 scoped the queue LIST and stopped there, so\n'
    || E'      -- both items a department-scoped admin''s queue correctly WITHHELD stayed fully readable\n'
    || E'      -- by uuid — granted:true, the subject''s name, and the change diff. A list that hides\n'
    || E'      -- what the door hands over is not a scope. The four standings above are IDENTITY facts\n'
    || E'      -- and are untouched; only this capability arm narrows, and it narrows by asking THE SAME\n'
    || E'      -- predicate hr.wf_inbox asks about the same item. An instance with NO subject has no\n'
    || E'      -- population to evaluate and stays on the affordance rung — identical to the list, or\n'
    || E'      -- the two would disagree about one item, which is how this defect was born.\n'
    || E'      or hr.capability(p_user, ''workflow.view_queue'', inst.subject_employment_id,\n'
    || E'                       current_date, inst.organization_id);\n', 1);
end $mig$;

---------------------------------------------------------------------------------------------
-- 3b. THE STAMP CORRECTION — because this file was applied under TWO names
--
-- 🚨 THIS BLOCK EXISTS BECAUSE OF A REAL SHARED-CHECKOUT RACE, AND SAYING SO IS THE POINT.
-- This migration was first written as `hr_l1_63`, and a concurrent process in this shared
-- checkout committed and applied it under that name before the number was found to collide with
-- another agent's in-flight `hr_l1_63_the_derivation_reads_dates_not_a_stale_enum`. It was
-- renumbered to `hr_l1_64` and applied again — but the second apply hit the idempotence guard
-- above and skipped every swap, so the STAMPS inside the twelve swapped bodies still read
-- `hr_l1_63`: pointing a future reader at an unrelated migration about directory status.
-- A comment that names the wrong migration is worse than no comment, because it will be believed.
-- The two functions CREATED by this file (not swapped) already carry the right number.
--
-- This block is occurrence-checked exactly like the swaps and is a no-op on a clean apply.
do $stamp$
declare r record; v_def text; v_cnt int; v_fixed int := 0;
begin
  for r in
    select p.oid::regprocedure::text as sig,
           (length(p.prosrc) - length(replace(p.prosrc, 'hr_l1_63', ''))) / 8 as hits
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where (n.nspname = 'hr' and p.proname in ('_l1_viewer', '_wf_instance_visible'))
        or (n.nspname = 'public' and p.proname in (
              'hr_employee_update', 'hr_employee_invite', 'hr_emergency_contact_upsert',
              'hr_emergency_contact_remove', 'hr_external_identity_upsert',
              'hr_restricted_note_add', 'hr_incident_create', 'hr_incident_advance',
              'hr_incident_assign', 'hr_incident_party_add'))
  loop
    if r.hits = 0 then
      continue;                          -- clean apply, or already corrected
    end if;
    v_def := pg_get_functiondef(r.sig::regprocedure);
    -- 🚨 REFUSE TO REWRITE A SENTENCE THAT MAY BELONG TO ANOTHER MIGRATION. Two conditions,
    -- both required: the body must carry a marker only THIS migration writes, and it must NOT
    -- name the other hr_l1_63 by its full filename stem. The other hr_l1_63 touched
    -- employee_directory_status / hr_directory_list / hr_employee_profile / hr_org_summary /
    -- hr_employee_create — none of which is in the loop's allowlist above — so a hit here that
    -- fails either condition means the world has moved and a human should look.
    v_cnt := (length(v_def) - length(replace(v_def, 'hr_l1_63_', ''))) / 9;
    if v_cnt > 0 or v_def !~ 'subject_employment_as_of|_l1_subject_write_gate|v_subject|inst\.subject_employment_id' then
      raise exception 'hr_l1_64 stamp correction: % carries % hr_l1_63 reference(s) that are not '
                      'recognisably this migration''s own. REFUSING to rewrite them.',
                      r.sig, r.hits;
    end if;
    execute replace(v_def, 'hr_l1_63', 'hr_l1_64');
    v_fixed := v_fixed + 1;
  end loop;
  raise notice 'hr_l1_64 stamp correction: % function(s) restamped', v_fixed;
end $stamp$;

---------------------------------------------------------------------------------------------
-- 4. THE CONTRACTS — every function touched is pinned so a re-emit cannot reopen the population
---------------------------------------------------------------------------------------------
-- hr_l1_61 pinned the nearest-spell ORDERING inside hr._l1_viewer. That text now lives in
-- hr.subject_employment_as_of (and is pinned there), so the clause is re-pointed rather than left
-- to fail. The rest of hr_l1_61's viewer contract — its comment anchor — still holds untouched.
update hr.function_contract
   set must_contain = array['AN UNESTABLISHED POPULATION IS NOT MEMBERSHIP']
 where home_migration = 'hr_l1_61_an_unestablished_population_is_not_membership.sql'
   and schema_name = 'hr' and function_name = '_l1_viewer';

insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason)
values
  ('hr', 'subject_employment_as_of',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['case when em.hire_date > p_at then em.hire_date end asc nulls last',
         'THE RESOLVED SPELL MUST BELONG TO THE EMPLOYEE''S OWN EMPLOYER',
         'em.organization_id = p_organization_id'],
   array[]::text[],
   'The ONE implementation of the nearest-spell rule. hr_l1_61 inlined it in hr._l1_viewer only, '
   || 'and ten write doors kept handing hr.capability a raw NULL subject — which skips '
   || 'population_contains entirely, so a department-scoped admin refused the READ of a prehire or '
   || 'an ex-employee was granted the WRITE in the same second. Deleting the fallback restores a '
   || 'blank cheque at eleven call sites at once; deleting the organization assertion lets a '
   || 'mismatched employment row move the tenant the capability is evaluated in.'),

  ('hr', '_l1_subject_write_gate',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr.subject_employment_as_of(p_employee_id, current_date, p_org)',
         'unresolvable_subject:',
         'hr._l1_write_gate(p_org, p_capability, subject_employment'],
   array[]::text[],
   'The employee-keyed write gate. It must RESOLVE the subject (never pass NULL through) and must '
   || 'REFUSE when even the nearest spell does not exist — an unevaluable population is not a '
   || 'scope. It adds no rule: the resolution is hr.subject_employment_as_of and the decision is '
   || 'hr._l1_write_gate. Re-deriving either here is how the two drift apart.'),

  ('hr', '_l1_viewer',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr.subject_employment_as_of(p_employee_id, p_at, v_org)',
         'AN UNRESOLVABLE SUBJECT REFUSES, IT DOES NOT FALL THROUGH',
         'elsif v_emp is not null'],
   array['(hr.employment_as_of(p_employee_id, p_at)).id'],
   'The viewer resolves through the shared resolver, org-asserted, and its capability rungs are '
   || 'guarded on v_emp: an employee with no employment row at all leaves the subject NULL even '
   || 'after the fallback, and a NULL subject makes hr.capability skip population_contains. '
   || 'Reinstating the raw hr.employment_as_of call, or dropping the guards, reopens the read half.'),

  ('hr', '_wf_instance_visible',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['SCOPE MEANS SCOPE WHEREVER THE POPULATION IS EVALUABLE',
         'hr.capability(p_user, ''workflow.view_queue'', inst.subject_employment_id,'],
   array['hr.capability(p_user, ''workflow.view_queue'', null, current_date, inst.organization_id)'],
   'hr_l1_62 scoped the queue LIST but not this per-instance door, so both items a '
   || 'department-scoped admin''s queue withheld stayed fully readable by uuid, change diff '
   || 'included. The door must ask the SAME predicate the list asks, about the item''s own '
   || 'subject. Passing null here restores an org-wide door under a scoped list.'),

  ('public', 'hr_employee_update',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr._l1_subject_write_gate(v_org, ''identity.write'', p_employee_id,'],
   array['(hr.employment_as_of(p_employee_id, current_date)).id'],
   'PROVEN end-to-end: a department-scoped admin refused the READ of a prehire and of an '
   || 'ex-employee was GATE PASSED on the write. The door must resolve the subject and gate on it.'),

  ('public', 'hr_employee_invite',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr._l1_subject_write_gate(v_org, ''identity.write'', p_employee_id,'],
   array['(hr.employment_as_of(p_employee_id, current_date)).id'],
   'Inviting a PREHIRE is this door''s ordinary case, and it was the case with no population '
   || 'bound at all — the raw hr.employment_as_of resolves to NULL for exactly that person.'),

  ('public', 'hr_emergency_contact_upsert',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,'],
   array['(hr.employment_as_of(v_employee, current_date)).id'],
   'PROVEN end-to-end alongside hr_employee_update. Same shape, same raw NULL subject.'),

  ('public', 'hr_emergency_contact_remove',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,'],
   array['hr._l1_write_gate(v_org, ''identity.write'', null, ''hr_emergency_contact'', ''delete'')'],
   'A literal null subject with v_employee one column away. Deleting somebody''s emergency '
   || 'contacts is a write about that person and must be scoped to them.'),

  ('public', 'hr_external_identity_upsert',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr._l1_subject_write_gate(v_org, ''identity.write'', v_employee,'],
   array['hr._l1_write_gate(v_org, ''identity.write'', null, ''hr_external_identity'', ''update'')'],
   'A literal null subject with v_employee one column away. An external identity is a person''s '
   || 'identity in another system; writing it is a write about them.'),

  ('public', 'hr_incident_create',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['''incident.investigate'', v_subject, ''hr_incident'', ''create'''],
   array['''incident.investigate'', null, ''hr_incident'', ''create'''],
   'The investigation capability must be asked about the case''s SUBJECT. The reporter lane below '
   || 'the gate is deliberately unchanged: intake is open to any employee, investigation is not.'),

  ('public', 'hr_incident_advance',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['i.subject_employment_id into v_org, v_cur, v_subject',
         '''incident.investigate'', v_subject, ''hr_incident'', ''update'''],
   array['''incident.investigate'', null, ''hr_incident'', ''update'''],
   'Advancing a case — including closing it and starting the retention clock — is a write about '
   || 'the person the case is about, and must be scoped to them.'),

  ('public', 'hr_incident_assign',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['i.subject_employment_id into v_org, v_subject',
         '''incident.investigate'', v_subject, ''hr_incident'', ''update'''],
   array['''incident.investigate'', null, ''hr_incident'', ''update'''],
   'The population question is about the SUBJECT of the case, never about the assignee being '
   || 'routed to it — routing an investigator is a write about the person investigated.'),

  ('public', 'hr_incident_party_add',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['i.subject_employment_id into v_org, v_subject',
         '''incident.investigate'', v_subject, ''hr_incident_party'', ''create'''],
   array['''incident.investigate'', null, ''hr_incident_party'', ''create'''],
   'Adding a party writes into somebody''s case file. The subject of the case bounds it, not the '
   || 'party being added, who may be a witness from anywhere in the employer.'),

  ('public', 'hr_restricted_note_add',
   'hr_l1_64_the_write_gate_asks_the_population_it_refused_the_read_for.sql',
   array['hr.subject_employment_as_of(v_subject, current_date, v_org)',
         '''incident.investigate'', v_subject_emp, ''hr_restricted_note'''],
   array['''incident.investigate'', null, ''hr_restricted_note'', ''create'''],
   'A restricted note is the most sensitive record in the domain and its gate was handed a '
   || 'literal null subject. The polymorphic subject is resolved to an employment where one '
   || 'exists — through the one resolver, never a second copy of the rule.')

on conflict (schema_name, function_name, home_migration) do update
  set must_contain = excluded.must_contain, must_not_contain = excluded.must_not_contain,
      reason = excluded.reason, is_active = true;

---------------------------------------------------------------------------------------------
-- 4b. AND THE DUPLICATE CONTRACT SET FROM THE FIRST APPLY IS DELETED, NOT LEFT "FOR SAFETY"
--
-- The same double-apply described in §3b also inserted this migration's fourteen contract rows
-- under its retired filename. They are exact duplicates of the rows above and they are currently
-- satisfied, so they raise nothing today — which is what makes them dangerous. A contract row
-- names the migration that OWNS a clause, and `hr_l1_63_the_write_gate_…sql` does not exist: the
-- day one of these clauses legitimately changes, the guard would go red and send the next agent
-- hunting for a file that was never on disk. Two contract rows for one clause is not redundancy,
-- it is a second source of truth. Scoped to this migration's own former name only.
---------------------------------------------------------------------------------------------
delete from hr.function_contract
 where home_migration = 'hr_l1_63_the_write_gate_asks_the_population_it_refused_the_read_for.sql';

---------------------------------------------------------------------------------------------
-- 5. EVERY CONTRACT, INCLUDING EVERY EARLIER MIGRATION'S, MUST SURVIVE THIS ONE
---------------------------------------------------------------------------------------------
do $verify$
declare v_broken int; v_bad text;
begin
  select count(*), string_agg(qname || ' / ' || clause || ' / ' || missing_or_present, '; ')
    into v_broken, v_bad from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_64: % contract clause(s) broken after apply (including every earlier '
                    'migration''s, which must survive this one): %', v_broken, v_bad;
  end if;
end $verify$;

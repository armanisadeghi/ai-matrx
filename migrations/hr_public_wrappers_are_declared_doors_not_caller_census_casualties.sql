-- hr_public_wrappers_are_declared_doors_not_caller_census_casualties — 2026-09-18
--
-- THE FINDING. `pnpm check:hr-punch-write-path:strict` (CI job "HR punch write path", BLOCKING)
-- reports 30 `public.hr_*` wrappers as "authenticated cannot execute". Every one is SECURITY
-- DEFINER, carries no `platform.client_callable_door` row, and has the ACL
-- `{postgres=X, service_role=X}` — no client role at all.
--
-- THE ROOT CAUSE — TWO GUARDS, TWO RULES, ONE COLLISION. DD-169 batch 3 (2026-09-13,
-- dd169_batch3_public_c / _d) triaged the 608 grandfathered signed-in definers by ONE test: a
-- client call site in any of the four repos. Doors with a caller were DECLARED; doors without one
-- were CLOSED ("revoke execute … from public, anon, authenticated"). These 30 had no caller, so they
-- were closed. But hr_l3_15 (check 12, `client_doors_well_formed`) rules that every `public.hr_*`
-- wrapper IS a client door — `hr` is not PostgREST-exposed, so the public wrapper is the only way a
-- browser can reach HR at all — and demands authenticated EXECUTE on every one. Both rules are right
-- about what they measure; they disagree about what a caller-less HR wrapper means. Since 13:00Z on
-- 2026-09-13 the answer has been "CI is red on every run" — the guard working, and nobody deciding.
--
-- THE DECISION. A caller-less `public.hr_*` wrapper is a door built AHEAD OF ITS SURFACE, not a
-- dead one (common-docs/policies/unfinished-work-alarm.md): hr_l3_15's own header records that the
-- HR client routes were mock-backed and the doors were built for them; `features/hr/**/mock/` is
-- still where those surfaces read from. hr_l5_11 wrote the rule that decides the class:
--     "A public.hr_* wrapper is NOT automatically a client door. There are two kinds, and they are
--      told apart by ONE question — is a human allowed to ask for this? A CLIENT DOOR is granted to
--      authenticated and its FIRST job, before it reads anything, is to decide whether this caller may."
-- All 30 are human actions (delegate authority, upsert a calendar, open a leave case, assign a role,
-- mint an investigation token, request/submit/publish a workflow, …), and 29 of the 30 already decide
-- access first — `platform.definer_body_decides_access(oid)` is TRUE for each, through
-- hr.arm_write / hr.capability / hr._l1_settings_gate / hr._leave_case_rung / hr._leave_admin_rung /
-- hr._l1_org_role, or through the hr.* body a thin wrapper delegates to (measured 2026-09-18). The
-- 30th, `public.hr_time_rounding_config_check`, decided NOTHING: a SECURITY DEFINER taking a
-- p_organization_id that read that organization's locations and jurisdictions for any caller. It is
-- given the same standing test `hr.resolve_rules_display` already uses, in this file, BEFORE its
-- grant — the hr_l5_11 class, fixed as part of declaring the door rather than re-granted blind.
--
-- So: every one of the 30 is DECLARED (a door row carrying the literal its body gates on, which D6
-- asserts is still there on every run), then granted to `authenticated`; anon holds nothing and is asserted so.
-- The door rows say plainly that no client calls them yet and who adopts them.
--
-- WHAT THIS DOES NOT DO. It does not touch the 13 SECURITY INVOKER `hr_wf_*` doors (Core C4's
-- grandfathered ratchet in check 12), and it does not change any body except the one that decided
-- nothing. The next DD-169-style sweep that closes a `public.hr_*` wrapper on call-site count alone
-- will turn this CI job red again within the hour — that is the guard, not a defect in it.
--
-- based-on: public.hr_time_rounding_config_check(uuid, integer, text, text[], date) e89813a54b9df7b82259d2faae7619c1f4bd564fb87189d78f84b938b53bd3ca

set local lock_timeout = '10s';

-- 1. The doors, declared BEFORE any grant (db-rules §6d-4: the grant does not stick otherwise).
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, gate_predicate, reason)
select v.fn_schema, v.fn_name, v.args, 'hr_public_wrappers_are_declared_doors (2026-09-18)', v.gate,
       format('Signed-in HR door, re-declared 2026-09-18. DD-169 batch 3 (2026-09-13) closed it because no client '
           || 'call site existed yet; hr_l3_15 check 12 rules every public.hr_* wrapper a client door and CI has '
           || 'been red on the disagreement since. The HR client surface it serves is still mock-backed, so the '
           || 'door was built ahead of its caller, not abandoned (unfinished-work-alarm). SECURITY DEFINER; the '
           || 'body decides access FIRST through `%s` — that literal is what D6 asserts is still there. No live '
           || 'client caller as of 2026-09-18; the HR lane adopts it when the surface leaves the mock registry. '
           || '`anon` holds no EXECUTE on it.', v.gate)
from (values
  ('public','hr_authority_delegate','p_delegation_id uuid','hr.arm_write'),
  ('public','hr_authority_delegation_end','p_delegation_id uuid, p_reason text','hr.capability'),
  ('public','hr_authority_delegation_request','p_authority_id uuid, p_delegate_employment_id uuid, p_effective_from date, p_effective_to date, p_reason text','hr.arm_write'),
  ('public','hr_authority_revoke','p_authority_id uuid, p_reason text','hr.capability'),
  ('public','hr_calendar_upsert','p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_code_upsert','p_kind text, p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_emergency_contact_remove','p_id uuid','hr.arm_write'),
  ('public','hr_employee_grant_missing_membership','p_employee_id uuid','hr.capability'),
  ('public','hr_employer_profile_update','p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_establishment_upsert','p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_holiday_upsert','p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_incident_assign','p_incident_id uuid, p_employment_id uuid, p_reason text','hr.arm_write'),
  ('public','hr_leave_case_entitlement','p_case_id uuid, p_as_of date','hr._leave_case_rung'),
  ('public','hr_leave_case_get','p_case_id uuid','hr.leave_case_get'),
  ('public','hr_leave_case_list','p_organization_id uuid','hr.leave_case_list'),
  ('public','hr_leave_case_open','p_employment_id uuid, p_case_kind text, p_continuity text, p_starts_on date, p_entitlement_hours numeric, p_entitlement_measure text, p_expected_return_on date, p_runs_concurrent_with_pto boolean, p_concurrent_policy_ids uuid[], p_leave_request_id uuid','hr.leave_case_open'),
  ('public','hr_leave_policy_deactivate','p_leave_policy_id uuid, p_disposition text, p_migrate_to_policy_id uuid, p_note text','hr.leave_policy_deactivate'),
  ('public','hr_mint_investigation_token','p_incident_id uuid, p_investigator_email text, p_investigator_name text, p_reason text','hr.capability'),
  ('public','hr_mint_records_request_token','p_request_id uuid, p_delivery_address text, p_scope text[], p_reason text','hr.capability'),
  ('public','hr_reporting_line_upsert','p_payload jsonb','hr.arm_write'),
  ('public','hr_resolve_rules','p_organization_id uuid, p_jurisdiction_key text, p_as_of date, p_classes text[]','hr.resolve_rules_display'),
  ('public','hr_role_assign','p_employment_id uuid, p_role_key text, p_scope_kind text, p_scope_id uuid, p_scope_employment_ids uuid[], p_effective_from date, p_effective_to date, p_reason text','hr.capability'),
  ('public','hr_role_revoke','p_assignment_id uuid, p_reason text','hr.capability'),
  ('public','hr_structure_deactivate','p_kind text, p_id uuid','hr._l1_settings_gate'),
  ('public','hr_tax_registration_upsert','p_payload jsonb','hr._l1_settings_gate'),
  ('public','hr_time_rounding_config_check','p_organization_id uuid, p_rounding_minutes integer, p_rounding_mode text, p_jurisdiction_keys text[], p_as_of date','hr._l1_org_role'),
  ('public','hr_transfer','p_payload jsonb','public.hr_position_change'),
  ('public','hr_wf_publish_definition','p_definition_id uuid','hr.wf_publish_definition'),
  ('public','hr_wf_request','p_flow_key text, p_target_token text, p_target_id uuid, p_organization_id uuid, p_payload jsonb, p_subject_employment_id uuid, p_as_draft boolean, p_idempotency_key text','hr.wf_request'),
  ('public','hr_wf_submit','p_instance_id uuid','hr.wf_submit')
) as v(fn_schema, fn_name, args, gate)
where not exists (
  select 1 from platform.client_callable_door d
   where d.schema_name = v.fn_schema and d.function_name = v.fn_name and d.identity_args = v.args);

-- 2. The one wrapper that decided nothing. Same standing test hr.resolve_rules_display uses: an
--    organization role, or an employment login, in the employer named — before the first read.
create or replace function public.hr_time_rounding_config_check(
  p_organization_id uuid, p_rounding_minutes integer, p_rounding_mode text,
  p_jurisdiction_keys text[] default null::text[], p_as_of date default null::date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'hr_time_rounding_config_check: no authenticated caller' using errcode = '42501';
  end if;
  if p_organization_id is null then
    return jsonb_build_object('granted', false, 'reason', 'organization_id_required',
      'detail', 'NO NULL ORG: a configuration check is always about one organization''s settings');
  end if;
  -- Standing first, existence second: a foreign employer and an invented one answer identically.
  if hr._l1_org_role(v_uid, p_organization_id, false) is null
     and not exists (select 1 from hr.employment e
                      where e.organization_id = p_organization_id
                        and e.login_user_id = v_uid and e.deleted_at is null) then
    raise exception 'hr_time_rounding_config_check: no standing in this employer' using errcode = '42501';
  end if;
  return hr.time_rounding_config_check(p_organization_id, p_rounding_minutes, p_rounding_mode,
                                       p_jurisdiction_keys, p_as_of);
end
$function$;

-- 3. The grants. Declared above, so they stick; anon never held one and never will (the proof below asserts it).
do $grants$
declare r record;
begin
  for r in
    select p.oid::regprocedure::text as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'hr_authority_delegate','hr_authority_delegation_end','hr_authority_delegation_request',
         'hr_authority_revoke','hr_calendar_upsert','hr_code_upsert','hr_emergency_contact_remove',
         'hr_employee_grant_missing_membership','hr_employer_profile_update','hr_establishment_upsert',
         'hr_holiday_upsert','hr_incident_assign','hr_leave_case_entitlement','hr_leave_case_get',
         'hr_leave_case_list','hr_leave_case_open','hr_leave_policy_deactivate',
         'hr_mint_investigation_token','hr_mint_records_request_token','hr_reporting_line_upsert',
         'hr_resolve_rules','hr_role_assign','hr_role_revoke','hr_structure_deactivate',
         'hr_tax_registration_upsert','hr_time_rounding_config_check','hr_transfer',
         'hr_wf_publish_definition','hr_wf_request','hr_wf_submit')
  loop
    -- anon and PUBLIC hold nothing on any of these (ACL {postgres, service_role}, measured
    -- 2026-09-18), so the only statement needed is the grant that now sticks.
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $grants$;

-- 4. Proof, in the same transaction: every one of the 30 is now a well-formed door, and check 12 is
--    green again. A partial result is a failed migration.
do $proof$
declare v_bad text; v_ok boolean; v_n int;
begin
  select string_agg(p.proname, ', ' order by p.proname), count(*) into v_bad, v_n
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in (
       'hr_authority_delegate','hr_authority_delegation_end','hr_authority_delegation_request',
       'hr_authority_revoke','hr_calendar_upsert','hr_code_upsert','hr_emergency_contact_remove',
       'hr_employee_grant_missing_membership','hr_employer_profile_update','hr_establishment_upsert',
       'hr_holiday_upsert','hr_incident_assign','hr_leave_case_entitlement','hr_leave_case_get',
       'hr_leave_case_list','hr_leave_case_open','hr_leave_policy_deactivate',
       'hr_mint_investigation_token','hr_mint_records_request_token','hr_reporting_line_upsert',
       'hr_resolve_rules','hr_role_assign','hr_role_revoke','hr_structure_deactivate',
       'hr_tax_registration_upsert','hr_time_rounding_config_check','hr_transfer',
       'hr_wf_publish_definition','hr_wf_request','hr_wf_submit')
     and (not p.prosecdef
          or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
          or has_function_privilege('anon', p.oid, 'EXECUTE')
          or not exists (select 1 from platform.client_callable_door d
                          where d.schema_name = 'public' and d.function_name = p.proname
                            and d.identity_args = pg_get_function_identity_arguments(p.oid)
                            and d.signed_in_callers and not d.anonymous_callers));
  if v_n > 0 then
    raise exception 'hr_public_wrappers: % wrapper(s) still not a well-formed signed-in door: %', v_n, v_bad;
  end if;
  if not platform.definer_body_decides_access('public.hr_time_rounding_config_check'::regproc) then
    raise exception 'hr_public_wrappers: hr_time_rounding_config_check still decides nothing';
  end if;
  select ok into v_ok from hr.punch_write_path_conformance() where check_key = 'client_doors_well_formed';
  if v_ok is distinct from true then
    raise exception 'hr_public_wrappers: hr.punch_write_path_conformance() check client_doors_well_formed is still RED';
  end if;
end $proof$;

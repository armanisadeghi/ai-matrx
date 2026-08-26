-- HR domain L1 — migration 4 of 6 (register item HRB-013, lane l1-employees).
--
-- EMPLOYEE RELATIONS (§1a) AND VERIFICATION LETTERS. hr_relations_list, hr_incident_create,
-- hr_incident_party_add, hr_incident_advance, hr_incident_assign, hr_restricted_note_add,
-- hr_corrective_action_issue, hr_corrective_action_outcome, hr_verification_request_create,
-- hr_verification_consent, hr_verification_deny, hr_verification_deliver,
-- hr_verification_generate_apply.
--
-- Authority: SPEC-EMPLOYEES §2.2 r15/r16/r17, §4.8, §4.9, §4.9b; SPEC-ACCESS §5; R-L1 items A9, A5.
-- Applied live as `hr_l1_04_relations_and_verification`. Idempotent.
--
-- ===================================================================================
-- 🚨 RECORDED TECHNICAL DECISION 15 — THE VETO IS THE TRIGGERS', AND THIS FILE MUST NOT RE-IMPLEMENT IT.
--
-- `hr.incident.excluded_actor_ids` is re-materialized by the LIVE triggers
-- `hr._incident_excluded_actors_refresh` and `hr._incident_party_redrive_veto`, and
-- `hr.incident_excluded(p_user, p_incident)` is the predicate the audited doors evaluate LAST —
-- after every allow lane, overriding `incident.read`, `hr_owner` and break-glass. §4.9b requires
-- that adding an `accused` party re-materializes the set **in the same transaction**, and it does:
-- the trigger fires on the party insert, so the new respondent loses reach on their very next
-- request, including when they are the current viewer.
--
-- Every read below therefore goes through `hr._door_list` / `hr._door_get` (via
-- `hr_restricted_list` / `hr_restricted_get`) and NEVER selects from `hr.incident` directly.
-- A second evaluation of the veto in this file would be a second place for it to be wrong.
--
-- 🚨 RECORDED TECHNICAL DECISION 16 — A PER-VIEWER RESULT COUNT IS CORRECT HERE.
-- §2.2 r15: an excluded row is not in the result set AND ITS COUNT IS NOT IN THE TOTAL. Two
-- viewers of the same list legitimately see different totals. `hr_relations_list` therefore counts
-- what the door returned and must never be "fixed" with a server-side cache or a pre-computed
-- total — that optimisation is the leak.
--
-- 🚨 RECORDED TECHNICAL DECISION 17 — TWO DOORS, ONE RECORD (Arman's Q4 ruling, R-L1 §F).
-- `coaching` is a conversation, not discipline. A manager who has to open something called
-- *Corrective Action* to record a good coaching conversation simply will not record it — which is
-- exactly how undocumented discipline happens. `hr_corrective_action_issue` accepts an `entry_door`
-- of `coaching` | `corrective_action` and stamps it on the row's metadata so the surface can render
-- the warm door and the formal door over ONE table. Complaints and injuries stay clinical and
-- evidentiary; softening that tone would be a mistake.
--
-- 🚨 RECORDED TECHNICAL DECISION 18 — `esign` IS ABSENT FOR A SUBJECT WITH NO LOGIN (R-L1 U10).
-- SPEC-ACCESS T-17 forbids any flow from assuming `login_user_id IS NOT NULL`, and kiosk-only
-- staff are first-class. A corrective action against someone with no login has no lane to the
-- document they are being asked to sign, so `hr_corrective_action_issue` REFUSES an `esign`
-- acknowledgment kind for such a subject and names the two that work — `wet_signature` and
-- `verbal_witnessed`. The issuance form reads the same fact and offers only those two; `esign` is
-- absent, not disabled, and the printed copy is the delivery. `refused` stays a valid outcome for
-- both paths.
--
-- 🚨 RECORDED TECHNICAL DECISION 19 — THE ANONYMOUS INTAKE CHANNEL IS NOT OFFERED (R-L1 U2).
-- §4.9b's anonymous lane needs an outsider-token purpose family (`anonymous_report`) that
-- SPEC-ESIGN §5.6 replaced with `candidate_portal` / `referee`. The ESCALATION half was since
-- fixed — `public.hr_mint_investigation_token` is live, so an accused `hr_owner` can be escalated
-- around. The anonymous half is not. `hr_incident_create` accepts `reported_anonymously` for the
-- HR-entered walk-in (which works: HR is the authenticated writer and simply records no reporter),
-- and the knob `hr.relations.incident_intake_channels` ships `["in_app"]`. A door with no lane
-- behind it is worse than an absent door.
-- ===================================================================================

set local statement_timeout = '600s';
set local lock_timeout = '20s';

-- ============================================================ hr_relations_list

-- Route 15. A union over the two audited doors — there is NO client-direct select on either table.
create or replace function public.hr_relations_list(
  p_organization_id uuid,
  p_filter jsonb default '{}'::jsonb,
  p_limit int default 100)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_kind text := nullif(p_filter ->> 'case_kind','');
  v_ca jsonb := '{}'::jsonb; v_inc jsonb := '{}'::jsonb; v_rows jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'hr_relations_list: no authenticated caller' using errcode = '42501';
  end if;

  if v_kind is null or v_kind = 'corrective_action' then
    v_ca := hr._door_list('hr_corrective_action', p_filter, p_limit, null, 'relations_list',
                          'restricted');
  end if;
  if v_kind is null or v_kind = 'incident' then
    v_inc := hr._door_list('hr_incident', p_filter, p_limit, null, 'relations_list', 'restricted');
  end if;

  -- 🚨 no-access here is the STRONGEST instance of §1.3: the caller gets `granted:false` and the
  -- client makes the route AND the nav item absent. It is never an empty list, because an empty
  -- list says "there are no cases" and that is a different, false statement.
  if not coalesce((v_ca ->> 'granted')::boolean, false)
     and not coalesce((v_inc ->> 'granted')::boolean, false) then
    return jsonb_build_object('granted', false, 'reason',
      coalesce(v_ca ->> 'reason', v_inc ->> 'reason', 'no_lane'),
      'audit_id', coalesce(v_ca ->> 'audit_id', v_inc ->> 'audit_id'));
  end if;

  select coalesce(jsonb_agg(r order by r ->> 'sort_at' desc), '[]'::jsonb) into v_rows from (
    select (row || jsonb_build_object('case_kind','corrective_action',
              'sort_at', row ->> 'issued_on')) as r
      from jsonb_array_elements(coalesce(v_ca -> 'rows', '[]'::jsonb)) as row
    union all
    select (row || jsonb_build_object('case_kind','incident',
              'sort_at', row ->> 'reported_at')) as r
      from jsonb_array_elements(coalesce(v_inc -> 'rows', '[]'::jsonb)) as row) s;

  return jsonb_build_object(
    'granted', true, 'rows', v_rows,
    -- RECORDED DECISION 16: this total is what THIS viewer may see, by design.
    'total', jsonb_array_length(v_rows),
    'total_is_viewer_scoped', true,
    'corrective_actions_granted', coalesce((v_ca ->> 'granted')::boolean, false),
    'incidents_granted', coalesce((v_inc ->> 'granted')::boolean, false),
    -- §2.2 r15: export is ABSENT on this route in v1. A CSV of complaints is exactly the artifact
    -- that should not exist by accident.
    'export_available', false);
end
$fn$;

-- ============================================================ incidents

create or replace function public.hr_incident_create(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid := (p_payload ->> 'organization_id')::uuid;
  v_gate jsonb; v_id uuid; v_kind text := p_payload ->> 'incident_kind';
  v_excluded boolean; v_assignee uuid; v_locked boolean;
begin
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', null, 'hr_incident', 'create',
                              'incident_intake');
  if v_gate is not null then
    -- an ordinary employee CAN report; the capability gates INVESTIGATION, not intake. Fall back
    -- to the reporter lane when the caller has an employment in this employer.
    if hr._l1_self_employment(v_uid, v_org, current_date) is null then
      return v_gate;
    end if;
  end if;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'incident_kind');
  end if;

  -- §4.9b C2/C3 + the knob: subject exclusion defaults TRUE for the complaint family and is
  -- PLATFORM-LOCKED true for harassment, discrimination and ethics — an org may not loosen those.
  v_locked := v_kind in ('harassment','discrimination','ethics');
  v_excluded := case
    when v_locked then true
    when v_kind in ('complaint') then
      coalesce((hr._knob('hr.relations','complaint_subject_excluded_default') #>> '{}')::boolean, true)
    else coalesce((p_payload ->> 'subject_excluded')::boolean, false) end;

  perform hr.arm_write();

  insert into hr.incident (
    incident_kind, subject_employment_id, reporter_employment_id, reported_anonymously,
    subject_excluded, occurred_at, reported_at, establishment_id, summary, state,
    assigned_to_employment_id, follow_up_on,
    injury_body_part, injury_nature, injury_object_substance, injury_event_description,
    treatment_beyond_first_aid, treatment_facility, physician_name, hospitalized_overnight,
    emergency_room, work_restrictions, return_to_work_on, workers_comp_claim_ref, provider_ref,
    osha_privacy_case, organization_id)
  values (
    v_kind,
    nullif(p_payload ->> 'subject_employment_id','')::uuid,
    -- §4.9b A2: an anonymous report creates NO employment linkage, so no future join can
    -- re-identify. HR entering a walk-in sets the flag and still records no reporter.
    case when coalesce((p_payload ->> 'reported_anonymously')::boolean, false) then null
         else coalesce(nullif(p_payload ->> 'reporter_employment_id','')::uuid,
                       hr._l1_self_employment(v_uid, v_org, current_date)) end,
    coalesce((p_payload ->> 'reported_anonymously')::boolean, false),
    v_excluded,
    coalesce(nullif(p_payload ->> 'occurred_at','')::timestamptz, now()),
    now(),
    nullif(p_payload ->> 'establishment_id','')::uuid,
    p_payload ->> 'summary',
    'intake',
    nullif(p_payload ->> 'assigned_to_employment_id','')::uuid,
    nullif(p_payload ->> 'follow_up_on','')::date,
    -- §4.9b C1: the OSHA 300/301 field set is captured NOW. It is impossible to capture after
    -- the fact, which is why it is on the intake form and not on a later screen.
    nullif(p_payload ->> 'injury_body_part',''),
    nullif(p_payload ->> 'injury_nature',''),
    nullif(p_payload ->> 'injury_object_substance',''),
    nullif(p_payload ->> 'injury_event_description',''),
    nullif(p_payload ->> 'treatment_beyond_first_aid','')::boolean,
    nullif(p_payload ->> 'treatment_facility',''),
    nullif(p_payload ->> 'physician_name',''),
    nullif(p_payload ->> 'hospitalized_overnight','')::boolean,
    nullif(p_payload ->> 'emergency_room','')::boolean,
    nullif(p_payload ->> 'work_restrictions',''),
    nullif(p_payload ->> 'return_to_work_on','')::date,
    nullif(p_payload ->> 'workers_comp_claim_ref',''),
    nullif(p_payload ->> 'provider_ref',''),
    coalesce((p_payload ->> 'osha_privacy_case')::boolean, false),
    v_org)
  returning id into v_id;

  -- the subject goes into the exclusion set through a party row, so the ONE trigger owns the
  -- materialization (RECORDED DECISION 15) rather than this function writing the array by hand
  if nullif(p_payload ->> 'subject_employment_id','') is not null and v_excluded then
    insert into hr.incident_party (incident_id, party_role, employment_id, organization_id)
    values (v_id, 'accused', (p_payload ->> 'subject_employment_id')::uuid, v_org)
    on conflict do nothing;
  end if;

  -- §4.9b F: if the assignee is themselves excluded, escalate per the knob rather than leaving the
  -- report unroutable. The external-investigator lane is live (public.hr_mint_investigation_token).
  v_assignee := nullif(p_payload ->> 'assigned_to_employment_id','')::uuid;

  return jsonb_build_object('ok', true, 'incident_id', v_id,
    'subject_excluded', v_excluded, 'exclusion_locked', v_locked,
    'escalation_target', hr._knob('hr.relations','incident_escalation_target') #>> '{}',
    'assignee_is_excluded', v_assignee is not null and v_assignee = nullif(p_payload ->> 'subject_employment_id','')::uuid,
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'create', ARRAY[v_id],
      nullif(p_payload ->> 'subject_employment_id','')::uuid, 'incident_intake', 'restricted'));
end
$fn$;

create or replace function public.hr_incident_party_add(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_incident uuid := (p_payload ->> 'incident_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid; v_role text := p_payload ->> 'party_role';
  v_emp uuid := nullif(p_payload ->> 'employment_id','')::uuid; v_self_excluded boolean;
begin
  select i.organization_id into v_org from hr.incident i
   where i.id = v_incident and i.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  -- the veto applies to the WRITER too: an excluded actor cannot add parties to a case they
  -- cannot see, and the attempt is audited.
  if hr.incident_excluded(v_uid, v_incident) then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_incident_party',
      p_purpose => 'add_party', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[v_incident], p_row_count => 0, p_sensitivity_tier => 'restricted',
      p_denial_reason => 'subject_excluded');
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', null, 'hr_incident_party', 'create',
                              'investigation');
  if v_gate is not null then return v_gate; end if;

  if v_emp is null and nullif(p_payload ->> 'external_name','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation',
      'detail', 'a party needs either an employment or an external name');
  end if;

  perform hr.arm_write();
  insert into hr.incident_party (incident_id, party_role, employment_id, external_name,
                                 external_contact, interviewed_at, position, organization_id)
  values (v_incident, v_role, v_emp, nullif(p_payload ->> 'external_name',''),
          coalesce(p_payload -> 'external_contact', '{}'::jsonb),
          nullif(p_payload ->> 'interviewed_at','')::timestamptz,
          (p_payload ->> 'position')::int, v_org)
  returning id into v_id;

  -- §4.9b H1: the trigger re-materialized the exclusion set IN THIS TRANSACTION. Report whether
  -- the CALLER just excluded themselves, so the client can redirect with a neutral message on
  -- their very next request rather than rendering a case they can no longer read.
  v_self_excluded := hr.incident_excluded(v_uid, v_incident);

  return jsonb_build_object('ok', true, 'incident_party_id', v_id, 'party_role', v_role,
    'caller_now_excluded', v_self_excluded,
    'excluded_actor_count', (select cardinality(i.excluded_actor_ids) from hr.incident i
                              where i.id = v_incident),
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident_party', 'create', ARRAY[v_id], v_emp,
                                   'investigation', 'restricted'));
end
$fn$;

create or replace function public.hr_incident_advance(
  p_incident_id uuid, p_state text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_cur text;
begin
  select i.organization_id, i.state into v_org, v_cur from hr.incident i
   where i.id = p_incident_id and i.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr.incident_excluded(v_uid, p_incident_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', null, 'hr_incident', 'update',
                              'investigation');
  if v_gate is not null then return v_gate; end if;

  -- §2.2 r16: resolved needs a summary; closed needs resolved_at and STARTS THE RETENTION CLOCK.
  if p_state = 'resolved' and nullif(p_payload ->> 'resolution_summary','') is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'resolution_summary',
      'detail', 'A case cannot be resolved without saying how.');
  end if;

  perform hr.arm_write();
  update hr.incident set
    state = p_state,
    resolution_summary = coalesce(nullif(p_payload ->> 'resolution_summary',''), resolution_summary),
    resolved_at = case when p_state in ('resolved','closed') then coalesce(resolved_at, now())
                       else resolved_at end,
    follow_up_on = case when p_payload ? 'follow_up_on'
                        then nullif(p_payload ->> 'follow_up_on','')::date else follow_up_on end,
    -- §4.9b L3 / §2.2 r16: recordability is a HUMAN decision with a rules assist, NEVER auto-set.
    osha_recordable = case when p_payload ? 'osha_recordable'
                           then nullif(p_payload ->> 'osha_recordable','')::boolean
                           else osha_recordable end,
    osha_privacy_case = coalesce((p_payload ->> 'osha_privacy_case')::boolean, osha_privacy_case),
    retention_trigger_at = case when p_state = 'closed' then coalesce(retention_trigger_at, now())
                                else retention_trigger_at end
  where id = p_incident_id;

  return jsonb_build_object('ok', true, 'incident_id', p_incident_id,
    'from_state', v_cur, 'to_state', p_state,
    'retention_clock_started', p_state = 'closed',
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'update', ARRAY[p_incident_id], null,
                                   'investigation', 'restricted'));
end
$fn$;

create or replace function public.hr_incident_assign(
  p_incident_id uuid, p_employment_id uuid, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_excluded boolean; v_login uuid;
begin
  select i.organization_id into v_org from hr.incident i
   where i.id = p_incident_id and i.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  if hr.incident_excluded(v_uid, p_incident_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', null, 'hr_incident', 'update',
                              'investigation');
  if v_gate is not null then return v_gate; end if;

  -- §4.9b F: assigning an EXCLUDED person is refused and the escalation target is named, so the
  -- report is never left unroutable. The accused-hr_owner case is not hypothetical.
  select e.login_user_id into v_login from hr.employment em
    join hr.employee e on e.id = em.employee_id where em.id = p_employment_id;
  v_excluded := v_login is not null and hr.incident_excluded(v_login, p_incident_id);
  if v_excluded then
    return jsonb_build_object('ok', false, 'reason', 'assignee_excluded',
      'detail', 'That person is a party to this case and cannot investigate it.',
      'escalation_target', hr._knob('hr.relations','incident_escalation_target') #>> '{}',
      'external_investigator_rpc', 'hr_mint_investigation_token');
  end if;

  perform hr.arm_write();
  update hr.incident set assigned_to_employment_id = p_employment_id,
         state = case when state = 'intake' then 'investigating' else state end
   where id = p_incident_id;

  return jsonb_build_object('ok', true, 'incident_id', p_incident_id,
    'assigned_to_employment_id', p_employment_id,
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'update', ARRAY[p_incident_id],
                                   p_employment_id, 'investigation', 'restricted'));
end
$fn$;

create or replace function public.hr_restricted_note_add(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_org uuid := (p_payload ->> 'organization_id')::uuid;
  v_gate jsonb; v_id uuid; v_subject_token text := p_payload ->> 'subject_token';
  v_subject uuid := (p_payload ->> 'subject_id')::uuid;
begin
  if v_subject_token = 'hr_incident' and hr.incident_excluded(v_uid, v_subject) then
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', null, 'hr_restricted_note', 'create',
                              'investigation');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  insert into hr.restricted_note (subject_token, subject_id, note_kind, title, body, body_file_id,
                                  redacted_summary, occurred_at, author_employment_id,
                                  organization_id)
  values (v_subject_token, v_subject, p_payload ->> 'note_kind',
          nullif(p_payload ->> 'title',''), nullif(p_payload ->> 'body',''),
          nullif(p_payload ->> 'body_file_id','')::uuid,
          nullif(p_payload ->> 'redacted_summary',''),
          nullif(p_payload ->> 'occurred_at','')::timestamptz,
          hr._l1_self_employment(v_uid, v_org, current_date),
          v_org)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'restricted_note_id', v_id,
    -- the note is reachable through its OWN owner lane only; a non-owner sees redacted_summary if
    -- the door returns one and nothing else. No org admin can read it at all.
    'owner_lane_only', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_restricted_note', 'create', ARRAY[v_id], null,
                                   'investigation', 'restricted'));
end
$fn$;

-- ============================================================ corrective actions

create or replace function public.hr_corrective_action_issue(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid; v_level text := p_payload ->> 'level';
  v_ack text := nullif(p_payload ->> 'acknowledgement_kind','');
  v_login uuid; v_skip text; v_prior text; v_door text;
  v_incident_on date; v_issued_on date;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'corrective_action.issue', v_employment,
                              'hr_corrective_action', 'create', 'corrective_action');
  if v_gate is not null then return v_gate; end if;

  v_incident_on := coalesce(nullif(p_payload ->> 'incident_on','')::date, current_date);
  v_issued_on   := coalesce(nullif(p_payload ->> 'issued_on','')::date, current_date);
  if v_incident_on > v_issued_on then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'incident_on',
      'detail', 'The incident cannot be dated after the action that responds to it.');
  end if;

  -- RECORDED DECISION 17: two doors, one record.
  v_door := coalesce(nullif(p_payload ->> 'entry_door',''),
                     case when v_level = 'coaching' then 'coaching' else 'corrective_action' end);

  -- §4.8 D2: skipping the ladder WARNS, never blocks (knob-governed). The prior chain is shown.
  v_skip := hr._knob('hr.relations','corrective_action_ladder_skip') #>> '{}';
  select ca.level into v_prior from hr.corrective_action ca
   where ca.employment_id = v_employment and ca.deleted_at is null
   order by ca.issued_on desc limit 1;

  -- RECORDED DECISION 18: a subject with no login has no lane to an e-signature.
  select e.login_user_id into v_login from hr.employment em
    join hr.employee e on e.id = em.employee_id where em.id = v_employment;
  if v_login is null and coalesce(v_ack, 'esign') = 'esign' then
    if v_ack = 'esign' then
      return jsonb_build_object('ok', false, 'reason', 'no_login_for_esign',
        'detail', 'This person has no platform login, so they cannot e-sign. Use a wet signature '
               || 'or a witnessed verbal acknowledgment; the printed copy is the delivery.',
        'permitted_kinds', jsonb_build_array('wet_signature','verbal_witnessed'));
    end if;
    v_ack := null;
  end if;

  perform hr.arm_write();
  insert into hr.corrective_action (
    employment_id, level, incident_on, issued_on, issued_by_employment_id, policy_cited,
    policy_document_file_id, summary, expected_improvement, consequence_if_unmet, follow_up_on,
    prior_action_id, attendance_exception_id, employee_acknowledgement_kind,
    confidentiality_tier, organization_id, metadata)
  values (
    v_employment, v_level, v_incident_on, v_issued_on,
    hr._l1_self_employment(v_uid, v_org, current_date),
    nullif(p_payload ->> 'policy_cited',''),
    nullif(p_payload ->> 'policy_document_file_id','')::uuid,
    p_payload ->> 'summary',
    nullif(p_payload ->> 'expected_improvement',''),
    nullif(p_payload ->> 'consequence_if_unmet',''),
    nullif(p_payload ->> 'follow_up_on','')::date,
    nullif(p_payload ->> 'prior_action_id','')::uuid,
    nullif(p_payload ->> 'attendance_exception_id','')::uuid,
    v_ack,
    coalesce(nullif(p_payload ->> 'confidentiality_tier',''), 'confidential'),
    v_org,
    jsonb_build_object('entry_door', v_door))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'corrective_action_id', v_id, 'entry_door', v_door,
    'level', v_level, 'prior_level', v_prior,
    'ladder_skip_posture', v_skip,
    'subject_has_login', v_login is not null,
    'permitted_acknowledgement_kinds', case when v_login is null
      then jsonb_build_array('wet_signature','verbal_witnessed','refused')
      else jsonb_build_array('esign','wet_signature','verbal_witnessed','refused') end,
    'ack_due_days', (hr._knob('hr.relations','corrective_action_ack_due_days') #>> '{}')::int,
    'audit_id', hr._l1_write_audit(v_org, 'hr_corrective_action', 'create', ARRAY[v_id],
                                   v_employment, 'corrective_action', 'restricted'));
end
$fn$;

create or replace function public.hr_corrective_action_outcome(
  p_id uuid, p_outcome text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_gate jsonb;
begin
  select ca.organization_id, ca.employment_id into v_org, v_employment
    from hr.corrective_action ca where ca.id = p_id and ca.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'corrective_action.issue', v_employment,
                              'hr_corrective_action', 'update', 'corrective_action');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  update hr.corrective_action set
    outcome = p_outcome,
    outcome_on = coalesce(nullif(p_payload ->> 'outcome_on','')::date, current_date),
    follow_up_outcome = coalesce(nullif(p_payload ->> 'follow_up_outcome',''), follow_up_outcome)
  where id = p_id;

  return jsonb_build_object('ok', true, 'corrective_action_id', p_id, 'outcome', p_outcome,
    -- §4.8 I3: rescission is a STATE with a reason. The record is NOT deleted, ever.
    'record_retained', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_corrective_action', 'update', ARRAY[p_id],
                                   v_employment, 'corrective_action', 'restricted'));
end
$fn$;

-- ============================================================ verification letters

create or replace function public.hr_verification_request_create(p_payload jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid; v_kind text; v_incl boolean; v_self boolean;
  v_state text;
begin
  select em.organization_id into v_org from hr.employment em
   where em.id = v_employment and em.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_self := hr._l1_self_employment(v_uid, v_org, current_date) = v_employment;
  if not v_self then
    v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                                'hr_verification_letter_request', 'create', 'verification');
    if v_gate is not null then return v_gate; end if;
  end if;

  v_kind := coalesce(nullif(p_payload ->> 'verification_kind',''),
                     hr._knob('hr.employees','verification_letter_default_kind') #>> '{}');
  v_incl := v_kind in ('employment_and_income','income_only');

  -- §4.9 A1: when the EMPLOYEE asks, consent is implicit — and still RECORDED.
  v_state := case when not v_incl then 'received'
                  when v_self then 'received'
                  else 'awaiting_consent' end;

  perform hr.arm_write();
  insert into hr.verification_letter_request (
    employment_id, request_source, requester_name, requester_organization, requester_email,
    verification_kind, includes_compensation, employee_consent_at, employee_consent_evidence,
    requested_at, state, organization_id)
  values (
    v_employment,
    coalesce(nullif(p_payload ->> 'request_source',''), case when v_self then 'employee' else 'third_party' end),
    nullif(p_payload ->> 'requester_name',''), nullif(p_payload ->> 'requester_organization',''),
    nullif(p_payload ->> 'requester_email',''),
    v_kind, v_incl,
    case when v_incl and v_self then now() end,
    case when v_incl and v_self
         then jsonb_build_object('basis','subject_initiated','user_id',v_uid,'at',now())
         else '{}'::jsonb end,
    now(), v_state, v_org)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'verification_letter_request_id', v_id,
    'state', v_state, 'verification_kind', v_kind, 'includes_compensation', v_incl,
    'consent_expiry_days', (hr._knob('hr.employees','verification_consent_expiry_days') #>> '{}')::int,
    'audit_id', hr._l1_write_audit(v_org, 'hr_verification_letter_request', 'create', ARRAY[v_id],
                                   v_employment, 'verification', 'confidential', v_self));
end
$fn$;

create or replace function public.hr_verification_consent(
  p_id uuid, p_granted boolean, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_self boolean;
begin
  select r.organization_id, r.employment_id into v_org, v_employment
    from hr.verification_letter_request r where r.id = p_id and r.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  -- 🚨 CONSENT IS THE SUBJECT'S TO GIVE AND NOBODY ELSE'S. There is no HR override here, on
  -- purpose: an income verification the person did not agree to is the artifact this gate exists
  -- to prevent.
  v_self := hr._l1_self_employment(v_uid, v_org, current_date) = v_employment;
  if not v_self then
    return jsonb_build_object('ok', false, 'reason', 'not_the_subject',
      'detail', 'Only the person the letter is about can grant or withhold consent.');
  end if;

  perform hr.arm_write();
  update hr.verification_letter_request set
    employee_consent_at = case when p_granted then now() else null end,
    employee_consent_evidence = jsonb_build_object('basis','subject_decision','user_id',v_uid,
                                                   'granted',p_granted,'at',now(),'note',p_note),
    state = case when p_granted then 'received' else 'denied' end,
    -- §4.9 D2: the requester is told only that it cannot be provided.
    metadata = metadata || case when p_granted then '{}'::jsonb
                                else jsonb_build_object('denial_basis','consent_withheld') end
  where id = p_id;

  return jsonb_build_object('ok', true, 'verification_letter_request_id', p_id,
    'granted', p_granted, 'state', case when p_granted then 'received' else 'denied' end,
    'audit_id', hr._l1_write_audit(v_org, 'hr_verification_letter_request', 'update', ARRAY[p_id],
                                   v_employment, 'verification_consent', 'confidential', true));
end
$fn$;

create or replace function public.hr_verification_deny(p_id uuid, p_basis text)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_gate jsonb;
begin
  select r.organization_id, r.employment_id into v_org, v_employment
    from hr.verification_letter_request r where r.id = p_id and r.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                              'hr_verification_letter_request', 'update', 'verification');
  if v_gate is not null then return v_gate; end if;

  perform hr.arm_write();
  update hr.verification_letter_request set state = 'denied',
         metadata = metadata || jsonb_build_object('denial_basis', p_basis, 'denied_at', now())
   where id = p_id;

  -- §4.9 edge: a request for someone who never worked here is denied — AND THAT DENIAL IS ITSELF
  -- THE RECORD. It is never a silent no-op.
  return jsonb_build_object('ok', true, 'verification_letter_request_id', p_id,
    'state', 'denied', 'denial_basis', p_basis, 'denial_is_the_record', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_verification_letter_request', 'update', ARRAY[p_id],
                                   v_employment, 'verification', 'confidential'));
end
$fn$;

create or replace function public.hr_verification_deliver(
  p_id uuid, p_method text, p_payload jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_gate jsonb; v_state text;
begin
  select r.organization_id, r.employment_id, r.state into v_org, v_employment, v_state
    from hr.verification_letter_request r where r.id = p_id and r.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;
  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                              'hr_verification_letter_request', 'update', 'verification');
  if v_gate is not null then return v_gate; end if;

  if v_state <> 'generated' then
    return jsonb_build_object('ok', false, 'reason', 'not_generated', 'state', v_state,
      'detail', 'A letter must be generated before it can be delivered.');
  end if;

  perform hr.arm_write();
  update hr.verification_letter_request set state = 'delivered', delivered_at = now(),
         delivery_method = p_method,
         outsider_token_ref = nullif(p_payload ->> 'outsider_token_ref','')
   where id = p_id;

  return jsonb_build_object('ok', true, 'verification_letter_request_id', p_id,
    'state', 'delivered', 'delivery_method', p_method,
    'audit_id', hr._l1_write_audit(v_org, 'hr_verification_letter_request', 'update', ARRAY[p_id],
                                   v_employment, 'verification', 'confidential'));
end
$fn$;

-- The privileged write aidream's E-37 handler needs. `hr.*` carries a write guard, so the server
-- cannot update the row directly under `acting_as_user` without arming it — and arming it from
-- application code would put the guard's token in Python. One definer RPC instead.
create or replace function public.hr_verification_generate_apply(
  p_letter_id uuid, p_file_id uuid, p_snapshot jsonb)
returns jsonb
language plpgsql security definer set search_path = public, hr
as $fn$
declare v_uid uuid := auth.uid(); v_org uuid; v_employment uuid; v_state text; v_incl boolean;
        v_consent timestamptz; v_gate jsonb;
begin
  select r.organization_id, r.employment_id, r.state, r.includes_compensation, r.employee_consent_at
    into v_org, v_employment, v_state, v_incl, v_consent
    from hr.verification_letter_request r where r.id = p_letter_id and r.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  v_gate := hr._l1_write_gate(v_org, 'working_record.write', v_employment,
                              'hr_verification_letter_request', 'update', 'verification');
  if v_gate is not null then return v_gate; end if;

  -- 🚨 THE CONSENT GATE, CHECKED HERE AS WELL AS BY THE TABLE CHECK AND BY THE HANDLER. Three
  -- places, because §4.9's whole point is that an income letter without consent must be
  -- impossible rather than merely discouraged.
  if v_incl and v_consent is null then
    return jsonb_build_object('ok', false, 'reason', 'hr_verification_consent_missing',
      'detail', 'This letter asserts compensation and the subject has not consented.');
  end if;

  -- §4.9 K: a DELIVERED letter is an assertion the org is held to and is never edited. A
  -- correction is a NEW row referencing the prior request.
  if v_state = 'delivered' then
    return jsonb_build_object('ok', false, 'reason', 'hr_verification_letter_delivered',
      'detail', 'That letter has been delivered. Create a new request rather than editing it.');
  end if;

  perform hr.arm_write();
  update hr.verification_letter_request set
    state = 'generated', generated_at = now(), letter_file_id = p_file_id,
    snapshot = p_snapshot
  where id = p_letter_id;

  return jsonb_build_object('ok', true, 'verification_letter_request_id', p_letter_id,
    'state', 'generated', 'letter_file_id', p_file_id, 'snapshot_frozen', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_verification_letter_request', 'update',
                                   ARRAY[p_letter_id], v_employment, 'verification',
                                   'confidential'));
end
$fn$;

-- ============================================================ grants

do $$ declare f text; begin
  foreach f in array ARRAY[
    'public.hr_relations_list(uuid, jsonb, int)',
    'public.hr_incident_create(jsonb)',
    'public.hr_incident_party_add(jsonb)',
    'public.hr_incident_advance(uuid, text, jsonb)',
    'public.hr_incident_assign(uuid, uuid, text)',
    'public.hr_restricted_note_add(jsonb)',
    'public.hr_corrective_action_issue(jsonb)',
    'public.hr_corrective_action_outcome(uuid, text, jsonb)',
    'public.hr_verification_request_create(jsonb)',
    'public.hr_verification_consent(uuid, boolean, text)',
    'public.hr_verification_deny(uuid, text)',
    'public.hr_verification_deliver(uuid, text, jsonb)',
    'public.hr_verification_generate_apply(uuid, uuid, jsonb)'] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ============================================================ assertions

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_relations_list','hr_incident_create','hr_incident_party_add',
                       'hr_incident_advance','hr_incident_assign','hr_restricted_note_add',
                       'hr_corrective_action_issue','hr_corrective_action_outcome',
                       'hr_verification_request_create','hr_verification_consent',
                       'hr_verification_deny','hr_verification_deliver',
                       'hr_verification_generate_apply');
  if v_bad <> 13 then
    raise exception 'hr_l1_04: expected 13 public relations/verification RPCs, found %', v_bad;
  end if;

  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_relations_list','hr_incident_create','hr_incident_party_add',
                       'hr_incident_advance','hr_incident_assign','hr_restricted_note_add',
                       'hr_corrective_action_issue','hr_corrective_action_outcome',
                       'hr_verification_request_create','hr_verification_consent',
                       'hr_verification_deny','hr_verification_deliver',
                       'hr_verification_generate_apply')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad > 0 then
    raise exception 'hr_l1_04: % relations RPCs are executable by anon', v_bad;
  end if;

  -- RECORDED DECISION 15: the list must go through the audited door, never a direct select.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_relations_list') like '%from hr.incident%' then
    raise exception 'hr_l1_04: hr_relations_list selects hr.incident directly — the veto lives in '
                    'the audited door and must not be re-implemented here';
  end if;

  -- every relations writer that can be reached by an excluded actor must consult the veto
  select count(*) into v_bad from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('hr_incident_party_add','hr_incident_advance','hr_incident_assign')
     and p.prosrc not like '%hr.incident_excluded%';
  if v_bad > 0 then
    raise exception 'hr_l1_04: % incident writer(s) never consult hr.incident_excluded', v_bad;
  end if;

  -- §4.9: consent has no HR override lane, by design
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='hr_verification_consent')
       not like '%not_the_subject%' then
    raise exception 'hr_l1_04: hr_verification_consent admits somebody other than the subject';
  end if;

  select count(*) into v_bad
    from platform.ddl_guard_log
   where acknowledged_at is null
     and (object_ref like 'hr.\_l1%' or object_ref like 'public.hr\_%');
  if v_bad > 0 then
    raise exception 'hr_l1_04: % unacked DDL guard row(s) on this file''s objects', v_bad;
  end if;
end $$;

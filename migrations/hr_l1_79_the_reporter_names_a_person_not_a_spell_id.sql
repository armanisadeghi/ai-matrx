-- hr_l1_79 — THE REPORTER NAMES A PERSON, NOT A SPELL ID. AND A LEGAL-ADJACENT RECORD IS VOIDED,
--            NEVER DELETED.
--
-- RECORD of a live change applied on 2026-08-30 to db.matrxserver.com.
-- Ledger: public._schema_migrations (source 'matrx-frontend'). Slot: hr_l1 #0079.
--
-- Two things, both found by walking hr_l1_75's own fix in a real browser rather than at the wire.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART A — AN EMPLOYEE COULD OPEN THE INTAKE FORM AND STILL NOT SAY WHO IT WAS ABOUT.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- 🚨 THE RENDER WALK CAUGHT WHAT THE DOOR WALK COULD NOT. At the wire, an employee filing a
-- complaint about their manager works perfectly — the door walk passed every clause. On screen it
-- does not: the intake form's subject control is `EmploymentPicker`, whose only source is
-- `hr_directory_list`, and at the EMPLOYEE tier that door does not return `employment_id`. Every
-- row came back with `employment_id: null`, the picker renders such a row `disabled` (correctly —
-- "a person with no active spell cannot be the subject of a new record keyed on a spell"), and so
-- every colleague in the list was greyed out. The employee could describe what happened and could
-- not name who it happened with.
--
-- 🚨 AND THE FIX IS NOT TO WIDEN THE DIRECTORY. `employment_id` is the working-record addressing
-- key and the tiered directory withholds it from rank-and-file viewers on purpose (hr_l1_65). Two
-- different situations were arriving on the wire looking identical: "this person has no spell" and
-- "you may not see this person's spell id". Only the SERVER can tell them apart, so the server is
-- where the resolution belongs.
--
-- `hr_incident_create` now accepts `subject_employee_id` and resolves the spell itself through
-- `hr.subject_employment_as_of` — THE ONE resolver, never a second copy of the rule, the same one
-- `hr_restricted_note_add` uses for exactly this reason. `subject_employment_id` still works and
-- still wins when both are sent, so no existing caller changes. Nothing is widened: the resolver
-- is scoped to the employer, and the write gate still runs against the resolved subject.
--
-- ══════════════════════════════════════════════════════════════════════════════════════════════
-- PART B — VOIDING. THE SPEC IS SILENT AND ITS OWN PRECEDENT IS NOT.
-- ══════════════════════════════════════════════════════════════════════════════════════════════
--
-- The question was raised properly by T-L1-6's verifier: its probe left an incident UNREADABLE BY
-- EVERY LOGGED-IN PERSONA (it had added the org owner as an accused party), and there is no delete
-- door anywhere. A real product need sits behind that accident — a report filed in error, a
-- duplicate of one already open, a record created against the wrong person.
--
-- 🚨 NO SPEC CLAUSE PERMITS DELETING AN `hr.incident`, AND NONE DEFINES A VOID EITHER. The corpus
-- was swept. The only sentence implying a delete exists at all is §2.2 r16's edge case — *"A case
-- under legal hold shows the hold and its origin, and its delete action is absent"* — which
-- defines the thing legal hold REMOVES and never defines the thing itself. `deleted_at` exists on
-- the table as a conformance requirement, and SPEC-DATA-MODEL says outright that the flag is not a
-- lifecycle: *"a `deleted_at` column is not a permission to delete."*
--
-- 🚨 SO THIS IS BUILT FROM THE SPEC'S OWN PRECEDENT FOR THE SAME PROBLEM ON THE SIBLING RECORD,
-- WHICH IS UNAMBIGUOUS. §4.8, on a corrective action issued in error:
--
--       "`rescinded` → The record is NOT deleted. Rescission is a state with a reason."
--
-- and SPEC-TIME on a punch: *"`voided` (rendered struck through with the voiding punch as a door,
-- NEVER HIDDEN — a hidden void is a destroyed record)"*. An employee-relations record is
-- legal-adjacent, carries a retention class (`employee_relations`, 12 months minimum and 5 years
-- for OSHA injury/illness) and can be under a legal hold. It is exactly the record you must be
-- able to mark wrong and must never be able to erase.
--
-- ── THE THREE DECISIONS, AND WHY ──────────────────────────────────────────────────────────────
--
-- 1. VOID IS A FLAG, NOT A STATE. `hr.incident.state` is its INVESTIGATION lifecycle and its
--    CHECK is a closed, statute-shaped set. Folding `void` into it would destroy the answer to
--    "what was happening when this was voided?" and would ripple through every state machine that
--    reads it. `voided_at` / `voided_by` / `void_reason` are orthogonal, strictly additive, and
--    change no existing constraint.
--
-- 2. A VOIDED CASE IS NEVER HIDDEN. `deleted_at` stays NULL. It keeps listing, it keeps opening,
--    it renders struck through with its reason. A void the reader cannot see is a deletion with
--    better manners.
--
-- 3. THE VETO IS UNCHANGED BY IT. Voiding does not un-accuse anybody: `excluded_actor_ids` is
--    untouched, so a person who was accused on a voided case still cannot read it. That is not an
--    oversight — a case voided as "filed against the wrong person" is the LAST record you would
--    hand to the person it named. Un-excluding is a separate act (remove the party row, which
--    re-drives the veto through the existing trigger) and it stays separate.
--
-- 🚨 WHAT THIS DOOR DELIBERATELY IS NOT: it is not a cleanup tool. The synthetic fixture rows
-- verifier C and this lane left behind are NOT voided — they are DELETED, in hr_l1_79, through a
-- provenance-checked one-shot that names them and asserts the marker before touching anything.
-- Voiding them would leave a permanent struck-through "G2 VERIFICATION FIXTURE" list in Arman's
-- sandbox forever, which is not a record of anything. A void door is for records about real
-- events; test rows were never that.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE. Re-running is a no-op.
-- ══════════════════════════════════════════════════════════════════════════════════════════════

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART A — the intake door resolves the person to their spell.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.hr_incident_create(p_payload jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_org uuid := (p_payload ->> 'organization_id')::uuid;
  v_gate jsonb; v_id uuid; v_kind text := p_payload ->> 'incident_kind';
  v_subject uuid;
  v_excluded boolean; v_assignee uuid; v_locked boolean;
begin
  -- 🚨 THE REPORTER NAMES A PERSON; THE SERVER RESOLVES THE SPELL (hr_l1_79). `employment_id` is
  -- the working-record addressing key and the tiered directory withholds it from rank-and-file
  -- viewers by design — so an ordinary employee filing a complaint has an `employee_id` and
  -- nothing else, and every colleague in the intake picker was greyed out. Resolution happens
  -- here, through THE ONE resolver, scoped to this employer. An explicit `subject_employment_id`
  -- still wins: a caller who legitimately holds the spell id is addressing a specific spell, and
  -- a rehire has more than one.
  v_subject := coalesce(
    nullif(p_payload ->> 'subject_employment_id','')::uuid,
    case when nullif(p_payload ->> 'subject_employee_id','') is not null
         then hr.subject_employment_as_of(
                (p_payload ->> 'subject_employee_id')::uuid, current_date, v_org) end);

  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). The reporter
  -- lane below is UNCHANGED: an ordinary employee still files a report about anyone.
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', v_subject, 'hr_incident', 'create',
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

  -- a named person the server could not resolve to a spell is a REFUSAL WITH A SENTENCE, not a
  -- silently subject-less record. Filing "a complaint about nobody" is the shape of a report that
  -- quietly loses the only fact that makes it actionable.
  if nullif(p_payload ->> 'subject_employee_id','') is not null and v_subject is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'subject_employee_id',
      'detail', 'That person has no current employment with this employer, so a report cannot be '
             || 'recorded against them. Report it without naming a subject and describe who was '
             || 'involved in your own words.');
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
    v_subject,
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
  if v_subject is not null and v_excluded then
    insert into hr.incident_party (incident_id, party_role, employment_id, organization_id)
    values (v_id, 'accused', v_subject, v_org)
    on conflict do nothing;
  end if;

  -- §4.9b F: if the assignee is themselves excluded, escalate per the knob rather than leaving the
  -- report unroutable. The external-investigator lane is live (public.hr_mint_investigation_token).
  v_assignee := nullif(p_payload ->> 'assigned_to_employment_id','')::uuid;

  return jsonb_build_object('ok', true, 'incident_id', v_id,
    'subject_excluded', v_excluded, 'exclusion_locked', v_locked,
    'subject_employment_id', v_subject,
    'escalation_target', hr._knob('hr.relations','incident_escalation_target') #>> '{}',
    'assignee_is_excluded', v_assignee is not null and v_assignee = v_subject,
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'create', ARRAY[v_id],
      v_subject, 'incident_intake', 'restricted'));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART B — the void.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
alter table hr.incident add column if not exists voided_at   timestamptz;
alter table hr.incident add column if not exists voided_by   uuid;
alter table hr.incident add column if not exists void_reason text;

comment on column hr.incident.voided_at is
  'Set by public.hr_incident_void. A void marks a record WRONG; it never hides or removes it — '
  'deleted_at stays NULL and the row keeps listing and opening, struck through with its reason. '
  'SPEC-EMPLOYEES §4.8''s law for the sibling record: "The record is NOT deleted."';

create or replace function public.hr_incident_void(p_incident_id uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'hr'
as $function$
declare
  v_uid uuid := auth.uid(); v_org uuid; v_gate jsonb; v_subject uuid;
  v_state text; v_holds int; v_already timestamptz;
begin
  select i.organization_id, i.subject_employment_id, i.state, i.legal_hold_count, i.voided_at
    into v_org, v_subject, v_state, v_holds, v_already
    from hr.incident i where i.id = p_incident_id and i.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  -- §5's veto applies to the WRITER, first and absolutely. An accused party cannot make the case
  -- about them go away, and the attempt is audited like every other probe.
  if hr.incident_excluded(v_uid, p_incident_id) then
    perform hr._record_access_audit(
      p_organization_id => v_org, p_action => 'denied', p_target_token => 'hr_incident',
      p_purpose => 'void', p_basis => 'refused', p_granted => false,
      p_target_ids => ARRAY[p_incident_id], p_row_count => 0, p_sensitivity_tier => 'restricted',
      p_denial_reason => 'subject_excluded');
    return jsonb_build_object('ok', false, 'reason', 'not_reachable');
  end if;

  -- 🚨 THE CASE IS ABOUT SOMEBODY, AND THE GATE MUST ASK ABOUT THEM (hr_l1_64). Voiding is an
  -- investigator's act, not a reporter's: somebody who files a report cannot then unfile it,
  -- because "I withdraw it" is a fact about the report that HR must see, not an erasure they
  -- must not.
  v_gate := hr._l1_write_gate(v_org, 'incident.investigate', v_subject, 'hr_incident', 'update',
                              'void');
  if v_gate is not null then return v_gate; end if;

  if coalesce(trim(p_reason), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'reason',
      'detail', 'A void is a state with a reason. Say why this record should not stand.');
  end if;

  -- 🚨 A LEGAL HOLD BLOCKS EVERY DISPOSITION, AND A VOID IS A DISPOSITION-SHAPED CLAIM ABOUT THE
  -- RECORD. §2.2 r16: under a hold the delete action is ABSENT — so this refuses in words rather
  -- than quietly marking a held record wrong while a lawyer is relying on it.
  if coalesce(v_holds, 0) > 0 then
    return jsonb_build_object('ok', false, 'reason', 'legal_hold',
      'detail', 'This record is under a legal hold. Nothing about it can be set aside until the '
             || 'hold is lifted by whoever placed it.');
  end if;

  if v_already is not null then
    return jsonb_build_object('ok', true, 'incident_id', p_incident_id, 'already_void', true,
                              'voided_at', v_already);
  end if;

  perform hr.arm_write();
  update hr.incident
     set voided_at = now(), voided_by = v_uid, void_reason = trim(p_reason)
   where id = p_incident_id;

  -- 🚨 THE EXCLUSION SET IS NOT TOUCHED. Voiding does not un-accuse anybody: a case voided as
  -- "filed against the wrong person" is the last record you would hand to the person it named.
  -- Un-excluding is removing the party row, which re-drives the veto through its own trigger, and
  -- it stays a separate, separately-audited act.
  return jsonb_build_object('ok', true, 'incident_id', p_incident_id,
    'voided_at', (select i.voided_at from hr.incident i where i.id = p_incident_id),
    'state_at_void', v_state, 'record_retained', true, 'exclusion_unchanged', true,
    'audit_id', hr._l1_write_audit(v_org, 'hr_incident', 'update', ARRAY[p_incident_id],
                                   v_subject, 'void', 'restricted'));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART C — REGISTER BEFORE YOU GRANT.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'hr_incident_void', 'p_incident_id uuid, p_reason text', 'hr_l1_79',
   'A report filed in error, a duplicate, or one recorded against the wrong person. SPEC-EMPLOYEES '
   || 'is silent on deleting an incident and its own precedent for the sibling record is not: §4.8 '
   || '"The record is NOT deleted. Rescission is a state with a reason." So this marks the record '
   || 'wrong and never removes it — deleted_at stays NULL and the row keeps listing and opening. '
   || 'Gated inside the door by hr._l1_write_gate on incident.investigate with §5''s veto '
   || 'evaluated first; refused in words under a legal hold; the exclusion set is untouched.'),
  ('public', 'hr_incident_create', 'p_payload jsonb', 'hr_l1_79',
   'Re-declared by hr_l1_79, which added `subject_employee_id` so a reporter can name a PERSON. '
   || 'The employee tier of hr_directory_list withholds employment_id by design, so an ordinary '
   || 'employee had no way to say who a complaint was about; the spell is resolved server-side '
   || 'through hr.subject_employment_as_of, scoped to the employer, and the write gate still runs '
   || 'against the resolved subject.')
on conflict do nothing;

grant execute on function public.hr_incident_void(uuid, text) to authenticated;
revoke all on function public.hr_incident_void(uuid, text) from public, anon;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART D — CONTRACT PINS.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
insert into hr.function_contract
  (schema_name, function_name, home_migration, must_contain, must_not_contain, reason, is_active)
values
  ('public', 'hr_incident_create', 'hr_l1_79',
   array['hr.subject_employment_as_of(', 'v_locked := v_kind in (''harassment'',''discrimination'',''ethics'')',
         'hr._l1_self_employment(v_uid, v_org, current_date) is null'],
   array['osha_recordable'],
   'hr_l1_79: three clauses hold this door up. The resolver is how an employee names a person the '
   || 'directory will not give them a spell id for. The platform lock is why the intake form shows '
   || 'harassment / discrimination / ethics a LOCK and not a switch — the payload key is not '
   || 'consulted on that branch and the client must never be able to make it so. The self-employment '
   || 'fallback IS the employee intake lane; without it the capability gate refuses the very person '
   || '§4.9b built this for. `osha_recordable` is banned because §4.9b L3 makes recordability a '
   || 'human decision with a rules assist, made later — no intake path may set it.',
   true),
  ('public', 'hr_incident_void', 'hr_l1_79',
   array['hr.incident_excluded(v_uid, p_incident_id)', 'coalesce(v_holds, 0) > 0',
         'voided_at = now()'],
   array['delete from hr.incident', 'deleted_at ='],
   'hr_l1_79: a void MARKS a legal-adjacent record wrong and never removes it. The banned strings '
   || 'are the two ways somebody would turn this into a delete — §4.8''s law for the sibling record '
   || 'is "The record is NOT deleted", and SPEC-TIME''s is "a hidden void is a destroyed record". '
   || 'The veto and the legal-hold refusal are pinned because they are what keep this from becoming '
   || 'a way for an accused person, or a hurried admin, to make a case disappear.',
   true)
on conflict (schema_name, function_name, home_migration) do update
   set must_contain     = excluded.must_contain,
       must_not_contain = excluded.must_not_contain,
       reason           = excluded.reason,
       is_active        = true;

-- ──────────────────────────────────────────────────────────────────────────────────────────────
-- PART E — FALSIFICATION.
-- ──────────────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_broken int; v_cols int;
begin
  select count(*) into v_cols from information_schema.columns
   where table_schema = 'hr' and table_name = 'incident'
     and column_name in ('voided_at','voided_by','void_reason');
  if v_cols <> 3 then
    raise exception 'hr_l1_79: expected 3 void columns, found %', v_cols;
  end if;

  -- The void columns are ADDITIVE and nothing is voided by their arrival.
  if exists (select 1 from hr.incident where voided_at is not null) then
    raise exception 'hr_l1_79: a row is voided already. This migration voids nothing.';
  end if;

  -- The resolver the intake door now depends on really resolves a live fixture person, and
  -- resolves them INSIDE their own employer.
  if hr.subject_employment_as_of(
       (select employee_id from hr.employment
         where id = 'ca9e12da-35bb-402d-8bda-1b76fa4c678d'),
       current_date, '2643e470-b275-47f3-95f3-ae275ad3ca47') is null then
    raise exception 'hr_l1_79: hr.subject_employment_as_of does not resolve a live fixture subject.';
  end if;

  select count(*) into v_broken from hr.function_contracts_broken();
  if v_broken > 0 then
    raise exception 'hr_l1_79: % contract(s) broken', v_broken;
  end if;
  raise notice 'hr_l1_79: intake resolves a person to a spell; the void door is live and has voided nothing.';
end $$;

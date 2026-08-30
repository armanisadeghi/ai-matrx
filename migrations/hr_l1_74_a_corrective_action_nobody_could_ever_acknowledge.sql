-- hr_l1_74 — A CORRECTIVE ACTION NOBODY COULD EVER ACKNOWLEDGE.
--
-- RECORD of a live change applied on 2026-08-29 to db.matrxserver.com.
--
-- 🚨 THE FEATURE HAS NEVER WORKED ONCE. Verified on production v0.4.1474 by an independent
-- verifier, then re-verified against pg_proc here. `public.hr_corrective_action_issue` is a
-- HEALTHY door — a positive control differing only in one payload key succeeded — and yet no
-- corrective action has ever been issued from the UI, acknowledged by anybody, or listed on the
-- relations queue. Five separate defects, three of them the SAME defect wearing three hats.
--
-- This file closes the two that are DATABASE work. The three seam-name renames are client-side
-- and land in the same commit; the guard that ends the seam class is a CI conformance check.
--
-- ── WHAT WAS MISSING ──────────────────────────────────────────────────────────────────────────
--
-- 🚨 (4) NOTHING LAUNCHED THE ACKNOWLEDGMENT WORKFLOW. The flow type `corrective_action_ack` is
-- declared and ACTIVE, its definition is PUBLISHED, its apply hook `hr.corrective_ack_wf_apply`
-- exists and is correct — and `hr_corrective_action_issue` inserted a row and returned. No
-- `hr.workflow_instance` was ever created, so the subject's `/hr/tasks` could never show the
-- thing they are being asked to sign, `hr.wf_inbox` had nothing to return, and no acknowledgment
-- and no employee statement could ever exist. Every downstream piece was built correctly around a
-- launch that was never wired. §4.8's node E → F → G edge simply did not exist.
--
-- 🚨 (5) `public.hr_corrective_action_acknowledge` DID NOT EXIST AT ALL. pg_proc was swept: no
-- function of that name in any schema. The client called it on every "Record it" press and got
-- PGRST202, while the panel offered esign / wet_signature / verbal_witnessed / refused and the
-- refusal branch told the user "the record says it was declined" — a sentence about a write that
-- could not happen.
--
-- ── THE DESIGN DECISION, AND WHY ──────────────────────────────────────────────────────────────
--
-- 🚨 ACKNOWLEDGE IS A **WORKFLOW DECISION**, NOT A DIRECT WRITE. The spec is ambiguous on its
-- face — §4.8 draws the acknowledgment as a branch, not as an approval — but the DATABASE is not
-- ambiguous: `hr.workflow_flow_type.corrective_action_ack` already declares
-- `apply_fn = hr.corrective_ack_wf_apply(uuid)`, and that function's body reads
-- `hr.workflow_instance.payload` and is the only thing anywhere that writes
-- `employee_acknowledged_at`, `employee_acknowledgement_kind` and `employee_statement`. An apply
-- hook exists for exactly one reason: the engine calls it. Building a direct door beside it would
-- create a SECOND writer of the subject's own words — the precise thing §4.8 G2's preserved-
-- disagreement rule forbids. So `hr_corrective_action_acknowledge` is an ENTRY, not a writer: it
-- validates, it stages the facts on the instance payload, and it hands the act to the engine.
-- `hr.corrective_ack_wf_apply` remains the ONE writer, and its `coalesce(employee_statement, …)`
-- stays the structural backstop underneath the door's named refusal.
--
-- 🚨 THE `issue` STEP IS REMOVED FROM THE PUBLISHED DEFINITION (v1 → v2), because it described a
-- decision that has already been taken. Definition v1 carried two steps: `issue` (step_order 10,
-- resolver `authority`/`corrective_action_issue`, `allows_self=false`, `quorum_kind='all'`) and
-- `acknowledge` (step_order 20). Launching an instance against v1 would activate `issue` FIRST
-- and hold the acknowledgment behind an approval of the issuance — and with `quorum_kind='all'`,
-- behind approval by EVERY holder of that authority in the employer. The corrective action is
-- already written and `hr._l1_write_gate(…, 'corrective_action.issue', …)` already refused anyone
-- without the standing to write it; `issued_by_employment_id` and the `hr._l1_write_audit` row are
-- the record of issuance. §4.8's flowchart has NO approval node between E (saved) and F
-- (acknowledgment kind). v2 is the acknowledgment flow the flow_key literally names.
-- v1 is RETIRED, not deleted — zero instances were ever pinned to it, and the row is evidence.
--
-- 🚨 TWO LANES, BECAUSE §4.8 HAS TWO. The spec's F1 (esign) and G (opens it in /hr/tasks) are the
-- SUBJECT acting. F2 (wet signature), F3 (verbal witnessed) and F4 (refused) are somebody
-- RECORDING an event that happened off-platform — they sit outside the "Employee opens it"
-- branch in §4.8's own diagram. So:
--   · SUBJECT lane  → hr.wf_decide('acknowledged'), the full engine path with every one of its
--     guards, including the digest re-pin and the never-approve-yourself arm (inert here:
--     `allows_self` is true on this step by design — a person acknowledging their own corrective
--     action is the whole point).
--   · RECORDER lane → the issuer / HR records what happened in the room. It may NEVER be `esign`
--     (an e-signature is made by the signer or it is not an e-signature) and it may NEVER carry
--     `employee_statement` (that is the employee's own words, forever). It writes its own
--     `hr.workflow_decision` naming the recorder and closes the step, which routes into the same
--     single apply.
--
-- 🚨 THE NO-LOGIN REFUSAL IS KEPT EXACTLY AS IT IS. `no_login_for_esign` in the issue door is an
-- ACTIVE, REASONED refusal — kiosk-only staff are first-class here and nothing may assume
-- `login_user_id IS NOT NULL`. The acknowledge door asks the same question the same way and
-- returns the same named reason with the same `permitted_kinds`, so the two doors tell one story.
--
-- ── A CONSEQUENCE, RECORDED RATHER THAN DISCOVERED LATER ──────────────────────────────────────
-- The flow type sets `digest_fn = hr.wf_digest_whole_row` and `on_target_change = 'restart'`. So
-- recording an OUTCOME on a corrective action whose acknowledgment is still open changes the row
-- digest and the engine restarts the ack step. That is correct and deliberate: a person must sign
-- the record as it now reads, not as it read yesterday. It is stated here so the next reader does
-- not file it as a bug.

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 1 — the published routing: v2, acknowledgment only.
-- ──────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_sys uuid := '39c38960-d30c-4840-b0c1-c9960de95582';
  v_v1  uuid;
  v_v2  uuid;
begin
  perform hr.arm_write();

  select id into v_v1 from hr.workflow_definition
   where flow_key = 'corrective_action_ack' and definition_version = 1
     and organization_id = v_sys and deleted_at is null;

  -- IDEMPOTENCE GUARD: a second run finds v2 already published and does nothing.
  select id into v_v2 from hr.workflow_definition
   where flow_key = 'corrective_action_ack' and definition_version = 2
     and organization_id = v_sys and deleted_at is null;

  -- 🚨 RETIRE BEFORE PUBLISH — ORDER IS ENFORCED BY THE DATABASE, NOT BY TASTE.
  -- `workflow_definition_published_uq` is UNIQUE (organization_id, flow_key) WHERE published, so
  -- an employer may hold exactly ONE published definition per flow at a time. Inserting v2 first
  -- fails on that index (proven: this file's first apply attempt died on it, transactionally, and
  -- committed nothing). §1.2's publishing rule is therefore a swap, not an addition — which is
  -- also why the instance assertion sits ahead of both: retiring v1 while something is pinned to
  -- it would orphan a live request, and that must stop the migration rather than be discovered.
  -- v1 is RETIRED, never deleted. The row is evidence of what used to route.
  if v_v1 is not null and v_v2 is null then
    if exists (select 1 from hr.workflow_instance where workflow_definition_id = v_v1) then
      raise exception 'hr_l1_74: corrective_action_ack v1 has live instances; retiring it would '
                      'orphan them. Investigate before re-running.';
    end if;
    update hr.workflow_definition
       set status = 'retired', retired_at = coalesce(retired_at, now()),
           notes = coalesce(notes,'') || ' — RETIRED by hr_l1_74: superseded by v2.'
     where id = v_v1 and status <> 'retired';
  end if;

  if v_v2 is null then
    insert into hr.workflow_definition
      (flow_key, name, definition_version, status, effective_from, published_at,
       notes, sla_hours, reminder_cadence_hours, reminder_max, on_expiry,
       skip_absent_approver, allow_bulk_decide, organization_id, metadata)
    select 'corrective_action_ack',
           'Corrective action — acknowledgment (platform default)',
           2, 'published', current_date, now(),
           'v2 drops the `issue` step. The issuance is not a workflow decision — it is a door '
        || 'with an authority gate (hr._l1_write_gate, corrective_action.issue) and an audit row, '
        || 'and SPEC-EMPLOYEES §4.8 has no approval node between "saved" and "acknowledgment '
        || 'kind". v1 held the acknowledgment behind an all-quorum approval of an act that had '
        || 'already happened. See migration hr_l1_74.',
           d.sla_hours, d.reminder_cadence_hours, d.reminder_max, d.on_expiry,
           d.skip_absent_approver, d.allow_bulk_decide, v_sys, '{}'::jsonb
      from hr.workflow_definition d where d.id = v_v1
    returning id into v_v2;

    -- the acknowledge step, copied field-for-field from v1 so nothing is silently re-tuned
    insert into hr.workflow_step_definition
      (workflow_definition_id, step_key, label, step_order, parallel_group, quorum_kind, quorum_n,
       condition, is_optional, allows_self, requires_reason, resolver_kind, authority_action,
       resolver_config, fallback_chain, sla_hours, reminder_cadence_hours, escalate_after_hours,
       escalation_resolver_kind, escalation_config, autonomy_mode, auto_decide_rule,
       timeout_action, result_window_hours, organization_id, metadata)
    select v_v2, sd.step_key, sd.label, 10, sd.parallel_group, sd.quorum_kind, sd.quorum_n,
           sd.condition, sd.is_optional, sd.allows_self, sd.requires_reason, sd.resolver_kind,
           sd.authority_action, sd.resolver_config, sd.fallback_chain, sd.sla_hours,
           sd.reminder_cadence_hours, sd.escalate_after_hours, sd.escalation_resolver_kind,
           sd.escalation_config, sd.autonomy_mode, sd.auto_decide_rule, sd.timeout_action,
           sd.result_window_hours, v_sys, sd.metadata
      from hr.workflow_step_definition sd
     where sd.workflow_definition_id = v_v1 and sd.step_key = 'acknowledge'
       and sd.deleted_at is null;

    update hr.workflow_flow_type
       set default_definition_id = v_v2
     where flow_key = 'corrective_action_ack' and organization_id = v_sys;
  end if;

  -- v1 is retired, never deleted. Zero instances were ever pinned to it (verified at apply time).
  if v_v1 is not null then
    if exists (select 1 from hr.workflow_instance where workflow_definition_id = v_v1) then
      raise exception 'hr_l1_74: corrective_action_ack v1 has live instances; retiring it would '
                      'orphan them. Investigate before re-running.';
    end if;
    update hr.workflow_definition
       set status = 'retired', retired_at = coalesce(retired_at, now()),
           notes = coalesce(notes,'') || ' — RETIRED by hr_l1_74: superseded by v2.'
     where id = v_v1 and status <> 'retired';
  end if;
end $$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 2 — the ONE writer learns the rest of the acknowledgment facts.
--
-- `hr.corrective_ack_wf_apply` already wrote the three columns that matter and already carried
-- the write-once coalesce. It did not carry the witness, the refusal note, the uploaded signed
-- copy, or WHO recorded an off-platform acknowledgment — so those facts had nowhere to land and
-- the surfaces that collected them (the panel's witness field, verified live, was captured into
-- component state and never sent anywhere) were decorative. They go on `metadata`, write-once by
-- the same rule, because there are no columns for them and inventing four is not this file's job.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION hr.corrective_ack_wf_apply(p_instance_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  inst hr.workflow_instance%rowtype; v_action uuid; v_kind text; v_decision text;
  v_facts jsonb;
begin
  select * into inst from hr.workflow_instance where id = p_instance_id;
  if inst.id is null then return jsonb_build_object('ok', false, 'reason', 'instance_missing'); end if;
  v_action := inst.target_id;
  v_kind := coalesce(inst.payload ->> 'acknowledgement_kind', 'esign');
  v_decision := coalesce(inst.payload ->> 'decision', 'acknowledged');

  -- Only the keys that are actually present travel. An absent witness must not overwrite a
  -- recorded one with null on a restart.
  v_facts := jsonb_strip_nulls(jsonb_build_object(
    'kind',                v_kind,
    'decision',            v_decision,
    'witness_name',        nullif(inst.payload ->> 'witness_name',''),
    'witness_employment_id', nullif(inst.payload ->> 'witness_employment_id',''),
    'signed_file_id',      nullif(inst.payload ->> 'signed_file_id',''),
    'refusal_note',        nullif(inst.payload ->> 'refusal_note',''),
    'recorded_by_employment_id', nullif(inst.payload ->> 'recorded_by_employment_id',''),
    'recorded_off_platform', inst.payload -> 'recorded_off_platform',
    'workflow_instance_id', p_instance_id::text));

  perform hr.arm_write();
  update hr.corrective_action set
    employee_acknowledged_at = case when v_decision = 'refused' then employee_acknowledged_at
                                    else coalesce(employee_acknowledged_at, now()) end,
    employee_acknowledgement_kind = case when v_decision = 'refused' then 'refused'
                                         else coalesce(employee_acknowledgement_kind, v_kind) end,
    -- write-once: the issuer can never edit the subject's statement, and neither can a re-run
    employee_statement = coalesce(employee_statement, nullif(inst.payload ->> 'employee_statement','')),
    esign_request_id = case when v_kind = 'esign'
                            then coalesce(esign_request_id,
                                          nullif(inst.payload ->> 'esign_request_id','')::uuid)
                            else esign_request_id end,
    -- 🚨 WRITE-ONCE TOO, AND FOR THE SAME REASON. `||` on the right of the coalesce would let a
    -- restart quietly rewrite who witnessed a signature that was already recorded.
    metadata = case when metadata ? 'acknowledgement' then metadata
                    else metadata || jsonb_build_object('acknowledgement', v_facts) end
  where id = v_action;

  if not found then
    return jsonb_build_object('ok', false, 'failure_class', 'apply_failed',
      'reason', 'corrective_action_missing');
  end if;
  return jsonb_build_object('ok', true, 'corrective_action_id', v_action, 'outcome', v_decision);
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 3 — the issue door LAUNCHES the acknowledgment. One added block; everything else is
-- byte-identical to the shipped body.
--
-- The launch is the LAST thing the door does, after the row exists, exactly as
-- `hr.leave_request_submit` does it — same `hr.wf_request(...)` call shape, same idempotency
-- handling, same "the engine already submitted, do not submit twice" rule.
--
-- 🚨 A FAILED LAUNCH DOES NOT ROLL BACK THE ISSUANCE, AND IT DOES NOT LIE ABOUT IT EITHER. The
-- corrective action is a real record of a real conversation; throwing it away because a routing
-- definition was mis-seeded would destroy evidence. The door returns `ok:true` with
-- `acknowledgement_workflow: {launched:false, reason:…}` and the surface says the action was
-- recorded but the person has not been asked to sign it yet. Silence there would be the same
-- class of defect this whole migration exists to close.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_corrective_action_issue(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid(); v_employment uuid := (p_payload ->> 'employment_id')::uuid;
  v_org uuid; v_gate jsonb; v_id uuid; v_level text := p_payload ->> 'level';
  v_ack text := nullif(p_payload ->> 'acknowledgement_kind','');
  v_login uuid; v_skip text; v_prior text; v_door text;
  v_incident_on date; v_issued_on date;
  v_wf jsonb; v_inst uuid;
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

  -- 🚨 THE EDGE THAT DID NOT EXIST (hr_l1_74). §4.8 node E → F: the moment the record is saved,
  -- the subject must be ASKED. ONE workflow engine, ONE inbox — this door declares a flow type,
  -- it never builds a queue. `hr.wf_request` submits the instance itself, so nothing calls
  -- `hr.wf_submit` after it. The idempotency key is the action's own id, so a retry of this door
  -- can never mint a second acknowledgment for one record.
  v_wf := hr.wf_request('corrective_action_ack', 'hr_corrective_action', v_id, v_org,
                        jsonb_build_object(
                          'acknowledgement_kind', coalesce(v_ack,
                            case when v_login is null then 'wet_signature' else 'esign' end),
                          'level', v_level,
                          'subject_has_login', v_login is not null,
                          'ack_due_days',
                            (hr._knob('hr.relations','corrective_action_ack_due_days') #>> '{}')::int),
                        v_employment, false, 'corrective_action_ack:' || v_id::text);
  v_inst := nullif(v_wf ->> 'instance_id','')::uuid;

  return jsonb_build_object('ok', true, 'corrective_action_id', v_id, 'entry_door', v_door,
    'level', v_level, 'prior_level', v_prior,
    'ladder_skip_posture', v_skip,
    'subject_has_login', v_login is not null,
    'permitted_acknowledgement_kinds', case when v_login is null
      then jsonb_build_array('wet_signature','verbal_witnessed','refused')
      else jsonb_build_array('esign','wet_signature','verbal_witnessed','refused') end,
    'ack_due_days', (hr._knob('hr.relations','corrective_action_ack_due_days') #>> '{}')::int,
    'workflow_instance_id', v_inst,
    -- The record stands either way; whether the person has been ASKED is a separate, stated fact.
    'acknowledgement_workflow', jsonb_build_object(
      'launched', v_inst is not null,
      'reason', case when v_inst is null then coalesce(v_wf ->> 'reason','wf_request_failed') end,
      'detail', case when v_inst is null then v_wf ->> 'detail' end),
    'audit_id', hr._l1_write_audit(v_org, 'hr_corrective_action', 'create', ARRAY[v_id],
                                   v_employment, 'corrective_action', 'restricted'));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 4 — the door that did not exist.
--
-- ARGUMENT SHAPE. `(p_id uuid, p_payload jsonb)` — the SAME shape as
-- `hr_corrective_action_outcome(p_id, p_outcome, p_payload)`, deliberately, so the two doors on
-- one record do not speak two dialects. The client's old call sent six flat `p_*` arguments to a
-- function that never existed; the guard shipped with this migration now compares every HR call
-- site's argument names against pg_proc so a fifth instance of that cannot reach production.
-- ──────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_corrective_action_acknowledge(p_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'hr'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_org uuid; v_subject uuid; v_login uuid; v_ack_at timestamptz; v_stmt text;
  v_kind text := nullif(p_payload ->> 'kind','');
  v_statement text := nullif(btrim(coalesce(p_payload ->> 'employee_statement','')), '');
  v_permitted jsonb;
  v_inst uuid; v_step uuid; v_is_subject boolean; v_caller_emp uuid; v_gate jsonb;
  v_decision text; v_res jsonb; v_reason text; v_dec uuid;
  st hr.workflow_step%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_caller');
  end if;

  select ca.organization_id, ca.employment_id, ca.employee_acknowledged_at, ca.employee_statement
    into v_org, v_subject, v_ack_at, v_stmt
    from hr.corrective_action ca where ca.id = p_id and ca.deleted_at is null;
  if v_org is null then return jsonb_build_object('ok', false, 'reason', 'not_reachable'); end if;

  select e.login_user_id into v_login from hr.employment em
    join hr.employee e on e.id = em.employee_id where em.id = v_subject;

  -- 🚨 THE SAME QUESTION THE ISSUE DOOR ASKS, ANSWERED THE SAME WAY. RECORDED DECISION 18 is an
  -- active refusal, not a legacy quirk: no login means no lane to an e-signature, and the two
  -- doors must never disagree about which kinds are on the table.
  v_permitted := case when v_login is null
    then jsonb_build_array('wet_signature','verbal_witnessed','refused')
    else jsonb_build_array('esign','wet_signature','verbal_witnessed','refused') end;

  if v_kind is null then
    return jsonb_build_object('ok', false, 'reason', 'validation', 'field', 'kind',
      'detail', 'An acknowledgment has to say HOW it happened.',
      'permitted_acknowledgement_kinds', v_permitted);
  end if;
  if v_kind = 'esign' and v_login is null then
    return jsonb_build_object('ok', false, 'reason', 'no_login_for_esign',
      'detail', 'This person has no platform login, so they cannot e-sign. Use a wet signature '
             || 'or a witnessed verbal acknowledgment; the printed copy is the delivery.',
      'permitted_kinds', jsonb_build_array('wet_signature','verbal_witnessed'));
  end if;
  if not (v_permitted ? v_kind) then
    return jsonb_build_object('ok', false, 'reason', 'acknowledgement_kind_not_permitted',
      'field', 'kind', 'kind', v_kind,
      'detail', format('%s is not an acknowledgment this record can carry.', v_kind),
      'permitted_acknowledgement_kinds', v_permitted);
  end if;

  -- who is calling: the subject, or somebody recording on their behalf
  v_caller_emp := hr._l1_self_employment(v_uid, v_org, current_date);
  v_is_subject := v_login is not null and v_login = v_uid;

  -- 🚨 §4.8 G2 AT THE DOOR. The statement is the employee's own words and the issuer can never
  -- edit it — so it only ever travels on the subject's own call. The apply function's coalesce is
  -- the structural backstop; this is the sentence a person reads.
  if v_statement is not null and not v_is_subject then
    return jsonb_build_object('ok', false, 'reason', 'statement_is_the_employees_own',
      'field', 'employee_statement',
      'detail', 'Only the person this concerns can write their own statement. It is their words '
             || 'beside yours, and nobody else may add to it or change it.');
  end if;
  -- WRITE-ONCE, NAMED. A second statement is refused here with a sentence rather than being
  -- silently swallowed by the coalesce downstream.
  if v_statement is not null and nullif(btrim(coalesce(v_stmt,'')),'') is not null then
    return jsonb_build_object('ok', false, 'reason', 'statement_already_recorded',
      'field', 'employee_statement',
      'detail', 'Your statement on this record is already written. It is kept exactly as you '
             || 'wrote it and it cannot be replaced — by you or by anybody else.');
  end if;

  if not v_is_subject then
    -- the recorder lane: it needs the standing that writes this record at all
    v_gate := hr._l1_write_gate(v_org, 'corrective_action.issue', v_subject,
                                'hr_corrective_action', 'update', 'corrective_action');
    if v_gate is not null then return v_gate; end if;
    -- 🚨 AND IT MAY NEVER E-SIGN FOR SOMEBODY. An e-signature whose evidence package names a
    -- signer who did not press the button is not an e-signature; it is a forgery with timestamps.
    if v_kind = 'esign' then
      return jsonb_build_object('ok', false, 'reason', 'esign_is_the_signers_own',
        'field', 'kind',
        'detail', 'Only the person signing can e-sign. If they signed on paper record a wet '
               || 'signature; if they said it out loud record a witnessed verbal.',
        'permitted_acknowledgement_kinds',
          jsonb_build_array('wet_signature','verbal_witnessed','refused'));
    end if;
  end if;

  -- ---- the open acknowledgment step on this record's own instance
  select b.workflow_instance_id into v_inst
    from hr.workflow_binding b
   where b.target_token = 'hr_corrective_action' and b.target_id = p_id
     and b.flow_key = 'corrective_action_ack' and b.is_open
   limit 1;
  if v_inst is null then
    -- 🚨 A DOOR THAT CANNOT ACT SAYS SO AND SAYS WHAT TO DO. Every corrective action issued
    -- BEFORE hr_l1_74 was written without an instance, because nothing launched one.
    return jsonb_build_object('ok', false, 'reason', 'no_acknowledgement_workflow',
      'detail', 'There is no open acknowledgment on this record, so there is nothing to sign. '
             || 'Records issued before the acknowledgment flow was wired have none; issue the '
             || 'step again to open one.',
      'corrective_action_id', p_id,
      'already_acknowledged', v_ack_at is not null);
  end if;

  select * into st from hr.workflow_step
   where workflow_instance_id = v_inst and step_key = 'acknowledge' and state = 'active'
   order by step_order limit 1;
  if st.id is null then
    return jsonb_build_object('ok', false, 'reason', 'WF_STEP_CLOSED',
      'detail', 'This acknowledgment is no longer open for a decision.',
      'workflow_instance_id', v_inst,
      'already_acknowledged', v_ack_at is not null);
  end if;
  v_step := st.id;

  -- 🚨 THE FACTS GO ON THE INSTANCE, BECAUSE THE INSTANCE IS WHAT THE ONE WRITER READS.
  -- `hr.wf_decide` records its `p_payload` as the decision's `client_context`, which is evidence
  -- of what the CLIENT sent — it is not the instance payload and `hr.corrective_ack_wf_apply`
  -- does not read it. Merging here, before the decision, is the only way the apply sees them.
  -- This touches no column of `hr.corrective_action`, so the target digest is unchanged and the
  -- engine's §3.4 target-changed guard does not fire on our own staging.
  v_decision := case when v_kind = 'refused' then 'refused' else 'acknowledged' end;
  perform hr.arm_write();
  update hr.workflow_instance
     set payload = payload || jsonb_strip_nulls(jsonb_build_object(
           'acknowledgement_kind', v_kind,
           'decision', v_decision,
           'employee_statement', v_statement,
           'refusal_note', nullif(btrim(coalesce(p_payload ->> 'refusal_note','')),''),
           'witness_name', nullif(btrim(coalesce(p_payload ->> 'witness_name','')),''),
           'witness_employment_id', nullif(p_payload ->> 'witness_employment_id',''),
           'signed_file_id', nullif(p_payload ->> 'signed_file_id',''),
           'esign_request_id', nullif(p_payload ->> 'esign_request_id',''),
           'recorded_off_platform', to_jsonb(not v_is_subject),
           'recorded_by_employment_id',
             case when v_is_subject then null else v_caller_emp::text end))
   where id = v_inst;

  v_reason := case
    when v_kind = 'refused' and v_is_subject then 'declined to sign'
    when v_kind = 'refused' then 'declined to sign; recorded by the issuer'
    when v_is_subject then null
    else format('%s recorded off-platform', replace(v_kind, '_', ' ')) end;

  if v_is_subject then
    -- ---- THE SUBJECT'S OWN ACT. Straight through the engine, with every guard it carries.
    -- `acknowledged` is the engine's vocabulary for an attestation-shaped act; a REFUSAL is still
    -- `acknowledged` at this layer and `refused` in the payload, because §4.8 F4 is explicit that
    -- a refusal is a valid OUTCOME and never a blocked flow. Sending `rejected` here would close
    -- the instance as rejected and skip the apply entirely — the record would then say nothing at
    -- all about a person who deliberately said no.
    v_res := hr.wf_decide(v_step, 'acknowledged', v_reason, '{}'::jsonb);
    if not coalesce((v_res ->> 'granted')::boolean, false) then
      return jsonb_build_object('ok', false,
        'reason', coalesce(v_res ->> 'reason','wf_decide_refused'),
        'detail', v_res ->> 'detail', 'workflow', v_res);
    end if;
  else
    -- ---- THE RECORDER'S ACT. §4.8 F2/F3/F4 happen in a room, not in a browser: the subject is
    -- not a resolved approver of an event that already occurred somewhere else, and pretending
    -- they pressed a button they never saw would put a false actor on an audit trail. So the
    -- decision row names the RECORDER, the event says the acknowledgment came from off-platform
    -- and why, and the step is closed — which routes into the SAME single apply. Nothing here
    -- writes `hr.corrective_action`.
    insert into hr.workflow_decision
      (organization_id, workflow_instance_id, workflow_step_id, step_key, decision, reason,
       actor_type, actor_user_id, actor_employment_id, approval_basis, autonomy_mode,
       target_digest, client_context)
    values (v_org, v_inst, v_step, 'acknowledge', 'acknowledged', v_reason,
            'hr_admin', v_uid, v_caller_emp, 'authority', st.autonomy_mode,
            (select target_digest from hr.workflow_instance where id = v_inst),
            jsonb_build_object('recorded_off_platform', true, 'kind', v_kind))
    returning id into v_dec;

    perform hr._wf_event(v_inst, v_step, 'decided', 'active', null, 'hr_admin', v_uid, v_caller_emp,
      jsonb_build_object('decision', 'acknowledged', 'decision_id', v_dec,
        'basis', 'authority', 'kind', v_kind, 'recorded_off_platform', true,
        'why', case when v_login is null
                    then 'the subject holds no platform login, so the acknowledgment could only '
                      || 'happen off-platform (RECORDED DECISION 18)'
                    else 'the acknowledgment happened in person and is being recorded by the '
                      || 'issuer' end));

    v_res := hr._wf_close_step(v_step, 'approved', v_reason);
  end if;

  return jsonb_build_object('ok', true, 'corrective_action_id', p_id,
    'kind', v_kind, 'outcome', v_decision,
    'recorded_off_platform', not v_is_subject,
    'statement_recorded', v_statement is not null,
    'workflow_instance_id', v_inst, 'workflow_step_id', v_step,
    'workflow', v_res,
    -- read back what the ONE writer actually wrote, so the caller never has to assume
    'employee_acknowledged_at',
      (select ca.employee_acknowledged_at from hr.corrective_action ca where ca.id = p_id),
    'employee_acknowledgement_kind',
      (select ca.employee_acknowledgement_kind from hr.corrective_action ca where ca.id = p_id),
    'audit_id', hr._l1_write_audit(v_org, 'hr_corrective_action', 'update', ARRAY[p_id],
                                   v_subject, 'corrective_action', 'restricted'));
end
$function$;

-- ──────────────────────────────────────────────────────────────────────────────────────────
-- PART 5 — REGISTER BEFORE YOU GRANT.
--
-- The DDL guard strips an EXECUTE grant on a function that is not declared a client door, so the
-- registry row goes in FIRST and the grant second. Order is load-bearing, not stylistic.
-- ──────────────────────────────────────────────────────────────────────────────────────────
insert into platform.client_callable_door
  (schema_name, function_name, identity_args, declared_by, reason)
values
  ('public', 'hr_corrective_action_acknowledge', 'p_id uuid, p_payload jsonb', 'hr_l1_74',
   'SPEC-EMPLOYEES §4.8 F/G. The subject acknowledges (or declines) their own corrective action '
   || 'from /hr/tasks, and the issuer records a wet signature or a witnessed verbal for a subject '
   || 'with no login. It authorizes inside the door: the subject is identified by '
   || 'hr.employee.login_user_id = auth.uid(); any other caller passes hr._l1_write_gate on '
   || 'corrective_action.issue and may never e-sign and may never touch employee_statement. It '
   || 'writes nothing itself — hr.corrective_ack_wf_apply stays the one writer.'),
  ('public', 'hr_corrective_action_issue', 'p_payload jsonb', 'hr_l1_74',
   'Re-declared by hr_l1_74, which replaced the body to launch the acknowledgment workflow. A '
   || 'manager or employee_relations issues a corrective action from a profile or from '
   || '/hr/people/relations; gated inside the door by hr._l1_write_gate on '
   || 'corrective_action.issue (§4.8 node B).'),
  ('public', 'hr_corrective_action_outcome', 'p_id uuid, p_outcome text, p_payload jsonb', 'hr_l1_74',
   'SPEC-EMPLOYEES §4.8 node I. The issuer closes the loop: resolved / escalated / expired / '
   || 'rescinded / led_to_separation. Gated inside the door by hr._l1_write_gate on '
   || 'corrective_action.issue. Declared here because it was callable and grant-bearing but had '
   || 'never been registered.'),
  ('public', 'hr_relations_list', 'p_organization_id uuid, p_filter jsonb, p_limit integer', 'hr_l1_74',
   'SPEC-EMPLOYEES §2.2 route 15. The Employee Relations queue: corrective actions and incidents '
   || 'in one list, each side asked at ITS OWN registry tier so the confidential/restricted split '
   || 'cannot raise. Standing in the employer is checked before the door is consulted; capability '
   || 'stays with hr._door_list. Declared here because the client had been calling '
   || 'hr_restricted_list with a confidential-tier token instead and swallowing the 400.')
on conflict do nothing;

grant execute on function public.hr_corrective_action_acknowledge(uuid, jsonb) to authenticated;
revoke all on function public.hr_corrective_action_acknowledge(uuid, jsonb) from public, anon;

-- hr_l1_76 — THE REASON CATEGORY HAD NO READER.
--
-- RECORD of a live change applied on 2026-08-29 to db.matrxserver.com.
-- Follows hr_l1_74, which is where the rest of the corrective-action repair lives.
--
-- 🚨 A FIELD ON THE FORM THAT NOTHING COULD EVER SAVE. SPEC-EMPLOYEES §4.8 node C lists
-- `reason category` among the things the issuer fills in, and
-- `NewCorrectiveActionDialog` has always rendered the control and always sent
-- `reason_category` in the payload. `public.hr_corrective_action_issue` never read that key
-- and `hr.corrective_action` has no column for it — so the value was dropped on the floor of
-- every call, silently, exactly like `subject_employment_id` beside it. It surfaced when the
-- new HR RPC conformance guard (`scripts/hr/hrb026_rpc_conformance.ts`) reported it as a
-- PAYLOAD KEY NEVER READ.
--
-- 🚨 THE CHOICE WAS SAVE IT OR DELETE THE CONTROL, AND SILENTLY DELETING A SPEC'D FIELD IS
-- NOT A REPAIR. The spec asks for it and an issuer reasonably expects a categorised reason to
-- be part of the record they are creating. It lands on `metadata`, where the entry door
-- already lives, rather than growing a column and a dimension for a free-text field whose
-- vocabulary nobody has ruled on yet — that decision belongs to whoever rules D-4, and this
-- migration deliberately does not pre-empt it. If it later becomes a `platform.categories`
-- dimension, the metadata key is the thing that gets backfilled from.
--
-- Everything else in this body is byte-identical to hr_l1_74's.
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
    -- 🚨 hr_l1_76: the reason category is RECORDED rather than dropped. `jsonb_strip_nulls`
    -- so an absent reason leaves no empty key behind pretending one was given.
    jsonb_strip_nulls(jsonb_build_object(
      'entry_door', v_door,
      'reason_category', nullif(btrim(coalesce(p_payload ->> 'reason_category','')), ''))))
  returning id into v_id;

  -- The edge hr_l1_74 added: §4.8 node E -> F. ONE workflow engine, ONE inbox. `hr.wf_request`
  -- submits the instance itself, so nothing calls `hr.wf_submit` after it. The idempotency key
  -- is the action's own id, so a retry can never mint a second acknowledgment for one record.
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

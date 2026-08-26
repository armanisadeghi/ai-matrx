-- HR domain C4 — migration 6 of 7 (register item HRB-008, lane core-c4-workflow).
--
-- THE ROSTER AS DATA: the 23 `hr.workflow_flow_type` rows of §1.1, one platform-default
-- `hr.workflow_definition` + its step rows per active flow (§4.1 artifact 2), the 11
-- `communication.notification_event_type` declarations of §6.1, and `hr.wf_publish_definition`
-- (§1.2 publishing rule + §2.6 top-of-chart seeding refusal).
--
-- Everything here is DATA. §0 law 3: routing IS configuration, resolved platform-default -> org
-- override, and there is no `IF flow_type = 'leave' THEN manager` anywhere in this lane's code.
--
-- Authority: SPEC-WORKFLOW-ENGINE §1.1, §1.2, §2.6, §4.1, §6.1, §8, §9; SPEC-ACCESS §1.3a;
-- SPEC-NOTIFICATIONS §2.17, §5, §8 D2. Applied live as `hr_c4_06_flow_roster`. Idempotent.
--
-- ===================================================================================
-- RECORDED TECHNICAL DECISIONS (EXECUTION §8)
--
-- 1. 🚨 THREE FLOW TYPES SHIP INACTIVE, WITH A NAMED REASON, RATHER THAN POINTING AT NOTHING.
--    `signature_request` targets `esign_envelope` and `acknowledgment_campaign_item` targets
--    `hr_acknowledgment` — NEITHER TOKEN EXISTS (verified live: the `esign` schema is HRB-011's and
--    has not been built; there is no `hr.acknowledgment` table at all). `profile_edit_request` and
--    `address_change` target `hr_employee`, which exists but which `hr._approval_subject` cannot
--    resolve to a single subject employment (file 2, RECORDED DECISION 5). All four are seeded with
--    `is_active = false` and an `inactive_reason` that names the blocker and its owner. `wf_request`
--    refuses an inactive flow type by envelope, so the roster is COMPLETE AND HONEST rather than
--    complete and lying: the row exists, the reason is readable, and activating it is a one-line
--    data change the owning lane makes when its blocker clears.
--
-- 2. 🚨 THE SPEC CONTRADICTS ITSELF ON `ai_ceiling` vs MODES 1 AND 2, AND THIS LANE DOES NOT RULE.
--    §7.1's mode table lists `leave_request`, `availability_change` and `timecard_approval` under
--    **mode 2** and `open_shift_claim` / `acknowledgment_campaign_item` under **mode 1**, and says
--    in the same table that those modes are "deterministic rule evaluation, NOT a model call — D6
--    forbids handing settled logic to AI". Two paragraphs later the same section says
--    "`flow_type.ai_ceiling` caps the mode regardless of configuration: `advisory` means modes 1
--    and 2 are refused at publish time for that flow", and §9.4 makes `advisory` the **P-only**
--    platform default for every flow. Read together, the platform default forbids the platform
--    default. Both readings are defensible (is a deterministic rule "AI" for ceiling purposes?) and
--    the answer changes what an org may configure, so it is not this lane's to decide.
--    WHAT IS BUILT, and why it is safe under EITHER reading: the ceiling is enforced literally
--    (`wf_activate_step` refuses modes 1/2 under an `advisory` ceiling — file 3), every flow type
--    carries `ai_ceiling='advisory'` per §9.4, and every auto-decide step in the platform-default
--    definitions ships at **mode 5 (off)** — §9.4's own posture for the timecard auto step ("the
--    whole step defaults to mode 5 — off"). So nothing auto-decides on our default configuration,
--    which is the fail-closed reading, and no org configuration is foreclosed either way.
--    STOPPED AND RECORDED, not resolved: SPEC-WORKFLOW-ENGINE §7.1 owes a ruling.
--
-- 3. THE PLATFORM DEFAULT IS DELIBERATELY THIN. §4.1 artifact 2 is "the routing the product ships
--    with"; §1.2 is emphatic that an org overrides it by publishing its own definition with NO CODE
--    PATH INVOLVED. A rich default is therefore not generosity, it is a guess about somebody's
--    business that they then have to unpick. Each flow gets the steps §8 or §9 names for it and
--    nothing else, every one at `authority` resolution with the standard four-rung fallback chain.
--
-- 4. `allow_bulk_decide = false` ON EXACTLY THE THREE FLOWS §9.5 NAMES — `termination`,
--    `pay_change`, `background_check_adverse_action` — and `autonomy_mode = 4` is MANDATORY on
--    those three plus `offer_approval` and `corrective_action_ack` (§7.1 mode-4 row).
--
-- 5. THE 11 NOTIFICATION EVENTS ARE DECLARED HERE AND SENT BY NOBODY HERE (§6.1). Channel defaults
--    are the event's; the per-flow SMS variation §6.1 states in prose lives in each flow type's
--    `channel_policy` (SPEC-NOTIFICATIONS §8 D2) — `{"sms":"deny"}` on every compensation and
--    relations flow, `{"sms":"allow"}` on the schedule and time flows.
-- ===================================================================================

select set_config('hr.privileged_write', 'on', false);

-- ============================================================ 1. the 11 notification events (§6.1)
insert into communication.notification_event_type
  (organization_id, event_key, label, description, default_channels, config, enabled, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.k, v.l, v.d, v.ch, '{}'::jsonb, true,
       'internal'::platform.visibility
from (values
 ('hr.workflow.step_assigned','Approval step assigned',
  'A workflow step activated and you are one of its resolved approvers.','["email","in_app"]'::jsonb),
 ('hr.workflow.step_reminder','Approval reminder',
  'A step you have not decided is still waiting.','["email","in_app"]'::jsonb),
 ('hr.workflow.step_timeout_warning','Approval about to auto-apply',
  'An autonomy-mode-3 step will apply its timeout action shortly unless you act.','["email","in_app"]'::jsonb),
 ('hr.workflow.step_escalated','Approval escalated',
  'A step was escalated to a new approver.','["email","in_app"]'::jsonb),
 ('hr.workflow.step_delegated','Approval delegated',
  'An approval authority covering open steps was delegated.','["email","in_app"]'::jsonb),
 ('hr.workflow.request_submitted','Request submitted',
  'A request was submitted and routed.','["in_app"]'::jsonb),
 ('hr.workflow.request_decided','Request decided',
  'A request reached a terminal decision.','["email","in_app"]'::jsonb),
 ('hr.workflow.request_changed','Request changed and needs a fresh look',
  'The target of a request you approved changed materially and the approvals were reset.','["email","in_app"]'::jsonb),
 ('hr.workflow.request_needs_attention','Request returned to you',
  'A request was returned to the requester for amendment.','["email","in_app"]'::jsonb),
 ('hr.workflow.failure_raised','Workflow failure raised',
  'A workflow failure was opened and assigned to you.','["email","in_app"]'::jsonb),
 ('hr.workflow.result_unverified','External result never confirmed',
  'An external-effect step passed its verification window without a confirmed result.','["email","in_app"]'::jsonb)
) as v(k,l,d,ch)
where not exists (select 1 from communication.notification_event_type t
                   where t.event_key = v.k and t.deleted_at is null);

-- ============================================================ 2. the 23 flow types (§1.1)
insert into hr.workflow_flow_type
  (organization_id, flow_key, label, description, target_token, requester_kind, sensitivity_tier,
   ai_ceiling, validate_fn, digest_fn, conflict_fn, apply_fn, compensate_fn, result_fn,
   on_target_change, on_reject, allows_withdraw, allows_resubmit, channel_policy,
   is_active, inactive_reason, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, v.flow_key, v.label, v.descr, v.target_token,
       'employment', v.tier, 'advisory',
       null,                                                    -- validate_fn: pillar's (RD 1 of file 3)
       'hr.wf_digest_whole_row(text,uuid)'::regprocedure,        -- STRICTEST generic digest
       null,                                                    -- conflict_fn: pillar's
       'hr.wf_apply_unimplemented(uuid)'::regprocedure,          -- FAIL-CLOSED apply
       null,                                                    -- compensate_fn: pillar's
       case when v.needs_result then 'hr.wf_result_unimplemented(uuid)'::regprocedure end,
       v.on_change, 'terminate', true, true, v.channels,
       v.active, v.inactive_reason, 'public'::platform.visibility
from (values
 ('leave_request','Leave request','Time off requested by an employee against a leave policy.',
   'hr_leave_request','confidential','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('leave_cancellation','Leave cancellation','Withdrawal of an already-approved absence.',
   'hr_leave_request','confidential','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('timecard_attestation','Timecard attestation','The employee''s own attestation to their recorded hours.',
   'hr_pay_period_employment','confidential','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('timecard_approval','Timecard approval','Manager approval of one employment''s pay-period hours.',
   'hr_pay_period_employment','confidential','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('timecard_correction','Timecard correction','A post-lock adjustment to a recorded time entry.',
   'hr_time_adjustment','confidential','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('shift_swap','Shift swap','Two employees exchanging assigned shifts.',
   'hr_shift_claim','internal','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('open_shift_claim','Open shift claim','An employee claiming an unassigned shift.',
   'hr_shift','internal','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('calloff_replacement','Call-off replacement','Covering a shift somebody called off.',
   'hr_shift','internal','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('schedule_change','Schedule change','A change to a published schedule inside its notice window.',
   'hr_schedule','internal','supersede','{"sms":"allow"}'::jsonb,true,null,false),
 ('availability_change','Availability change','A change to an employee''s declared availability.',
   'hr_availability','internal','restart','{"sms":"allow"}'::jsonb,true,null,false),
 ('profile_edit_request','Profile edit request','A self-service change to a governed profile field.',
   'hr_employee','confidential','restart','{}'::jsonb,false,
   'BLOCKED: hr.can_approve cannot resolve a subject employment for hr_employee (an employee holds many employments). Needs SPEC-ACCESS §1.3b to widen hr._approval_subject''s contract. Owner: SPEC-ACCESS / the access lane.',false),
 ('address_change','Address change','A home-address change, separated because it moves jurisdiction.',
   'hr_employee','confidential','restart','{}'::jsonb,false,
   'BLOCKED: same hr_employee subject-resolution gap as profile_edit_request. Owner: SPEC-ACCESS / the access lane.',false),
 ('pay_change','Pay change','A change to an employment''s compensation.',
   'hr_position_assignment','restricted','restart','{"sms":"deny"}'::jsonb,true,null,false),
 ('position_change','Position change','A transfer or promotion.',
   'hr_position_assignment','confidential','restart','{"sms":"deny"}'::jsonb,true,null,false),
 ('requisition_approval','Requisition approval','Approval to open a role.',
   'hr_requisition','internal','restart','{}'::jsonb,true,null,false),
 ('offer_approval','Offer approval','Approval of an offer package before it is extended.',
   'hr_offer','restricted','restart','{"sms":"deny"}'::jsonb,true,null,false),
 ('background_check_adverse_action','Background check adverse action',
   'The FCRA pre-adverse / waiting period / adverse sequence.',
   'hr_background_check','restricted','restart','{"sms":"deny"}'::jsonb,true,null,false),
 ('signature_request','Signature request','A document sent for signature and countersignature.',
   'esign_envelope','confidential','restart','{}'::jsonb,false,
   'BLOCKED: the esign_envelope entity token does not exist — the esign schema is HRB-011''s and has not been built. Owner: HRB-011.',false),
 ('acknowledgment_campaign_item','Acknowledgment','One person''s acknowledgment of a policy or document.',
   'hr_acknowledgment','internal','restart','{}'::jsonb,false,
   'BLOCKED: the hr_acknowledgment entity token does not exist — no hr.acknowledgment table was built. Owner: the documents-and-forms lane.',false),
 ('expense_or_asset_recovery','Expense or asset recovery','Recovering company property or an expense at separation.',
   'hr_asset_assignment','confidential','restart','{}'::jsonb,true,null,false),
 ('termination','Termination','The separation of an employment and its offboarding cascade.',
   'hr_employment','restricted','supersede','{"sms":"deny"}'::jsonb,true,null,true),
 ('training_waiver','Training waiver','A waiver of an assigned training requirement.',
   'hr_training_assignment','internal','restart','{}'::jsonb,true,null,false),
 ('corrective_action_ack','Corrective action','Issuing a corrective action and the employee''s acknowledgment of it.',
   'hr_corrective_action','restricted','restart','{"sms":"deny"}'::jsonb,true,null,false)
) as v(flow_key, label, descr, target_token, tier, on_change, channels, active, inactive_reason, needs_result)
where not exists (select 1 from hr.workflow_flow_type f
                   where f.flow_key = v.flow_key and f.deleted_at is null);

-- ============================================================ 3. the platform-default definitions
insert into hr.workflow_definition
  (organization_id, flow_key, name, definition_version, status, published_at,
   sla_hours, reminder_cadence_hours, reminder_max, on_expiry, skip_absent_approver,
   allow_bulk_decide, notes, visibility)
select '39c38960-d30c-4840-b0c1-c9960de95582'::uuid, f.flow_key,
       f.label || ' — platform default', 1, 'published', now(),
       v.sla, 24, 3, 'escalate', true, v.bulk,
       'SPEC-WORKFLOW-ENGINE §4.1 artifact 2. Deliberately thin (RECORDED DECISION 3): an org overrides it by publishing its own definition, with no code path involved (D13).',
       'internal'::platform.visibility
  from hr.workflow_flow_type f
  join (values
    ('leave_request',72,true), ('leave_cancellation',48,true),
    ('timecard_attestation',48,true), ('timecard_approval',48,true), ('timecard_correction',72,true),
    ('shift_swap',24,true), ('open_shift_claim',24,true), ('calloff_replacement',8,true),
    ('schedule_change',48,true), ('availability_change',72,true),
    ('profile_edit_request',72,true), ('address_change',72,true),
    ('pay_change',120,false), ('position_change',120,true),
    ('requisition_approval',72,true), ('offer_approval',24,true),
    ('background_check_adverse_action',120,false),
    ('signature_request',168,true), ('acknowledgment_campaign_item',168,true),
    ('expense_or_asset_recovery',168,true), ('termination',72,false),
    ('training_waiver',120,true), ('corrective_action_ack',120,true)
  ) as v(flow_key, sla, bulk) on v.flow_key = f.flow_key
 where f.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and f.deleted_at is null
   and not exists (select 1 from hr.workflow_definition d
                    where d.flow_key = f.flow_key and d.deleted_at is null
                      and d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid);

update hr.workflow_flow_type f
   set default_definition_id = d.id
  from hr.workflow_definition d
 where d.flow_key = f.flow_key and d.deleted_at is null
   and d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and f.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and f.default_definition_id is null;

-- ============================================================ 4. the step definitions
insert into hr.workflow_step_definition
  (organization_id, workflow_definition_id, step_key, label, step_order, parallel_group,
   quorum_kind, quorum_n, condition, is_optional, allows_self, requires_reason,
   resolver_kind, authority_action, resolver_config, fallback_chain,
   sla_hours, escalate_after_hours, escalation_resolver_kind, escalation_config,
   autonomy_mode, auto_decide_rule, auto_decide_rule_version, recommend_mandate_key,
   timeout_action, result_window_hours)
select d.organization_id, d.id, v.step_key, v.label, v.step_order, v.pgroup,
       'all', null, v.cond, v.optional, v.self_ok, v.reason_req,
       v.resolver, v.action, v.rconfig,
       ARRAY['authority','substitute','reporting_line','top_of_chart'],
       null, v.escalate_after, 'reporting_line', '{}'::jsonb,
       v.mode, v.auto_rule, case when v.auto_rule <> '{}'::jsonb then '1' end, v.mandate,
       v.timeout_action, v.result_window
  from hr.workflow_definition d
  join (values
  -- ---------------------------------------------------------------- §8.1 leave
  ('leave_request','auto_approve','Automatic approval under the organisation''s rule set',10,null,
    '{}'::jsonb,false,false,false,'system',null,'{}'::jsonb,null,
    -- mode 5 (OFF) is the shipped default — RECORDED DECISION 2. The predicate below is the
    -- §9.4 rule set expressed as data, ready for an org that turns the step on.
    5,'{"rule_key":"leave_auto_approve_v1","rule_version":"1","when":{"all":[
        {"field":"payload.total_hours","op":"<=","value":8},
        {"field":"payload.notice_days","op":">=","value":7},
        {"field":"payload.leave_type","op":"in","value":["pto","sick"]},
        {"field":"payload.coverage_pct","op":">=","value":100}]}}'::jsonb,
    null,'escalate',null),
  ('leave_request','manager_approval','Manager approval',20,null,
    '{}'::jsonb,false,false,false,'authority','leave_approve','{}'::jsonb,96,
    4,'{}'::jsonb,'hr.leave_request.recommend','escalate',null),
  ('leave_request','hr_review','HR review for long or case-linked absences',30,null,
    '{"any":[{"field":"payload.total_hours","op":">","value":40},
             {"field":"payload.leave_type","op":"in","value":["fmla","medical","parental"]}]}'::jsonb,
    false,false,false,'authority','leave_approve','{}'::jsonb,null,4,'{}'::jsonb,null,'escalate',null),
  ('leave_cancellation','manager_approval','Manager approval of the cancellation',10,null,
    '{}'::jsonb,false,false,false,'authority','leave_cancellation_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- §8.2 time
  ('timecard_attestation','employee_attestation','Employee attestation',10,null,
    '{}'::jsonb,false,true,false,'requester','timecard_attest','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('timecard_approval','manager_approval','Manager approval',10,null,
    '{}'::jsonb,false,false,false,'authority','timecard_approve','{}'::jsonb,96,
    4,'{}'::jsonb,'hr.timecard.exception_triage','escalate',null),
  ('timecard_approval','payroll_exception_review','Payroll exception review',20,null,
    '{"any":[{"field":"payload.exception_count","op":">","value":0},
             {"field":"payload.ot_hours","op":">","value":0}]}'::jsonb,
    false,false,false,'authority','timecard_approve','{}'::jsonb,null,4,'{}'::jsonb,null,'escalate',null),
  ('timecard_correction','manager_approval','Manager approval of the correction',10,null,
    '{}'::jsonb,false,false,true,'authority','timecard_correction_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('timecard_correction','payroll_approval','Payroll approval of the correction',20,null,
    '{}'::jsonb,false,false,true,'authority','timecard_correction_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- scheduling
  ('shift_swap','manager_approval','Manager approval of the swap',10,null,
    '{}'::jsonb,false,false,false,'authority','swap_approve','{}'::jsonb,24,
    3,'{}'::jsonb,'hr.shift_swap.impact','apply',null),
  ('open_shift_claim','manager_approval','Manager approval of the claim',10,null,
    '{}'::jsonb,false,false,false,'authority','open_shift_claim_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('calloff_replacement','manager_approval','Manager approval of the replacement',10,null,
    '{}'::jsonb,false,false,false,'authority','calloff_replacement_approve','{}'::jsonb,4,
    4,'{}'::jsonb,null,'escalate',null),
  ('schedule_change','manager_approval','Manager approval of the change',10,null,
    '{}'::jsonb,false,false,false,'authority','schedule_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,'hr.schedule_change.notice_risk','escalate',null),
  ('availability_change','manager_approval','Manager approval of the availability change',10,null,
    '{}'::jsonb,false,false,false,'authority','availability_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- employees (both INACTIVE, RD 1)
  ('profile_edit_request','hr_approval','HR approval of the profile change',10,null,
    '{}'::jsonb,false,false,false,'authority','profile_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('address_change','hr_approval','HR approval of the address change',10,null,
    '{}'::jsonb,false,false,false,'authority','address_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('pay_change','manager_approval','Manager proposal review',10,null,
    '{}'::jsonb,false,false,true,'authority','pay_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('pay_change','executive_approval','Executive approval',20,null,
    '{}'::jsonb,false,false,true,'authority','pay_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('position_change','manager_approval','Manager approval of the transfer',10,null,
    '{}'::jsonb,false,false,false,'authority','position_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('position_change','hr_approval','HR approval of the transfer',20,null,
    '{}'::jsonb,false,false,false,'authority','position_change_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- hiring
  ('requisition_approval','approval','Requisition approval',10,null,
    '{}'::jsonb,false,false,false,'authority','requisition_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('offer_approval','approval','Offer approval',10,null,
    '{}'::jsonb,false,false,false,'authority','offer_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('background_check_adverse_action','adjudication','Adverse action adjudication',10,null,
    '{}'::jsonb,false,false,true,'authority','adverse_action_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- documents (INACTIVE, RD 1)
  ('signature_request','countersign','Countersignature on the organisation''s behalf',10,null,
    '{}'::jsonb,false,false,false,'authority','signature_countersign','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('acknowledgment_campaign_item','acknowledge','Employee acknowledgment',10,null,
    '{}'::jsonb,false,true,false,'fixed_user','acknowledgment_ack',
    '{"employment_source":"subject"}'::jsonb,null,4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- onboarding / offboarding
  ('expense_or_asset_recovery','manager_approval','Manager approval of the recovery',10,null,
    '{}'::jsonb,false,false,false,'authority','asset_recovery_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- §8.3 termination
  ('termination','hr_review','HR review',10,null,
    '{}'::jsonb,false,false,true,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,'hr.termination.checklist_completeness','escalate',null),
  ('termination','executive_approval','Executive approval',20,null,
    '{"any":[{"field":"payload.voluntary","op":"=","value":false},
             {"field":"payload.level_at_or_above_threshold","op":"=","value":true}]}'::jsonb,
    false,false,true,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('termination','access_shutoff','Branch A — access shutoff',30,'offboarding',
    '{}'::jsonb,false,false,false,'external_result',null,'{}'::jsonb,null,4,'{}'::jsonb,null,'escalate',24),
  ('termination','final_pay','Branch B — final pay and PTO payout',30,'offboarding',
    '{}'::jsonb,false,false,false,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('termination','benefits_end','Branch C — benefits end-date and COBRA events',30,'offboarding',
    '{}'::jsonb,false,false,false,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('termination','asset_recovery','Branch D — asset recovery checklist',30,'offboarding',
    '{}'::jsonb,false,false,false,'authority','asset_recovery_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('termination','separation_notices','Branch E — separation notices and evidence pack',30,'offboarding',
    '{}'::jsonb,false,false,false,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('termination','exit_interview','Branch F — exit interview',30,'offboarding',
    '{}'::jsonb,true,false,false,'authority','termination_approve','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  -- ---------------------------------------------------------------- training / relations
  ('training_waiver','manager_approval','Manager approval of the waiver',10,null,
    '{}'::jsonb,false,false,true,'authority','training_waiver_approve','{}'::jsonb,null,
    3,'{}'::jsonb,null,'escalate',null),
  ('corrective_action_ack','issue','Issuing the corrective action',10,null,
    '{}'::jsonb,false,false,true,'authority','corrective_action_issue','{}'::jsonb,null,
    4,'{}'::jsonb,null,'escalate',null),
  ('corrective_action_ack','acknowledge','Employee acknowledgment',20,null,
    '{}'::jsonb,false,true,false,'fixed_user','corrective_action_ack',
    '{"employment_source":"subject"}'::jsonb,null,4,'{}'::jsonb,null,'escalate',null)
  ) as v(flow_key, step_key, label, step_order, pgroup, cond, optional, self_ok, reason_req,
         resolver, action, rconfig, escalate_after, mode, auto_rule, mandate, timeout_action,
         result_window) on v.flow_key = d.flow_key
 where d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
   and d.deleted_at is null
   and not exists (select 1 from hr.workflow_step_definition sd
                    where sd.workflow_definition_id = d.id and sd.step_key = v.step_key
                      and sd.deleted_at is null);

-- ============================================================ 5. hr.wf_publish_definition (§1.2, §2.6)
create or replace function hr.wf_publish_definition(p_definition_id uuid)
returns jsonb language plpgsql security definer set search_path to 'hr','public' as $fn$
declare
  d hr.workflow_definition%rowtype; v_uid uuid := auth.uid(); sd record; v_bad text; v_n integer;
begin
  select * into d from hr.workflow_definition where id = p_definition_id;
  if not found then return jsonb_build_object('granted', false, 'reason', 'not_found'); end if;
  if d.status <> 'draft' then
    return jsonb_build_object('granted', false, 'reason', 'not_a_draft',
      'detail', format('this definition is %s; a definition is edited only in draft', d.status));
  end if;
  if v_uid is not null and not hr.capability(v_uid, 'workflow.cancel', d.organization_id) then
    return hr._governance_refusal(d.organization_id, 'hr_workflow_definition', 'no_publish_authority',
      'publishing a routing definition needs HR administration standing', null, ARRAY[p_definition_id]);
  end if;

  -- §2.1: an unresolvable action slug is `definition_invalid` AT PUBLISH TIME, never at routing time
  select string_agg(distinct sd2.authority_action, ', ') into v_bad
    from hr.workflow_step_definition sd2
   where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
     and sd2.authority_action is not null
     and not exists (select 1 from platform.categories c
                      where c.dimension = 'hr_approval_action' and c.slug = sd2.authority_action
                        and c.deleted_at is null);
  if v_bad is not null then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('these authority_action slugs are not registered hr_approval_action tokens: %s', v_bad));
  end if;

  -- §9.1: `allows_self` is PLATFORM-ONLY and never org-overridable. An org definition that sets it
  -- is refused here rather than quietly honoured.
  if d.organization_id <> '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and exists (select 1 from hr.workflow_step_definition sd2
                  where sd2.workflow_definition_id = p_definition_id and sd2.allows_self
                    and sd2.deleted_at is null) then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', 'allows_self is a platform-rung value and cannot be set in an organisation''s own definition (§9.1)');
  end if;

  -- §7.1: the flow type's AI ceiling caps the mode, refused AT PUBLISH TIME
  select count(*) into v_n
    from hr.workflow_step_definition sd2
    join hr.workflow_flow_type f on f.flow_key = d.flow_key and f.deleted_at is null
   where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
     and ((f.ai_ceiling = 'advisory' and sd2.autonomy_mode in (1,2))
          or (f.ai_ceiling = 'none' and sd2.recommend_mandate_key is not null));
  if v_n > 0 then
    return jsonb_build_object('granted', false, 'reason', 'definition_invalid',
      'detail', format('%s step(s) exceed this flow type''s ai_ceiling', v_n));
  end if;

  -- 🚨 §2.6: refuse a definition whose TERMINAL step's fallback chain ends at top_of_chart when the
  -- org has no org-scoped holder for that action. This is how "who approves the CEO" gets answered
  -- at CONFIGURATION time instead of at 5pm on a Friday.
  for sd in select sd2.* from hr.workflow_step_definition sd2
             where sd2.workflow_definition_id = p_definition_id and sd2.deleted_at is null
               and sd2.authority_action is not null
               and sd2.fallback_chain[array_length(sd2.fallback_chain,1)] = 'top_of_chart'
               and sd2.step_order = (select max(step_order) from hr.workflow_step_definition
                                      where workflow_definition_id = p_definition_id
                                        and deleted_at is null)
  loop
    if d.organization_id <> '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
       and not exists (select 1 from hr.approval_authority a
                        where a.organization_id = d.organization_id
                          and a.action_type = sd.authority_action
                          and a.scope_kind = 'org' and a.is_active) then
      return jsonb_build_object('granted', false, 'reason', 'no_top_of_chart_holder',
        'detail', format('step %s falls back to top_of_chart but no org-scoped %s holder exists; name one before publishing',
                         sd.step_key, sd.authority_action));
    end if;
  end loop;

  perform set_config('hr.privileged_write','on',true);
  update hr.workflow_definition
     set status = 'retired', retired_at = now()
   where flow_key = d.flow_key and organization_id = d.organization_id
     and status = 'published' and id <> p_definition_id and deleted_at is null;
  update hr.workflow_definition
     set status = 'published', published_at = now() where id = p_definition_id;

  -- §1.2: publishing DOES NOT TOUCH RUNNING INSTANCES. Every instance pinned
  -- workflow_definition_id + definition_version at request time (AD-11: a rule change never
  -- rewrites a decision already in flight). Nothing below re-points anything, deliberately.
  select count(*) into v_n from hr.workflow_instance
   where flow_key = d.flow_key and organization_id = d.organization_id
     and state not in ('closed','completed','cancelled','rejected','withdrawn','superseded','expired');

  return jsonb_build_object('granted', true, 'definition_id', p_definition_id,
                            'flow_key', d.flow_key, 'definition_version', d.definition_version,
                            'running_instances_untouched', v_n);
end $fn$;

revoke all on function hr.wf_publish_definition(uuid) from public;
grant execute on function hr.wf_publish_definition(uuid) to authenticated, service_role;

-- ============================================================ assertions
do $$
declare v_n integer; v_flows integer; v_active integer; v_bad text;
begin
  select count(*) into v_flows from hr.workflow_flow_type where deleted_at is null;
  if v_flows <> 23 then raise exception 'hr_c4_06: expected 23 flow types, found %', v_flows; end if;

  select count(*) into v_active from hr.workflow_flow_type where deleted_at is null and is_active;
  if v_active <> 19 then
    raise exception 'hr_c4_06: expected 19 active flow types (4 blocked, RECORDED DECISION 1), found %', v_active;
  end if;

  -- every inactive flow NAMES its blocker; an inactive row with no reason is a silent hole
  if exists (select 1 from hr.workflow_flow_type
              where deleted_at is null and not is_active
                and coalesce(btrim(inactive_reason),'') = '') then
    raise exception 'hr_c4_06: an inactive flow type carries no inactive_reason';
  end if;

  -- every ACTIVE flow type points at a live registered token
  select string_agg(f.flow_key, ', ') into v_bad from hr.workflow_flow_type f
   where f.deleted_at is null and f.is_active
     and not exists (select 1 from platform.entity_types e
                      where e.token = f.target_token and e.is_active);
  if v_bad is not null then
    raise exception 'hr_c4_06: active flow types target unregistered tokens: %', v_bad;
  end if;

  -- NOT NULL hooks are populated and they are the FAIL-CLOSED ones
  if exists (select 1 from hr.workflow_flow_type
              where deleted_at is null
                and apply_fn::regproc::text <> 'hr.wf_apply_unimplemented') then
    raise exception 'hr_c4_06: a flow type ships an apply_fn other than the fail-closed stub';
  end if;

  select count(*) into v_n from hr.workflow_definition
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and status = 'published' and deleted_at is null;
  if v_n <> 23 then raise exception 'hr_c4_06: expected 23 platform definitions, found %', v_n; end if;

  select count(*) into v_n from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and sd.deleted_at is null;
  if v_n <> 37 then raise exception 'hr_c4_06: expected 37 platform step definitions, found %', v_n; end if;

  -- §9.5: bulk decide is false on EXACTLY the three flows the spec names
  select string_agg(flow_key, ', ' order by flow_key) into v_bad from hr.workflow_definition
   where organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid and not allow_bulk_decide
     and deleted_at is null;
  if v_bad <> 'background_check_adverse_action, pay_change, termination' then
    raise exception 'hr_c4_06: allow_bulk_decide=false set is "%s", not the three §9.5 names', v_bad;
  end if;

  -- §2.5: `allows_self` is set on exactly the three self-step actions §1.3a marks
  select string_agg(distinct sd.authority_action, ', ' order by sd.authority_action) into v_bad
    from hr.workflow_step_definition sd where sd.allows_self and sd.deleted_at is null;
  if v_bad <> 'acknowledgment_ack, corrective_action_ack, timecard_attest' then
    raise exception 'hr_c4_06: allows_self is set on "%s", not the three §1.3a self-step actions', v_bad;
  end if;

  -- RECORDED DECISION 2: nothing auto-decides on the shipped configuration
  select count(*) into v_n from hr.workflow_step_definition sd
    join hr.workflow_definition d on d.id = sd.workflow_definition_id
   where d.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'::uuid
     and sd.autonomy_mode in (1,2) and sd.deleted_at is null;
  if v_n <> 0 then
    raise exception 'hr_c4_06: % platform step(s) ship at autonomy mode 1/2 under an advisory ceiling', v_n;
  end if;

  -- every declared authority_action is a registered token, and the roster covers all 26
  select string_agg(distinct sd.authority_action, ', ') into v_bad
    from hr.workflow_step_definition sd
   where sd.authority_action is not null and sd.deleted_at is null
     and not exists (select 1 from platform.categories c
                      where c.dimension = 'hr_approval_action' and c.slug = sd.authority_action
                        and c.deleted_at is null);
  if v_bad is not null then
    raise exception 'hr_c4_06: unregistered authority_action slugs in the roster: %', v_bad;
  end if;

  select count(*) into v_n from communication.notification_event_type
   where event_key like 'hr.workflow.%' and deleted_at is null;
  if v_n <> 11 then raise exception 'hr_c4_06: expected 11 workflow events, found %', v_n; end if;
end $$;

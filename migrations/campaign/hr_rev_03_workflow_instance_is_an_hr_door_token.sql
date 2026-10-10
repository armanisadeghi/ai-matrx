-- chair-step: lane HR-REVIEWS. Replaces the body of hr._door_spec(text) to add ONE row, hr_workflow_instance (tier confidential, caps workflow.cancel, no break-glass), so grants on workflow instances are governed by HR's own audited-tier guard (hr._guard_audited_tier_grant, which admits the engine's hr.arm_write() lane) rather than refused by iam._guard_private_grant_owner_only. No guard is removed or loosened: grants on the token are now accepted ONLY under hr.arm_write() or hr_break_glass, where before the owner could share an instance freely. Every other row is byte-identical.
-- lane: HR-REVIEWS
-- based-on: hr._door_spec(text) 7a4eb3710b6c5308e6e829b380cd152547d9e6594af3fa56eabeaa57098f4db7
--
-- hr_rev_03 — A WORKFLOW STEP DECIDED BY ANYONE BUT ITS LAUNCHER COULD NEVER CLOSE.
-- Measured 2026-10-09: hr._wf_close_step -> hr._wf_revoke_step -> iam.remove_grant on the
-- instance's auto:wf_step grant raised 42501 owner_only for every decider who was not the
-- instance's creator (hr_workflow_instance is class confidential and was absent from
-- hr._door_spec, so the generic owner-only guard judged it). The last HR workflow decision of any
-- kind on production was 2026-08-30. The guard's own first line says HR tokens are judged by HR's
-- guard; this declares the token. Proof: scripts/campaign-tests/hr_rev_standard_review_proof.sql.

CREATE OR REPLACE FUNCTION hr._door_spec(p_token text)
 RETURNS TABLE(tier text, caps text[], allows_break_glass boolean, no_door_reason text)
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
begin
  return query
  -- the projection is explicit: `select *` would return the lookup key as the first column and the
  -- declared result type would not match it
  select m.tier, m.caps, m.bg, m.reason from (values
    -- ---------- Confidential tier
    ('hr_employee_private',      'confidential', array['identity.read'],                              true,  null::text),
    ('hr_compensation',          'confidential', array['comp.read'],                                  true,  null),
    ('hr_emergency_contact',     'confidential', array['identity.read','working_record.read'],        true,  null),
    ('hr_separation',            'confidential', array['working_record.read'],                        true,  null),
    ('hr_corrective_action',     'confidential', array['working_record.read','corrective_action.issue'], true, null),
    ('hr_background_check',      'confidential', array['background_check.adjudicate','candidate.read','working_record.read'], true, null),
    ('hr_employer_profile',      'confidential', array['working_record.read'],                        true,  null),
    ('hr_tax_withholding',       'confidential', array['identity.read','payroll.export'],             true,  null),
    ('hr_i9',                    'confidential', array['identity.read'],                              true,  null),
    ('hr_offer',                 'confidential', array['candidate.read','requisition.manage'],        true,  null),
    ('hr_reference_check',       'confidential', array['candidate.read'],                             true,  null),
    ('hr_records_request',       'confidential', array['records.govern','identity.read'],             true,  null),
    ('hr_verification_letter_request','confidential', array['identity.read'],                         true,  null),
    ('hr_ai_evidence',           'confidential', array['audit.read','records.govern'],                true,  null),
    ('hr_legal_hold',            'confidential', array['records.govern'],                             true,  null),
    ('hr_scorecard',             'confidential', array['candidate.read'],                             false, null),
    -- hr_rev_03 (HR-REVIEWS, 2026-10-09): a workflow instance carries the subject's HR request and is
    -- class Confidential. Its auto:wf_step reader grants are written and revoked by the engine
    -- (hr._wf_grant_step / hr._wf_revoke_step) under hr.arm_write(); declaring it here puts those
    -- grants under HR's own audited-tier guard instead of the generic owner-only guard, which
    -- refused every step close decided by anyone but the instance's creator. No break-glass:
    -- instances are read through the workflow doors (hr.wf_instance / hr.wf_inbox).
    ('hr_workflow_instance',     'confidential', array['workflow.cancel'],                            false, null),
    -- ---------- Restricted tier
    ('hr_restricted_note',       'restricted',   array['__per_note_kind__'],                          true,  null),
    ('hr_incident',              'restricted',   array['incident.read'],                              false, null),
    ('hr_incident_party',        'restricted',   array['incident.read'],                              false, null),
    ('hr_accommodation_request', 'restricted',   array['medical.read'],                               false, null),
    ('hr_leave_case',            'restricted',   array['medical.read'],                               false, null),
    -- ---------- structurally doorless (RECORDED DECISIONS 3 and 4)
    ('hr_eeo_response',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §4.4: no individual read function is ever written for EEO self-identification. The only reader is hr.eeo_aggregate, which suppresses any cell below hr.hiring.eeo_min_cell. The guarantee is the ABSENCE of code, which no configuration mistake can undo.'),
    ('hr_employment_pin',        'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable. A PIN hash has no read path; it is verified, never returned.'),
    ('hr_kiosk_device',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable. The device secret hash has no read path.'),
    ('hr_kiosk_session',         'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §3.2: never client-readable.'),
    ('hr_access_audit',          'restricted',   null::text[],                                        false,
     'SPEC-ACCESS §4.7: read through hr_access_audit_query only, which applies the audit.read gate plus the subject''s own lane and audits itself once per query.')
  ) as m(token, tier, caps, bg, reason)
  where m.token = p_token;
end
$function$;

-- lane: access-ladder T-8
-- Access ladder T-8b (2026-09-26): Arman's approval of the Confidential list is recorded and applied.
--
-- Arman, 2026-09-26, verbatim: "I agree, including the part about the basic employee list."
-- That approves the independent table review's Confidential list
-- (common-docs/projects/access-ladder/table-review.md) EXCEPT hr.employee, which becomes
-- Organization (directory facts only; hr.employee_private stays Confidential) in T-8c.
-- Each table below has a named law or a rule every normal company follows that keeps coworkers
-- out: the HR employee record's sensitive half, pay, I-9, tax withholding, background checks,
-- EEO, medical/leave, discipline, applicants, workers' compensation (medical record), grades,
-- a minor's guardian link, and live credentials (nobody uses another person's password/token/key).
--
-- Through the named approval door only (platform.set_table_confidential_arman_explicitly_approved).
-- Tables already Confidential: the call records the approval and changes nothing else.
-- Private -> Confidential (vault, connections, egress pairing, guardian link) and
-- legal.wc_claim Organization -> Confidential regenerate their policies. rls_variant is kept
-- except where the Private-only `personal` variant cannot hold Confidential
-- (tool.mcp_user_conn, extend.extension_auth_codes -> restricted, the approved Confidential shape;
-- their registry type stays `entity` with the reason written down so custom fields are unchanged).
--
-- NOT here: pdf.pdf_redaction_key_escrow stays Private (stricter than approved) — iam.apply_rls
-- refuses it until it is base-retrofitted with created_by.
set local lock_timeout = '3s';

-- users.integration_connections runs a column-level grant design; declare it exactly as it is
-- live so the regeneration keeps those four columns closed (apply_table_grants refuses otherwise).
update platform.entity_types
   set client_excluded_columns = array['vault_secret_key','credential_item_id','created_by','custom_fields']
 where token = 'integration_connection';

update platform.entity_types
   set type_reason = 'Access ladder T-8 (2026-09-26): moved to the restricted variant as an Arman-approved Confidential credential table; registry type stays entity so its custom-fields design is unchanged.'
 where token in ('mcp_user_conn','extension_auth_code') and type_reason is null;

select platform.set_table_confidential_arman_explicitly_approved(p_token => 'browser_authenticator_window', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'browser_profile', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'browser_profile_checkpoint', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'browser_stream_ticket', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'assessment_result', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'guardian_link', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'esign_provider', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'esign_signing_key', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_access_audit', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_accommodation_request', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_ai_evidence', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_background_check', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_calculation_snapshot', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_candidate', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_compensation', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_corrective_action', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_disposition_event', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_eeo_response', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_emergency_contact', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_employee_private', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_employment_pin', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_i9', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_incident', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_kiosk_session', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_leave_case', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_legal_hold', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_offer', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_recalculation_batch', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_records_request', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_reference_check', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_restricted_note', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_separation', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_tax_withholding', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_verification_letter_request', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_workflow_decision', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_workflow_event', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'hr_workflow_instance', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'wc_claim', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'platform_actor_session', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'platform_actor_token', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'egress_pairing', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'egress_ticket', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'provider_account_credential', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'credential_item', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'integration_connection', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'passkey_credential', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'user_secret', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'mcp_user_conn', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26', p_rls_variant => 'restricted');
select platform.set_table_confidential_arman_explicitly_approved(p_token => 'extension_auth_code', p_arman_words => 'I agree, including the part about the basic employee list.', p_approved_on => '2026-09-26', p_rls_variant => 'restricted');

do $$
declare n int;
begin
  select count(*) into n from platform.class_approval_by_arman
   where approved_on = '2026-09-26' and level = 'confidential' and txid = pg_current_xact_id();
  if n <> 49 then raise exception 'T-8b: expected 49 Confidential approvals in this transaction, found %', n; end if;
  select count(*) into n from platform.entity_types e
    join platform.class_approval_by_arman a on a.token = e.token and a.txid = pg_current_xact_id()
   where e.data_class <> 'confidential';
  if n <> 0 then raise exception 'T-8b: % approved tables are not Confidential', n; end if;
end $$;

-- iam_component_regeneration_dd137b12a_baseline — THE BEFORE SNAPSHOT, ON ITS OWN (DD-137b, fix round 1).
--
-- Chair ruling 2026-09-12: "stop retrying the single 310-table transaction — go to the four-batch
-- shape now (per-batch commits, as the lock-timeout guard itself advises), then b13 measures the end
-- state."
--
-- WHY THE SHAPE CHANGED, measured rather than assumed. `pnpm db:apply` wraps a file in ONE
-- transaction, so a 310-table regeneration takes ACCESS EXCLUSIVE on every one of them and HOLDS
-- them all until commit. Against live traffic that lost twice:
--     attempt 1  55P03 lock_not_available x167   (an orphaned backend of this lane's own making)
--     attempt 4  40P01 deadlock detected on communication.dm_conversation_participants
-- `ddl_lock_timeout_guard` says the answer out loud on every run: "commit per table — this bounds
-- waiting, never holding." So the regeneration is four files of ~80 tables, each its own
-- transaction, and this file is the BEFORE snapshot they are all measured against.
--
-- 🚨 WHAT PER-BATCH COMMITS COST, STATED PLAINLY. A partial application is now POSSIBLE: batch 2 can
-- commit and batch 3 fail. That is acceptable ONLY because every table is individually correct in
-- either state — staff lane open (as today) or closed (as intended) — and because DD-137b13's gate
-- measures the END STATE whatever happened in between. It is not acceptable as a silent outcome, so
-- each batch asserts its own floor and DD-137b13 refuses to pass if any token in the cast still
-- carries a lane its class forbids.
--
-- This file holds NO lock: it only reads, as eight impersonated identities, and writes its own
-- measurement rows.
do $$
declare
  v_before uuid; v_as timestamptz := now();
  v_principals uuid[] := array[
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- V-40's platform admin, info@aimatrx.com
    '392afd39-d59c-4418-866b-451e9d93fead',  -- V-40's subject (143 conversations, 639 messages)
    '4cf62e4e-2679-484f-b652-034e697418df',  -- the first round's platform admin
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin, NOT a platform admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- organization owner
    'f0146c96-e02e-420b-a99f-92774da0566c',  -- plain member
    '71d10ace-7593-447e-af1b-9b628e8ac311',  -- a member of one org and nothing else
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['access_request','activity','agent_card','agent_definition_version','agent_drift_alert','agent_run','agent_run_stage','agent_surface_binding','agent_usage','app_definition_version','app_error','app_execution','app_instance','app_rate_limit','app_setting','app_sync_status','artifact','assessment_item','assessment_result','assist','batch_cost_event','batch_provider_batch','batch_work_item','browser_account_binding','browser_action_event','browser_authenticator_window','browser_capture','browser_control_request','browser_handoff','browser_login_attempt','browser_profile','browser_profile_checkpoint','browser_run','browser_site_observation','browser_stream_ticket','canvas_item_state','canvas_score','canvas_view','cmp_entry','coding_session','coding_session_entry','commerce_asset_allocation','commerce_asset_grading','commerce_asset_identifier','commerce_asset_lot_event','commerce_asset_mandate_result','commerce_asset_price_factor','commerce_asset_reshoot_request','commerce_asset_review','commerce_asset_unknown','commerce_cloud_sync_connection','commerce_ebay_business_policy','commerce_ebay_custom_policy','commerce_ebay_inventory_item','commerce_ebay_inventory_item_group','commerce_ebay_inventory_item_group_member','commerce_ebay_inventory_location','commerce_ebay_listing','commerce_ebay_media_asset','commerce_ebay_notification_event','commerce_ebay_notification_subscription','commerce_ebay_offer','commerce_ebay_order','commerce_ebay_order_line_item','commerce_ebay_shipping_fulfillment','commerce_ebay_store_category','commerce_human_correction','commerce_intake_artifact','commerce_intake_asset','commerce_intake_batch','commerce_label_batch','commerce_label_code','commerce_marketplace_account','commerce_marketplace_account_deletion_audit','commerce_marketplace_api_call','commerce_marketplace_site','commerce_marketplace_sync_run','commerce_prediction_outcome','commerce_product','commerce_product_channel_ref','commerce_product_media','commerce_product_variant','commerce_recall_audit','contact_submission','content_ir_kind_component','content_ir_kind_component_incident','content_ir_kind_conformance','content_ir_kind_edge','content_ir_kind_example','content_ir_kind_surface','context_item_suggestion','context_item_value','conversation','conversation_value','credential_item','cx_agent_memory','cx_agent_plan','cx_agent_task','cx_code_edit','cx_code_message_file','cx_media','cx_observational_memory','cx_observational_memory_event','cx_pending_injection','cx_request','cx_request_snapshot','cx_tool_trace','cx_user_request','cx_user_todo','data_store','dataset','derive_run','dict_setting','dm_conversation','dm_message','dm_participant','esign_envelope_event','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hindsight_finding','hindsight_replay','hindsight_review','hr_access_audit','hr_accommodation_request','hr_ai_evidence','hr_alert_routing_rule','hr_application','hr_approval_authority','hr_approval_delegation','hr_asset','hr_asset_assignment','hr_attendance_exception','hr_auto_close_rule','hr_availability','hr_background_check','hr_benefits_event','hr_calculation_snapshot','hr_candidate','hr_candidate_conversion','hr_candidate_message','hr_checklist_item','hr_checklist_run','hr_checklist_template','hr_checklist_template_item','hr_compensation','hr_corrective_action','hr_course','hr_course_version','hr_credential','hr_crew','hr_deduction_code','hr_department','hr_derived_grant','hr_disposition_event','hr_earning_code','hr_eeo_response','hr_emergency_contact','hr_employee','hr_employee_private','hr_employer_profile','hr_employment','hr_employment_pin','hr_engagement','hr_establishment','hr_external_identity','hr_holiday','hr_holiday_calendar','hr_i9','hr_i9_document','hr_incident','hr_incident_party','hr_interview','hr_interview_kit','hr_job_title','hr_kiosk_device','hr_kiosk_session','hr_labor_target','hr_leave_case','hr_leave_enrollment','hr_leave_ledger','hr_leave_policy','hr_leave_request','hr_legal_hold','hr_legal_hold_item','hr_location','hr_new_hire_report','hr_offer','hr_opening','hr_overtime_alert','hr_overtime_alert_rule','hr_overtime_preapproval','hr_pay_group','hr_pay_period','hr_pay_period_employment','hr_payroll_export','hr_payroll_export_line','hr_position_assignment','hr_provisioning_result','hr_punch','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_reporting_line','hr_requisition','hr_restricted_note','hr_role_assignment','hr_schedule','hr_schedule_change','hr_schedule_guidance','hr_schedule_template','hr_schedule_template_shift','hr_scorecard','hr_separation','hr_shift','hr_shift_claim','hr_staffing_requirement','hr_survey','hr_survey_invitation','hr_survey_question','hr_survey_response','hr_tax_registration','hr_tax_withholding','hr_time_adjustment','hr_training_assignment','hr_training_attempt','hr_transcript_entry','hr_verification_letter_request','hr_work_interval','hr_workflow_binding','hr_workflow_decision','hr_workflow_event','hr_workflow_failure','hr_workflow_instance','hr_workflow_step','hr_workweek','iam_access_audit','iam_emergency_door_request','industry_curator','interview_document_revision','interview_hole','interview_question','interview_session','interview_turn','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','meet_call_invite','membership','message','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','pc_studio_run_asset','platform_actor_session','platform_actor_token','platform_continued_access','platform_saved_view','podcast_race','processed_document','processed_document_page','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_message','sms_message_media','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','tool_call','udt_dataset_fields','udt_dataset_rows','udt_document','udt_structured_list_items','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_secret','user_stat','user_surface_state','wbx_guidance','wc_impairment_definition','workbook','workflow_card','workflow_comparison','working_document'];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-137b12a BEFORE') > 0 then
    raise notice 'dd137b12a: the baseline is already on record';
    return;
  end if;
  v_before := iam.access_delta_snapshot('DD-137b12a BEFORE', v_principals, v_tokens, 400000,
    'fix round 1: every private/confidential token INCLUDING components and ledgers, plus 25 '
    'components under an organization/public parent as a control', v_as);
  raise notice 'dd137b12a: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;

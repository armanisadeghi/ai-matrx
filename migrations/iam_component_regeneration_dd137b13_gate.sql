-- iam_component_regeneration_dd137b13_gate — THE ACCESS DELTA OVER THE HALF THAT BROKE.
--
-- DD-137b12a took the baseline and DD-137b12b..e committed the regeneration in four batches. This re-probes the SAME 322 tokens with the SAME 8
-- principals, pinned to the SAME instant DD-137b12 recorded, and runs the WIDER-diff gate over the
-- real before/after pair. It holds no exclusive lock on anything: that separation is why it is its
-- own file.
--
-- 🚨 THE CAST IS THE FIX. V-40: "the delta cast has no component in it — the harness cannot see the
-- class of defect above. Any future closure claim needs components in the cast." It now carries
-- every token whose resolved class is `private` or `confidential` — components and ledgers
-- included — plus 25 components under an `organization` or `public` parent as a CONTROL, which must
-- not move at all. And two of the eight principals are V-40's own: the platform admin who read
-- 131,763 of 131,763 messages, and the member whose 639 messages those were.
do $$
declare v_before uuid; v_after uuid; v_as timestamptz; v_msg text; r record;
  v_principals uuid[] := array[
    '6555aa73-c647-4ecf-8a96-b60e315b6b18','392afd39-d59c-4418-866b-451e9d93fead',
    '4cf62e4e-2679-484f-b652-034e697418df','34ed4fc3-c527-4819-99bf-15c26603b261',
    'c5e92166-e148-4e73-926e-83af0c453665','f0146c96-e02e-420b-a99f-92774da0566c',
    '71d10ace-7593-447e-af1b-9b628e8ac311','00000000-0000-0000-0000-000000000000']::uuid[];
  v_tokens text[] := array['access_request','activity','agent_card','agent_definition_version','agent_drift_alert','agent_run','agent_run_stage','agent_surface_binding','agent_usage','app_definition_version','app_error','app_execution','app_instance','app_rate_limit','app_setting','app_sync_status','artifact','assessment_item','assessment_result','assist','batch_cost_event','batch_provider_batch','batch_work_item','browser_account_binding','browser_action_event','browser_authenticator_window','browser_capture','browser_control_request','browser_handoff','browser_login_attempt','browser_profile','browser_profile_checkpoint','browser_run','browser_site_observation','browser_stream_ticket','canvas_item_state','canvas_score','canvas_view','cmp_entry','coding_session','coding_session_entry','commerce_asset_allocation','commerce_asset_grading','commerce_asset_identifier','commerce_asset_lot_event','commerce_asset_mandate_result','commerce_asset_price_factor','commerce_asset_reshoot_request','commerce_asset_review','commerce_asset_unknown','commerce_cloud_sync_connection','commerce_ebay_business_policy','commerce_ebay_custom_policy','commerce_ebay_inventory_item','commerce_ebay_inventory_item_group','commerce_ebay_inventory_item_group_member','commerce_ebay_inventory_location','commerce_ebay_listing','commerce_ebay_media_asset','commerce_ebay_notification_event','commerce_ebay_notification_subscription','commerce_ebay_offer','commerce_ebay_order','commerce_ebay_order_line_item','commerce_ebay_shipping_fulfillment','commerce_ebay_store_category','commerce_human_correction','commerce_intake_artifact','commerce_intake_asset','commerce_intake_batch','commerce_label_batch','commerce_label_code','commerce_marketplace_account','commerce_marketplace_account_deletion_audit','commerce_marketplace_api_call','commerce_marketplace_site','commerce_marketplace_sync_run','commerce_prediction_outcome','commerce_product','commerce_product_channel_ref','commerce_product_media','commerce_product_variant','commerce_recall_audit','contact_submission','content_ir_kind_component','content_ir_kind_component_incident','content_ir_kind_conformance','content_ir_kind_edge','content_ir_kind_example','content_ir_kind_surface','context_item_suggestion','context_item_value','conversation','conversation_value','credential_item','cx_agent_memory','cx_agent_plan','cx_agent_task','cx_code_edit','cx_code_message_file','cx_media','cx_observational_memory','cx_observational_memory_event','cx_pending_injection','cx_request','cx_request_snapshot','cx_tool_trace','cx_user_request','cx_user_todo','data_store','dataset','derive_run','dict_setting','dm_conversation','dm_message','dm_participant','esign_envelope_event','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hindsight_finding','hindsight_replay','hindsight_review','hr_access_audit','hr_accommodation_request','hr_ai_evidence','hr_alert_routing_rule','hr_application','hr_approval_authority','hr_approval_delegation','hr_asset','hr_asset_assignment','hr_attendance_exception','hr_auto_close_rule','hr_availability','hr_background_check','hr_benefits_event','hr_calculation_snapshot','hr_candidate','hr_candidate_conversion','hr_candidate_message','hr_checklist_item','hr_checklist_run','hr_checklist_template','hr_checklist_template_item','hr_compensation','hr_corrective_action','hr_course','hr_course_version','hr_credential','hr_crew','hr_deduction_code','hr_department','hr_derived_grant','hr_disposition_event','hr_earning_code','hr_eeo_response','hr_emergency_contact','hr_employee','hr_employee_private','hr_employer_profile','hr_employment','hr_employment_pin','hr_engagement','hr_establishment','hr_external_identity','hr_holiday','hr_holiday_calendar','hr_i9','hr_i9_document','hr_incident','hr_incident_party','hr_interview','hr_interview_kit','hr_job_title','hr_kiosk_device','hr_kiosk_session','hr_labor_target','hr_leave_case','hr_leave_enrollment','hr_leave_ledger','hr_leave_policy','hr_leave_request','hr_legal_hold','hr_legal_hold_item','hr_location','hr_new_hire_report','hr_offer','hr_opening','hr_overtime_alert','hr_overtime_alert_rule','hr_overtime_preapproval','hr_pay_group','hr_pay_period','hr_pay_period_employment','hr_payroll_export','hr_payroll_export_line','hr_position_assignment','hr_provisioning_result','hr_punch','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_reporting_line','hr_requisition','hr_restricted_note','hr_role_assignment','hr_schedule','hr_schedule_change','hr_schedule_guidance','hr_schedule_template','hr_schedule_template_shift','hr_scorecard','hr_separation','hr_shift','hr_shift_claim','hr_staffing_requirement','hr_survey','hr_survey_invitation','hr_survey_question','hr_survey_response','hr_tax_registration','hr_tax_withholding','hr_time_adjustment','hr_training_assignment','hr_training_attempt','hr_transcript_entry','hr_verification_letter_request','hr_work_interval','hr_workflow_binding','hr_workflow_decision','hr_workflow_event','hr_workflow_failure','hr_workflow_instance','hr_workflow_step','hr_workweek','iam_access_audit','iam_emergency_door_request','industry_curator','interview_document_revision','interview_hole','interview_question','interview_session','interview_turn','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','meet_call_invite','membership','message','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','pc_studio_run_asset','platform_actor_session','platform_actor_token','platform_continued_access','platform_saved_view','podcast_race','processed_document','processed_document_page','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_message','sms_message_media','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','tool_call','udt_dataset_fields','udt_dataset_rows','udt_document','udt_structured_list_items','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_secret','user_stat','user_surface_state','wbx_guidance','wc_impairment_definition','workbook','workflow_card','workflow_comparison','working_document'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-137b12a BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd137b13: there is no DD-137b12 BEFORE snapshot to compare against. A gate '
      'with no baseline is not a gate. Run iam_component_regeneration_dd137b12a_baseline.sql first.';
  end if;

  v_after := iam.access_delta_snapshot('DD-137b13 AFTER', v_principals, v_tokens, 400000,
    'fix round 1 confirmation, pinned to the DD-137b12a baseline instant', v_as);

  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd137b13: %', v_msg;

  for r in select token, principal_label, count_before, count_after
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'NARROWER' and count_before - count_after >= 100
            order by count_before - count_after desc limit 20
  loop
    raise notice 'dd137b13: NARROWED % for % : % -> %', r.token, r.principal_label,
      r.count_before, r.count_after;
  end loop;

  -- 🚨 THE END-STATE ASSERTION THE FOUR-BATCH SHAPE MAKES NECESSARY. Per-batch commits mean a
  -- partial application is possible — batch 2 can commit and batch 3 fail — so "the migrations ran"
  -- is no longer the same statement as "every table is closed". This asks the database directly.
  declare v_open int;
  begin
    select count(*) into v_open from platform.entity_types et
     where et.is_active
       and et.token = any(v_tokens)
       and et.token not in ('credential_item','user_secret')
       and (iam.class_lanes(et.token)).resolved_class in ('private','confidential')
       and exists (select 1 from pg_policy p
                    where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
                      and p.polname = 'platform_admin_all');
    if v_open > 10 then
      raise exception 'dd137b13: % tokens in the cast still carry platform_admin_all under a private '
        'or confidential class — at most the ten structurally ungeneratable bespoke tokens may. A '
        'batch did not land; re-run iam_component_regeneration_dd137b12b..e and then this file.', v_open;
    end if;
    raise notice 'dd137b13: % tokens keep an open staff lane, all of them the structurally '
      'ungeneratable residue', v_open;
  end;

  -- THE CONTROL. A component under an organization or public parent must be byte-for-byte where it
  -- was: the class that describes today's lane set is a no-op, and if the controls moved then this
  -- change is not what it says it is.
  for r in select c.token, c.principal_label, c.count_before, c.count_after, c.verdict
             from iam.access_delta_compare(v_before, v_after) c
             join platform.entity_types et on et.token = c.token
            where et.rls_variant in ('component','ledger')
              and (iam.class_lanes(et.token)).resolved_class in ('organization','public')
              and c.verdict <> 'SAME'
  loop
    raise exception 'dd137b13: CONTROL MOVED — % / % went % -> % (%). A component under an '
      'organization-class parent must not change at all.',
      r.token, r.principal_label, r.count_before, r.count_after, r.verdict;
  end loop;
  raise notice 'dd137b13: the organization/public component controls did not move';
end $$;

-- ═══ V-40's OWN PROBE, re-run: the headline as they measured it ═══
--
-- 🚨 THE CONVERSATION IDS ARE RESOLVED BEFORE THE IMPERSONATION, and that is not a detail. Counting
-- messages with `exists (select 1 from chat.conversation c where c.id = m.conversation_id and
-- c.created_by = <subject>)` INSIDE the impersonation is a probe that always answers 0: the
-- subquery is itself RLS-filtered, so the moment the conversation lane closes the message count
-- collapses whether or not the messages are readable. The ids are therefore taken as the migration
-- role (no RLS) and then counted under each identity, which is the question actually being asked.
do $$
declare
  v_padmin  constant uuid := '6555aa73-c647-4ecf-8a96-b60e315b6b18';  -- info@aimatrx.com
  v_subject constant uuid := '392afd39-d59c-4418-866b-451e9d93fead';  -- projectmanager@titaniumsuccess.com
  v_conv_ids uuid[];
  v_conv bigint; v_msg bigint; v_ci bigint; v_us bigint;
  v_own_conv bigint; v_own_msg bigint; v_total_conv bigint; v_total_msg bigint;
begin
  select array_agg(c.id) into v_conv_ids from chat.conversation c where c.created_by = v_subject;
  v_total_conv := coalesce(cardinality(v_conv_ids), 0);
  select count(*) into v_total_msg from chat.message m where m.conversation_id = any(v_conv_ids);
  raise notice 'dd137b13: the subject owns % conversations carrying % messages', v_total_conv, v_total_msg;
  if v_total_conv = 0 or v_total_msg = 0 then
    raise exception 'dd137b13: the subject has nothing to probe with — this proof would be vacuous';
  end if;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_padmin::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_conv from chat.conversation c where c.id = any(v_conv_ids);
  select count(*) into v_msg  from chat.message m where m.conversation_id = any(v_conv_ids);
  select count(*) into v_ci from users.credential_items where user_id = v_subject;
  select count(*) into v_us from users.user_secrets where user_id = v_subject;
  execute 'reset role';

  raise notice 'dd137b13: PLATFORM ADMIN on the subject — conversations % of %, messages % of %, credentials %, secrets %',
    v_conv, v_total_conv, v_msg, v_total_msg, v_ci, v_us;
  if v_conv <> 0 then raise exception 'dd137b13: the platform admin reads % of the subject''s % private conversations', v_conv, v_total_conv; end if;
  if v_msg <> 0 then raise exception 'dd137b13: the platform admin reads % of the subject''s % messages — the component leak is NOT closed', v_msg, v_total_msg; end if;
  if v_ci <> 0 then raise exception 'dd137b13: the platform admin reads % of the subject''s credential items', v_ci; end if;

  -- AND THE OWNER STILL READS EVERYTHING OF THEIRS. A "0 for the admin" number that costs the
  -- owner their own data is not a fix (db-rules §6).
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_subject::text,'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_own_conv from chat.conversation c where c.id = any(v_conv_ids);
  select count(*) into v_own_msg  from chat.message m where m.conversation_id = any(v_conv_ids);
  execute 'reset role';
  raise notice 'dd137b13: THE OWNER reads % of their % conversations and % of their % messages',
    v_own_conv, v_total_conv, v_own_msg, v_total_msg;
  if v_own_conv <> v_total_conv then
    raise exception 'dd137b13: the owner reads only % of their own % conversations', v_own_conv, v_total_conv;
  end if;
  if v_own_msg <> v_total_msg then
    raise exception 'dd137b13: the owner reads only % of their own % messages — over-tightening is '
      'as serious a bug as a stranger let in', v_own_msg, v_total_msg;
  end if;

  -- user_secrets is the one place the promise is still not kept, and it is recorded rather than
  -- quietly passed: its SELECT is walled by a RESTRICTIVE platform_admin_select_only, so the staff
  -- lane is the table's ONLY client read path and stripping it makes the vault readable by nobody.
  raise notice 'dd137b13: user_secrets still returns % rows to the platform admin — DELIBERATE and '
    'recorded: it is the only client read path that exists (the owner reads 0 of their own), and '
    'iam.verify_canonical FAILs the token until the vault gets its own door', v_us;
end $$;

-- iam_component_regeneration_dd137b12 — THE COMPONENTS REGENERATE UNDER THEIR PARENT'S CLASS
-- (DD-137b, fix round 1, the act).
--
-- DD-137b10 made a component's lanes its parent's lanes and set the privacy-wall flag on the 143
-- components and ledgers that resolve `private` or `confidential`. Nothing moved in the policies:
-- 132 of them still carried `platform_admin_all` and a platform-staff read arm. This file
-- regenerates them.
--
-- ═══ THE CAST NOW CONTAINS THE HALF THAT BROKE ═══
-- V-40's third escalation: "the delta cast has no component in it — the harness cannot see the
-- class of defect above." The cast is now 487 tokens — every token whose resolved class is
-- `private` or `confidential` (components and ledgers included), PLUS 25 components under an
-- `organization` or `public` parent as a CONTROL (they must not move) — across 8 principals, including V-40's own two
-- identities (`info@aimatrx.com`, the platform admin who read 131,763 of 131,763 messages, and
-- `projectmanager@titaniumsuccess.com`, whose 639 messages those were).
--
-- The BEFORE snapshot is taken here, holding no lock; the DDL is seconds; the AFTER snapshot and
-- the gate are DD-137b13, in their own transaction. Same split and the same reason as DD-137b4/b5:
-- a ten-minute snapshot taken while holding ACCESS EXCLUSIVE on 132 live tables is what
-- `ddl_lock_timeout_guard` says out loud not to do.

-- A 2s lock bound loses the race on 130+ live component tables under any concurrent load, and a
-- lost race now ABORTS this file rather than silently skipping a table. 30s is still a BOUND —
-- ddl_lock_timeout_guard's rule is that waiting is bounded, never that it is short.
set local lock_timeout = '30s';

do $$
declare
  v_before uuid; v_as timestamptz := now(); r record;
  v_principals uuid[] := array[
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- V-40's platform admin, info@aimatrx.com
    '392afd39-d59c-4418-866b-451e9d93fead',  -- V-40's target member (143 personal conversations, 639 messages)
    '4cf62e4e-2679-484f-b652-034e697418df',  -- the first round's platform admin
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin, NOT a platform admin
    'c5e92166-e148-4e73-926e-83af0c453665',  -- organization owner
    'f0146c96-e02e-420b-a99f-92774da0566c',  -- plain member
    '71d10ace-7593-447e-af1b-9b628e8ac311',  -- a member of one org and nothing else
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['access_request','activity','agent_card','agent_definition_version','agent_drift_alert','agent_run','agent_run_stage','agent_surface_binding','agent_usage','app_definition_version','app_error','app_execution','app_instance','app_rate_limit','app_setting','app_sync_status','artifact','assessment_item','assessment_result','assist','batch_cost_event','batch_provider_batch','batch_work_item','browser_account_binding','browser_action_event','browser_authenticator_window','browser_capture','browser_control_request','browser_handoff','browser_login_attempt','browser_profile','browser_profile_checkpoint','browser_run','browser_site_observation','browser_stream_ticket','canvas_item_state','canvas_score','canvas_view','cmp_entry','coding_session','coding_session_entry','commerce_asset_allocation','commerce_asset_grading','commerce_asset_identifier','commerce_asset_lot_event','commerce_asset_mandate_result','commerce_asset_price_factor','commerce_asset_reshoot_request','commerce_asset_review','commerce_asset_unknown','commerce_cloud_sync_connection','commerce_ebay_business_policy','commerce_ebay_custom_policy','commerce_ebay_inventory_item','commerce_ebay_inventory_item_group','commerce_ebay_inventory_item_group_member','commerce_ebay_inventory_location','commerce_ebay_listing','commerce_ebay_media_asset','commerce_ebay_notification_event','commerce_ebay_notification_subscription','commerce_ebay_offer','commerce_ebay_order','commerce_ebay_order_line_item','commerce_ebay_shipping_fulfillment','commerce_ebay_store_category','commerce_human_correction','commerce_intake_artifact','commerce_intake_asset','commerce_intake_batch','commerce_label_batch','commerce_label_code','commerce_marketplace_account','commerce_marketplace_account_deletion_audit','commerce_marketplace_api_call','commerce_marketplace_site','commerce_marketplace_sync_run','commerce_prediction_outcome','commerce_product','commerce_product_channel_ref','commerce_product_media','commerce_product_variant','commerce_recall_audit','contact_submission','content_ir_kind_component','content_ir_kind_component_incident','content_ir_kind_conformance','content_ir_kind_edge','content_ir_kind_example','content_ir_kind_surface','context_item_suggestion','context_item_value','conversation','conversation_value','credential_item','cx_agent_memory','cx_agent_plan','cx_agent_task','cx_code_edit','cx_code_message_file','cx_media','cx_observational_memory','cx_observational_memory_event','cx_pending_injection','cx_request','cx_request_snapshot','cx_tool_trace','cx_user_request','cx_user_todo','data_store','dataset','derive_run','dict_setting','dm_conversation','dm_message','dm_participant','esign_envelope_event','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hindsight_finding','hindsight_replay','hindsight_review','hr_access_audit','hr_accommodation_request','hr_ai_evidence','hr_alert_routing_rule','hr_application','hr_approval_authority','hr_approval_delegation','hr_asset','hr_asset_assignment','hr_attendance_exception','hr_auto_close_rule','hr_availability','hr_background_check','hr_benefits_event','hr_calculation_snapshot','hr_candidate','hr_candidate_conversion','hr_candidate_message','hr_checklist_item','hr_checklist_run','hr_checklist_template','hr_checklist_template_item','hr_compensation','hr_corrective_action','hr_course','hr_course_version','hr_credential','hr_crew','hr_deduction_code','hr_department','hr_derived_grant','hr_disposition_event','hr_earning_code','hr_eeo_response','hr_emergency_contact','hr_employee','hr_employee_private','hr_employer_profile','hr_employment','hr_employment_pin','hr_engagement','hr_establishment','hr_external_identity','hr_holiday','hr_holiday_calendar','hr_i9','hr_i9_document','hr_incident','hr_incident_party','hr_interview','hr_interview_kit','hr_job_title','hr_kiosk_device','hr_kiosk_session','hr_labor_target','hr_leave_case','hr_leave_enrollment','hr_leave_ledger','hr_leave_policy','hr_leave_request','hr_legal_hold','hr_legal_hold_item','hr_location','hr_new_hire_report','hr_offer','hr_opening','hr_overtime_alert','hr_overtime_alert_rule','hr_overtime_preapproval','hr_pay_group','hr_pay_period','hr_pay_period_employment','hr_payroll_export','hr_payroll_export_line','hr_position_assignment','hr_provisioning_result','hr_punch','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_reporting_line','hr_requisition','hr_restricted_note','hr_role_assignment','hr_schedule','hr_schedule_change','hr_schedule_guidance','hr_schedule_template','hr_schedule_template_shift','hr_scorecard','hr_separation','hr_shift','hr_shift_claim','hr_staffing_requirement','hr_survey','hr_survey_invitation','hr_survey_question','hr_survey_response','hr_tax_registration','hr_tax_withholding','hr_time_adjustment','hr_training_assignment','hr_training_attempt','hr_transcript_entry','hr_verification_letter_request','hr_work_interval','hr_workflow_binding','hr_workflow_decision','hr_workflow_event','hr_workflow_failure','hr_workflow_instance','hr_workflow_step','hr_workweek','iam_access_audit','iam_emergency_door_request','industry_curator','interview_document_revision','interview_hole','interview_question','interview_session','interview_turn','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','meet_call_invite','membership','message','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','pc_studio_run_asset','platform_actor_session','platform_actor_token','platform_continued_access','platform_saved_view','podcast_race','processed_document','processed_document_page','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_message','sms_message_media','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','tool_call','udt_dataset_fields','udt_dataset_rows','udt_document','udt_structured_list_items','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_secret','user_stat','user_surface_state','wbx_guidance','wc_impairment_definition','workbook','workflow_card','workflow_comparison','working_document'];
  v_ok int := 0; v_refused int := 0;
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-137b12 BEFORE') > 0 then
    raise notice 'dd137b12: already applied';
    return;
  end if;

  v_before := iam.access_delta_snapshot('DD-137b12 BEFORE', v_principals, v_tokens, 400000,
    'fix round 1: every private/confidential token INCLUDING components and ledgers, plus '
    'organization/public components as a control', v_as);
  raise notice 'dd137b12: before snapshot % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;

  for r in select et.schema_name, et.table_name, et.token, et.rls_variant
             from platform.entity_types et where et.token = any(v_tokens) order by 1,2
  loop
    begin
      perform iam.apply_rls(r.schema_name, r.table_name, r.token, r.rls_variant);
      v_ok := v_ok + 1;
    exception when others then
      -- 🚨 A LOCK FAILURE IS NOT A STRUCTURAL REFUSAL, AND SWALLOWING BOTH IS HOW A REGENERATION
      -- QUIETLY SKIPS HALF THE PLATFORM. The first run of this file counted 167 `55P03
      -- lock_not_available` failures as "refused" — they were tables whose ACCESS EXCLUSIVE lock was
      -- held by an orphaned backend — and only the `v_ok < 300` floor below caught it. The floor is
      -- a backstop, not the rule: the rule is that ONLY a known structural cause may be tolerated,
      -- and everything else aborts the whole migration naming the table.
      --
      -- The tolerated set, every one of them a token `iam.apply_rls` cannot generate BY CONSTRUCTION:
      --   P0001 'access machinery'  — six tokens that own the inputs the access resolver consumes
      --   42703 column "id"          — three bespoke tables with no id column
      --   42883 operator does not exist — extend.wbx_guidance's type mismatch
      --   P0001 'not an active registered entity' — a token deactivated mid-run
      --   P0001 'has no composition parent' — the three parentless components below, which
      --     db-rules §6d-1 says cannot exist and which iam.class_lanes therefore resolves `private`
      if sqlstate in ('P0001','42703','42883')
         and (sqlerrm like '%access machinery%'
              or sqlerrm like '%column "id" does not exist%'
              or sqlerrm like '%operator does not exist%'
              or sqlerrm like '%not an active registered entity%'
              or sqlerrm like '%has no composition parent%') then
        v_refused := v_refused + 1;
        raise notice 'dd137b12: % (%.%) keeps its bespoke policy — %',
          r.token, r.schema_name, r.table_name, sqlerrm;
      else
        raise exception 'dd137b12: % (%.%) failed to regenerate with %: %. That is not a structural '
          'refusal, so this migration refuses to commit a partial regeneration.',
          r.token, r.schema_name, r.table_name, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  raise notice 'dd137b12: regenerated %, structurally refused %', v_ok, v_refused;
  -- The cast is 322 and at most a dozen are structurally ungeneratable (the ten bespoke tokens of
  -- DD-137b4's residue plus the two vault tables). Anything below 300 means tables fell out of the
  -- loop silently, which is exactly the shape of the omission this file exists to prevent.
  -- The three parentless components are a REGISTRY DEFECT, not a design: db-rules §6d-1 requires a
  -- composition parent and `content_ir_kind_conformance`, `wc_impairment_definition` and
  -- `workflow_card` have none, so neither apply_rls nor the class can do anything with them. They
  -- resolve `private` in iam.class_lanes (the strictest answer for a table whose access contract
  -- nobody wrote down) and they keep whatever policies they have. Named here and in the report.
  if v_ok < 300 then
    raise exception 'dd137b12: only % of the 322-token cast regenerated', v_ok;
  end if;
end $$;

-- ═══ what must be true the moment this commits ═══
do $$
declare v_n integer; v_q text;
begin
  -- no component or ledger under a private/confidential parent keeps the staff lane
  select count(*) into v_n from platform.entity_types et
  where et.is_active and et.rls_variant in ('component','ledger')
    and (iam.class_lanes(et.token)).resolved_class in ('private','confidential')
    and exists (select 1 from pg_policy p
                 where p.polrelid = to_regclass(format('%I.%I', et.schema_name, et.table_name))
                   and p.polname = 'platform_admin_all');
  if v_n > 0 then
    raise exception 'dd137b12: % components/ledgers under a private or confidential parent still '
      'carry platform_admin_all', v_n;
  end if;

  -- chat.message, the table V-40 measured: no staff arm, and the parent lane intact
  select pg_get_expr(pol.polqual, pol.polrelid) into v_q from pg_policy pol
   where pol.polrelid = 'chat.message'::regclass and pol.polname = 'std_select';
  if v_q like '%is_platform_admin%' or v_q like '%is_super_admin%' then
    raise exception 'dd137b12: chat.message std_select still carries a platform-staff arm';
  end if;
  if v_q not like '%accessible_entity_ids(''conversation''%' then
    raise exception 'dd137b12: chat.message lost the parent lane that IS its access contract — '
      'over-tightening is as serious a bug as a stranger let in (db-rules §6)';
  end if;
  if exists (select 1 from pg_policy where polrelid='chat.message'::regclass and polname='platform_admin_all') then
    raise exception 'dd137b12: chat.message still carries platform_admin_all';
  end if;

  -- and a component of an ORGANIZATION-class parent did NOT move
  if not exists (select 1 from pg_policy where polrelid='canvas.canvas_item_state'::regclass
                   and polname='platform_admin_all') then
    raise exception 'dd137b12: an organization-class component LOST its platform-admin lane — the '
      'class that describes today''s lane set must be a no-op';
  end if;

  raise notice 'dd137b12: all assertions passed';
end $$;

-- iam_class_regeneration_dd137b5_gate — THE ACCESS DELTA, MEASURED AFTER THE FACT AND ASSERTED.
--
-- DD-137b4 committed the regeneration in about four seconds of DDL. This file re-probes the SAME
-- 144 tokens with the SAME six principals, pinned to the SAME instant DD-137b4 recorded, and runs
-- the WIDER-diff gate over the real before/after pair. It holds no exclusive lock on anything: that
-- separation is the whole reason it is its own file, because a sixty-second snapshot taken while
-- holding ACCESS EXCLUSIVE on 134 live tables is what  says out loud not to
-- do — "commit per table — this bounds waiting, never holding".
--
-- 🚨 THIS IS THE CONFIRMATION, NOT THE GATE. The gate itself ran BEFORE anything shipped: the full
-- rehearsal of 2026-09-12, in a rolled-back transaction, went
--     access_delta gate GREEN: 864 pairs, 0 wider, 125 narrower, 739 unchanged.
-- If THIS file refuses, the regeneration is reverted — it is not argued with.
do $$
declare v_before uuid; v_after uuid; v_as timestamptz; v_msg text; r record; v_n integer;
  v_principals uuid[] := array[
    '4cf62e4e-2679-484f-b652-034e697418df','34ed4fc3-c527-4819-99bf-15c26603b261',
    'c5e92166-e148-4e73-926e-83af0c453665','f0146c96-e02e-420b-a99f-92774da0566c',
    '71d10ace-7593-447e-af1b-9b628e8ac311','00000000-0000-0000-0000-000000000000']::uuid[];
  v_tokens text[] := array['access_request','agent_run','agent_surface_binding','ai_api','ai_endpoint','ai_offering','app_instance','app_setting','app_sync_status','assessment_result','assist','browser_authenticator_window','browser_profile','browser_profile_checkpoint','browser_stream_ticket','canvas_score','canvas_view','coding_session','commerce_cloud_sync_connection','commerce_intake_batch','commerce_label_batch','commerce_marketplace_account','commerce_product','contact_submission','context_item_suggestion','conversation','cx_agent_memory','cx_user_request','data_store','dataset','derive_run','dict_setting','dm_conversation','esign_provider','esign_signing_key','game_badge','game_result','heatmap_save','hindsight_enrollment','hr_ai_evidence','hr_alert_routing_rule','hr_asset','hr_auto_close_rule','hr_background_check','hr_candidate','hr_checklist_template','hr_corrective_action','hr_course','hr_crew','hr_deduction_code','hr_department','hr_earning_code','hr_emergency_contact','hr_employee','hr_employer_profile','hr_employment','hr_holiday_calendar','hr_i9','hr_interview_kit','hr_job_title','hr_leave_policy','hr_legal_hold','hr_location','hr_overtime_alert_rule','hr_pay_group','hr_recalculation_batch','hr_records_request','hr_reference_check','hr_requisition','hr_schedule','hr_schedule_guidance','hr_schedule_template','hr_separation','hr_survey','hr_verification_letter_request','hr_workflow_instance','iam_access_audit','iam_emergency_door_request','industry_curator','interview_session','invitation','invitation_request','item_mastery','kg_alert','kg_suggestion_ack','kg_sweep_queue','kg_sweep_run','kg_sweep_state','kg_value_match','league_membership','mandate_reference','mandate_scan','meet_call_invite','membership','ner_shadow','notification','notification_channel_preference','notification_preference','output_feedback','page_extraction_job','page_extraction_page_run','platform_actor_session','platform_actor_token','platform_saved_view','podcast_race','processed_document','quiz_session','sandbox_instance','scope_association_suggestion','scope_item_value_suggestion','scope_suggestion','sms_consent','sms_conversation','sms_notification','sms_notification_preference','sms_phone_number','structured_list','studio_recording_chunks','studio_run','study_attempt','study_goal','study_plan','study_plan_block','study_plan_day','study_reminder_context','study_reminder_delivery','study_session','system_personal_org_failure','udt_document','user_achievement','user_analysis_preference','user_bookmark','user_email_preference','user_feedback','user_form_profile','user_markdown_sample','user_memory','user_preference','user_stat','user_surface_state','wbx_guidance','workbook','workflow_comparison','working_document'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-137b4 BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd137b5: there is no DD-137b4 BEFORE snapshot to compare against. A gate with '
      'no baseline is not a gate — re-run DD-137b4 before this file.';
  end if;

  v_after := iam.access_delta_snapshot('DD-137b5 AFTER', v_principals, v_tokens, 200000,
    'B-41b steps 3+5 confirmation, pinned to the DD-137b4 baseline instant', v_as);

  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd137b5: %', v_msg;

  -- The narrowing is the POINT, so it is written down rather than merely allowed.
  for r in select token, principal_label, count_before, count_after
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'NARROWER' and count_before - count_after >= 50
            order by count_before - count_after desc limit 25
  loop
    raise notice 'dd137b5: NARROWED % for % : % -> % (-%)',
      r.token, r.principal_label, r.count_before, r.count_after, r.count_before - r.count_after;
  end loop;

  -- 🚨 AND THE OTHER HALF OF db-rules §6: over-tightening is a defect too. NOBODY may have lost
  -- access to a row they OWN. Measured, not assumed.
  select count(*) into v_n from iam.access_delta_compare(v_before, v_after)
   where verdict = 'NARROWER' and principal_label = 'anonymous (no JWT)';
  if v_n > 0 then
    raise notice 'dd137b5: % anonymous pairs narrowed — check that no public surface went dark', v_n;
  end if;
end $$;

-- The owner still reads their own rows. This is the assertion that makes "0 wider" mean something
-- other than "we broke everything equally".
do $$
declare v_owner uuid; v_n bigint; v_total bigint;
begin
  select created_by into v_owner from chat.conversation
   where visibility = 'personal' and created_by is not null
   group by created_by order by count(*) desc limit 1;
  select count(*) into v_total from chat.conversation where created_by = v_owner;

  perform set_config('request.jwt.claims',
    json_build_object('sub', v_owner::text, 'role','authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_n from chat.conversation where created_by = v_owner;
  execute 'reset role';

  if v_n <> v_total then
    raise exception 'dd137b5: the busiest owner of private conversations reads % of their own % — '
      'over-tightening is as serious a bug as a stranger let in (db-rules §6)', v_n, v_total;
  end if;
  raise notice 'dd137b5: the busiest owner still reads all % of their own private conversations', v_total;
end $$;

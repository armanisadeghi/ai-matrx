-- iam_personal_row_wall_dd165b_baseline — THE BEFORE SNAPSHOT, ON ITS OWN (DD-165).
--
-- 179 active tokens are unsuppressed AND carry a typed `platform.visibility` column, so each one
-- emits a platform-staff arm that DD-165 walls. This file records what each of seven identities can
-- read on all 179 BEFORE any policy moves, pinned to one instant, holding no lock on anything.
--
-- THE CAST IS V-43's, deliberately. Two platform admins (one of them the super_admin who read all
-- 137 of another person's `personal` notes), the member those rows belong to, the admin of that
-- member's organization, a plain member of the same organization, a non-member and anonymous. The
-- narrowings are the POINT of this round — what must not happen is a single WIDER pair, and the
-- non-staff principals are in the cast precisely so a narrowing that hits THEM is visible.
do $$
declare
  v_before uuid; v_as timestamptz := now();
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf',  -- V-43's platform admin, arman26@gmail.com (super_admin)
    '6555aa73-c647-4ecf-8a96-b60e315b6b18',  -- a second platform admin, info@aimatrx.com
    'c5e92166-e148-4e73-926e-83af0c453665',  -- V-43's subject: the member whose personal rows must stay personal
    '34ed4fc3-c527-4819-99bf-15c26603b261',  -- organization admin of that member's org, NOT a platform admin
    '392afd39-d59c-4418-866b-451e9d93fead',  -- plain member of the same organization
    '4060701e-706a-4c76-b3ca-0bbc69fa5a14',  -- non-member, test@test.com
    '00000000-0000-0000-0000-000000000000'   -- anonymous, no JWT
  ]::uuid[];
  v_tokens text[] := array['feature_doc','comparison_set','cmp_feedback','agent','agent_exemplar','agent_mandate_note','message_template','agent_prompt_remediation','agent_shortcut','agent_template','ai_api','ai_endpoint','ai_model_alias','ai_model','ai_offering','ai_provider','ai_setting','voice','app','billing_spend_guardrail','browser_login_recipe','browser_site_policy','canvas_item','shared_canvas_item','code_folder','code_file','code_repository','commerce_certified_printer','commerce_ebay_category','commerce_ebay_category_aspect','commerce_ebay_category_tree','commerce_ebay_marketplace_policy','commerce_ebay_notification_destination','commerce_ebay_notification_topic','commerce_marketplace_rate_budget','commerce_print_order','meet_meeting','notification_event_override','notification_event_type','content_ir_kind','content_ir_kind_instance','scope','system_context_item','crm_blocklist_entry','contact_medium','crm_deal','crm_enrichment_call','crm_outreach_list','party','crm_registry_ingest_run','crm_registry_source','crm_saved_view','crm_sending_identity','crm_sending_policy','assessment','fc_card','fc_set','game_room','learn_doc','study_media','esign_campaign','esign_consent_disclosure','esign_envelope','esign_provider_binding','wbx_capture','wbx_demo','wbx_guidance','wbx_highlight','wbx_pattern','wbx_screenshot','wbx_seo_audit','file','folder','growth_loop_run','hindsight_regression_case','hindsight_replay_step','hr_access_role','hr_careers_portal','hr_field_policy','hr_jurisdiction','hr_jurisdiction_rule','hr_jurisdiction_rule_class','hr_jurisdiction_rule_org_decision','hr_posting','hr_provider_binding','hr_record_class','hr_retention_rule','hr_workflow_definition','hr_workflow_flow_type','access_request','iam_api_key','wc_claim','mandate_binding','mandate','provision','mandate_reference','mandate_scan','mandate_treatment','marketing_initiative','ops_proof_check','ops_proof_scenario','pdf_redaction_audit','plan_entity','plan_node','plan_profile','approach','category','comment','custom_entity_definition','custom_field_definition','custom_field_target','domain_classification','flexible_data','guided_checklist_run','platform_outcome_event','platform_outsider_consumer','purpose','route_manifest_entry','rulebook','pc_article','pc_episode','pc_show','pc_studio_run','library_doc','research_context_bundle','research_template','research_topic','youtube_search','youtube_video','global_origin','global_request','runtime_operation_stream','runtime_operation_stream_batch','sch_task','seo_collection_run','seo_engine_schedule','seo_geo_place','seo_gsc_dig_rule','seo_keyword','seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market','seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack','seo_starter_pack_item','seo_story_angle','seo_topic','skill','skill_render_definition','tool_bundle','tool','studio_session','transcript','ui_surface_agent_pref','ui_surface_config','invitation_code','user_profile','web_analysis_item','web_brand','web_listing_publisher','web_offering_template','web_provider','web_site','note_folder','note','product_capture_item','workflow','workflow_run','workflow_runtime_surface','workflow_template','workflow_trigger','project','task','thread','war_room'];
begin
  if (select count(*) from iam.access_delta_run where label = 'DD-165b BEFORE') > 0 then
    raise notice 'dd165b: the baseline is already on record';
    return;
  end if;
  v_before := iam.access_delta_snapshot('DD-165b BEFORE', v_principals, v_tokens, 400000,
    'DD-165: every unsuppressed token carrying a typed platform.visibility column', v_as);
  raise notice 'dd165b: baseline % over % tokens x % principals, pinned at %',
    v_before, cardinality(v_tokens), cardinality(v_principals), v_as;
end $$;

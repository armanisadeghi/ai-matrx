-- iam_personal_row_wall_dd165g_gate — THE ACCESS DELTA AND THE END-STATE ASSERTION (DD-165).
--
-- dd165b took the baseline and dd165c..f committed the regeneration in four batches. This re-probes
-- the SAME 179 tokens with the SAME 7 principals, pinned to the SAME instant dd165b recorded, and
-- runs the WIDER-diff gate over the real before/after pair. It holds no exclusive lock on anything:
-- that separation is why it is its own file.
--
-- 🚨 THE NARROWINGS ARE THE POINT OF THIS ROUND, so they are NAMED, not counted. What must not
-- happen is a single WIDER pair — and the four non-staff principals are in the cast precisely so a
-- narrowing that reaches THEM (an owner losing their own row, a member losing a shared one) shows up
-- as a named line rather than as an aggregate nobody reads.
do $$
declare
  v_before uuid; v_after uuid; v_as timestamptz; v_msg text; r record;
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf','6555aa73-c647-4ecf-8a96-b60e315b6b18',
    'c5e92166-e148-4e73-926e-83af0c453665','34ed4fc3-c527-4819-99bf-15c26603b261',
    '392afd39-d59c-4418-866b-451e9d93fead','4060701e-706a-4c76-b3ca-0bbc69fa5a14',
    '00000000-0000-0000-0000-000000000000']::uuid[];
  v_tokens text[] := array['feature_doc','comparison_set','cmp_feedback','agent','agent_exemplar','agent_mandate_note','message_template','agent_prompt_remediation','agent_shortcut','agent_template','ai_api','ai_endpoint','ai_model_alias','ai_model','ai_offering','ai_provider','ai_setting','voice','app','billing_spend_guardrail','browser_login_recipe','browser_site_policy','canvas_item','shared_canvas_item','code_folder','code_file','code_repository','commerce_certified_printer','commerce_ebay_category','commerce_ebay_category_aspect','commerce_ebay_category_tree','commerce_ebay_marketplace_policy','commerce_ebay_notification_destination','commerce_ebay_notification_topic','commerce_marketplace_rate_budget','commerce_print_order','meet_meeting','notification_event_override','notification_event_type','content_ir_kind','content_ir_kind_instance','scope','system_context_item','crm_blocklist_entry','contact_medium','crm_deal','crm_enrichment_call','crm_outreach_list','party','crm_registry_ingest_run','crm_registry_source','crm_saved_view','crm_sending_identity','crm_sending_policy','assessment','fc_card','fc_set','game_room','learn_doc','study_media','esign_campaign','esign_consent_disclosure','esign_envelope','esign_provider_binding','wbx_capture','wbx_demo','wbx_guidance','wbx_highlight','wbx_pattern','wbx_screenshot','wbx_seo_audit','file','folder','growth_loop_run','hindsight_regression_case','hindsight_replay_step','hr_access_role','hr_careers_portal','hr_field_policy','hr_jurisdiction','hr_jurisdiction_rule','hr_jurisdiction_rule_class','hr_jurisdiction_rule_org_decision','hr_posting','hr_provider_binding','hr_record_class','hr_retention_rule','hr_workflow_definition','hr_workflow_flow_type','access_request','iam_api_key','wc_claim','mandate_binding','mandate','provision','mandate_reference','mandate_scan','mandate_treatment','marketing_initiative','ops_proof_check','ops_proof_scenario','pdf_redaction_audit','plan_entity','plan_node','plan_profile','approach','category','comment','custom_entity_definition','custom_field_definition','custom_field_target','domain_classification','flexible_data','guided_checklist_run','platform_outcome_event','platform_outsider_consumer','purpose','route_manifest_entry','rulebook','pc_article','pc_episode','pc_show','pc_studio_run','library_doc','research_context_bundle','research_template','research_topic','youtube_search','youtube_video','global_origin','global_request','runtime_operation_stream','runtime_operation_stream_batch','sch_task','seo_collection_run','seo_engine_schedule','seo_geo_place','seo_gsc_dig_rule','seo_keyword','seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market','seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack','seo_starter_pack_item','seo_story_angle','seo_topic','skill','skill_render_definition','tool_bundle','tool','studio_session','transcript','ui_surface_agent_pref','ui_surface_config','invitation_code','user_profile','web_analysis_item','web_brand','web_listing_publisher','web_offering_template','web_provider','web_site','note_folder','note','product_capture_item','workflow','workflow_run','workflow_runtime_surface','workflow_template','workflow_trigger','project','task','thread','war_room'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-165b BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd165g: there is no DD-165b BEFORE snapshot to compare against. A gate with no '
      'baseline is not a gate. Run iam_personal_row_wall_dd165b_baseline.sql first.';
  end if;

  v_after := iam.access_delta_snapshot('DD-165g AFTER', v_principals, v_tokens, 400000,
    'DD-165 confirmation, pinned to the dd165b baseline instant', v_as);

  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd165g: %', v_msg;

  for r in select token, principal_label, count_before, count_after
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'NARROWER'
            order by count_before - count_after desc limit 40
  loop
    raise notice 'dd165g: NARROWED % for % : % -> %', r.token, r.principal_label,
      r.count_before, r.count_after;
  end loop;
end $$;

-- 🚨 THE END-STATE ASSERTION THE FOUR-BATCH SHAPE MAKES NECESSARY. Per-batch commits mean a partial
-- application is possible — batch 2 can commit and batch 3 fail — so "the migrations ran" is no
-- longer the same sentence as "every staff arm is walled". This asks the DATABASE, token by token,
-- through the check itself, and it names its residue rather than counting it: an unexpected token
-- still unwalled is a miss, and an expected one becoming walled is good news that must be noticed so
-- the list shrinks deliberately instead of rotting into folklore.
do $$
declare
  r record; v_open text[] := '{}'; v_unexpected text[]; v_closed text[];
  v_expected constant text[] := array[
    -- `iam.apply_rls` refuses both BY CONSTRUCTION, so they keep their bespoke policies AND their
    -- unwalled staff arm. Both are already named residue on `check:staff-door` and in DD-137b.
    'access_request',   -- audit_class='machinery': it owns inputs the access resolver consumes
    -- both refuse with `42883 operator does not exist: text = uuid`, the same type mismatch in the
    -- same `extend` pair. DD-137b named only `wbx_guidance` because check:staff-door's population is
    -- private/confidential tokens and `wbx_demo` is classed `organization` — exactly the blind spot
    -- DD-165 covers. Neither holds a visibility='personal' row today.
    'wbx_guidance', 'wbx_demo'];
begin
  for r in
    select et.token, et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
      join information_schema.columns c
        on c.table_schema = et.schema_name and c.table_name = et.table_name
       and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility'
     where et.is_active
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and not coalesce(et.suppress_platform_admin_lane, false)
     order by et.token
  loop
    if exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) v
                where v.check_name = 'personal_row_wall' and v.status = 'FAIL') then
      v_open := array_append(v_open, r.token);
    end if;
  end loop;

  v_unexpected := array(select unnest(v_open) except select unnest(v_expected));
  v_closed     := array(select unnest(v_expected) except select unnest(v_open));

  if cardinality(v_unexpected) > 0 then
    raise exception 'dd165g: % token(s) still let a platform admin read a person''s `personal` row '
      'and are NOT known residue: %. Re-run the batch that owns them (dd165c..f are idempotent).',
      cardinality(v_unexpected), array_to_string(v_unexpected, ', ');
  end if;
  if cardinality(v_closed) > 0 then
    raise exception 'dd165g: % expected-residue token(s) are now WALLED: %. Good news — remove them '
      'from v_expected here and from RESIDUE_TOKENS in scripts/check-row-visibility.ts in the same '
      'commit. A residue list that quietly shrinks is a residue list nobody re-reads.',
      cardinality(v_closed), array_to_string(v_closed, ', ');
  end if;
  raise notice 'dd165g: every unsuppressed token with a typed visibility column is walled, except '
    'the % named residue: %', cardinality(v_expected), array_to_string(v_expected, ', ');
end $$;

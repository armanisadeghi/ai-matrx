-- iam_containment_never_carries_personal_dd171d_gate — THE ACCESS DELTA, THE PROOFS AND THE
-- END-STATE ASSERTION (DD-171).
--
-- dd171a took the baseline and the RED; dd171b moved the kernel, the set form, the mirror and the
-- check; dd171c1..4 regenerated the 20 tokens the check reported open. This file is the part that
-- is allowed to say the word "done", and it says it only against numbers written down BEFORE
-- anything moved.

-- ── 1. THE FLEET ACCESS DELTA — 0 WIDER, and every narrowing NAMED ───────────────────────────────
-- The fix is in `iam.has_access_for_base` and `iam.accessible_entity_ids`: the kernel every
-- generated policy calls. So the gate cannot be scoped to the 20 regenerated tokens — it re-probes
-- the same 179 tokens with the same 7 principals DD-165 used, pinned to the dd171a instant.
do $$
declare
  v_before uuid; v_after uuid; v_as timestamptz; v_msg text; r record; v_narrowed int := 0;
  v_principals uuid[] := array[
    '7604b9d9-57f3-4c44-b75b-dc9a3ee8aacf','6555aa73-c647-4ecf-8a96-b60e315b6b18',
    'c5e92166-e148-4e73-926e-83af0c453665','34ed4fc3-c527-4819-99bf-15c26603b261',
    '392afd39-d59c-4418-866b-451e9d93fead','4060701e-706a-4c76-b3ca-0bbc69fa5a14',
    '00000000-0000-0000-0000-000000000000']::uuid[];
  v_tokens text[] := array['feature_doc','comparison_set','cmp_feedback','agent','agent_exemplar','agent_mandate_note','message_template','agent_prompt_remediation','agent_shortcut','agent_template','ai_api','ai_endpoint','ai_model_alias','ai_model','ai_offering','ai_provider','ai_setting','voice','app','billing_spend_guardrail','browser_login_recipe','browser_site_policy','canvas_item','shared_canvas_item','code_folder','code_file','code_repository','commerce_certified_printer','commerce_ebay_category','commerce_ebay_category_aspect','commerce_ebay_category_tree','commerce_ebay_marketplace_policy','commerce_ebay_notification_destination','commerce_ebay_notification_topic','commerce_marketplace_rate_budget','commerce_print_order','meet_meeting','notification_event_override','notification_event_type','content_ir_kind','content_ir_kind_instance','scope','system_context_item','crm_blocklist_entry','contact_medium','crm_deal','crm_enrichment_call','crm_outreach_list','party','crm_registry_ingest_run','crm_registry_source','crm_saved_view','crm_sending_identity','crm_sending_policy','assessment','fc_card','fc_set','game_room','learn_doc','study_media','esign_campaign','esign_consent_disclosure','esign_envelope','esign_provider_binding','wbx_capture','wbx_demo','wbx_guidance','wbx_highlight','wbx_pattern','wbx_screenshot','wbx_seo_audit','file','folder','growth_loop_run','hindsight_regression_case','hindsight_replay_step','hr_access_role','hr_careers_portal','hr_field_policy','hr_jurisdiction','hr_jurisdiction_rule','hr_jurisdiction_rule_class','hr_jurisdiction_rule_org_decision','hr_posting','hr_provider_binding','hr_record_class','hr_retention_rule','hr_workflow_definition','hr_workflow_flow_type','access_request','iam_api_key','wc_claim','mandate_binding','mandate','provision','mandate_reference','mandate_scan','mandate_treatment','marketing_initiative','ops_proof_check','ops_proof_scenario','pdf_redaction_audit','plan_entity','plan_node','plan_profile','approach','category','comment','custom_entity_definition','custom_field_definition','custom_field_target','domain_classification','flexible_data','guided_checklist_run','platform_outcome_event','platform_outsider_consumer','purpose','route_manifest_entry','rulebook','pc_article','pc_episode','pc_show','pc_studio_run','library_doc','research_context_bundle','research_template','research_topic','youtube_search','youtube_video','global_origin','global_request','runtime_operation_stream','runtime_operation_stream_batch','sch_task','seo_collection_run','seo_engine_schedule','seo_geo_place','seo_gsc_dig_rule','seo_keyword','seo_keyword_class_rule','seo_keyword_edge','seo_keyword_facet','seo_keyword_market','seo_keyword_place','seo_keyword_topic','seo_rank_target','seo_source_request','seo_starter_pack','seo_starter_pack_item','seo_story_angle','seo_topic','skill','skill_render_definition','tool_bundle','tool','studio_session','transcript','ui_surface_agent_pref','ui_surface_config','invitation_code','user_profile','web_analysis_item','web_brand','web_listing_publisher','web_offering_template','web_provider','web_site','note_folder','note','product_capture_item','workflow','workflow_run','workflow_runtime_surface','workflow_template','workflow_trigger','project','task','thread','war_room'];
begin
  select id, started_at into v_before, v_as from iam.access_delta_run
   where label = 'DD-171a BEFORE' order by started_at desc limit 1;
  if v_before is null then
    raise exception 'dd171d: there is no DD-171a BEFORE snapshot to compare against. A gate with no '
      'baseline is not a gate. Run …dd171a_baseline.sql first.';
  end if;

  v_after := iam.access_delta_snapshot('DD-171d AFTER', v_principals, v_tokens, 400000,
    'DD-171 confirmation, pinned to the dd171a baseline instant', v_as);

  v_msg := iam.access_delta_assert_no_widening(v_before, v_after);
  raise notice 'dd171d: %', v_msg;

  for r in select token, principal_label, count_before, count_after
             from iam.access_delta_compare(v_before, v_after)
            where verdict = 'NARROWER'
            order by count_before - count_after desc limit 40
  loop
    v_narrowed := v_narrowed + 1;
    raise notice 'dd171d: NARROWED % for % : % -> %', r.token, r.principal_label,
      r.count_before, r.count_after;
  end loop;
  raise notice 'dd171d: % narrowed (token, principal) pair(s) named above', v_narrowed;
end $$;

-- ── 2. THE CONTAINMENT READINGS, RE-TAKEN AND ASSERTED ───────────────────────────────────────────
-- Same probe dd171a ran, same identities, same rows. The BEFORE numbers are on disk in
-- iam.dd171_containment_baseline; these are recorded beside them as phase 'AFTER' and asserted.
do $$
declare
  i record; r record; v_q text; v_n bigint; v_bad text[] := '{}'; v_closed bigint;
begin
  delete from iam.dd171_containment_baseline where phase = 'AFTER';
  create temp table _dd171_ids(label text, uid uuid) on commit drop;
  insert into _dd171_ids
  select 'platform_admin', u.id from auth.users u where u.email = 'admin@admin.com'
  union all select 'org_admin', u.id from auth.users u where u.email = 'arman@titaniumsuccess.com'
  union all select 'member',    u.id from auth.users u where u.email = 'kelvin.kiprop96@gmail.com'
  union all select 'owner',     u.id from auth.users u where u.email = 'arman@armansadeghi.com';

  for r in
    select distinct b.token, b.axis, et.schema_name, et.table_name
      from iam.dd171_containment_baseline b
      join platform.entity_types et on et.token = b.token
     where b.phase = 'BEFORE'
  loop
    select p.qual into v_q from pg_policies p
     where p.schemaname = r.schema_name and p.tablename = r.table_name and p.policyname = 'std_select';
    continue when v_q is null;
    for i in select * from _dd171_ids loop
      perform set_config('request.jwt.claims', json_build_object('sub', i.uid, 'role','authenticated')::text, true);
      if r.axis = 'reachability' then
        execute format(
          'select count(*)::bigint from (select * from %I.%I) s
            where s.visibility = ''personal''::platform.visibility
              and s.created_by is distinct from %L::uuid
              and exists (select 1 from platform.reachability rr where rr.item_type = %L and rr.item_id = s.id)
              and (%s)', r.schema_name, r.table_name, i.uid, r.token, v_q) into v_n;
      else
        execute format(
          'select count(*)::bigint from (select * from %I.%I) s
            where s.visibility = ''personal''::platform.visibility
              and s.created_by is distinct from %L::uuid and (%s)',
          r.schema_name, r.table_name, i.uid, v_q) into v_n;
      end if;
      insert into iam.dd171_containment_baseline(phase, token, axis, principal, reads_others_personal)
      values ('AFTER', r.token, r.axis, i.label, v_n);
    end loop;
  end loop;
  perform set_config('request.jwt.claims', '', true);

  -- 🚨 THE ONE READING THAT IS NOT CONTAINMENT AND IS NOT THIS ROUND'S, NAMED RATHER THAN WAIVED.
  -- `agent` keeps ONE row for the platform-super-admin identity in the cast: agent.definition
  -- 0315e53f-…, created_by admin@admin.com, visibility personal, task_id NULL — so no containment
  -- edge reaches it at all. It is admitted by the kernel's system-org super-admin arm (its
  -- organization is the global_readable Matrx System org), which is DD-170's open item and was
  -- measured at 8 rows by DD-165. Walling it re-scopes the entity read path for platform content
  -- and is not DD-171's class. Excluded by NAME, with its reason, never by a tolerance number.
  for r in
    select b.token, b.axis, b.principal, b.reads_others_personal before_n, a.reads_others_personal after_n
      from iam.dd171_containment_baseline b
      join iam.dd171_containment_baseline a
        on a.phase = 'AFTER' and a.token = b.token and a.axis = b.axis and a.principal = b.principal
     where b.phase = 'BEFORE' and a.reads_others_personal > 0
       and not (b.token = 'agent' and b.axis = 'parent_fk')
  loop
    v_bad := array_append(v_bad, format('%s/%s/%s still reads %s', r.token, r.axis, r.principal, r.after_n));
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'dd171d: containment still carries a personal row: %', array_to_string(v_bad, '; ');
  end if;

  select coalesce(sum(b.reads_others_personal), 0) into v_closed
    from iam.dd171_containment_baseline b where b.phase = 'BEFORE' and b.principal <> 'owner';
  raise notice 'dd171d: every containment reading is 0 — % other-people''s personal rows were '
    'readable through a container before this round', v_closed;
end $$;

-- ── 3. CONTAINMENT STILL WORKS FOR EVERYTHING AT internal AND ABOVE ──────────────────────────────
-- A blocked legitimate reader is as serious as a leak (db-rules §6a). This is the other half of the
-- ruling, and it fails loudly if the wall went one value too far.
do $$
declare v_member uuid; v_q text; v_n bigint;
begin
  select id into v_member from auth.users where email = 'kelvin.kiprop96@gmail.com';
  select qual into v_q from pg_policies
   where schemaname = 'files' and tablename = 'files' and policyname = 'std_select';
  perform set_config('request.jwt.claims',
    json_build_object('sub', v_member, 'role','authenticated')::text, true);
  execute format(
    'select count(*)::bigint from (select * from files.files) s
      where s.visibility = ''internal''::platform.visibility and s.parent_folder_id is not null
        and s.created_by is distinct from %L::uuid and (%s)', v_member, v_q) into v_n;
  perform set_config('request.jwt.claims', '', true);
  if v_n = 0 then
    raise exception 'dd171d: the plain member can no longer read ANY internal file inside a shared '
      'folder — the wall took a value it was never meant to take. Refusing.';
  end if;
  raise notice 'dd171d: containment intact above the floor — the plain member still reads % internal '
    'file(s) not their own inside folders they can see', v_n;
end $$;

-- ── 4. THE CHAT-ROOM SENTENCE, MADE TRUE ─────────────────────────────────────────────────────────
-- The screen now says "personal — only you can see this, even inside a shared room". This asserts
-- the sentence rather than trusting it: for every PERSONAL conversation sitting inside a war room
-- that a member of the room's organization CAN read, that member must read the room and NOT the
-- conversation.
do $$
declare r record; v_reader uuid; v_rooms int := 0; v_leaks int := 0;
begin
  for r in
    select c.id conv, c.created_by conv_owner, rr.container_id room, w.organization_id org
      from platform.reachability rr
      join chat.conversation c on c.id = rr.item_id
      join workspace.war_rooms w on w.id = rr.container_id
     where rr.item_type = 'conversation' and rr.container_type = 'war_room'
       and c.visibility = 'personal'::platform.visibility
       and w.visibility >= 'internal'::platform.visibility and w.organization_id is not null
  loop
    select om.user_id into v_reader from iam.organization_member om
     where om.organization_id = r.org and om.user_id is distinct from r.conv_owner limit 1;
    continue when v_reader is null;
    continue when not iam.has_access_for_base(v_reader, 'war_room', r.room, 'viewer');
    v_rooms := v_rooms + 1;
    if iam.has_access_for_base(v_reader, 'conversation', r.conv, 'viewer') then
      v_leaks := v_leaks + 1;
    end if;
  end loop;
  if v_rooms = 0 then
    raise exception 'dd171d: no (shared room, personal conversation, other reader) triple could be '
      'found — an unrun forcing test is not a forcing test';
  end if;
  if v_leaks > 0 then
    raise exception 'dd171d: % of % personal conversation(s) inside a shared room are STILL readable '
      'by someone who can only read the room — the header sentence would be a lie', v_leaks, v_rooms;
  end if;
  raise notice 'dd171d: % personal conversation(s) inside a shared room the reader CAN see — the '
    'reader reads the room and 0 of the conversations', v_rooms;
end $$;

-- ── 5. THE END-STATE ASSERTION ───────────────────────────────────────────────────────────────────
-- Per-file commits make a partial application possible, so "the migrations ran" is not the same
-- sentence as "every containment arm is walled". This asks the DATABASE, token by token, through
-- the check itself. There is no expected-residue list here: unlike DD-165's staff arms, every token
-- in this population regenerates cleanly, and an empty residue list is a fact worth asserting rather
-- than a tolerance worth carrying.
do $$
declare r record; v_open text[] := '{}';
begin
  for r in
    select et.token, et.schema_name, et.table_name, et.rls_variant
      from platform.entity_types et
     where et.is_active
       and to_regclass(format('%I.%I', et.schema_name, et.table_name)) is not null
       and exists (select 1 from platform.entity_relationships er
                    where er.child_type = et.token and er.kind in ('composition','containment'))
       and exists (select 1 from information_schema.columns c
                    where c.table_schema = et.schema_name and c.table_name = et.table_name
                      and c.column_name = 'visibility' and c.udt_schema = 'platform' and c.udt_name = 'visibility')
     order by et.token
  loop
    if exists (select 1 from iam.verify_canonical(r.schema_name, r.table_name, r.token, r.rls_variant) v
                where v.check_name = 'containment_respects_personal' and v.status = 'FAIL') then
      v_open := array_append(v_open, r.token);
    end if;
  end loop;
  if cardinality(v_open) > 0 then
    raise exception 'dd171d: % token(s) still carry an unwalled containment arm: %. Re-run '
      '…dd171c1..4_regen.sql (they are idempotent and derive their set from the check).',
      cardinality(v_open), array_to_string(v_open, ', ');
  end if;
  raise notice 'dd171d: every token with a typed visibility column and a containment parent is '
    'walled — no residue';
  if iam.entity_read_kernel_fingerprint() is distinct from iam.entity_read_kernel_expected() then
    raise exception 'dd171d: kernel fingerprint live % <> expected % at the end — the mirror would '
      'refuse to emit', iam.entity_read_kernel_fingerprint(), iam.entity_read_kernel_expected();
  end if;
end $$;

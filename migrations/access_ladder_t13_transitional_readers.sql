-- lane: access-ladder T-13 step 2.5 (owner ruling: transitional readers)
-- lock: platform
-- based-on: platform._t13_no_new_row_column_reader() 6cc5cba1696b2f2505c79d3c7613c229a3be2c3bf198ba2a9a9a337da29d55ab
-- based-on: platform._t13_allowlist(text) 9b6d3ae9318bb54d6368b69fa868d366f8d39482023429f8cccf7bdb5860feba
--
-- T-13 TRANSITIONAL READERS — COUNTED AND EXPIRING (strictness law clause 4; owner-session ruling
-- 2026-09-28). Phase 3's dual-write trigger function and access-gate functions must name the row
-- column. They enter guard (b) as TRANSITIONAL entries, never as readers:
--   * platform._t13_allowlist('transitional') — identities, only functions named
--     platform._t13_transitional_*; added only while current_date <= the expiry. A replacement of the
--     list adding anything else is refused by name.
--   * platform._t13_allowlist('transitional_expires') — 2026-12-15 (PLAN.md §2.5); only moves earlier.
--   * after the expiry a transitional entry no longer passes the reader guard, and aidream
--     scripts/check_t13_row_column_ratchet.py FAILS while any transitional entry exists after the
--     expiry or after the contract step (the enum gone), or when an entry is not created by a
--     ledgered matrx-frontend migrations/access_ladder_t13_*.sql file that names it.
-- Snapshots now record every change of a list (growth still refused for readers and columns).

CREATE OR REPLACE FUNCTION platform._t13_no_new_row_column_reader()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
declare
  -- Assembled so no guard body names the word it refuses.
  c_word constant text := 'visi' || 'bility';
  c_generated_policies constant text[] := array['std_select','std_insert','std_update','std_delete','platform_admin_all','platform_admin_select','pub_read'];
  c_list_fn constant text := 'platform._t13_allowlist(text)';
  cmd record;
  v_kind text;
  v_identity text;
  v_text text;
  v_rel oid;
  v_name text;
  v_schema text;
  v_offenders text[] := '{}';
  v_which text;
  v_snapshot text[];
  v_now text[];
  v_added text[];
begin
  for cmd in select * from pg_event_trigger_ddl_commands() loop
    if cmd.in_extension then
      continue;
    end if;
    v_kind := null; v_identity := null; v_text := null; v_rel := null; v_name := null; v_schema := null;

    if cmd.classid = 'pg_catalog.pg_proc'::regclass then
      select 'function', p.oid::regprocedure::text, p.prosrc, p.proname, n.nspname
        into v_kind, v_identity, v_text, v_name, v_schema
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.oid = cmd.objid;
      if v_schema like 'pg\_temp\_%' or (v_schema = 'platform' and v_name like '\_search\_item\_sync\_%') then
        v_text := null;
      end if;
    elsif cmd.classid = 'pg_catalog.pg_class'::regclass then
      select 'view', c.oid::regclass::text, pg_get_viewdef(c.oid)
        into v_kind, v_identity, v_text
        from pg_class c
       where c.oid = cmd.objid and c.relkind in ('v', 'm');
    elsif cmd.classid = 'pg_catalog.pg_policy'::regclass then
      select 'policy', pol.polrelid::regclass::text || ' / ' || pol.polname,
             coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || ' ' ||
             coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), ''),
             pol.polrelid, pol.polname
        into v_kind, v_identity, v_text, v_rel, v_name
        from pg_policy pol where pol.oid = cmd.objid;
      if v_name = any (c_generated_policies)
         and (exists (select 1 from pg_attribute a where a.attrelid = v_rel and a.attname = c_word and not a.attisdropped)
              or exists (select 1 from platform.entity_types et
                          where et.table_ref = v_rel::regclass and et.component_anon_read_via_public_parent)) then
        v_text := null;
      end if;
    end if;

    if v_text is not null
       and regexp_replace(v_text, 'ai_' || c_word, '', 'gi') ~* c_word
       and not (replace(v_kind || ' ' || v_identity, c_word, '{V}') = any (platform._t13_allowlist('readers')))
       -- TRANSITIONAL (counted and expiring): the campaign's own phase-3 machinery, named in the
       -- campaign namespace, admitted only until the expiry date and never after it.
       and not (replace(v_kind || ' ' || v_identity, c_word, '{V}') = any (platform._t13_allowlist('transitional'))
                and current_date <= (platform._t13_allowlist('transitional_expires'))[1]::date) then
      v_offenders := v_offenders || (v_kind || ' ' || v_identity);
    end if;

    -- THE LISTS ONLY SHRINK.
    if cmd.classid = 'pg_catalog.pg_proc'::regclass and v_identity = c_list_fn then
      foreach v_which in array array['closed_table_columns', 'readers', 'transitional', 'transitional_expires'] loop
        v_now := platform._t13_allowlist(v_which);
        select string_to_array(l.detail, E'\n') into v_snapshot
          from platform.ddl_guard_log l
         where l.rule = 't13_' || v_which
         order by l.id desc
         limit 1;
        select coalesce(array_agg(g order by g), '{}') into v_added
          from unnest(v_now) g
         where v_snapshot is null or not (g = any (v_snapshot));
        if v_which = 'transitional' and v_snapshot is not null and cardinality(v_added) > 0 then
          -- Transitional entries may be ADDED, but only in the campaign namespace and only before
          -- the expiry; the campaign's own named migration files are the only ones that create
          -- that namespace (aidream check_t13_row_column_ratchet.py proves each entry's ledgered file).
          if current_date > (platform._t13_allowlist('transitional_expires'))[1]::date
             or exists (select 1 from unnest(v_added) g
                         where g !~ '^function platform\._t13_transitional_[a-z0-9_]+\(') then
            raise exception 'T-13 transitional entries must be functions named platform._t13_transitional_* and added before % : %',
                (platform._t13_allowlist('transitional_expires'))[1], array_to_string(v_added, ', ')
              using errcode = 'check_violation',
                    hint = 'A transitional reader is the campaign''s own phase-3 machinery (dual-write trigger, access gate), added only by an access_ladder_t13_* migration (common-docs/projects/access-ladder/t13/PLAN.md §2.5). Anything else converts to published_to_web / shown_to.';
          end if;
          v_added := '{}';
        end if;
        if v_which = 'transitional_expires' and v_snapshot is not null and cardinality(v_added) > 0 then
          if (v_now)[1]::date > (v_snapshot)[1]::date then
            raise exception 'The T-13 transitional expiry only moves earlier: % is later than %.', (v_now)[1], (v_snapshot)[1]
              using errcode = 'check_violation',
                    hint = 'The contract phase ends the transitional readers; the date can be pulled in, never pushed out (common-docs/projects/access-ladder/t13/PLAN.md §2.5).';
          end if;
          v_added := '{}';
        end if;
        if v_snapshot is not null and cardinality(v_added) > 0 then
          raise exception 'The T-13 % list only shrinks: this replacement of % adds %.', v_which, c_list_fn, array_to_string(v_added, ', ')
            using errcode = 'check_violation',
                  hint = 'Convert the reader (read published_to_web / shown_to) or drop the column instead (common-docs/projects/access-ladder/t13/PLAN.md). Never grow the list.';
        end if;
        if v_snapshot is distinct from array(select x from unnest(v_now) x order by x) then
          insert into platform.ddl_guard_log
            (severity, rule, object_ref, command_tag, detail, acknowledged_at, ack_reason, acknowledged_by)
          values
            ('notice', 't13_' || v_which, c_list_fn, cmd.command_tag,
             array_to_string(array(select g from unnest(v_now) g order by g), E'\n'),
             now(), 'ratchet snapshot: the T-13 ' || v_which || ' list as of this replacement', 'platform._t13_no_new_row_column_reader');
        end if;
      end loop;
    end if;
  end loop;

  if cardinality(v_offenders) > 0 then
    raise exception 'A new reader of the row column that T-13 retires: %', array_to_string(v_offenders, ', ')
      using errcode = 'check_violation',
            detail = 'T-13 retires the row column into shown_to (a list filter, never security) and published_to_web (the only anonymous lane). No new function, procedure, view or policy may read it; the existing readers are listed in platform._t13_allowlist(''readers'') and that list only shrinks.',
            hint = 'Read published_to_web (or call platform._published_to_web_sql) for the anonymous lane and shown_to (through the T-11 list functions) for list narrowing. common-docs/projects/access-ladder/t13/PLAN.md';
  end if;
end
$function$;

CREATE OR REPLACE FUNCTION platform._t13_allowlist(p_which text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
  select case p_which
    when 'closed_table_columns' then array[
      'browser.authenticator_window.{V}',
      'browser.profile.{V}',
      'browser.profile_checkpoint.{V}',
      'browser.stream_ticket.{V}',
      'chat.agent_memory.{V}',
      'chat.coding_session.{V}',
      'chat.conversation.{V}',
      'chat.user_request.{V}',
      'communication.calendar_event.{V}',
      'communication.dm_conversations.{V}',
      'communication.notification.{V}',
      'communication.sms_conversations.{V}',
      'custom.record_p00.shown_to',
      'custom.record_p00.{V}',
      'custom.record_p01.shown_to',
      'custom.record_p01.{V}',
      'custom.record_p02.shown_to',
      'custom.record_p02.{V}',
      'custom.record_p03.shown_to',
      'custom.record_p03.{V}',
      'custom.record_p04.shown_to',
      'custom.record_p04.{V}',
      'custom.record_p05.shown_to',
      'custom.record_p05.{V}',
      'custom.record_p06.shown_to',
      'custom.record_p06.{V}',
      'custom.record_p07.shown_to',
      'custom.record_p07.{V}',
      'custom.record_p08.shown_to',
      'custom.record_p08.{V}',
      'custom.record_p09.shown_to',
      'custom.record_p09.{V}',
      'custom.record_p10.shown_to',
      'custom.record_p10.{V}',
      'custom.record_p11.shown_to',
      'custom.record_p11.{V}',
      'custom.record_p12.shown_to',
      'custom.record_p12.{V}',
      'custom.record_p13.shown_to',
      'custom.record_p13.{V}',
      'custom.record_p14.shown_to',
      'custom.record_p14.{V}',
      'custom.record_p15.shown_to',
      'custom.record_p15.{V}',
      'education.assessment_result.{V}',
      'education.item_mastery.shown_to',
      'education.item_mastery.{V}',
      'education.study_attempt.shown_to',
      'education.study_attempt.{V}',
      'education.study_plan_block.{V}',
      'education.study_plan_day.{V}',
      'education.study_session.shown_to',
      'education.study_session.{V}',
      'esign.provider.{V}',
      'esign.signing_key.{V}',
      'files.uploads_inflight.{V}',
      'hr.access_audit.{V}',
      'hr.accommodation_request.{V}',
      'hr.ai_evidence.{V}',
      'hr.background_check.{V}',
      'hr.candidate.{V}',
      'hr.compensation.{V}',
      'hr.corrective_action.{V}',
      'hr.eeo_response.{V}',
      'hr.emergency_contact.{V}',
      'hr.employee_private.{V}',
      'hr.employment.{V}',
      'hr.employment_pin.{V}',
      'hr.i9.{V}',
      'hr.incident.{V}',
      'hr.kiosk_session.{V}',
      'hr.leave_case.{V}',
      'hr.legal_hold.{V}',
      'hr.offer.{V}',
      'hr.recalculation_batch.{V}',
      'hr.records_request.{V}',
      'hr.reference_check.{V}',
      'hr.restricted_note.{V}',
      'hr.separation.{V}',
      'hr.tax_withholding.{V}',
      'hr.verification_letter_request.{V}',
      'hr.workflow_instance.{V}',
      'iam.access_audit.shown_to',
      'iam.access_audit.{V}',
      'legal.wc_claim.{V}',
      'platform.actor_session.{V}',
      'platform.actor_token.{V}',
      'seo.gsc_dig_rule.{V}',
      'seo.starter_pack_item.{V}',
      'transcripts.studio_sessions.shown_to',
      'transcripts.studio_sessions.{V}',
      'users.user_memory.{V}'
    ]::text[]
    when 'readers' then array[
      'function agent._enforce_builtin_system_org()',
      'function agent.create_review_thread()',
      'function agent.public_card_rows()',
      'function billing._spend_guardrail_validate()',
      'function billing.plan_status(uuid)',
      'function campaign_watch.share_cutover_plan(integer)',
      'function canvas.record_canvas_view(uuid,uuid,text,text)',
      'function canvas.set_canvas_like(uuid,boolean,uuid)',
      'function canvas.submit_canvas_score(uuid,integer,integer,boolean,uuid,integer,jsonb)',
      'function communication._task_assignment_outbox()',
      'function communication.calendar_event_legacy_collision_guard()',
      'function communication.enqueue_task_sms_reminder_for_user(uuid,uuid,text,text)',
      'function communication.meet_meeting_by_slug(text)',
      'function communication.meet_record_consent(uuid,text,timestamp with time zone)',
      'function communication.notify_from_sql(uuid,text,uuid,text,text,jsonb,text,text,uuid,text)',
      'function content._capture_version()',
      'function content._document_bump_content_version()',
      'function content._document_guard_data_class()',
      'function content._document_version_immutable()',
      'function content.annotation_create(uuid,uuid,text,uuid,text,text,jsonb,text)',
      'function content.document_get(uuid,boolean)',
      'function content.document_origin(uuid)',
      'function content.is_publicly_readable(content.document)',
      'function content.type_settings(text,uuid)',
      'function content_ir.admin_upsert_kind_content_block(uuid,text,text,text,text,text,jsonb)',
      'function content_ir.evaluate_kind_activation(uuid)',
      'function context.named_system_context_items(text[])',
      'function crm.ensure_user_party_in_org(uuid,uuid,text,boolean)',
      'function crm.upsert_party_phone_contact(uuid,uuid,text,text,text,text,uuid,timestamp with time zone,jsonb)',
      'function custom._checklist_run_visible(uuid,uuid,jsonb)',
      'function custom._context_side_effects(jsonb)',
      'function custom._ctx_store_scope(uuid,uuid,uuid,jsonb)',
      'function custom._field_reads_what_it_reads()',
      'function custom._inbox_items(uuid,uuid,boolean)',
      'function custom._portal_config_judge(uuid,uuid[],jsonb,jsonb)',
      'function custom._portal_picture_url(uuid,uuid,boolean)',
      'function custom._read_record_with(uuid,uuid,boolean,jsonb,jsonb)',
      'function custom._record_rule_uses()',
      'function custom._value_envelope()',
      'function custom._where_ids_open_with(uuid[],uuid,jsonb)',
      'function custom._words_for(uuid,uuid,jsonb,text,integer)',
      'function custom.addressed_cap_specific(uuid,text,uuid,uuid,uuid)',
      'function custom.agg_deliver(uuid,uuid,uuid,text,uuid,text,text,text,jsonb,text)',
      'function custom.agg_digest_assemble(uuid,uuid,timestamp with time zone,timestamp with time zone)',
      'function custom.agg_view_admits(uuid,uuid,uuid)',
      'function custom.anon_capture(uuid,text,uuid,jsonb,text,timestamp with time zone)',
      'function custom.anon_publish(uuid,uuid,boolean)',
      'function custom.anon_submissions(uuid,uuid,text,integer,integer)',
      'function custom.anon_token_issue(uuid,text,jsonb,uuid,uuid,uuid,timestamp with time zone)',
      'function custom.assert_client_may_change(uuid,uuid,text,public.permission_level,text)',
      'function custom.assert_client_may_open(uuid,uuid,text,public.permission_level,text)',
      'function custom.assert_may_know_table(uuid,uuid,text)',
      'function custom.bump_epoch(text,uuid,uuid)',
      'function custom.cache_lookup(text,uuid,text,uuid)',
      'function custom.capture_open(uuid,uuid)',
      'function custom.capture_sheets(uuid,uuid)',
      'function custom.capture_submit(uuid,uuid,text,jsonb,jsonb,text,timestamp with time zone,jsonb)',
      'function custom.carrying_edges_of(text,uuid)',
      'function custom.checklist_run(uuid,uuid)',
      'function custom.checklist_template_shape(uuid,uuid)',
      'function custom.checklist_templates(uuid,uuid,integer)',
      'function custom.choice_census(uuid,uuid)',
      'function custom.comment_mention_deliver(uuid,uuid,uuid,uuid,uuid,text,text,text)',
      'function custom.conversation_scope(uuid,uuid)',
      'function custom.conversation_scope_bind(uuid,uuid,uuid)',
      'function custom.dashboard_run(uuid,uuid,jsonb,jsonb,text)',
      'function custom.dashboard_stuck(uuid,uuid,text,integer,jsonb,integer,text)',
      'function custom.dashboards(uuid,uuid)',
      'function custom.data_home_items(uuid)',
      'function custom.data_home_tables(uuid)',
      'function custom.doors_not_deciding_the_caller()',
      'function custom.doors_not_deciding_the_record()',
      'function custom.doors_not_on_one_ladder()',
      'function custom.effective_level(uuid,uuid,uuid,text)',
      'function custom.external_tier_contract()',
      'function custom.field_choice_usage(uuid,uuid)',
      'function custom.field_context_policy_floor(uuid,jsonb,uuid)',
      'function custom.has_{V}_at(uuid,text,uuid,public.permission_level,uuid,bigint)',
      'function custom.hub_changed_by(uuid,text,uuid[])',
      'function custom.io_restore(uuid,uuid,integer)',
      'function custom.io_restore(uuid,uuid,integer,jsonb)',
      'function custom.io_revisions(uuid,uuid)',
      'function custom.levels_of(uuid,uuid[])',
      'function custom.list_door_disagreements(text,uuid,integer,boolean)',
      'function custom.list_portals(uuid,text)',
      'function custom.may_invite_outside(uuid,uuid)',
      'function custom.member_personal_tables(uuid,uuid)',
      'function custom.migrate_reparent(uuid,uuid,uuid,text)',
      'function custom.migrations(uuid,uuid,integer)',
      'function custom.my_level(uuid,uuid,text)',
      'function custom.per_value_access_words()',
      'function custom.pipeline_pending(uuid,uuid)',
      'function custom.portal_admits(uuid,uuid)',
      'function custom.portal_card(uuid,uuid)',
      'function custom.portal_tables(uuid)',
      'function custom.portals(uuid)',
      'function custom.promote_table(uuid,uuid)',
      'function custom.query_can_see(uuid,uuid,text)',
      'function custom.query_hot_paths()',
      'function custom.query_record_as_of(uuid,uuid,timestamp with time zone,date,text)',
      'function custom.query_rollup(uuid,uuid[],text,text,integer,text)',
      'function custom.query_{V}_parity(uuid)',
      'function custom.query_visible_ids(uuid,uuid,text)',
      'function custom.reaches_directly(uuid,text,uuid,public.permission_level)',
      'function custom.read_door_carried_ids(uuid,uuid,uuid,public.permission_level)',
      'function custom.read_door_parity(uuid,uuid,uuid,public.permission_level,integer)',
      'function custom.read_record(uuid,uuid,boolean)',
      'function custom.read_records(uuid,uuid,boolean,integer,integer)',
      'function custom.read_records_archived(uuid,uuid,text,boolean,integer,integer)',
      'function custom.read_records_by_ids(uuid,uuid,uuid[],boolean)',
      'function custom.read_records_matching(uuid,uuid,jsonb,boolean,integer,integer)',
      'function custom.record_card(uuid,uuid,uuid)',
      'function custom.record_reparent(uuid,uuid,uuid)',
      'function custom.record_table(uuid,uuid)',
      'function custom.relation_own(uuid,uuid,uuid)',
      'function custom.relation_target_card(uuid,uuid,text)',
      'function custom.required_epoch(text,uuid,text,uuid)',
      'function custom.row_sits_in_a_personal_table(text,uuid,uuid)',
      'function custom.rule_eval(uuid,jsonb,jsonb,jsonb)',
      'function custom.scope_member_reaches(uuid,uuid,public.permission_level)',
      'function custom.share_access(uuid,uuid)',
      'function custom.share_lane_set(uuid,uuid,text,public.permission_level)',
      'function custom.shared_only_disagreements(text)',
      'function custom.subscription_mute(uuid,uuid,boolean)',
      'function custom.subscription_preview(uuid,uuid)',
      'function custom.subscriptions(uuid,uuid)',
      'function custom.table_carries_its_rows(uuid,uuid,public.permission_level)',
      'function custom.table_copy_evaluation_state(uuid)',
      'function custom.table_facts(uuid)',
      'function custom.table_has_a_visible_record(uuid,uuid,uuid)',
      'function custom.table_list_everywhere(uuid)',
      'function custom.table_move(uuid,uuid,integer)',
      'function custom.table_transfer_owner(uuid,uuid,text)',
      'function custom.tables_at_home(uuid,uuid[])',
      'function custom.tables_described_without_asking()',
      'function custom.tables_i_can_open()',
      'function custom.trg_associations_bump_{V}()',
      'function custom.value_envelope_refusal(jsonb)',
      'function custom.view_declare(uuid,uuid,jsonb)',
      'function custom.view_look_set(uuid,uuid,uuid,jsonb)',
      'function custom.view_record_order_set(uuid,uuid,uuid[])',
      'function custom.{V}_as_of(uuid,uuid,timestamp with time zone)',
      'function custom.{V}_cache_rebuild()',
      'function custom.{V}_parity()',
      'function custom.{V}_warm(text,uuid)',
      'function custom.visible_predicate_sql(uuid,uuid,uuid,public.permission_level,text)',
      'function custom.visible_record_ids(uuid,public.permission_level)',
      'function custom.visible_set(uuid,uuid,uuid,public.permission_level)',
      'function custom.where_lists_live(uuid[])',
      'function custom.where_tables_live(uuid[])',
      'function custom.whole_value_complete(uuid,uuid,text,uuid)',
      'function custom.whole_value_park(uuid,uuid,uuid,uuid,platform.{V},jsonb,jsonb)',
      'function custom.whole_values_waiting(uuid,uuid[])',
      'function custom.work_approval_request(uuid,uuid,jsonb,text,uuid,text,uuid)',
      'function custom.work_list(uuid,text,boolean,integer,integer)',
      'function custom.work_templates(uuid,integer)',
      'function docproc.page_extraction_job_{V}_from_source()',
      'function docproc.processed_document_{V}_from_origin()',
      'function education.assessment_list_facets(text,text,uuid,text,jsonb,text)',
      'function education.assessment_list_match(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,text,text,text,text,text,text,uuid,text,jsonb,text,text)',
      'function education.assessment_list_scoped(text,text,uuid,text,jsonb,text,text,boolean,integer,integer)',
      'function education.fc_set_list_facets(text,uuid,text,jsonb,text)',
      'function education.fc_set_list_match(uuid,uuid,text,uuid,timestamp with time zone,text,text,text,text,text,uuid[],text,uuid,text,jsonb,text,text)',
      'function education.fc_set_list_scoped(text,uuid,text,jsonb,text,text,boolean,integer,integer)',
      'function files._adopt_chat_attachment_ids(uuid,uuid[])',
      'function files._adopt_chat_output_ids(uuid,uuid[])',
      'function files.crawl_variant_tagging_drift()',
      'function files.private_children_missing_parent()',
      'function files.reject_web_artifact_file_mutation()',
      'function history.capture_is_open(uuid)',
      'function history.who_could_see(uuid,uuid,timestamp with time zone)',
      'function hr._desired_grants_for_employment(uuid,date)',
      'function hr._desired_grants_for_requisition(uuid,date)',
      'function hr._l1_is_manager_of(uuid,uuid,date)',
      'function hr._l1_notify_consent_requested(uuid)',
      'function hr._punch_notify_edited(uuid,uuid,uuid,uuid,text,uuid,jsonb)',
      'function hr._run_fixture_probe(text,jsonb)',
      'function hr._wf_notify(uuid,uuid,text,text,uuid,uuid,jsonb)',
      'function hr._wf_project_step(uuid)',
      'function hr.access_explain(uuid,text,uuid)',
      'function hr.capability(uuid,text,uuid,date,uuid)',
      'function hr.earning_code_seed_org(uuid)',
      'function hr.org_jurisdiction_rule_save(uuid,jsonb,boolean)',
      'function hr.org_jurisdiction_rule_set_applies(uuid,text,text,boolean,text)',
      'function hr.punch_register(jsonb,jsonb)',
      'function hr.wf_instance(uuid)',
      'function iam._agent_open_to_every_member(uuid,uuid)',
      'function iam._apply_rls_unchecked(text,text,text,text)',
      'function iam._dd171_containment_filter(boolean,text,text)',
      'function iam._discovery_class_selftest_once()',
      'function iam._notify_door(uuid,text,uuid,jsonb,uuid,text,text)',
      'function iam._reach_node_lanes(uuid,uuid[],uuid[],text[],uuid[])',
      'function iam._record_access_audit(uuid,text,text,text,text,text,boolean,uuid[],integer,uuid,text,text,uuid,uuid,timestamp with time zone,boolean,uuid,uuid)',
      'function iam.access_arms_from_sources(uuid,uuid,text,uuid,uuid)',
      'function iam.accessible_entity_ids(text,public.permission_level,integer,boolean)',
      'function iam.admin_policy_findings(regclass)',
      'function iam.apply_config_rls(text,text)',
      'function iam.apply_rls(text,text,text,text)',
      'function iam.apply_table_grants(text,text,text)',
      'function iam.assoc_side_readable(text,uuid)',
      'function iam.children_with_own_read_arms()',
      'function iam.class_allows(text,text,uuid)',
      'function iam.class_lanes(text)',
      'function iam.discoverable_ids(uuid,text,public.permission_level,integer,boolean)',
      'function iam.entity_read_expr(text,text,text,text)',
      'function iam.entity_read_kernel_members_expected()',
      'function iam.entity_read_lane_preflight()',
      'function iam.external_principal_reach(text,uuid)',
      'function iam.generated_policy_names()',
      'function iam.governance_columns(text)',
      'function iam.has_access_for_base(uuid,text,uuid,public.permission_level,boolean,text[])',
      'function iam.is_discoverable_base(uuid,text,uuid,public.permission_level,boolean)',
      'function iam.lane_of(text,uuid)',
      'function iam.legacy_column_worklist()',
      'function iam.may_manage_sharing_as(uuid,text,uuid)',
      'function iam.member_default_level(uuid,uuid)',
      'function iam.member_default_level_as_of(uuid,uuid,timestamp with time zone)',
      'function iam.member_lane_confers(uuid,uuid,text,uuid,uuid,boolean)',
      'function iam.member_lane_open(uuid)',
      'function iam.member_lane_open_as_of(uuid,timestamp with time zone)',
      'function iam.member_level_justified(uuid,uuid,uuid)',
      'function iam.membership_row_visible(uuid)',
      'function iam.org_lane_{V}_sql(text,text)',
      'function iam.realtime_field_exposure()',
      'function iam.record_visible_in_org(uuid,uuid,uuid,platform.{V},uuid,public.permission_level)',
      'function iam.table_has_{V}(text,text)',
      'function iam.verify_canonical(text,text,text,text)',
      'function iam.world_publish_announcement(text,uuid)',
      'function interview._decision_answer_notify()',
      'function legal._bridge_wc_claim_is_public()',
      'function mandate._member_list_rows(text,uuid,uuid,text,text[],boolean)',
      'function mandate._member_list_seat(uuid,uuid,text,text[],uuid,uuid,uuid[])',
      'function mandate._member_scope_ok(text,text,uuid,uuid,uuid,uuid,uuid,boolean,boolean,text)',
      'function mandate.duplicate_mandate(uuid,boolean,uuid)',
      'function mandate.guard_binding_containment()',
      'function mandate.reference_head()',
      'function mandate.vw_shortcut_write()',
      'function mandate.workflow_holder_runnable(text,uuid,uuid,uuid)',
      'function ops.check_items_apply_run(uuid,jsonb,text,text,boolean)',
      'function ops.check_run_record(uuid,jsonb)',
      'function platform._admin_read_follows_rls()',
      'function platform._cutover_copy_resync(uuid,uuid,uuid)',
      'function platform._ddl_guard()',
      'function platform._enforce_category_two_levels()',
      'function platform._entity_types_classify_default()',
      'function platform._provision_shape_guard_impl(jsonb)',
      'function platform._published_to_web_sql(boolean,boolean)',
      'function platform._search_item_put(text,uuid,uuid,uuid,platform.{V},text,text,text[],timestamp with time zone,text,text)',
      'function platform._share_registry_class_interlock()',
      'function platform._store_pick_list_document(uuid,uuid,text)',
      'function platform.action_request_remint(text,text,timestamp with time zone)',
      'function platform.count_items(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone)',
      'function platform.create_entity_table(text,text,text,text,text[],text,boolean,boolean,text,boolean,boolean,boolean,boolean,text[],platform.data_class,platform.list_scope)',
      'function platform.defaults_that_lock_people_out()',
      'function platform.definer_access_decision_regex()',
      'function platform.derive_data_class(text,text)',
      'function platform.detail_parent_access_for(uuid,text,uuid,public.permission_level)',
      'function platform.detail_readable_parents(text)',
      'function platform.edge_structural_metadata_keys()',
      'function platform.enforce_retention_policy_settling()',
      'function platform.entity_default_{V}(text)',
      'function platform.entity_link_shareable(text)',
      'function platform.entity_row_access_attrs(text,text,uuid)',
      'function platform.held_by_its_organization(text,uuid,integer)',
      'function platform.kernel_equivalence_answers()',
      'function platform.materialize_library_rulebook(uuid,uuid,uuid,jsonb)',
      'function platform.memo_reach_tables()',
      'function platform.module_config(uuid,text)',
      'function platform.partitioned_row_attrs(text,text,uuid)',
      'function platform.provision(jsonb,text,uuid,text)',
      'function platform.provision_base_columns()',
      'function platform.provision_options(text,uuid)',
      'function platform.provision_selfcheck(boolean)',
      'function platform.provision_spec_grandfather_seed()',
      'function platform.provision_validate(jsonb,text,uuid)',
      'function platform.relation_label(uuid,text,uuid)',
      'function platform.relations_from(uuid,uuid)',
      'function platform.retrofit_entity(text,text,text,text,text,text,text,text,text,text)',
      'function platform.search_engine_indexed(text,text)',
      'function platform.search_engine_indexed_records(text,integer)',
      'function platform.search_item_backfill(text,uuid,integer)',
      'function platform.search_item_sections(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone,integer,jsonb)',
      'function platform.search_items(text,text[],uuid[],uuid[],text[],text[],uuid[],timestamp with time zone,timestamp with time zone,integer,text)',
      'function platform.set_shown_to(text,uuid,text)',
      'function platform.shown_to_lists(platform.shown_to,platform.{V},uuid,uuid,uuid,jsonb)',
      'function platform.shown_to_state(text,uuid)',
      'function platform.static_row_probe_spec()',
      'function platform.static_row_probe_sql()',
      'function platform.tag_scope_id(uuid,text,uuid)',
      'function private.sweep_marketing_finding_assists()',
      'function public.__scope_access_membrane_conformance()',
      'function public._saved_view_json(platform.saved_view)',
      'function public._trash_kind_rows(uuid,uuid,uuid,text[],integer,integer)',
      'function public._trash_store_children(uuid,uuid,uuid,text,integer)',
      'function public.access_denied_context(text,uuid)',
      'function public.access_request_blind(text,uuid,text,text)',
      'function public.admin_access_planner_snapshot(text)',
      'function public.admin_configure_entity_access(text,text,text,text,text,text,text,text)',
      'function public.admin_door_probe(uuid,integer)',
      'function public.admin_entity_types_list()',
      'function public.admin_exposure_audit_rows(text,text,text,boolean,integer,integer)',
      'function public.admin_exposure_audit_summary()',
      'function public.admin_list_share_policies()',
      'function public.admin_set_containment_edge(text,text,text,boolean,text)',
      'function public.admin_upsert_entity_type(text,text,text,text,smallint,boolean,boolean,boolean,boolean,boolean,text,boolean,text,boolean,boolean,boolean,text,boolean,text,boolean,text,text,text)',
      'function public.agx_create_agent_from_template(uuid)',
      'function public.agx_duplicate_shortcut(uuid,uuid)',
      'function public.agx_duplicate_shortcut_m(uuid,uuid)',
      'function public.agx_get_access_level(uuid)',
      'function public.agx_get_list_full()',
      'function public.agx_list_facets(text,uuid,text,boolean,text)',
      'function public.agx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function public.can_read_processed_document(uuid,uuid)',
      'function public.can_read_processed_document_any(uuid,uuid)',
      'function public.can_view_chat_conversation(uuid,uuid)',
      'function public.cat_archive(text,uuid)',
      'function public.cat_list(text)',
      'function public.cat_write(text,uuid,uuid,text,text,boolean,uuid,boolean,text,boolean,text,boolean,integer,boolean,text,boolean,jsonb,boolean)',
      'function public.checklist_run_save(uuid,uuid,jsonb,integer,boolean,timestamp with time zone,boolean,timestamp with time zone)',
      'function public.cmt_mention_notify(uuid,uuid[],text)',
      'function public.conversation_shared_room_notice(uuid)',
      'function public.conversations_exist(uuid[])',
      'function public.creator_public_handles()',
      'function public.creator_public_page(text)',
      'function public.creator_resolve_featured_resource(text,uuid)',
      'function public.creator_set_public(boolean)',
      'function public.crm_list_scope_counts(text,text,text)',
      'function public.crm_list_scope_counts(text,text,text,text)',
      'function public.cvx_deep_hits(text)',
      'function public.cvx_list_facets(text,uuid,text,boolean,text)',
      'function public.cvx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function public.cx_fork_conversation(uuid,smallint)',
      'function public.edu_learn_doc_delete(uuid)',
      'function public.edu_learn_doc_set_status(uuid,boolean)',
      'function public.edu_library_facets(text,text)',
      'function public.edu_library_list_scoped(text,text,text,text,jsonb,integer,integer)',
      'function public.edu_library_scope_rows(text)',
      'function public.edu_public_decks(text,boolean,integer,text)',
      'function public.entity_access_summary(text,uuid)',
      'function public.flexible_data_archive(uuid,uuid)',
      'function public.flexible_data_write(uuid,jsonb,uuid)',
      'function public.fork_shared_conversation(uuid,uuid,text)',
      'function public.fork_shared_flashcard_set(uuid,uuid,text)',
      'function public.fork_shared_quiz(uuid,uuid,text)',
      'function public.get_aga_public_data(text,uuid)',
      'function public.get_aga_public_execution(uuid)',
      'function public.get_agent_core_batch(uuid[],text[])',
      'function public.get_agent_operational(uuid,text)',
      'function public.get_agent_public(uuid)',
      'function public.get_agents_for_chat(integer,uuid)',
      'function public.get_conversation_for_display(uuid)',
      'function public.get_notes_shared_with_me()',
      'function public.get_prompt_app_execution_payload(uuid)',
      'function public.get_prompt_app_public_data(text,uuid)',
      'function public.get_public_flashcard_set(uuid)',
      'function public.get_published_app_with_prompt(text,uuid)',
      'function public.get_resource_access(text,uuid)',
      'function public.get_share_capabilities(text)',
      'function public.get_structured_list_for_selection(uuid)',
      'function public.get_tools_list(boolean)',
      'function public.get_user_feed(uuid,integer,integer)',
      'function public.get_user_file_tree(uuid,integer,integer,boolean,boolean,text)',
      'function public.get_user_list_with_items(uuid)',
      'function public.get_user_tables()',
      'function public.hr_activate_employer(jsonb)',
      'function public.hr_break_glass(text,uuid,text,text)',
      'function public.hr_employee_profile(uuid,date)',
      'function public.hr_my_context(uuid)',
      'function public.ivw_list_facets(text,uuid,text)',
      'function public.ivw_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)',
      'function public.make_resource_private(text,uuid)',
      'function public.make_resource_public(text,uuid)',
      'function public.mkt_initiative_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.mnd_member_list(text,text,text,uuid,uuid,text,jsonb,text,text,integer,integer)',
      'function public.org_admin_reassign_member_resources(uuid,uuid,uuid,text[])',
      'function public.org_admin_take_over_account(uuid,uuid,text,text,text)',
      'function public.org_admin_take_over_member_records(uuid,uuid,text,text,uuid)',
      'function public.org_null_ratchet_snapshot()',
      'function public.org_trash_restore(uuid,text,uuid)',
      'function public.provision_mcp_server(text,text,text,public.mcp_server_category,public.mcp_transport,public.mcp_auth_strategy,uuid,text,text,text,text,text,text,public.mcp_server_status,boolean,text[])',
      'function public.rag_user_can_see_note(uuid)',
      'function public.reference_search_candidates(text,text,integer,uuid[])',
      'function public.rsx_list_scoped(text,uuid,text,text,text,jsonb,integer,integer,text)',
      'function public.rulebook_archive(uuid)',
      'function public.rulebook_create(uuid,text,text,text,jsonb,jsonb,text,jsonb)',
      'function public.rulebook_meta_set(uuid,text,text,boolean,jsonb,text,text)',
      'function public.rulebook_save(uuid,integer,jsonb,jsonb,jsonb)',
      'function public.rulebook_tension_settle(uuid,integer,text,text,text,jsonb)',
      'function public.saved_view_save(text,uuid,uuid,uuid,text,text,boolean,jsonb,integer,text,boolean,numeric,boolean,integer)',
      'function public.search_files(uuid,text,integer,integer,text)',
      'function public.seo_rank_target_list_scoped(text,uuid,text,text,text,jsonb,integer,integer)',
      'function public.shape_doctor_gather(text)',
      'function public.shx_list_facets(text,uuid,text,boolean)',
      'function public.shx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.store_door_lane(text,uuid)',
      'function public.tool_register_mcp_discovered(uuid,jsonb)',
      'function public.trx_list_facets(text,uuid,text,boolean)',
      'function public.trx_list_scoped(text,uuid,text,boolean,text,text,jsonb,integer,integer)',
      'function public.udt_list_example_tables()',
      'function public.update_all_trending_scores()',
      'function public.update_user_list(uuid,character varying,text,boolean,boolean,boolean,jsonb)',
      'function public.wfx_list_facets(text,uuid,text,boolean,text)',
      'function public.wfx_list_scoped(text,uuid,text,boolean,text,text,boolean,text,jsonb,integer,integer)',
      'function rag._recall_predicate_sql(jsonb)',
      'function scraper._scrape_parsed_page_owner_is_the_personal_creator()',
      'function scraper.scrape_parsed_page_{V}_stated()',
      'function seo._ensure_site_dimension(uuid,text,text,text,text)',
      'function seo._ensure_value(uuid,text,text,jsonb)',
      'function seo._tm_is_a_place(uuid,text,text)',
      'function seo.facet_dimension_seed_abstain(uuid,uuid,boolean,uuid)',
      'function seo.facet_dimension_upsert(text,text,text,uuid,text,text)',
      'function seo.facet_value_upsert(text,text,text,text,uuid,integer)',
      'function seo.fn_evaluate_condition_matchers(uuid,uuid[],uuid,date,date)',
      'function seo.fn_evaluate_matchers_internal(uuid,uuid[],text)',
      'function seo.gsc_quick_add_value(uuid,text,uuid,text,text,text)',
      'function seo.gsc_set_keyword_class(uuid,uuid[],text,text,text,uuid,boolean)',
      'function seo.gsc_set_keyword_stamps(uuid,uuid[],uuid,text,boolean)',
      'function seo.gsc_topic_delete(uuid,uuid,uuid)',
      'function seo.keyword_facet_set(uuid[],text,text,text,uuid,smallint,text,boolean)',
      'function seo.stamp_keyword_places(uuid[],text)',
      'function seo.starter_pack_from_proposal(jsonb,uuid,jsonb,uuid[])',
      'function seo.starter_pack_item_save(jsonb)',
      'function seo.starter_pack_new_version(uuid,text)',
      'function seo.starter_pack_save(jsonb)',
      'function web.assert_crawl_artifact_file(uuid,uuid,uuid,uuid,text)',
      'function web.assert_crawl_artifact_file_reused(uuid,uuid,uuid,text)',
      'function web.create_site(uuid,text,text,text,jsonb,jsonb,platform.{V},uuid)',
      'function workbench._bridge_legacy_owner()',
      'function workbench.dataset_readable_by(uuid,uuid)',
      'function workbench.udt_dataset_access(uuid,public.permission_level)',
      'function workflow.public_card_rows()',
      'policy transcripts.studio_cleaned_segments / studio_cleaned_segments_public_read',
      'policy transcripts.studio_concept_items / studio_concept_items_public_read',
      'policy transcripts.studio_module_segments / studio_module_segments_public_read',
      'policy transcripts.studio_raw_segments / studio_raw_segments_public_read',
      'policy transcripts.studio_session_settings / studio_session_settings_public_read',
      'view agent.card',
      'view agent.context_menu_view',
      'view agent.mandate_exemplar',
      'view agent.menu_surface',
      'view campaign_watch.dual_engine_exit',
      'view chat.admin_conversation_summary',
      'view chat.conversation_summary',
      'view custom."table"',
      'view custom.doc_template',
      'view custom.external_record',
      'view custom.field',
      'view custom.merge_field',
      'view custom.rule',
      'view hr.v_access_audit',
      'view hr.v_compensation_current',
      'view iam.definer_class_census',
      'view mandate.context_menu_view',
      'view mandate.reference_latest_deployed',
      'view mandate.vw_shortcut',
      'view platform.v_lifecycle_registry_drift',
      'view workflow.card',
      'view workflow.v_definition_catalog'
    ]::text[]
    -- Counted and expiring: the campaign's phase-3 machinery that must read the column. Added only
    -- by access_ladder_t13_* migrations, named platform._t13_transitional_*; empty after contract.
    when 'transitional' then array[]::text[]
    -- The last day a transitional reader is admitted (PLAN.md §2.5). Only ever moves earlier.
    when 'transitional_expires' then array['2026-12-15']::text[]
  end
$function$;

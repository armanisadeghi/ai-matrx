-- migrate: skip: ROLLBACK SCRIPT for T-13 phase 3 (expand + 3.2b) — never swept, run by hand only, with psql in autocommit on a SESSION connection (port 5432, never the 6543 transaction pooler — it drops the mode setting and the script then refuses): psql "$DSN" -v ON_ERROR_STOP=1 -c "set t13.rollback_mode = 'apply'" -f migrations/access_ladder_t13_3_rollback.sql
-- Generated 2026-09-28 from platform._t13_transitional_targets() (334 tables); rewritten 2026-09-28 (3.2b) to retry per table.
-- common-docs/projects/access-ladder/t13/PLAN.md §3 rollback column.
--
-- Per table, in order, each unit its own transaction (2 s lock timeout):
--   (1) drop the dual-write and counter triggers so nothing derives any more, and put back the column defaults the
--       3.2b marker defaults replaced (verbatim from ops.t13_default_ledger);
--   (2) put shown_to back to null on the rows the backfill set, from ops.t13_backfill_ledger, 5,000 rows per
--       transaction, row triggers skipped for that transaction (session_replication_role = replica — the backfill
--       skipped them too);
--   (3) drop the two T-13 checks and the three columns (published_to_web is derived — the ledger's published_to_web
--       ids need no revert once the column is gone).
-- A lock timeout or a deadlock rolls back only that unit and retries it, backing off 0.5 s, 1 s, 2 s … 30 s (+ jitter),
-- 10 tries; then it STOPS by name. SAFE TO RE-RUN: every unit is idempotent (IF EXISTS, ledger-driven, only rows still
-- at 'only_me'), so a stopped or interrupted run is finished by running the file again.
-- The machinery functions and ops tables of access_ladder_t13_3a/3b stay (inert without triggers); drop them in the
-- same change that retires the campaign.
--
-- MODE — ONE setting, read by the DO block; without it the script refuses and changes nothing:
--   set t13.rollback_mode = 'apply';                                   every table, for real
--   set t13.rollback_mode = 'dry_run:seo.keyword,files.files';          every unit executed, then rolled back
--   set t13.rollback_mode = 'apply:seo.keyword';                        only the listed tables, for real
-- One setting, not two, so a mode can never arrive without its table list (2026-09-28: a dry run whose two settings
-- were sent through the transaction pooler lost both and ran step 1 for real on one table; restored the same minute).
set lock_timeout = '2s';

do $rollback$
declare
  v_tables text[] := array[
    'admin.admin_markdown_samples',
    'admin.feature_docs',
    'agent.cmp_comparison_sets',
    'agent.cmp_response_feedback',
    'agent.definition',
    'agent.exemplar',
    'agent.mandate_note',
    'agent.message_template',
    'agent.prompt_remediation',
    'agent.shortcut',
    'agent.template',
    'agent.term_list',
    'ai.api',
    'ai.endpoint',
    'ai.model_alias',
    'ai.model_definition',
    'ai.offering',
    'ai.provider',
    'ai.setting',
    'ai.voices',
    'app_config',
    'app.definition',
    'billing.capability',
    'billing.capability_limit',
    'billing.plan',
    'billing.plan_limit',
    'billing.price',
    'billing.product',
    'billing.spend_approval',
    'billing.spend_guardrail',
    'browser.login_recipe',
    'browser.site_policy',
    'canvas.canvas_items',
    'canvas.shared_canvas_items',
    'catalog_entries',
    'chat.agent_run',
    'code.code_file_folders',
    'code.code_files',
    'code.code_repositories',
    'commerce.certified_printer',
    'commerce.cloud_sync_connection',
    'commerce.ebay_category',
    'commerce.ebay_category_aspect',
    'commerce.ebay_category_tree',
    'commerce.ebay_marketplace_policy',
    'commerce.ebay_notification_destination',
    'commerce.ebay_notification_topic',
    'commerce.intake_batch',
    'commerce.label_batch',
    'commerce.marketplace_account',
    'commerce.marketplace_rate_budget',
    'commerce.print_order',
    'commerce.product',
    'communication.meet_call_invites',
    'communication.meet_meetings',
    'communication.notification_channel_preference',
    'communication.notification_event_override',
    'communication.notification_event_type',
    'communication.notification_preference',
    'communication.sms_consent',
    'communication.sms_notification_preferences',
    'communication.sms_notifications',
    'communication.sms_phone_numbers',
    'content_ir.kind_definition',
    'content_ir.kind_instance',
    'content.document',
    'context.scopes',
    'context.system_context_item',
    'crm.blocklist_entry',
    'crm.contact_medium',
    'crm.deal',
    'crm.enrichment_call',
    'crm.jurisdiction_policy',
    'crm.outreach_list',
    'crm.party',
    'crm.registry_ingest_run',
    'crm.registry_source',
    'crm.sending_identity',
    'crm.sending_policy',
    'custom.anon_form',
    'custom.anon_hit',
    'custom.anon_inbound',
    'custom.anon_replay',
    'custom.anon_submission',
    'custom.anon_token',
    'custom.doc_render',
    'custom.doc_signature',
    'custom.external_link',
    'custom.external_source',
    'custom.io_comment',
    'custom.io_import',
    'custom.io_outbox',
    'custom.merge_field_provenance',
    'docproc.derive_runs',
    'docproc.page_extraction_jobs',
    'docproc.page_extraction_page_runs',
    'docproc.processed_documents',
    'education.assessment',
    'education.content_certification',
    'education.fc_card',
    'education.fc_set',
    'education.game_badge',
    'education.game_result',
    'education.game_room',
    'education.league_membership',
    'education.learn_doc',
    'education.math_problems',
    'education.quiz_sessions',
    'education.study_goal',
    'education.study_media',
    'education.study_plan',
    'education.study_reminder_context',
    'education.study_reminder_delivery',
    'esign.campaign',
    'esign.consent_disclosure',
    'esign.envelope',
    'esign.provider_binding',
    'extend.wbx_demo',
    'extend.wbx_guidance',
    'extend.wbx_highlight',
    'extend.wbx_pattern',
    'extend.wbx_recipe',
    'extend.wbx_screenshot',
    'extend.wbx_seo_audit',
    'files.account_tiers',
    'files.files',
    'files.folders',
    'files.machine_written_prefixes',
    'files.sync_mappings',
    'growth.loop_run',
    'growth.stage_ref_kind',
    'hindsight.enrollment',
    'hindsight.regression_case',
    'hindsight.replay_step',
    'hr.access_role',
    'hr.alert_routing_rule',
    'hr.asset',
    'hr.auto_close_rule',
    'hr.careers_portal',
    'hr.checklist_template',
    'hr.course',
    'hr.crew',
    'hr.deduction_code',
    'hr.department',
    'hr.earning_code',
    'hr.employee',
    'hr.employer_profile',
    'hr.field_policy',
    'hr.holiday_calendar',
    'hr.interview_kit',
    'hr.job_title',
    'hr.jurisdiction',
    'hr.jurisdiction_rule',
    'hr.jurisdiction_rule_class',
    'hr.jurisdiction_rule_org_decision',
    'hr.kiosk_device',
    'hr.leave_policy',
    'hr.location',
    'hr.overtime_alert_rule',
    'hr.pay_group',
    'hr.posting',
    'hr.provider_binding',
    'hr.record_class',
    'hr.requisition',
    'hr.retention_rule',
    'hr.schedule',
    'hr.schedule_guidance',
    'hr.schedule_template',
    'hr.survey',
    'hr.workflow_definition',
    'hr.workflow_flow_type',
    'iam.access_requests',
    'iam.api_keys',
    'iam.emergency_door_request',
    'iam.industries',
    'iam.team',
    'interview.decision_interview',
    'interview.session',
    'legal.wc_impairment_definition',
    'mandate.binding',
    'mandate.definition',
    'mandate.provision',
    'mandate.reference',
    'mandate.scan',
    'mandate.treatment',
    'marketing.initiative',
    'media.capture_handoff',
    'media.catalog_setting',
    'media.source_library',
    'meta.audit_exemption',
    'ops.app_log_muted_pattern',
    'ops.app_log_norm_exception',
    'ops.check_item',
    'ops.check_run',
    'ops.proof_check',
    'ops.proof_scenario',
    'pdf.pdf_redaction_audits',
    'plan.entity',
    'plan.node',
    'plan.profile',
    'platform.action_request',
    'platform.approach',
    'platform.assist_producer_policy',
    'platform.assists',
    'platform.assurance_level',
    'platform.categories',
    'platform.change_type_default',
    'platform.continued_access',
    'platform.custom_entity_definition',
    'platform.custom_field_definition',
    'platform.custom_field_target',
    'platform.dated_change',
    'platform.domain_classification',
    'platform.egress_device',
    'platform.flexible_data',
    'platform.guided_checklist_run',
    'platform.knob_scope_kind',
    'platform.knob_write_door',
    'platform.outcome_event',
    'platform.output_feedback',
    'platform.outsider_consumer',
    'platform.purpose',
    'platform.retention_policy',
    'platform.route_manifest',
    'platform.rulebook',
    'platform.saved_view',
    'platform.secure_delivery',
    'platform.shareable_resource_registry',
    'platform.source_authority',
    'platform.taxonomy_node',
    'podcast.pc_articles',
    'podcast.pc_episodes',
    'podcast.pc_race',
    'podcast.pc_shows',
    'podcast.pc_studio_runs',
    'rag.context_item_suggestions',
    'rag.data_stores',
    'rag.kg_alerts',
    'rag.kg_suggestion_ack',
    'rag.kg_sweep_queue',
    'rag.kg_sweep_run',
    'rag.kg_value_matches',
    'rag.library_docs',
    'rag.ner_canonicalizer_shadow',
    'rag.scope_association_suggestions',
    'rag.scope_item_value_suggestions',
    'rag.scope_suggestions',
    'research.rs_context_bundle',
    'research.rs_template',
    'research.rs_topic',
    'research.youtube_search',
    'research.youtube_video',
    'runtime.global_origin',
    'runtime.global_request',
    'runtime.operation_stream',
    'runtime.operation_stream_batch',
    'scheduler.sch_task',
    'scraper.scrape_parsed_page',
    'seo.ai_capability',
    'seo.collection_run',
    'seo.engine_schedule',
    'seo.geo_place',
    'seo.keyword',
    'seo.keyword_class_rule',
    'seo.keyword_edge',
    'seo.keyword_facet',
    'seo.keyword_market',
    'seo.keyword_place',
    'seo.keyword_topic',
    'seo.map_facet',
    'seo.map_facet_value',
    'seo.rank_target',
    'seo.source_request',
    'seo.starter_pack',
    'seo.story_angle',
    'seo.topic',
    'seo.topical_map',
    'skill.definition',
    'skill.render_definition',
    'tool.bundle',
    'tool.definition',
    'tool.executor',
    'tool.mcp_config',
    'tool.mcp_server',
    'tool.surface_defaults',
    'transcripts.transcripts',
    'ui.ui_client',
    'ui.ui_surface_agent_pref',
    'ui.ui_surface_agent_role',
    'ui.ui_surface_client_tool',
    'ui.ui_surface_config',
    'ui.ui_surface_item_type',
    'ui.ui_surface_value',
    'ui.ui_surface_write_target',
    'users.invitation_codes',
    'users.invitation_requests',
    'users.profiles',
    'users.system_announcements',
    'users.user_achievements',
    'users.user_analysis_preferences',
    'users.user_markdown_samples',
    'web.analysis_item',
    'web.brand',
    'web.listing_publisher',
    'web.news_item',
    'web.offering_template',
    'web.provider',
    'web.site',
    'web.voice_fingerprint',
    'web.youtube_video',
    'workbench.google_document',
    'workbench.heatmap_saves',
    'workbench.note_folders',
    'workbench.notes',
    'workbench.pb_claim_appeals_fd31de',
    'workbench.pb_insurance_claims_fd31de',
    'workbench.product_capture_item',
    'workbench.provlock_recall_visits_all8u5',
    'workbench.udt_datasets',
    'workbench.udt_documents',
    'workbench.udt_structured_lists',
    'workbench.udt_workbooks',
    'workbench.working_documents',
    'workflow.comparison',
    'workflow.definition',
    'workflow.run',
    'workflow.runtime_surface',
    'workflow.template',
    'workflow.trigger',
    'workspace.projects',
    'workspace.spatial_boards',
    'workspace.tasks',
    'workspace.threads',
    'workspace.war_rooms'
  ];
  v_mode   text    := coalesce(current_setting('t13.rollback_mode', true), '');
  v_only   text[]  := case when position(':' in v_mode) > 0
                           then string_to_array(regexp_replace(split_part(v_mode, ':', 2), '\s', '', 'g'), ',') end;
  v_dry    boolean := v_mode like 'dry\_run%';
  t        text;
  rel      regclass;
  step     int;
  tries    int;
  ok       boolean;
  more     boolean;
  n        bigint;
  msg      text;
  l        record;
  v_shown  boolean;
begin
  if v_mode !~ '^(apply|dry_run)(:.+)?$' then
    raise exception 'T-13 rollback refuses to start: t13.rollback_mode is %', coalesce(nullif(v_mode, ''), 'not set')
      using hint = 'In this same session first: set t13.rollback_mode = ''apply'' (or ''dry_run'' / ''apply:schema.table,schema.table''). Use a session connection (port 5432); the transaction pooler drops the setting.';
  end if;
  raise notice 'T-13 rollback: % on %', case when v_dry then 'DRY RUN (every unit rolled back)' else 'APPLY' end,
    coalesce(array_to_string(v_only, ', '), 'all ' || cardinality(v_tables) || ' tables');
  foreach t in array v_tables loop
    continue when v_only is not null and not (t = any (v_only));
    rel := to_regclass(t);
    if rel is null then
      raise notice '% : table gone, skipped', t;
      continue;
    end if;
    for step in 1..3 loop
      more := true;
      while more loop
        tries := 0;
        loop
          n := 0;
          begin
            perform set_config('lock_timeout', '2s', true);
            if step = 1 then
              execute format('drop trigger if exists _a0_t13_dual_write on %s', rel);
              execute format('drop trigger if exists _t13_count_row_column_writes on %s', rel);
              for l in select d.column_name, d.old_default from ops.t13_default_ledger d where d.table_ref = rel loop
                if exists (select 1 from pg_attribute where attrelid = rel and attname = l.column_name and not attisdropped) then
                  execute format('alter table %s alter column %I set default %s', rel, l.column_name, l.old_default);
                end if;
              end loop;
              msg := 'triggers dropped, defaults restored';
            elsif step = 2 then
              v_shown := exists (select 1 from pg_attribute where attrelid = rel and attname = 'shown_to' and not attisdropped);
              if v_shown then
                set local session_replication_role = replica;  -- a SET statement: supautils admits it, set_config() is refused
                execute format($q$
                  with pick as (
                    select x.id from %1$s x
                      join ops.t13_backfill_ledger b on b.table_ref = %2$L and b.column_name = 'shown_to' and b.id = x.id
                     where x.shown_to = 'only_me'
                     limit 5000
                       for update of x skip locked)
                  update %1$s x set shown_to = null from pick where x.id = pick.id$q$, rel, rel::text);
                get diagnostics n = row_count;
                set local session_replication_role = origin;
              end if;
              msg := format('shown_to reset on %s rows', n);
            else
              execute format('alter table %s drop constraint if exists t13_indexed_only_when_published, drop constraint if exists t13_everyone_on_ai_matrx_only_when_published, drop column if exists published_to_web, drop column if exists published_to_web_at, drop column if exists published_to_web_by', rel);
              msg := 'checks and columns dropped';
            end if;
            if v_dry then
              raise exception 't13 rollback dry run' using errcode = 'T13DR';
            end if;
            ok := true;
          exception
            when sqlstate 'T13DR' then ok := true; msg := msg || ' (dry run, rolled back)';
            when lock_not_available or deadlock_detected then ok := false; msg := sqlerrm;
          end;
          commit;
          exit when ok;
          tries := tries + 1;
          raise notice '% step % : % — retry % after backoff', t, step, msg, tries;
          if tries >= 10 then
            raise exception 'T-13 rollback STOPPED at % step %: still locked after 10 tries (%). Everything before it is committed; re-run this file (safe).', t, step, msg;
          end if;
          perform pg_sleep(least(30, 0.5 * 2 ^ (tries - 1)) + random() * 0.5);
        end loop;
        raise notice '% step % : %', t, step, msg || case when tries > 0 then format(' (after %s retries)', tries) else '' end;
        more := step = 2 and n > 0 and not v_dry;
      end loop;
    end loop;
  end loop;
end
$rollback$;

# W1-CLASS — the classification census, by type

**Production, SELECT-only, 2026-09-17 09:17:42 UTC** (Supabase project `brsgrqvjdzwihsvnfqkf`, PostgreSQL 17.6),
every statement inside `begin transaction read only; … commit;`. No DDL and no write on either database.
Machine-readable half, which `W1-REG` applies: `matrx-frontend/migrations/campaign/W1-CLASS-classification.json`.

## The four numbers

| | |
|---|---|
| universe (base tables, exclusion list applied, partitions excluded) | **956** |
| unclassified (no registry row) | **140** |
| registered (rows in `platform.entity_types`) | **840** |
| registry rows backed by nothing in the universe | **24** |

956 − 140 = **816** backed registrations. 840 − 816 = **24**. The census adds up.

**The query is in the artefact** (`universe_query`), and so is this: CUT-14 states the exclusion list with
`deprecated` in it. **That schema does not exist on production** — REC-55's rename has not landed and the live
schema is `graveyard`, which holds 6 base tables. Run CUT-14 verbatim and the universe is **962**, not 956.
Both numbers were taken by this lane in the same transaction. `W1-REG` must amend CUT-14's cell.

## The campaign-scoped gate

C-40 gates on objects **this campaign** created or modified since the go-signal capture. The campaign owns exactly
one base table on production — `campaign_watch.build_lock`, landed 2026-09-16 — and it carries **no registry row**,
so the campaign-scoped unclassified count is **1, not 0**. This artefact classifies it (System). Applying the file
takes that count to zero. The other 139 are older than the capture and belong to other teams: a report, gated on by nothing.

## Count per type

| Type | Total | From the registry (816) | Unregistered (140) |
|---|---:|---:|---:|
| **Entity** | 292 | 272 | 20 |
| **Detail** | 345 | 312 | 33 |
| **Reference** | 120 | 97 | 23 |
| **Ledger** | 43 | 42 | 1 |
| **Restricted** | 44 | 44 | 0 |
| **System** | 105 | 49 | 56 |
| **Deprecated** | 7 | 0 | 7 |
| | **956** | **816** | **140** |

**Ambiguous: 14** — listed in full below and in the artefact's `ambiguous_tables`, each with two candidate types
and the query that decides it. Each is also carried in `tables` under the candidate the present evidence favours,
so the 956 still adds up.

## How each half was decided

**The 816 with a registry row** — DD-062 §1.2's precedence, first match wins: `is_active=false` → Deprecated ·
`audit_class='machinery'` → System · `rls_variant in ('component','detail')` → Detail · `'system'` → Reference ·
`'restricted'` → Restricted · `'ledger'` → Ledger · `'personal','entity'` → Entity. Zero rows landed outside the
seven, and `origin` is `standard` on all 816 — production carries no `custom` token, as REC-32/REC-33 require.

**Component is Detail unless the enforcement says otherwise.** 317 rows derive Detail from `component`. Five are
overridden to **Ledger** because a trigger raises unconditionally on UPDATE and/or DELETE — `browser.action_event`,
`esign.envelope_certificate`, `hr.leave_ledger`, `hr.payroll_export_line`, `workflow.plan_event`. Component rows
that are System or Deprecated never reach rule 3: the four `component`+`machinery` rows are System and the three
inactive ones are Deprecated, by rules 2 and 1 above them. Nine further `component` tables carry an immutability
trigger that is **partial** (identity columns, a state machine, a soft-delete arm) — partial immutability is not
append-only, so they stay Detail; five of them are on the ambiguous list.

**The 140 with no registry row** — read off what is enforced: grants, policy quals, triggers, primary keys,
foreign keys. Never by name, with the one exception CUT-14 itself states as a name rule (`_bak_*`, `_backup*`,
`_stage_*`, dated repair artefacts → Deprecated). The rule list and its order are in the artefact
(`unregistered_derivation`); every row names the rule that decided it and quotes its evidence.

## The 24 registry rows backed by nothing

**17 point into `graveyard`** (REC-55's `deprecated`), all `is_active=false`: `component_group`,
`cx_conversation_documents`, `dashboard_saved_view`, `flashcard_data`, `flashcard_history`, `flashcard_sets`,
`field_component`, `share_link`, `mandate_legacy`, `mandate_binding_legacy`, `microservice_project`, `prompt`,
`agent_provision_legacy`, `shortcut_category`, `skill_category`, `flashcard_review`, `flashcard_set`. Six of the
seventeen still exist as real tables in `graveyard`; eleven are already dropped. **Deliberately unbacked.**

**3 point at VIEWS** — `agent_card` (`agent.card`), `content_ir_kind_conformance`, `workflow_card`
(`workflow.card`) — `relkind = 'v'`, all three `component`+`machinery`. Doctrine §1.1: views take no type.
**Deliberately unbacked.**

**4 investigated, as the BUILD-BOOK asked** — and none can be re-pointed. `platform_org_knob_override`,
`platform_user_knob_override`, `agent_user_kv` and `profile` all read `is_active=false` with `to_regclass` NULL,
and none is in `graveyard`: the table was dropped and the registry row was left behind outside the retirement
schema. `platform.user_knob_override` was superseded by `platform.knob_override`, which is itself one of the 140
unregistered tables in this census. `W1-REG` either deletes these four rows or moves them under REC-55.

## The 14 ambiguous tables

| Table | Candidates | Why it is genuinely two |
|---|---|---|
| `hr.punch` | Detail \| Ledger | trigger _zz_punch_immutable refuses every column change EXCEPT voided_at, voided_reason, voided_by_punch_id, updated_at, updated_by, version - a correct-by-void pattern, which is a Ledger's discipline expressed as a partial UPDATE |
| `hr.schedule_change` | Detail \| Ledger | trigger _zz_schedule_change_immutable permits only delivered_at and read_at to change - fair-workweek evidence that is append-only in substance |
| `web.analysis_result` | Detail \| Ledger | trigger _reject_immutable_fact_mutation permits a soft-delete-only UPDATE and refuses everything else, so the row is an immutable fact with a tombstone |
| `web.link_edge` | Detail \| Ledger | same _reject_immutable_fact_mutation trigger, but its link_edge arm names a further set of columns it will accept |
| `web.snapshot` | Detail \| Ledger | same _reject_immutable_fact_mutation trigger; a snapshot is by nature an immutable fact, and CUT-14 says snapshot stores are Details of what they snapshot |
| `context.context_item_values` | Detail \| Deprecated | registry rls_variant=component derives Detail, and authenticated holds SELECT and nothing else so there is no client write path at all; CUT-18 names the table for deprecation |
| `users.user_secrets` | Entity \| Restricted | the registry derives Entity from rls_variant=entity, but the table holds secrets, which Doctrine §1.1 puts under Restricted (service-role only, no user access under any policy) |
| `esign.consent_disclosure` | Reference \| Detail | the registry derives Reference from rls_variant=system, but its rows are cited by esign.envelope_signer and guarded immutable while cited, which reads as composition |
| `files.idempotency` | System \| Entity | primary key is (owner_id, idempotency_key) with an owner_id = auth.uid() read arm, which reads as Entity, but 26,775 rows of request-dedupe keys are machinery no user surface names |
| `pdf.pdf_redaction_key_escrow` | Entity \| Restricted | Doctrine §1.1 names escrow explicitly under Restricted, but the live policy gives owner_id = auth.uid() a read arm, which is not 'service-role only' |
| `iam.dd171_containment_baseline` | System \| Deprecated | a DD-171 audit baseline with no grants and no RLS; System while the audit it backs is open, Deprecated once it is closed |
| `iam.dd175_cast` | System \| Deprecated | a DD-175 audit artefact with no grants and no RLS; same test as dd171_containment_baseline |
| `iam.dd175_component_lane_baseline` | System \| Deprecated | a DD-175 audit artefact with no grants and no RLS; same test as dd171_containment_baseline |
| `platform._policy_overlap_probe` | System \| Deprecated | a probe artefact sitting beside platform._policy_overlap_backup, which CUT-14's own name rule makes Deprecated; if the probe is no longer written it is Deprecated too |

The deciding query for each is in the artefact's `ambiguous_tables`.

## What this census found, for `W1-REG`

- CUT-14's exclusion list names a schema that does not exist (`deprecated`) and omits the one that does (`graveyard`). Verbatim the universe is 962, not 956.
- All 21 is_active=false registry rows are among the 24 that point at nothing, which is why the registered-and-backed half contains zero Deprecated rows. Deprecated in this census comes entirely from the 7 unregistered backup/stage/dated-repair tables.
- Four registry rows point at a relation that no longer exists anywhere and are NOT in the graveyard schema: platform.org_knob_override, platform.user_knob_override, public.agent_user_kv, user.profiles. These are the four the BUILD-BOOK told this lane to investigate; none can be re-pointed.
- Three registry rows point at VIEWS (agent.card, content_ir.kind_conformance, workflow.card) and all three carry audit_class='machinery'. Doctrine §1.1: views take no type.
- Eight tables are enforced as world-readable platform data (a SELECT policy with qual `true` for authenticated) that are not catalogs: platform.mtx_media_heal_queue, scraper.scrape_failure_log, scraper.scrape_retry_queue, scraper.scrape_path_override, scraper.scrape_domain_settings, scraper.scrape_domain, scraper.scrape_path_pattern, ops.ops_issue_class. They are typed Reference because that is what is enforced; if that is wrong the fix is a policy, not a type.
- research.research_intent has RLS DISABLED while `authenticated` holds SELECT, INSERT, UPDATE and DELETE - every signed-in principal can read and rewrite every row.
- About forty unregistered tables carry full table grants to `authenticated` while their only policy arm is is_platform_admin(). They are not broken, they are ungenerated: they never passed through iam.apply_rls. Registering them is what turns the admin-only arm into the type's own policy.
- campaign_watch.build_lock is the campaign's own object and is unclassified on production today; registering it as System takes the campaign-scoped unclassified count to zero.

## Every table, by type

### Entity — 292

*From the registry (272):* `admin.feature_docs`, `agent.cmp_comparison_sets`, `agent.cmp_response_feedback`, `agent.definition`, `agent.mandate_note`, `agent.message_template`, `agent.prompt_remediation`, `agent.shortcut`, `agent.template`, `api.html_extractions`, `app.definition`, `assignment.session`, `billing.connect_account`, `billing.customer`, `billing.spend_guardrail`, `billing.subscription`, `billing.usage_ledger`, `billing.user_plan`, `browser.profile`, `canvas.canvas_comment_likes`, `canvas.canvas_comments`, `canvas.canvas_items`, `canvas.canvas_likes`, `canvas.canvas_scores`, `canvas.canvas_views`, `canvas.shared_canvas_items`, `chat.agent_memory`, `chat.agent_run`, `chat.conversation`, `chat.user_request`, `chat.user_usage_summary`, `code.code_file_folders`, `code.code_files`, `code.code_repositories`, `commerce.certified_printer`, `commerce.cloud_sync_connection`, `commerce.intake_batch`, `commerce.label_batch`, `commerce.marketplace_account`, `commerce.print_order`, `commerce.product`, `communication.calendar_event`, `communication.contact_submissions`, `communication.dm_conversations`, `communication.meet_call_invites`, `communication.meet_meetings`, `communication.notification`, `communication.notification_channel_preference`, `communication.notification_event_override`, `communication.notification_event_type`, `communication.notification_preference`, `communication.sms_consent`, `communication.sms_conversations`, `communication.sms_notification_preferences`, `communication.sms_notifications`, `communication.sms_phone_numbers`, `content_ir.kind_instance`, `context.context_items`, `context.scope_types`, `context.scopes`, `context.user_active_context`, `crm.blocklist_entry`, `crm.contact_medium`, `crm.deal`, `crm.enrichment_call`, `crm.outreach_list`, `crm.party`, `crm.registry_ingest_run`, `crm.saved_view`, `crm.sending_identity`, `crm.sending_policy`, `dictionary.dict_entries`, `dictionary.dict_settings`, `docproc.derive_runs`, `docproc.page_extraction_jobs`, `docproc.page_extraction_page_runs`, `docproc.processed_documents`, `education.assessment`, `education.assessment_result`, `education.fc_card`, `education.fc_set`, `education.game_badge`, `education.game_result`, `education.game_room`, `education.item_mastery`, `education.league_membership`, `education.learn_doc`, `education.quiz_sessions`, `education.study_attempt`, `education.study_goal`, `education.study_media`, `education.study_plan`, `education.study_plan_block`, `education.study_plan_day`, `education.study_reminder_context`, `education.study_reminder_delivery`, `education.study_session`, `education.study_streak`, `esign.campaign`, `esign.envelope`, `esign.provider_binding`, `extend.extension_auth_codes`, `extend.wbx_capture`, `extend.wbx_demo`, `extend.wbx_guidance`, `extend.wbx_highlight`, `extend.wbx_pattern`, `extend.wbx_screenshot`, `extend.wbx_seo_audit`, `files.files`, `files.folders`, `files.sync_mappings`, `files.user_account`, `files.user_storage_usage`, `growth.loop_run`, `hindsight.enrollment`, `hindsight.regression_case`, `hindsight.replay_step`, `hr.alert_routing_rule`, `hr.asset`, `hr.auto_close_rule`, `hr.candidate`, `hr.careers_portal`, `hr.checklist_template`, `hr.course`, `hr.crew`, `hr.deduction_code`, `hr.department`, `hr.earning_code`, `hr.employee`, `hr.employment`, `hr.holiday_calendar`, `hr.interview_kit`, `hr.job_title`, `hr.jurisdiction_rule_org_decision`, `hr.leave_policy`, `hr.location`, `hr.overtime_alert_rule`, `hr.pay_group`, `hr.posting`, `hr.provider_binding`, `hr.recalculation_batch`, `hr.requisition`, `hr.schedule`, `hr.schedule_guidance`, `hr.schedule_template`, `hr.survey`, `hr.workflow_definition`, `hr.workflow_instance`, `iam.api_keys`, `iam.org_member_controls`, `interview.decision_interview`, `interview.session`, `legal.wc_claim`, `mandate.binding`, `mandate.treatment`, `marketing.initiative`, `ops.app_log`, `ops.ops_issue_event`, `ops.proof_check`, `ops.proof_scenario`, `ops.system_error`, `ops.system_write_failure`, `pdf.pdf_redaction_audits`, `plan.entity`, `plan.node`, `plan.profile`, `platform.assists`, `platform.categories`, `platform.comments`, `platform.custom_entity_definition`, `platform.custom_field_definition`, `platform.flexible_data`, `platform.guided_checklist_run`, `platform.org_module_config`, `platform.outcome_event`, `platform.output_feedback`, `platform.purpose`, `platform.rulebook`, `platform.saved_view`, `platform.share_links`, `platform.user_entity_state`, `podcast.pc_articles`, `podcast.pc_episodes`, `podcast.pc_race`, `podcast.pc_shows`, `podcast.pc_studio_runs`, `public.app_instances`, `public.app_settings`, `public.app_sync_status`, `public.sandbox_instances`, `rag.context_item_suggestions`, `rag.data_stores`, `rag.kg_alerts`, `rag.kg_suggestion_ack`, `rag.kg_sweep_queue`, `rag.kg_sweep_run`, `rag.kg_sweep_state`, `rag.kg_value_matches`, `rag.library_docs`, `rag.ner_canonicalizer_shadow`, `rag.retrieval_audit`, `rag.scope_association_suggestions`, `rag.scope_item_value_suggestions`, `rag.scope_suggestions`, `research.rs_context_bundle`, `research.rs_template`, `research.rs_topic`, `research.youtube_search`, `runtime.global_request`, `scheduler.sch_task`, `seo.collection_run`, `seo.engine_schedule`, `seo.gsc_dig_rule`, `seo.keyword_class_rule`, `seo.rank_target`, `seo.source_request`, `seo.story_angle`, `seo.topical_map`, `skill.definition`, `skill.render_definition`, `tool.mcp_user_conn`, `transcripts.studio_recording_chunks`, `transcripts.studio_runs`, `transcripts.studio_sessions`, `transcripts.transcripts`, `ui.ui_surface`, `ui.ui_surface_agent_pref`, `ui.ui_surface_config`, `users.credential_items`, `users.integration_connections`, `users.invitation_codes`, `users.invitation_requests`, `users.profiles`, `users.user_achievements`, `users.user_analysis_preferences`, `users.user_bookmarks`, `users.user_email_preferences`, `users.user_feedback`, `users.user_form_profile`, `users.user_markdown_samples`, `users.user_memory`, `users.user_preferences`, `users.user_secrets`, `users.user_stats`, `users.user_surface_state`, `web.brand`, `web.site`, `web.youtube_video`, `workbench.google_document`, `workbench.heatmap_saves`, `workbench.note_folders`, `workbench.notes`, `workbench.product_capture_item`, `workbench.udt_dataset_templates`, `workbench.udt_datasets`, `workbench.udt_documents`, `workbench.udt_structured_lists`, `workbench.udt_workbooks`, `workbench.working_documents`, `workflow.comparison`, `workflow.definition`, `workflow.extract_sweep_state`, `workflow.run`, `workflow.runtime_surface`, `workflow.template`, `workflow.trigger`, `workspace.projects`, `workspace.task_user_state`, `workspace.tasks`, `workspace.threads`, `workspace.war_rooms`

*Unregistered (20), each with the rule that decided it:*

- `billing.account_addon` — **R7a** — own organization_id stamped by _stamp_org_default; admin-only policy today because the table never passed through the generator
- `billing.class_purchase` — **R7a** — own organization_id; admin-only policy today because the table never passed through the generator
- `billing.org_plan` — **R7** — read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id
- `content_ir.io_contract` — **R7a** — own organization_id FK to iam.organizations, stamped by _stamp_org_default, versioned by _touch_row
- `crm.outreach_acceptance` — **R7** — read arm is is_org_member(organization_id) on its own organization_id
- `crm.unsubscribe_token` — **R7** — read arm is is_org_member(organization_id) on its own organization_id; org-stamped by _inherit_org
- `dictionary.dict_provider_publication` — **R7** — read arm is owner_id = auth.uid() on its own owner column
- `education.deck_suggestion` — **R7** — read arm is suggested_by = auth.uid() OR owner_id = auth.uid() on its own owner columns
- `education.study_source_chunk` — **R7** — read arm is owner_id = auth.uid(); its structured_section FK is ON DELETE SET NULL, so it is not composition
- `education.study_structured_section` — **R7** — read arm is owner_id = auth.uid() OR organization_id IN (SELECT iam.my_orgs()) on its own columns
- `files.uploads_inflight` — **R7** — read arm is owner_id = auth.uid() and the table carries its own visibility column
- `files.webhooks` — **R7** — read arm is owner_id = auth.uid() on its own owner column, plus its own organization_id
- `legal.ingest_runs` — **R7a** — own organization_id stamped by stamp_run_org, with emit_run_lifecycle; admin-only policy today because it never passed through the generator
- `pdf.pdf_redaction_key_escrow` — **AMBIGUOUS** — see the ambiguous list: Entity | Restricted
- `platform.knob_override` — **R7** — read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only, so the write door is elsewhere
- `platform.knob_rung_lock` — **R7** — read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id; authenticated holds SELECT only
- `platform.org_change_policy` — **R7** — read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, stamped by _stamp_org_default
- `rag.kg_chunks` — **R7** — read arm is organization_id IN (SELECT iam.my_orgs()) on its own organization_id, with its own owner_id and deleted_at
- `rag.kg_clusters` — **R7** — read arm is is_member_of_organization(organization_id) on its own organization_id
- `rag.kg_entities` — **R7** — read arm is is_member_of_organization(organization_id) on its own organization_id

### Detail — 345

*From the registry (312):* `agent.cmp_comparison_entries`, `agent.definition_version`, `agent.drift_alert`, `agent.usage`, `app.definition_version`, `app.error`, `app.execution`, `app.rate_limit`, `browser.account_binding`, `browser.capture`, `browser.control_request`, `browser.handoff`, `browser.login_attempt`, `browser.run`, `browser.site_observation`, `canvas.canvas_item_state`, `chat.agent_plan`, `chat.agent_run_stage`, `chat.agent_task`, `chat.artifact`, `chat.code_edit`, `chat.code_message_file`, `chat.coding_session_entry`, `chat.conversation_value`, `chat.media`, `chat.message`, `chat.observational_memory`, `chat.observational_memory_event`, `chat.pending_injection`, `chat.request`, `chat.request_snapshot`, `chat.tool_call`, `chat.tool_trace`, `chat.user_todo`, `commerce.asset_allocation`, `commerce.asset_grading`, `commerce.asset_identifier`, `commerce.asset_lot_event`, `commerce.asset_mandate_result`, `commerce.asset_price_factor`, `commerce.asset_reshoot_request`, `commerce.asset_review`, `commerce.asset_unknown`, `commerce.ebay_business_policy`, `commerce.ebay_custom_policy`, `commerce.ebay_inventory_item`, `commerce.ebay_inventory_item_group`, `commerce.ebay_inventory_item_group_member`, `commerce.ebay_inventory_location`, `commerce.ebay_listing`, `commerce.ebay_media_asset`, `commerce.ebay_notification_subscription`, `commerce.ebay_offer`, `commerce.ebay_order`, `commerce.ebay_order_line_item`, `commerce.ebay_shipping_fulfillment`, `commerce.ebay_store_category`, `commerce.human_correction`, `commerce.intake_artifact`, `commerce.intake_asset`, `commerce.label_code`, `commerce.marketplace_site`, `commerce.marketplace_sync_run`, `commerce.prediction_outcome`, `commerce.product_channel_ref`, `commerce.product_media`, `commerce.product_variant`, `commerce.recall_audit`, `communication.dm_conversation_participants`, `communication.dm_messages`, `communication.meet_notes`, `communication.meet_participants`, `communication.meet_recordings`, `communication.meet_transcript_segments`, `communication.sms_media`, `communication.sms_messages`, `content_ir.kind_component`, `content_ir.kind_component_incident`, `content_ir.kind_edge`, `content_ir.kind_example`, `content_ir.kind_surface`, `context.context_item_values`, `context.scope_dataset_instances`, `crm.address`, `crm.affiliation`, `crm.contact_candidate`, `crm.deal_stage_event`, `crm.interaction`, `crm.merge_candidate`, `crm.outreach_list_member`, `crm.party_contact_point`, `crm.party_merge`, `crm.sending_event`, `crm.sending_identity_check`, `docproc.processed_document_pages`, `education.assessment_item`, `education.fc_detail`, `esign.campaign_member`, `esign.envelope_document`, `esign.envelope_external_ref`, `esign.envelope_signer`, `files.analysis`, `files.entities`, `files.file_rag_jobs`, `files.file_versions`, `files.overrides`, `files.page_annotations`, `files.pages`, `growth.loop_event`, `growth.loop_stage_run`, `hindsight.finding`, `hindsight.replay`, `hindsight.review`, `hr.application`, `hr.asset_assignment`, `hr.attendance_exception`, `hr.availability`, `hr.benefits_event`, `hr.candidate_conversion`, `hr.candidate_message`, `hr.checklist_item`, `hr.checklist_run`, `hr.checklist_template_item`, `hr.course_version`, `hr.credential`, `hr.engagement`, `hr.establishment`, `hr.external_identity`, `hr.holiday`, `hr.i9_document`, `hr.incident_party`, `hr.interview`, `hr.jurisdiction_rule_test`, `hr.labor_target`, `hr.leave_enrollment`, `hr.leave_request`, `hr.legal_hold_item`, `hr.new_hire_report`, `hr.opening`, `hr.overtime_alert`, `hr.overtime_preapproval`, `hr.pay_period`, `hr.pay_period_employment`, `hr.payroll_export`, `hr.position_assignment`, `hr.posting_publication`, `hr.provider_event`, `hr.provisioning_result`, `hr.punch`, `hr.reporting_line`, `hr.schedule_change`, `hr.schedule_template_shift`, `hr.scorecard`, `hr.shift`, `hr.shift_claim`, `hr.staffing_requirement`, `hr.survey_invitation`, `hr.survey_question`, `hr.survey_response`, `hr.tax_registration`, `hr.time_adjustment`, `hr.training_assignment`, `hr.training_attempt`, `hr.transcript_entry`, `hr.work_interval`, `hr.workflow_binding`, `hr.workflow_failure`, `hr.workflow_step`, `hr.workflow_step_definition`, `hr.workweek`, `interview.decision_question`, `interview.document_revision`, `interview.hole`, `interview.question`, `interview.turn`, `legal.wc_injury`, `legal.wc_report`, `mandate.observation`, `ops.proof_run`, `pdf.redaction_mapping`, `plan.cms_fill_item`, `plan.cms_fill_job`, `plan.node_artifact`, `plan.node_step`, `platform.custom_record`, `platform.masterwork_corpus_item`, `platform.masterwork_run`, `podcast.pc_studio_run_assets`, `research.rs_analysis`, `research.rs_content`, `research.rs_document`, `research.rs_keyword`, `research.rs_media`, `research.rs_source`, `research.rs_synthesis`, `research.rs_tag`, `runtime.global_execution`, `runtime.global_execution_checkpoint`, `runtime.global_execution_event`, `runtime.global_meter_entry`, `runtime.work_item`, `scheduler.sch_agent_task`, `scheduler.sch_run`, `scheduler.sch_trigger`, `seo.ai_visibility_citation`, `seo.ai_visibility_claim`, `seo.ai_visibility_panel`, `seo.ai_visibility_response`, `seo.ai_visibility_signal`, `seo.backlink`, `seo.backlink_change_event`, `seo.backlink_dimension_snapshot`, `seo.backlink_observation`, `seo.backlink_snapshot`, `seo.change_assessment`, `seo.change_event`, `seo.change_item`, `seo.change_metric`, `seo.change_set`, `seo.change_theory`, `seo.competitor`, `seo.competitor_observation`, `seo.competitor_opportunity`, `seo.coverage_mention`, `seo.coverage_tracker`, `seo.dimension_value_matcher`, `seo.keyword_market_observation`, `seo.keyword_saved_view`, `seo.landscape_brief`, `seo.link_gap_domain`, `seo.link_gap_match`, `seo.map_topic`, `seo.page_measurement_health`, `seo.page_performance`, `seo.provider_call`, `seo.provider_task`, `seo.rank_observation`, `seo.raw_payload`, `seo.referring_domain_profile`, `seo.reputation_case`, `seo.search_performance_daily`, `seo.serp_mention`, `seo.serp_opportunity`, `seo.serp_result`, `seo.serp_snapshot`, `seo.site_geo_area`, `seo.site_keyword_offering`, `seo.site_keyword_value`, `seo.site_offering_value`, `seo.site_topic_value`, `seo.site_value_combo`, `seo.site_value_worth`, `seo.site_vocabulary`, `seo.web_analytics_daily`, `tool.binding`, `tool.definition_version`, `tool.test_sample`, `tool.ui`, `tool.ui_incident`, `tool.ui_version`, `transcripts.studio_documents`, `transcripts.studio_recording_segments`, `transcripts.studio_session_settings`, `users.credential_attachments`, `users.integration_connection_resources`, `web.analysis_result`, `web.brand_asset`, `web.brand_offering`, `web.business_fact`, `web.business_location`, `web.crawl_event`, `web.crawl_preset`, `web.crawl_schedule`, `web.crawl_session`, `web.crawl_url`, `web.discovered_item`, `web.finding`, `web.gsc_page_stat`, `web.link_edge`, `web.location_listing`, `web.page`, `web.page_content`, `web.page_evidence`, `web.page_sitemap`, `web.property`, `web.screenshot`, `web.site_endpoint_rule`, `web.site_item_config`, `web.site_offering`, `web.sitemap`, `web.snapshot`, `web.tag_manager_snapshot`, `workbench.product_capture_file`, `workbench.product_capture_payload`, `workbench.product_capture_product`, `workbench.product_capture_question`, `workbench.udt_dataset_fields`, `workbench.udt_dataset_rows`, `workbench.udt_document_snapshots`, `workbench.udt_structured_list_items`, `workbench.udt_workbook_snapshots`, `workflow.checkpoint`, `workflow.definition_version`, `workflow.idempotency`, `workflow.job`, `workflow.node_data_slot`, `workflow.node_events`, `workflow.node_outcome`, `workflow.plan`, `workflow.plan_sample`, `workflow.recovery_audit`, `workflow.trigger_fire`

*Unregistered (33), each with the rule that decided it:*

- `assignment.attempt` — **R6** — its only FK is to its parent attempt-holder and it carries no organization_id, owner_id or visibility of its own
- `assignment.item` — **R6** — FK to the registered token assignment_session; no own organization_id, owner_id or visibility
- `communication.sms_webhook_logs` — **R6** — FK to the registered token sms_message; no own organization_id, owner_id or visibility
- `context.context_value_refs` — **R6** — FKs to the registered tokens context_item, context_item_value and scope; no own organization_id or visibility (CUT-19's deprecation source)
- `docproc.page_extraction_results` — **R6** — every read arm resolves through the parent job (job_id IN readable_extraction_job_ids()); no own organization_id
- `docproc.page_extraction_runs` — **R6** — read arm is the parent job's (job_id IN readable_extraction_job_ids()); its organization_id FK is ON DELETE SET NULL NOT VALID and carries no read arm
- `files.analysis_result` — **R6** — read arm is EXISTS over files.files with cf.created_by = auth.uid() — exactly the parent file's access
- `files.structure` — **R6** — read arm is iam.has_access('file', file_id, 'viewer') — exactly the parent file's access
- `files.webhook_deliveries` — **R6** — read arm is EXISTS over files.webhooks with w.owner_id = auth.uid() — exactly the parent webhook's access
- `iam.org_industries` — **R6** — primary key is (organization_id, industry_id) — a junction row with no identity or visibility of its own
- `iam.organization_preferences` — **R6** — primary key IS organization_id — one row per organization, access exactly the organization's
- `rag.data_store_members` — **R6** — read arm is EXISTS over rag.data_stores — exactly the parent store's access
- `rag.embeddings_google_gemini_2_1536` — **R6** — read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk's access
- `rag.embeddings_oai_3_small_1536` — **R6** — read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk's access
- `rag.embeddings_voyage_4_large_1024` — **R6** — read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk's access
- `rag.embeddings_voyage_code_3_1024` — **R6** — read arm is EXISTS over rag.kg_chunks on chunk_id — exactly the parent chunk's access
- `rag.kg_chunk_entities` — **R6** — a chunk-to-entity link row with no identity or visibility of its own; four FKs and no standalone read arm
- `rag.kg_edges` — **R6** — a graph edge row — a relation between two kg_entities with no identity or visibility of its own
- `rag.kg_entity_aliases` — **R6** — an alias row hanging off rag.kg_entities with no identity or visibility of its own
- `seo.keyword_classification_queue` — **R6** — FK to the registered token seo_keyword and no organization_id, owner_id or visibility of its own
- `seo.topic_placement_queue` — **R6** — FKs to the registered tokens seo_keyword and web_site; no organization_id, owner_id or visibility of its own
- `transcripts.studio_cleaned_segments` — **R6** — read arm is EXISTS over transcripts.studio_sessions — exactly the parent session's access and visibility
- `transcripts.studio_concept_items` — **R6** — read arm is EXISTS over transcripts.studio_sessions — exactly the parent session's access and visibility
- `transcripts.studio_module_segments` — **R6** — read arm is EXISTS over transcripts.studio_sessions — exactly the parent session's access and visibility
- `transcripts.studio_raw_segments` — **R6** — read arm is EXISTS over transcripts.studio_sessions — exactly the parent session's access and visibility
- `users.feedback_comments` — **R6** — read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row's access
- `users.feedback_user_messages` — **R6** — read arm is feedback_id IN (users.user_feedback of auth.uid()) — exactly the parent feedback row's access
- `users.user_follows` — **R6** — a follower-to-followed link row with no identity or visibility of its own
- `web.endpoint_family_sweep_state` — **R6** — FK to the registered token web_site and no organization_id, owner_id or visibility of its own
- `workbench.udt_dataset_row_versions` — **R6** — a version store whose read arm is EXISTS over workbench.udt_datasets — CUT-14 states version stores are Details of what they version
- `workbench.udt_dataset_template_fields` — **R6** — read arm is EXISTS over workbench.udt_dataset_templates — exactly the parent template's access
- `workflow.trigger_event` — **R6** — read arm is EXISTS over workflow.trigger with t.created_by = auth.uid() — exactly the parent trigger's access
- `workflow.work_item` — **R6** — read arm is EXISTS over workflow.run with r.created_by = auth.uid() — exactly the parent run's access

### Reference — 120

*From the registry (97):* `admin.admin_markdown_samples`, `agent.exemplar`, `ai.model_alias`, `ai.model_definition`, `ai.provider`, `ai.setting`, `ai.voices`, `billing.capability`, `billing.capability_limit`, `billing.plan`, `billing.plan_limit`, `billing.price`, `billing.product`, `browser.login_recipe`, `browser.site_policy`, `commerce.ebay_category`, `commerce.ebay_category_aspect`, `commerce.ebay_category_tree`, `commerce.ebay_marketplace_policy`, `commerce.ebay_notification_destination`, `commerce.ebay_notification_topic`, `commerce.marketplace_rate_budget`, `content_ir.kind_definition`, `context.system_context_item`, `crm.jurisdiction_policy`, `crm.registry_source`, `education.content_certification`, `education.math_problems`, `esign.consent_disclosure`, `extend.wbx_recipe`, `files.account_tiers`, `files.machine_written_prefixes`, `growth.stage_ref_kind`, `hr.access_role`, `hr.field_policy`, `hr.jurisdiction`, `hr.jurisdiction_rule`, `hr.jurisdiction_rule_class`, `hr.record_class`, `hr.retention_rule`, `hr.workflow_flow_type`, `iam.industries`, `legal.wc_impairment_definition`, `mandate.definition`, `mandate.provision`, `meta.audit_exemption`, `ops.app_log_muted_pattern`, `ops.app_log_norm_exception`, `platform.approach`, `platform.assist_producer_policy`, `platform.assurance_level`, `platform.change_type_default`, `platform.custom_field_target`, `platform.domain_classification`, `platform.knob_scope_kind`, `platform.knob_write_door`, `platform.outsider_consumer`, `platform.retention_policy`, `platform.route_manifest`, `platform.shareable_resource_registry`, `platform.source_authority`, `platform.taxonomy_node`, `public.app_config`, `public.catalog_entries`, `research.youtube_video`, `runtime.global_origin`, `runtime.operation_stream`, `runtime.operation_stream_batch`, `seo.ai_capability`, `seo.geo_place`, `seo.keyword`, `seo.keyword_edge`, `seo.keyword_facet`, `seo.keyword_market`, `seo.keyword_place`, `seo.keyword_topic`, `seo.map_facet`, `seo.map_facet_value`, `seo.starter_pack`, `seo.starter_pack_item`, `seo.topic`, `tool.bundle`, `tool.definition`, `tool.executor`, `tool.mcp_config`, `tool.mcp_server`, `tool.surface_defaults`, `ui.ui_client`, `ui.ui_surface_agent_role`, `ui.ui_surface_client_tool`, `ui.ui_surface_value`, `ui.ui_surface_write_target`, `users.system_announcements`, `web.analysis_item`, `web.listing_publisher`, `web.offering_template`, `web.provider`

*Unregistered (23), each with the rule that decided it:*

- `context.template_context_items` — **R5** — SELECT policy qual is `true` for authenticated with writes admin-only; 846 platform-shipped template rows, no organization_id
- `context.template_scope_types` — **R5** — SELECT policy qual is `true` for authenticated with writes admin-only; 116 platform-shipped template rows, no organization_id
- `context.templates` — **R5** — read arm is is_active = true for every authenticated principal, writes admin-only; platform-shipped, no organization_id
- `education.math_course_structure` — **R5** — SELECT policy qual is `true` for authenticated, writes admin-only; platform-shipped course structure with no organization_id or owner_id
- `iam.system_orgs` — **R5** — SELECT policy qual is `true` for authenticated with an admin-only write arm; the platform-owned list of system organizations
- `legal.citations` — **R8a** — platform-ingested case-law catalog: no organization_id, no owner_id, no parent record, and legal.ingest_runs is its only writer
- `legal.courts` — **R8a** — platform-ingested court catalog (3,360 rows): no organization_id, no owner_id, no parent record
- `legal.dockets` — **R8a** — platform-ingested docket catalog: no organization_id, no owner_id; its one FK points at another catalog table
- `legal.opinion_clusters` — **R8a** — platform-ingested opinion catalog (7,900 rows): no organization_id, no owner_id, no parent record
- `legal.opinions` — **R8a** — platform-ingested opinion catalog: no organization_id, no owner_id, no parent record
- `ops.ops_issue_class` — **R5** — SELECT policy qual is `true` for authenticated, writes admin-only; 227 platform-defined issue classes with no organization_id
- `platform.feature_knob` — **R5** — carries a public_read policy with qual `true`; 752 platform-shipped knob definitions, writes admin-only, no organization_id
- `platform.masterwork_run_kind` — **R5** — one SELECT policy with qual `true`, authenticated holds SELECT only; 27 platform-defined run kinds
- `platform.mtx_media_heal_queue` — **R5** — enforced as public platform data: a SELECT policy with qual `true` beside an admin-only write arm, no organization_id — FINDING: a repair queue should not be world-readable
- `research.research_intent` — **R5** — RLS is OFF while authenticated holds every privilege, so every principal reads every row — platform-keyed catalog by enforcement; FINDING: RLS disabled on a client-granted table
- `scraper.scrape_domain` — **R5** — SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id
- `scraper.scrape_domain_settings` — **R5** — SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id
- `scraper.scrape_failure_log` — **R5** — enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a failure log should not be world-readable
- `scraper.scrape_path_override` — **R5** — SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id
- `scraper.scrape_path_pattern` — **R5** — SELECT policy qual is `true` for authenticated with an admin-only write arm; no organization_id or owner_id
- `scraper.scrape_retry_queue` — **R5** — enforced as public platform data: SELECT qual `true`, admin-only writes, no organization_id — FINDING: a retry queue should not be world-readable
- `seo.location` — **R5** — SELECT policy qual is `true` for authenticated with admin-only writes; a location catalog with no organization_id or owner_id
- `workbench.schema_templates` — **R5** — authenticated holds SELECT and nothing else while service_role writes; RLS off, no organization_id — platform-shipped schema templates

### Ledger — 43

*From the registry (42):* `admin.admin_audit_log`, `admin.admin_email_logs`, `admin.dev_login_audit`, `batch.cost_event`, `batch.provider_batch`, `batch.work_item`, `browser.action_event`, `commerce.ebay_notification_event`, `commerce.marketplace_account_deletion_audit`, `commerce.marketplace_api_call`, `context.context_access_log`, `education.data_rights_event`, `esign.envelope_certificate`, `esign.envelope_event`, `history.row_versions`, `hr.approval_authority`, `hr.approval_delegation`, `hr.calculation_snapshot`, `hr.derived_grant`, `hr.disposition_event`, `hr.leave_ledger`, `hr.payroll_export_line`, `hr.role_assignment`, `hr.workflow_decision`, `hr.workflow_event`, `iam.org_admin_audit`, `mandate.advance_batch_row`, `ops.api_field_warnings`, `ops.api_request_log`, `platform.actor_token_event`, `platform.continued_access`, `platform.judge_verdict`, `platform.knob_override_audit`, `platform.matrx_action_ledger`, `platform.short_links`, `rag.ingest_run`, `rag.library_audit_log`, `users.guest_conversion_audit`, `users.user_secret_audit`, `web.channel_analytics_daily`, `workflow.plan_event`, `workflow.run_log`

*Unregistered (1), each with the rule that decided it:*

- `seo.classifier_revision_ledger` — **R2g** — service_role holds INSERT and SELECT and nothing holds UPDATE or DELETE — append-only enforced by grant rather than by trigger

### Restricted — 44

*From the registry (44):* `ai.api`, `ai.endpoint`, `ai.offering`, `browser.authenticator_window`, `browser.profile_checkpoint`, `browser.stream_ticket`, `chat.coding_session`, `education.guardian_link`, `esign.provider`, `esign.signing_key`, `hr.access_audit`, `hr.accommodation_request`, `hr.ai_evidence`, `hr.background_check`, `hr.compensation`, `hr.corrective_action`, `hr.eeo_response`, `hr.emergency_contact`, `hr.employee_private`, `hr.employer_profile`, `hr.employment_pin`, `hr.i9`, `hr.incident`, `hr.kiosk_device`, `hr.kiosk_session`, `hr.leave_case`, `hr.legal_hold`, `hr.offer`, `hr.records_request`, `hr.reference_check`, `hr.restricted_note`, `hr.separation`, `hr.tax_withholding`, `hr.verification_letter_request`, `iam.access_audit`, `iam.emergency_door_request`, `mandate.reference`, `mandate.scan`, `platform.actor_session`, `platform.actor_token`, `provider.account`, `provider.account_credential`, `scraper.scrape_parsed_page`, `users.credential_mutation_receipts`

### System — 105

*From the registry (49):* `admin.admins`, `audit.broken_functions`, `audit.canonical_findings`, `audit.function_deps`, `audit.function_runtime_probe`, `audit.m2m_candidates`, `audit.refresh_log`, `audit.stale_registry`, `audit.unregistered_candidates`, `billing.stripe_event`, `iam.access_requests`, `iam.industry_curators`, `iam.invitations`, `iam.memberships`, `iam.organizations`, `iam.permissions`, `iam.system_personal_org_failures`, `meta.excluded_schema`, `meta.table_stats_history`, `platform._base_entity`, `platform.activity_log`, `platform.association_types`, `platform.associations`, `platform.ddl_guard_log`, `platform.deprecated_relations`, `platform.edge_payload_kind`, `platform.entity_grants`, `platform.entity_relationships`, `platform.entity_types`, `platform.lifecycle_archive`, `platform.lifecycle_archive_row`, `platform.lifecycle_audit`, `platform.lifecycle_entity_plan`, `platform.lifecycle_map_build`, `platform.lifecycle_reference_map`, `platform.lifecycle_run`, `platform.lifecycle_tier_ledger`, `platform.mtx_public_url_guard`, `platform.reachability`, `platform.reference_categories`, `platform.reference_declaration`, `platform.repo`, `platform.schemas`, `public._schema_migrations`, `public.infra_status`, `public.schema_migrations`, `runtime.execution_event_cursor`, `runtime.global_execution_control`, `users.user_secret_grants`

*Unregistered (56), each with the rule that decided it:*

- `agent.review_queue` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record — the platform's own review register
- `campaign_watch.build_lock` — **R3** — no SELECT/INSERT/UPDATE/DELETE grant to anon, authenticated or service_role — reachable only by the owner and SECURITY DEFINER code
- `communication.emails` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `communication.sms_rate_limits` — **R8** — only arms are is_platform_admin() and auth.role()='service_role'; no organization_id, owner_id or parent record
- `content_ir.admission_config` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `context.scope_door_registry` — **R3** — no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code
- `files.idempotency` — **AMBIGUOUS** — see the ambiguous list: System | Entity
- `files.rate_limit_buckets` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `files.webhook_dispatch_state` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `hr._recompute_queue` — **R3** — no grant to any API role; RLS off; reachable only by the owner and SECURITY DEFINER code
- `hr._write_guard_key` — **R3** — no grant to any API role; RLS on with zero policies — closed to every principal but the owner
- `hr.definer_grant_baseline` — **R3** — no grant to any API role; RLS on with zero policies
- `hr.function_contract` — **R3** — no grant to any API role; RLS on with zero policies
- `hr.notify_outsider_door_baseline` — **R3** — no grant to any API role; RLS off
- `iam.access_delta_probe` — **R3** — no grant to any API role — its one service_role policy is unreachable without a table grant
- `iam.access_delta_run` — **R3** — no grant to any API role — its one service_role policy is unreachable without a table grant
- `iam.dd171_containment_baseline` — **AMBIGUOUS** — see the ambiguous list: System | Deprecated
- `iam.dd175_cast` — **AMBIGUOUS** — see the ambiguous list: System | Deprecated
- `iam.dd175_component_lane_baseline` — **AMBIGUOUS** — see the ambiguous list: System | Deprecated
- `iam.definer_class_exemption` — **R4s** — service_role SELECT is the only grant and the table sits in iam, which Doctrine 1.1 names under System
- `iam.membership_grant` — **R8** — only policy arm is is_platform_admin(); iam is named under System by Doctrine 1.1
- `iam.superseded_policy` — **R3** — no grant to any API role; RLS off — a superseded-policy register only the owner and SECURITY DEFINER code reach
- `partman.part_config` — **R3** — no grant to any API role; pg_partman's own control table
- `partman.part_config_sub` — **R3** — no grant to any API role; pg_partman's own control table
- `pdf.pdf_consolidation_log` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `platform._oauth_handoff_claim` — **R3** — no grant to any API role; RLS on with zero policies
- `platform._policy_overlap_probe` — **AMBIGUOUS** — see the ambiguous list: System | Deprecated
- `platform.anon_function_birth_grandfather` — **R3** — no grant to any API role; a platform guard register with its own closure trigger
- `platform.assist_producer_policy_history` — **R8** — only arms are is_platform_admin() and is_admin(); a platform policy history, which Doctrine 1.1 names under System
- `platform.client_callable_door` — **R3** — no grant to any API role; the door registry the grant event trigger reads — machinery by definition
- `platform.client_callable_door_retirement` — **R3** — no grant to any API role; part of the same door registry
- `platform.client_excluded_column_unregistered` — **R3** — no grant to any API role
- `platform.definer_client_grant_grandfather` — **R3** — no grant to any API role
- `platform.metadata_reserved_keys` — **R4s** — service_role is the only grantee and the table sits in platform — Doctrine 1.1 names the registry and meta plumbing under System
- `platform.provision_generate_target` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.provision_grant` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.provision_marker` — **R3** — no grant to any API role
- `platform.provision_rule_message` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.provision_schema` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.provision_shape_debt` — **R3** — no grant to any API role
- `platform.provision_spec` — **R3** — no grant to any API role; its _provision_spec_append_only trigger is noted but no principal can reach the table at all
- `platform.provision_spec_grandfather` — **R3** — no grant to any API role
- `platform.provision_vocabulary` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.soft_delete_edge` — **R3** — no grant to any API role; RLS on with zero policies
- `platform.stamped_write_table` — **R3** — no grant to any API role
- `public._schema_migration_slot_grandfather` — **R4s** — service_role is the only grantee and the table is migration plumbing — Doctrine 1.1 names meta plumbing under System
- `public.app_config_history` — **R8** — only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System
- `public.catalog_entries_history` — **R8** — only arms are is_platform_admin() and is_admin(); Doctrine 1.1 names history under System
- `rag.embedding_cache` — **R9** — no client read arm at all (admin-only), no org-stamping trigger, primary key is a cache_key — writes arrive only through SECURITY DEFINER code
- `research.youtube_quota_day` — **R8** — only arms are is_platform_admin() and is_super_admin(); no organization_id, owner_id or parent record
- `scheduler.agent_schedule` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `scheduler.agent_schedule_claim` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record
- `seo.engine_owner_task` — **R3** — no grant to any API role; RLS off
- `users.guest_execution_log` — **R8** — only arms are is_platform_admin() and auth.role()='service_role'; no organization_id, owner_id or parent record
- `users.guest_executions` — **R8** — only arms are is_platform_admin() and auth.role()='service_role'; no organization_id or owner_id, and its auth user FK is ON DELETE SET NULL
- `workflow.worker_heartbeat` — **R8** — only policy arm is is_platform_admin(); no organization_id, owner_id or parent record

### Deprecated — 7

*Unregistered (7), each with the rule that decided it:*

- `legal._stage_dockets_966c18eca7` — **R1** — name matches the _stage_ staging-table rule CUT-14 states verbatim
- `ops._bak_organization_name_dd043` — **R1** — name matches the _bak_ backup-table rule CUT-14 states verbatim
- `ops.path_drift_repair_2026_09` — **R1** — a dated one-off repair artefact (_2026_09), no grants and no RLS — the same class CUT-14's backup rule names
- `platform._bak_assoc_file_processed_document_20260812` — **R1** — name matches the _bak_ backup-table rule CUT-14 states verbatim
- `platform._bak_assoc_type_file_processed_document_20260812` — **R1** — name matches the _bak_ backup-table rule CUT-14 states verbatim
- `platform._policy_overlap_backup` — **R1** — name matches the _backup backup-table rule CUT-14 states verbatim
- `runtime._org_repair_0253_backup` — **R1** — name matches the _backup backup-table rule CUT-14 states verbatim

---

*Lane `W1-CLASS`. Contract rows REC-54 and CUT-14; exit clause C-40. No lock held; every statement a SELECT.*

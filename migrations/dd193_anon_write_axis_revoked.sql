-- dd193_anon_write_axis_revoked — THE ANONYMOUS WRITE AXIS, CLOSED
-- (DD-193. SECURITY P0. db-rules §0/§6d/§9. No policy is created, altered or dropped by this file —
--  it changes GRANTS and DEFAULT PRIVILEGES only, the two layers `iam.apply_rls` never touches, so a
--  policy regeneration cannot undo any of it.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- DD-186 (B-78) closed the anonymous READ surface and named what it deliberately did not sweep:
-- the same relations still carried anonymous INSERT, UPDATE and DELETE. Measured here:
--
--   286 relations in a PostgREST-exposed schema carry an INSERT / UPDATE / DELETE / MAINTAIN
--       privilege for `anon` (273 tables, 13 views), across 31 schemas.
--    18 of them have a write-capable RLS policy that reaches `anon` at all, and every one of those
--       18 is a policy written `TO PUBLIC` — i.e. to every role, `anon` included — whose expression
--       requires `is_platform_admin()` or `auth.uid() = <owner>`. For a signed-out caller
--       `auth.uid()` is null, so all 18 evaluate false.
--     0 policies name `anon` for a write command anywhere on this database. All 343 policies that
--       name `anon` explicitly are SELECT (`polcmd = 'r'`).
--     0 of the 273 tables have row-level security disabled.
--
-- So no anonymous write succeeds today, on any relation, and there is no signed-out writer to
-- preserve: every real one goes through a SECURITY DEFINER door instead — `record_guest_execution`
-- (B-71), `outreach_unsubscribe`, `log_client_error`, `communication.meet_record_consent` and the
-- eight `hr_kiosk_*` functions. A definer function runs as its owner and never consults the
-- caller's table privileges, so not one of them is touched by this file.
--
-- THE GRANT IS THE DEFECT, NOT THE ROW COUNT. This is DD-181's finding on the write axis: a
-- privilege standing beside a closed policy is the safe path next to the unsafe one. The day anyone
-- regenerates a policy set with an anon arm, disables RLS for a migration, or adds a `TO PUBLIC`
-- write policy whose predicate is true for a null uid, the grant turns that mistake into an
-- anonymous write in the same instant and no detector asks. The correct bound for a relation whose
-- signed-out writer cannot exist is zero, and it is set here.
--
-- AND THE REFUSALS WERE DISHONEST. With the grant in place Postgres passes the privilege check and
-- goes on to evaluate the policy, so an anonymous `update iam.organizations` came back
-- `42501 permission denied for FUNCTION is_org_manager` — a sentence that names an internal helper
-- and tells the caller nothing true about the door. With the grant gone it is
-- `42501 permission denied for table organizations`. (Nothing fails silently: both are errors, but
-- only one of them is about the thing that actually refused.)
--
-- MAINTAIN is included: 29 relations in `chat`, `communication` and `files` granted `anon` the
-- PostgreSQL 17 MAINTAIN privilege through a historical `grant all`, which carries
-- REFRESH MATERIALIZED VIEW — a data-rewriting command — and VACUUM/ANALYZE/CLUSTER/REINDEX.
--
-- WHAT THIS DOES NOT TOUCH. `authenticated` and `service_role` keep every privilege they hold;
-- grants are per-role, so no signed-in surface changes. `anon` keeps every SELECT column grant
-- DD-186 declared. No policy is created or dropped here (the two `iam.organizations` PUBLIC write
-- policies are superseded in their own file, `dd193_iam_organizations_write_policies_scoped.sql`).
--
-- THE CLASS FIX IS THE SECOND HALF OF THIS FILE. Seven schemas carry DEFAULT PRIVILEGES that grant
-- `anon` INSERT/UPDATE/DELETE on every table created in them from now on — `communication`, `files`,
-- `podcast`, `public`, `scheduler`, `users`, `workflow`. Revoking 286 grants without revoking those
-- would mean the surface silently re-opens with the next `create table`, and the guard would go red
-- on work that did nothing wrong. The write bits are revoked from the defaults below.
-- (The same defaults also grant `anon` SELECT on new tables, in those seven plus `crm`, `docproc`
--  and `pdf`. That is DD-186's axis, it is guarded loudly by `check:anon-column-surface`'s
--  undeclared-relation arm, and it is reported to the chair rather than swept here.)

revoke insert, update, delete, maintain on admin.admin_audit_log from anon;
revoke insert, update, delete, maintain on admin.admin_email_logs from anon;
revoke insert, update, delete, maintain on admin.admin_markdown_samples from anon;
revoke insert, update, delete, maintain on admin.admins from anon;
revoke insert, update, delete, maintain on admin.dev_login_audit from anon;
revoke insert, update, delete, maintain on agent.cmp_comparison_entries from anon;
revoke insert, update, delete, maintain on agent.cmp_comparison_sets from anon;
revoke insert, update, delete, maintain on agent.cmp_response_feedback from anon;
revoke insert, update, delete, maintain on agent.definition from anon;
revoke insert, update, delete, maintain on agent.definition_version from anon;
revoke insert, update, delete, maintain on agent.message_template from anon;
revoke insert, update, delete, maintain on agent.shortcut from anon;
revoke insert, update, delete, maintain on agent.template from anon;
revoke insert, update, delete, maintain on app.definition from anon;
revoke insert, update, delete, maintain on app.definition_version from anon;
revoke insert, update, delete, maintain on app.error from anon;
revoke insert, update, delete, maintain on app.execution from anon;
revoke insert, update, delete, maintain on app.rate_limit from anon;
revoke insert, update, delete, maintain on canvas.canvas_comment_likes from anon;
revoke insert, update, delete, maintain on canvas.canvas_comments from anon;
revoke insert, update, delete, maintain on canvas.canvas_item_state from anon;
revoke insert, update, delete, maintain on canvas.canvas_items from anon;
revoke insert, update, delete, maintain on canvas.canvas_likes from anon;
revoke insert, update, delete, maintain on canvas.canvas_scores from anon;
revoke insert, update, delete, maintain on canvas.canvas_views from anon;
revoke insert, update, delete, maintain on canvas.shared_canvas_items from anon;
revoke insert, update, delete, maintain on chat.agent_memory from anon;
revoke insert, update, delete, maintain on chat.agent_plan from anon;
revoke insert, update, delete, maintain on chat.agent_run from anon;
revoke insert, update, delete, maintain on chat.agent_run_stage from anon;
revoke insert, update, delete, maintain on chat.agent_task from anon;
revoke insert, update, delete, maintain on chat.artifact from anon;
revoke insert, update, delete, maintain on chat.code_edit from anon;
revoke insert, update, delete, maintain on chat.code_message_file from anon;
revoke insert, update, delete, maintain on chat.conversation from anon;
revoke insert, update, delete, maintain on chat.conversation_value from anon;
revoke insert, update, delete, maintain on chat.media from anon;
revoke insert, update, delete, maintain on chat.message from anon;
revoke insert, update, delete, maintain on chat.observational_memory from anon;
revoke insert, update, delete, maintain on chat.observational_memory_event from anon;
revoke insert, update, delete, maintain on chat.pending_injection from anon;
revoke insert, update, delete, maintain on chat.request from anon;
revoke insert, update, delete, maintain on chat.request_snapshot from anon;
revoke insert, update, delete, maintain on chat.tool_call from anon;
revoke insert, update, delete, maintain on chat.tool_trace from anon;
revoke insert, update, delete, maintain on chat.user_request from anon;
revoke insert, update, delete, maintain on chat.user_todo from anon;
revoke insert, update, delete, maintain on chat.user_usage_summary from anon;
revoke insert, update, delete, maintain on code.code_file_folders from anon;
revoke insert, update, delete, maintain on code.code_files from anon;
revoke insert, update, delete, maintain on code.code_repositories from anon;
revoke insert, update, delete, maintain on communication.contact_submissions from anon;
revoke insert, update, delete, maintain on communication.dm_conversation_participants from anon;
revoke insert, update, delete, maintain on communication.dm_conversations from anon;
revoke insert, update, delete, maintain on communication.dm_messages from anon;
revoke insert, update, delete, maintain on communication.meet_call_invites from anon;
revoke insert, update, delete, maintain on communication.meet_meetings from anon;
revoke insert, update, delete, maintain on communication.meet_notes from anon;
revoke insert, update, delete, maintain on communication.meet_participants from anon;
revoke insert, update, delete, maintain on communication.meet_recordings from anon;
revoke insert, update, delete, maintain on communication.meet_transcript_segments from anon;
revoke insert, update, delete, maintain on communication.notification from anon;
revoke insert, update, delete, maintain on communication.notification_channel_preference from anon;
revoke insert, update, delete, maintain on communication.notification_event_override from anon;
revoke insert, update, delete, maintain on communication.notification_event_type from anon;
revoke insert, update, delete, maintain on communication.notification_preference from anon;
revoke insert, update, delete, maintain on communication.sms_consent from anon;
revoke insert, update, delete, maintain on communication.sms_conversations from anon;
revoke insert, update, delete, maintain on communication.sms_media from anon;
revoke insert, update, delete, maintain on communication.sms_messages from anon;
revoke insert, update, delete, maintain on communication.sms_notification_preferences from anon;
revoke insert, update, delete, maintain on communication.sms_notifications from anon;
revoke insert, update, delete, maintain on communication.sms_phone_numbers from anon;
revoke insert, update, delete, maintain on communication.sms_rate_limits from anon;
revoke insert, update, delete, maintain on communication.sms_webhook_logs from anon;
revoke insert, update, delete, maintain on context.context_access_log from anon;
revoke insert, update, delete, maintain on context.context_items from anon;
revoke insert, update, delete, maintain on context.scope_types from anon;
revoke insert, update, delete, maintain on context.scopes from anon;
revoke insert, update, delete, maintain on context.template_context_items from anon;
revoke insert, update, delete, maintain on context.template_scope_types from anon;
revoke insert, update, delete, maintain on context.templates from anon;
revoke insert, update, delete, maintain on context.user_active_context from anon;
revoke insert, update, delete, maintain on dictionary.dict_entries from anon;
revoke insert, update, delete, maintain on dictionary.dict_provider_publication from anon;
revoke insert, update, delete, maintain on dictionary.dict_settings from anon;
revoke insert, update, delete, maintain on docproc.derive_runs from anon;
revoke insert, update, delete, maintain on docproc.page_extraction_jobs from anon;
revoke insert, update, delete, maintain on docproc.page_extraction_page_runs from anon;
revoke insert, update, delete, maintain on docproc.page_extraction_results from anon;
revoke insert, update, delete, maintain on docproc.page_extraction_runs from anon;
revoke insert, update, delete, maintain on docproc.processed_document_pages from anon;
revoke insert, update, delete, maintain on education.math_course_structure from anon;
revoke insert, update, delete, maintain on education.math_problems from anon;
revoke insert, update, delete, maintain on education.quiz_sessions from anon;
revoke insert, update, delete, maintain on education.study_source_chunk from anon;
revoke insert, update, delete, maintain on education.study_structured_section from anon;
revoke insert, update, delete, maintain on extend.extension_auth_codes from anon;
revoke insert, update, delete, maintain on extend.wbx_capture from anon;
revoke insert, update, delete, maintain on extend.wbx_demo from anon;
revoke insert, update, delete, maintain on extend.wbx_guidance from anon;
revoke insert, update, delete, maintain on extend.wbx_highlight from anon;
revoke insert, update, delete, maintain on extend.wbx_pattern from anon;
revoke insert, update, delete, maintain on extend.wbx_recipe from anon;
revoke insert, update, delete, maintain on extend.wbx_screenshot from anon;
revoke insert, update, delete, maintain on extend.wbx_seo_audit from anon;
revoke insert, update, delete, maintain on files.account_tiers from anon;
revoke insert, update, delete, maintain on files.analysis from anon;
revoke insert, update, delete, maintain on files.analysis_result from anon;
revoke insert, update, delete, maintain on files.entities from anon;
revoke insert, update, delete, maintain on files.file_rag_jobs from anon;
revoke insert, update, delete, maintain on files.folders from anon;
revoke insert, update, delete, maintain on files.idempotency from anon;
revoke insert, update, delete, maintain on files.overrides from anon;
revoke insert, update, delete, maintain on files.page_annotations from anon;
revoke insert, update, delete, maintain on files.pages from anon;
revoke insert, update, delete, maintain on files.rate_limit_buckets from anon;
revoke insert, update, delete, maintain on files.structure from anon;
revoke insert, update, delete, maintain on files.uploads_inflight from anon;
revoke insert, update, delete, maintain on files.user_account from anon;
revoke insert, update, delete, maintain on files.user_storage_usage from anon;
revoke insert, update, delete, maintain on files.webhook_deliveries from anon;
revoke insert, update, delete, maintain on files.webhooks from anon;
revoke insert, update, delete, maintain on iam.industries from anon;
revoke insert, update, delete, maintain on iam.industry_curators from anon;
revoke insert, update, delete, maintain on iam.org_industries from anon;
revoke insert, update, delete, maintain on iam.organization_preferences from anon;
revoke insert, update, delete, maintain on iam.organizations from anon;
revoke insert, update, delete, maintain on iam.permissions from anon;
revoke insert, update, delete, maintain on iam.system_orgs from anon;
revoke insert, update, delete, maintain on legal.wc_claim from anon;
revoke insert, update, delete, maintain on legal.wc_impairment_definition from anon;
revoke insert, update, delete, maintain on legal.wc_injury from anon;
revoke insert, update, delete, maintain on legal.wc_report from anon;
revoke insert, update, delete, maintain on ops.api_field_warnings from anon;
revoke insert, update, delete, maintain on ops.api_request_log from anon;
revoke insert, update, delete, maintain on ops.app_log from anon;
revoke insert, update, delete, maintain on ops.app_log_muted_pattern from anon;
revoke insert, update, delete, maintain on ops.app_log_norm_exception from anon;
revoke insert, update, delete, maintain on ops.ops_issue_class from anon;
revoke insert, update, delete, maintain on ops.ops_issue_event from anon;
revoke insert, update, delete, maintain on ops.system_error from anon;
revoke insert, update, delete, maintain on ops.system_write_failure from anon;
revoke insert, update, delete, maintain on pdf.pdf_redaction_audits from anon;
revoke insert, update, delete, maintain on pdf.pdf_redaction_key_escrow from anon;
revoke insert, update, delete, maintain on pdf.redaction_mapping from anon;
revoke insert, update, delete, maintain on platform.categories from anon;
revoke insert, update, delete, maintain on platform.flexible_data from anon;
revoke insert, update, delete, maintain on platform.mtx_media_heal_queue from anon;
revoke insert, update, delete, maintain on platform.mtx_public_url_guard from anon;
revoke insert, update, delete, maintain on platform.shareable_resource_registry from anon;
revoke insert, update, delete, maintain on podcast.pc_articles from anon;
revoke insert, update, delete, maintain on podcast.pc_episodes from anon;
revoke insert, update, delete, maintain on podcast.pc_race from anon;
revoke insert, update, delete, maintain on podcast.pc_shows from anon;
revoke insert, update, delete, maintain on podcast.pc_studio_run_assets from anon;
revoke insert, update, delete, maintain on podcast.pc_studio_runs from anon;
revoke insert, update, delete, maintain on public.app_instances from anon;
revoke insert, update, delete, maintain on public.app_settings from anon;
revoke insert, update, delete, maintain on public.app_sync_status from anon;
revoke insert, update, delete, maintain on public.current_user_is_admin from anon;
revoke insert, update, delete, maintain on public.infra_status from anon;
revoke insert, update, delete, maintain on public.pdf_unified_pages from anon;
revoke insert, update, delete, maintain on public.sandbox_instances from anon;
revoke insert, update, delete, maintain on public.v_context_item_suggestions from anon;
revoke insert, update, delete, maintain on public.v_kg_alerts from anon;
revoke insert, update, delete, maintain on public.v_kg_sweep_effectiveness from anon;
revoke insert, update, delete, maintain on public.v_kg_value_matches from anon;
revoke insert, update, delete, maintain on public.v_ner_canonicalizer_shadow from anon;
revoke insert, update, delete, maintain on public.v_scope_suggestion_stats from anon;
revoke insert, update, delete, maintain on public.v_scope_suggestions from anon;
revoke insert, update, delete, maintain on public.v_scope_suggestions_new from anon;
revoke insert, update, delete, maintain on rag.context_item_suggestions from anon;
revoke insert, update, delete, maintain on rag.kg_alerts from anon;
revoke insert, update, delete, maintain on rag.kg_suggestion_ack from anon;
revoke insert, update, delete, maintain on rag.kg_sweep_queue from anon;
revoke insert, update, delete, maintain on rag.kg_sweep_run from anon;
revoke insert, update, delete, maintain on rag.kg_sweep_state from anon;
revoke insert, update, delete, maintain on rag.kg_value_matches from anon;
revoke insert, update, delete, maintain on rag.ner_canonicalizer_shadow from anon;
revoke insert, update, delete, maintain on rag.scope_association_suggestions from anon;
revoke insert, update, delete, maintain on rag.scope_item_value_suggestions from anon;
revoke insert, update, delete, maintain on rag.scope_suggestions from anon;
revoke insert, update, delete, maintain on research.rs_analysis from anon;
revoke insert, update, delete, maintain on research.rs_content from anon;
revoke insert, update, delete, maintain on research.rs_document from anon;
revoke insert, update, delete, maintain on research.rs_keyword from anon;
revoke insert, update, delete, maintain on research.rs_media from anon;
revoke insert, update, delete, maintain on research.rs_source from anon;
revoke insert, update, delete, maintain on research.rs_source_keywords from anon;
revoke insert, update, delete, maintain on research.rs_synthesis from anon;
revoke insert, update, delete, maintain on research.rs_tag from anon;
revoke insert, update, delete, maintain on research.rs_template from anon;
revoke insert, update, delete, maintain on research.rs_topic from anon;
revoke insert, update, delete, maintain on scheduler.agent_schedule from anon;
revoke insert, update, delete, maintain on scheduler.agent_schedule_claim from anon;
revoke insert, update, delete, maintain on scheduler.sch_agent_task from anon;
revoke insert, update, delete, maintain on scheduler.sch_run from anon;
revoke insert, update, delete, maintain on scheduler.sch_task from anon;
revoke insert, update, delete, maintain on scheduler.sch_trigger from anon;
revoke insert, update, delete, maintain on skill.definition from anon;
revoke insert, update, delete, maintain on skill.render_definition from anon;
revoke insert, update, delete, maintain on tool.bundle from anon;
revoke insert, update, delete, maintain on tool.definition from anon;
revoke insert, update, delete, maintain on tool.definition_version from anon;
revoke insert, update, delete, maintain on tool.executor from anon;
revoke insert, update, delete, maintain on tool.mcp_config from anon;
revoke insert, update, delete, maintain on tool.mcp_server from anon;
revoke insert, update, delete, maintain on tool.mcp_user_conn from anon;
revoke insert, update, delete, maintain on tool.surface_defaults from anon;
revoke insert, update, delete, maintain on tool.test_sample from anon;
revoke insert, update, delete, maintain on tool.ui from anon;
revoke insert, update, delete, maintain on tool.ui_incident from anon;
revoke insert, update, delete, maintain on tool.ui_version from anon;
revoke insert, update, delete, maintain on transcripts.studio_cleaned_segments from anon;
revoke insert, update, delete, maintain on transcripts.studio_concept_items from anon;
revoke insert, update, delete, maintain on transcripts.studio_documents from anon;
revoke insert, update, delete, maintain on transcripts.studio_module_segments from anon;
revoke insert, update, delete, maintain on transcripts.studio_raw_segments from anon;
revoke insert, update, delete, maintain on transcripts.studio_recording_segments from anon;
revoke insert, update, delete, maintain on transcripts.studio_runs from anon;
revoke insert, update, delete, maintain on transcripts.studio_session_settings from anon;
revoke insert, update, delete, maintain on transcripts.studio_sessions from anon;
revoke insert, update, delete, maintain on transcripts.transcripts from anon;
revoke insert, update, delete, maintain on ui.ui_client from anon;
revoke insert, update, delete, maintain on ui.ui_surface from anon;
revoke insert, update, delete, maintain on ui.ui_surface_agent_pref from anon;
revoke insert, update, delete, maintain on ui.ui_surface_agent_role from anon;
revoke insert, update, delete, maintain on ui.ui_surface_config from anon;
revoke insert, update, delete, maintain on ui.ui_surface_value from anon;
revoke insert, update, delete, maintain on users.feedback_comments from anon;
revoke insert, update, delete, maintain on users.feedback_user_messages from anon;
revoke insert, update, delete, maintain on users.invitation_requests from anon;
revoke insert, update, delete, maintain on users.profiles from anon;
revoke insert, update, delete, maintain on users.system_announcements from anon;
revoke insert, update, delete, maintain on users.user_achievements from anon;
revoke insert, update, delete, maintain on users.user_analysis_preferences from anon;
revoke insert, update, delete, maintain on users.user_bookmarks from anon;
revoke insert, update, delete, maintain on users.user_email_preferences from anon;
revoke insert, update, delete, maintain on users.user_feedback from anon;
revoke insert, update, delete, maintain on users.user_follows from anon;
revoke insert, update, delete, maintain on users.user_form_profile from anon;
revoke insert, update, delete, maintain on users.user_markdown_samples from anon;
revoke insert, update, delete, maintain on users.user_memory from anon;
revoke insert, update, delete, maintain on users.user_preferences from anon;
revoke insert, update, delete, maintain on users.user_secret_audit from anon;
revoke insert, update, delete, maintain on users.user_stats from anon;
revoke insert, update, delete, maintain on users.user_surface_state from anon;
revoke insert, update, delete, maintain on workbench.heatmap_saves from anon;
revoke insert, update, delete, maintain on workbench.note_folders from anon;
revoke insert, update, delete, maintain on workbench.notes from anon;
revoke insert, update, delete, maintain on workbench.udt_dataset_fields from anon;
revoke insert, update, delete, maintain on workbench.udt_dataset_row_versions from anon;
revoke insert, update, delete, maintain on workbench.udt_dataset_rows from anon;
revoke insert, update, delete, maintain on workbench.udt_document_snapshots from anon;
revoke insert, update, delete, maintain on workbench.udt_structured_list_items from anon;
revoke insert, update, delete, maintain on workbench.udt_workbook_snapshots from anon;
revoke insert, update, delete, maintain on workbench.working_documents from anon;
revoke insert, update, delete, maintain on workflow.checkpoint from anon;
revoke insert, update, delete, maintain on workflow.comparison from anon;
revoke insert, update, delete, maintain on workflow.definition from anon;
revoke insert, update, delete, maintain on workflow.definition_version from anon;
revoke insert, update, delete, maintain on workflow.extract_sweep_state from anon;
revoke insert, update, delete, maintain on workflow.idempotency from anon;
revoke insert, update, delete, maintain on workflow.job from anon;
revoke insert, update, delete, maintain on workflow.node_data_slot from anon;
revoke insert, update, delete, maintain on workflow.node_events from anon;
revoke insert, update, delete, maintain on workflow.node_outcome from anon;
revoke insert, update, delete, maintain on workflow.plan from anon;
revoke insert, update, delete, maintain on workflow.plan_event from anon;
revoke insert, update, delete, maintain on workflow.plan_sample from anon;
revoke insert, update, delete, maintain on workflow.recovery_audit from anon;
revoke insert, update, delete, maintain on workflow.run from anon;
revoke insert, update, delete, maintain on workflow.run_log from anon;
revoke insert, update, delete, maintain on workflow.runtime_surface from anon;
revoke insert, update, delete, maintain on workflow.template from anon;
revoke insert, update, delete, maintain on workflow.trigger from anon;
revoke insert, update, delete, maintain on workflow.trigger_event from anon;
revoke insert, update, delete, maintain on workflow.trigger_fire from anon;
revoke insert, update, delete, maintain on workflow.v_definition_catalog from anon;
revoke insert, update, delete, maintain on workflow.v_engram_confirmed_run from anon;
revoke insert, update, delete, maintain on workflow.work_item from anon;
revoke insert, update, delete, maintain on workspace.projects from anon;
revoke insert, update, delete, maintain on workspace.tasks from anon;
revoke insert, update, delete, maintain on workspace.threads from anon;
revoke insert, update, delete, maintain on workspace.war_rooms from anon;

-- ── The sequences. UPDATE/USAGE on a sequence is `nextval`/`setval` — a write, and the only
--    reason `anon` was ever given one was to feed an INSERT it can no longer make. Seven of them.
revoke update, usage on sequence api.html_extractions_id_seq from anon;
revoke update, usage on sequence chat.cx_pending_injection_enqueued_seq_seq from anon;
revoke update, usage on sequence files.file_structure_id_seq from anon;
revoke update, usage on sequence public.app_config_history_id_seq from anon;
revoke update, usage on sequence public.catalog_entries_history_id_seq from anon;
revoke update, usage on sequence users.user_secret_audit_id_seq from anon;
revoke update, usage on sequence workbench.udt_dataset_row_versions_id_seq from anon;

-- ── THE CLASS FIX: the default privileges that re-open this surface on every `create table`.
alter default privileges for role postgres in schema communication revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema files         revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema podcast       revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema public        revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema scheduler     revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema users         revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema workflow      revoke insert, update, delete, maintain on tables from anon;
alter default privileges for role postgres in schema communication revoke update, usage on sequences from anon;
alter default privileges for role postgres in schema files         revoke update, usage on sequences from anon;
alter default privileges for role postgres in schema podcast       revoke update, usage on sequences from anon;
alter default privileges for role postgres in schema public        revoke update, usage on sequences from anon;
alter default privileges for role postgres in schema users         revoke update, usage on sequences from anon;

-- ── THE ASSERTION. A revoke list is a claim; this is the measurement. If any write privilege for
--    `anon` or PUBLIC survives on a relation or sequence in a PostgREST-exposed schema, this file
--    raises and nothing is committed — so the migration cannot report success on a partial sweep.
do $$
declare
  v_rel integer;
  v_seq integer;
  v_def integer;
  v_names text;
begin
  select count(*), string_agg(distinct rel, ', ' order by rel)
    into v_rel, v_names
  from (
    select n.nspname || '.' || c.relname as rel
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(c.relacl) a
    where c.relkind in ('r','p','v','m','f')
      and a.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN')
      and (a.grantee = 0 or pg_get_userbyid(a.grantee) = 'anon')
      and n.nspname = any (array[
        'api','public','graphql_public','rag','scraper','workflow','files','legal','knowledge',
        'agent','ai','app','chat','context','skill','tool','workspace','work','admin','billing',
        'browser','canvas','code','communication','content_ir','crm','dictionary','docproc',
        'education','extend','graveyard','growth','hindsight','history','iam','interview',
        'marketing','meta','ops','pdf','plan','platform','podcast','research','runtime','scheduler',
        'seo','transcripts','ui','users','web','workbench','assignment','audit','batch','mandate',
        'commerce'])
  ) t;
  if v_rel > 0 then
    raise exception
      'dd193: % relation(s) in a PostgREST-exposed schema still grant anon or PUBLIC a write privilege: %. The sweep is incomplete and nothing was committed.',
      v_rel, v_names;
  end if;

  select count(*) into v_seq
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a
  where c.relkind = 'S' and n.nspname <> 'realtime'
    and pg_get_userbyid(a.grantee) = 'anon'
    and a.privilege_type in ('UPDATE','USAGE');
  if v_seq > 0 then
    raise exception 'dd193: % sequence(s) still let anon call nextval/setval. Nothing was committed.', v_seq;
  end if;

  select count(*) into v_def
  from pg_default_acl d
  join pg_namespace n on n.oid = d.defaclnamespace
  cross join lateral aclexplode(d.defaclacl) a
  where d.defaclobjtype in ('r','S')
    and pg_get_userbyid(a.grantee) = 'anon'
    and a.privilege_type in ('INSERT','UPDATE','DELETE','MAINTAIN','USAGE')
    -- Vendor-managed defaults, deliberately out of scope and named rather than swept:
    -- `graphql` / `graphql_public` belong to `supabase_admin` and hold no tables; `storage`
    -- is Supabase's own schema, PostgREST does not expose it, and signed-out uploads to a
    -- public bucket are a real product surface governed by `storage`'s own RLS policies.
    and coalesce(n.nspname, '') not in ('graphql','graphql_public','storage');
  if v_def > 0 then
    raise exception
      'dd193: % default-privilege entr(ies) still grant anon a write on every table or sequence created from now on. That is how this surface re-opens with nobody deciding anything. Nothing was committed.',
      v_def;
  end if;

  raise notice 'dd193: anon holds no INSERT/UPDATE/DELETE/MAINTAIN on any relation in a PostgREST-exposed schema, no sequence write anywhere, and no write default privilege.';
end $$;

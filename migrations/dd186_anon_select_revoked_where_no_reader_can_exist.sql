-- dd186_anon_select_revoked_where_no_reader_can_exist — THE 74 ANON SELECT GRANTS WITH NO ANON POLICY
-- (DD-186. SECURITY. db-rules §0/§6d/§9. No policy is created, altered or dropped by this file —
--  it changes GRANTS only, which is the only layer that can bound a column and the only layer
--  `iam.apply_rls` never touches, so a policy regeneration cannot undo it.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- 284 relations carry a SELECT privilege for the `anon` role. 271 of them sit in a schema
-- PostgREST actually exposes (the server's own list: api, public, graphql_public, rag, scraper,
-- workflow, files, ... commerce), so the published publishable key can address them over HTTPS.
--
-- Of those 271, these 74 have NO permissive SELECT-capable RLS policy that reaches `anon` or
-- PUBLIC at all. Row-level security is enabled on every one of them, so a signed-out reader gets
-- zero rows today — measured relation by relation as the `anon` role in rolled-back transactions.
--
-- THE GRANT IS THE DEFECT, NOT THE ROW COUNT. A table privilege standing beside a closed policy is
-- the safe path next to the unsafe one (DD-181's finding, and the reason this file exists rather
-- than a note saying "zero rows, fine"): the day anyone regenerates a policy set with an `anon`
-- arm, disables RLS for a migration, or adds a `pub_read` to one of these, the grant publishes the
-- whole table in the same instant and no detector asks. The correct bound for a relation whose
-- signed-out reader cannot exist is zero, and it is set here.
--
-- These are not catalogs. Among them: `admin.admins` and `admin.admin_audit_log`,
-- `admin.dev_login_audit`, `extend.extension_auth_codes`, `tool.mcp_user_conn`,
-- `users.user_secret_audit`, `users.user_feedback`, `ops.system_error`, `iam.organizations`,
-- `communication.contact_submissions`, `public.sandbox_instances`.
--
-- WHAT THIS DOES NOT TOUCH. `authenticated` keeps every privilege it holds — grants are per-role,
-- so no signed-in surface changes. SECURITY DEFINER functions run as their owner and never consult
-- the caller's table privileges, so every definer door (the guest-limit RPCs, the share-link
-- resolvers) is unaffected. No policy is created or dropped.
--
-- STILL OPEN, NAMED RATHER THAN SWEPT: 71 of these 74 also carry anon INSERT, UPDATE and DELETE
-- grants from a historical `grant all ... to anon`, equally inert behind the same absent policies.
-- That is the same class on the write axis and belongs to its own row — this file is DD-186, the
-- READ surface, and a lane that silently widened into the write axis would be unreviewable.
-- (`iam.organizations` carries PUBLIC-role UPDATE and DELETE policies — polroles OID 0 — which are
-- a live finding for that row, not for this one.)

revoke select on admin.admin_audit_log from anon;
revoke select on admin.admin_email_logs from anon;
revoke select on admin.admins from anon;
revoke select on admin.dev_login_audit from anon;
revoke select on canvas.canvas_comment_likes from anon;
revoke select on canvas.canvas_comments from anon;
revoke select on canvas.canvas_likes from anon;
revoke select on canvas.canvas_scores from anon;
revoke select on canvas.canvas_views from anon;
revoke select on chat.user_usage_summary from anon;
revoke select on communication.contact_submissions from anon;
revoke select on communication.notification_channel_preference from anon;
revoke select on context.context_access_log from anon;
revoke select on context.context_items from anon;
revoke select on context.scope_types from anon;
revoke select on context.template_context_items from anon;
revoke select on context.template_scope_types from anon;
revoke select on context.templates from anon;
revoke select on context.user_active_context from anon;
revoke select on crm.outreach_acceptance from anon;
revoke select on dictionary.dict_entries from anon;
revoke select on dictionary.dict_provider_publication from anon;
revoke select on dictionary.dict_settings from anon;
revoke select on docproc.derive_runs from anon;
revoke select on docproc.page_extraction_jobs from anon;
revoke select on docproc.page_extraction_page_runs from anon;
revoke select on docproc.processed_documents from anon;
-- the only one of the 74 whose grant is COLUMN-level (32 of 35): a table-level REVOKE does not
-- remove a column grant, so its columns are revoked by name. The assertion below would have
-- raised if this line were missing.
revoke select (id, organization_id, owner_id, source_kind, source_id, parent_processed_id, derivation_kind, derivation_metadata, name, mime_type, total_pages, source_hash, content, clean_content, structured_json, metadata, created_at, updated_at, file_content_hash, extractor_name, extractor_version, cleaner_name, cleaner_version, params_hash, canonical_clean_id, rag_boost, replace_reason, clean_content_completed_at, clean_content_cost_usd, archived_at, archived_reason, deleted_at) on docproc.processed_documents from anon;
revoke select on education.study_source_chunk from anon;
revoke select on education.study_structured_section from anon;
revoke select on extend.extension_auth_codes from anon;
revoke select on files.account_tiers from anon;
revoke select on files.rate_limit_buckets from anon;
revoke select on files.structure from anon;
revoke select on files.user_account from anon;
revoke select on files.user_storage_usage from anon;
revoke select on iam.industry_curators from anon;
revoke select on iam.org_industries from anon;
revoke select on iam.organization_preferences from anon;
revoke select on iam.organizations from anon;
revoke select on iam.system_orgs from anon;
revoke select on legal.wc_impairment_definition from anon;
revoke select on ops.api_field_warnings from anon;
revoke select on ops.api_request_log from anon;
revoke select on ops.app_log_muted_pattern from anon;
revoke select on ops.app_log_norm_exception from anon;
revoke select on ops.ops_issue_class from anon;
revoke select on ops.ops_issue_event from anon;
revoke select on ops.system_error from anon;
revoke select on ops.system_write_failure from anon;
revoke select on platform.mtx_media_heal_queue from anon;
revoke select on platform.mtx_public_url_guard from anon;
revoke select on public.app_instances from anon;
revoke select on public.app_settings from anon;
revoke select on public.app_sync_status from anon;
revoke select on public.infra_status from anon;
revoke select on public.sandbox_instances from anon;
revoke select on rag.kg_suggestion_ack from anon;
revoke select on rag.kg_sweep_state from anon;
revoke select on rag.scope_association_suggestions from anon;
revoke select on rag.scope_item_value_suggestions from anon;
revoke select on scheduler.agent_schedule from anon;
revoke select on scheduler.agent_schedule_claim from anon;
revoke select on tool.mcp_user_conn from anon;
revoke select on transcripts.studio_runs from anon;
revoke select on users.feedback_user_messages from anon;
revoke select on users.user_bookmarks from anon;
revoke select on users.user_email_preferences from anon;
revoke select on users.user_feedback from anon;
revoke select on users.user_preferences from anon;
revoke select on users.user_secret_audit from anon;
revoke select on users.user_stats from anon;
revoke select on users.user_surface_state from anon;
revoke select on workflow.extract_sweep_state from anon;
revoke select on workflow.run_log from anon;

-- ═══ THE ASSERTION — this file refuses to be believed on its own word ══════════════════════════
do $$
declare left_over text;
begin
  select string_agg(rel, ', ' order by rel) into left_over
  from unnest(array['admin.admin_audit_log','admin.admin_email_logs','admin.admins','admin.dev_login_audit','canvas.canvas_comment_likes','canvas.canvas_comments','canvas.canvas_likes','canvas.canvas_scores','canvas.canvas_views','chat.user_usage_summary','communication.contact_submissions','communication.notification_channel_preference','context.context_access_log','context.context_items','context.scope_types','context.template_context_items','context.template_scope_types','context.templates','context.user_active_context','crm.outreach_acceptance','dictionary.dict_entries','dictionary.dict_provider_publication','dictionary.dict_settings','docproc.derive_runs','docproc.page_extraction_jobs','docproc.page_extraction_page_runs','docproc.processed_documents','education.study_source_chunk','education.study_structured_section','extend.extension_auth_codes','files.account_tiers','files.rate_limit_buckets','files.structure','files.user_account','files.user_storage_usage','iam.industry_curators','iam.org_industries','iam.organization_preferences','iam.organizations','iam.system_orgs','legal.wc_impairment_definition','ops.api_field_warnings','ops.api_request_log','ops.app_log_muted_pattern','ops.app_log_norm_exception','ops.ops_issue_class','ops.ops_issue_event','ops.system_error','ops.system_write_failure','platform.mtx_media_heal_queue','platform.mtx_public_url_guard','public.app_instances','public.app_settings','public.app_sync_status','public.infra_status','public.sandbox_instances','rag.kg_suggestion_ack','rag.kg_sweep_state','rag.scope_association_suggestions','rag.scope_item_value_suggestions','scheduler.agent_schedule','scheduler.agent_schedule_claim','tool.mcp_user_conn','transcripts.studio_runs','users.feedback_user_messages','users.user_bookmarks','users.user_email_preferences','users.user_feedback','users.user_preferences','users.user_secret_audit','users.user_stats','users.user_surface_state','workflow.extract_sweep_state','workflow.run_log']) rel
  where has_table_privilege('anon', rel, 'SELECT')
     or exists (select 1 from pg_attribute a
                 where a.attrelid = rel::regclass and a.attnum > 0 and not a.attisdropped
                   and has_column_privilege('anon', a.attrelid, a.attnum, 'SELECT'));
  if left_over is not null then
    raise exception using
      message = 'DD-186: anon still holds a SELECT privilege after the revokes on: ' || left_over,
      hint    = 'A column-level grant survives a table-level REVOKE. Revoke the column grant by name.';
  end if;
end $$;

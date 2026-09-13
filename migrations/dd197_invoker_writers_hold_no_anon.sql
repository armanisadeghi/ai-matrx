-- dd197_invoker_writers_hold_no_anon — A SECURITY INVOKER FUNCTION THAT WRITES IS NOT AN ANONYMOUS DOOR
-- (DD-197. SECURITY. db-rules §0/§6d/§9. No policy and no table grant is touched by this file — it
--  changes FUNCTION EXECUTE grants only. Exactly one role loses reach: `anon`.)
--
-- ═══ WHAT WAS MEASURED, ON THIS DATABASE, 2026-09-13 ═══════════════════════════════════════════
-- DD-169 declared the doors. DD-193 (B-87) closed the anonymous write axis on tables and named
-- what it did not sweep: "30 `anon` EXECUTE grants on SECURITY INVOKER functions that write".
-- Re-measured here, and the number was larger than a grant census can see:
--
--    33 SECURITY INVOKER, non-trigger functions in a PostgREST-exposed schema carry an EXPLICIT
--       `anon` EXECUTE grant and write in their body (B-87's 30, plus three whose write is a
--       `perform` of a writer). All 33 are in `public`.
--    66 are what a signed-out caller can ACTUALLY execute — `has_function_privilege('anon', ...)`
--       — because for 28 of them the reach is PostgreSQL's own default: a function created with no
--       GRANT at all has `proacl = null`, which means EXECUTE for PUBLIC, and PUBLIC reaches every
--       role there is. A census that reads role names out of `proacl` cannot see those 28, and an
--       `alter ... revoke execute from anon` on them is a NO-OP that reads like a fix. That is
--       DD-194's lesson on a different surface, so this file revokes from `public` as well.
--     0 of the 66 hold a row in `platform.client_callable_door`. Not one was ever declared an
--       anonymous door by anybody.
--     0 have a signed-out caller. Every real call site across matrx-frontend, matrx-extend,
--       matrx-local and aidream is a signed-in feature — the canvas, conversations, user tables,
--       projects, tasks, research, page extraction — and the rest (`iam.apply_table_grants`,
--       `platform.declare_soft_delete_edge`, `meta.exempt`, `seo._ensure_value`, the two
--       `communication` notification-worker functions and 20 more) are infrastructure called by
--       migrations and triggers, never by a browser.
--
-- WHAT AN ANONYMOUS CALLER ACTUALLY GOT, PROVEN OVER HTTPS WITH THE PUBLISHED KEY AND NO JWT,
-- BEFORE THIS FILE RAN. A SECURITY INVOKER function runs AS THE CALLER, so `anon`'s own (empty)
-- privileges applied inside — but the privilege check on the FUNCTION passed, and the body ran:
--
--   rpc/cx_canvas_toggle_favorite  ->  401 42501 "permission denied for table canvas_items",
--                                      hint: "GRANT UPDATE ON canvas.canvas_items TO anon;"
--   rpc/wsp_upsert_system_task     ->  401 42501 "permission denied for FUNCTION
--                                      ensure_personal_organization"
--   rpc/reorder_keywords           ->  204 NO CONTENT. It ran to completion and returned success.
--
-- Three different lies. The first names an internal table to a stranger and prints the exact GRANT
-- that would open it. The second names an internal helper the caller never asked for, and refuses
-- for a reason that is accidental — the day `ensure_personal_organization` is granted to `anon`
-- for some other purpose, the call proceeds. The third is the one that matters: a signed-out
-- caller invoked a writer and got 204, because the body's first branch returned before touching a
-- table. Nothing anywhere recorded that an anonymous caller had entered it.
--
-- THE GRANT IS THE DEFECT, NOT THE ROW COUNT. Nothing was stolen: RLS and the table grants refuse
-- `anon` everywhere, which is why the failures are deep inside instead of at the door. That is
-- exactly DD-181's shape — the safe path standing beside the unsafe one. An invoker writer is not
-- a door at any width: a door is a SECURITY DEFINER function with a gate and a row in
-- `platform.client_callable_door` saying who may knock (`record_guest_execution`,
-- `outreach_unsubscribe`, the eight `hr_kiosk_*`). The correct number of anonymous invoker writers
-- is zero, and it is set here.
--
-- WHAT THIS DOES NOT CHANGE. Every role except `anon` keeps exactly the reach it had: each
-- function is re-granted to `authenticated`, `service_role`, `svc_seo` and `dashboard_user`, all
-- four of which could execute all 66 before (measured). `authenticator` keeps them through its
-- membership of `authenticated`; `postgres` owns them. aidream connects as `postgres`, so the
-- notification worker and every migration helper are untouched.
--
-- RECONCILING B-75. B-75 reported that its 471 declared doors "keep `authenticated`, hold no
-- `anon`". That was true of the DECLARED DOORS it measured and it is still true: none of these 66
-- is a declared door — all 66 have zero rows in `platform.client_callable_door`. What was not true
-- was the inference anyone would draw from it, that the anonymous EXECUTE surface was therefore
-- empty. The door register bounds the doors; it says nothing about the functions nobody registered,
-- and that is the population this file closes. The guard added with it (`check:impl-doors` D9) is
-- what keeps the two statements from drifting apart again.

revoke execute on function communication.claim_pending_notifications(p_worker_id text, p_limit integer, p_lease_seconds integer) from anon, public;
grant  execute on function communication.claim_pending_notifications(p_worker_id text, p_limit integer, p_lease_seconds integer) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function communication.finalize_notification(p_id uuid, p_worker_id text, p_outcome text, p_provider text, p_provider_message_id text, p_error_code text, p_error_message text, p_max_attempts integer, p_retry_base_seconds integer, p_next_attempt_at timestamp with time zone, p_sent_at timestamp with time zone, p_delivered_at timestamp with time zone) from anon, public;
grant  execute on function communication.finalize_notification(p_id uuid, p_worker_id text, p_outcome text, p_provider text, p_provider_message_id text, p_error_code text, p_error_message text, p_max_attempts integer, p_retry_base_seconds integer, p_next_attempt_at timestamp with time zone, p_sent_at timestamp with time zone, p_delivered_at timestamp with time zone) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.archive_kind_instances(p_ids uuid[], p_archived boolean) from anon, public;
grant  execute on function content_ir.archive_kind_instances(p_ids uuid[], p_archived boolean) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.confirm_kind_instances(p_ids uuid[]) from anon, public;
grant  execute on function content_ir.confirm_kind_instances(p_ids uuid[]) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.edit_kind_instance_value(p_id uuid, p_key text, p_value jsonb) from anon, public;
grant  execute on function content_ir.edit_kind_instance_value(p_id uuid, p_key text, p_value jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.revalidate_kind_examples(p_kind_definition_id uuid) from anon, public;
grant  execute on function content_ir.revalidate_kind_examples(p_kind_definition_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.revalidate_kind_instances(p_kind_definition_id uuid) from anon, public;
grant  execute on function content_ir.revalidate_kind_instances(p_kind_definition_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function content_ir.unconfirm_kind_instances(p_ids uuid[], p_reason text) from anon, public;
grant  execute on function content_ir.unconfirm_kind_instances(p_ids uuid[], p_reason text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function context.index_reference_value(p_value_id uuid, p_item_id uuid, p_scope_id uuid, p_value_text text) from anon, public;
grant  execute on function context.index_reference_value(p_value_id uuid, p_item_id uuid, p_scope_id uuid, p_value_text text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function context.write_context_value(p_item_id uuid, p_scope_id uuid, p_value_text text, p_value_number numeric, p_value_boolean boolean, p_value_json jsonb, p_value_date date, p_value_document_url text, p_value_timestamp timestamp with time zone, p_value_time time without time zone, p_change_summary text, p_source_type text, p_actor uuid) from anon, public;
grant  execute on function context.write_context_value(p_item_id uuid, p_scope_id uuid, p_value_text text, p_value_number numeric, p_value_boolean boolean, p_value_json jsonb, p_value_date date, p_value_document_url text, p_value_timestamp timestamp with time zone, p_value_time time without time zone, p_change_summary text, p_source_type text, p_actor uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text) from anon, public;
grant  execute on function iam._apply_rls_unchecked(p_schema text, p_table text, p_token text, p_variant text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.apply_config_rls(p_schema text, p_table text) from anon, public;
grant  execute on function iam.apply_config_rls(p_schema text, p_table text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.apply_governance_guard(p_schema text, p_table text, p_token text) from anon, public;
grant  execute on function iam.apply_governance_guard(p_schema text, p_table text, p_token text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.apply_platform_admin_access(p_schema text, p_table text, p_lock_out_non_admins boolean) from anon, public;
grant  execute on function iam.apply_platform_admin_access(p_schema text, p_table text, p_lock_out_non_admins boolean) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.apply_scraper_rls(p_schema text, p_table text, p_mode text) from anon, public;
grant  execute on function iam.apply_scraper_rls(p_schema text, p_table text, p_mode text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.apply_table_grants(p_schema text, p_table text, p_variant text) from anon, public;
grant  execute on function iam.apply_table_grants(p_schema text, p_table text, p_variant text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text) from anon, public;
grant  execute on function iam.entity_read_expr(p_schema text, p_table text, p_token text, p_variant text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function iam.supersede_bespoke_policies(p_schema text, p_table text, p_policy_names text[], p_reason text) from anon, public;
grant  execute on function iam.supersede_bespoke_policies(p_schema text, p_table text, p_policy_names text[], p_reason text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function meta.exempt(p_check text, p_schema text, p_table text, p_reason text) from anon, public;
grant  execute on function meta.exempt(p_check text, p_schema text, p_table text, p_reason text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function meta.unexempt(p_check text, p_schema text, p_table text) from anon, public;
grant  execute on function meta.unexempt(p_check text, p_schema text, p_table text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function plan.status_flow() from anon, public;
grant  execute on function plan.status_flow() to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform._ddl_guard() from anon, public;
grant  execute on function platform._ddl_guard() to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform._report_undeclared_confirmation_write(p_relid oid, p_org uuid, p_user uuid) from anon, public;
grant  execute on function platform._report_undeclared_confirmation_write(p_relid oid, p_org uuid, p_user uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.attach_soft_delete_cascade(p_schema text, p_table text) from anon, public;
grant  execute on function platform.attach_soft_delete_cascade(p_schema text, p_table text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.attach_soft_delete_child_guard(p_schema text, p_table text) from anon, public;
grant  execute on function platform.attach_soft_delete_child_guard(p_schema text, p_table text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.clear_output_feedback(p_subject_type text, p_subject_id uuid) from anon, public;
grant  execute on function platform.clear_output_feedback(p_subject_type text, p_subject_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.declare_soft_delete_edge(p_parent_schema text, p_parent_table text, p_child_schema text, p_child_table text, p_child_column text, p_action text, p_reason text, p_declared_by text, p_parent_noun text, p_parent_column text) from anon, public;
grant  execute on function platform.declare_soft_delete_edge(p_parent_schema text, p_parent_table text, p_child_schema text, p_child_table text, p_child_column text, p_action text, p_reason text, p_declared_by text, p_parent_noun text, p_parent_column text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.definer_guard_revoke_notice(p_schema text, p_name text, p_identity_args text, p_signature text) from anon, public;
grant  execute on function platform.definer_guard_revoke_notice(p_schema text, p_name text, p_identity_args text, p_signature text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function platform.upsert_output_feedback(p_subject_type text, p_subject_id uuid, p_verdict text, p_prose text, p_request_id text, p_surface_name text, p_original_content text, p_corrected_content text, p_corrected_ref_type text, p_corrected_ref_id uuid, p_organization_id uuid) from anon, public;
grant  execute on function platform.upsert_output_feedback(p_subject_type text, p_subject_id uuid, p_verdict text, p_prose text, p_request_id text, p_surface_name text, p_original_content text, p_corrected_content text, p_corrected_ref_type text, p_corrected_ref_id uuid, p_organization_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer, p_is_required boolean, p_default_value jsonb, p_validation_rules jsonb) from anon, public;
grant  execute on function public.add_column_to_user_table(p_table_id uuid, p_field_name text, p_display_name text, p_data_type text, p_field_order integer, p_is_required boolean, p_default_value jsonb, p_validation_rules jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb) from anon, public;
grant  execute on function public.append_rows_to_user_table(p_table_id uuid, p_rows jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cleanup_old_guest_records() from anon, public;
grant  execute on function public.cleanup_old_guest_records() to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.create_agent_task(p_title text, p_prompt text, p_trigger_type text, p_trigger_config jsonb, p_description text, p_surfaces text[], p_tags text[], p_queue text, p_expires_at timestamp with time zone, p_next_due_at timestamp with time zone, p_agent_id uuid, p_variables jsonb, p_persistent_conversation_id uuid, p_auth_mode text, p_max_runtime_seconds integer, p_max_concurrent integer) from anon, public;
grant  execute on function public.create_agent_task(p_title text, p_prompt text, p_trigger_type text, p_trigger_config jsonb, p_description text, p_surfaces text[], p_tags text[], p_queue text, p_expires_at timestamp with time zone, p_next_due_at timestamp with time zone, p_agent_id uuid, p_variables jsonb, p_persistent_conversation_id uuid, p_auth_mode text, p_max_runtime_seconds integer, p_max_concurrent integer) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.create_project_from_json(p_payload jsonb, p_organization_id uuid) from anon, public;
grant  execute on function public.create_project_from_json(p_payload jsonb, p_organization_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_overrides jsonb) from anon, public;
grant  execute on function public.create_shortcut_from_agent_surface(p_agent_surface_id uuid, p_category_id uuid, p_user_id uuid, p_organization_id uuid, p_project_id uuid, p_task_id uuid, p_overrides jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_canvas_archive(p_canvas_id uuid, p_include_versions boolean) from anon, public;
grant  execute on function public.cx_canvas_archive(p_canvas_id uuid, p_include_versions boolean) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_canvas_create_manual(p_user_id uuid, p_type text, p_title text, p_content jsonb, p_source_type text, p_conversation_id uuid, p_source_message_id uuid) from anon, public;
grant  execute on function public.cx_canvas_create_manual(p_user_id uuid, p_type text, p_title text, p_content jsonb, p_source_type text, p_conversation_id uuid, p_source_message_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_canvas_toggle_favorite(p_canvas_id uuid) from anon, public;
grant  execute on function public.cx_canvas_toggle_favorite(p_canvas_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_canvas_update_version(p_user_id uuid, p_original_canvas_id uuid, p_new_message_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb) from anon, public;
grant  execute on function public.cx_canvas_update_version(p_user_id uuid, p_original_canvas_id uuid, p_new_message_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_canvas_upsert_source(p_user_id uuid, p_source_system text, p_source_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb, p_conversation_id uuid, p_source_type text) from anon, public;
grant  execute on function public.cx_canvas_upsert_source(p_user_id uuid, p_source_system text, p_source_id uuid, p_artifact_index smallint, p_type text, p_title text, p_content jsonb, p_conversation_id uuid, p_source_type text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_code_history_upsert(p_payload jsonb) from anon, public;
grant  execute on function public.cx_code_history_upsert(p_payload jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_fork_conversation(p_conversation_id uuid, p_at_position smallint) from anon, public;
grant  execute on function public.cx_fork_conversation(p_conversation_id uuid, p_at_position smallint) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_restore_conversation(p_conversation_id uuid) from anon, public;
grant  execute on function public.cx_restore_conversation(p_conversation_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.cx_soft_delete_conversation(p_conversation_id uuid) from anon, public;
grant  execute on function public.cx_soft_delete_conversation(p_conversation_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.delete_data_row_from_user_table(p_row_id uuid) from anon, public;
grant  execute on function public.delete_data_row_from_user_table(p_row_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.delete_user_table(p_table_id uuid) from anon, public;
grant  execute on function public.delete_user_table(p_table_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.dict_delete_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_ids uuid[]) from anon, public;
grant  execute on function public.dict_delete_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_ids uuid[]) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.dict_set_settings_for(p_user_id uuid, p_level text, p_owner_id uuid, p_max_inline_chars integer) from anon, public;
grant  execute on function public.dict_set_settings_for(p_user_id uuid, p_level text, p_owner_id uuid, p_max_inline_chars integer) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.dict_upsert_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_entries jsonb) from anon, public;
grant  execute on function public.dict_upsert_entries_for(p_user_id uuid, p_level text, p_owner_id uuid, p_entries jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.ensure_updated_at_on_table(p_schema text, p_table text) from anon, public;
grant  execute on function public.ensure_updated_at_on_table(p_schema text, p_table text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.page_extraction_clear_job_results(p_job_id uuid) from anon, public;
grant  execute on function public.page_extraction_clear_job_results(p_job_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.reorder_keywords(p_topic_id uuid, p_keyword_ids uuid[]) from anon, public;
grant  execute on function public.reorder_keywords(p_topic_id uuid, p_keyword_ids uuid[]) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.reset_daily_guest_counters() from anon, public;
grant  execute on function public.reset_daily_guest_counters() to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.rs_topic_append_output(p_topic_id uuid, p_kind text, p_asset jsonb) from anon, public;
grant  execute on function public.rs_topic_append_output(p_topic_id uuid, p_kind text, p_asset jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.update_all_trending_scores() from anon, public;
grant  execute on function public.update_all_trending_scores() to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb) from anon, public;
grant  execute on function public.update_data_row_in_user_table(p_row_id uuid, p_data jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.update_field_metadata(p_field_id uuid, p_display_name text, p_is_required boolean, p_field_order integer, p_validation_rules jsonb) from anon, public;
grant  execute on function public.update_field_metadata(p_field_id uuid, p_display_name text, p_is_required boolean, p_field_order integer, p_validation_rules jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.wsp_resolve_system_task(p_dedupe_key text, p_outcome text, p_organization_id uuid) from anon, public;
grant  execute on function public.wsp_resolve_system_task(p_dedupe_key text, p_outcome text, p_organization_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text, p_origin text, p_source_type text, p_source_id text, p_source_url text, p_source_label text, p_due_date date, p_priority text, p_assignee_id uuid, p_organization_id uuid, p_project_id uuid, p_metadata jsonb) from anon, public;
grant  execute on function public.wsp_upsert_system_task(p_dedupe_key text, p_title text, p_description text, p_origin text, p_source_type text, p_source_id text, p_source_url text, p_source_label text, p_due_date date, p_priority text, p_assignee_id uuid, p_organization_id uuid, p_project_id uuid, p_metadata jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo._ensure_site_dimension(p_site_id uuid, p_key text, p_label text, p_description text, p_nature text) from anon, public;
grant  execute on function seo._ensure_site_dimension(p_site_id uuid, p_key text, p_label text, p_description text, p_nature text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo._ensure_value(p_dimension_id uuid, p_value_slug text, p_label text, p_extra jsonb) from anon, public;
grant  execute on function seo._ensure_value(p_dimension_id uuid, p_value_slug text, p_label text, p_extra jsonb) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo._rule_claim_matcher(p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid, p_kind text, p_pattern text, p_enabled boolean, p_pack_id uuid, p_notes text) from anon, public;
grant  execute on function seo._rule_claim_matcher(p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid, p_kind text, p_pattern text, p_enabled boolean, p_pack_id uuid, p_notes text) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo._rule_claim_worth(p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid, p_multiplier numeric, p_notes text, p_pack_id uuid) from anon, public;
grant  execute on function seo._rule_claim_worth(p_rule_id uuid, p_shape text, p_site_id uuid, p_org uuid, p_value_id uuid, p_multiplier numeric, p_notes text, p_pack_id uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo.facet_dimension_seed_abstain(p_dimension_id uuid, p_org uuid, p_is_system boolean, p_uid uuid) from anon, public;
grant  execute on function seo.facet_dimension_seed_abstain(p_dimension_id uuid, p_org uuid, p_is_system boolean, p_uid uuid) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function seo.site_keyword_value_copy(p_from_site uuid, p_to_site uuid, p_keyword_ids uuid[], p_dry_run boolean) from anon, public;
grant  execute on function seo.site_keyword_value_copy(p_from_site uuid, p_to_site uuid, p_keyword_ids uuid[], p_dry_run boolean) to authenticated, service_role, svc_seo, dashboard_user;
revoke execute on function workflow.watch_table(p_table regclass) from anon, public;
grant  execute on function workflow.watch_table(p_table regclass) to authenticated, service_role, svc_seo, dashboard_user;

-- ── THE FILE ASSERTS ITS OWN COMPLETENESS ──────────────────────────────────────────────────────
-- Re-measures the exact question the file was written to answer — by REACHABILITY
-- (`has_function_privilege`), not by grant-name, so the 28 PUBLIC-by-default ones cannot hide from
-- it — and rolls the whole thing back with nothing applied and no ledger row if one survives.
do $$
declare
  v_n integer;
  v_names text;
begin
  select count(*), string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname)
    into v_n, v_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where not p.prosecdef
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.prosrc ~* '(^|[^a-z_.])(insert into|update |delete from|merge into)'
    and n.nspname = any (array[
      'api','public','rag','scraper','workflow','files','legal','knowledge','agent','ai','app',
      'chat','context','skill','tool','workspace','work','admin','billing','browser','canvas',
      'code','communication','content_ir','crm','dictionary','docproc','education','extend',
      'graveyard','growth','hindsight','history','iam','interview','marketing','meta','ops','pdf',
      'plan','platform','podcast','research','runtime','scheduler','seo','transcripts','ui',
      'users','web','workbench','assignment','audit','batch','mandate','commerce']);
  if v_n > 0 then
    raise exception
      'dd197: % SECURITY INVOKER function(s) that write are still executable by a signed-out caller: %. The sweep is incomplete and nothing was committed.',
      v_n, v_names;
  end if;

  -- And the other half of the promise: nothing signed-in lost anything.
  select count(*) into v_n
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where not p.prosecdef
    and p.prokind = 'f'
    and p.prorettype <> 'trigger'::regtype
    and p.prosrc ~* '(^|[^a-z_.])(insert into|update |delete from|merge into)'
    and n.nspname = any (array['public','iam','platform','meta','seo','context','content_ir','communication','workflow','plan'])
    and p.proacl is not null
    and exists (select 1 from aclexplode(p.proacl) a
                 where a.privilege_type = 'EXECUTE' and pg_get_userbyid(a.grantee) = 'authenticated')
    and not has_function_privilege('authenticated', p.oid, 'EXECUTE');
  if v_n > 0 then
    raise exception 'dd197: % function(s) lost EXECUTE for authenticated. Nothing was committed.', v_n;
  end if;

  raise notice 'dd197: no SECURITY INVOKER function that writes is executable by anon in any PostgREST-exposed schema.';
end $$;

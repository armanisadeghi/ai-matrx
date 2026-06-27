-- migrate: skip: recovery artifact — only apply if a dropped shim view broke an external consumer
-- ROLLBACK for shim_view_drop_transition_batch (dropped 2026-06-26).
-- These 23 compat shim views are one-line security_invoker pass-throughs to the relocated
-- base tables. If dropping any of them breaks an external consumer (aidream raw SQL / PostgREST),
-- re-run JUST the affected CREATE VIEW below to restore it instantly. Base tables are unchanged.
-- NOTE: the 3 ai_* views were intentionally HELD (not dropped) pending aidream model-registry
-- confirmation; their DDL is included here only for completeness.

CREATE VIEW public.ai_endpoint WITH (security_invoker=true) AS  SELECT id, name, provider, description, additional_cost, cost_details, params FROM ai.endpoint;

CREATE VIEW public.ai_model WITH (security_invoker=true) AS  SELECT id, name, common_name, model_class, provider, endpoints, context_window, max_tokens, capabilities, controls, model_provider, is_deprecated, is_primary, is_premium, api_class, pricing, constraints, mid_fallback_id, guest_fallback_id, capabilities_pre_canonical FROM ai.model;

CREATE VIEW public.ai_provider WITH (security_invoker=true) AS  SELECT id, name, company_description, documentation_link, models_link, provider_models_cache FROM ai.provider;

CREATE VIEW public.ctx_context_access_log WITH (security_invoker=true) AS  SELECT id, context_item_id, value_id, value_version, user_id, agent_id, request_id, app_source, char_count_served, fetch_reason, was_useful, latency_ms, accessed_at FROM context.context_access_log;

CREATE VIEW public.ctx_context_item_values WITH (security_invoker=true) AS  SELECT id, context_item_id, version, is_current, value_text, value_number, value_boolean, value_json, value_document_url, value_document_size_bytes, value_reference_id, value_reference_type, char_count, data_point_count, has_nested_objects, source_type, authored_by, change_summary, created_at, scope_id, value_date FROM context.context_item_values;

CREATE VIEW public.ctx_context_items WITH (security_invoker=true) AS  SELECT id, key, display_name, description, category, tags, status, status_note, status_updated_at, status_updated_by, value_type, fetch_hint, sensitivity, last_verified_at, review_interval_days, next_review_at, source_type, depends_on, template_item_key, is_active, created_by, created_at, updated_at, scope_type_id, slug, sort_order, custom_component, feed_type, feed_config, last_fed_at, feed_status, feed_error, refresh_task_id FROM context.context_items;

CREATE VIEW public.ctx_projects WITH (security_invoker=true) AS  SELECT id, name, description, created_at, updated_at, created_by, organization_id, slug, settings, status, priority, start_date, target_date FROM workspace.projects;

CREATE VIEW public.ctx_scope_types WITH (security_invoker=true) AS  SELECT id, organization_id, parent_type_id, label_singular, label_plural, icon, description, color, sort_order, max_assignments_per_entity, default_variable_keys, created_at, updated_at, slug, is_system FROM context.scope_types;

CREATE VIEW public.ctx_scopes WITH (security_invoker=true) AS  SELECT id, organization_id, scope_type_id, parent_scope_id, name, description, settings, created_by, created_at, updated_at, slug, sort_order FROM context.scopes;

CREATE VIEW public.ctx_tasks WITH (security_invoker=true) AS  SELECT id, title, description, project_id, status, due_date, created_at, updated_at, user_id, parent_task_id, priority, assignee_id, settings, is_public, organization_id, created_by, visibility, version, deleted_at FROM workspace.tasks;

CREATE VIEW public.ctx_template_context_items WITH (security_invoker=true) AS  SELECT id, template_scope_type_id, key, display_name, description, value_type, sort_order FROM context.template_context_items;

CREATE VIEW public.ctx_template_scope_types WITH (security_invoker=true) AS  SELECT id, template_id, key, label_singular, label_plural, icon, description, sort_order, max_assignments_per_entity, parent_template_type_id FROM context.template_scope_types;

CREATE VIEW public.ctx_templates WITH (security_invoker=true) AS  SELECT id, key, name, description, category, icon, sort_order, is_personal, is_active, created_at, updated_at FROM context.templates;

CREATE VIEW public.ctx_user_active_context WITH (security_invoker=true) AS  SELECT user_id, organization_id, project_id, task_id, active_entity_type, active_entity_id, app_source, last_activity, updated_at FROM context.user_active_context;

CREATE VIEW public.file_analysis WITH (security_invoker=true) AS  SELECT file_id, owner_id, mime_type, status, analyzer_version, detectors_run, progress, classification, page_count, summary_counts, text_source_map, thumbnail_url, metadata, started_at, completed_at, updated_at FROM files.analysis;

CREATE VIEW public.file_analysis_result WITH (security_invoker=true) AS  SELECT id, file_id, detector_kind, detector_version, confidence_tier, status, text_sources, elapsed_ms, summary, payload, payload_uri, payload_bytes, error, created_at, page_id FROM files.analysis_result;

CREATE VIEW public.file_entities WITH (security_invoker=true) AS  SELECT id, file_id, owner_id, label, label_category, canonical_value, normalized_value, source_annotation_id, is_user_named, created_at, updated_at FROM files.entities;

CREATE VIEW public.file_overrides WITH (security_invoker=true) AS  SELECT id, file_id, owner_id, page_id, override_kind, override_value, notes, created_by, created_at, updated_at FROM files.overrides;

CREATE VIEW public.file_page_annotations WITH (security_invoker=true) AS  SELECT id, file_id, owner_id, page_number, bbox, label, label_category, extracted_text, extracted_text_source, normalized_value, source, status, redact, notes, parent_result_id, redaction_span_id, created_by, last_edited_by, created_at, updated_at, page_id, is_user_locked, entity_id FROM files.page_annotations;

CREATE VIEW public.file_pages WITH (security_invoker=true) AS  SELECT id, file_id, owner_id, page_index, source_page_index, status, excluded_reason, excluded_at, excluded_by, user_modified, width_pt, height_pt, rotation, text_source, ocr_confidence, thumbnail_url, metadata, created_at, updated_at, processed_document_page_id FROM files.pages;

CREATE VIEW public.file_structure WITH (security_invoker=true) AS  SELECT id, bucket_id, path, is_folder, file_id, parent_path, name, metadata, created_at, updated_at FROM files.structure;

CREATE VIEW public.wr_sessions WITH (security_invoker=true) AS  SELECT id, organization_id, title, description, icon, color, active_thread_id, last_opened_at, created_at, updated_at, anchor_type, anchor_id, created_by, updated_by, version, visibility, deleted_at FROM workspace.war_rooms;

CREATE VIEW public.wr_threads WITH (security_invoker=true) AS  SELECT id, active_tab, "position", title, created_at, updated_at, anchor_type, anchor_id, organization_id, created_by, updated_by, version, visibility, deleted_at FROM workspace.threads;

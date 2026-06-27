-- Drop the transition compat shim views in public (one-line security_invoker pass-throughs
-- to the relocated base tables). Applied 2026-06-26 after verifying live: 0 DB functions
-- reference them, 0 views depend on them, FE has 0 live queries, cx_* shims already dropped.
-- Rollback (recovery only): migrations/ROLLBACK_compat_shim_views.sql
-- Note: ai_endpoint / ai_model / ai_provider were dropped separately by a concurrent
-- changeover agent; their rollback DDL is also in the ROLLBACK file.
DROP VIEW IF EXISTS public.ctx_context_access_log;
DROP VIEW IF EXISTS public.ctx_context_item_values;
DROP VIEW IF EXISTS public.ctx_context_items;
DROP VIEW IF EXISTS public.ctx_projects;
DROP VIEW IF EXISTS public.ctx_scope_types;
DROP VIEW IF EXISTS public.ctx_scopes;
DROP VIEW IF EXISTS public.ctx_tasks;
DROP VIEW IF EXISTS public.ctx_template_context_items;
DROP VIEW IF EXISTS public.ctx_template_scope_types;
DROP VIEW IF EXISTS public.ctx_templates;
DROP VIEW IF EXISTS public.ctx_user_active_context;
DROP VIEW IF EXISTS public.wr_sessions;
DROP VIEW IF EXISTS public.wr_threads;
DROP VIEW IF EXISTS public.file_analysis;
DROP VIEW IF EXISTS public.file_analysis_result;
DROP VIEW IF EXISTS public.file_entities;
DROP VIEW IF EXISTS public.file_overrides;
DROP VIEW IF EXISTS public.file_page_annotations;
DROP VIEW IF EXISTS public.file_pages;
DROP VIEW IF EXISTS public.file_structure;

-- platform_entity_types_app_tokens.sql
-- Register the app's three first-class entity types in the authoritative
-- registry `platform.entity_types`, so the single TS vocabulary
-- (`EntityType` in features/scopes/types.ts) mirrors the registry 1:1.
--
-- Context: features/scopes/types.ts collapsed the divergent
-- `ScopeAssignmentEntityType` union into the canonical `EntityType`. Three app
-- entity types were tagged via `ctx_scope_assignments.entity_type` (a free-text
-- column with no CHECK) but were never present in the registry:
--   agent_app             -> public.aga_apps          (AgentAppHierarchyCascade)
--   agent_surface_binding -> public.agx_agent_surface  (AgentSurfacesPanel)
--   page_extraction_job   -> public.page_extraction_jobs (page-extraction data-review)
-- The dead tokens `agent_shortcut` and `project_resource` were dropped from the
-- union (zero callsites) and are intentionally NOT registered.
--
-- The behavioural flags (base_tier / is_versioned / has_soft_delete) are set to
-- the best-known table semantics; aga_apps is versioned + soft-deleted, the
-- binding/job rows are not. Adjust if a table's semantics differ.
--
-- Idempotent: ON CONFLICT (token) DO NOTHING. Safe to re-apply.

insert into platform.entity_types
    (token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes)
values
    ('agent_app', 'public', 'aga_apps', 'Agent App',
     1, true, true, true,
     'Packaged agent experience. Scope-taggable via ctx_scope_assignments (features/agent-apps AgentAppHierarchyCascade).'),
    ('agent_surface_binding', 'public', 'agx_agent_surface', 'Agent Surface Binding',
     1, false, false, true,
     'Agent-to-surface binding row (hard-deleted). Scope-taggable via ctx_scope_assignments (features/surfaces AgentSurfacesPanel).'),
    ('page_extraction_job', 'public', 'page_extraction_jobs', 'Extraction Dataset',
     1, false, false, true,
     'Page-extraction dataset (one page_extraction_jobs row). Scope-taggable via ctx_scope_assignments (features/page-extraction data-review).')
on conflict (token) do nothing;

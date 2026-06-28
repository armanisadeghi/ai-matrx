-- Migration: move cmp_* cluster from public → agent schema + canonicalize
-- Applied: 2026-06-27 via Supabase MCP (project txzxabzwovsujtloxrus)
-- Tables: cmp_comparison_sets, cmp_comparison_entries, cmp_response_feedback

-- Phase 1: Canonicalize entity tables
-- Backfill created_by from legacy user_id column
UPDATE public.cmp_comparison_sets SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;
UPDATE public.cmp_response_feedback SET created_by = user_id WHERE created_by IS NULL AND user_id IS NOT NULL;

-- Add canonical visibility column
ALTER TABLE public.cmp_comparison_sets ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE public.cmp_response_feedback ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';

-- Drop legacy duplicate touch triggers
DROP TRIGGER IF EXISTS trg_cmp_comparison_sets_touch ON public.cmp_comparison_sets;
DROP TRIGGER IF EXISTS trg_cmp_response_feedback_touch ON public.cmp_response_feedback;

-- Phase 2: Register cmp_entry in entity_types + relationships (must precede apply_rls component call)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_versioned, is_component)
VALUES ('cmp_entry', 'public', 'cmp_comparison_entries', 'Comparison Entry', false, true)
ON CONFLICT (token) DO UPDATE SET
  schema_name  = EXCLUDED.schema_name,
  table_name   = EXCLUDED.table_name,
  label        = EXCLUDED.label,
  is_component = EXCLUDED.is_component;

INSERT INTO platform.entity_relationships (kind, child_type, parent_type, fk_column)
VALUES ('composition', 'cmp_entry', 'comparison_set', 'comparison_set_id')
ON CONFLICT DO NOTHING;

-- Phase 3: Apply canonical RLS
SELECT iam.apply_rls('public', 'cmp_comparison_sets', 'comparison_set', 'entity');
SELECT iam.apply_rls('public', 'cmp_response_feedback', 'cmp_feedback', 'entity');
SELECT iam.apply_rls('public', 'cmp_comparison_entries', 'cmp_entry', 'component');

-- Phase 4: Move all three tables to agent schema
ALTER TABLE public.cmp_comparison_sets SET SCHEMA agent;
ALTER TABLE public.cmp_comparison_entries SET SCHEMA agent;
ALTER TABLE public.cmp_response_feedback SET SCHEMA agent;

-- Phase 5: Update entity_types registry
UPDATE platform.entity_types SET schema_name = 'agent'
WHERE table_name IN ('cmp_comparison_sets', 'cmp_comparison_entries', 'cmp_response_feedback');

-- Phase 6: Register deprecated_relations
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
  ('public.cmp_comparison_sets',    'agent.cmp_comparison_sets',    'schema reorg: cmp cluster → agent schema', now()),
  ('public.cmp_comparison_entries', 'agent.cmp_comparison_entries', 'schema reorg: cmp cluster → agent schema', now()),
  ('public.cmp_response_feedback',  'agent.cmp_response_feedback',  'schema reorg: cmp cluster → agent schema', now())
ON CONFLICT DO NOTHING;

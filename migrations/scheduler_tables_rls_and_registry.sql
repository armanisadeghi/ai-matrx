-- Migration: scheduler_tables_rls_and_registry
-- Register in entity_types, add composition edges, apply canonical RLS, record moves

INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, has_soft_delete, is_active, default_visibility)
SELECT 'sch_task', 'scheduler', 'sch_task', 'Scheduled Task', false, true, true, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'sch_task');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, has_soft_delete, is_active, default_visibility)
SELECT 'sch_trigger', 'scheduler', 'sch_trigger', 'Task Trigger', true, true, true, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'sch_trigger');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, has_soft_delete, is_active, default_visibility)
SELECT 'sch_run', 'scheduler', 'sch_run', 'Task Run', true, false, false, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'sch_run');

INSERT INTO platform.entity_types (token, schema_name, table_name, label, is_component, is_versioned, has_soft_delete, is_active, default_visibility)
SELECT 'sch_agent_task', 'scheduler', 'sch_agent_task', 'Agent Task Config', true, false, false, true, 'private'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token = 'sch_agent_task');

-- Composition edges (required for component RLS variant)
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'sch_trigger', 'sch_task', 'task_id', 'composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type = 'sch_trigger' AND kind = 'composition');

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'sch_run', 'sch_task', 'task_id', 'composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type = 'sch_run' AND kind = 'composition');

INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT 'sch_agent_task', 'sch_task', 'id', 'composition'
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships WHERE child_type = 'sch_agent_task' AND kind = 'composition');

-- Canonical RLS: entity for root, component for children
SELECT iam.apply_rls('scheduler', 'sch_task',       'sch_task',       'entity');
SELECT iam.apply_rls('scheduler', 'sch_trigger',    'sch_trigger',    'component');
SELECT iam.apply_rls('scheduler', 'sch_run',        'sch_run',        'component');
SELECT iam.apply_rls('scheduler', 'sch_agent_task', 'sch_agent_task', 'component');

-- Record moves
INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason, deprecated_at)
VALUES
  ('public.sch_task',       'scheduler.sch_task',       'moved to scheduler schema', now()),
  ('public.sch_trigger',    'scheduler.sch_trigger',    'moved to scheduler schema', now()),
  ('public.sch_run',        'scheduler.sch_run',        'moved to scheduler schema', now()),
  ('public.sch_agent_task', 'scheduler.sch_agent_task', 'moved to scheduler schema', now())
ON CONFLICT (old_ref) DO UPDATE SET new_ref = EXCLUDED.new_ref, reason = EXCLUDED.reason, deprecated_at = EXCLUDED.deprecated_at;

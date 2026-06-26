-- workflow_canonical_remainder.sql
-- ---------------------------------------------------------------------------
-- Finish the workflow.* schema onto the canonical contract (after definition).
-- Roots run/trigger/template -> entity; the 8 children -> component (access
-- defers to their parent run/trigger/definition via the composition edge).
-- Non-breaking: svc_all keeps the Python engine at full access; owner access
-- (created_by = legacy user_id) preserved. Children carry no own owner/visibility.
-- Idempotent.
-- ---------------------------------------------------------------------------

-- ============================ ROOTS (entity) ============================
-- run
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE workflow.run ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
UPDATE workflow.run SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL;

-- trigger
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE workflow.trigger ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
UPDATE workflow.trigger SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL;

-- template (already has created_by; lacks org)
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE workflow.template ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- shared triggers on the roots
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['run','trigger','template'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _stamp_actor ON workflow.%I', r);
    EXECUTE format('CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON workflow.%I FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor()', r);
    EXECUTE format('DROP TRIGGER IF EXISTS _touch_row ON workflow.%I', r);
    EXECUTE format('CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON workflow.%I FOR EACH ROW EXECUTE FUNCTION platform._touch_row()', r);
  END LOOP;
END $$;

-- register roots
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT v.* FROM (VALUES
  ('workflow_run','workflow','run','Workflow Run','private'::platform.visibility,false,true),
  ('workflow_trigger','workflow','trigger','Workflow Trigger','private'::platform.visibility,false,true),
  ('workflow_template','workflow','template','Workflow Template','private'::platform.visibility,false,true)
) AS v(token,schema_name,table_name,label,default_visibility,is_component,is_active)
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = v.token);

SELECT iam.apply_rls('workflow','run','workflow_run','entity');
SELECT iam.apply_rls('workflow','trigger','workflow_trigger','entity');
SELECT iam.apply_rls('workflow','template','workflow_template','entity');

-- ======================= CHILDREN (component) =======================
-- register tokens (is_component=true; no own visibility)
INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT v.* FROM (VALUES
  ('workflow_definition_version','workflow','definition_version','Workflow Definition Version',NULL::platform.visibility,true,true),
  ('workflow_checkpoint','workflow','checkpoint','Workflow Checkpoint',NULL::platform.visibility,true,true),
  ('workflow_job','workflow','job','Workflow Job',NULL::platform.visibility,true,true),
  ('workflow_node_events','workflow','node_events','Workflow Node Events',NULL::platform.visibility,true,true),
  ('workflow_node_outcome','workflow','node_outcome','Workflow Node Outcome',NULL::platform.visibility,true,true),
  ('workflow_recovery_audit','workflow','recovery_audit','Workflow Recovery Audit',NULL::platform.visibility,true,true),
  ('workflow_trigger_fire','workflow','trigger_fire','Workflow Trigger Fire',NULL::platform.visibility,true,true),
  ('workflow_idempotency','workflow','idempotency','Workflow Idempotency',NULL::platform.visibility,true,true)
) AS v(token,schema_name,table_name,label,default_visibility,is_component,is_active)
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types e WHERE e.token = v.token);

-- composition edges (child -> parent via fk)
INSERT INTO platform.entity_relationships (child_type, parent_type, fk_column, kind)
SELECT v.* FROM (VALUES
  ('workflow_definition_version','workflow','definition_id','composition'),
  ('workflow_checkpoint','workflow_run','run_id','composition'),
  ('workflow_job','workflow_run','run_id','composition'),
  ('workflow_node_events','workflow_run','run_id','composition'),
  ('workflow_node_outcome','workflow_run','run_id','composition'),
  ('workflow_recovery_audit','workflow_run','run_id','composition'),
  ('workflow_trigger_fire','workflow_trigger','trigger_id','composition'),
  ('workflow_idempotency','workflow_run','run_id','composition')
) AS v(child_type,parent_type,fk_column,kind)
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_relationships r WHERE r.child_type = v.child_type AND r.kind='composition');

-- generate component RLS (defers to parent)
SELECT iam.apply_rls('workflow','definition_version','workflow_definition_version','component');
SELECT iam.apply_rls('workflow','checkpoint','workflow_checkpoint','component');
SELECT iam.apply_rls('workflow','job','workflow_job','component');
SELECT iam.apply_rls('workflow','node_events','workflow_node_events','component');
SELECT iam.apply_rls('workflow','node_outcome','workflow_node_outcome','component');
SELECT iam.apply_rls('workflow','recovery_audit','workflow_recovery_audit','component');
SELECT iam.apply_rls('workflow','trigger_fire','workflow_trigger_fire','component');
SELECT iam.apply_rls('workflow','idempotency','workflow_idempotency','component');

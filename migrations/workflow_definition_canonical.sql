-- workflow_definition_canonical.sql
-- ---------------------------------------------------------------------------
-- Validation of the canonical-sweep pipeline on a non-public, backend-owned root.
-- Brings workflow.definition onto the canonical contract: additive base columns,
-- backfill owner from legacy user_id + visibility from legacy is_public, shared
-- actor/touch triggers, entity_types registration, and iam.apply_rls. Non-breaking:
-- svc_all keeps the Python execution engine (service role) at full access; owner
-- access (created_by = user_id) is preserved. Legacy user_id/is_public remain
-- (WARN-tracked, dropped later under PITR). Idempotent.
-- ---------------------------------------------------------------------------

ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS created_by uuid;
ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS updated_by uuid;
ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS visibility platform.visibility NOT NULL DEFAULT 'private';
ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE workflow.definition ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE workflow.definition SET created_by = COALESCE(created_by, user_id) WHERE created_by IS NULL;
UPDATE workflow.definition SET visibility = 'public' WHERE is_public IS TRUE AND visibility <> 'public';

DROP TRIGGER IF EXISTS _stamp_actor ON workflow.definition;
CREATE TRIGGER _stamp_actor BEFORE INSERT OR UPDATE ON workflow.definition
  FOR EACH ROW EXECUTE FUNCTION platform._stamp_actor();
DROP TRIGGER IF EXISTS _touch_row ON workflow.definition;
CREATE TRIGGER _touch_row BEFORE INSERT OR UPDATE ON workflow.definition
  FOR EACH ROW EXECUTE FUNCTION platform._touch_row();

INSERT INTO platform.entity_types (token, schema_name, table_name, label, default_visibility, is_component, is_active)
SELECT 'workflow', 'workflow', 'definition', 'Workflow', 'private', false, true
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='workflow');

SELECT iam.apply_rls('workflow', 'definition', 'workflow', 'entity');

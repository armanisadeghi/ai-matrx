-- Generalize agent.mandate_exemplar -> agent.exemplar (agent-level sample/test-case store).
-- Live-traffic rename: a TEMPORARY alias view keeps the old name resolving until the
-- FE release + aidream deploy carry the new name (changeover doctrine §8a-2).
-- NOTE: an event trigger auto-syncs platform.entity_types.table_name on RENAME, so the
-- token change is done as capture -> delete old row -> reinsert under the new token.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='agent' AND table_name='mandate_exemplar' AND table_type='BASE TABLE') THEN
    ALTER TABLE agent.mandate_exemplar RENAME TO exemplar;
  END IF;
END $$;

ALTER TABLE agent.exemplar
  ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agent.definition(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'candidate',
  ADD COLUMN IF NOT EXISTS agent_version integer,
  ADD COLUMN IF NOT EXISTS input_contract_hash text,
  ADD COLUMN IF NOT EXISTS output_contract_hash text,
  ADD COLUMN IF NOT EXISTS source_conversation_id uuid REFERENCES chat.conversation(id) ON DELETE SET NULL;

ALTER TABLE agent.exemplar ALTER COLUMN mandate_id DROP NOT NULL;

ALTER TABLE agent.exemplar DROP CONSTRAINT IF EXISTS mandate_exemplar_source_check;
ALTER TABLE agent.exemplar DROP CONSTRAINT IF EXISTS exemplar_source_check;
ALTER TABLE agent.exemplar ADD CONSTRAINT exemplar_source_check
  CHECK (source = ANY (ARRAY['authored'::text,'captured'::text,'manual'::text,'borrowed'::text]));
ALTER TABLE agent.exemplar DROP CONSTRAINT IF EXISTS exemplar_status_check;
ALTER TABLE agent.exemplar ADD CONSTRAINT exemplar_status_check
  CHECK (status = ANY (ARRAY['candidate'::text,'approved'::text,'archived'::text]));

-- Backfill without version/updated_at churn on 694 rows (data repair, not an edit)
ALTER TABLE agent.exemplar DISABLE TRIGGER _touch_row;
ALTER TABLE agent.exemplar DISABLE TRIGGER _stamp_actor;
ALTER TABLE agent.exemplar DISABLE TRIGGER _version_capture;

UPDATE agent.exemplar e
SET agent_id = COALESCE(e.captured_agent_id, m.default_agent_id)
FROM agent.mandate m
WHERE m.id = e.mandate_id AND e.agent_id IS NULL;

UPDATE agent.exemplar
SET status = CASE WHEN source = 'captured' THEN 'candidate' ELSE 'approved' END
WHERE status = 'candidate' AND source <> 'captured';

ALTER TABLE agent.exemplar ENABLE TRIGGER _touch_row;
ALTER TABLE agent.exemplar ENABLE TRIGGER _stamp_actor;
ALTER TABLE agent.exemplar ENABLE TRIGGER _version_capture;

ALTER TABLE agent.exemplar ALTER COLUMN agent_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS exemplar_agent_status_idx ON agent.exemplar (agent_id, status) WHERE deleted_at IS NULL;

-- Token migration: mandate_exemplar -> agent_exemplar
CREATE TEMP TABLE _et_old ON COMMIT DROP AS
  SELECT * FROM platform.entity_types WHERE token='mandate_exemplar';
CREATE TEMP TABLE _lep_old ON COMMIT DROP AS
  SELECT * FROM platform.lifecycle_entity_plan WHERE entity_token='mandate_exemplar';

DELETE FROM platform.entity_types WHERE token='mandate_exemplar';

INSERT INTO platform.entity_types (
  token, schema_name, table_name, label, base_tier, is_versioned, has_soft_delete, is_active, notes,
  default_visibility, is_listed, is_component, category, is_module, default_members_can_add,
  default_needs_approval, default_scopeable, default_auto_ingest, table_ref, rls_variant,
  reference_pickable, title_column, content_role, reference_category, agent_writable, agent_write_notes,
  allow_preview, version_store, version_store_ref, audit_class, audit_class_reason, governed_columns,
  reference_candidate_predicates, taxonomy_node_id, retention_owner_column, client_excluded_columns,
  user_artifact_kind, lifecycle_enlisted, lifecycle_hot_days, relation_kind, projects_token
)
SELECT
  'agent_exemplar', schema_name, 'exemplar', 'Agent Test Case', base_tier, is_versioned, has_soft_delete, is_active, notes,
  default_visibility, is_listed, is_component, category, is_module, default_members_can_add,
  default_needs_approval, default_scopeable, default_auto_ingest, 'agent.exemplar', rls_variant,
  reference_pickable, title_column, content_role, reference_category, agent_writable, agent_write_notes,
  allow_preview, version_store, version_store_ref, audit_class, audit_class_reason, governed_columns,
  reference_candidate_predicates, taxonomy_node_id, retention_owner_column, client_excluded_columns,
  user_artifact_kind, lifecycle_enlisted, lifecycle_hot_days, relation_kind, projects_token
FROM _et_old
WHERE NOT EXISTS (SELECT 1 FROM platform.entity_types WHERE token='agent_exemplar');

INSERT INTO platform.lifecycle_entity_plan
SELECT (jsonb_populate_record(null::platform.lifecycle_entity_plan,
        to_jsonb(l) || jsonb_build_object('entity_token','agent_exemplar'))).*
FROM _lep_old l;

UPDATE history.row_versions SET entity_type='agent_exemplar' WHERE entity_type='mandate_exemplar';

DROP TRIGGER IF EXISTS _version_capture ON agent.exemplar;
CREATE TRIGGER _version_capture AFTER INSERT OR DELETE OR UPDATE ON agent.exemplar
  FOR EACH ROW EXECUTE FUNCTION platform._version_capture('agent_exemplar');
DROP TRIGGER IF EXISTS _gc_assoc_harddelete ON agent.exemplar;
CREATE TRIGGER _gc_assoc_harddelete AFTER DELETE ON agent.exemplar
  FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('agent_exemplar');
DROP TRIGGER IF EXISTS _gc_assoc_softdelete ON agent.exemplar;
CREATE TRIGGER _gc_assoc_softdelete AFTER UPDATE OF deleted_at ON agent.exemplar
  FOR EACH ROW EXECUTE FUNCTION platform._gc_entity_associations('agent_exemplar');
DROP TRIGGER IF EXISTS _guard_governance ON agent.exemplar;
CREATE TRIGGER _guard_governance BEFORE UPDATE ON agent.exemplar
  FOR EACH ROW EXECUTE FUNCTION iam._guard_governance_columns('agent_exemplar');

-- Canonical RLS under the new token (drops + rebuilds all policies)
SELECT iam.apply_rls('agent','exemplar','agent_exemplar','entity');

-- TEMPORARY alias so deployed code keeps working until FE release + aidream deploy (doctrine §8a-2)
DROP VIEW IF EXISTS agent.mandate_exemplar;
CREATE VIEW agent.mandate_exemplar WITH (security_invoker=on) AS SELECT * FROM agent.exemplar;
GRANT SELECT ON agent.mandate_exemplar TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON agent.mandate_exemplar TO authenticated, service_role;
COMMENT ON VIEW agent.mandate_exemplar IS
  'TEMPORARY live-traffic alias for agent.exemplar (renamed 2026-08-25). Drop once the FE release and aidream deploy reference agent.exemplar.';

INSERT INTO platform.deprecated_relations (old_ref, new_ref, reason)
SELECT 'agent.mandate_exemplar','agent.exemplar','Generalized to agent-level sample/test-case store; temporary alias view until FE+aidream deploys'
WHERE NOT EXISTS (SELECT 1 FROM platform.deprecated_relations WHERE old_ref='agent.mandate_exemplar');

COMMENT ON TABLE agent.exemplar IS
  'Agent test cases / sample inputs. variables + user_input hold the RAW values as entered in the UI or sent programmatically (request.variables) - NEVER the merged conversation snapshot (chat.conversation.variables includes scope/vsc values). agent_id is the subject; mandate_id is optional call-site context. Staleness vs the current contract is DERIVED by comparing input/output_contract_hash to agent.definition head hashes - never stamped.';

NOTIFY pgrst, 'reload schema';

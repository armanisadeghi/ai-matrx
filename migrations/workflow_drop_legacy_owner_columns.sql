-- workflow_drop_legacy_owner_columns.sql
-- ---------------------------------------------------------------------------
-- Finish the workflow canonical migration: created_by/visibility fully replace
-- the legacy user_id/is_public owner columns on the workflow roots.
--
-- Paired with the aidream change (committed): matrx-graph stores
-- (definition/run/trigger_store) now SELECT/INSERT workflow.* with
-- created_by/visibility; _workflow_auth.assert_*_owner compares created_by;
-- db/models_workflow.py dropped the legacy fields. (This also fixed the
-- wf_*->workflow.* rename that had left the raw stores pointing at dead names.)
-- Overrides workflow Operating Priority #7 (user_id) per Arman: created_by is
-- canonical everywhere, workflows included.
--
-- Readers repointed via exact in-SQL substitution (no transcription):
--   iam.can_access_run        r.user_id -> r.created_by
--   public.agx_usage_scan_core w.user_id -> w.created_by  (workflow_node usage)
-- Transition bridge removed. created_by/visibility are populated (backfill +
-- bridge) on all rows. Idempotent-ish (drops guarded by the live state).
-- ---------------------------------------------------------------------------

DO $$
DECLARE src text;
BEGIN
  SELECT pg_get_functiondef('iam.can_access_run'::regproc) INTO src;
  EXECUTE replace(src, 'r.user_id', 'r.created_by');
  SELECT pg_get_functiondef('public.agx_usage_scan_core'::regproc) INTO src;
  EXECUTE replace(src, 'w.user_id', 'w.created_by');
END $$;

DROP TRIGGER IF EXISTS _bridge_legacy_owner ON workflow.definition;
DROP TRIGGER IF EXISTS _bridge_legacy_owner ON workflow.run;
DROP TRIGGER IF EXISTS _bridge_legacy_owner ON workflow.trigger;
DROP FUNCTION IF EXISTS workflow._bridge_legacy_owner();

ALTER TABLE workflow.definition DROP COLUMN IF EXISTS user_id, DROP COLUMN IF EXISTS is_public;
ALTER TABLE workflow.run DROP COLUMN IF EXISTS user_id;
ALTER TABLE workflow.trigger DROP COLUMN IF EXISTS user_id;

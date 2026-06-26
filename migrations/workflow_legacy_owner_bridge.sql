-- workflow_legacy_owner_bridge.sql
-- ---------------------------------------------------------------------------
-- TRANSITION BRIDGE (remove once matrx-graph is repointed + deployed).
-- The matrx-graph engine still writes user_id (NOT NULL) + is_public to the
-- workflow roots, not created_by/visibility, and aidream never sets the
-- app.user_id GUC — so _stamp_actor can't fill created_by on service-role
-- inserts. Without this, an engine-created workflow lands with created_by=NULL
-- and is invisible to its owner under canonical RLS. This keeps the canonical
-- columns in sync from the legacy ones the engine still writes.
--
-- EXIT: when matrx-graph writes created_by/visibility directly and is deployed,
-- drop this trigger+function AND drop workflow.{definition,run,trigger}.user_id
-- and workflow.definition.is_public (and repoint iam.can_access_run /
-- agx_usage_scan_core — see workflow_legacy_reader_repoint.sql).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION workflow._bridge_legacy_owner()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.created_by IS NULL THEN NEW.created_by := NEW.user_id; END IF;
  IF TG_TABLE_NAME = 'definition'
     AND COALESCE(NEW.is_public, false) AND NEW.visibility <> 'public' THEN
    NEW.visibility := 'public';
  END IF;
  RETURN NEW;
END;
$function$;

DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['definition','run','trigger'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS _bridge_legacy_owner ON workflow.%I', r);
    EXECUTE format('CREATE TRIGGER _bridge_legacy_owner BEFORE INSERT OR UPDATE ON workflow.%I FOR EACH ROW EXECUTE FUNCTION workflow._bridge_legacy_owner()', r);
  END LOOP;
END $$;

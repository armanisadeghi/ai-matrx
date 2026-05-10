-- migrations/aga_versions_snapshot_security_definer.sql
--
-- Fix: every authenticated INSERT into public.aga_apps was failing with
--   `new row violates row-level security policy for table "aga_versions"`
-- because the AFTER INSERT trigger (`trg_aga_apps_seed_v1`) and the
-- BEFORE UPDATE trigger (`trg_aga_apps_snapshot_version`) both call into
-- `public.aga_versions`, which has RLS enabled and no INSERT policy for
-- the `authenticated` role (only SELECT for owners/public, ALL for
-- service_role). Symptoms: creating a new app, duplicating an app
-- (POST /api/agent-apps/[id]/duplicate), and editing component_code
-- all 500'd from the server with that RLS message.
--
-- Why SECURITY DEFINER instead of an RLS policy on aga_versions:
--   - aga_versions is server-internal version-history bookkeeping. Users
--     never write to it directly and it has no client-side INSERT path.
--   - Authorization is already enforced on the parent aga_apps INSERT/
--     UPDATE; if the user can mutate the row, the snapshot is implied.
--   - SECURITY DEFINER + locked search_path keeps the function safe
--     against schema-shadowing attacks while side-stepping RLS, exactly
--     what trigger-based audit/version tables need.
--
-- Both functions are owned by `postgres`, which has full access to
-- aga_versions, so no GRANT changes are required.

BEGIN;

-- BEFORE UPDATE on aga_apps: snapshot a new version when tracked fields
-- change. Runs as definer so the INSERT into aga_versions bypasses RLS.
CREATE OR REPLACE FUNCTION public.snapshot_aga_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_next_version integer;
BEGIN
  IF (OLD.component_code    IS DISTINCT FROM NEW.component_code)
  OR (OLD.variable_schema   IS DISTINCT FROM NEW.variable_schema)
  OR (OLD.layout_config     IS DISTINCT FROM NEW.layout_config)
  OR (OLD.styling_config    IS DISTINCT FROM NEW.styling_config)
  OR (OLD.allowed_imports   IS DISTINCT FROM NEW.allowed_imports)
  OR (OLD.agent_version_id  IS DISTINCT FROM NEW.agent_version_id)
  THEN
    SELECT COALESCE(MAX(version_number), 0) + 1
      INTO v_next_version
      FROM public.aga_versions
     WHERE app_id = NEW.id;

    NEW.version := v_next_version;

    INSERT INTO public.aga_versions (
      app_id, version_number, pinned_version,
      agent_id, agent_version_id,
      name, tagline, description, category, tags, status,
      component_code, component_language, allowed_imports,
      variable_schema, layout_config, styling_config
    )
    VALUES (
      NEW.id, v_next_version, NEW.pinned_version,
      NEW.agent_id, NEW.agent_version_id,
      NEW.name, NEW.tagline, NEW.description, NEW.category, NEW.tags, NEW.status,
      NEW.component_code, NEW.component_language, NEW.allowed_imports,
      NEW.variable_schema, NEW.layout_config, NEW.styling_config
    );
  END IF;
  RETURN NEW;
END;
$function$;

-- AFTER INSERT on aga_apps: seed v1.
CREATE OR REPLACE FUNCTION public.snapshot_aga_version_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  INSERT INTO public.aga_versions (
    app_id, version_number, pinned_version,
    agent_id, agent_version_id,
    name, tagline, description, category, tags, status,
    component_code, component_language, allowed_imports,
    variable_schema, layout_config, styling_config
  )
  VALUES (
    NEW.id, 1, NEW.pinned_version,
    NEW.agent_id, NEW.agent_version_id,
    NEW.name, NEW.tagline, NEW.description, NEW.category, NEW.tags, NEW.status,
    NEW.component_code, NEW.component_language, NEW.allowed_imports,
    NEW.variable_schema, NEW.layout_config, NEW.styling_config
  )
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$function$;

COMMIT;

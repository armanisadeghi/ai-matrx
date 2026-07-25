-- Expose the RLS-protected plan schema to browser clients.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: expose_plan_schema_api).
-- Same pattern as supabase/migrations/20260722232238_expose_seo_data_api.sql.
-- Table grants were already set by plan_schema_and_mirror_org_fix.sql
-- (default privileges: CRUD to authenticated/service_role, SELECT to svc_seo).
DO $migration$
DECLARE
  exposed_schemas text;
BEGIN
  SELECT split_part(setting, '=', 2)
    INTO exposed_schemas
  FROM unnest(
    (SELECT rolconfig FROM pg_roles WHERE rolname = 'authenticator')
  ) AS setting
  WHERE setting LIKE 'pgrst.db_schemas=%';

  IF exposed_schemas IS NULL THEN
    RAISE EXCEPTION 'authenticator is missing its pgrst.db_schemas setting';
  END IF;

  IF NOT ('plan' = ANY(string_to_array(replace(exposed_schemas, ' ', ''), ','))) THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET pgrst.db_schemas = %L',
      exposed_schemas || ', plan'
    );
  END IF;
END
$migration$;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

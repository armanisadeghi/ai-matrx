-- Expose the existing RLS-protected SEO schema to authenticated browser clients.
-- Writes remain server-owned; the frontend receives SELECT only.

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

  IF NOT ('seo' = ANY(string_to_array(replace(exposed_schemas, ' ', ''), ','))) THEN
    EXECUTE format(
      'ALTER ROLE authenticator SET pgrst.db_schemas = %L',
      exposed_schemas || ', seo'
    );
  END IF;
END
$migration$;

GRANT USAGE ON SCHEMA seo TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA seo TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE svc_seo IN SCHEMA seo
  GRANT SELECT ON TABLES TO authenticated, service_role;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- associations_service_role_grant.sql
--
-- The super-admin drift-remediation route (app/api/admin/surfaces/
-- remediate-mapping) edits binding value_mappings inside
-- platform.associations.metadata using the SERVER-side admin client
-- (service_role). Browser roles keep ZERO direct grants — all client
-- access stays behind the assoc_* SECURITY DEFINER RPCs and the
-- agent.menu_surface view.
GRANT USAGE ON SCHEMA platform TO service_role;
GRANT SELECT, UPDATE ON platform.associations TO service_role;
NOTIFY pgrst, 'reload schema';

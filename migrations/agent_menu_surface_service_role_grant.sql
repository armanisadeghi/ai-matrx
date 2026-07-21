-- agent_menu_surface_service_role_grant.sql
-- The agent.menu_surface view granted SELECT to anon + authenticated but not
-- service_role, so the admin manifest-sync endpoint (createAdminClient →
-- service_role) failed 42501 when reading agent↔surface bindings for the
-- drift report. Known schema-move grant-gap class.

grant select on agent.menu_surface to service_role;

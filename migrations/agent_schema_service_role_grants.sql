-- Grant service_role access to the agent schema tables.
--
-- Fixes 42501 "permission denied for table review_queue" for supabase-js
-- clients using the service-role key (SUPABASE_SECRET_KEY) on
-- agent.review_queue (select and insert). This is the known schema-move
-- grants-gap class: tables created in the agent schema without the standard
-- service_role table grants. Sweep found the same gap on agent.card (no
-- service_role grants at all) and agent.menu_surface (SELECT only).
-- authenticated/anon grants are deliberately left untouched.
--
-- Idempotent: GRANT is a no-op when the privilege already exists.

grant usage on schema agent to service_role;
grant all on all tables in schema agent to service_role;
grant all on all sequences in schema agent to service_role;

-- Future tables created by postgres in the agent schema get the same grants.
alter default privileges for role postgres in schema agent
  grant all on tables to service_role;
alter default privileges for role postgres in schema agent
  grant all on sequences to service_role;

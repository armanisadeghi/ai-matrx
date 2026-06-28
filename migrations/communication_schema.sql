-- communication schema — new home for messaging/communication tables (sms_*, dm_*, emails).
-- 2026 DB reorg: relocate these out of public into a dedicated `communication` domain schema.
-- NOTE: PostgREST exposure of `communication` (Settings -> API -> Exposed schemas, or the
-- management API) is a Supabase platform-config step that is NOT reachable via SQL/MCP.
-- A FE-read table moved into an unexposed schema 404s — expose `communication` BEFORE the
-- SET SCHEMA move (Phase 2). Applied via Supabase MCP on txzxabzwovsujtloxrus.

CREATE SCHEMA IF NOT EXISTS communication;
GRANT USAGE ON SCHEMA communication TO authenticated, anon, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA communication TO authenticated, anon, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA communication TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA communication GRANT ALL ON TABLES TO authenticated, anon, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA communication GRANT ALL ON SEQUENCES TO authenticated, anon, service_role;

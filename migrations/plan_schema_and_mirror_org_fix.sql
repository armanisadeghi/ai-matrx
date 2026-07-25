-- plan schema foundation.
-- APPLIED LIVE 2026-07-24 via Supabase MCP (migration: plan_schema_and_mirror_org_fix).
-- NOTE: the live migration of this name also temporarily modified
-- platform._mirror_fk_to_assoc; that change was REVERTED verbatim in
-- plan_site_edges_canonical_no_mirror.sql (the function is forbidden by aidream
-- doctrine — no callers, no repairs). Net effect of this file: schema + registry row.

CREATE SCHEMA plan;
GRANT USAGE ON SCHEMA plan TO authenticated, service_role, svc_seo;
ALTER DEFAULT PRIVILEGES IN SCHEMA plan GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA plan GRANT SELECT ON TABLES TO svc_seo;

INSERT INTO platform.schemas (schema_name, display_name, sort_order, is_active)
VALUES ('plan', 'Content Planning', 88, true);

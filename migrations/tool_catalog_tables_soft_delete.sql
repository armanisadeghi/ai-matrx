-- tool.executor, tool.mcp_config, tool.mcp_server, tool.surface_defaults carry deleted_at (lane B-TOOL).
--
-- The one gap iam.verify_canonical reported on these four system catalogues was `soft_delete: WARN
-- no deleted_at` — and a WARN blocks iam.canonical_certify_ok. Archive, never delete (Arman,
-- 2026-09-20): the column is added and the registry says so.
--
-- Who deletes today (census 2026-09-25, aidream + matrx-frontend): only the MCP admin's "delete
-- config" button (tool.mcp_config), which becomes a soft delete in the same pass, and whose readers
-- (FE admin + agent settings, aidream mcp_connections + matrx-ai mcp_sync/external_mcp) now filter
-- deleted_at IS NULL. Nothing deletes executor / mcp_server / surface_defaults rows; the column is
-- there for the first archive path, which must filter its readers when it lands.
--
-- The regenerated pub_read (`deleted_at IS NULL AND visibility = 'public'`) waits for the 1–4 AM
-- Pacific window: CREATE POLICY takes ACCESS EXCLUSIVE on every auth/storage table for its
-- transaction (common-docs/projects/access-by-person-not-selection/window/tool-schema-window.sql).
-- ADD COLUMN with no default is metadata-only; each table is locked for milliseconds.

alter table tool.executor add column if not exists deleted_at timestamptz;
alter table tool.mcp_config add column if not exists deleted_at timestamptz;
alter table tool.mcp_server add column if not exists deleted_at timestamptz;
alter table tool.surface_defaults add column if not exists deleted_at timestamptz;

update platform.entity_types
   set has_soft_delete = true
 where token in ('tool_executor', 'mcp_config', 'mcp_server', 'tool_surface_defaults')
   and has_soft_delete is distinct from true;

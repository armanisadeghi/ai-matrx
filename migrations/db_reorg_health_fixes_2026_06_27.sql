-- DB health fixes for LIVE functions/triggers left broken by the 2026 schema reorg, found via
-- plpgsql_check across every function + trigger and verified clean afterward. Applied via Supabase MCP.
-- Scope: only objects that are (a) live-called and (b) repointable to a table that actually MOVED.
-- Functions referencing DELETED tables (broker_values/prompts/prompt_apps/recipe*/registered_function/
-- automation_*) are deprecated features — NOT fixable here; tracked separately for FE cleanup.
--
-- Per-function body fixes (current bodies live in the DB; pg_get_functiondef is source of truth):
--   assoc_add                         org_id -> organization_id (platform.associations + categories)
--   auth_is_org_admin/member/owner    ambiguous user_id (param vs organization_members.user_id) -> qualified
--   trg_tool_executor_validate_hierarchy / trg_tool_ui_create_v1 / trg_tool_ui_snapshot_version
--                                     public.tool_* -> tool.* schema
--   get_organization_members / get_cx_conversations_shared_with_me
--                                     auth.users.email is varchar; RETURNS text -> cast u.email::text
--   tool_executor_walk_parents        public.tool_executor -> tool.executor
--
-- Re-runnable parts below:

-- 1) org_module_config missing the base-standard `version` column (shared _touch trigger sets it).
ALTER TABLE platform.org_module_config ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

-- 2) Repoint every public function still referencing public.tool_<x> onto the tool.<x> schema
--    (the tool_* tables moved to schema `tool` with the prefix dropped). Idempotent.
DO $$
DECLARE r record; v_def text;
BEGIN
  FOR r IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f'
      AND pg_get_functiondef(p.oid) ~ 'public\.tool_(executor|binding|mcp_server|mcp_user_conn|bundle_member|bundle|surface_defaults|ui_version|ui)\M'
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'public.tool_mcp_user_conn',  'tool.mcp_user_conn');
    v_def := replace(v_def, 'public.tool_mcp_server',     'tool.mcp_server');
    v_def := replace(v_def, 'public.tool_bundle_member',  'tool.bundle_member');
    v_def := replace(v_def, 'public.tool_surface_defaults','tool.surface_defaults');
    v_def := replace(v_def, 'public.tool_executor',       'tool.executor');
    v_def := replace(v_def, 'public.tool_binding',        'tool.binding');
    v_def := replace(v_def, 'public.tool_bundle',         'tool.bundle');
    v_def := replace(v_def, 'public.tool_ui_version',     'tool.ui_version');
    v_def := replace(v_def, 'public.tool_ui',             'tool.ui');
    EXECUTE v_def;
  END LOOP;
END $$;

/**
 * Surface manifest — Tool Registry MCP Servers admin
 * (`matrx-admin/mcp-servers`).
 *
 * ADMIN SURFACE. Drives `/administration/agents/mcp-servers` — a single-page
 * master/detail admin for `tool_mcp_server` rows: sync status, connection
 * configs (`tool_mcp_server_config`), connected-user counts, per-server
 * tool catalog, and live connection testing. Backed by
 * `features/tool-registry/mcp-admin/components/McpServersAdminPage.tsx`.
 *
 * What an agent bound here may safely do: read the server list/search state,
 * the selected server's identity and sync/test freshness, its configs, tool
 * catalog, and connected-user count — then help the admin draft a new
 * server's description, diagnose a sync/test error, or explain a config's
 * env schema. It must NOT assume a refresh, test, or config save has run;
 * those are the admin's own button clicks.
 *
 * Emitters: NONE YET. `McpServersAdminPage` holds all state as local
 * `useState` (server list, search, selection, per-tab data fetched inside
 * child tab components) with no shared scope-building point — see
 * readinessNote.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const ADMIN_MCP_SERVERS_SURFACE_NAME = "matrx-admin/mcp-servers";

const groups: SurfaceValueGroup[] = [
  {
    key: "server_list",
    label: "Server list",
    sortOrder: 100,
    description: "The MCP server list and its search box.",
  },
  {
    key: "server_detail",
    label: "Server detail",
    sortOrder: 200,
    description:
      "The selected server's identity, sync/test status, active tab, and that tab's data (tools, configs, connections).",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  // ── Server list ──────────────────────────────────────────────────────
  {
    name: "mcp_search",
    label: "Server search text",
    description:
      "Text currently typed in the server search box. Empty when untouched. Always present as a string.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 100,
    group: "server_list",
  },
  {
    name: "mcp_server_count",
    label: "Server count",
    description: "Number of MCP servers currently loaded into the list.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 110,
    group: "server_list",
  },
  {
    name: "mcp_servers_list",
    label: "Server list rows",
    description:
      "Every loaded server — slug, name, vendor, status, transport, is_official, sync freshness. Bindable rather than auto-context.",
    valueType: "array",
    alwaysAvailable: true,
    typicalCharCount: 2500,
    autoContext: false,
    sortOrder: 120,
    group: "server_list",
  },

  // ── Server detail ────────────────────────────────────────────────────
  {
    name: "selected_server_slug",
    label: "Selected server slug",
    description:
      "Slug of the server open in the detail panel. Empty when no server is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 24,
    sortOrder: 200,
    group: "server_detail",
  },
  {
    name: "selected_server",
    label: "Selected server",
    description:
      "Identity + status of the selected server: name, vendor, category, transport, auth_strategy, status, docs_url, description, is_official, last_synced_at, last_sync_error. Absent when no server is selected.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 600,
    sortOrder: 210,
    group: "server_detail",
  },
  {
    name: "selected_server_active_tab",
    label: "Selected server tab",
    description:
      '"tools", "configs", "connections", or "meta" — which detail tab is showing. Absent when no server is selected.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 220,
    group: "server_detail",
  },
  {
    name: "server_tools",
    label: "Server tools",
    description:
      "Tools registered for the selected server: id, canonical name, description, is_active. Bindable rather than auto-context. Absent when no server is selected or the Tools tab has not loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 230,
    group: "server_detail",
  },
  {
    name: "server_configs",
    label: "Server configs",
    description:
      "Connection configs (tool_mcp_server_config) for the selected server: label, config_type, command, args, is_default, requires_docker, npm/pip package. Bindable rather than auto-context. Absent when no server is selected or the Configs tab has not loaded.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    autoContext: false,
    sortOrder: 240,
    group: "server_detail",
  },
  {
    name: "server_connected_user_count",
    label: "Connected user count",
    description:
      "Number of users connected to the selected server. Absent when no server is selected or the Connections tab has not loaded.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 4,
    sortOrder: 250,
    group: "server_detail",
  },
  {
    name: "latest_test_result",
    label: "Latest test result",
    description:
      "Result of the last 'Test connection' probe run in this session: ok, statusCode, latencyMs, message, error, endpointTested. Absent until the admin clicks Test connection.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 260,
    group: "server_detail",
  },
];

export const adminMcpServersManifest: SurfaceManifest = {
  surfaceName: ADMIN_MCP_SERVERS_SURFACE_NAME,
  readiness: "stub",
  readinessNote:
    "Manifest-only — no emitter wired yet. McpServersAdminPage and its tab components (ToolsTab/ConfigsTab/ConnectionsTab/MetaTab) hold state as local useState with no shared scope-building point; wiring a SurfaceRuntimeProvider is a follow-up.",
  label: "MCP Servers Admin",
  urlPattern: "/administration/agents/mcp-servers",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry MCP servers console at /administration/agents/mcp-servers.

An MCP server (tool_mcp_server) is a connectable Model Context Protocol server the platform can provision tools from. The page is master/detail: mcp_servers_list is the left sidebar (filtered by mcp_search), and selecting a row loads selected_server plus whichever detail tab is active (selected_server_active_tab): tools, configs, connections, or metadata.

What you may safely do: help the admin draft a new server's description, diagnose a sync error (selected_server.last_sync_error) or a failed connection test (latest_test_result), and explain a config's transport/env requirements. You never trigger a refresh, test, or save yourself — those are the admin's own button clicks.

There are no credentials in this scope beyond what is already visible on the page (e.g. npm/pip package names). Env var VALUES for a config are never emitted here, only the schema describing what a user must supply.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One row in the MCP server list. */
export interface AdminMcpServerListRow {
  slug: string;
  name: string;
  vendor: string;
  status: string;
  transport: string;
  is_official: boolean;
}

/** The selected server's identity + status. */
export interface AdminMcpServerDetail {
  name: string;
  vendor: string;
  category: string | null;
  transport: string;
  auth_strategy: string;
  status: string;
  docs_url: string | null;
  description: string | null;
  is_official: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
}

/** One tool row for the selected server. */
export interface AdminMcpServerToolRow {
  id: string;
  name: string;
  description: string;
  is_active: boolean | null;
}

/** One config row for the selected server. */
export interface AdminMcpServerConfigRow {
  label: string;
  config_type: string;
  command: string;
  args: string[];
  is_default: boolean;
  requires_docker: boolean;
  npm_package: string | null;
  pip_package: string | null;
}

/** Result of the last connection test. */
export interface AdminMcpTestResultSummary {
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  message: string;
  error: string | null;
  endpointTested: string | null;
}

/**
 * Type-safe payload helper. Required keys (no `?`) mirror every value
 * declared `alwaysAvailable: true`; optional keys mirror `alwaysAvailable:
 * false`.
 */
export function createAdminMcpServersScope(values: {
  // alwaysAvailable: true → required
  mcp_search: string;
  mcp_server_count: number;
  mcp_servers_list: AdminMcpServerListRow[];
  // alwaysAvailable: false → optional
  selection?: string;
  context?: Record<string, unknown>;
  selected_server_slug?: string;
  selected_server?: AdminMcpServerDetail;
  selected_server_active_tab?:
    | "tools"
    | "configs"
    | "connections"
    | "meta";
  server_tools?: AdminMcpServerToolRow[];
  server_configs?: AdminMcpServerConfigRow[];
  server_connected_user_count?: number;
  latest_test_result?: AdminMcpTestResultSummary;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}

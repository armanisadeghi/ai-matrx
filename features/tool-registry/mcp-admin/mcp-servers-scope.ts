/**
 * Runtime scope builder for the `matrx-admin/mcp-servers` surface.
 *
 * The page's raw state is Supabase rows; the manifest declares derived,
 * sanitized values. That derivation lives here rather than inline in the page
 * (the `features/marketing/lib/marketing-page-scope.ts` pattern) because it is
 * real mapping work: freshness is computed, an env schema is validated, and the
 * projections deliberately DROP `endpoint_url` / `oauth_client_id` /
 * `metadata` to match the sanitization posture `format.ts` documents for the
 * copy payloads. A scope is read by an LLM, so it is the last place an endpoint
 * URL should leak into.
 *
 * Everything returns through `createAdminMcpServersScope` so the manifest's
 * required/optional key contract is type-enforced — a UI cannot lie.
 */

import {
  createAdminMcpServersScope,
  type AdminMcpConfigEnvField,
  type AdminMcpServerConfigRow,
  type AdminMcpServerDetail,
  type AdminMcpServerListRow,
  type AdminMcpServerToolRow,
  type AdminMcpTestResultSummary,
} from "@/features/surfaces/manifests/admin-mcp-servers.manifest";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { McpServerDraft } from "@/features/tool-registry/mcp-admin/components/AddMcpServerDialog";
import type { ServerToolRow } from "@/features/tool-registry/mcp-admin/format";
import {
  computeFreshness,
  type McpConfigRow,
  type McpServerRow,
  type McpTestResult,
} from "@/features/tool-registry/mcp-admin/services/mcpAdmin.service";

/** The four detail tabs, as the manifest declares them. */
export type McpDetailTab = "tools" | "configs" | "connections" | "meta";

/**
 * What the detail pane knows, handed UP to the page-level provider.
 *
 * `null` on the per-tab fields means "that tab has not loaded", which is a
 * DIFFERENT statement from an empty array ("loaded, and this server has none").
 * The manifest promises exactly that distinction by declaring those values
 * `alwaysAvailable: false`, so the builder below omits the key rather than
 * emitting `[]` — an agent must be able to tell "no tools" from "not looked".
 */
export interface McpServersDetailSnapshot {
  server: McpServerRow;
  activeTab: McpDetailTab;
  tools: ServerToolRow[] | null;
  configs: McpConfigRow[] | null;
  connectedUserCount: number | null;
  latestTest: McpTestResult | null;
}

/** List-sidebar projection — mirrors the row the list button renders. */
export function toServerListRow(s: McpServerRow): AdminMcpServerListRow {
  return {
    slug: s.slug,
    name: s.name,
    vendor: s.vendor,
    status: s.status,
    transport: s.transport,
    is_official: s.is_official,
    sync_state: computeFreshness(s).state,
  };
}

/** Detail-header projection. Sanitized: no endpoint URL, no OAuth client id. */
export function toServerDetail(s: McpServerRow): AdminMcpServerDetail {
  return {
    name: s.name,
    vendor: s.vendor,
    category: s.category,
    transport: s.transport,
    auth_strategy: s.auth_strategy,
    status: s.status,
    docs_url: s.docs_url,
    website_url: s.website_url,
    description: s.description,
    is_official: s.is_official,
    last_synced_at: s.last_synced_at,
    last_sync_error: s.last_sync_error,
    last_tested_at: s.last_tested_at,
    last_test_ok: s.last_test_ok,
    last_test_status_code: s.last_test_status_code,
    last_test_latency_ms: s.last_test_latency_ms,
    last_test_error: s.last_test_error,
  };
}

function toToolRow(t: ServerToolRow): AdminMcpServerToolRow {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    is_active: t.is_active,
  };
}

/**
 * `env_schema` is `Json` on the row and hand-edited as free JSON in the config
 * dialog, so it can be anything. Project only the four documented fields, and
 * only from entries that actually look like fields — a malformed blob becomes
 * an empty schema rather than an object the agent will reason about wrongly.
 */
function toEnvSchema(raw: unknown): AdminMcpConfigEnvField[] {
  if (!Array.isArray(raw)) return [];
  const fields: AdminMcpConfigEnvField[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const field = entry as Record<string, unknown>;
    if (typeof field.key !== "string") continue;
    fields.push({
      key: field.key,
      label: typeof field.label === "string" ? field.label : field.key,
      required: field.required === true,
      secret: field.secret === true,
    });
  }
  return fields;
}

function toConfigRow(c: McpConfigRow): AdminMcpServerConfigRow {
  return {
    label: c.label,
    config_type: c.config_type,
    command: c.command,
    args: c.args,
    is_default: c.is_default,
    requires_docker: c.requires_docker,
    npm_package: c.npm_package,
    pip_package: c.pip_package,
    min_node_version: c.min_node_version,
    notes: c.notes,
    env_schema: toEnvSchema(c.env_schema),
  };
}

function toTestSummary(r: McpTestResult): AdminMcpTestResultSummary {
  return {
    ok: r.ok,
    statusCode: r.statusCode,
    latencyMs: r.latencyMs,
    message: r.message,
    error: r.error,
    endpointTested: r.endpointTested,
  };
}

/**
 * Build the live payload. Called at Run time from the page's provider, never
 * on mount — `detail` is read from a ref so the sample is always current.
 */
export function buildAdminMcpServersScope(input: {
  search: string;
  servers: McpServerRow[];
  newServerDraft: McpServerDraft;
  detail: McpServersDetailSnapshot | null;
}): SurfaceScopePayload {
  const { search, servers, newServerDraft, detail } = input;

  const base = {
    mcp_search: search,
    mcp_server_count: servers.length,
    mcp_servers_list: servers.map(toServerListRow),
    new_server_draft: { ...newServerDraft },
  };

  if (!detail) return createAdminMcpServersScope(base);

  return createAdminMcpServersScope({
    ...base,
    selected_server_slug: detail.server.slug,
    selected_server: toServerDetail(detail.server),
    selected_server_active_tab: detail.activeTab,
    // Omit — never `[]` — while a tab has not loaded. See the snapshot docblock.
    server_tools: detail.tools ? detail.tools.map(toToolRow) : undefined,
    server_configs: detail.configs
      ? detail.configs.map(toConfigRow)
      : undefined,
    server_connected_user_count: detail.connectedUserCount ?? undefined,
    latest_test_result: detail.latestTest
      ? toTestSummary(detail.latestTest)
      : undefined,
  });
}

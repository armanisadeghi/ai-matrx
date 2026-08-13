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
 * Emitter: `McpServersAdminPage` mounts this surface's `SurfaceRuntimeProvider`
 * and derives its payload through
 * `features/tool-registry/mcp-admin/mcp-servers-scope.ts` (the
 * `marketing-page-scope.ts` pattern — the projections deliberately DROP
 * `endpoint_url` / `oauth_client_id` / `metadata`, matching the sanitization
 * posture `format.ts` documents for the copy payloads, because a scope is read
 * by an LLM).
 *
 * The per-tab values (`server_tools`, `server_configs`,
 * `server_connected_user_count`, `selected_server_active_tab`,
 * `latest_test_result`) were the emitter's stated gap and are now live
 * (2026-08-13). They are fetched inside ToolsTab/ConfigsTab/ConnectionsTab,
 * which Radix unmounts when inactive, so each reports what it loaded UP into a
 * ref the provider's `getScope` reads at Run time — the
 * `messages.manifest.ts` `onLoadedMessageCountChange` shape, and for the same
 * reason: lifting per-tab data into page state would remount the detail pane
 * mid-fetch, and a ref sampled at Run is exactly as fresh as state. `null`
 * ("that tab has not loaded") stays distinct from `[]` ("loaded, and there are
 * none"): the builder OMITS the key rather than emitting an empty array, so an
 * agent can tell "no tools" from "not looked".
 *
 * THREE declared values had to be CORRECTED to be emittable honestly rather
 * than emitted as something plausible-but-wrong (the precedent is
 * `messages.manifest.ts` on `current_conversation_message_count` — a read gap
 * is visible, a wrong value is not):
 *   - `selected_server_active_tab` had NO holder at all: `<Tabs>` was
 *     UNCONTROLLED (`defaultValue="tools"`), so the page genuinely did not know
 *     its own answer. The detail pane controls it now.
 *   - `selected_server` promised sync status only, while the detail header also
 *     renders a PERSISTED connection-test badge off `last_test_*`. Those five
 *     columns (and `website_url`, which the wizard collects and the row
 *     carries) are now declared; without them an agent reading an absent
 *     `latest_test_result` would conclude the server was never tested, when the
 *     page was showing a result from a previous session.
 *   - `server_configs` gained `env_schema` / `notes` / `min_node_version`,
 *     which the Configs tab renders and the intro explicitly promises ("only
 *     the schema describing what a user must supply"). Env var VALUES are never
 *     emitted — the schema declares KEYS and their required/secret flags.
 *
 * Write half: ONE target, `new_server_draft` — see the block above
 * `writeTargets` for the judgment call and the full exclusion list.
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
  SurfaceWriteTarget,
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
  {
    key: "server_authoring",
    label: "New server",
    sortOrder: 300,
    description:
      "The Add-MCP-server wizard — the one place this console authors anything.",
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
      "Every loaded server — slug, name, vendor, status, transport, is_official, and sync_state (fresh | stale | errored | never). Bindable rather than auto-context.",
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
      "Identity + status of the selected server: name, vendor, category, transport, auth_strategy, status, docs_url, website_url, description, is_official, sync state (last_synced_at, last_sync_error) and the PERSISTED result of the last connection test (last_tested_at, last_test_ok, last_test_status_code, last_test_latency_ms, last_test_error) — which is what the header's reachable/unreachable badge shows, and is distinct from latest_test_result (this session's probe only). Never carries the endpoint URL or OAuth client id. Absent when no server is selected.",
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
      "Connection configs (tool_mcp_server_config) for the selected server: label, config_type, command, args, is_default, requires_docker, npm/pip package, min_node_version, notes, and env_schema. env_schema is the SCHEMA a connecting user must fill (key, label, required, secret) — never the env var values, which this surface does not load. Bindable rather than auto-context. Absent when no server is selected or the Configs tab has not loaded.",
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

  // ── New server ───────────────────────────────────────────────────────
  {
    name: "new_server_draft",
    label: "New server draft",
    description:
      "The authored half of the Add-MCP-server wizard as it stands right now: `{ name, vendor, category, description }`. Always present as an object — every key is a string, blank until typed or staged, and `category` starts at its default. Says NOTHING about whether the wizard is open, and nothing here exists in the database: no server is created until the admin walks the three steps and presses Provision server. This is the read twin of the `new_server_draft` write target — read it to see what is already staged, write it to stage more.",
    valueType: "object",
    alwaysAvailable: true,
    typicalCharCount: 220,
    autoContext: false,
    sortOrder: 300,
    group: "server_authoring",
  },
];

/**
 * Write half of the 360 loop — handlers in `McpServersAdminPage`.
 *
 * JUDGMENT BAR, applied honestly, and the honest answer is ONE target that is
 * NOT the one this surface was scouted for.
 *
 * The campaign brief expected the flagship target to be the DESCRIPTION of the
 * selected server, on the model of the Tool Registry admin
 * (`/administration/agents/mcp-tools`, description / category / tags on the
 * detail page). That field does not exist here. `ServerDetail` renders
 * `server.description` as a paragraph, the Metadata tab is a read-only
 * `<pre>` of `serverMeta(server)`, and `mcpAdmin.service.ts` has no
 * `updateServer` at all — the one row-level mutator, `setServerStatus`, is
 * exported and called by nothing. There is no canonical write path to an
 * existing `tool.mcp_server` row anywhere in this feature, so a description
 * target would have had to invent one, which is exactly the
 * declared-but-unwired defect the skill warns about.
 *
 * What this console DOES author is a new server, in `AddMcpServerDialog`.
 * Turning "add the Linear MCP server" into a display name, a vendor, a
 * category and an agent-facing description is naming-and-summarising work an
 * agent does well and an admin does slowly — four YES fields, drafted in a
 * single thought and consumed by ONE provision call. That is the composite
 * case, and it follows `cms`'s `new_site_draft` line for line: partial keys,
 * validate-everything-then-apply, open the dialog so the draft is visible,
 * and the human still presses the button.
 *
 * One target also means ONE confirm for one decision instead of four in a
 * row; the stated cost is that the admin accepts or declines the draft whole.
 *
 * The handler OPENS the wizard when it is closed, for the reason `cms`
 * documented: the wizard is a MODAL, so while it is open the header's "Agents
 * for this page" button sits in an `aria-hidden` subtree and cannot be
 * clicked. Every agent-originated write therefore arrives with the dialog
 * shut, and a handler that refused then would refuse always. Opening it is
 * free to undo — Cancel and Escape both close it, and nothing was persisted.
 *
 * WHAT IS NOT WRITABLE, on purpose:
 *  - **Provisioning the server.** `provisionMcpServer` inserts four rows in
 *    one transaction — the server, an `mcp.<slug>` executor, a system bundle
 *    and a lister tool — and optionally fires a catalog refresh at a live
 *    endpoint. An agent may fill the form; the admin presses Provision.
 *  - `slug` — identity. It becomes the row's primary key, the executor name
 *    `mcp.<slug>` and the auto-bundle name, and agent definitions reference
 *    it. The campaign brief rules the slug out and this manifest honours that
 *    (note that `cms`'s `new_site_draft` does stage a new site's slug, so
 *    this is a deliberate difference, not an oversight — an unborn slug is
 *    referenced by nothing, and adding the key later is one validated block).
 *  - `endpointUrl`, `transport`, `authStrategy` — connection and credential
 *    shape. Where a server lives and how credentials flow to it is the
 *    admin's call, and a wrong endpoint is a request sent somewhere nobody
 *    chose.
 *  - `isOfficial` — a claim that a vendor blessed this server, which surfaces
 *    as a badge in the user-facing catalog. Attestation, not authoring.
 *  - `docsUrl` / `websiteUrl` — URLs an agent would be guessing at, landing
 *    as links admins and users click.
 *  - `autoRefresh` — whether provisioning immediately calls out to the
 *    server's endpoint. A side effect switch, not content.
 *  - Everything on an EXISTING server: `Refresh sync`, `Test connection`, and
 *    the `tool.mcp_config` rows (label, command, args, env schema,
 *    is_default, delete). The intro is explicit that a refresh, a test or a
 *    config save is the admin's own button click and must never be assumed to
 *    have run; env schema and config rows are credential-shaped besides.
 *  - `mcp_search` and `selected_server_active_tab` — a search box and a tab
 *    toggle. Pure-mechanical view state nobody would ask an agent to flip;
 *    padding the count with them is what the judgment bar exists to stop.
 */
const writeTargets: SurfaceWriteTarget[] = [
  {
    name: "new_server_draft",
    label: "New server draft",
    description: [
      "Stages a new MCP server into the Add-server wizard's identity step — the same fields the admin would type, staged the same way. NOTHING is created: no server, executor, bundle or lister tool exists until the admin walks the remaining steps and presses Provision server.",
      "Opens the wizard if it is closed, so the admin can see, edit, or cancel what you staged.",
      "Value: an object with AT LEAST ONE of `{ name, vendor, category, description }`. Each key REPLACES that one field; omit a key to leave what the admin typed exactly as they left it (read the `new_server_draft` value first if you mean to extend rather than replace).",
      "`name` — the server's display name, a non-empty string (e.g. `Linear`).",
      "`vendor` — who publishes it, a non-empty string (e.g. `Linear Orbit, Inc.`).",
      "`category` — EXACTLY one of: productivity | communication | design | developer | database | payments | analytics | crm | storage | ai | search | automation | other. Any other value is REJECTED, not corrected or mapped.",
      "`description` — the short agent-facing summary of what the server provides. May be an empty string to clear it.",
      "The slug, endpoint URL, transport, auth strategy, docs/website URLs and the official badge are NOT writable and are rejected as unsupported keys — the admin types those. Refused while a server is already being provisioned.",
    ].join(" "),
    valueType: "object",
    updatesValue: "new_server_draft",
    mode: "draft",
    applyPolicy: "ask",
    group: "server_authoring",
    sortOrder: 300,
  },
];

export const adminMcpServersManifest: SurfaceManifest = {
  surfaceName: ADMIN_MCP_SERVERS_SURFACE_NAME,
  readiness: "verified",
  label: "MCP Servers Admin",
  urlPattern: "/administration/agents/mcp-servers",
  intro: `<surface_intro>
This is an ADMIN surface: the Tool Registry MCP servers console at /administration/agents/mcp-servers.

An MCP server (tool_mcp_server) is a connectable Model Context Protocol server the platform can provision tools from. The page is master/detail: mcp_servers_list is the left sidebar (filtered by mcp_search), and selecting a row loads selected_server plus whichever detail tab is active (selected_server_active_tab): tools, configs, connections, or metadata.

What you may safely do: help the admin draft a new server's description, diagnose a sync error (selected_server.last_sync_error) or a failed connection test (latest_test_result), and explain a config's transport/env requirements. You never trigger a refresh, test, or save yourself — those are the admin's own button clicks.

The one thing you can WRITE is new_server_draft: it stages a display name, vendor, category and agent-facing description into the Add-server wizard, opening it so the admin can see what you staged. Nothing is created by writing it — the admin still supplies the slug, transport, endpoint and auth strategy and presses Provision server. There is no write path to an EXISTING server on this page at all: its description and metadata are read-only here, so if the admin asks you to rewrite a registered server's description, say plainly that this console cannot edit one and offer to draft the text for them to paste.

Two freshness facts are easy to confuse. selected_server carries the PERSISTED result of the last connection test (last_test_ok and friends) — that is what the header badge shows, and it may be weeks old. latest_test_result is only this session's probe and is absent until the admin clicks Test connection. Never report one as the other.

There are no credentials in this scope beyond what is already visible on the page (e.g. npm/pip package names). Env var VALUES for a config are never emitted here, only the schema describing what a user must supply.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
  writeTargets,
};

/** One row in the MCP server list. */
export interface AdminMcpServerListRow {
  slug: string;
  name: string;
  vendor: string;
  status: string;
  transport: string;
  is_official: boolean;
  /** `computeFreshness(server).state` — fresh | stale | errored | never. */
  sync_state: string;
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
  website_url: string | null;
  description: string | null;
  is_official: boolean;
  last_synced_at: string | null;
  last_sync_error: string | null;
  /**
   * The PERSISTED connection test on the row — what the header badge shows,
   * possibly weeks old. `latest_test_result` is the separate in-session probe.
   */
  last_tested_at: string | null;
  last_test_ok: boolean | null;
  last_test_status_code: number | null;
  last_test_latency_ms: number | null;
  last_test_error: string | null;
}

/** One tool row for the selected server. */
export interface AdminMcpServerToolRow {
  id: string;
  name: string;
  description: string;
  is_active: boolean | null;
}

/**
 * One env var a connecting user must supply for a config. The SCHEMA only —
 * `secret: true` marks a field whose value is vault-held and never loaded here.
 */
export interface AdminMcpConfigEnvField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
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
  min_node_version: string | null;
  notes: string | null;
  env_schema: AdminMcpConfigEnvField[];
}

/**
 * The authored half of the Add-server wizard's identity step — the read twin
 * of the `new_server_draft` write target. Nothing here exists in the database.
 */
export interface AdminMcpServerDraft {
  name: string;
  vendor: string;
  category: string;
  description: string;
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
  new_server_draft: AdminMcpServerDraft;
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

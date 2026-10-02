/**
 * Shared human/agent copy formatters for the USER-FACING MCP integration
 * surfaces (settings → Integrations, and the agent tools manager).
 *
 * SECURITY — this file exists because `McpCatalogEntry` is not safe to copy.
 * It carries `endpointUrl`, `authStrategy`, `connectionId` and
 * `tokenExpiresAt`; a payload is a clipboard artefact that ends up pasted into
 * a third-party model, so none of those may ever leave. Copy posture matches
 * `features/tool-registry/mcp-admin/format.ts` (`serverMeta`) and
 * `features/tool-call-visualization/admin/mcp-tools/format.ts`: no MCP
 * endpoint URLs, no auth strategies, no OAuth/connection ids, no vault
 * credentials, no tokens.
 *
 * The projection below is an explicit ALLOWLIST. Never spread a raw entry into
 * a payload, and never add a field here without checking it against that list —
 * a spread is how a credential leaks the day the type grows a new field.
 */

import { humanLines } from "@/features/marketing/lib/copy-payloads";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";

export function mcpLocation(surface: string): string {
  return `AI Matrx — Integrations — ${surface}`;
}

/**
 * The sanitized projection of a catalog entry used for JSON/agent copy.
 *
 * DELIBERATELY OMITTED — do not re-add:
 *   endpointUrl    — the server address
 *   authStrategy   — how credentials are obtained
 *   connectionId   — the OAuth/connection record id
 *   tokenExpiresAt — credential state
 *
 * `hasConnection` replaces `connectionId` so the payload still answers "is this
 * connected?" without naming the credential record.
 */
export function mcpEntryMeta(e: McpCatalogEntry) {
  return {
    server_id: e.serverId,
    slug: e.slug,
    name: e.name,
    vendor: e.vendor,
    category: e.category,
    description: e.description,
    docs_url: e.docsUrl,
    website_url: e.websiteUrl,
    transport: e.transport,
    server_status: e.serverStatus,
    is_official: e.isOfficial,
    is_featured: e.isFeatured,
    has_remote: e.hasRemote,
    has_local: e.hasLocal,
    supports_mcp_apps: e.supportsMcpApps,
    // Connection STATE, never connection identity.
    has_connection: e.connectionId != null,
    connection_status: e.connectionStatus,
    connected_at: e.connectedAt,
    last_used_at: e.lastUsedAt,
    transport_used: e.transportUsed,
  };
}

/** Compact projection for list-level "Key fields" variants and CSV. */
export function mcpEntryBrief(e: McpCatalogEntry) {
  return {
    slug: e.slug,
    name: e.name,
    vendor: e.vendor,
    category: e.category,
    server_status: e.serverStatus,
    has_connection: e.connectionId != null,
    connection_status: e.connectionStatus,
    last_used_at: e.lastUsedAt,
  };
}

export function mcpEntrySummary(e: McpCatalogEntry): string {
  return humanLines([
    ["Integration", `${e.name} (${e.vendor})`],
    ["Slug", e.slug],
    ["Category", e.category],
    ["Server status", e.serverStatus],
    ["Connected", e.connectionId != null ? "yes" : "no"],
    ["Connection status", e.connectionStatus],
    ["Connected at", e.connectedAt],
    ["Last used", e.lastUsedAt],
    ["Transport", e.transport],
    ["Description", e.description],
  ]);
}

export function mcpListSummary(entries: McpCatalogEntry[]): string {
  return entries
    .map(
      (e) =>
        `${e.name} · ${e.vendor} · ${e.category} · ${
          e.connectionId != null
            ? `connected (${e.connectionStatus ?? "unknown"})`
            : "not connected"
        }`,
    )
    .join("\n");
}

/** Connection-state counts — the KPI a user reads this page for. */
export function mcpConnectionCounts(entries: McpCatalogEntry[]) {
  let connected = 0;
  let failing = 0;
  for (const e of entries) {
    if (e.connectionId == null) continue;
    connected += 1;
    // Anything with a connection record that is not "connected" is a
    // connection the user needs to look at (see FOUND_DEFECTS D128).
    if (e.connectionStatus && e.connectionStatus !== "connected") {
      failing += 1;
    }
  }
  return {
    total: entries.length,
    connected,
    failing,
    not_connected: entries.length - connected,
  };
}

export const MCP_CSV_COLUMNS = [
  { key: "slug", header: "Slug" },
  { key: "name", header: "Name" },
  { key: "vendor", header: "Vendor" },
  { key: "category", header: "Category" },
  { key: "server_status", header: "Server status" },
  { key: "has_connection", header: "Connected" },
  { key: "connection_status", header: "Connection status" },
  { key: "last_used_at", header: "Last used" },
];

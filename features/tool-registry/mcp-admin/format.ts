import type {
  McpConfigRow,
  McpServerRow,
} from "@/features/tool-registry/mcp-admin/services/mcpAdmin.service";

/**
 * Shared human/agent formatters for the MCP servers admin page.
 *
 * SECURITY: copy payloads follow the same posture as the
 * `matrx-admin/tool-registry` surface manifest — no MCP endpoint URLs, OAuth
 * client ids, or vault credentials. Always copy via {@link serverMeta}, never
 * the raw `mcp_server` row.
 */

/** The sanitized projection of a server row used for JSON/agent copy. */
export function serverMeta(s: McpServerRow) {
  return {
    id: s.id,
    slug: s.slug,
    name: s.name,
    vendor: s.vendor,
    category: s.category,
    transport: s.transport,
    status: s.status,
    description: s.description,
    docs_url: s.docs_url,
    website_url: s.website_url,
    has_local: s.has_local,
    has_remote: s.has_remote,
    supports_mcp_apps: s.supports_mcp_apps,
    is_official: s.is_official,
    is_featured: s.is_featured,
    discovery_ttl_seconds: s.discovery_ttl_seconds,
    last_synced_at: s.last_synced_at,
    last_sync_error: s.last_sync_error,
    last_tested_at: s.last_tested_at,
    last_test_ok: s.last_test_ok,
    last_test_status_code: s.last_test_status_code,
    last_test_latency_ms: s.last_test_latency_ms,
    last_test_error: s.last_test_error,
    metadata: s.metadata,
    created_at: s.created_at,
    updated_at: s.updated_at,
  };
}

export function serverSummary(s: McpServerRow): string {
  const lines = [
    `${s.slug} — ${s.name} (${s.vendor})`,
    `status: ${s.status} · transport: ${s.transport} · category: ${s.category}${s.is_official ? " · official" : ""}`,
    `synced: ${s.last_synced_at ?? "never"}${s.last_sync_error ? ` · sync error: ${s.last_sync_error}` : ""}`,
  ];
  if (s.description) lines.push(s.description);
  return lines.join("\n");
}

/** One-line-per-server digest for the whole-list human copy. */
export function serversListSummary(servers: McpServerRow[]): string {
  return servers
    .map(
      (s) =>
        `${s.slug} · ${s.name} · ${s.vendor} · ${s.status} · ${s.transport} · synced ${s.last_synced_at ?? "never"}`,
    )
    .join("\n");
}

/** Compact per-server projection for the "Summary" AI variant. */
export function serverBrief(s: McpServerRow) {
  return {
    slug: s.slug,
    name: s.name,
    vendor: s.vendor,
    status: s.status,
    transport: s.transport,
    category: s.category,
    is_official: s.is_official,
    last_synced_at: s.last_synced_at,
    last_sync_error: s.last_sync_error,
  };
}

export function configSummary(c: McpConfigRow): string {
  const bits = [
    `${c.label} (${c.config_type})${c.is_default ? " · default" : ""}${c.requires_docker ? " · requires Docker" : ""}`,
  ];
  if (c.command) bits.push(`command: ${c.command} ${c.args.join(" ")}`.trim());
  if (c.npm_package) bits.push(`npm: ${c.npm_package}`);
  if (c.pip_package) bits.push(`pip: ${c.pip_package}`);
  if (c.min_node_version) bits.push(`min Node: ${c.min_node_version}`);
  if (c.notes) bits.push(c.notes);
  return bits.join("\n");
}

export interface ServerToolRow {
  id: string;
  name: string;
  description: string;
  is_active: boolean | null;
}

export function serverToolSummary(t: ServerToolRow): string {
  return `${t.name}${t.is_active === false ? " (inactive)" : ""} — ${t.description || "no description"}`;
}

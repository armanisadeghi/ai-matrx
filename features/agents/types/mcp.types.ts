import type { Database } from "@/types/database.types";

// ---------------------------------------------------------------------------
// DB enum types — pulled from generated Supabase types for single source of truth
// ---------------------------------------------------------------------------

export type McpAuthStrategy = Database["public"]["Enums"]["mcp_auth_strategy"];

export type McpConnectionStatus =
  Database["public"]["Enums"]["mcp_connection_status"];

export type McpServerCategory =
  Database["public"]["Enums"]["mcp_server_category"];

export type McpServerStatus = Database["public"]["Enums"]["mcp_server_status"];

export type McpTransport = Database["public"]["Enums"]["mcp_transport"];

// ---------------------------------------------------------------------------
// Catalog entry — returned by get_mcp_catalog_for_user RPC
// ---------------------------------------------------------------------------

type CatalogRpcRow =
  Database["public"]["Functions"]["get_mcp_catalog_for_user"]["Returns"][number];

export interface McpCatalogEntry {
  serverId: string;
  slug: string;
  name: string;
  vendor: string;
  description: string | null;
  category: McpServerCategory;
  iconUrl: string | null;
  color: string | null;
  websiteUrl: string | null;
  docsUrl: string | null;
  endpointUrl: string | null;
  transport: McpTransport;
  authStrategy: McpAuthStrategy;
  isOfficial: boolean;
  isFeatured: boolean;
  hasRemote: boolean;
  hasLocal: boolean;
  supportsMcpApps: boolean;
  serverStatus: McpServerStatus;
  connectionId: string | null;
  connectionStatus: McpConnectionStatus | null;
  connectedAt: string | null;
  lastUsedAt: string | null;
  transportUsed: McpTransport | null;
  tokenExpiresAt: string | null;
}

export function catalogEntryFromRpc(row: CatalogRpcRow): McpCatalogEntry {
  return {
    serverId: row.server_id,
    slug: row.slug,
    name: row.name,
    vendor: row.vendor,
    description: row.description,
    category: row.category,
    iconUrl: row.icon_url,
    color: row.color,
    websiteUrl: row.website_url,
    docsUrl: row.docs_url,
    endpointUrl: row.endpoint_url,
    transport: row.transport,
    authStrategy: row.auth_strategy,
    isOfficial: row.is_official,
    isFeatured: row.is_featured,
    hasRemote: row.has_remote,
    hasLocal: row.has_local,
    supportsMcpApps: row.supports_mcp_apps,
    serverStatus: row.server_status,
    connectionId: row.connection_id || null,
    connectionStatus: row.connection_status || null,
    connectedAt: row.connected_at || null,
    lastUsedAt: row.last_used_at || null,
    transportUsed: row.transport_used || null,
    tokenExpiresAt: row.token_expires_at || null,
  };
}

// ---------------------------------------------------------------------------
// Server config — stdio setup variants from tl_mcp_config table
// ---------------------------------------------------------------------------

type ServerConfigRow =
  Database["public"]["Tables"]["tl_mcp_config"]["Row"];

export interface McpServerConfigEntry {
  id: string;
  serverId: string;
  label: string;
  configType: string;
  isDefault: boolean;
  command: string;
  args: string[];
  envSchema: McpEnvSchemaField[];
  requiresDocker: boolean;
  npmPackage: string | null;
  pipPackage: string | null;
  minNodeVersion: string | null;
  notes: string | null;
}

export interface McpEnvSchemaField {
  key: string;
  label: string;
  required: boolean;
  secret: boolean;
  helpText?: string;
  placeholder?: string;
}

export function serverConfigFromRow(
  row: ServerConfigRow,
): McpServerConfigEntry {
  return {
    id: row.id,
    serverId: row.server_id,
    label: row.label,
    configType: row.config_type,
    isDefault: row.is_default,
    command: row.command,
    args: row.args,
    envSchema: (row.env_schema as unknown as McpEnvSchemaField[]) ?? [],
    requiresDocker: row.requires_docker,
    npmPackage: row.npm_package,
    pipPackage: row.pip_package,
    minNodeVersion: row.min_node_version,
    notes: row.notes,
  };
}

// ---------------------------------------------------------------------------
// Category display metadata
// ---------------------------------------------------------------------------

export const MCP_CATEGORY_META: Record<
  McpServerCategory,
  { label: string; order: number }
> = {
  productivity: { label: "Productivity", order: 1 },
  communication: { label: "Communication", order: 2 },
  design: { label: "Design & Content", order: 3 },
  developer: { label: "Developer & Cloud", order: 4 },
  database: { label: "Database", order: 5 },
  payments: { label: "Payments & Commerce", order: 6 },
  analytics: { label: "Analytics & Data", order: 7 },
  crm: { label: "CRM & Sales", order: 8 },
  storage: { label: "File Storage", order: 9 },
  ai: { label: "AI", order: 10 },
  search: { label: "Search", order: 11 },
  automation: { label: "Automation", order: 12 },
  other: { label: "Other", order: 99 },
};

import { supabase } from "@/utils/supabase/client";
import type { McpTransport } from "@/features/agents/types/mcp.types";
import {
  catalogEntryFromRpc,
  serverConfigFromRow,
} from "@/features/agents/types/mcp.types";
import type {
  McpCatalogEntry,
  McpServerConfigEntry,
} from "@/features/agents/types/mcp.types";

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

export async function fetchMcpCatalog(): Promise<McpCatalogEntry[]> {
  const { data, error } = await supabase.rpc("get_mcp_catalog_for_user");

  if (error) throw new Error(`Failed to fetch MCP catalog: ${error.message}`);
  if (!data) return [];

  return data.map(catalogEntryFromRpc);
}

// ---------------------------------------------------------------------------
// Connection management
// ---------------------------------------------------------------------------
// Phase 4 vault cutover: `upsert_mcp_connection` is METADATA-ONLY — it never
// accepts a token/credential. Anything secret goes to aidream
// (`features/agents/services/mcp-connections.service.ts`), which stores it in
// a sealed vault item and links the connection.

export interface UpsertConnectionParams {
  serverId: string;
  configId?: string;
  transport?: McpTransport;
  endpointOverride?: string;
}

export async function connectMcpServer(
  params: UpsertConnectionParams,
): Promise<string> {
  const { data, error } = await supabase.rpc("upsert_mcp_connection", {
    p_server_id: params.serverId,
    p_config_id: params.configId,
    p_transport: params.transport,
    p_endpoint_override: params.endpointOverride,
  });

  if (error) throw new Error(`Failed to connect MCP server: ${error.message}`);

  return data as string;
}

// ---------------------------------------------------------------------------
// Server configs (stdio setup variants)
// ---------------------------------------------------------------------------

export async function fetchMcpServerConfigs(
  serverId: string,
): Promise<McpServerConfigEntry[]> {
  const { data, error } = await supabase
    .schema("tool").from("mcp_config")
    .select("*")
    .eq("server_id", serverId)
    .order("is_default", { ascending: false });

  if (error)
    throw new Error(`Failed to fetch MCP server configs: ${error.message}`);
  if (!data) return [];

  return data.map(serverConfigFromRow);
}

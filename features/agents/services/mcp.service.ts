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

export interface UpsertConnectionParams {
  serverId: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  credentialsJson?: string;
  configId?: string;
  transport?: McpTransport;
  oauthTokenEndpoint?: string;
  oauthClientId?: string;
  oauthScopes?: string[];
  endpointOverride?: string;
}

export async function connectMcpServer(
  params: UpsertConnectionParams,
): Promise<string> {
  const { data, error } = await supabase.rpc("upsert_mcp_connection", {
    p_server_id: params.serverId,
    p_access_token: params.accessToken,
    p_refresh_token: params.refreshToken,
    p_token_expires_at: params.tokenExpiresAt,
    p_credentials_json: params.credentialsJson,
    p_config_id: params.configId,
    p_transport: params.transport,
    p_oauth_token_endpoint: params.oauthTokenEndpoint,
    p_oauth_client_id: params.oauthClientId,
    p_oauth_scopes: params.oauthScopes,
    p_endpoint_override: params.endpointOverride,
  });

  if (error) throw new Error(`Failed to connect MCP server: ${error.message}`);

  return data as string;
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  const { error } = await supabase.rpc("disconnect_mcp_server", {
    p_server_id: serverId,
  });

  if (error)
    throw new Error(`Failed to disconnect MCP server: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Server configs (stdio setup variants)
// ---------------------------------------------------------------------------

export async function fetchMcpServerConfigs(
  serverId: string,
): Promise<McpServerConfigEntry[]> {
  const { data, error } = await supabase
    .from("tool_mcp_config")
    .select("*")
    .eq("server_id", serverId)
    .order("is_default", { ascending: false });

  if (error)
    throw new Error(`Failed to fetch MCP server configs: ${error.message}`);
  if (!data) return [];

  return data.map(serverConfigFromRow);
}

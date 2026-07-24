/**
 * MCP connections client — aidream `/api/mcp-connections/*`.
 *
 * Phase 4 of the Unified Credential Vault cutover: MCP tokens/credentials
 * live ONLY in vault items on the server. The browser never sees a token —
 * discovery, invocation, refresh, credential persistence, and disconnect all
 * run in aidream with vault-resolved auth. The connection row
 * (tool.mcp_user_conn) is non-secret metadata the FE may read directly.
 *
 * (Replaces the deleted Next.js /api/mcp/servers/[serverId]/* routes and the
 * deleted mcp-client/token-refresh.ts.)
 */
import { createClient } from "@/utils/supabase/client";
import type { McpToolSchema } from "@/features/agents/services/mcp-client/tool-discovery";

function backendBase(): string {
  return (
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com"
  );
}

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not signed in");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function mcpFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await authHeaders();
  let resp: Response;
  try {
    resp = await fetch(`${backendBase()}/api/mcp-connections${path}`, {
      ...init,
      headers: { ...headers, ...init?.headers },
    });
  } catch {
    throw new Error("MCP service unreachable — the backend must be online");
  }
  if (!resp.ok) {
    let detail: string | undefined;
    try {
      const body = (await resp.json()) as { detail?: unknown };
      detail =
        typeof body.detail === "string" ? body.detail : JSON.stringify(body);
    } catch {
      detail = await resp.text().catch(() => undefined);
    }
    throw new Error(detail || `HTTP ${resp.status}`);
  }
  return (await resp.json()) as T;
}

// ── Types (wire shapes of the aidream router — no token ever crosses) ─────

export interface McpConnectionSummary {
  connection_id: string;
  server_id: string | null;
  server_slug: string | null;
  status: string;
  auth_method: string | null;
  credential_item_id: string | null;
  token_expires_at: string | null;
  oauth_scopes_granted: string[];
  last_error: string | null;
}

interface WireTool {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  output_schema?: Record<string, unknown> | null;
}

export type ManualAuthMethod =
  | "api_key"
  | "bearer"
  | "basic"
  | "headers"
  | "stdio_env";

// ── Operations ────────────────────────────────────────────────────────────

/** Discover tools on a server using the caller's vault-backed connection. */
export async function discoverMcpServerTools(serverId: string): Promise<{
  serverId: string;
  serverSlug: string | null;
  tools: McpToolSchema[];
}> {
  const resp = await mcpFetch<{
    server_id: string;
    server_slug: string | null;
    tools: WireTool[];
  }>(`/${encodeURIComponent(serverId)}/tools`);
  return {
    serverId: resp.server_id,
    serverSlug: resp.server_slug,
    tools: resp.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.parameters ?? {},
    })),
  };
}

/** Invoke one tool on a server; auth resolves server-side from the vault. */
export function invokeMcpServerTool(
  serverId: string,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<{ success: boolean; output: string | null; error: string | null }> {
  return mcpFetch(`/${encodeURIComponent(serverId)}/invoke`, {
    method: "POST",
    body: JSON.stringify({ tool_name: toolName, arguments: args ?? {} }),
  });
}

/** Server-side OAuth refresh — replaces the deleted browser refresh path. */
export function refreshMcpConnection(
  serverId: string,
): Promise<McpConnectionSummary> {
  return mcpFetch(`/${encodeURIComponent(serverId)}/refresh`, {
    method: "POST",
  });
}

/**
 * Store non-OAuth connection credentials (API key / bearer / basic / headers
 * / stdio env) — written into a sealed vault item server-side.
 */
export function persistMcpManualCredentials(
  serverId: string,
  body: {
    auth_method: ManualAuthMethod;
    fields: Record<string, string>;
    transport?: string;
    config_id?: string;
    endpoint_override?: string;
  },
): Promise<McpConnectionSummary> {
  return mcpFetch(`/${encodeURIComponent(serverId)}/credentials`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Disconnect: clears the connection and soft-deletes the owned vault item. */
export function disconnectMcpConnection(
  serverId: string,
): Promise<McpConnectionSummary> {
  return mcpFetch(`/${encodeURIComponent(serverId)}`, { method: "DELETE" });
}

/** Header name → sealed vault field key (`X-API-Key` → `header_x_api_key`). */
export function headerFieldKey(headerName: string): string {
  const normalized = headerName.toLowerCase().replace(/[^a-z0-9]/g, "_");
  return `header_${normalized}`;
}

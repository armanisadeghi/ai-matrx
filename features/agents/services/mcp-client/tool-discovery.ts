/**
 * MCP tool schema types.
 *
 * Vault Phase 4 cutover: the browser no longer speaks the MCP wire protocol
 * (the old JSON-RPC client, transports, and token refresh were deleted —
 * discovery/invocation run in aidream with vault-resolved auth via
 * `features/agents/services/mcp-connections.service.ts`). This module keeps
 * only the normalized tool shape the UI renders.
 */

export interface McpToolSchema {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

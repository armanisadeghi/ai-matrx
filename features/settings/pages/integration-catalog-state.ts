import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import {
  deriveMcpConnectionState,
  type FirstPartyStatus,
} from "@/features/connectors/connection-state";
import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";

export type CatalogConnectionPresentation = {
  state: string | null;
  connected: boolean;
  reason: string | null;
};

/**
 * GitHub's MCP row does not carry its bearer. Its status therefore cannot
 * represent GitHub readiness; the canonical first-party connection does.
 */
export function catalogConnectionPresentation(
  entry: McpCatalogEntry,
  firstPartyStatus: FirstPartyStatus,
  firstPartyLoading: boolean,
): CatalogConnectionPresentation {
  if (mcpConnectionRouteFor(entry) !== "github") {
    return {
      state: entry.connectionStatus,
      connected: entry.connectionStatus === "connected",
      reason: null,
    };
  }

  if (firstPartyLoading) {
    return { state: "checking", connected: false, reason: null };
  }

  const truth = deriveMcpConnectionState(entry, {
    hasFirstPartyPath: true,
    firstPartyStatus,
  });
  return {
    state: truth.state === "connected" ? "connected" : "disconnected",
    connected: truth.state === "connected",
    reason: truth.reason,
  };
}

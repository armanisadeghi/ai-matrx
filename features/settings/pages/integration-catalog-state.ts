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

export type CatalogActionPresentation = {
  /** A disconnected provider whose web path is not proven is not connectable. */
  isComingSoon: boolean;
  /** A persisted but unusable grant must retain its recovery controls. */
  needsRecovery: boolean;
  /** The first connection, or a recovery connection, can launch from this UI. */
  canStartConnection: boolean;
};

/**
 * The catalog RPC's `connection_ready` is the provider-registration contract:
 * it is true only when the server has proved that this web surface can start
 * the provider's real connection path. Do not infer this from `serverStatus`;
 * an active server can still lack an OAuth client registration.
 *
 * A saved failed grant is different from an unimplemented provider. It keeps
 * recovery actions even though it is not presently connected, so the person
 * can re-authorize it or remove its stored credentials.
 */
export function catalogActionPresentation(
  entry: McpCatalogEntry,
  connection: Pick<CatalogConnectionPresentation, "connected">,
): CatalogActionPresentation {
  const hasSavedConnection = entry.connectionId !== null;
  const needsRecovery = hasSavedConnection && !connection.connected;
  const providerCanConnect =
    entry.connectionReady &&
    ["active", "beta", "community"].includes(entry.serverStatus) &&
    Boolean(entry.endpointUrl) &&
    entry.transport !== "stdio";

  return {
    // A stored grant is a recovery case, not a product teaser. Its health
    // badge and Disconnect control must remain visible even if the provider
    // later becomes unavailable for new connections.
    isComingSoon:
      !hasSavedConnection &&
      (!entry.connectionReady || entry.serverStatus === "coming_soon"),
    needsRecovery,
    canStartConnection: providerCanConnect && !connection.connected,
  };
}

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

import { Plug } from "lucide-react";
import { mcpConnectionRouteFor } from "@/features/agent-connections/mcp-connection-route";
import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { lucideMark } from "./marks";
import { connectorsFor, getConnector } from "./registry";
import type { ConnectorDefinition } from "./types";

const GenericMcpMark = lucideMark(Plug);
const FIRST_PARTY_IDS = new Set(["google-workspace", "gmail"]);
const LIVE_SERVER_STATUSES = new Set(["active", "beta", "community"]);

/**
 * A chat integration must be usable from the web app now. Connected remote
 * servers remain visible even when their original setup needed extra config;
 * disconnected entries enter only when this surface can start their real
 * OAuth/no-auth/GitHub connection flow directly.
 */
export function isLiveChatMcpConnector(entry: McpCatalogEntry): boolean {
  if (FIRST_PARTY_IDS.has(entry.slug)) return false;
  if (!LIVE_SERVER_STATUSES.has(entry.serverStatus)) return false;
  if (entry.connectionStatus === "connected") return true;
  if (!entry.endpointUrl || entry.transport === "stdio") return false;

  const route = mcpConnectionRouteFor(entry);
  return route === "github" || route === "oauth" || route === "none";
}

function definitionFromMcp(entry: McpCatalogEntry): ConnectorDefinition {
  const known = getConnector(entry.slug);
  if (known) return known;

  return {
    id: entry.slug,
    name: entry.name,
    blurb:
      entry.description?.trim() ||
      `Connect ${entry.name} so agents can use it in conversations`,
    logo: GenericMcpMark,
    surfaces: ["strip", "directory"],
    manageHref: `/user-settings/integrations?provider=${encodeURIComponent(entry.slug)}`,
  };
}

/** One catalogue for both the three-chip rotation and the full window. */
export function buildLiveConnectorDefinitions(
  catalog: McpCatalogEntry[],
): ConnectorDefinition[] {
  const definitions = [...connectorsFor("strip")];
  const seen = new Set(definitions.map((connector) => connector.id));

  for (const entry of catalog) {
    if (!isLiveChatMcpConnector(entry) || seen.has(entry.slug)) continue;
    definitions.push(definitionFromMcp(entry));
    seen.add(entry.slug);
  }

  return definitions;
}

export function connectorActionLabel(
  connectorId: string,
  entry: McpCatalogEntry | undefined,
  connected: boolean,
): "Connect" | "Configure" | "Manage" {
  if (connected) return "Manage";
  if (connectorId === "google-workspace" || connectorId === "gmail") {
    return "Connect";
  }
  if (!entry) return "Connect";
  return mcpConnectionRouteFor(entry) === "configure" ? "Configure" : "Connect";
}

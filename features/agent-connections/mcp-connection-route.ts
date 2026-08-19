import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";

export type McpConnectionRoute = "github" | "oauth" | "none" | "configure";

/**
 * Choose the one truthful connection path for a catalog entry.
 *
 * OAuth must never use the metadata-only connection RPC: that creates a
 * green connection row without credentials. Manual strategies need the full
 * credential editor, while no-auth servers are the only entries that can be
 * connected with metadata alone.
 */
export function mcpConnectionRouteFor(
  entry: Pick<McpCatalogEntry, "slug" | "authStrategy">,
): McpConnectionRoute {
  if (entry.slug === "github") return "github";
  if (entry.authStrategy === "oauth_discovery") return "oauth";
  if (entry.authStrategy === "none") return "none";
  return "configure";
}

export function mcpConnectionActionLabel(
  route: McpConnectionRoute,
): "Connect" | "Connect with OAuth" | "Configure" {
  if (route === "oauth") return "Connect with OAuth";
  if (route === "configure") return "Configure";
  return "Connect";
}

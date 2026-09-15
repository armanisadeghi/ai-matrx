import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import { catalogConnectionPresentation } from "./integration-catalog-state";

const githubEntry = {
  serverId: "github-server",
  slug: "github",
  name: "GitHub",
  vendor: "Microsoft",
  description: null,
  category: "developer_tools",
  iconUrl: null,
  color: null,
  websiteUrl: null,
  docsUrl: null,
  endpointUrl: "https://api.githubcopilot.com/mcp/",
  transport: "http",
  authStrategy: "oauth_discovery",
  isOfficial: true,
  isFeatured: true,
  hasRemote: true,
  hasLocal: false,
  supportsMcpApps: false,
  serverStatus: "active",
  connectionReady: true,
  connectionId: "stale-mcp-row",
  connectionStatus: "connected",
  connectedAt: null,
  lastUsedAt: null,
  transportUsed: null,
  tokenExpiresAt: null,
} as McpCatalogEntry;

describe("catalogConnectionPresentation", () => {
  it("does not let a connected GitHub MCP row override suspended canonical access", () => {
    const presentation = catalogConnectionPresentation(
      githubEntry,
      "needs_attention",
      false,
    );

    expect(presentation.connected).toBe(false);
    expect(presentation.state).toBe("disconnected");
    expect(presentation.reason).toContain("needs_attention");
  });

  it("holds GitHub at checking until its canonical connection has loaded", () => {
    expect(
      catalogConnectionPresentation(githubEntry, undefined, true),
    ).toEqual({ state: "checking", connected: false, reason: null });
  });
});

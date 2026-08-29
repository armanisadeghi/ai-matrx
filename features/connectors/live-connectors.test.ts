import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import {
  buildLiveConnectorDefinitions,
  isLiveChatMcpConnector,
} from "./live-connectors";

function entry(
  overrides: Partial<McpCatalogEntry> & Pick<McpCatalogEntry, "slug" | "name">,
): McpCatalogEntry {
  const { slug, name, ...rest } = overrides;
  return {
    serverId: `server-${slug}`,
    slug,
    name,
    vendor: name,
    description: `${name} integration`,
    category: "productivity",
    iconUrl: null,
    color: null,
    websiteUrl: null,
    docsUrl: null,
    endpointUrl: `https://mcp.example.com/${slug}`,
    transport: "http",
    authStrategy: "oauth_discovery",
    isOfficial: true,
    isFeatured: false,
    hasRemote: true,
    hasLocal: false,
    supportsMcpApps: false,
    serverStatus: "active",
    connectionId: null,
    connectionStatus: null,
    connectedAt: null,
    lastUsedAt: null,
    transportUsed: null,
    tokenExpiresAt: null,
    ...rest,
  };
}

describe("live chat connector catalogue", () => {
  it("admits a live remote OAuth provider", () => {
    expect(
      isLiveChatMcpConnector(entry({ slug: "slack", name: "Slack" })),
    ).toBe(true);
  });

  it("excludes coming-soon and local-only placeholders", () => {
    expect(
      isLiveChatMcpConnector(
        entry({ slug: "future", name: "Future", serverStatus: "coming_soon" }),
      ),
    ).toBe(false);
    expect(
      isLiveChatMcpConnector(
        entry({
          slug: "local",
          name: "Local",
          endpointUrl: null,
          transport: "stdio",
        }),
      ),
    ).toBe(false);
  });

  it("keeps a connected live provider even when setup was manual", () => {
    expect(
      isLiveChatMcpConnector(
        entry({
          slug: "manual",
          name: "Manual",
          authStrategy: "api_key",
          connectionStatus: "connected",
        }),
      ),
    ).toBe(true);
  });

  it("always includes Google, Gmail, and Notion and de-duplicates Notion", () => {
    const definitions = buildLiveConnectorDefinitions([
      entry({ slug: "notion", name: "Notion" }),
      entry({ slug: "slack", name: "Slack" }),
    ]);
    const ids = definitions.map(({ id }) => id);

    expect(ids).toEqual(
      expect.arrayContaining(["google-workspace", "gmail", "notion", "slack"]),
    );
    expect(ids.filter((id) => id === "notion")).toHaveLength(1);
  });
});

import type { McpCatalogEntry } from "@/features/agents/types/mcp.types";
import {
  catalogActionPresentation,
  catalogConnectionPresentation,
  catalogDirectoryAvailability,
} from "./integration-catalog-state";

const githubEntry = {
  serverId: "github-server",
  slug: "github",
  name: "GitHub",
  vendor: "Microsoft",
  description: null,
  category: "developer",
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
} satisfies McpCatalogEntry;

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
    expect(catalogConnectionPresentation(githubEntry, undefined, true)).toEqual(
      { state: "checking", connected: false, reason: null },
    );
  });

  it("turns an expired catalog token into the shared re-auth state", () => {
    const presentation = catalogConnectionPresentation(
      {
        ...githubEntry,
        slug: "supabase",
        connectionId: "supabase-connection",
        connectionStatus: "connected",
        tokenExpiresAt: "2026-08-27T00:00:00.000Z",
      },
      null,
      false,
    );

    expect(presentation).toMatchObject({
      state: "needs_reauth",
      connected: false,
    });
  });
});

describe("catalogActionPresentation", () => {
  it("does not offer OAuth for an active provider whose web connection path is not ready", () => {
    const presentation = catalogActionPresentation(
      {
        ...githubEntry,
        slug: "vercel",
        connectionReady: false,
        connectionId: null,
        connectionStatus: null,
      },
      { connected: false },
    );

    expect(presentation).toMatchObject({
      isComingSoon: true,
      canStartConnection: false,
      needsRecovery: false,
    });
  });

  it("keeps reconnect and disconnect recovery available for a saved failed connection", () => {
    const presentation = catalogActionPresentation(
      {
        ...githubEntry,
        slug: "supabase",
        connectionId: "saved-supabase-connection",
        connectionStatus: "refresh_failed",
      },
      { connected: false },
    );

    expect(presentation).toMatchObject({
      isComingSoon: false,
      canStartConnection: true,
      needsRecovery: true,
    });
  });
});

describe("catalogDirectoryAvailability", () => {
  it("keeps an active but unready provider out of available and featured directory results", () => {
    expect(
      catalogDirectoryAvailability(
        {
          ...githubEntry,
          slug: "vercel",
          connectionReady: false,
          connectionId: null,
          connectionStatus: null,
        },
        { connected: false },
      ),
    ).toEqual({
      isComingSoon: true,
      isAvailable: false,
      isFeatured: false,
    });
  });
});

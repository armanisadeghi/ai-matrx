/**
 * A connection indicator must never claim more than the truth.
 *
 * Live break (Arman, 2026-09-13): "the ui lies as well since I see a checkmark
 * for git but don't actually have the mcp connected according to the agent."
 * Every chip decided from `tool.mcp_user_conn.status` alone, so:
 *
 *   - ScreenshotOne (`refresh_failed`, real row for admin@admin.com) and the
 *     eight rows still saying `connected` with a `token_expires_at` days in
 *     the past all rendered as Connected;
 *   - GitHub rendered as Connected for everyone, because its bearer comes
 *     from the first-party GitHub App connection and its MCP row is
 *     irrelevant.
 *
 * These cases are the real rows from `tool.mcp_user_conn` for user
 * 87a6e699-3622-4869-8843-d0867456c0dd on 2026-09-13.
 */

import {
  deriveMcpConnectionState,
  type McpAvailability,
} from "./connection-state";

const NOW = new Date("2026-09-13T07:00:00Z");

function entry(over: {
  slug: string;
  authStrategy?: "none" | "oauth_discovery" | "api_key";
  connectionStatus?: string | null;
  tokenExpiresAt?: string | null;
  serverStatus?: string;
}) {
  return {
    serverStatus: (over.serverStatus ?? "active") as never,
    slug: over.slug,
    authStrategy: (over.authStrategy ??
      "oauth_discovery") as "none" | "oauth_discovery" | "api_key",
    connectionStatus: (over.connectionStatus ?? null) as never,
    tokenExpiresAt: over.tokenExpiresAt ?? null,
  };
}

describe("deriveMcpConnectionState — catalog-only truth", () => {
  it("calls a no-auth server connected with no connection row at all", () => {
    // Context7 has no mcp_user_conn row; DeepWiki's row is an artifact.
    const truth = deriveMcpConnectionState(
      entry({ slug: "context7", authStrategy: "none" }),
      { now: NOW },
    );
    expect(truth.state).toBe("connected");
    expect(truth.reason).toBeNull();
  });

  it("calls refresh_failed Needs re-auth, never Connected", () => {
    const truth = deriveMcpConnectionState(
      entry({
        slug: "screenshotone",
        connectionStatus: "refresh_failed",
        tokenExpiresAt: "2026-09-13T00:56:13.777Z",
      }),
      { now: NOW },
    );
    expect(truth.state).toBe("needs_reauth");
    expect(truth.reason).toContain("reconnect");
  });

  it("refuses to believe a 'connected' row whose token already expired", () => {
    // The exact asana row: status connected, token_expires_at 2026-08-27.
    const truth = deriveMcpConnectionState(
      entry({
        slug: "asana",
        connectionStatus: "connected",
        tokenExpiresAt: "2026-08-27T05:48:21.053Z",
      }),
      { now: NOW },
    );
    expect(truth.state).toBe("needs_reauth");
    expect(truth.reason).toContain("2026-08-27");
  });

  it("keeps a 'connected' row with a live token connected", () => {
    const truth = deriveMcpConnectionState(
      entry({
        slug: "meta-ads",
        connectionStatus: "connected",
        tokenExpiresAt: "2026-10-27T21:53:35.687Z",
      }),
      { now: NOW },
    );
    expect(truth.state).toBe("connected");
  });

  it("treats a connection with no expiry recorded as connected", () => {
    const truth = deriveMcpConnectionState(
      entry({ slug: "slack", connectionStatus: "connected" }),
      { now: NOW },
    );
    expect(truth.state).toBe("connected");
  });

  it("calls a missing or disconnected row Not connected", () => {
    expect(
      deriveMcpConnectionState(entry({ slug: "linear" }), { now: NOW }).state,
    ).toBe("not_connected");
    expect(
      deriveMcpConnectionState(
        entry({ slug: "mixpanel", connectionStatus: "disconnected" }),
        { now: NOW },
      ).state,
    ).toBe("not_connected");
  });
});

describe("deriveMcpConnectionState — first-party bearer (GitHub)", () => {
  it("ignores the MCP row and reads the first-party connection", () => {
    // The real trap: GitHub's mcp_user_conn row says connected with a live
    // token, while the user has no GitHub App connection at all.
    const truth = deriveMcpConnectionState(
      entry({
        slug: "github",
        connectionStatus: "connected",
        tokenExpiresAt: "2026-09-13T14:40:40.179Z",
      }),
      { now: NOW, hasFirstPartyPath: true, firstPartyStatus: null },
    );
    expect(truth.state).toBe("not_connected");
    expect(truth.reason).toContain("github");
  });

  it("is connected when the first-party connection is connected", () => {
    const truth = deriveMcpConnectionState(
      entry({ slug: "github", connectionStatus: null }),
      { now: NOW, hasFirstPartyPath: true, firstPartyStatus: "connected" },
    );
    expect(truth.state).toBe("connected");
  });

  it("needs re-auth when the first-party connection was revoked", () => {
    const truth = deriveMcpConnectionState(
      entry({ slug: "github", connectionStatus: "connected" }),
      { now: NOW, hasFirstPartyPath: true, firstPartyStatus: "revoked" },
    );
    expect(truth.state).toBe("needs_reauth");
  });
});

describe("deriveMcpConnectionState — the server's answer wins", () => {
  it("uses aidream's availability over every catalog guess", () => {
    const availability: McpAvailability = {
      slug: "asana",
      server_id: "s1",
      state: "connected",
      reason: null,
      tool_count: 12,
    };
    // The catalog alone would say needs_reauth (token expired 2026-08-27);
    // the server can see a stored refresh token, so it is genuinely usable.
    const truth = deriveMcpConnectionState(
      entry({
        slug: "asana",
        connectionStatus: "connected",
        tokenExpiresAt: "2026-08-27T05:48:21.053Z",
      }),
      { now: NOW, availability },
    );
    expect(truth.state).toBe("connected");
    expect(truth.source).toBe("server");
  });

  it("carries the server's own reason for a failing server", () => {
    const truth = deriveMcpConnectionState(
      entry({ slug: "screenshotone", connectionStatus: "connected" }),
      {
        now: NOW,
        availability: {
          slug: "screenshotone",
          server_id: "s2",
          state: "needs_reauth",
          reason:
            "your 'screenshotone' connection is refresh_failed: no refresh token stored — reconnect it",
          tool_count: 3,
        },
      },
    );
    expect(truth.state).toBe("needs_reauth");
    expect(truth.reason).toContain("no refresh token stored");
  });
});

describe("deriveMcpConnectionState — server status", () => {
  it("keeps a beta server usable (ScreenshotOne and Plane are beta rows)", () => {
    const truth = deriveMcpConnectionState(
      entry({
        slug: "plane",
        serverStatus: "beta",
        connectionStatus: "connected",
      }),
      { now: NOW },
    );
    expect(truth.state).toBe("connected");
  });

  it("never calls a coming-soon server connected, row or no row", () => {
    const truth = deriveMcpConnectionState(
      entry({
        slug: "future-thing",
        serverStatus: "coming_soon",
        authStrategy: "none",
        connectionStatus: "connected",
      }),
      { now: NOW },
    );
    expect(truth.state).toBe("not_connected");
    expect(truth.reason).toContain("not usable yet");
  });
});

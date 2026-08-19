import {
  classifyMcpBackendFailure,
  persistMcpOAuthTokens,
} from "../backend-failure";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function response(
  body: string,
  status: number,
  headers: Record<string, string>,
): Response {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return {
    status,
    headers: {
      get: (key: string) => normalized.get(key.toLowerCase()) ?? null,
    },
    text: async () => body,
  } as Response;
}

describe("classifyMcpBackendFailure", () => {
  it("identifies a Cloudflare challenge as an edge failure, not a vault denial", async () => {
    const failedResponse = response(
      "<!DOCTYPE html><html><title>Just a moment...</title>Cloudflare</html>",
      403,
      {
        "content-type": "text/html; charset=UTF-8",
        "cf-ray": "a2b-test-LAX",
      },
    );

    const failure = await classifyMcpBackendFailure(failedResponse);

    expect(failure.userMessage).toContain("blocked at the Cloudflare edge");
    expect(failure.userMessage).toContain("credential vault did not run");
    expect(failure.diagnostic).toContain("cloudflare_edge_challenge");
    expect(failure.diagnostic).toContain("a2b-test-LAX");
  });

  it("preserves structured aidream detail and request identity", async () => {
    const failedResponse = response(
      JSON.stringify({
        detail: "credential item is not owned by the actor",
        request_id: "req-123",
      }),
      403,
      { "content-type": "application/json" },
    );

    const failure = await classifyMcpBackendFailure(failedResponse);

    expect(failure.userMessage).toContain(
      "credential item is not owned by the actor",
    );
    expect(failure.diagnostic).toContain("request_id=req-123");
    expect(failure.diagnostic).toContain("aidream_error");
  });

  it("classifies malformed non-JSON failures without inventing a cause", async () => {
    const failedResponse = response("upstream broke", 503, {
      "content-type": "text/plain",
      "x-request-id": "req-500",
    });

    const failure = await classifyMcpBackendFailure(failedResponse);

    expect(failure.userMessage).toBe(
      "AI Matrx could not save the connection (server response 503).",
    );
    expect(failure.diagnostic).toContain("unclassified_backend_response");
    expect(failure.diagnostic).toContain("request_id=req-500");
  });
});

describe("persistMcpOAuthTokens", () => {
  it("retries transient gateway responses during backend restarts", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response("bad gateway", 502, {}))
      .mockResolvedValueOnce(response("unavailable", 503, {}))
      .mockResolvedValueOnce(response("{}", 200, { "content-type": "application/json" }));

    const result = await persistMcpOAuthTokens(
      "https://server.example/api/mcp-connections/server/oauth-tokens",
      { method: "POST", body: "{}" },
      fetcher,
    );

    expect(result.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry an actionable application response", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue(response('{"detail":"denied"}', 403, {
        "content-type": "application/json",
      }));

    const result = await persistMcpOAuthTokens(
      "https://server.example/api/mcp-connections/server/oauth-tokens",
      { method: "POST", body: "{}" },
      fetcher,
    );

    expect(result.status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("MCP DCR persistence boundary", () => {
  it("keeps dynamic client credentials in the attempt cookie instead of caching half globally", () => {
    const startRoute = readFileSync(
      join(process.cwd(), "app/api/mcp/oauth/start/route.ts"),
      "utf8",
    );

    expect(startRoute).toContain("clientSecret: clientSecret ?? null");
    expect(startRoute).not.toMatch(
      /\.update\(\{\s*oauth_client_id:\s*clientId/s,
    );
  });
});

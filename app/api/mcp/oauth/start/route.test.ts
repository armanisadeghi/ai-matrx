import { NextRequest } from "next/server";
import { GET } from "./route";
import {
  discoverOAuthEndpoints,
  DynamicClientRegistrationError,
  registerDynamicClient,
} from "@ai-matrx/chat/agents/services/mcp-oauth/discovery";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { cookies } from "next/headers";

jest.mock("@/utils/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/utils/supabase/resolveUser", () => ({ getClaimsUser: jest.fn() }));
jest.mock("next/headers", () => ({ cookies: jest.fn() }));
jest.mock("@ai-matrx/chat/agents/services/mcp-oauth/pkce", () => ({
  generateCodeVerifier: () => "verifier",
  generateCodeChallenge: async () => "challenge",
  generateState: () => "state",
}));
jest.mock("@ai-matrx/chat/agents/services/mcp-oauth/discovery", () => {
  const actual = jest.requireActual(
    "@ai-matrx/chat/agents/services/mcp-oauth/discovery",
  );
  return {
    ...actual,
    discoverOAuthEndpoints: jest.fn(),
    registerDynamicClient: jest.fn(),
  };
});

const mockedDiscoverOAuthEndpoints = jest.mocked(discoverOAuthEndpoints);
const mockedRegisterDynamicClient = jest.mocked(registerDynamicClient);
const mockedCreateClient = jest.mocked(createClient);
const mockedGetClaimsUser = jest.mocked(getClaimsUser);
const mockedCookies = jest.mocked(cookies);

function catalogServer(metadata: Record<string, string>) {
  return {
    endpoint_url: "https://mcp.provider.test/mcp",
    slug: "catalog-hints",
    auth_strategy: "oauth_discovery",
    name: "Catalog hints",
    oauth_client_id: null,
    oauth_scopes: ["openid"],
    metadata,
    status: "active",
  };
}

describe("MCP OAuth start", () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetClaimsUser.mockResolvedValue({
      data: { user: { id: "admin-user" } },
    } as Awaited<ReturnType<typeof getClaimsUser>>);
    mockedCreateClient.mockResolvedValue({
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: catalogServer({
                  oauth_auth_endpoint: "https://provider.test/oauth/authorize",
                  oauth_token_endpoint: "https://provider.test/oauth/token",
                }),
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);
    mockedCookies.mockResolvedValue({ set: jest.fn() } as never);
  });

  it("uses discovered DCR capability when catalog endpoint hints are also configured", async () => {
    mockedDiscoverOAuthEndpoints.mockResolvedValue({
      protectedResource: null,
      authServer: {
        issuer: "https://provider.test",
        authorization_endpoint: "https://provider.test/oauth/authorize",
        token_endpoint: "https://provider.test/oauth/token",
        registration_endpoint: "https://provider.test/api/oauth/register",
        token_endpoint_auth_methods_supported: ["none"],
      },
    });
    mockedRegisterDynamicClient.mockResolvedValue({
      client_id: "dynamic-client",
      token_endpoint_auth_method: "none",
    });

    const response = await GET(
      new NextRequest(
        "https://app.aimatrx.test/api/mcp/oauth/start?server_id=vercel-server",
      ),
    );

    expect(mockedDiscoverOAuthEndpoints).toHaveBeenCalledWith(
        "https://mcp.provider.test/mcp",
    );
    expect(mockedRegisterDynamicClient).toHaveBeenCalledWith(
      "https://provider.test/api/oauth/register",
      expect.objectContaining({ tokenEndpointAuthMethod: "none" }),
    );
    expect(response.headers.get("location")).toContain(
      "https://provider.test/oauth/authorize",
    );
  });

  it("explains when the provider has not approved the callback URI", async () => {
    mockedDiscoverOAuthEndpoints.mockResolvedValue({
      protectedResource: null,
      authServer: {
        issuer: "https://provider.test",
        authorization_endpoint: "https://provider.test/oauth/authorize",
        token_endpoint: "https://provider.test/oauth/token",
        registration_endpoint: "https://provider.test/api/oauth/register",
        token_endpoint_auth_methods_supported: ["none"],
      },
    });
    mockedRegisterDynamicClient.mockRejectedValue(
      new DynamicClientRegistrationError(400, "invalid_redirect_uri"),
    );

    const response = await GET(
      new NextRequest(
        "https://app.aimatrx.test/api/mcp/oauth/start?server_id=catalog-server",
      ),
    );

    expect(response.headers.get("location")).toContain(
      "provider+to+approve+AI+Matrx%27s+secure+callback+URL",
    );
  });

  it("preserves a registered catalog client's static authorization contract", async () => {
    mockedCreateClient.mockResolvedValue({
      schema: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: {
                  ...catalogServer({
                    oauth_auth_endpoint: "https://legacy-client.test/authorize",
                    oauth_token_endpoint: "https://legacy-client.test/token",
                  }),
                  oauth_client_id: "catalog-registered-client",
                },
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(
      new NextRequest(
        "https://app.aimatrx.test/api/mcp/oauth/start?server_id=catalog-server",
      ),
    );

    expect(mockedDiscoverOAuthEndpoints).not.toHaveBeenCalled();
    expect(mockedRegisterDynamicClient).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toContain(
      "https://legacy-client.test/authorize",
    );
  });
});

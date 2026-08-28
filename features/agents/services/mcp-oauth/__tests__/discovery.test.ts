import {
  buildTokenEndpointClientAuthentication,
  registerDynamicClient,
  selectDcrTokenEndpointAuthMethod,
} from "../discovery";

describe("MCP dynamic client registration", () => {
  it("uses a public PKCE client when the provider advertises only none", () => {
    expect(
      selectDcrTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["none"],
      }),
    ).toBe("none");
  });

  it("preserves client_secret_basic for providers that require it", () => {
    expect(
      selectDcrTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["client_secret_basic"],
      }),
    ).toBe("client_secret_basic");
  });

  it("prefers client_secret_basic when both supported methods are advertised", () => {
    expect(
      selectDcrTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["none", "client_secret_basic"],
      }),
    ).toBe("client_secret_basic");
  });

  it("uses client_secret_post when it is the provider's only confidential method", () => {
    expect(
      selectDcrTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["client_secret_post"],
      }),
    ).toBe("client_secret_post");
  });

  it("keeps the historical client_secret_basic default when metadata is absent", () => {
    expect(selectDcrTokenEndpointAuthMethod({})).toBe("client_secret_basic");
  });

  it("fails before registration when the provider advertises no compatible method", () => {
    expect(() =>
      selectDcrTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
      }),
    ).toThrow(
      "does not advertise a supported token endpoint authentication method",
    );
  });

  it("encodes client_secret_basic without duplicating credentials in the form", () => {
    expect(
      buildTokenEndpointClientAuthentication(
        "client_secret_basic",
        "client-id",
        "client-secret",
      ),
    ).toEqual({
      headers: {
        Authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      },
      formFields: {},
    });
  });

  it("puts client_secret_post credentials in the form body", () => {
    expect(
      buildTokenEndpointClientAuthentication(
        "client_secret_post",
        "client-id",
        "client-secret",
      ),
    ).toEqual({
      headers: {},
      formFields: {
        client_id: "client-id",
        client_secret: "client-secret",
      },
    });
  });

  it("uses only client_id for a public client", () => {
    expect(buildTokenEndpointClientAuthentication("none", "client-id")).toEqual(
      {
        headers: {},
        formFields: { client_id: "client-id" },
      },
    );
  });

  it("rejects confidential token auth when registration returned no secret", () => {
    expect(() =>
      buildTokenEndpointClientAuthentication("client_secret_post", "client-id"),
    ).toThrow("returned no client secret");
  });

  it("sends the selected public-client method and least-privilege scope to DCR", async () => {
    const fetcher = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValue({
        ok: true,
        json: async () => ({ client_id: "registered-client" }),
      } as Response);

    await registerDynamicClient(
      "https://mcp.example/register",
      {
        redirectUri: "https://www.aimatrx.com/api/mcp/oauth/callback",
        scope: "openid email boards:read",
        tokenEndpointAuthMethod: "none",
      },
      fetcher,
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
    const [, init] = fetcher.mock.calls[0];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;

    expect(body).toMatchObject({
      redirect_uris: ["https://www.aimatrx.com/api/mcp/oauth/callback"],
      client_name: "AI Matrx",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openid email boards:read",
    });
  });
});

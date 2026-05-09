export interface ProtectedResourceMetadata {
  resource: string;
  authorization_servers?: string[];
  scopes_supported?: string[];
  bearer_methods_supported?: string[];
}

export interface AuthServerMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint?: string;
  scopes_supported?: string[];
  response_types_supported?: string[];
  code_challenge_methods_supported?: string[];
  grant_types_supported?: string[];
}

/**
 * Per RFC 9728, for a resource URL like https://mcp.example.com/v2/mcp,
 * the well-known URI is:
 *   https://mcp.example.com/.well-known/oauth-protected-resource/v2/mcp
 *
 * We try both the path-aware form and the root-only form as a fallback,
 * since many servers only serve it at the root.
 */
function buildWellKnownUrls(
  baseUrl: string,
  wellKnownSuffix: string,
): string[] {
  const parsed = new URL(baseUrl);
  const urls: string[] = [];

  if (parsed.pathname && parsed.pathname !== "/") {
    urls.push(
      `${parsed.origin}/.well-known/${wellKnownSuffix}${parsed.pathname}`,
    );
  }

  urls.push(`${parsed.origin}/.well-known/${wellKnownSuffix}`);

  return urls;
}

export async function fetchProtectedResourceMetadata(
  mcpServerUrl: string,
): Promise<ProtectedResourceMetadata | null> {
  const urls = buildWellKnownUrls(mcpServerUrl, "oauth-protected-resource");

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        return (await res.json()) as ProtectedResourceMetadata;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Also try the 401 probe: hit the MCP endpoint directly with no auth.
 * Many servers return a WWW-Authenticate header pointing to the auth server.
 */
export async function probeFor401(
  mcpServerUrl: string,
): Promise<{ authServerUrl: string; resource: string } | null> {
  try {
    const res = await fetch(mcpServerUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        id: 1,
        params: {
          protocolVersion: "2025-03-26",
          capabilities: {},
          clientInfo: { name: "AI Matrx", version: "1.0.0" },
        },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 401) {
      const wwwAuth = res.headers.get("www-authenticate");
      if (wwwAuth) {
        const resourceMatch = wwwAuth.match(/resource_metadata="([^"]+)"/);
        if (resourceMatch) {
          return {
            authServerUrl: resourceMatch[1],
            resource: mcpServerUrl,
          };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function fetchAuthServerMetadata(
  authServerUrl: string,
): Promise<AuthServerMetadata | null> {
  const parsed = new URL(authServerUrl);

  const urls: string[] = [];

  if (parsed.pathname && parsed.pathname !== "/") {
    urls.push(
      `${parsed.origin}/.well-known/oauth-authorization-server${parsed.pathname}`,
    );
    urls.push(
      `${parsed.origin}/.well-known/openid-configuration${parsed.pathname}`,
    );
  }

  urls.push(`${parsed.origin}/.well-known/oauth-authorization-server`);
  urls.push(`${parsed.origin}/.well-known/openid-configuration`);

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        return (await res.json()) as AuthServerMetadata;
      }
    } catch {
      continue;
    }
  }

  return null;
}

export interface DiscoveryResult {
  protectedResource: ProtectedResourceMetadata | null;
  authServer: AuthServerMetadata;
}

export async function discoverOAuthEndpoints(
  mcpServerUrl: string,
): Promise<DiscoveryResult> {
  let protectedResource = await fetchProtectedResourceMetadata(mcpServerUrl);

  let authServerUrls: string[];

  if (protectedResource?.authorization_servers?.length) {
    authServerUrls = protectedResource.authorization_servers;
  } else {
    const probe = await probeFor401(mcpServerUrl);
    if (probe) {
      authServerUrls = [probe.authServerUrl];
    } else {
      authServerUrls = [new URL(mcpServerUrl).origin];
    }
  }

  let authServer: AuthServerMetadata | null = null;
  for (const serverUrl of authServerUrls) {
    authServer = await fetchAuthServerMetadata(serverUrl);
    if (authServer) break;
  }

  if (!authServer) {
    throw new Error(
      `Could not discover auth server metadata for ${mcpServerUrl}. ` +
        `Tried protected resource metadata, 401 probe, and well-known endpoints.`,
    );
  }

  return { protectedResource, authServer };
}

export interface DynamicClientRegistrationResult {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
}

export async function registerDynamicClient(
  registrationEndpoint: string,
  params: {
    redirectUri: string;
    clientName?: string;
    grantTypes?: string[];
    responseTypes?: string[];
    scope?: string;
    tokenEndpointAuthMethod?: string;
  },
): Promise<DynamicClientRegistrationResult> {
  const body: Record<string, unknown> = {
    redirect_uris: [params.redirectUri],
    client_name: params.clientName ?? "AI Matrx",
    grant_types: params.grantTypes ?? ["authorization_code", "refresh_token"],
    response_types: params.responseTypes ?? ["code"],
    token_endpoint_auth_method:
      params.tokenEndpointAuthMethod ?? "client_secret_basic",
  };

  if (params.scope) {
    body.scope = params.scope;
  }

  const res = await fetch(registrationEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Dynamic client registration failed (${res.status}): ${text}`,
    );
  }

  return (await res.json()) as DynamicClientRegistrationResult;
}

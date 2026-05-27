import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  discoverOAuthEndpoints,
  registerDynamicClient,
} from "@/features/agents/services/mcp-oauth/discovery";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "@/features/agents/services/mcp-oauth/pkce";

const CALLBACK_PATH = "/api/mcp/oauth/callback";
const CLIENT_METADATA_PATH = "/api/mcp/oauth/client-metadata";

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const serverId = searchParams.get("server_id");
  const returnUrl = searchParams.get("return_url");

  if (!serverId) {
    return errorRedirect(req, returnUrl, "server_id is required");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return errorRedirect(req, returnUrl, "Not authenticated — please sign in");
  }

  const { data: server, error: serverError } = await supabase
    .from("tool_mcp_server")
    .select(
      "endpoint_url, slug, auth_strategy, name, oauth_client_id, oauth_scopes, metadata",
    )
    .eq("id", serverId)
    .single();

  if (serverError || !server) {
    return errorRedirect(req, returnUrl, "MCP server not found in catalog");
  }

  if (server.auth_strategy !== "oauth_discovery") {
    return errorRedirect(
      req,
      returnUrl,
      `${server.name} does not use OAuth — use the credential form instead`,
    );
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = `${baseUrl}${CALLBACK_PATH}`;
  const clientMetadataUrl = `${baseUrl}${CLIENT_METADATA_PATH}`;

  // Static auth endpoints stored in metadata (used as primary or fallback for
  // servers like Canva that use traditional OAuth without MCP discovery).
  const staticMeta = (server.metadata ?? {}) as Record<string, string>;
  const staticAuthEndpoint = staticMeta["oauth_auth_endpoint"] as
    | string
    | undefined;
  const staticTokenEndpoint = staticMeta["oauth_token_endpoint"] as
    | string
    | undefined;

  try {
    let authServer:
      | Awaited<ReturnType<typeof discoverOAuthEndpoints>>["authServer"]
      | null = null;
    let protectedResource: Awaited<
      ReturnType<typeof discoverOAuthEndpoints>
    >["protectedResource"] = null;

    // If both static endpoints are known, skip discovery entirely — faster and
    // more reliable for providers (e.g. Canva) that don't expose well-known docs.
    if (staticAuthEndpoint && staticTokenEndpoint) {
      console.log(
        `[MCP OAuth] Using static endpoints for ${server.slug} (skipping discovery)`,
      );
      authServer = {
        issuer: new URL(staticAuthEndpoint).origin,
        authorization_endpoint: staticAuthEndpoint,
        token_endpoint: staticTokenEndpoint,
      };
    } else if (server.endpoint_url) {
      console.log(
        `[MCP OAuth] Starting discovery for ${server.slug} at ${server.endpoint_url}`,
      );
      try {
        const result = await discoverOAuthEndpoints(server.endpoint_url);
        authServer = result.authServer;
        protectedResource = result.protectedResource;
      } catch (discoverErr) {
        // If discovery fails AND we have at least an auth endpoint in metadata,
        // fall back to static config rather than hard-failing.
        if (staticAuthEndpoint) {
          console.warn(
            `[MCP OAuth] Discovery failed for ${server.slug}, falling back to static metadata:`,
            discoverErr instanceof Error ? discoverErr.message : discoverErr,
          );
          authServer = {
            issuer: new URL(staticAuthEndpoint).origin,
            authorization_endpoint: staticAuthEndpoint,
            token_endpoint:
              staticTokenEndpoint ??
              `${new URL(staticAuthEndpoint).origin}/oauth/token`,
          };
        } else {
          throw discoverErr;
        }
      }
    } else {
      return errorRedirect(
        req,
        returnUrl,
        `${server.name} has no endpoint URL or static auth endpoints configured.`,
      );
    }

    if (!authServer) {
      return errorRedirect(
        req,
        returnUrl,
        `Could not determine auth endpoints for ${server.name}.`,
      );
    }

    console.log(
      `[MCP OAuth] Auth endpoint: ${authServer.authorization_endpoint}`,
    );
    console.log(`[MCP OAuth] Token endpoint: ${authServer.token_endpoint}`);

    let clientId: string | undefined;
    let clientSecret: string | undefined;

    // Strategy 1: Use pre-registered client_id from the catalog DB.
    // Also look up the matching client_secret from env vars.
    if (server.oauth_client_id) {
      clientId = server.oauth_client_id;
      const slugUpper = server.slug.toUpperCase().replace(/-/g, "_");
      clientSecret =
        process.env[`MCP_SECRET_${slugUpper}`] ??
        process.env[`${slugUpper}_CLIENT_SECRET`] ??
        undefined;
      console.log(
        `[MCP OAuth] Using pre-registered client_id: ${clientId}` +
          (clientSecret ? " (secret found)" : " (no secret)"),
      );
    }

    // Strategy 2: Try Dynamic Client Registration if available.
    // DCR auto-registers our app with the vendor and returns credentials.
    // We cache the result in the DB so we don't re-register next time.
    if (!clientId && authServer.registration_endpoint) {
      try {
        console.log(
          `[MCP OAuth] Attempting DCR at ${authServer.registration_endpoint}`,
        );
        const reg = await registerDynamicClient(
          authServer.registration_endpoint,
          {
            redirectUri,
            clientName: "AI Matrx",
            scope: protectedResource?.scopes_supported?.join(" "),
          },
        );
        clientId = reg.client_id;
        clientSecret = reg.client_secret;
        console.log(`[MCP OAuth] DCR succeeded, got client_id: ${clientId}`);

        // Cache DCR result in catalog so we reuse it on subsequent connects
        await supabase
          .from("tool_mcp_server")
          .update({
            oauth_client_id: clientId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", serverId);
      } catch (dcrErr) {
        console.warn(
          `[MCP OAuth] DCR failed (will try CIMD fallback):`,
          dcrErr instanceof Error ? dcrErr.message : dcrErr,
        );
      }
    }

    // Strategy 3: Use CIMD (Client ID Metadata Document)
    // Only works with vendors that support the Nov 2025 MCP spec (e.g., Asana,
    // Cloudflare, Supabase). Falls back to this when no pre-registered ID and
    // DCR didn't work.
    if (!clientId) {
      clientId = clientMetadataUrl;
      console.log(`[MCP OAuth] Using CIMD client_id: ${clientId}`);
    }

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const state = generateState();

    const sessionPayload = JSON.stringify({
      serverId,
      serverSlug: server.slug,
      codeVerifier,
      clientId,
      clientSecret: clientSecret ?? null,
      tokenEndpoint: authServer.token_endpoint,
      redirectUri,
      returnUrl: returnUrl ?? "/",
      state,
    });

    const cookieStore = await cookies();
    cookieStore.set("mcp_oauth_session", sessionPayload, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });

    // Scope resolution order:
    // 1. Pre-configured scopes from catalog DB (admin can control exactly what we ask for)
    // 2. Protected resource metadata scopes (RFC 9728 discovery)
    // 3. Auth server metadata scopes
    const scopes =
      server.oauth_scopes ??
      protectedResource?.scopes_supported ??
      authServer.scopes_supported;
    if (scopes?.length) {
      params.set("scope", scopes.join(" "));
    }

    const authUrl = `${authServer.authorization_endpoint}?${params.toString()}`;
    console.log(`[MCP OAuth] Redirecting to: ${authUrl}`);

    return NextResponse.redirect(authUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[MCP OAuth Start] Error:", message);
    return errorRedirect(
      req,
      returnUrl,
      `OAuth connect failed for ${server.name}: ${message}`,
    );
  }
}

/**
 * Redirect to the complete page with error info.
 * This page will post a message to the parent window and show the error.
 */
function errorRedirect(
  req: NextRequest,
  _returnUrl: string | null,
  errorMessage: string,
): NextResponse {
  const baseUrl = getBaseUrl(req);
  const target = new URL("/api/mcp/oauth/complete", baseUrl);
  target.searchParams.set("mcp_error", errorMessage);
  return NextResponse.redirect(target);
}

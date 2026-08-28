import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  classifyMcpBackendFailure,
  persistMcpOAuthTokens,
} from "@/features/agents/services/mcp-oauth/backend-failure";
import {
  buildTokenEndpointClientAuthentication,
  type DcrTokenEndpointAuthMethod,
} from "@/features/agents/services/mcp-oauth/discovery";
import { isValidOAuthState } from "@/features/agents/services/mcp-oauth/state";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";

interface OAuthSession {
  serverId: string;
  serverSlug: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string | null;
  tokenEndpoint: string;
  tokenEndpointAuthMethod: DcrTokenEndpointAuthMethod;
  redirectUri: string;
  returnUrl: string;
  endpointOverride: string | null;
  state: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

function getBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const returnedState = searchParams.get("state");

  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("mcp_oauth_session")?.value;

  cookieStore.delete("mcp_oauth_session");

  if (!sessionCookie) {
    return buildErrorRedirect(
      req,
      "/",
      "OAuth session expired. Please try connecting again.",
    );
  }

  let session: OAuthSession;
  try {
    session = JSON.parse(sessionCookie) as OAuthSession;
  } catch {
    return buildErrorRedirect(req, "/", "Invalid OAuth session data");
  }

  // Validate state to prevent CSRF. Missing state is a failure, not an
  // invitation to skip the check.
  if (!isValidOAuthState(session.state, returnedState)) {
    console.error(
      `[MCP OAuth Callback] State validation failed for ${session.serverSlug}`,
    );
    return buildErrorRedirect(
      req,
      session.returnUrl,
      "OAuth state mismatch — possible CSRF. Please try again.",
    );
  }

  if (error) {
    console.error(
      `[MCP OAuth Callback] Vendor error for ${session.serverSlug}: ${error} — ${errorDescription}`,
    );
    return buildErrorRedirect(
      req,
      session.returnUrl,
      errorDescription ?? `OAuth error from vendor: ${error}`,
    );
  }

  if (!code) {
    return buildErrorRedirect(
      req,
      session.returnUrl,
      "Missing authorization code in callback",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return buildErrorRedirect(
      req,
      session.returnUrl,
      "Not authenticated — session may have expired",
    );
  }

  try {
    console.log(
      `[MCP OAuth Callback] Exchanging code for tokens at ${session.tokenEndpoint} for ${session.serverSlug}`,
    );

    const tokenBody = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: session.redirectUri,
      code_verifier: session.codeVerifier,
    });

    const tokenHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const clientAuthentication = buildTokenEndpointClientAuthentication(
      session.tokenEndpointAuthMethod,
      session.clientId,
      session.clientSecret,
    );
    Object.assign(tokenHeaders, clientAuthentication.headers);
    for (const [key, value] of Object.entries(
      clientAuthentication.formFields,
    )) {
      tokenBody.set(key, value);
    }

    const tokenRes = await fetch(session.tokenEndpoint, {
      method: "POST",
      headers: tokenHeaders,
      body: tokenBody.toString(),
      signal: AbortSignal.timeout(15_000),
    });

    if (!tokenRes.ok) {
      const text = await tokenRes.text().catch(() => "");
      console.error(
        `[MCP OAuth Callback] Token exchange failed (${tokenRes.status}): ${text}`,
      );
      throw new Error(
        `Token exchange failed (${tokenRes.status}): ${text.slice(0, 200)}`,
      );
    }

    const tokens = (await tokenRes.json()) as TokenResponse;

    console.log(
      `[MCP OAuth Callback] Token exchange succeeded for ${session.serverSlug}. ` +
        `Has refresh_token: ${!!tokens.refresh_token}, expires_in: ${tokens.expires_in ?? "none"}`,
    );

    // Vault Phase 4: persistence is delegated to aidream — tokens land ONLY
    // in a sealed vault item; tool.mcp_user_conn keeps non-secret metadata +
    // the item reference. This route never writes token columns.
    const {
      data: { session: sbSession },
    } = await supabase.auth.getSession();
    if (!sbSession?.access_token) {
      throw new Error("No Supabase session to authorize token persistence");
    }

    const backendBase = AIDREAM_PRODUCTION_URL;
    const persistRes = await persistMcpOAuthTokens(
      `${backendBase}/api/mcp-connections/${encodeURIComponent(session.serverId)}/oauth-tokens`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sbSession.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tokens,
          token_endpoint: session.tokenEndpoint,
          token_endpoint_auth_method: session.tokenEndpointAuthMethod,
          client_id: session.clientId,
          client_secret: session.clientSecret ?? undefined,
          transport: "http",
          endpoint_override: session.endpointOverride ?? undefined,
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!persistRes.ok) {
      const failure = await classifyMcpBackendFailure(persistRes);
      console.error(
        `[MCP OAuth Callback] Connection persistence failed: ${failure.diagnostic}`,
      );
      throw new Error(failure.userMessage);
    }

    console.log(
      `[MCP OAuth Callback] Connection stored successfully for ${session.serverSlug}`,
    );

    const completeUrl = new URL("/api/mcp/oauth/complete", getBaseUrl(req));
    completeUrl.searchParams.set("mcp_connected", session.serverId);
    return NextResponse.redirect(completeUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Token exchange error";
    console.error(`[MCP OAuth Callback] Error:`, message);
    return buildErrorRedirect(req, session.returnUrl, message);
  }
}

function buildErrorRedirect(
  req: NextRequest,
  _returnUrl: string,
  errorMessage: string,
): NextResponse {
  const url = new URL("/api/mcp/oauth/complete", getBaseUrl(req));
  url.searchParams.set("mcp_error", errorMessage);
  return NextResponse.redirect(url);
}

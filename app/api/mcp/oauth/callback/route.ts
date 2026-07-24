import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

interface OAuthSession {
  serverId: string;
  serverSlug: string;
  codeVerifier: string;
  clientId: string;
  clientSecret: string | null;
  tokenEndpoint: string;
  redirectUri: string;
  returnUrl: string;
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

  // Validate state to prevent CSRF
  if (session.state && returnedState && session.state !== returnedState) {
    console.error(
      `[MCP OAuth Callback] State mismatch: expected ${session.state}, got ${returnedState}`,
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

    // Use Basic Auth when we have a client_secret (required by Canva, etc.),
    // otherwise send client_id in the body (for public/CIMD clients).
    const tokenHeaders: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (session.clientSecret) {
      const credentials = Buffer.from(
        `${session.clientId}:${session.clientSecret}`,
      ).toString("base64");
      tokenHeaders["Authorization"] = `Basic ${credentials}`;
    } else {
      tokenBody.set("client_id", session.clientId);
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

    const backendBase =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      "https://server.app.matrxserver.com";
    const persistRes = await fetch(
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
          client_id: session.clientId,
          client_secret: session.clientSecret ?? undefined,
          transport: "http",
        }),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!persistRes.ok) {
      const text = await persistRes.text().catch(() => "");
      console.error(
        `[MCP OAuth Callback] Vault persistence failed (${persistRes.status}): ${text.slice(0, 200)}`,
      );
      throw new Error(
        `Failed to store connection (vault service ${persistRes.status})`,
      );
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

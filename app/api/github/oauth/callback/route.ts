import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  GITHUB_OAUTH_COOKIE,
  parseGitHubOAuthSession,
  requestBaseUrl,
} from "../session";

function errorRedirect(request: NextRequest, returnUrl: string, message: string) {
  const url = new URL(returnUrl, requestBaseUrl(request));
  url.searchParams.set("github_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const rawSession = cookieStore.get(GITHUB_OAUTH_COOKIE)?.value;
  cookieStore.delete(GITHUB_OAUTH_COOKIE);
  const oauthSession = rawSession ? parseGitHubOAuthSession(rawSession) : null;
  if (!oauthSession) {
    return errorRedirect(request, "/code", "GitHub connection expired. Please try again.");
  }

  const error = request.nextUrl.searchParams.get("error");
  if (error) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      request.nextUrl.searchParams.get("error_description") ?? error,
    );
  }
  const code = request.nextUrl.searchParams.get("code");
  const returnedState = request.nextUrl.searchParams.get("state");
  if (!code || !returnedState || returnedState !== oauthSession.state) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      "GitHub connection could not be verified. Please try again.",
    );
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return errorRedirect(request, oauthSession.returnUrl, "Sign in again before connecting GitHub.");
  }

  const backendBase =
    process.env.NEXT_PUBLIC_BACKEND_URL || "https://server.app.matrxserver.com";
  try {
    const response = await fetch(`${backendBase}/api/github-integrations/exchange`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code, redirect_uri: oauthSession.redirectUri }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const detail =
        typeof body === "object" &&
        body !== null &&
        "detail" in body &&
        typeof body.detail === "string"
          ? body.detail
          : "GitHub connection failed.";
      throw new Error(detail);
    }
  } catch (cause) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      cause instanceof Error ? cause.message : "GitHub connection failed.",
    );
  }

  const returnUrl = new URL(oauthSession.returnUrl, requestBaseUrl(request));
  returnUrl.searchParams.set("github", "connected");
  return NextResponse.redirect(returnUrl);
}

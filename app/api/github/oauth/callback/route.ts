import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { GITHUB_OAUTH_COOKIE, parseGitHubOAuthSession, requestBaseUrl } from "../session";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

type GitHubCompletion = {
  status: string;
  next_authorization_url?: string;
  next_state?: string;
  next_flow?: "authorize" | "install";
};

function errorRedirect(
  request: NextRequest,
  returnUrl: string,
  message: string,
) {
  const url = new URL("/api/github/oauth/complete", requestBaseUrl(request));
  url.searchParams.set("return_url", returnUrl);
  url.searchParams.set("github_error", message);
  return NextResponse.redirect(url);
}

function refreshNoticeRedirect(request: NextRequest) {
  const url = new URL("/api/github/oauth/complete", requestBaseUrl(request));
  url.searchParams.set("return_url", "/code");
  url.searchParams.set("github_notice", "refresh");
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cookieStore = await cookies();
  const returnedState = request.nextUrl.searchParams.get("state");
  // GitHub's installation settings may return here without joining an OAuth
  // transaction. It proves neither an update nor the caller's identity.
  if (!returnedState) return refreshNoticeRedirect(request);
  const rawSession = cookieStore.get(GITHUB_OAUTH_COOKIE)?.value;
  cookieStore.delete(GITHUB_OAUTH_COOKIE);
  const oauthSession = rawSession ? parseGitHubOAuthSession(rawSession) : null;
  if (!oauthSession) {
    return errorRedirect(
      request,
      "/code",
      "GitHub connection expired. Please try again.",
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const providerError = request.nextUrl.searchParams.get("error");
  if (returnedState !== oauthSession.state) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      "GitHub connection could not be verified. Please try again.",
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session?.access_token) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      "Sign in again before connecting GitHub.",
    );
  }

  const backendBase = AIDREAM_PRODUCTION_URL;
  try {
    const response = await fetch(
      `${backendBase}/api/github-integrations/complete`,
      {
        method: "POST",
        headers: applyOrganizationContextHeader(
          {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          oauthSession.organizationId,
        ),
        body: JSON.stringify({ state: returnedState, browser_proof: oauthSession.browserProof, code, provider_error: providerError }),
        signal: AbortSignal.timeout(30_000),
      },
    );
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
    const completed: unknown = await response.json();
    if (!completed || typeof completed !== "object" || !("status" in completed) || typeof completed.status !== "string") throw new Error("GitHub returned an invalid connection response.");
    const completion = completed as GitHubCompletion;
    if (completion.next_authorization_url || completion.next_state || completion.next_flow) {
      if (
        !completion.next_authorization_url ||
        !completion.next_state ||
        (completion.next_flow !== "authorize" && completion.next_flow !== "install")
      ) {
        throw new Error("GitHub returned an invalid continuation response.");
      }
      const continuationUrl = new URL(completion.next_authorization_url);
      if (continuationUrl.protocol !== "https:" || continuationUrl.hostname !== "github.com") {
        throw new Error("GitHub returned an unsafe continuation URL.");
      }
      cookieStore.set(
        GITHUB_OAUTH_COOKIE,
        JSON.stringify({
          ...oauthSession,
          state: completion.next_state,
          flow: completion.next_flow,
        }),
        { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 10 * 60 },
      );
      return NextResponse.redirect(continuationUrl);
    }
    if (completion.status === "cancelled") {
      return errorRedirect(request, oauthSession.returnUrl, "GitHub connection was cancelled.");
    }
    if (completion.status !== "connected") {
      throw new Error("GitHub authorization finished, but AI Matrx is not installed on an approved account yet. Complete the GitHub installation or ask an owner to approve it, then try again.");
    }
  } catch (cause) {
    return errorRedirect(
      request,
      oauthSession.returnUrl,
      cause instanceof Error ? cause.message : "GitHub connection failed.",
    );
  }

  const completeUrl = new URL(
    "/api/github/oauth/complete",
    requestBaseUrl(request),
  );
  completeUrl.searchParams.set("return_url", oauthSession.returnUrl);
  completeUrl.searchParams.set("github", "connected");
  return NextResponse.redirect(completeUrl);
}

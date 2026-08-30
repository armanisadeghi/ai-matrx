import type { NextRequest } from "next/server";

export const GITHUB_OAUTH_COOKIE = "github_oauth_session";

export interface GitHubOAuthSession {
  state: string;
  redirectUri: string;
  returnUrl: string;
  /**
   * The organization this connection is made in. Threaded through the OAuth
   * round trip the same way `returnUrl` is (GitHub, an external provider,
   * cannot carry an X-Organization-Id header — a cookie is the only channel
   * that survives the redirect). Mandatory, fail-closed: `start/route.ts`
   * refuses to begin the flow without it (aidream commit 8e5ee0b93's
   * AuthMiddleware admission gate would 400 the eventual exchange call
   * otherwise), and `callback/route.ts` attaches it as the header on the
   * exchange request.
   */
  organizationId: string;
}

export function requestBaseUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/code";
  return value;
}

export function githubAuthorizationUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): URL {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return url;
}

export function parseGitHubOAuthSession(
  value: string,
): GitHubOAuthSession | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "state" in parsed &&
      "redirectUri" in parsed &&
      "returnUrl" in parsed &&
      "organizationId" in parsed &&
      typeof parsed.state === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.returnUrl === "string" &&
      typeof parsed.organizationId === "string" &&
      parsed.organizationId.length > 0
    ) {
      return {
        state: parsed.state,
        redirectUri: parsed.redirectUri,
        returnUrl: safeReturnUrl(parsed.returnUrl),
        organizationId: parsed.organizationId,
      };
    }
  } catch {
    return null;
  }
  return null;
}

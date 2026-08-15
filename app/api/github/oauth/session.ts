import type { NextRequest } from "next/server";

export const GITHUB_OAUTH_COOKIE = "github_oauth_session";

export interface GitHubOAuthSession {
  state: string;
  redirectUri: string;
  returnUrl: string;
}

export function requestBaseUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}

export function safeReturnUrl(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/code";
  return value;
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
      typeof parsed.state === "string" &&
      typeof parsed.redirectUri === "string" &&
      typeof parsed.returnUrl === "string"
    ) {
      return {
        state: parsed.state,
        redirectUri: parsed.redirectUri,
        returnUrl: safeReturnUrl(parsed.returnUrl),
      };
    }
  } catch {
    return null;
  }
  return null;
}

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  OrganizationContextError,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import {
  GITHUB_OAUTH_COOKIE,
  githubAuthorizationUrl,
  requestBaseUrl,
  safeReturnUrl,
  type GitHubOAuthSession,
} from "../session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login?next=/code", requestBaseUrl(request)),
    );
  }

  // Mandatory, fail-closed, same kernel as every other transport in this
  // remediation - GitHub connections are organization-scoped
  // (users.integration_connections.organization_id) and the eventual
  // exchange call to aidream now 400s without X-Organization-Id (aidream
  // commit 8e5ee0b93). The caller (features/github-integration/service.ts's
  // githubConnectUrl) already has the selected organization from Redux and
  // must pass it - refuse BEFORE ever redirecting to GitHub if it's missing
  // or invalid, rather than discovering the gap after a real OAuth round
  // trip. No fallback organization is ever chosen.
  let organizationId: string;
  try {
    organizationId = requireOrganizationContext(
      request.nextUrl.searchParams.get("organization_id"),
    );
  } catch (error) {
    const message =
      error instanceof OrganizationContextError
        ? error.message
        : "An organization is required to connect GitHub.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "GitHub connection is not configured on this deployment." },
      { status: 503 },
    );
  }

  const state = randomBytes(32).toString("base64url");
  const redirectUri = `${requestBaseUrl(request)}/api/github/oauth/callback`;
  const returnUrl = safeReturnUrl(
    request.nextUrl.searchParams.get("return_url"),
  );
  const session: GitHubOAuthSession = {
    state,
    redirectUri,
    returnUrl,
    organizationId,
  };
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_OAUTH_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(
    githubAuthorizationUrl(clientId, redirectUri, state),
  );
}

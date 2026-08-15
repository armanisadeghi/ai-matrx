import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  GITHUB_OAUTH_COOKIE,
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
    return NextResponse.redirect(new URL("/login?next=/code", requestBaseUrl(request)));
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
  const returnUrl = safeReturnUrl(request.nextUrl.searchParams.get("return_url"));
  const session: GitHubOAuthSession = { state, redirectUri, returnUrl };
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_OAUTH_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  const installUrl = new URL("https://github.com/apps/ai-matrx-admin/installations/new");
  installUrl.searchParams.set("state", state);
  installUrl.searchParams.set("redirect_uri", redirectUri);
  installUrl.searchParams.set("client_id", clientId);
  return NextResponse.redirect(installUrl);
}

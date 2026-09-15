import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import {
  OrganizationContextError,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import {
  GITHUB_OAUTH_COOKIE,
  requestBaseUrl,
  safeReturnUrl,
  type GitHubOAuthSession,
} from "../session";
import { AIDREAM_PRODUCTION_URL } from "@/lib/api/endpoints";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";

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

  // The admitted header is authoritative. The request query only transports it
  // from the popup caller to this server route, where the backend verifies it.
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

  const flow = request.nextUrl.searchParams.get("flow") === "install" ? "install" : "authorize";
  const browserProof = randomBytes(32).toString("base64url");
  const returnUrl = safeReturnUrl(
    request.nextUrl.searchParams.get("return_url"),
  );
  let backend: Response;
  let started: unknown;
  try {
    backend = await fetch(`${AIDREAM_PRODUCTION_URL}/api/github-integrations/authorize`, {
      method: "POST",
      headers: applyOrganizationContextHeader({
        Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
        "Content-Type": "application/json",
      }, organizationId),
      body: JSON.stringify({
        return_url: returnUrl,
        browser_proof_hash: createHash("sha256").update(browserProof).digest("hex"),
        flow,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    started = await backend.json().catch(() => null);
  } catch {
    return NextResponse.json({ error: "GitHub connection could not be started. Please try again." }, { status: 503 });
  }
  if (!backend.ok || !started || typeof started !== "object" || !("authorization_url" in started) || !("state" in started) || typeof started.authorization_url !== "string" || typeof started.state !== "string") {
    return NextResponse.json({ error: "GitHub connection could not be started. Please try again." }, { status: backend.ok ? 502 : backend.status });
  }
  let authorizationUrl: URL;
  try {
    authorizationUrl = new URL(started.authorization_url);
  } catch {
    return NextResponse.json({ error: "GitHub connection could not be started. Please try again." }, { status: 502 });
  }
  if (authorizationUrl.protocol !== "https:" || authorizationUrl.hostname !== "github.com") {
    return NextResponse.json({ error: "GitHub connection could not be started. Please try again." }, { status: 502 });
  }
  const session: GitHubOAuthSession = {
    state: started.state,
    returnUrl,
    browserProof,
    flow,
    organizationId,
  };
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_OAUTH_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });

  return NextResponse.redirect(authorizationUrl);
}

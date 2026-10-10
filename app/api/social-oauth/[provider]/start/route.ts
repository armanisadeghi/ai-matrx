import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { requestOrigin } from "@/utils/auth/request-origin";
import { applyOrganizationContextHeader, requireOrganizationContext } from "@/lib/api/organization-context";
import { isSocialCallbackOrigin, isSocialProvider, socialBackendOrigin, socialCallbackPath, socialCookieName, SOCIAL_SETTINGS_RETURN, safeSocialReturn } from "../session";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider: rawProvider } = await context.params;
  if (!isSocialProvider(rawProvider)) return NextResponse.json({ error: "Unknown social provider." }, { status: 404 });
  const provider = rawProvider;
  const requestedOrigin = request.nextUrl.searchParams.get("frontend_origin");
  const origin = requestedOrigin ?? requestOrigin(request.headers) ?? request.nextUrl.origin;
  if (!isSocialCallbackOrigin(origin, provider)) return NextResponse.json({ error: "This address cannot start a social connection." }, { status: 400 });
  const returnUrl = safeSocialReturn(request.nextUrl.searchParams.get("return_url"));
  const finish = (status: string) => {
    const target = new URL(returnUrl, origin);
    target.searchParams.set("social_oauth_provider", provider);
    target.searchParams.set("social_oauth_status", status);
    return NextResponse.redirect(target);
  };
  const backendOrigin = socialBackendOrigin(request.nextUrl.searchParams.get("backend_origin"));
  if (!backendOrigin) return finish("unavailable");
  let organizationId: string;
  try { organizationId = requireOrganizationContext(request.nextUrl.searchParams.get("organization_id")); } catch { return finish("organization_required"); }
  const supabase = await createClient();
  const { data: { user } } = await getClaimsUser(supabase);
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session?.access_token) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", SOCIAL_SETTINGS_RETURN);
    return NextResponse.redirect(login);
  }
  const browserProof = randomBytes(32).toString("base64url");
  const issuer = provider === "mastodon" ? request.nextUrl.searchParams.get("issuer") : null;
  if (provider === "mastodon" && (!issuer || !isHttpsOrigin(issuer))) return finish("issuer_required");
  const handle = provider === "bluesky" ? request.nextUrl.searchParams.get("handle") : null;
  if (provider === "bluesky" && (!handle || handle.length > 253 || /[\/@]/.test(handle))) return finish("handle_required");
  try {
    const response = await sendMatrxRequest(buildMatrxRequestUrl(`${backendOrigin.replace(/\/+$/, "")}/api`, `/api/social-oauth/${provider}/authorize`), {
      method: "POST",
      headers: applyOrganizationContextHeader({ Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, organizationId),
      body: JSON.stringify({ return_url: returnUrl, browser_proof_hash: createHash("sha256").update(browserProof).digest("hex"), redirect_uri: origin + socialCallbackPath(provider), ...(issuer ? { issuer } : {}), ...(handle ? { handle } : {}), ...(["linkedin", "bluesky", "facebook", "instagram", "threads"].includes(provider) && request.nextUrl.searchParams.get("connection_id") ? {connection_id: request.nextUrl.searchParams.get("connection_id")} : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
    const started: unknown = await response.json().catch(() => null);
    console.info(
      "[social-oauth-start] backend-response=" +
        JSON.stringify({
          provider,
          status: response.status,
          ok: response.ok,
          keys:
            started && typeof started === "object"
              ? Object.keys(started).sort()
              : [],
          authorizationUrlType:
            started &&
            typeof started === "object" &&
            "authorization_url" in started
              ? typeof started.authorization_url
              : "absent",
        }),
    );
    if (!response.ok || !started || typeof started !== "object" || !("authorization_url" in started) || typeof started.authorization_url !== "string") return finish("unavailable");
    const authorization = new URL(started.authorization_url);
    // PAR keeps state inside the pushed request rather than the redirect URL.
    const state = "state" in started && typeof started.state === "string" ? started.state : authorization.searchParams.get("state");
    if (authorization.protocol !== "https:" || !state) return finish("failed");
    (await cookies()).set(socialCookieName(provider), JSON.stringify({ state, browserProof, organizationId, returnUrl, backendOrigin, createdAt: Date.now() }), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: `/api/social-oauth/${provider}`, maxAge: 600 });
    return NextResponse.redirect(authorization);
  } catch { return finish("failed"); }
}

function isHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
}

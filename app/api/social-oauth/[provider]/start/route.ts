import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { applyOrganizationContextHeader, requireOrganizationContext } from "@/lib/api/organization-context";
import { isSocialProvider, socialBackendOrigin, socialCallbackPath, socialCookieName, SOCIAL_SETTINGS_RETURN, safeSocialReturn } from "../session";

const CALLBACK_ORIGINS = ["https://www.aimatrx.com", "http://localhost:3000"] as const;

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider: rawProvider } = await context.params;
  if (!isSocialProvider(rawProvider)) return NextResponse.json({ error: "Unknown social provider." }, { status: 404 });
  const provider = rawProvider;
  const origin = request.nextUrl.origin;
  if (!CALLBACK_ORIGINS.includes(origin as (typeof CALLBACK_ORIGINS)[number])) return NextResponse.json({ error: "This address cannot start a social connection." }, { status: 400 });
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
  try {
    const response = await sendMatrxRequest(buildMatrxRequestUrl(backendOrigin, `/api/social-oauth/${provider}/authorize`), {
      method: "POST",
      headers: applyOrganizationContextHeader({ Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, organizationId),
      body: JSON.stringify({ return_url: returnUrl, browser_proof_hash: createHash("sha256").update(browserProof).digest("hex"), redirect_uri: origin + socialCallbackPath(provider) }),
      signal: AbortSignal.timeout(30_000),
    });
    const started: unknown = await response.json().catch(() => null);
    if (!response.ok || !started || typeof started !== "object" || !("authorization_url" in started) || typeof started.authorization_url !== "string") return finish("unavailable");
    const authorization = new URL(started.authorization_url);
    const state = authorization.searchParams.get("state");
    if (authorization.protocol !== "https:" || !state) return finish("failed");
    (await cookies()).set(socialCookieName(provider), JSON.stringify({ state, browserProof, organizationId, returnUrl, backendOrigin, createdAt: Date.now() }), { httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: `/api/social-oauth/${provider}`, maxAge: 600 });
    return NextResponse.redirect(authorization);
  } catch { return finish("failed"); }
}

import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { requestOrigin } from "@/utils/auth/request-origin";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import { isSocialCallbackOrigin, isSocialProvider, parseSocialBrowserSession, socialCookieName, SOCIAL_SETTINGS_RETURN } from "../session";

export async function GET(request: NextRequest, context: { params: Promise<{ provider: string }> }): Promise<NextResponse> {
  const { provider: rawProvider } = await context.params;
  if (!isSocialProvider(rawProvider)) return NextResponse.json({ error: "Unknown social provider." }, { status: 404 });
  const provider = rawProvider;
  const origin = requestOrigin(request.headers) ?? request.nextUrl.origin;
  if (!isSocialCallbackOrigin(origin, provider)) return NextResponse.json({ error: "This callback address is not registered." }, { status: 400 });
  const store = await cookies();
  const raw = store.get(socialCookieName(provider))?.value;
  store.set(socialCookieName(provider), "", { path: `/api/social-oauth/${provider}`, maxAge: 0, httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:") });
  const flow = raw ? parseSocialBrowserSession(raw) : null;
  const finish = (status: string) => {
    const target = new URL(flow?.returnUrl ?? SOCIAL_SETTINGS_RETURN, origin);
    target.searchParams.set("social_oauth_provider", provider);
    target.searchParams.set("social_oauth_status", status);
    return NextResponse.redirect(target);
  };
  const state = request.nextUrl.searchParams.get("state");
  if (!flow || state !== flow.state) return finish("expired");
  const supabase = await createClient();
  const { data: { user } } = await getClaimsUser(supabase);
  const { data: { session } } = await supabase.auth.getSession();
  if (!user || !session?.access_token) return finish("sign_in");
  try {
    const response = await sendMatrxRequest(buildMatrxRequestUrl(`${flow.backendOrigin.replace(/\/+$/, "")}/api`, `/api/social-oauth/${provider}/complete`), {
      method: "POST",
      headers: applyOrganizationContextHeader({ Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, flow.organizationId),
      body: JSON.stringify({ state, browser_proof: flow.browserProof, code: request.nextUrl.searchParams.get("code"), provider_error: request.nextUrl.searchParams.get("error"), ...(provider === "bluesky" ? { authorization_issuer: request.nextUrl.searchParams.get("iss") } : {}) }),
      signal: AbortSignal.timeout(30_000),
    });
    const completed: unknown = await response.json().catch(() => null);
    if (!response.ok || !completed || typeof completed !== "object" || !("status" in completed) || typeof completed.status !== "string") return finish("failed");
    return finish(completed.status === "connected" ? "connected" : completed.status === "denied" ? "denied" : "failed");
  } catch { return finish("failed"); }
}

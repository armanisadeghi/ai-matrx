import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import { applyOrganizationContextHeader } from "@/lib/api/organization-context";
import {
  xCallbackOrigin,
  X_OAUTH_COOKIE,
  X_SETTINGS_RETURN,
  parseXBrowserSession,
} from "../session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = xCallbackOrigin(request.headers, request.nextUrl.origin);
  if (!origin) {
    return NextResponse.json(
      { error: "This callback address is not registered." },
      { status: 400 },
    );
  }
  const store = await cookies();
  const raw = store.get(X_OAUTH_COOKIE)?.value;
  // Match the original cookie path for removal on both HTTP localhost and HTTPS.
  store.set(X_OAUTH_COOKIE, "", {
    path: "/api/social-oauth/x",
    maxAge: 0,
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
  });
  const flow = raw ? parseXBrowserSession(raw) : null;
  const finish = (status: string) => {
    const target = new URL(flow?.returnUrl ?? X_SETTINGS_RETURN, origin);
    target.searchParams.set("x_oauth_status", status);
    return NextResponse.redirect(target);
  };
  const state = request.nextUrl.searchParams.get("state");
  if (!flow || state !== flow.state) return finish("expired");
  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session?.access_token) return finish("sign_in");
  try {
    const response = await sendMatrxRequest(
      buildMatrxRequestUrl(flow.backendOrigin, "/api/social-oauth/x/complete"),
      {
        method: "POST",
        headers: applyOrganizationContextHeader(
          {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          flow.organizationId,
        ),
        body: JSON.stringify({
          state,
          browser_proof: flow.browserProof,
          code: request.nextUrl.searchParams.get("code"),
          provider_error: request.nextUrl.searchParams.get("error"),
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    const completed: unknown = await response.json().catch(() => null);
    if (
      !response.ok &&
      completed &&
      typeof completed === "object" &&
      "detail" in completed
    ) {
      const detail = completed.detail;
      if (
        detail &&
        typeof detail === "object" &&
        "code" in detail &&
        typeof detail.code === "string"
      ) {
        if (detail.code === "authorization_denied") return finish("cancelled");
        if (
          ["quota_exhausted", "rate_limited", "needs_attention"].includes(
            detail.code,
          )
        )
          return finish(detail.code);
      }
    }
    if (
      !response.ok ||
      !completed ||
      typeof completed !== "object" ||
      !("status" in completed) ||
      typeof completed.status !== "string"
    )
      return finish("failed");
    return finish(
      completed.status === "connected"
        ? "connected"
        : completed.status === "denied"
          ? "cancelled"
          : "failed",
    );
  } catch {
    return finish("failed");
  }
}

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { buildMatrxRequestUrl, sendMatrxRequest } from "@ai-matrx/agents/matrx";
import { createClient } from "@/utils/supabase/server";
import { getClaimsUser } from "@/utils/supabase/resolveUser";
import {
  applyOrganizationContextHeader,
  requireOrganizationContext,
} from "@/lib/api/organization-context";
import {
  X_CALLBACK_ORIGINS,
  X_CALLBACK_PATH,
  X_OAUTH_COOKIE,
  X_SETTINGS_RETURN,
  safeXReturn,
  xBackendOrigin,
} from "../session";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const origin = request.nextUrl.origin;
  if (!X_CALLBACK_ORIGINS.some((allowed) => allowed === origin)) {
    return NextResponse.json(
      { error: "This address cannot start an X connection." },
      { status: 400 },
    );
  }
  const returnUrl = safeXReturn(request.nextUrl.searchParams.get("return_url"));
  const failed = (status: string) => {
    const target = new URL(returnUrl, origin);
    target.searchParams.set("x_oauth_status", status);
    return NextResponse.redirect(target);
  };
  const backendOrigin = xBackendOrigin(
    request.nextUrl.searchParams.get("backend_origin"),
  );
  if (!backendOrigin) return failed("unavailable");
  let organizationId: string;
  try {
    organizationId = requireOrganizationContext(
      request.nextUrl.searchParams.get("organization_id"),
    );
  } catch {
    return failed("organization_required");
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await getClaimsUser(supabase);
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!user || !session?.access_token) {
    const login = new URL("/login", origin);
    login.searchParams.set("next", X_SETTINGS_RETURN);
    return NextResponse.redirect(login);
  }
  const browserProof = randomBytes(32).toString("base64url");
  try {
    const response = await sendMatrxRequest(
      buildMatrxRequestUrl(backendOrigin, "/api/social-oauth/x/authorize"),
      {
        method: "POST",
        headers: applyOrganizationContextHeader(
          {
            Authorization: `Bearer ${session.access_token}`,
            "Content-Type": "application/json",
          },
          organizationId,
        ),
        body: JSON.stringify({
          return_url: returnUrl,
          browser_proof_hash: createHash("sha256")
            .update(browserProof)
            .digest("hex"),
          redirect_uri: origin + X_CALLBACK_PATH,
        }),
        signal: AbortSignal.timeout(30_000),
      },
    );
    const started: unknown = await response.json().catch(() => null);
    if (
      !response.ok ||
      !started ||
      typeof started !== "object" ||
      !("authorization_url" in started) ||
      typeof started.authorization_url !== "string"
    )
      return failed("unavailable");
    const authorization = new URL(started.authorization_url);
    const state = authorization.searchParams.get("state");
    if (
      authorization.protocol !== "https:" ||
      authorization.hostname !== "x.com" ||
      authorization.pathname !== "/i/oauth2/authorize" ||
      !state
    )
      return failed("failed");
    (await cookies()).set(
      X_OAUTH_COOKIE,
      JSON.stringify({
        state,
        browserProof,
        organizationId,
        returnUrl,
        backendOrigin,
        createdAt: Date.now(),
      }),
      {
        httpOnly: true,
        secure: origin.startsWith("https:"),
        sameSite: "lax",
        path: "/api/social-oauth/x",
        maxAge: 600,
      },
    );
    return NextResponse.redirect(authorization);
  } catch {
    return failed("failed");
  }
}

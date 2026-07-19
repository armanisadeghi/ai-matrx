import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import {
  callbackUri,
  GOOGLE_OAUTH_COOKIE,
  googleAuthorizationUrl,
  newOAuthState,
  safeReturnPath,
  signOAuthState,
} from "@/features/marketing/google/server";

interface StartBody {
  ownerType?: unknown;
  organizationId?: unknown;
  returnPath?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Sign in to connect Google." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as StartBody;
    const ownerType =
      body.ownerType === "organization" ? "organization" : "user";
    const organizationId =
      ownerType === "organization" && typeof body.organizationId === "string"
        ? body.organizationId
        : null;

    if (ownerType === "organization") {
      if (!organizationId) {
        return NextResponse.json(
          { error: "Choose an organization first." },
          { status: 400 },
        );
      }
      const admin = createAdminClient();
      const membership = await admin
        .schema("iam")
        .from("memberships")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("user_id", data.user.id)
        .eq("status", "active")
        .is("deleted_at", null)
        .in("role", ["owner", "admin"])
        .maybeSingle();
      if (membership.error || !membership.data) {
        return NextResponse.json(
          {
            error:
              "Only an organization owner or admin can add a shared Google connection.",
          },
          { status: 403 },
        );
      }
    }

    const oauth = newOAuthState();
    const state = signOAuthState({
      state: oauth.state,
      codeVerifier: oauth.verifier,
      userId: data.user.id,
      ownerType,
      organizationId,
      returnPath: safeReturnPath(body.returnPath),
      createdAt: Date.now(),
    });
    const authorizationUrl = googleAuthorizationUrl({
      state: oauth.state,
      challenge: oauth.challenge,
      redirectUri: callbackUri(request.nextUrl.origin),
    });

    const response = NextResponse.json({ authorizationUrl });
    response.cookies.set(GOOGLE_OAUTH_COOKIE, state, {
      httpOnly: true,
      secure: request.nextUrl.protocol === "https:",
      sameSite: "lax",
      path: "/api/marketing/google/oauth",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to start Google OAuth.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

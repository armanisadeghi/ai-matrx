// app/auth/callback/admin/route.ts
//
// Admin-only OAuth callback for the AI Matrx OAuth server.
// Follows the same PKCE flow used by matrx-dm, but adds an admin check:
// after establishing the session the user must exist in the `admins` table.
// If they are not an admin, the session is revoked and they are redirected
// with a clear error.

import { createServerClient } from "@supabase/ssr";
import { authCookieOptions } from "@/utils/supabase/authCookie";
import { NextResponse, type NextRequest } from "next/server";
import { exchangeCodeForTokens, fetchUserInfo } from "@/lib/auth/aimatrx-oauth";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { safeForwardedHost } from "@/utils/auth/safe-redirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const loginUrl = (msg: string) =>
    `${origin}/login?error=${encodeURIComponent(msg)}`;

  if (oauthError) {
    return NextResponse.redirect(loginUrl(errorDescription ?? oauthError));
  }

  if (!code || !state) {
    return NextResponse.redirect(
      loginUrl("Missing authorization code or state"),
    );
  }

  const storedState = request.cookies.get("aimatrx_admin_oauth_state")?.value;
  const codeVerifier = request.cookies.get(
    "aimatrx_admin_code_verifier",
  )?.value;
  const appRedirect = request.cookies.get("aimatrx_admin_app_redirect")?.value;

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      loginUrl("Invalid state — possible CSRF. Please try again."),
    );
  }

  if (!codeVerifier) {
    return NextResponse.redirect(
      loginUrl("Missing PKCE verifier. Please try again."),
    );
  }

  try {
    const redirectUri = `${origin}/auth/callback/admin`;

    // -----------------------------------------------------------------------
    // 1. Exchange authorization code for tokens with AI Matrx
    // -----------------------------------------------------------------------
    const tokens = await exchangeCodeForTokens(code, redirectUri, codeVerifier);

    // -----------------------------------------------------------------------
    // 2. Get user identity from AI Matrx
    // -----------------------------------------------------------------------
    const userInfo = await fetchUserInfo(tokens.access_token);

    if (!userInfo.email) {
      return NextResponse.redirect(
        loginUrl("AI Matrx account has no email address"),
      );
    }

    // -----------------------------------------------------------------------
    // 3. Ensure user exists in this Supabase project (upsert via admin client)
    // -----------------------------------------------------------------------
    const adminClient = createAdminClient();

    const { error: createError } = await adminClient.auth.admin.createUser({
      email: userInfo.email,
      email_confirm: true,
      user_metadata: {
        display_name: userInfo.name ?? userInfo.email.split("@")[0] ?? "User",
        avatar_url: userInfo.picture,
        aimatrx_user_id: userInfo.sub,
      },
    });

    // createError is expected when the user already exists — handled below.

    // -----------------------------------------------------------------------
    // 4. Generate a server-side magic link (never emailed)
    // -----------------------------------------------------------------------
    const { data: linkData, error: linkError } =
      await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email: userInfo.email,
      });

    if (linkError || !linkData) {
      throw linkError ?? new Error("Failed to generate sign-in link");
    }

    // -----------------------------------------------------------------------
    // 5. Establish a session by verifying the magic link OTP.
    //    Cookies are written onto the redirect response.
    // -----------------------------------------------------------------------
    // D22 residual fix: only follow x-forwarded-host when it passes the
    // host allowlist (prod host from NEXT_PUBLIC_SITE_URL, Vercel system
    // hosts, *.vercel.app previews). On mismatch safeForwardedHost screams
    // and we fall back to the request's own origin — never a spoofed host.
    const forwardedHost = safeForwardedHost(
      request.headers.get("x-forwarded-host"),
    );
    const isLocalEnv = process.env.NODE_ENV === "development";

    let baseUrl: string;
    if (isLocalEnv) {
      baseUrl = origin;
    } else if (forwardedHost) {
      baseUrl = `https://${forwardedHost}`;
    } else {
      baseUrl = origin;
    }

    // If an external SPA initiated this flow, we'll redirect there with tokens.
    // The final redirect target is determined after the admin check passes.
    const redirectTarget = `${baseUrl}/dashboard`;

    const response = NextResponse.redirect(redirectTarget);

    response.cookies.delete("aimatrx_admin_oauth_state");
    response.cookies.delete("aimatrx_admin_code_verifier");
    response.cookies.delete("aimatrx_admin_app_redirect");

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        // Shared cross-subdomain auth cookie — see utils/supabase/authCookie.ts.
        cookieOptions: authCookieOptions(request.headers.get("host")),
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      },
    );

    const { data: sessionData, error: verifyError } =
      await supabase.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: "magiclink",
      });

    if (verifyError || !sessionData?.user) {
      throw verifyError ?? new Error("Failed to verify session");
    }

    // -----------------------------------------------------------------------
    // 6. Admin check — revoke session and reject if not in admins table
    // -----------------------------------------------------------------------
    const isAdmin = await checkIsSuperAdmin(adminClient, sessionData.user.id);

    if (!isAdmin) {
      // Revoke the session we just created — do not delete the user record
      await supabase.auth.signOut();

      const deniedResponse = NextResponse.redirect(
        loginUrl(
          "Access denied. This login is restricted to administrators only.",
        ),
      );
      // Ensure no session cookies leak to the denied response
      response.cookies.getAll().forEach((cookie) => {
        if (cookie.name.startsWith("sb-")) {
          deniedResponse.cookies.delete(cookie.name);
        }
      });
      return deniedResponse;
    }

    // -----------------------------------------------------------------------
    // 7. If the user already existed, sync their AI Matrx profile data
    // -----------------------------------------------------------------------
    if (createError && sessionData.user) {
      const existingMeta = sessionData.user.user_metadata ?? {};
      await adminClient.auth.admin.updateUserById(sessionData.user.id, {
        user_metadata: {
          ...existingMeta,
          aimatrx_user_id: userInfo.sub,
          display_name: existingMeta.display_name ?? userInfo.name,
          avatar_url: existingMeta.avatar_url ?? userInfo.picture,
        },
      });
    }

    // -----------------------------------------------------------------------
    // 8. If an external SPA initiated this flow, redirect back with tokens
    //    instead of sending the user to the matrx-admin dashboard.
    // -----------------------------------------------------------------------
    if (appRedirect) {
      // Retrieve the session that was just established so we can pass the JWT
      const { data: sessionInfo } = await supabase.auth.getSession();
      const accessToken = sessionInfo.session?.access_token;
      const refreshToken = sessionInfo.session?.refresh_token;

      if (accessToken) {
        const callbackUrl = new URL(appRedirect);
        callbackUrl.searchParams.set("access_token", accessToken);
        if (refreshToken) {
          callbackUrl.searchParams.set("refresh_token", refreshToken);
        }
        // Return a clean redirect — no Supabase cookies (SPA manages its own session)
        const spaResponse = NextResponse.redirect(callbackUrl.toString());
        spaResponse.cookies.delete("aimatrx_admin_oauth_state");
        spaResponse.cookies.delete("aimatrx_admin_code_verifier");
        spaResponse.cookies.delete("aimatrx_admin_app_redirect");
        return spaResponse;
      }
    }

    return response;
  } catch (err) {
    console.error("Admin OAuth callback error:", err);
    const message =
      err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.redirect(loginUrl(message));
  }
}

// File: app/auth/callback/route.ts
// Official Supabase SSR pattern for PKCE auth code exchange.
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// Uses createClient() from server.ts which correctly reads and writes cookies
// via next/headers in Route Handlers (cookies().set() is allowed in Route Handlers,
// unlike Server Components where it throws).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { extractErrorMessage } from "@/utils/errors";
import { safeForwardedHost, safeRelativePath } from "@/utils/auth/safe-redirect";
import {
  GUEST_OAUTH_FP_COOKIE,
  transferGuestDataAfterOAuth,
} from "@/lib/services/guest-oauth-transfer";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const timestamp = new Date().toISOString();

  try {
    const code = searchParams.get("code");

    const redirectToParam = searchParams.get("redirectTo");
    const type = searchParams.get("type");
    // Validate to a same-site relative path BEFORE it is concatenated into the
    // final redirect URL — an absolute / userinfo-trick value (e.g. "@evil.com")
    // would otherwise produce an off-site open redirect (`${baseUrl}@evil.com`).
    const defaultRedirect = type === "recovery" ? "/reset-password" : "/dashboard";
    let redirectTo = safeRelativePath(
      redirectToParam ? decodeURIComponent(redirectToParam) : null,
      defaultRedirect,
    );

    if (
      redirectTo === "/" ||
      redirectTo === "/login" ||
      redirectTo === "/sign-up" ||
      redirectTo === ""
    ) {
      console.log(
        `[${timestamp}] Auth callback - Invalid redirectTo (${redirectTo}), using /dashboard`,
      );
      redirectTo = "/dashboard";
    }

    console.log(
      `[${timestamp}] Auth callback - Code: ${code ? "present" : "missing"}, redirectTo: ${redirectTo}`,
    );
    console.log(
      `[${timestamp}] Auth callback - ENV check: URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL}, PUBLISHABLE_KEY=${!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
    );

    if (code) {
      console.log(`[${timestamp}] Auth callback - Creating Supabase client...`);
      const supabase = await createClient();
      console.log(
        `[${timestamp}] Auth callback - Client created, exchanging code...`,
      );
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      console.log(
        `[${timestamp}] Auth callback - Exchange complete, error: ${!!error}`,
      );

      if (error) {
        console.error(
          `[${timestamp}] Auth callback - Error exchanging code:`,
          error,
        );
        const loginUrl = `${origin}/login?error=${encodeURIComponent("Authentication failed. Please try again.")}`;
        return NextResponse.redirect(loginUrl);
      }

      console.log(
        `[${timestamp}] Auth callback - Successfully exchanged code for session${
          process.env.NODE_ENV === "development"
            ? `, user: ${data.user?.email}`
            : ""
        }`,
      );

      // Apple-specific: Persist user's name on first sign-in.
      // Apple only sends the user's name on the very first authorization.
      if (data.user) {
        const provider = data.user.app_metadata?.provider;
        const userMeta = data.user.user_metadata;

        if (provider === "apple") {
          const fullName = userMeta?.full_name;
          const givenName = userMeta?.given_name || userMeta?.first_name;
          const familyName = userMeta?.family_name || userMeta?.last_name;

          if (fullName || givenName || familyName) {
            const nameToStore =
              fullName || `${givenName || ""} ${familyName || ""}`.trim();
            console.log(
              `[${timestamp}] Auth callback - Apple first sign-in, persisting name: ${nameToStore}`,
            );

            try {
              await supabase.auth.updateUser({
                data: {
                  full_name: nameToStore,
                  ...(givenName && { given_name: givenName }),
                  ...(familyName && { family_name: familyName }),
                },
              });
            } catch (nameError) {
              console.error(
                `[${timestamp}] Auth callback - Failed to persist Apple user name:`,
                nameError,
              );
            }
          }
        }
      }

      // D20: if the OAuth flow started with a guest fingerprint stashed by
      // the OAuth server actions, transfer the guest's data (files,
      // conversations, everything FK'd to the anon UUID) onto this account.
      // FAIL-OPEN: any failure logs loudly and the login proceeds untouched.
      let guestFpToClear = false;
      try {
        const jar = await cookies();
        const guestFp = jar.get(GUEST_OAUTH_FP_COOKIE)?.value;
        if (guestFp) {
          guestFpToClear = true;
          if (data.user && data.user.is_anonymous !== true) {
            const transfer = await transferGuestDataAfterOAuth(
              guestFp,
              data.user.id,
            );
            if (transfer.transferred) {
              console.log(
                `[${timestamp}] Auth callback - guest data transferred onto ${data.user.id}: ${transfer.totalRows} rows (anon ${transfer.anonUserId})`,
              );
            } else if (transfer.reason !== "no_guest") {
              console.error(
                `[${timestamp}] Auth callback - LOUD: guest transfer did not run (${transfer.reason}): ${transfer.message ?? ""}`,
              );
            }
          }
        }
      } catch (guestErr) {
        console.error(
          `[${timestamp}] Auth callback - LOUD: guest transfer threw — login proceeds, guest data stays orphaned:`,
          guestErr instanceof Error ? guestErr.message : String(guestErr),
        );
      }

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

      const finalRedirectTo =
        redirectTo &&
        redirectTo !== "/" &&
        redirectTo !== "/login" &&
        redirectTo !== "/sign-up"
          ? redirectTo
          : "/dashboard";

      const finalRedirectUrl = `${baseUrl}${finalRedirectTo}`;
      console.log(
        `[${timestamp}] Auth callback - Final redirect URL: ${finalRedirectUrl}`,
      );
      const response = NextResponse.redirect(finalRedirectUrl);
      if (guestFpToClear) {
        // One-shot carrier: always clear after the callback consumed it.
        response.cookies.delete(GUEST_OAUTH_FP_COOKIE);
      }
      return response;
    }

    console.log(
      `[${timestamp}] Auth callback - No code present, redirecting to login`,
    );
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid authentication callback")}`,
    );
  } catch (unexpectedError) {
    const errMsg = extractErrorMessage(unexpectedError);
    const errStack =
      unexpectedError instanceof Error ? unexpectedError.stack : "no stack";
    console.error(`[${timestamp}] Auth callback - UNEXPECTED ERROR: ${errMsg}`);
    console.error(`[${timestamp}] Auth callback - Stack: ${errStack}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("An unexpected error occurred. Please try again.")}`,
    );
  }
}
